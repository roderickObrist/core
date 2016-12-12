"use strict";

exports.is = require('./is');

try {
  exports.config = require('../../config');
} catch (e) {
  if (!e.message.startsWith("Cannot find module '../config'")) {
    throw e;
  }

  exports.config = {};
}

if (!exports.config.dir) {
  exports.config.dir = __dirname.split('/')
    .slice(0, -2)
    .join('/');
}

exports.wrap = require('./wrap');

exports.log = require('./log');

exports.db = require('./db');

exports.EventEmitter = require('./EventEmitter');

exports.Class = require('./Class');
