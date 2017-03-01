"use strict";

const mysql = require('mysql'),
  queryFormat = require('./queryFormat'),
  {config, is, log} = require('../index'),
  fs = require('fs');

function make(conf) {
  async function db(sql, param = []) {
    if (!db.pool) {
      return log.error("Missing DB connection");
    }

    return new Promise((resolve, reject) => {
      db.pool.query(sql, param, (err, data) => {
        if (err) {
          err.query = sql;
          err.param = param;
          return reject(err);
        }

        resolve(data);
      });
    });
  }

  db.setPool = config => {
    db.poolConfig = Object.assign({queryFormat}, config);

    db.pool = mysql.createPool(Object.assign({
      queryFormat,
      "multipleStatements": true
    }, config));
  };

  db.debug = (sql, param = []) => {
    log.warn("dbDebug", {
      sql, param,
      "format": queryFormat(sql, param)
    });
  };

  if (conf) {
    db.setPool(config.db);
  }

  return db;
}

module.exports = make(config.db);

module.exports.setPool = config => make(config);
