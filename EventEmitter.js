"use strict";

const {is, log, S} = require('./'),
  {addBinding, listeners, parse, emit} = S;

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
      Object.keys(name)
        .forEach(name => this[parse](name, listener, forEach, needsFunc));

      return this;
    }

    if (!is.string(name)) {
      return log.error("name must be a string");
    }

    if (
      needsFunc &&
        !is.func(listener)
    ) {
      return log.error("listener must be a string");
    }

    name.split(' ')
      .map(eventDescriptor => {
        let n = /\[([0-9]+)\]$/.exec(eventDescriptor),
          id = eventDescriptor;

        if (n) {
          id = id.slice(0, -n[0].length);
          n = Number(n[1]);
        } else {
          n = 0;
        }

        return {
          id, n, listener
        };
      })
      .forEach(forEach);

    return this;
  }

  [addBinding](binding) {
    if (!this[listeners][binding.id]) {
      this.describe(binding.id);
    }

    if (binding.id !== 'new.listener') {
      this.emit('new.listener', {
        "name": binding.id,
        "listener": binding.listener
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
    return this[parse](name, listener, (id, listener) => {
      let l = this[listeners][id];

      if (l) {
        for (let i = 0; i < l.bindings.length; i += 1) {
          if (l.bindings[i].listener === listener) {
            return l.bindings.splice(i, 1);
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
      let metaArg = {
        "event": id,
        "target": eventContext.target || this
      };

      // listener is actually argument
      if (!this[listeners][id]) {
        this.describe(id);
      }

      while (id.length) {
        this[emit](id, listener, metaArg);

        id = id.split('.')
          .slice(0, -1)
          .join('.');
      }
    }, false);
  }

  [emit](id, argument, eventContext) {
    let container = this[listeners][id];

    if (
      !container ||
        (
          container.fireOnce &&
            container.n
        )
    ) {
      return;
    }

    container.n += 1;

    // If .off() is called during .emit() results can be unstable; i is incremented,
    // bindings.length drops. This is fixed by copying the handlers array and checking
    // if the function is still in the original array before invokation
    let bindings = container.bindings.slice(0);

    for (let i = 0; i < bindings.length; i += 1) {
      if (container.bindings.indexOf(bindings[i]) !== -1) {
        bindings[i].listener.call(this, argument, eventContext);
      }
    }
  }

  describe(bindingId, config = {}) {
    this[listeners][bindingId] = {
      "fireOnce": Boolean(config.fireOnce),
      "bindings": [],
      "n": 0
    };

    if (bindingId === "new.event") {
      return this;
    }

    return this.emit('new.event', bindingId);
  }
};
