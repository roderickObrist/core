/* eslint class-methods-use-this: 0 */
"use strict";

const {is, log} = require("../");

module.exports = class GetSignature {
  constructor(details, Class) {
    this.Class = Class;

    if (!is.func(details.get)) {
      return log.error("GetSignature must have a get()");
    }

    this.get = details.get;

    if (is.func(details.test)) {
      this.test = details.test;
    }

    // Figure this one out soon
    if (is.func(details.map)) {
      this.map = details.map;
    }
  }

  test() {
    return true;
  }

  async exec(query) {
    return this.get(query);
  }
};
