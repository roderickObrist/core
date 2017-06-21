"use strict";

const {log, is} = require("../index"),
  diff = Symbol.for("diff"),
  storage = Symbol.for("storage"),
  timestamp = Symbol.for("timestamp"),
  Registry = require("./Registry");

module.exports = class RAMRegistry extends Registry {
  constructor(options, Class) {
    // Massage options, it makes no sense to have a non persistent RAMRegistry
    super(Object.assign({
      "cacheAge": Infinity,
      "persistent": true
    }, options), Class);

    this.keys = {
      "PRIMARY": this.options.keys.map(key => ({
        "COLUMN_NAME": key
      }))
    };
  }

  async get(query) {
    if (query === null) {
      log.warn(".get() called with null retrieves all");
      return Object.values(this[storage]);
    }

    const primaryKey = super.buildKey(query);

    if (primaryKey) {
      const instance = this[storage][primaryKey];

      return instance &&
          Date.now() - instance[timestamp] < this.options.cacheAge &&
          !this[diff](instance, query)
        ? [instance]
        : [];
    }

    return Object.values(this[storage])
      .filter(instance => !this[diff](instance, query));
  }

  async create(query) {
    if (is.array(query)) {
      return log.error(".create([array]) is not supported yet");
    }

    const key = this.buildKey(query);

    let instance = this[storage][key];

    if (!instance) {
      instance = new this.Class(query);
    }

    this.add(instance, key);

    instance.emit("create", instance);

    return instance;
  }

  async update(instance, values) {
    Object.assign(instance, values);

    super.update(instance, values);
  }

  async delete(instance) {
    super.delete(instance);
  }

  [diff](instance, query) {
    throw "TODO";
  }
};
