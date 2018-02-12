"use strict";

const types = require("mysql/lib/protocol/constants/types"),
  {is, db, log} = require("../../index"),
  pendingUpdate = Symbol.for("pendingUpdate"),
  // BinLogManager = require("./BinLogManager"),
  Registry = require("../Registry"),
  storage = Symbol.for("storage"),
  order = Symbol.for("order"),
  limit = Symbol.for("limit"),
  diff = Symbol.for("diff");

class MysqlRegistry extends Registry {
  constructor(options, Class) {
    const dbOptions = ["database", "host", "user", "password"],
      needsOwnDbObject = dbOptions.some(key =>
        options.hasOwnProperty(key) && options[key] !== db.poolConfig[key]);

    // Massage options
    super(Object.assign({
      "allEvents": false,
      "binLog": false,
      "cacheAge": 300,
      "database": db.poolConfig.database,
      "host": db.poolConfig.host,
      "name": Class.name,
      "persistent": true
    }, options), Class);

    this.db = db;

    if (needsOwnDbObject) {
      const newOptions = {};

      dbOptions.forEach(key => {
        newOptions[key] = options[key] || db.poolConfig[key];
      });

      this.db = this.db.setPool(newOptions);
    }

    this.schema = this.refreshSchema();

    this.schema.then(async () => {
      if (this.options.binLog) {
        throw log.error("binLog support not ready yet");
        // const binLogManager = await BinLogManager.create({
        //   "host": options.host
        // });

        // binLogManager.add(this);
      }

      this.emit("ready");
    });
  }

