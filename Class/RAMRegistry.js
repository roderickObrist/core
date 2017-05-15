"use strict";

const {wrap, S, is} = require('../index'),
  {
    diff,
    storage
  } = S,
  Registry = require('./Registry');

class RAMRegistry extends Registry {
  constructor(options, Class) {

    // Massage options
    options = Object.assign({
      "cacheAge": Infinity,
      "persistent": true
    }, options);

    super(options, Class);

    this.keys = {
      "PRIMARY": this.options.keys.map(key => ({
        "COLUMN_NAME": key
      }))
    };
  }

  get(query, callback) {
    if (query === null) {
      return wrap.transform(callback, (result, resolve) => {
        Object.keys(this[storage])
          .forEach(key => result(this[storage][key]));

        resolve();
      });
    }

    let instance = super.get(query);

    if (this[diff](instance, query)) {
      instance = null;
    }

    return wrap.transform(callback, (result, resolve) => resolve(instance));
  }

  create(query, callback) {
    if (!this[storage]) {
      return new this.Class(query);
    }

    if (is.array(query)) {
      throw new Error("Create with array is not implemented yet");
    }

    const key = this.buildKey(query);

    let instance = this[storage][key];

    if (!instance) {
      instance = new this.Class(query);
    }

    this.add(instance, key);

    instance.emit("create", instance);

    return wrap.transform(callback, (result, resolve) => resolve(instance));
  }

  update(instance, values, callback) {
    super.update(instance, values);

    return wrap.transform(callback, (result, resolve) => resolve());
  }

  delete(instance, callback) {
    super.delete(instance);

    return wrap.transform(callback, (result, resolve) => resolve());
  }

  [diff](instance, newObject) {
    return Object.keys(newObject)
      .any(key => {
        if (!instance.hasOwnProperty(key)) {
          return false;
        }

        if (newObject[key] instanceof Date) {
          return instance[key] instanceof Date &&
            newObject[key].getTime() === instance[key].getTime();
        }

        return instance[key] === newObject[key];
      });
  }
}

module.exports = RAMRegistry;
