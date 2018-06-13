"use strict";

const {is, log} = require("./"),
  addBinding = Symbol.for("addBinding"),
  listeners = Symbol.for("listeners"),
  parse = Symbol.for("parse"),
  emit = Symbol.for("emit");

module.exports = class EventEmitter {
  constructor() {
    this[listeners] = {};
  }

  // Supports:
  // 'eventName'
  // 'namespace.eventName' or 'namespace:eventName'
  // 'namespace.eventName otherEvent[4]'
  [parse](name, listener, forEach, needsFunc = true) {
    if (is.baseObject(name)) {
      for (const key of Object.keys(name)) {
        this[parse](key, name[key], forEach, needsFunc);
      }

      return this;
    }

    if (!is.string(name)) {
      throw log.error("name must be a string");
    }

    if (
      needsFunc &&
        !is.func(listener)
    ) {
      throw log.error("listener must be a function");
    }

    for (const eventDescriptor of name.split(" ")) {
      let n = /\[([0-9]+)\]$/.exec(eventDescriptor),
        id = eventDescriptor;

      if (n) {
        id = id.slice(0, -n[0].length);
        n = Number(n[1]);
      } else {
        n = 0;
      }

      forEach({
        id,
        listener,
        n
      });
    }

    return this;
  }

  [addBinding](binding) {
    if (!this[listeners][binding.id]) {
      EventEmitter.prototype.describe.call(this, binding.id);
    }

    if (binding.id !== "new.listener") {
      EventEmitter.prototype.emit.call(this, "new.listener", {
        "listener": binding.listener,
        "name": binding.id
      });
    }

    this[listeners][binding.id].bindings.push(binding);
  }

  on(name, listener) {
    return this[parse](name, listener, binding => this[addBinding](binding));
  }

  once(name, listener) {
    return this[parse](name, listener, binding => {
      if (!binding.n) {
        binding.n = this[listeners]
          ? this[listeners].n + 1
          : 1;
      }

      this[addBinding](binding);
    });
  }

  off(name, listener) {
    return this[parse](name, listener, ({id, listener}) => {
      const container = this[listeners][id];

      if (container) {
        const {bindings} = container;

        for (let i = 0; i < bindings.length; i += 1) {
          if (bindings[i].listener === listener) {
            bindings.splice(i, 1);
            return;
          }
        }
      }
    });
  }

  has(name) {
    return Boolean(this[listeners][name]);
  }

  emit(name, argument, eventContext = {}) {
    return this[parse](name, argument, ({id, listener}) => {
      const metaArg = {
        "event": id,
        "target": eventContext.target || this
      };

      // listener is actually argument
      if (!this[listeners][id]) {
        EventEmitter.prototype.describe.call(this, id);
      }

      let runningEventName = id;

      do {
        this[emit](runningEventName, listener, metaArg);
        runningEventName = runningEventName.replace(/(\.|^)[^.]+$/, "");
      } while (runningEventName.length);
    }, false);
  }

  [emit](id, argument, eventContext) {
    const container = this[listeners][id];

    if (!container) {
      return;
    }

    if (
      container.fireOnce &&
        container.n
    ) {
      return;
    }

    container.n += 1;

    // If .off() is called during .emit() results can be unstable; i is incremented,
    // bindings.length drops. This is fixed by copying the handlers array and checking
    // if the function is still in the original array before invokation
    const bindings = container.bindings.slice(0);

    for (const binding of bindings) {
      if (binding.n) {
        if (container.n < binding.n) {
          continue;
        }
        
        if (container.n > binding.n) {
          container.bindings.splice(container.bindings.indexOf(binding), 1);
        }
      }

      if (container.bindings.includes(binding)) {
        binding.listener.call(this, argument, eventContext);
      }
    }
  }

  describe(bindingId, config = {}) {
    this[listeners][bindingId] = {
      "bindings": [],
      "fireOnce": Boolean(config.fireOnce),
      "n": 0
    };

    if (bindingId === "new.event") {
      return this;
    }

    return EventEmitter.prototype.emit.call(this, "new.event", bindingId);
  }
};
