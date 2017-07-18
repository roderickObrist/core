"use strict";

const {is, Class, config} = require("./"),
  net = require("net");

require("colors");

class Command extends Class {
  async exec(socket) {
    this.socket = socket;

    if (is.func(this.handler)) {
      return this.handler();
    }

    return this.execSubCommand();
  }

  async execSubCommand() {
    const commands = [...Object.keys(this.handler), "Exit"],
      format = commands.map((command, i) => `${String(i + 1).blue.bold}. ${command}`)
        .join("\n");

    let input = await this.read(`Available commands are:\n${format}`);

    if (/^[0-9]+$/.test(input)) {
      input = commands[Number(input) - 1];
    }

    if (input === "Exit") {
      return Promise.resolve();
    }

    let handler = this;

    const tree = input.split('.');

    do {
      handler = handler.handler[tree.shift()];
    } while (tree.length);

    if (Command.is(handler)) {
      return handler.exec(this.socket);
    }

    if (is.func(handler)) {
      return handler.call(this);
    }

    this.write(`Unrecognized command ${input}`.red);
    return this.execSubCommand();
  }

  async read(str) {
    this.write(str);

    return new Promise(resolve => {
      this.socket.once("data", text => {
        resolve(text.toString().trim());
      });
    });
  }

  write(str) {
    this.socket.write(`${str}\n`);
  }
}

Command.configure("registry", {
  "keys": ["name"]
});

Command.create({
  "handler": {},
  "name": "Welcome".bold
})

Command.on("create", async command => {
  const [welcome] = await Command.get({"name": "Welcome".bold});

  if (!welcome.tcpServer) {
    welcome.tcpServer = net.createServer(async socket => {
      await welcome.exec(socket);

      socket.end();
    });

    welcome.tcpServer.listen(config.commandPort || 8000);
  }

  welcome.handler[command.name] = command;
});

module.exports = Command;
