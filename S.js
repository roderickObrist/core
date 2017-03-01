"use strict";

// It would be good to describe each Symbol here

[
  "timestamp",
  "storage",
  "key",
  "addBinding",
  "listeners",
  "parse",
  "emit",
  "getSignatures",
  "registry",
  "configureSet",

  // Used by Class as a way of storing eventEmitter statically
  "getEventEmitter",
  "ee",

  "updateAcknowledge",
  "deleteAcknowledge",
  "createAcknowledge",
  "pendingUpdate",

  // Used by MysqlRegistry as a way of finding the changes in 2 objects
  "diff",

  // Used by MysqlRegistry, Class.get as a way to provide an ordered query
  "order",

  // Used by MysqlRegistry, Class.get as a way to provide an limited query
  "limit"
].forEach(key => {
  exports[key] = Symbol(key);
});
