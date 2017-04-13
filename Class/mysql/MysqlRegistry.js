"use strict";

const types = require("mysql/lib/protocol/constants/types"),
  {is, db, wrap, log, S} = require('../../index'),
  {
    storage,
    pendingUpdate,
    diff,
    order,
    limit
  } = S,
  Registry = require('../Registry');

class MysqlRegistry extends Registry {
  constructor(options, Class) {
    const dbOptions = ["database", "host", "user", "password"],
      needsToBeReady = ["get", "update", "delete", "create"],
      needsOwnDbObject = dbOptions.some(key =>
        options.hasOwnProperty(key) && options[key] !== db.poolConfig[key]);

    // Massage options
    options = Object.assign({
      "persistent": true,
      "host": db.poolConfig.host,
      "database": db.poolConfig.database,
      "name": Class.name,
      "cacheAge": 300,
      "allEvents": false
    }, options);

    super(options, Class);

    // Overwrite async functions that need db connectivity
    needsToBeReady.forEach(func => {
      this[func] = (...args) => {
        this.on("ready", () => {
          this[func](...args);
        });
      };
    });

    this.db = db;

    if (needsOwnDbObject) {
      let newOptions = {};

      dbOptions.forEach(key => newOptions[key] = options[key] || db.poolConfig[key]);

      this.db = this.db.setPool(newOptions);
    }

    this.refreshSchema(() => {
      needsToBeReady.forEach(func => delete this[func]);
      this.emit("ready");
    });
  }

  refreshSchema(callback) {
    const table = [this.options.database, this.options.name];

    return wrap.transform(callback, (result, resolve, reject) => {
      // Get column and key details
      Promise.all([
        this.db(`
          SELECT 
            COLUMN_NAME,
            COLLATION_NAME,
            CHARACTER_SET_NAME, 
            COLUMN_COMMENT,
            COLUMN_TYPE,
            DATA_TYPE,
            EXTRA
          FROM information_schema.columns
          WHERE table_schema = ? &&
            table_name = ?
        `, table),
        this.db(`
          SELECT
            COLUMN_NAME,
            CONSTRAINT_NAME,
            ORDINAL_POSITION,
            POSITION_IN_UNIQUE_CONSTRAINT,
            REFERENCED_TABLE_SCHEMA,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
          FROM information_schema.key_column_usage
          WHERE
            TABLE_SCHEMA = ? &&
            TABLE_NAME = ?
        `, table)
      ]).then(([columns, keys]) => {
        // Do something with the columns
        this.columns = columns;

        columns.names = columns.map(c => c.COLUMN_NAME);

        columns.nameInject = columns.map(() => '??')
          .join(',');

        columns.forEach(column => {
          columns[column.COLUMN_NAME] = column;

          switch (column.DATA_TYPE) {
          case "tinyint":
            column.type = types.TINY;
            break;

          case "smallint":
            column.type = types.SHORT;
            break;

          case "int":
            column.type = types.LONG;
            break;

          case "bigint":
            column.type = types.LONGLONG;
            break;

          case "mediumint":
            column.type = types.INT24;
            break;

          case "timestamp":
          case "datetime":
          case "time":
            let type = column.DATA_TYPE.toUpperCase();

            if (/\([0-9]+\)/.test(column.COLUMN_TYPE)) {
              type += '2';
            }

            column.type = types[type];
            break;

          case "decimal":
            column.type = types.NEWDECIMAL;
            break;

          case "tinyblob":
          case "tinytext":
            column.type = types.TINY_BLOB;
            break;

          case "mediumblob":
          case "mediumtext":
            column.type = types.MEDIUM_BLOB;
            break;

          case "longblog":
          case "longtext":
            column.type = types.LONG_BLOB;
            break;

          case "text":
            column.type = types.BLOB;
            break;

          case "varchar":
          case "varbinary":
            column.type = types.VAR_STRING;
            break;

          case "char":
          case "binary":
            column.type = types.STRING;
            break;

          default:
            column.type = types[column.DATA_TYPE.toUpperCase()];

            if (!column.type) {
              throw new Error("unsupported type" + column.DATA_TYPE);
            }

            break;
          }

          switch (column.type) {
          case types.TINY:
          case types.SHORT:
          case types.INT24:
          case types.LONG:
          case types.LONGLONG:
            column.unsigned = /unsigned/.test(column.COLUMN_TYPE);
            return;

          case types.VARCHAR:
          case types.STRING:
            column.maxLength = Number(/\(([0-9]+)\)/.exec(column.COLUMN_TYPE)[1]);
            return;

          case types.ENUM:
            column.options = column.COLUMN_TYPE.slice(5, -1)
              .split(',')
              .map(value => value.slice(1, -1));

            const index = column.optionsIndex = {};

            column.options.forEach(option => index[option] = true);

            return;

          case types.SET:
            return this.Class.configure("set", {
              "column": column.COLUMN_NAME,
              "values": column.COLUMN_TYPE.slice(4, -1)
                //.match(/'(?:\\'|[^'])*'/g)
                .split(',')
                .map(value => value.slice(1, -1))
            });

          case types.DATETIME:
          case types.TIMESTAMP:
          case types.DATETIME2:
          case types.TIMESTAMP2:
            return;

          case types.DOUBLE:
          case types.NEWDECIMAL:
            let meta = /\(([0-9]+)(?:,([0-9]+))?\)$/.exec(column.COLUMN_TYPE);

            if (meta) {
              column.precision = Number(meta[1]);

              if (meta[2]) {
                column.decimalPlaces = Number(meta[2]);
              }
            }
          }
        });

        this.keys = {};

        keys.forEach(key => {
          if (!this.keys[key.CONSTRAINT_NAME]) {
            this.keys[key.CONSTRAINT_NAME] = [];
          }

          this.keys[key.CONSTRAINT_NAME][key.ORDINAL_POSITION - 1] = key;
        });

        resolve();
      }).catch(reject);
    });
  }

