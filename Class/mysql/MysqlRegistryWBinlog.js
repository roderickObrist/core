"use strict";

const types = require("mysql/lib/protocol/constants/types"),
  {is, db, wrap, log, S} = require('../../index'),
  BinLogManager = require('./BinLogManager'),
  {
    storage,
    pendingUpdate,
    updateAcknowledge,
    deleteAcknowledge,
    createAcknowledge,
    diff,
    order,
    limit
  } = S,
  Registry = require('./MysqlRegistry');

class MysqlRegistryWBinLog extends MysqlRegistry {
  constructor(options, Class) {
    super(options, Class);

    this.on("ready", () => {
      // Subscribe to changes from the binary log
      BinLogManager.create({
        "host": options.host
      }, (e, binLogManager) => binLogManager.add(this));
    });
  }

  [createAcknowledge](row) {
    if (this.options.allEvents) {
      const instance = this.rowToInstance(row, row, this.options.allEvents);

      instance.emit("create", instance);
    }
  }

  // Only a small part of this function is to execute the
  // query, the rest of this func is involved with callback
  // management/optimisation
  update(instance, values, callback) {

  }

  [updateAcknowledge](before, after) {
    // If we don't persist instances
    if (!this[storage]) {
      if (!this.options.allEvents) {
        return;
      }

      return new this.Class(after)
        .emit("update", this[diff](before, after));
    }

    const keyString = this.buildKey(before);

    let instance = this[storage][keyString];

    // If we've never seen the instance before
    if (!instance) {
      if (!this.options.allEvents) {
        return;
      }

      instance = new this.Class(after);
      this.add(instance);

      return instance.emit("update", this[diff](before, after));
    }

    let diffToInstance = this[diff](instance, after),
      changes = this[diff](before, after),
      pending = instance[pendingUpdate];

    if (diffToInstance) {
      Object.assign(instance, diffToInstance);
      super.update(instance, diffToInstance);
    } else {
      this.add(instance, keyString);
    }

    if (pending) {
      let {values, onUpdate} = pending[0];

      if (this[diff](changes, values)) {
        log.warn("External update between exec, onUpdate", {
          values,
          before,
          after,
          instance,
          changes
        });
      } else {
        pending.shift();

        if (pending.length === 0) {
          delete instance[pendingUpdate];
        }

        onUpdate.forEach(resolve => resolve(values));
      }
    }

    instance.emit("update", changes);
  }

  [deleteAcknowledge](row) {
    const instance = this.rowToInstance(row, row, this.options.allEvents);

    super.delete(instance);

    instance.emit("delete", instance);
  }

}

module.exports = MysqlRegistry;
