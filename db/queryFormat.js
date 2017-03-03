"use strict";

const mysql = require("mysql"),
  {is, log} = require("../index"),
  e = v => mysql.escape(v),
  b = v => `(${v})`;

function where(paramObj) {
  let sql = "";

  for (const [key, value] of Object.entries(paramObj)) {
    const isMultiple = is.array(value),
      isNot = (/([!<>])$/).exec(key);

    if (/ LIKE$/.test(key)) {

      // LIKE Syntax:
      // "col LIKE": "val%"
      // "col LIKE": ["val%", "%ue", "%alu%"]
      // "col NOT LIKE": ["val%", "%ue", "%alu%"]
      if (isMultiple) {
        sql += b(value.map(v => `${key} ${e(v)}`).join(" || "));
      } else {
        sql += `${key} ${mysql.escape(value)}`;
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
        sql += value.map(v => b(where(v).replace(/ && /g, " || ")))
          .join(" && ");
      } else {
        sql += b(where(value).replace(/ && /g, " || "));
      }
    } else if (key === "&&") {

      // && Syntax:
      // "&&": [{
      //   "key": "val",
      //   "key2": "val2"
      // }, ...]
      if (isMultiple) {
        sql += b(value.map(v => b(where(v)))
            .join(" || "));
      }
    } else if (isMultiple) {
      sql += isNot
        ? key.slice(0, -1)
        : key;

      sql += " ";

      sql += isNot
        ? "NOT "
        : "";

      sql += `IN (${e(value)})`;
    } else {
      sql += isNot
        ? key.slice(0, -1)
        : key;

      sql += " ";

      if (value === null) {
        sql += "IS ";

        sql += isNot
          ? "NOT "
          : "";

        sql += "NULL";
      } else {
        sql += isNot
          ? isNot[1]
          : "";

        sql += `= ${e(value)}`;
      }
    }

    sql += " && ";
  }

  return sql.slice(0, -4);
}

function set(paramObj) {
  return Object.entries(paramObj)
    .map(([key, value]) => `${mysql.escapeId(key)} = ${e(value)}`)
    .join(", ");
}

module.exports = function queryFormat(query, values) {
  if (!values) {
    return query;
  }

  const valueArray = [].concat(values);

  return query.replace(/\??\?/g, (match, i) => {
    if (valueArray.length === 0) {
      log.error("missingSQLInjection", {
        query,
        values
      });

      return match;
    }

    const insert = valueArray.shift();

    if (match === "??") {
      if (/ORDER BY[\s]*$/.test(query.slice(0, i))) {
        const [column, order] = insert.split(" "),
          safeOrder = order === "ASC"
            ? "ASC"
            : "DESC";

        return `${mysql.escapeId(column)} ${safeOrder}`;
      }

      return mysql.escapeId(insert);
    }

    // If the ? is following a WHERE and the param is an object
    if (is.baseObject(insert)) {
      if (/WHERE[\s]*$/.test(query.slice(0, i))) {
        return where(insert);
      }

      return set(insert);
    }

    return mysql.escape(insert);
  });
};
