"use strict";

const canHandleColors = process.stdout.isTTY,
  {config} = require('./index'),
  moment = require('moment'),
  r = require('rethinkdb');

require('colors');

let store = () => {};

if (config.rethinkdb) {
  store = data => store.buffer.push(data);
  store.buffer = [];

  r.connect(config.rethinkdb, (err, conn) => {
    if (err) {
      store = () => {};
      return exports.error(err);
    }

    let state = "connected";

    function insert(data) {
      return r.db('log')
        .table(moment().format("YYYY_MM_DD"))
        .insert(data)
        .run(conn, {
          "durability": "soft"
        })
        .catch(err => exports.error(err));
    }

    // Empty the buffer
    if (store.buffer.length) {
      insert(store.buffer);
    }

    // Overwrite store
    store = insert;

    conn
      .on('close', () => {
        store = () => {};

        if (state !== "connecting") {
          state = "connecting";

          conn.reconnect(function again(err) {
            if (err) {
              return setTimeout(() => conn.reconnect(again), 1e3);
            }
          });
        }
      })
      .on('connect', () => {
        state = "connected";
        store = insert;
      })
      .on('timeout', () => {
        store = () => {};
      })
      .on('error', () => {
        store = () => {};
      });
  });
}

function stamp(data, level) {
  data.level = level;
  data.timestamp = r.now();
  data.server = config.mode;
}

function formatMultipleArgs(message, extra, level) {
  let data = {
      "body": {}
    },
    errorObject;

  function copy(obj, target = data) {
    let keepers = ['connectionId', 'protocol', 'path', 'direction'];

    for (let key in obj) {
      if (
        key === "body" &&
          target === data
      ) {
        copy(obj[key], data.body);
      } else if (keepers.includes(key)) {
        data[key] = obj[key];
      } else {
        data.body[key] = obj[key];
      }
    }
  }

  if (typeof message === "string") {
    data.body.code = message;
  } else if (message instanceof Error) {
    errorObject = message;
  } else if (message instanceof Object) {
    copy(message);
  }

  if (extra instanceof Error) {
    errorObject = extra;
  } else if (extra instanceof Object) {
    copy(extra);
  }

  if (!errorObject) {
    errorObject = new Error();
  }

  if (!data.body.stack) {
    data.body.stack = errorObject.stack;
  }

  try {
    data.body.stack = data.body.stack.split('\n')
      .map(line => line.trim())
      .slice(1)
      .filter(line => line.indexOf(__filename + ':') === -1);
  } catch (ignore) {}

  if (!data.body.code) {
    data.body.code = errorObject.message || errorObject.code || "Error";
  }

  if (!data.protocol) {
    data.protocol = level.toUpperCase();
  }

  if (
    !data.connectionId &&
      /\(.+\)/.test(data.body.stack[0])
  ) {
    data.connectionId = /\((.+)\)/.exec(data.body.stack[0])[1];
  }

  stamp(data, level);

  return data;
}

exports.info = (data, stringified) => {
  const t = new Date();

  if (typeof data === "string") {
    if (canHandleColors) {
      const time = t.toTimeString().substr(0, 8);

      console.log(`${time.bold.green}: ${data}`);

      if (stringified) {
        console.log(stringified);
      }
    }

    return;
  }

  stamp(data, 'info');

  if (!stringified) {
    stringified = JSON.stringify(data.body);
  }

  if (stringified.length > 512 * 1024) {
    data.body = Object.keys(data.body)
      .reduce((body, key) => {
        body[key] = (data.body[key] instanceof Object) ? "TRUNCATED" : data.body[key];

        return body;
      }, {});
  }

  store(data);

  if (!["WWW", "UDP"].includes(data.protocol)) {
    return;
  }

  if (!canHandleColors) {

    const time = `${t.getDate()} ${t.toDateString().substr(4, 3)} ${t.toTimeString().substr(0, 8)}`,
      protoConnectionDirection = `${data.protocol}: [${data.connectionId}] ${data.direction}`;

    if (stringified.length > 200) {
      stringified = stringified.slice(0, 200);
    }

    return console.log(`${time} - ${protoConnectionDirection}: ${stringified}`);
  }

  const time = t.toTimeString().substr(0, 8),
    directionColour = data.direction === "IN" ? 'red' : 'green',
    protoDirection = data.protocol.bold[directionColour],
    connection = data.connectionId.slice(-3).blue;

  console.log(`${time} ${protoDirection}[${connection}]: ${stringified.slice(0, process.stdout.columns - 19)}`);
};

exports.warn = (message, extra) => {
  let data = formatMultipleArgs(message, extra, 'warn');

  store(data);

  if (!canHandleColors) {
    return console.log(`${data.path} ${JSON.stringify(data.body, '', 2)}`);
  }

  console.log(`${data.body.code.bold.yellow} ${JSON.stringify(data.body, '', 2)}`);
};

exports.error = (message, extra) => {
  let data = formatMultipleArgs(message, extra, 'error');

  store(data);

  if (!canHandleColors) {
    return console.error(`${data.body.code} ${JSON.stringify(data.body, '', 2)}`);
  }

  console.log(`${data.body.code.bold.red} ${JSON.stringify(data.body, '', 2)}`);
};

exports.session = (details, stringified) => {
  let {connectionId, direction, protocol, path, body} = details;

  if (!connectionId) {
    connectionId = details.connectionId = Math.random().toString(36).slice(-10);
  }

  if (!direction) {
    direction = details.direction = "OUT";
  }

  if (!protocol) {
    protocol = details.protocol = "info";
  }

  if (!path) {
    path = details.path = "none";
  }

  if (!body) {
    details.body = {};
  }

  exports.info(details, stringified);

  direction = direction === "OUT" ? "IN" : "OUT";

  return {
    info(body, stringified) {
      exports.info({
        connectionId, protocol, path, body, direction
      }, stringified);
    },
    warn(tag, body = {}) {
      exports.warn(tag, {
        connectionId, protocol, path, body, direction
      });
    },
    error(tag, body = {}) {
      exports.error(tag, {
        connectionId, protocol, path, body, direction
      });
    }
  };
};
