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

const is = require('./is');

module.exports = (callback, procedure, transform, multiple) => {
  // There can be 3 options
  // Promise API
  if (!callback) {
    if (transform) {
      return procedure()
        .then(value => multiple ? value.map(transform) : transform(value));
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

        callback(null, multiple ? value.map(transform) : transform(value));
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
