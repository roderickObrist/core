"use strict";

const {log, is} = require("../index"),
  {Transform} = require("stream"),
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

    this.join(Base);

    this.ready = Promise.resolve();
  }

  join(Class, joinAs, relationship) {
    const join = {
        Class,
        joinAs,
        relationship
      },
      joinRegistry = Class[registry];

    if (is.baseObject(joinAs)) {
      join.relationship = joinAs;
      join.joinAs = Class.name;
    } else if (!joinAs) {
      join.joinAs = Class.name;
    }

    if (!join.relationship) {
      join.relationship = "FK";
    }

    if (!joinRegistry) {
      throw log.error("Trying to join with no relationship/registry");
    }

    this.joins.push(join);

    return this;
  }

  async prepareKeys() {
    for (const join of this.joins) {
      const joinRegistry = join.Class[registry];

      if (!joinRegistry.keys) {
        await new Promise(resolve => joinRegistry.on("ready", resolve));
      }

      this.analyseKeys(joinRegistry);
    }

    this.foreignKeys = {};
  }

  async get(where) {
    if (!this.foreignKeys) {
      await this.prepareKeys();
    }

    const sql = this.buildSql(where);

    const rows = await this.Base[registry].db({
      "nestTables": true,
      "sql": sql.sql
    }, sql.param);

    return rows.map(row => this.rowToInstances(row));
  }

  getStream(where, bindings = {}) {
    const self = this,
      stream = new Transform({
        "objectMode": true,
        transform(row, encoding, callback) {
          callback(null, self.rowToInstances(row));
        }
      });

    function exec() {
      const sql = self.buildSql(where);

      self.Base[registry].db
        .stream({
          "nestTables": true,
          "sql": sql.sql
        }, sql.param)
        .pipe(stream);
    }

    if (this.foreignKeys) {
      exec();
    } else {
      this.prepareKeys()
        .then(exec);
    }

    for (const [name, listener] of Object.entries(bindings)) {
      stream.on(name, listener);
    }

    return stream;
  }

  rowToInstances(row) {
    const val = {};

    this.joins.forEach(join => {
      const joinRegistry = join.Class[registry],
        {joinAs} = join;

      val[joinAs] = joinRegistry.rowToInstance(row[joinAs]);
    });

    return val;
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

  buildSql(where) {
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
        throw log.error("Unable to find suitable forign key for join()", {
          "available": this.foreignKeys,
          "issue": ij
        });
      }

      const relationshipKeys = Object.keys(relationship);

      SELECT.sql += ", ??.??.*";
      SELECT.param.push(ijReg.options.database, ij.joinAs);

      FROM.sql += " INNER JOIN ??.?? AS ??";
      FROM.param.push(ijReg.options.database, ijReg.options.name, ij.joinAs);

      // If all keys are the same name we can USING()
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
        FROM.sql += " ON(";

        relationshipKeys.forEach((key, i) => {
          if (i) {
            FROM.sql += " && ";
          }

          FROM.sql += "?? = ??.??";
          FROM.param.push(key, ij.joinAs, relationship[key]);
        });

        FROM.sql += ")";
      }
    }

    if (where) {
      FROM.sql += " WHERE ?";
      FROM.param.push(where);
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
