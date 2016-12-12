"use strict";

const {is, db, wrap, log, EventEmitter} = require('../index'),
  timestamp = Symbol("timestamp"),
  storage = Symbol("storage"),
  key = Symbol("key");

class Registry extends EventEmitter {
  constructor(options, Class) {
    super();

    this.describe("ready", {
      "fireOnce": true
    });

    this.options = options;
    this.Class = Class;

    if (options.persistent) {
      this[storage] = {};
    }
  }

  add(instance, instanceKey = this.buildKey(instance)) {
    if (this[storage]) {
      if (!instanceKey) {
        return log.error("Unable to build key", {instance});
      }

      instance[timestamp] = Date.now();
      instance[key] = instanceKey;

      this[storage][instance[key]] = instance;
    }
  }

  update(instance, updateValue) {
    if (!this[storage]) {
      return;
    }

    instance[timestamp] = Date.now();

    if (this.keys.PRIMARY.some(key => updateValue.hasOwnProperty(key.COLUMN_NAME))) {
      // There is a key change
      delete this[storage][instance[key]];
      instance[key] = this.buildKey(instance);

      if (!instance[key]) {
        return log.error("Unable to build key", {instance});
      }

      this[storage][instance[key]] = instance;
    }
  }

  get(query) {
    if (!this[storage]) {
      return false;
    }

    const key = this.buildKey(query),
      instance = this[storage][key];

    if (!key) {
      return false;
    }

    if (!instance) {
      return false;
    }

    if (Date.now() - instance[timestamp] < this.options.cacheAge) {
      return instance[timestamp];
    }

    // We have it but it's old
    return false;
  }

  buildKey(instance) {
    const keyParts = [],
      keys = this.keys.PRIMARY;

    for (let i = 0; i < keys.length; i += 1) {
      if (!instance.hasOwnProperty(keys[i].COLUMN_NAME)) {
        return false;
      }

      keyParts.push(String(instance[keys[i].COLUMN_NAME]));
    }

    return keyParts.join('-');
  }
}

class MysqlRegistry extends Registry {
  constructor(options, Class) {
    const dbOptions = ["database", "host", "user", "password"],
      needsToBeReady = ["get", "update", "delete", "create"];

    // Massage options
    if (!is.bool(options.persistent)) {
      options.persistent = true;
    }

    if (!options.host) {
      options.host = db.poolConfig.host;
    }

    if (!options.database) {
      options.database = db.poolConfig.database;
    }

    if (!options.name) {
      options.name = Class.name;
    }

    if (!is.integer(options.cacheAge)) {
      options.cacheAge = 300;
    }

    super(options, Class);

    needsToBeReady.forEach(func => {
      this[func] = (...args) => {
        this.on("ready", () => {
          this[func](...args);
        });
      };
    });

    this.db = db;

    if (dbOptions.some(key => options.hasOwnProperty(key) && options[key] !== db.poolConfig[key])) {
      let newOptions = {};

      dbOptions.forEach(key => newOptions[key] = options[key] || db.poolConfig[key]);

      this.db = this.db.setPool(newOptions);
    }

    this.db("DESCRIBE ??.??", [options.database, options.name])
      .then(columns => {
        // Do something with the columns
        this.columns = columns;

        columns.names = columns.map(c => c.Field);

        columns.nameInject = columns.map(() => '??')
          .join(',');

        columns.forEach(column => {
          columns[column.Field] = column;

          if (column.Type.startsWith("set(")) {
            Class.configure("set", {
              "column": column.Field,
              "values": column.Type.slice(4, -1)
                .match(/'(?:\\'|[^'])*'/g)
                .map(value => value.slice(1, -1))
            });
          }
        });

        return this.db(`
          SELECT
            COLUMN_NAME,
            CONSTRAINT_NAME,
            ORDINAL_POSITION,
            POSITION_IN_UNIQUE_CONSTRAINT,
            REFERENCED_TABLE_SCHEMA,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE
            TABLE_SCHEMA = ? &&
            TABLE_NAME = ?
        `, [options.database, options.name]);
      })
      .then(keys => {
        this.keys = {};

        keys.forEach(key => {
          if (!this.keys[key.CONSTRAINT_NAME]) {
            this.keys[key.CONSTRAINT_NAME] = [];
          }

          this.keys[key.CONSTRAINT_NAME][key.ORDINAL_POSITION - 1] = key;
        });

        // This is also to get out of the Promise try catch
        needsToBeReady.forEach(func => delete this[func]);
        setTimeout(() => this.emit("ready"), 16);
      });
  }

  get(query, callback) {
    let instance = super.get(query);

    if (instance) {
      let goodEnough = Object.keys(query)
        .every(key => instance[key] === query[key]);

      if (goodEnough) {
        throw "figure this out";
        // if (!callback) {
        //   return new Promise(resolve => resolve([instance]));
        // }

        // if (!is.func(callback)) {
        //   return callback(null, [instance]);
        // }
      }
    }

    return wrap(callback, db.bind(null, `
      SELECT *
      FROM ??.??
      WHERE ?
    `, [
      this.options.database,
      this.options.name,
      query
    ]), this.rowToInstance, true);
  }

  create(query, callback) {

    if (is.array(query)) {
      throw new Error("Figure it out soon");
    }

    let param = [this.options.database, this.options.name, query, query, this.options.database, this.options.name],
      sql = `
        INSERT INTO ??.??
        SET ?
        ON DUPLICATE KEY UPDATE ?;
        SELECT *
        FROM ??.??
      `;

    if (this.keys.PRIMARY.every(pk => query.hasOwnProperty(pk.COLUMN_NAME))) {
      sql += ' WHERE ?';

      let where = {};

      this.keys.PRIMARY.forEach(({COLUMN_NAME}) => {
        where[COLUMN_NAME] = query[COLUMN_NAME];
      });

      param.push(where);
    } else {
      throw new Error("Manage your auto increment rows or PKs with default values?");
    }

    return wrap(callback, this.db.bind(null, sql, param), this.rowToInstance, false);
  }

  rowToInstance(row) {
    if (!this[storage]) {
      return new this.Class(row);
    }

    const key = this.buildKey(row);

    let instance = this[storage][key];

    if (instance) {
      for (let col of this.columns.names) {
        instance[col] = row[col];
      }
    } else {
      instance = new this.Class(row);
    }

    this.add(instance, key);

    return instance;
  }
}

class RAMRegistry extends Registry {
  constructor(options, Class) {
    super(options, Class);
  }
}

exports.MysqlRegistry = MysqlRegistry;

exports.RAMRegistry = RAMRegistry;
