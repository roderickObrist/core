"use strict";

const {EventEmitter, wrap} = require('../index'),
  {MysqlRegistry, RAMRegistry} = require('./Registry'),
  Join = require('./Join'),
  is = require("../is"),
  db = require("../db"),
  registry = Symbol(),
  configureSet = Symbol();

module.exports = class Class extends EventEmitter {
  static configure(name, options = {}) {
    switch (name) {
    case "db":
      this[registry] = new MysqlRegistry(options, this);
      return;

    case "registry":
      this[registry] = new RAMRegistry(options, this);
      return;

    case "set":
      return this[configureSet](options.column, options.values);
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

  static get(...args) {
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

    for (let name of Object.keys(properties)) {
      this[name] = properties[name];
    }
  }

  emit(...args) {
    this.constructor.emit(...args);
    return super.emit(...args);
  }

  delete(callback) {
    if (this[registry]) {
      this[registry].delete(this);
    }
  }

  update() {

  }
};
