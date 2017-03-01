"use strict";

const {db} = require('./index');

(async function() {
  const tables = await db(`
    SHOW TABLES
  `);

  tables.forEach(table => console.log(table));
}())

(async function() {
  for (let table of await db(`SHOW TABLES`)) {
    console.log(table);
  }
}())