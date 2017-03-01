/* eslint global-require: 0 */

"use strict";

const {EventEmitter, S, log} = require("../index"),
  GetSignature = require("./GetSignature"),
  Join = require("./Join"),
  RAMRegistry = require("./RAMRegistry"),
  {
    getEventEmitter,
    getSignatures,
    registry,
    configureSet,
    ee,
    diff,
    order,
    limit
  } = S;

// Lazy load MysqlRegistry because some of that code requires Class
let MysqlRegistry = (...args) => {
  MysqlRegistry = require("./mysql/MysqlRegistry");

  return new MysqlRegistry(...args);
};

class Class extends EventEmitter {
  static [getEventEmitter]() {
    if (this.hasOwnProperty(ee)) {
      return this[ee];
    }

    this[ee] = new EventEmitter();

    return this[ee];
  }

  static on(...args) {
    this[getEventEmitter]()
      .on(...args);

    return this;
  }

  static once(...args) {
    this[getEventEmitter]()
      .once(...args);

    return this;
  }

  static off(...args) {
    this[getEventEmitter]()
      .off(...args);

    return this;
  }

  static configure(name, options = {}) {
    if (name === "db") {
      this[registry] = new MysqlRegistry(options, this);
    } else if (name === "registry") {
      this[registry] = new RAMRegistry(options, this);
    } else if (name === "set") {
      this[configureSet](options.column, options.values);
    } else if (name === "getSignature") {
      if (!this[getSignatures]) {
        this[getSignatures] = [];
      }

      this[getSignatures].push(new GetSignature(options, this, registry));
    } else {
      log.error("Unknown configure option", {
        name,
        options
      });
    }
  }

  static [configureSet] (name, values) {
    const column = name[0].toUpperCase() + name.slice(1),
      get = `get${column}AsArray`;

    this.prototype[get] = function getSetAsArray() {
      return (this[column] || "")
        .split(",");
    };

    this.prototype[`add${column}`] = function addToSet(value, ...args) {
      let newValue = this[get]()
        .filter(val => val !== value);

      if (values.includes(value)) {
        newValue.push(value);
      }

      newValue = newValue.join(",");

      if (args[0] === true) {
        return newValue;
      }

      return this.update({[name]: newValue}, ...args);
    };

    this.prototype[`remove${column}`] = function removeFromSet(value, ...args) {
      const newValue = this[get]()
        .filter(val => val !== value)
        .join(",");

      if (args[0] === true) {
        return newValue;
      }

      return this.update({[name]: newValue}, ...args);
    };

    this.prototype[`has${column}`] = function hasInSet(value) {
      return this[get]()
        .includes(value);
    };

    this.prototype[`get${column}AsObject`] = function getSetAsObject() {
      return this[get]().reduce((asObject, value) => {
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
      for (const getSignature of this[getSignatures]) {
        if (getSignature.test(args[0])) {
          return getSignature.exec(...args);
        }
      }
    }

    return this[registry].get(...args);
  }

  static create(query) {
    const r = this[registry];

    if (r) {
      return r.create(query);
    }

    throw new Error("no reg");
  }

  static join(ClassToJoin, relationship) {
    return new Join(this)
      .join(ClassToJoin, relationship);
  }

  constructor(properties) {
    super();

    Object.assign(this, properties);
  }

  emit(name, data) {
    super.emit(name, data);

    this.constructor[getEventEmitter]()
      .emit(name, data, {"target": this});
  }

  delete() {
    this.emit("delete");

    if (this[registry]) {
      return this.constructor[registry].delete(this);
    }

    return new Promise(resolve => resolve(this));
  }

  update(values) {
    const ThisClass = this.constructor;

    if (!ThisClass[registry]) {
      return log.error("Update Class has no registry", {
        "className": ThisClass.name
      });
    }

    const actualUpdate = ThisClass[registry][diff](this, values, true);

    if (actualUpdate) {
      return ThisClass[registry].update(this, actualUpdate);
    }

    return new Promise(resolve => resolve(this));
  }
}

Class.get.order = order;

Class.get.limit = limit;

module.exports = Class;
