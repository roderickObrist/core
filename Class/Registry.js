"use strict";

const {log, EventEmitter, S} = require('../index'),
  {timestamp, storage, key} = S;

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
    }
  }

  add(instance, instanceKey = this.buildKey(instance)) {
    if (this[storage]) {
      if (!instanceKey) {
        return log.error("Unable to build key", {instance});
      }

      instance[timestamp] = Date.now();
      instance[key] = instanceKey;

      this[storage][instance[key]] = instance;
    }
  }

  delete(instance) {
    delete this[storage][instance[key]];
    delete instance[timestamp];
    delete instance[key];
  }

  update(instance, updateValue) {
    if (!this[storage]) {
      return;
    }

    instance[timestamp] = Date.now();

    if (this.keys.PRIMARY.some(key => updateValue.hasOwnProperty(key.COLUMN_NAME))) {
      // There is a key change
      delete this[storage][instance[key]];
      instance[key] = this.buildKey(instance);

      if (!instance[key]) {
        return log.error("Unable to build key", {instance});
      }

      this[storage][instance[key]] = instance;
    }
  }

  get(query) {
    if (!this[storage]) {
      return false;
    }

    const keyString = this.buildKey(query),
      instance = this[storage][keyString];

    if (!keyString) {
      return false;
    }

    if (!instance) {
      return false;
    }

    if (Date.now() - instance[timestamp] < this.options.cacheAge) {
      return instance[timestamp];
    }

    // We have it but it's old
    return false;
  }

  clean() {
    let instances = this[storage];

    for (let keyString in instances) {
      if (this[storage][keyString][key] === keyString) {
        this.delete(instances[keyString]);
      }
    }
  }

  buildKey(instance) {
    const keys = this.keys.PRIMARY;

    let key = '';

    for (let i = 0; i < keys.length; i += 1) {
      if (!instance.hasOwnProperty(keys[i].COLUMN_NAME)) {
        return false;
      }

      key += '-' + String(instance[keys[i].COLUMN_NAME]);
    }

    return key;
  }
}

module.exports = Registry;
