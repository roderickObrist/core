"use strict";

// https://dev.mysql.com/doc/internals/en/com-binlog-dump.html

function ComBinLog({binLogName, binLogPos}) {
  this.binLogName = binLogName;
  this.binLogPos = binLogPos;
}

ComBinLog.prototype.write = function (writer) {
  // BinLog constant
  writer.writeUnsignedNumber(1, 0x12);

  // BinLog Position
  writer.writeUnsignedNumber(4, this.binLogPos);

  // Non Blocking
  writer.writeUnsignedNumber(2, 0);

  // Server ID
  writer.writeUnsignedNumber(4, 1);

  writer.writeNullTerminatedString(this.binLogName);
};

module.exports = ComBinLog;
