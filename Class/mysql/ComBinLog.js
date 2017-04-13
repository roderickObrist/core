"use strict";

// https://dev.mysql.com/doc/internals/en/com-binlog-dump.html

function ComBinLog({binLogName, binLogPos, serverId}) {
  this.binLogName = binLogName;
  this.binLogPos = binLogPos;
  this.serverId = serverId;
}

ComBinLog.prototype.write = function (writer) {
  // BinLog constant
  writer.writeUnsignedNumber(1, 0x12);

  // BinLog Position
  writer.writeUnsignedNumber(4, this.binLogPos);

  // Non Blocking
  writer.writeUnsignedNumber(2, 0);

  // Server ID
  writer.writeUnsignedNumber(4, this.serverId);

  writer.writeNullTerminatedString(this.binLogName);
};

module.exports = ComBinLog;
