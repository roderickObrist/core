"use strict";

const {wrap} = require('../index');

module.exports = class GetSignature {
  constructor(details, Class, registrySymbol) {
    this.Class = Class;
    this.r = registrySymbol;

    for (let func of ["get", "test", "map"]) {
      if (details[func]) {
        this[func] = details[func];
      }
    }
  }

  test(query) {
    return Boolean(query);
  }

  exec(query, callback) {
    if (this.get) {
      return wrap.transform(callback, (result, resolve, reject) => {
        this.get(query, {
          result, resolve, reject,
          "registry": this.Class[this.r]
        });
      });
    }
  }
};

