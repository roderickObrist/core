"use strict";

const {is, db, log, wrap} = require("../index"),
  r = Symbol("registry");

function ns(regOrKey) {
  if (regOrKey.COLUMN_NAME) {
    return regOrKey.REFERENCED_TABLE_SCHEMA + '.' + regOrKey.REFERENCED_TABLE_NAME;
  }

  return regOrKey.options.database + '.' + regOrKey.options.name;
}

module.exports = class Join {
  constructor(Base, registry) {
    this.Base = Base;
    this.joins = [];
    this.foreignKeys = {};
    this[r] = registry;

    this.join(Base, "FK");
  }

  join(Class, relationship) {
    let join = {Class, relationship},
      registry = Class[this[r]];

    if (!relationship) {
      join.relationship = "FK";
    }

    if (!registry) {
      return log.error("Trying to join with no relationship/registry");
    }

    if (registry.keys) {
      this.analyseKeys(registry);
      this.joins.push(join);
    } else {
      this.joins.push(new Promise((resolve) => {
        registry.on("ready", () => {
          this.analyseKeys(registry);
          resolve(join);
        });
      }));
    }

    return this;
  }

  get(...args) {
    let callback = args.pop(),
      where = args[0];

    return Promise.all(this.joins).then(value => {
      let sql = this.buildSql(value);

      if (where) {
        sql.sql += " WHERE ?";
        sql.param.push(where);
      }

      return wrap(
        callback,
        this.Base[this[r]].db.bind(null, {
          "sql": sql.sql,
          "nestTables": true
        }, sql.param),
        row => {
          const val = {};

          value.forEach(join => {
            const reg = join.Class[this[r]],
              name = reg.options.name;

            val[name] = reg.rowToInstance(row[reg.options.name]);
          });

          return val;
        },
        true
      );
    });
  }

  analyseKeys(registry) {
    const foreignKeys = this.foreignKeys,
      from = ns(registry),
      keys = registry.keys;

    function merge(a, b) {
      const merged = {};

      a.forEach((key, i) => merged[key] = b[i]);

      return merged;
    }

    function add(from, to, fromKeys, toKeys) {
      let key = from + '-' + to,
        container = foreignKeys[key];

      if (!container) {
        container = foreignKeys[key] = [];
      }

      foreignKeys[key].push(merge(fromKeys, toKeys));
    }

    for (let key in keys) {
      if (
        keys.hasOwnProperty(key) &&
          keys[key][0].REFERENCED_TABLE_SCHEMA
      ) {
        const keyArray = keys[key],
          to = ns(keyArray[0]),
          toKeys = keyArray.map(key => key.REFERENCED_COLUMN_NAME),
          fromKeys = keyArray.map(key => key.COLUMN_NAME);

        add(from, to, fromKeys, toKeys);
        add(to, from, toKeys, fromKeys);
      }
    }
  }

  buildSql(joins) {
    // {
    //   "PERMACONN.Device-PERMACONN.ControlRoom": [
    //     {
    //       "controlRoomId": "controlRoomId",
    //       "locale": "locale"
    //     }
    //   ],
    //   "PERMACONN.ControlRoom-PERMACONN.Device": [
    //     {
    //       "controlRoomId": "controlRoomId",
    //       "locale": "locale"
    //     }
    //   ],
    //   "PERMACONN.LineNumber-PERMACONN.ControlRoom": [
    //     {
    //       "controlRoomId": "controlRoomId",
    //       "locale": "locale"
    //     },
    //     {
    //       "locale": "locale",
    //       "controlRoomId": "controlRoomId",
    //       "lineNumber": "defaultLineNumber"
    //     }
    //   ],
    //   "PERMACONN.ControlRoom-PERMACONN.LineNumber": [
    //     {
    //       "controlRoomId": "controlRoomId",
    //       "locale": "locale"
    //     },
    //     {
    //       "locale": "locale",
    //       "controlRoomId": "controlRoomId",
    //       "defaultLineNumber": "lineNumber"
    //     }
    //   ]
    // }

    const dbName = this.Base[this[r]].options.database,
      baseName = this.Base[this[r]].options.name,
      innerJoins = joins.slice(1),
      SELECT = {
        "sql": "SELECT ??.??.*",
        "param": [dbName, baseName]
      },
      FROM = {
        "sql": "FROM ??.??",
        "param": [dbName, baseName]
      };

    while (innerJoins.length) {
      let join = innerJoins.shift(),
        registry = join.Class[this[r]],
        relationshipKeys,
        relationship;

      if (join.relationship === "FK") {
        relationship = this.findJoin(registry, joins);
      } else {
        relationship = join.relationship;
      }

      if (!relationship) {
        throw "FAIL";
      }

      relationshipKeys = Object.keys(relationship);

      SELECT.sql += ', ??.??.*';
      SELECT.param.push(registry.options.database, registry.options.name);

      FROM.sql += ' INNER JOIN ??.??';
      FROM.param.push(registry.options.database, registry.options.name);

      if (relationshipKeys.every(key => relationship[key] === key)) {
        FROM.sql += " USING(";

        relationshipKeys.forEach((key, i) => {
          if (i) {
            FROM.sql += ', ';
          }

          FROM.sql += '??';
          FROM.param.push(key);
        });

        FROM.sql += ")";
      }
    }

    return {
      "sql": SELECT.sql + " " + FROM.sql,
      "param": SELECT.param.concat(FROM.param)
    };
  }

  findJoin(registry, joins) {
    const classKey = ns(registry),
      possibilites = [];

    for (let join of joins) {
      let key = classKey + '-' + ns(join.Class[this[r]]);

      if (
        this.foreignKeys[key] &&
          this.foreignKeys[key].length === 1
      ) {
        possibilites.push(this.foreignKeys[key][0]);
      }
    }

    return possibilites.length === 1 &&
      possibilites[0];
  }
};