  get(query, callback) {
    let instance = super.get(query),
      sql = `
        SELECT *
        FROM ??.??
        WHERE ?
      `;

    if (instance) {
      throw new Error("Caching querys is not implemented yet");
//      let goodEnough = Object.keys(query)
//        .every(key => instance[key] === query[key]);
//
//      if (goodEnough) {
//        throw new Error("Caching querys is not implemented yet");
//      }
    }

    if (query[order]) {
      sql += ' ORDER BY ' + query[order];
    }

    if (query[limit]) {
      sql += ' LIMIT ' + query[limit];
    }

    return wrap.passthrough(callback, this.db.bind(null, sql, [
      this.options.database,
      this.options.name,
      query
    ]), row => this.rowToInstance(row));
  }

  create(query, callback) {
    if (is.array(query)) {
      throw new Error("Create with array is not implemented yet");
    }

    let param = [this.options.database, this.options.name, query, this.options.database, this.options.name],
      sql = `
        INSERT INTO ??.??
        SET ?;
        SELECT *
        FROM ??.??
      `,
      pk = this.keys.PRIMARY,
      isEveryPKInQuery = pk.every(pk => query.hasOwnProperty(pk.COLUMN_NAME)),
      isOneAutoIncrement = pk.length === 1 &&
        this.columns[pk[0].COLUMN_NAME].EXTRA === 'auto_increment';

    if (isEveryPKInQuery) {
      sql += ' WHERE ?';

      let where = {};

      pk.forEach(({COLUMN_NAME}) => {
        where[COLUMN_NAME] = query[COLUMN_NAME];
      });

      param.push(where);
    } else if (isOneAutoIncrement) {
      sql += ' WHERE ?? = LAST_INSERT_ID()';
      param.push(pk[0].COLUMN_NAME);
    } else {
      console.log(this.columns);
      console.log(pk);
      throw new Error("Manage your auto increment rows or PKs with default values?");
    }

    // Cant passthrough because it's a multi statement query
    return wrap.transform(callback, (result, resolve, reject) => {
      this.db(sql, param, (err, result) => {
        if (err) {
          return reject(err);
        }

        const instance = this.rowToInstance(result[1][0]);

        if (!this.options.allEvents) {
          instance.emit("create", instance);
        }

        resolve(instance);
      });
    });
  }

