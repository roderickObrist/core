/* eslint global-require: 0 */
"use strict";

const path = require("path"),
  dir = path.dirname(process.mainModule.filename);

exports.is = require("./is");

try {
  exports.config = require(path.join(dir, "config"));
} catch (e) {
  if (!e.message.startsWith("Cannot find module ")) {
    throw e;
  }

  exports.config = {};
}

if (!exports.config.dir) {
  exports.config.dir = dir;
}

exports.log = require("./log");

exports.db = require("./db");

exports.m = require("moment");

exports.EventEmitter = require("./EventEmitter");

// exports.Class = require('./Class');

// exports.Command = require("./Command");

function onErr(err) {
  const details = {"path": "uncaughtException"};

  if (!(err instanceof Error)) {
    details.body = {
      "code": String(err)
    };
  }

  exports.log.error(details, err);
}

process.on("unhandledRejection", onErr)
  .on("uncaughtException", onErr);
