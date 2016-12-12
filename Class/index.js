"use strict";

const {config} = require('../index'),
  Class = require('./Class'),
  fs = require('fs'),
  classes = Object.create(null),
  proxies = Object.create(null);

// Get a list of all available classes
try {
  fs.readdirSync(config.dir + '/class')
    .filter(name => {
      let parts = name.split('.');

      // Only folders or .js files need apply
      return parts.length === 1 ||
        parts.pop() === 'js';
    })
    .forEach(name => classes[name.replace(/\.js$/, '')] = null);
} catch (e) {
  if (
    e.code !== 'ENOENT' ||
      e.path !== config.dir + '/class'
  ) {
    throw e;
  }
}

module.exports = new Proxy(Class, {
  get(target, property) {
    if (property in classes) {
      if (classes[property] === "loading") {
        throw "We have a circular dep";
      }

      if (classes[property] === null) {
        classes[property] = "loading";
        classes[property] = require(`${config.dir}/class/${property}`);
      }

      return classes[property];
    }

    return target[property];
  }
});
