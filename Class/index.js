/* eslint no-sync: 0 global-require: 0*/
"use strict";

const {config, log} = require("../index"),
  Class = require("./Class"),
  fs = require("fs");

function makeProxy(dir) {
  // Get a list of all available classes
  const classes = {},
    options = fs.readdirSync(dir)
      .filter(name => /^[^.]+(?:\.js)?$/u.test(name));

  for (const name of options) {
    if (name.endsWith(".js")) {
      classes[name.replace(/\.js$/u, "")] = null;
    } else {
      classes[name] = makeProxy(`${dir}/${name}`);
    }
  }

  return new Proxy(Class, {
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
        classes[property] = require(`${dir}/${property}`);
      }

      return classes[property];
    }
  });
}

module.exports = makeProxy(`${config.dir}/class`);