  async refreshSchema() {
    const table = [this.options.database, this.options.name],
      columns = await this.db(`
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
      keys = await this.db(`
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
      `, table);

    // Do something with the columns
    this.columns = columns;

    columns.names = columns.map(c => c.COLUMN_NAME);

    columns.nameInject = columns.map(() => "??")
      .join(",");

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
        column.type = column.DATA_TYPE.toUpperCase();

        if (/\([0-9]+\)/.test(column.COLUMN_TYPE)) {
          column.type += "2";
        }

        column.type = types[column.type];
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
          throw log.error(`unsupported type${column.DATA_TYPE}`);
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
        break;

      case types.VARCHAR:
      case types.STRING:
      case types.TINY_BLOB:
      case types.BLOB:
      case types.MEDIUM_BLOB:
      case types.LONG_BLOB:
        if (/\([0-9]+\)/.test(column.COLUMN_TYPE)) {
          column.maxLength = Number(/\(([0-9]+)\)/.exec(column.COLUMN_TYPE)[1]);
        } else if (column.type === types.TINY_BLOB) {
          column.maxLength = Math.pow(2, 8) - 1;
        } else if (column.type === types.BLOB) {
          column.maxLength = Math.pow(2, 16) - 1;
        } else if (column.type === types.MEDIUM_BLOB) {
          column.maxLength = Math.pow(2, 24) - 1;
        } else if (column.type === types.LONG_BLOB) {
          column.maxLength = Math.pow(2, 32) - 1;
        }
      break;

      case types.ENUM:
        column.options = column.COLUMN_TYPE.slice(5, -1)
          .split(",")
          .map(value => value.slice(1, -1));

        column.optionsIndex = {};

        column.options.forEach(option => {
          column.optionsIndex[option] = true;
        });
        break;

      case types.SET:
        this.Class.configure("set", {
          "column": column.COLUMN_NAME,
          "values": column.COLUMN_TYPE.slice(4, -1)
            // .match(/'(?:\\'|[^'])*'/g)
            .split(",")
            .map(value => value.slice(1, -1))
        });
        break;

      case types.DATETIME:
      case types.TIMESTAMP:
      case types.DATETIME2:
      case types.TIMESTAMP2:
      case types.VAR_STRING:
        break;

      case types.DOUBLE:
      case types.NEWDECIMAL:
        column.meta = /\(([0-9]+)(?:,([0-9]+))?\)$/.exec(column.COLUMN_TYPE);

        if (column.meta) {
          column.precision = Number(column.meta[1]);

          if (column.meta[2]) {
            column.decimalPlaces = Number(column.meta[2]);
          }
        }
        break;

      default:
      console.log(column);
        throw log.error(`unsupported type${column.type}`);
      }
    });

    this.keys = {};

    keys.forEach(key => {
      if (!this.keys[key.CONSTRAINT_NAME]) {
        this.keys[key.CONSTRAINT_NAME] = [];
      }

      this.keys[key.CONSTRAINT_NAME][key.ORDINAL_POSITION - 1] = key;
    });
  }

  sql(query) {
    let sql = `
        SELECT *
        FROM ??.??
        WHERE ?
      `;

    const where = Object.assign({}, query);

    if (query[order]) {
      sql += ` ORDER BY ${query[order]}`;
      delete where[order];
    }

    if (query[limit]) {
      sql += ` LIMIT ${query[limit]}`;
      delete where[limit];
    }

    return [sql, [this.options.database, this.options.name, where]];
  }

  async get(query) {
    await this.schema;

    if (this[storage]) {
      const primaryKey = super.buildKey(query);

      if (primaryKey) {
        const instance = this[storage][primaryKey];

        if (
          instance &&
            Date.now() - instance[Symbol.for("timestamp")] < this.options.cacheAge
        ) {
          return this[diff](instance, query)
            ? []
            : [instance];
        }
      }
    }

    const rows = await this.db(...this.sql(query));

    return rows.map(row => this.rowToInstance(row));
  }

  getStream(query) {
    return this.db.stream(...this.sql(query));
  }

  async create(query) {
    await this.schema;

    if (is.array(query)) {
      return this.createMany(query);
    }

    const param = [
        this.options.database,
        this.options.name,
        query,
        this.options.database,
        this.options.name
      ],
      pks = this.keys.PRIMARY,
      isEveryPKInQuery = pks.every(pk => query.hasOwnProperty(pk.COLUMN_NAME)),
      autoIncrement = pks.find(({COLUMN_NAME}) => this.columns[COLUMN_NAME].EXTRA === "auto_increment");

    let sql = `
      INSERT INTO ??.??
      SET ?;
      SELECT *
      FROM ??.??
    `;

    if (isEveryPKInQuery) {
      const where = {};

      sql += " WHERE ?";

      pks.forEach(({COLUMN_NAME}) => {
        where[COLUMN_NAME] = query[COLUMN_NAME];
      });

      param.push(where);
    } else if (autoIncrement) {
      if (pks.length === 1) {
        sql += " WHERE ?? = LAST_INSERT_ID()";
        param.push(pks[0].COLUMN_NAME);
      } else if (
        autoIncrement &&
          pks.every(pk => pk === autoIncrement || query.hasOwnProperty(pk.COLUMN_NAME))
      ) {
        const where = {};

        sql += " WHERE ?";

        pks.forEach((pk) => {
          if (pk !== autoIncrement) {
            where[pk.COLUMN_NAME] = query[pk.COLUMN_NAME];
          }
        });

        param.push(where);

        sql += " && ?? = LAST_INSERT_ID()";
        param.push(pks[0].COLUMN_NAME);
      } else {
        throw log.error("Missing Primary key in insert default values?");
      }
    } else {
      throw log.error("Missing Primary key in insert default values?");
    }

    // Cant passthrough because it's a multi statement query
    const result = await this.db(sql, param);

    if (result[1].length === 0) {
      throw log.error("Instance lost after create", {
        query,
        result
      });
    }

    const instance = this.rowToInstance(result[1][0]);

    if (!this.options.binLog) {
      instance.emit("create", instance);
    }

    return instance;
  }

  async createMany(query) {
    let sql = "INSERT INTO ??.?? (";

    const keys = Object.keys(query[0]),
      values = [this.options.database, this.options.name, ...keys],
      row = `(${keys.map(() => "?").join(", ")})`;

    sql += keys.map(() => "??")
      .join(", ");

    sql += ") VALUES ";

    for (const value of query) {
      if (value !== query[0]) {
        sql += ", ";
      }

      sql += row;
      values.push(...Object.values(value));
    }

    return this.db(sql, values);
  }

  async update(instance, values) {
    const {name, database} = this.options;

    await this.schema;

    /* eslint consistent-return: 0 */

    if (this.options.binLog) {
      throw log.error("binLog support not ready yet");
    }

    let updateQueue = instance[pendingUpdate];

    if (updateQueue) {
      const unresolvedUpdate = this[diff](updateQueue.values, values);

      if (unresolvedUpdate) {
        if (!updateQueue.nextUpdate) {
          updateQueue.nextUpdate = {};
          updateQueue.nextPromise = updateQueue.promise.then(() => this.update(updateQueue.nextUpdate));
        }

        Object.assign(updateQueue.nextUpdate, unresolvedUpdate);

        return updateQueue.nextPromise;
      }

      // All we have to do is wait
      return updateQueue.promise;
    }

    const currentPK = {},
      param = [database, name, values, currentPK];

    this.keys.PRIMARY.forEach(key => {
      currentPK[key.COLUMN_NAME] = instance[key.COLUMN_NAME];
    });

    updateQueue = {values};

    instance[pendingUpdate] = updateQueue;

    let sql = `
        UPDATE ??.??
        SET ?
        WHERE ?;
      `;

    if (!this.options.binLog) {
      const selectPK = Object.assign({}, currentPK);

      sql += `
        SELECT *
        FROM ??.??
        WHERE ?
      `;

      param.push(database, name, selectPK);

      // Does the PK change?
      for (const key of this.keys.PRIMARY) {
        if (values.hasOwnProperty(key)) {
          selectPK[key] = values[key];
        }
      }
    }

    updateQueue.promise = this.db(sql, param);

    const [result, rows] = await updateQueue.promise;

    if (result.affectedRows !== 1) {
      throw log.error("Instance lost before update", {
        instance,
        result,
        values
      });
    }

    // This should only happen in the case of 3 consecutive updates
    // {A: 1}   {A: 0}  {A: 1}
    // execed  (grouped & exec)
    if (result.changedRows !== 1) {
      log.warn("Wasted Update", {
        instance,
        result,
        values
      });
    }

    if (rows.length === 0) {
      throw log.error("Instance lost after update", {
        instance,
        result,
        values
      });
    }

    const diffToInstance = this[diff](instance, rows[0]);

    if (diffToInstance) {
      Object.assign(instance, diffToInstance);
      super.update(instance, diffToInstance);
    } else {
      this.add(instance);
    }

    delete instance[pendingUpdate];
  }

  async delete(instance) {
    await this.schema;

    const {database, name} = this.options,
      currentPK = {};

    this.keys.PRIMARY.forEach(({COLUMN_NAME}) => {
      currentPK[COLUMN_NAME] = instance[COLUMN_NAME];
    });

    await this.db(`
      DELETE FROM ??.??
      WHERE ?
    `, [database, name, currentPK]);

    super.delete(instance);
  }

  rowToInstance(row) {
    if (!this[storage]) {
      return new this.Class(row);
    }

    const key = this.buildKey(row);

    let instance = this[storage][key];

    if (!instance) {
      instance = new this.Class(row);
    }

    this.add(instance, key);

    return instance;
  }

  [diff](instance, newObject) {
    const keysThatClash = this.columns.filter(col => {
      const name = col.COLUMN_NAME;

      if (!newObject.hasOwnProperty(name)) {
        return false;
      }

      const newVal = newObject[name];

      switch (col.type) {
      case types.TIMESTAMP:
      case types.DATETIME:
      case types.DATETIME2:
        return Number(instance[name]) !== 1e3 * Math.floor(Number(newVal) / 1e3);

      case types.SET:
        throw log.error("figure it out", {col});

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


      case types.ENUM:
        if (col.optionsIndex[newVal] !== true) {
          throw log.error(`"${newVal}" is not a suitable ENUM value`, {col});
        }
      // Falls through
      case types.VAR_STRING:
      case types.STRING:
      case types.TINY_BLOB:
      case types.BLOB:
      case types.MEDIUM_BLOB:
      case types.LONG_BLOB:
        return instance[name] !== newVal;

      default:
        throw log.error(`${col.type} is not supported yet`, {col});
      }
    });

    if (keysThatClash.length === 0) {
      return false;
    }

    const objectDiff = {};

    keysThatClash.forEach(({COLUMN_NAME}) => {
      objectDiff[COLUMN_NAME] = newObject[COLUMN_NAME];
    });

    return objectDiff;
  }
}

module.exports = MysqlRegistry;