  update(instance, values, callback) {
    let updateQueue = instance[pendingUpdate];

    if (updateQueue) {
      let unresolvedUpdate = this[diff](updateQueue.values, values);

      if (unresolvedUpdate) {
        if (!updateQueue.nextUpdate) {
          updateQueue.nextUpdate = {};
          updateQueue.nextOnUpdate = [];
        }

        Object.assign(updateQueue.nextUpdate, diff);

        return wrap.transform(callback, (result, resolve) => {
          updateQueue.nextOnUpdate.push(resolve);
        });
      }

      // All we have to do is wait
      return wrap.transform(callback, (result, resolve) => {
        updateQueue.onUpdate.push(resolve);
      });
    }

    updateQueue = instance[pendingUpdate] = {
      values,
      "onUpdate": []
    };

    wrap.transform(callback, (result, resolve) => {
      updateQueue.onUpdate.push(resolve);
    });

    const currentPK = {};

    this.keys.PRIMARY.forEach(key => {
      currentPK[key.COLUMN_NAME] = instance[key.COLUMN_NAME];
    });

    this.db(`
      UPDATE ??.??
      SET ?
      WHERE ?;
    `, [
      this.options.database,
      this.options.name,
      values,
      currentPK
    ], (e, result) => {
      if (e) {
        return log.error(e);
      }

      if (result.affectedRows !== 1) {
        return log.error("Instance lost during update", {instance, values, result});
      }

      // This should only happen in the case of 3 consecutive updates
      // {A: 1}   {A: 0}  {A: 1}
      // execed  (grouped & exec)
      if (result.changedRows !== 1) {
        log.warn("Wasted Update", {instance, values, result});
      }

      const newPK = {};

      this.keys.PRIMARY.forEach(({COLUMN_NAME}) => {
        newPK[COLUMN_NAME] = values[COLUMN_NAME] || currentPK[COLUMN_NAME];
      });

      this.db(`
        SELECT *
        FROM ??.??
        WHERE ?
      `, [
        this.options.database,
        this.options.name,
        newPK
      ], (e, result) => {
        if (e) {
          return log.error(e);
        }

        if (result.length === 0) {
          return log.error("Instance lost during update", {instance, values, result});
        }

        let diffToInstance = this[diff](instance, result[0]);

        if (diffToInstance) {
          Object.assign(instance, diffToInstance);
          super.update(instance, diffToInstance);
        } else {
          this.add(instance);
        }

        delete instance[pendingUpdate];

        if (updateQueue.nextUpdate) {
          this.update(instance, updateQueue.nextUpdate, () => {
            updateQueue.nextOnUpdate.forEach(cb => cb());
          });
        }

        updateQueue.onUpdate.forEach(cb => cb());
      });
    });
  }


  delete(instance, callback) {
    const {database, name} = this.options,
      currentPK = {};

    this.keys.PRIMARY.forEach(key => {
      currentPK[key.COLUMN_NAME] = instance[key.COLUMN_NAME];
    });

    return wrap.passthrough(callback, this.db.bind(null, `
      DELETE FROM ??.??
      WHERE ?
    `, [database, name, currentPK]));
  }

  rowToInstance(row, update = row, instaniate = true) {
    if (!this[storage]) {
      return new this.Class(row);
    }

    const key = this.buildKey(row);

    let instance = this[storage][key];

    if (instance) {
      Object.assign(instance, update);
    } else {
      if (!instaniate) {
        return false;
      }

      instance = new this.Class(row);

      if (row !== update) {
        Object.assign(instance, update);
      }
    }

    this.add(instance, key);

    return instance;
  }

  [diff](instance, newObject, typeCheck = false) {
    let keys = this.columns.filter(col => {
      const name = col.COLUMN_NAME;

      if (!newObject.hasOwnProperty(name)) {
        return false;
      }

      let newVal = newObject[name];

      switch (col.type) {
      case types.TIMESTAMP:
      case types.DATETIME:
        return Number(instance[name]) !== 1e3 * Math.floor(Number(newVal) / 1e3);

      case types.TIMESTAMP2:
      case types.DATETIME2:
        console.log(col);
        throw "Manage this";

      case types.ENUM:
        if (
          typeCheck &&
            col.optionsIndex[newVal] !== true
        ) {
          return log.error(`"${newVal}" is not a suitable ENUM value`, {col});
        }
        break;

      case types.TINY:
      case types.SHORT:
      case types.INT24:
      case types.LONG:
      case types.LONGLONG:
        return Math.round(instance[name]) !== Math.round(newVal);

      case types.DOUBLE:
      case types.NEWDECIMAL:
        return Number(instance[name]).toFixed(col.decimalPlaces) !==
          Number(newVal).toFixed(col.decimalPlaces);
      }

      return instance[name] !== newVal;
    });

    if (keys.length === 0) {
      return false;
    }

    let diff = {};

    keys.forEach(({COLUMN_NAME}) => diff[COLUMN_NAME] = newObject[COLUMN_NAME]);

    return diff;
  }
}

module.exports = MysqlRegistry;
