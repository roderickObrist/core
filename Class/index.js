/* eslint no-sync: 0 global-require: 0*/
"use strict";

const {config, log} = require("../index"),
  Class = require("./Class"),
  fs = require("fs"),
  classes = {};

// Get a list of all available classes
fs.readdirSync(`${config.dir}/class`)
  .filter(name => /^[^.]+(\.js)?$/.test(name))
  .forEach(name => {
    classes[name.replace(/\.js$/, "")] = null;
  });

module.exports = new Proxy(Class, {
  get(target, property) {
    if (!classes.hasOwnProperty(property)) {
      return target[property];
    }

    if (classes[property] === "loading") {
      const loadingClasses = {};

      for (const [className, state] of Object.entries(classes)) {
        if (state === "loading") {
          loadingClasses[className] = "loading";
        }
      }

      throw log.error("Circular Dependency", loadingClasses);
    }

    if (classes[property] === null) {
      classes[property] = "loading";
      classes[property] = require(`${config.dir}/class/${property}`);
    }

    return classes[property];
  }
});
