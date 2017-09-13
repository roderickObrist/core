/* eslint global-require: 0 init-declarations: 0 */

"use strict";

const {EventEmitter, log, is} = require("../index"),
  getEventEmitter = Symbol.for("getEventEmitter"),
  getSignatures = Symbol.for("getSignatures"),
  configureSet = Symbol.for("configureSet"),
  GetSignature = require("./GetSignature"),
  RAMRegistry = require("./RAMRegistry"),
  registry = Symbol.for("registry"),
  diff = Symbol.for("diff"),
  Join = require("./Join"),
  ee = Symbol.for("ee");

// Lazy load MysqlRegistry because some of that code requires Class
let MysqlRegistry;

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
      if (!MysqlRegistry) {
        MysqlRegistry = require("./mysql/MysqlRegistry");
      }

      this[registry] = new MysqlRegistry(options, this);
    } else if (name === "registry") {
      this[registry] = new RAMRegistry(options, this);
    } else if (name === "set") {
      this[configureSet](options.column, options.values);
    } else if (name === "getSignature") {
      if (!this[getSignatures]) {
        this[getSignatures] = [];
      }

      this[getSignatures].push(new GetSignature(options, this));
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

  static async get(query) {
    if (this[getSignatures]) {
      for (const getSignature of this[getSignatures]) {
        if (getSignature.test(query)) {
          return getSignature.exec(query);
        }
      }
    }

    return this[registry].get(query);
  }

  static getStream(where, bindings = {}) {
    const stream = this[registry].getStream(where);

    for (const [name, listener] of Object.entries(bindings)) {
      stream.on(name, listener);
    }

    return stream;
  }

  static async create(query) {
    const r = this[registry];

    if (!r) {
      return new this(query);
    }

    return r.create(query);
  }

  static async getOrCreate(query) {
    if (is.array(query)) {
      return Promise.all(query.map(q => this.getOrCreate(q)));
    }

    // This is the correct way to do a getOrCreate, it avoids race conditions
    // two people simultaneously calling getOrCreate for the same row
    try {
      return await this.create(query);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        const [target] = await this.get(query);

        if (target) {
          return target
        }

        // Then they don't match on all keys
      }

      throw e;
    }
  }

  static join(ClassToJoin, joinAs, relationship) {
    return new Join(this)
      .join(ClassToJoin, joinAs, relationship);
  }

  static is(instance) {
    return instance instanceof this;
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

  async delete() {
    const r = this.constructor[registry];

    if (!r) {
      throw log.error("Cannot call delete() without registry");
    }

    this.emit("delete");

    return r.delete(this);
  }

  async update(values) {
    const r = this.constructor[registry];

    if (!r) {
      throw log.error("Cannot call update() without registry");
    }

    const actualUpdate = r[diff](this, values);

    if (actualUpdate) {
      return r.update(this, actualUpdate);
    }

    return false;
  }
}

module.exports = Class;
