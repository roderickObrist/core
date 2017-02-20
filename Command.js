"use strict";

const {is, Class, config} = require('core'),
  net = require('net');

require('colors');

class Command extends Class {
  exec(out, finished) {
    if (is.func(this.handler)) {
      return this.handler(out, finished);
    }

    const commands = Object.keys(this.handler)
      .concat("Exit");

    out(
      "Available commands are:\n" +
        commands.map((command, i) => `${String(i + 1).blue.bold}. ${command}`)
          .join('\n'),
      input => {
        let key = input;

        if (/^[0-9]+$/.test(input)) {
          key = commands[Number(input) - 1];
        }

        if (key === "Exit") {
          return finished();
        }

        let handler = this.handler[key];

        if (handler) {
          if (is.func(handler.exec)) {
            return handler.exec(out, (message) => {
              if (message) {
                out(message);
              }

              this.exec(out, finished);
            });
          }

          if (is.func(handler)) {
            return handler(out, finished);
          }
        }

        finished(`Unrecognized command ${input}`.red);
      }
    );
  }
}

Command.configure("registry", {
  "keys": ["name"]
});

Command.create({
  "name": "Welcome".bold,
  "handler": {}
}, (e, welcome) => {
  net.createServer(socket => {
    welcome.exec((text, callback) => {
      socket.write(text + '\n');

      if (callback) {
        socket.once("data", text => {
          callback(text.toString().trim());
        });
      }
    }, (message = "Goodbye\n") => {
      socket.end(message.green);
    });
  }).listen(config.commandPort || 8000);

  Command.on("create", newCommand => {
    welcome.handler[newCommand.name] = newCommand;
  });
});

module.exports = Command;
