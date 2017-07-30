"use strict";

const canHandleColors = process.stdout.isTTY,
  {config, is} = require("../index"),
  moment = require("moment"),
  r = require("rethinkdb"),
  noop = () => {};

let store = noop,
  print = noop;

require("colors");

module.exports = (data, stringified = JSON.stringify(data.body)) => {
  store(data);

  if (
    config.noConsole &&
      config.noConsole.includes(data.protocol)
  ) {
    return;
  }

  print(data, stringified);
};

(async rethinkdb => {
  if (!rethinkdb) {
    return;
  }

  let conn = null;

  store = data => store.buffer.push(data);
  store.buffer = [];

  try {
    conn = await r.connect(rethinkdb);
  } catch (e) {
    store = noop;
    throw e;
  }

  let state = "connected";

  async function insert(data) {
    return r.db("log")
      .table(moment().format("YYYY_MM_DD"))
      .insert(data)
      .run(conn, {
        "durability": "soft"
      });
  }

  // Empty the buffer
  if (store.buffer.length) {
    insert(store.buffer);
  }

  // Overwrite store
  store = insert;

  conn
    .on("close", () => {
      store = noop;

      if (state === "connecting") {
        return;
      }

      state = "connecting";

      (async function connect() {
        try {
          await conn.reconnect();
        } catch (err) {
          setTimeout(connect, 1e3);
        }
      })();
    })
    .on("connect", () => {
      state = "connected";
      store = insert;
    })
    .on("timeout", () => {
      store = noop;
    })
    .on("error", () => {
      store = noop;
    });
})(config.rethinkdb);

print = (data, stringified) => {
  const t = new Date(),
    maxStrLen = canHandleColors
      ? process.stdout.columns - 19
      : 200,
    stringifiedCapped = stringified.length > maxStrLen
      ? stringified.slice(0, maxStrLen)
      : stringified;

  if (is(data.level, "error", "warn")) {
    const severity = data.level === "error"
      ? "red"
      : "yellow";

    if (canHandleColors) {
      console.error(`${data.body.code.bold[severity]} ${stringified}`);
    } else {
      console.error(`${data.path} ${stringified}`);
    }

    return;
  }

  if (canHandleColors) {
    const time = t.toTimeString().substr(0, 8),
      directionColour = data.direction === "IN"
        ? "red"
        : "green",
      protoDirection = data.protocol.bold[directionColour],
      connection = data.connectionId.slice(-3).blue;

    console.log(`${time} ${protoDirection}[${connection}]: ${stringifiedCapped}`);
    return;
  }

  const time = `${t.getDate()} ${t.toDateString().substr(4, 3)} ${t.toTimeString().substr(0, 8)}`,
    protoConnectionDirection = `${data.protocol}: [${data.connectionId}] ${data.direction}`;

  console.log(`${time} - ${protoConnectionDirection}: ${stringifiedCapped}`);
};

