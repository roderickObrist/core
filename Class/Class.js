"use strict";

const {EventEmitter, wrap, S} = require('../index'),
  {getSignatures, registry, configureSet, eventEmitter, ee, diff, order, limit} = S,
  RAMRegistry = require('./RAMRegistry'),
  GetSignature = require('./GetSignature'),
  Join = require('./Join');

class Class extends EventEmitter {
  static [eventEmitter]() {
    if (this.hasOwnProperty(ee)) {
      return this[ee];
    }

    this[ee] = new EventEmitter();

    return this[ee];
  }

  static on(...args) {
    const ee = this[eventEmitter]();

    ee.on(...args);
    return this;
  }

  static once(...args) {
    const ee = this[eventEmitter]();

    ee.once(...args);
    return this;
  }

  static off(...args) {
    const ee = this[eventEmitter]();

    ee.off(...args);
    return this;
  }

  static configure(name, options = {}) {
    switch (name) {
    case "db":
      this[registry] = new (require('./mysql/MysqlRegistry'))(options, this);
      return;

    case "registry":
      this[registry] = new RAMRegistry(options, this);
      return;

    case "set":
      return this[configureSet](options.column, options.values);

    case "getSignature":
      if (!this[getSignatures]) {
        this[getSignatures] = [];
      }

      this[getSignatures].push(new GetSignature(options, this, registry));
    }
  }

  static [configureSet](name, values) {
    let column = name[0].toUpperCase() + name.slice(1),
      asArr = `get${column}AsArray`;

    this.prototype[asArr] = function getSetAsArray() {
      return (this[column] || "")
        .split(',');
    };

    this.prototype[`add${column}`] = function addToSet(value, ...args) {
      let newValue = this[asArr]().filter(val => val !== value);

      if (values.includes(value)) {
        newValue.push(value);
      }

      newValue = newValue.join(',');

      return args[0] === true
        ? newValue
        : this.update({
          [name]: newValue
        }, ...args);
    };

    this.prototype[`remove${column}`] = function removeFromSet(value, ...args) {
      let newValue = this[asArr]().filter(val => val !== value)
        .join(',');

      return args[0] === true
        ? newValue
        : this.update({
          [name]: newValue
        }, ...args);
    };

    this.prototype[`has${column}`] = function hasInSet(value) {
      return this[asArr]()
        .includes(value);
    };

    this.prototype[`get${column}AsObject`] = function getSetAsObject() {
      return this[asArr]().reduce((asObject, value) => {
        value[asObject] = true;
        return asObject;
      }, {});
    };
  }

  static cleanRegistry() {
    this[registry].clean();
  }

  static get(...args) {
    if (this[getSignatures]) {
      for (let getSignature of this[getSignatures]) {
        if (getSignature.test(args[0])) {
          return getSignature.exec(...args);
        }
      }
    }

    return this[registry].get(...args);
  }

  static create(query, callback) {
    const r = this[registry];

    if (r) {
      return r.create(query, callback);
    }

    throw new Error("no reg");
  }

  static join(Class, relationship) {
    let join = new Join(this, registry);

    join.join(Class, relationship);

    return join;
  }

  constructor(properties) {
    super();

    Object.assign(this, properties);
  }

  emit(name, data) {
    const ee = this.constructor[eventEmitter]();

    super.emit(name, data);

    ee.emit(name, data, {
      "target": this
    });

    return this;
  }

  delete() {
    this.emit("delete");

    if (this[registry]) {
      this[registry].delete(this);
    }
  }

  update(values, callback) {
    const Class = this.constructor;

    if (!Class[registry]) {
      throw new Error("Don't know how to handle this yet");
    }

    let actualUpdate = Class[registry][diff](this, values);

    if (actualUpdate) {
      return Class[registry].update(this, actualUpdate, callback);
    }

    return wrap.transform(callback, (result, resolve) => resolve(this));
  }
}

module.exports = Class;

Class.get.order = order;
Class.get.limit = limit;
