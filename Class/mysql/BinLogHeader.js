"use strict";

function BinLogHeader() {}

BinLogHeader.prototype.parse = function (parser) {
  // uint8_t  marker; // always 0 or 0xFF
  parser.parseUnsignedNumber(1);

  // uint32_t timestamp;
  this.timestamp = parser.parseUnsignedNumber(4) * 1000;

  // uint8_t  type_code;
  this.typeCode = parser.parseUnsignedNumber(1);

  switch (this.typeCode) {
  case 0x13:
    this.eventType = "tableMap";
    break;

  case 0x17:
    this.eventType = "insert";
    break;

  case 0x18:
    this.eventType = "update";
    break;

  case 0x19:
    this.eventType = "delete";
    break;

  default:
    return;
  }

  // uint32_t server_id;
  this.serverId = parser.parseUnsignedNumber(4);

  // uint32_t event_length;
  this.eventLength = parser.parseUnsignedNumber(4);

  // uint32_t next_position;
  this.nextPosition = parser.parseUnsignedNumber(4);

  // uint16_t flags;
  this.flags = parser.parseUnsignedNumber(2);

  this.tableId = parser.parseUnsignedNumber(4);
  this.tableId += parser.parseUnsignedNumber(2) * Math.pow(2, 32);

  this.eventFlags = parser.parseUnsignedNumber(2);

  this.parser = parser;
};

module.exports = BinLogHeader;
