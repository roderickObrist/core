"use strict";

const BinLogSequence = require("./BinLogSequence"),
  {Class, S} = require("../../index"),
  {
    updateAcknowledge,
    deleteAcknowledge,
    createAcknowledge
  } = S,
  mysql = require('mysql');

function key({database, name}) {
  return `${database}.${name}`;
}

class BinLogManager extends Class {
  constructor(properties) {
    super(properties);

    this.registries = {};

    this.byTableId = {};

    this.byKey = {};
  }

  add(registry) {
    if (!this.binLog) {
      this.createBinLog(registry.db.poolConfig);
    }

    this.registries[key(registry.options)] = registry;
  }

  createBinLog({host, user, password}) {
    this.binLog = mysql.createConnection({host, user, password});

    this.binLog.query("SHOW BINARY LOGS", (e, binLogs) => {
      if (e) {
        throw e;
      }

      const details = binLogs.pop();

      this.binLog.query("select @@GLOBAL.binlog_checksum as checksum", (e, checksum) => {
        if (e) {
          throw e;
        }

        const binLogSequence = new BinLogSequence({
          "binLogName": details.Log_name,
          "binLogPos": details.File_size,
          "checksumEnabled": checksum[0].checksum !== "NONE"
        }, this);

        this.binLog._protocol._enqueue(binLogSequence);
      });
    });
  }

  hasTableId(tableId) {
    return Boolean(this.byTableId[tableId]);
  }

  matchDescriptor(tableId, descriptor) {
    return this.byTableId[tableId].descriptor.equals(descriptor);
  }

  cacheDescriptor(tableId, descriptor, map, parser) {
    const tKey = key(map),
      registry = this.registries[tKey],
      details = this.byTableId[tableId] = {
        "key": tKey,
        descriptor, map
      };

    if (!registry) {
      return;
    }

    // If its the first time a table was asked to cache
    if (!this.byKey[tKey]) {
      details.columns = registry.columns;
      this.byKey[tKey] = tableId;

      return;
    }

    if (this.byKey[tKey] === tableId) {
      throw new Error("This should not happen");
    }

    parser.pause();

    registry.refreshSchema(() => {
      this.byKey[tKey] = tableId;
      details.columns = registry.columns;
      parser.resume();
    });
  }

  getInfo(tableId) {
    return this.byTableId[tableId];
  }

  handleUpdate(tableId, before, after) {
    const tKey = this.byTableId[tableId].key;

    this.registries[tKey][updateAcknowledge](before, after);
  }

  handleDelete(tableId, row) {
    const tKey = this.byTableId[tableId].key;

    this.registries[tKey][deleteAcknowledge](row);
  }

  handleInsert(tableId, row) {
    const tKey = this.byTableId[tableId].key;

    console.log(tKey, row);
    this.registries[tKey][createAcknowledge](row);
  }
}

BinLogManager.configure("registry", {
  "keys": ["host"]
});

module.exports = BinLogManager;

