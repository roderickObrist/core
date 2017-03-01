"use strict";

const {db} = require('./index');

(async function() {
  let join
  for (let table of await db(`SHOW TABLES`)) {
    console.log(table);
  }
}())