"use strict";

const mysql = require('mysql'),
  {config, is, log} = require('./index'),
  fs = require('fs'),
  e = v => mysql.escape(v),
  b = v => `(${v})`;

function where(paramObj) {
  let sql = '';

  for (let key of Object.keys(paramObj)) {
    const value = paramObj[key],
      isMultiple = is.array(value),
      isNot = (/([!<>])$/).exec(key);

    if (/password!?$/.test(key)) {

      // Password Syntax:
      // "password!": "Pass1234"
      // "password": ["Pass1234", "Pass12343"]
      // "password": ["Pass1234", "Pass12343"]
      sql += 'password ';

      if (isMultiple) {
        sql += isNot ? 'NOT IN' : 'IN';

        sql += b(value.map(v => `SHA1(${e(v)})`
          .join(', ')));
      } else {
        sql += isNot ? '!' : '';

        sql += '= SHA1(${e(v)})';
      }
    } else if (/ LIKE$/.test(key)) {

      // LIKE Syntax:
      // "col LIKE": "val%"
      // "col LIKE": ["val%", "%ue", "%alu%"]
      // "col NOT LIKE": ["val%", "%ue", "%alu%"]
      if (isMultiple) {
        sql += b(value.map(v => `${key} ${e(v)}`).join(' || '));
      } else {
        sql += key + ' ' + mysql.escape(value);
      }
    } else if (key === "||") {

      // || Syntax:
      // "||": {
      //   "key": "val",
      //   "key2": "val2"
      // },
      // "||": [{
      //   "key": "val",
      //   "key2": "val2"
      // }, ...]
      if (isMultiple) {
        sql += value.map(v => b(where(v).replace(/ && /g, ' || ')))
          .join(' && ');
      } else {
        sql += b(where(value).replace(/ && /g, ' || '));
      }
    } else if (key === "&&") {

      // && Syntax:
      // "&&": [{
      //   "key": "val",
      //   "key2": "val2"
      // }, ...]
      if (isMultiple) {
        sql += b(value.map(v => b(where(v)))
            .join(' || '));
      }
    } else if (isMultiple) {
      sql += (isNot ? key.slice(0, -1) : key) + ' ' +
        (isNot ? 'NOT ' : '') + 'IN' + b(e(value));
    } else {
      sql += (isNot ? key.slice(0, -1) : key) + ' ';

      if (value === null) {
        sql += 'IS ' + (isNot ? 'NOT ' : '') + 'NULL';
      } else {
        sql += (isNot ? isNot[1] : '') + '= ' + e(value);
      }
    }

    sql += ' && ';
  }

  return sql.slice(0, -4);
}

function set(paramObj) {
  var sql = '',
    key;

  for (key of Object.keys(paramObj)) {
    sql += mysql.escapeId(key) + ' = ';

    if (key === 'password') {
      sql += `SHA1(${e(paramObj[key])}), `;
    } else {
      sql += e(paramObj[key]) + ', ';
    }
  }

  return sql.slice(0, -2);
}

function queryFormat(query, values) {
  if (!values) {
    return query;
  }

  if (!is.array(values)) {
    values = [values];
  }

  return query.replace(/\??\?/g, (match, i) => {
    if (values.length === 0) {
      return match;
    }

    let insert = values.shift();

    if (insert instanceof Date) {
      insert = new Date().toISOString()
        .replace("T", " ")
        .slice(0, -5);
    }

    if (match === '??') {
      if (/ORDER BY[\s]*$/.test(query.slice(0, i))) {
        insert = insert.split(' ');
        return mysql.escapeId(insert[0]) + ' ' + (insert[1] === 'ASC' ? 'ASC' : 'DESC');
      }

      return mysql.escapeId(insert);
    }

    // If the ? is following a WHERE and the param is an object
    // there are some special use cases
    if (is.baseObject(insert)) {
      if (/WHERE[\s]*$/.test(query.slice(0, i))) {
        return where(insert);
      }

      return set(insert);
    }

    return mysql.escape(insert);
  });
}

function query(pool, sql, param, callback) {
  if (!pool) {
    return log.error("Missing DB connection");
  }

  // Promise API
  if (!callback) {
    return new Promise((resolve, reject) => {
      pool.query(sql, param, (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve(data);
      });
    });
  }

  // Stream API
  if (is.baseObject(callback)) {
    let stream = pool.query(sql, param)
      .stream();

    for (let event of Object.keys(callback)) {
      stream.on(event, callback[event]);
    }

    return stream;
  }

  // Callback API
  pool.query(sql, param, callback);
}

function load(db, filename) {
  let sqlRe = /\/\*([a-zA-Z]+)\*\/([\s\S]+?)(?=\/\*|$)/g,
    contents = fs.readFileSync(filename, 'ascii'),
    match = sqlRe.exec(contents);

  function define(name, sql) {
    db[name] = (...args) => query(db.pool, sql, ... args);
  }

  while (match) {
    define(match[1], match[2].trim());
    match = sqlRe.exec(contents);
  }

  return db;
}

function make(conf) {
  function db(sql, param, callback) {
    if (!is.array(param)) {
      callback = param;
      param = [];
    }

    return query(db.pool, sql, param, callback);
  }

  db.load = filename => load(db, filename);

  db.setPool = config => {
    db.poolConfig = Object.assign({queryFormat}, config);

    db.pool = mysql.createPool(Object.assign({
      queryFormat,
      "multipleStatements": true
    }, config));
  };

  db.debug = (sql, param, callback) => {
    if (!is.array(param)) {
      callback = param;
      param = [];
    }

    console.log(sql);
    console.log(param);
    console.log(queryFormat(sql, param));
  };

  if (conf) {
    db.setPool(config.db);
  }

  return db;
}

module.exports = make(config.db);

module.exports.load = filename => {
  let db = make().load(filename);

  db.poolConfig = module.exports.poolConfig;
  db.pool = module.exports.pool;

  return db;
};

module.exports.setPool = config => make(config);

