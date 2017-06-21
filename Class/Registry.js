"use strict";

const {log, EventEmitter} = require("../index"),
  timestamp = Symbol.for("timestamp"),
  storage = Symbol.for("storage"),
  key = Symbol.for("key");

const noop = () => null;

class Registry extends EventEmitter {
  constructor(options, Class) {
    super();

    this.describe("ready", {
      "fireOnce": true
    });

    this.options = options;
    this.Class = Class;

    if (options.persistent) {
      this[storage] = {};
    } else {
      this.add = noop;
      this.delete = noop;
      this.update = noop;
      this.clean = noop;
    }
  }

  add(instance, instanceKey = this.buildKey(instance)) {
    if (!instanceKey) {
      log.error("Unable to build key", {instance});
      return;
    }

    instance[timestamp] = Date.now();
    instance[key] = instanceKey;

    this[storage][instance[key]] = instance;
  }

  delete(instance) {
    delete this[storage][instance[key]];
    delete instance[timestamp];
    delete instance[key];
  }

  update(instance, updateValue) {
    const hasPKeyChange = this.keys.PRIMARY.some(pKey => updateValue.hasOwnProperty(pKey.COLUMN_NAME));

    instance[timestamp] = Date.now();

    if (!hasPKeyChange) {
      return;
    }

    delete this[storage][instance[key]];

    instance[key] = this.buildKey(instance);

    this[storage][instance[key]] = instance;
  }

  clean() {
    for (const instance of Object.values(this[storage])) {
      // Important to call prototype method because MysqlRegistry overwrites delete
      Registry.prototype.delete.call(this, instance);
    }
  }

  buildKey(instance) {
    const keys = this.keys.PRIMARY;

    let pKey = String(keys[0].COLUMN_NAME);

    for (let i = 1; i < keys.length; i += 1) {
      if (!instance.hasOwnProperty(keys[i].COLUMN_NAME)) {
        return false;
      }

      pKey += `-${String(instance[keys[i].COLUMN_NAME])}`;
    }

    return pKey;
  }
}

module.exports = Registry;
