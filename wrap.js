"use strict";

const is = require('./is'),
  {Readable, Transform} = require('stream');

// This is for masssaging Promise/callback/stream interfaces
// Usage
// return callback(db.bind(null, `
//   SELECT ${this.columns.nameInject}
//   FROM ??.??
//   WHERE ?
// `, [
//   ...this.columns.names,
//   this.options.database,
//   this.options.name,
//   query
// ]), transform, rest);

// Passthrough mode
exports.passthrough = (callback, procedure, transform) => {
  // There can be 3 options
  // Promise API
  if (!callback) {
    if (transform) {
      return procedure()
        .then(value => is.array(value) ? value.map(transform) : transform(value));
    }

    return procedure();
  }

  // Callback API
  if (is.func(callback)) {
    if (transform) {
      return procedure((err, value) => {
        if (err) {
          return callback(err);
        }

        callback(null, is.array(value) ? value.map(transform) : transform(value));
      });
    }

    return procedure(callback);
  }

  // Stream API
  if (is.baseObject(callback)) {
    if (!transform) {
      return procedure(callback);
    }

    let newStream = {};

    for (let event in callback) {
      if (event === "data") {
        newStream.data = function (value) {
          callback.data.call(this, transform(value));
        };
      } else {
        newStream[event] = callback[event];
      }
    }

    return procedure(newStream);
  }
};

// Transform Mode
exports.transform = (callback, procedure, transform = data => data) => {
  let isMultiple,
    promise,
    stream;

  // There can be 3 options
  // Promise API
  if (!callback) {
    promise = new Promise((resolve, reject) => {
      callback = (err, results) => {
        if (err) {
          return reject(err);
        }

        resolve(results);
      };
    });
  }

  // Callback API
  //if (is.func(callback)) {
    // I dont think anything needs to be done
  //}

  // Stream API
  if (is.baseObject(callback)) {
    stream = new Readable({
      "objectMode": true
    });

    stream._read = () => {};

    for (let event in callback) {
      if (is.func(callback[event])) {
        stream.on(event, callback[event]);
      }
    }
  }

  procedure(result => {
    if (stream) {
      return stream.emit('data', transform(result));
    }

    if (!isMultiple) {
      isMultiple = [];
    }

    isMultiple.push(transform(result));
  }, resolve => {
    if (stream) {
      if (resolve) {
        stream.push(transform(resolve));
      }

      return stream.push(null);
    }

    if (resolve) {
      resolve = transform(resolve);

      if (isMultiple) {
        isMultiple.push(resolve);
      }

      return callback(null, isMultiple || resolve);
    }

    if (isMultiple) {
      return callback(null, isMultiple);
    }

    callback();
  }, reject => {
    callback(reject);
  });

  if (promise) {
    return promise;
  }

  if (stream) {
    return stream;
  }
};
