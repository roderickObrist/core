"use strict";

const {log} = require("../index"),
  registry = Symbol.for("registry");

function ns(regOrKey) {
  if (regOrKey.COLUMN_NAME) {
    return `${regOrKey.REFERENCED_TABLE_SCHEMA}.${regOrKey.REFERENCED_TABLE_NAME}`;
  }

  return `${regOrKey.options.database}.${regOrKey.options.name}`;
}

module.exports = class Join {
  constructor(Base) {
    this.Base = Base;
    this.joins = [];

    this.join(Base, "FK");
  }

  join(Class, relationship) {
    const join = {
        Class,
        relationship
      },
      classRegistry = Class[registry];

    if (!relationship) {
      join.relationship = "FK";
    }

    if (!classRegistry) {
      return log.error("Trying to join with no relationship/registry");
    }

    this.joins.push(join);

    return this;
  }

  async get(where) {
    if (!this.foreignKeys) {
      this.foreignKeys = {};

      for (const join of this.joins) {
        const joinRegistry = join.Class[registry];

        if (!joinRegistry.keys) {
          await new Promise(resolve => joinRegistry.on("ready", resolve));
        }

        this.analyseKeys(joinRegistry);
      }
    }

    const sql = this.buildSql();

    if (where) {
      sql.sql += " WHERE ?";
      sql.param.push(where);
    }

    const rows = await this.Base[registry].db({
      "nestTables": true,
      "sql": sql.sql
    }, sql.param);

    return rows.map(row => {
      const val = {};

      this.joins.forEach(join => {
        const joinRegistry = join.Class[registry],
          {name} = joinRegistry.options;

        val[name] = joinRegistry.rowToInstance(row[name]);
      });

      return val;
    });
  }

  analyseKeys(reg) {
    const {foreignKeys} = this,
      from = ns(reg);

    function merge(a, b) {
      const merged = {};

      a.forEach((key, i) => {
        merged[key] = b[i];
      });

      return merged;
    }

    function add(a, b, aKeys, bKeys) {
      const key = `${a}-${b}`;

      if (!foreignKeys[key]) {
        foreignKeys[key] = [];
      }

      foreignKeys[key].push(merge(aKeys, bKeys));
    }

    for (const keyArray of Object.values(reg.keys)) {
      // If it's a foriegn key
      if (keyArray[0].REFERENCED_TABLE_SCHEMA) {
        const to = ns(keyArray[0]),
          toKeys = keyArray.map(key => key.REFERENCED_COLUMN_NAME),
          fromKeys = keyArray.map(key => key.COLUMN_NAME);

        add(from, to, fromKeys, toKeys);
        add(to, from, toKeys, fromKeys);
      }
    }
  }

  buildSql() {
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

    const {joins} = this,
      {database, name} = this.Base[registry].options,
      innerJoins = joins.slice(1),
      SELECT = {
        "param": [database, name],
        "sql": "SELECT ??.??.*"
      },
      FROM = {
        "param": [database, name],
        "sql": "FROM ??.??"
      };

    while (innerJoins.length) {
      const ij = innerJoins.shift(),
        ijReg = ij.Class[registry];

      let {relationship} = ij;

      if (ij.relationship === "FK") {
        relationship = this.findJoin(ijReg);
      }

      if (!relationship) {
        return log.error("Unable to find suitable forign key for join()", {
          "available": this.foreignKeys,
          "issue": ij
        });
      }

      const relationshipKeys = Object.keys(relationship);

      SELECT.sql += ", ??.??.*";
      SELECT.param.push(ijReg.options.database, ijReg.options.name);

      FROM.sql += " INNER JOIN ??.??";
      FROM.param.push(ijReg.options.database, ijReg.options.name);

      if (relationshipKeys.every(key => relationship[key] === key)) {
        FROM.sql += " USING(";

        relationshipKeys.forEach((key, i) => {
          if (i) {
            FROM.sql += ", ";
          }

          FROM.sql += "??";
          FROM.param.push(key);
        });

        FROM.sql += ")";
      } else {
        return log.error("HOW TO HANDLE THIS?");
      }
    }

    return {
      "param": SELECT.param.concat(FROM.param),
      "sql": `${SELECT.sql} ${FROM.sql}`
    };
  }

  findJoin(ijReg) {
    const classKey = ns(ijReg),
      possibilites = [];

    for (const join of this.joins) {
      const key = `${classKey}-${ns(join.Class[registry])}`;

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
