"use strict";

const Packets = Object.create(require("mysql/lib/protocol/packets")),
  Sequence = require("mysql/lib/protocol/sequences/Sequence"),
  types = require("mysql/lib/protocol/constants/types");

Object.assign(Packets, {
  "BinLogHeader": require('./BinLogHeader'),
  "ComBinLog": require('./ComBinLog')
});

function sliceBits(input, start, end) {
  // ex: start: 10, end: 15 = "111110000000000"
  let match = (((1 << end) - 1) ^ ((1 << start) - 1));

  return (input & match) >> start;
}

function parseIEEE754Float(high, low) {
  var lastSignificantBit = 23,
    sigFigs = 23,
    expLeading = 127;

  if (low !== undefined) {
    lastSignificantBit = 20;
    sigFigs = 52;
    expLeading = 1023;
  }

  let sign = (high & (1 << 31)) !== 0 ? -1 : 1,
    exponent = sliceBits(high, lastSignificantBit, 31) - expLeading,
    significandBits = sliceBits(high, 0, lastSignificantBit),
    significand = 1;

  for (let i = 0; i < lastSignificantBit; i += 1) {
    if (significandBits & (1 << i)) {
      significand += 1 / (1 << (sigFigs - i));
    }
  }

  if (low !== undefined) {
    for (let i = 0; i < 32; i++) {
      if (low & (1 << i)) {
        // Bitwise operators only work on up to 32 bits
        significand += 1 / Math.pow(2, sigFigs - i);
      }
    }
  }

  return sign * Math.pow(2, exponent) * significand;
}

function readInt24BE(buf, offset, noAssert) {
  return (buf.readInt8(offset, noAssert) << 16) +
          buf.readUInt16BE(offset + 1, noAssert);
}

function readIntBE(buf, offset, length, noAssert) {
  switch (length) {
  case 1: return buf.readInt8(offset, noAssert);
  case 2: return buf.readInt16BE(offset, noAssert);
  case 3: return readInt24BE(buf, offset, noAssert);
  case 4: return buf.readInt32BE(offset, noAssert);
  }
}

function zeroPad(num, size) {
  let s = "00000000000000000000000000000000" + num;

  return s.substr(s.length - size);
}

function parseUInt64(parser) {
  const low = parser.parseUnsignedNumber(4),
    high = parser.parseUnsignedNumber(4);

  return (high * Math.pow(2, 32)) + low;
}

function readTemporalFraction(parser, fractionPrecision) {
  if (!fractionPrecision) {
    return false;
  }

  let fractionSize = Math.ceil(fractionPrecision / 2),
    fraction = readIntBE(parser._buffer, parser._offset, fractionSize);

  parser._offset += fractionSize;

  if (fractionPrecision % 2 !== 0) {
    fraction /= 10;
  }

  if (fraction < 0) {
    fraction *= -1;
  }

  let milliseconds;

  if (fractionPrecision > 3) {
    milliseconds = Math.floor(fraction / Math.pow(10, fractionPrecision - 3));
  } else if (fractionPrecision < 3) {
    milliseconds = fraction * Math.pow(10, 3 - fractionPrecision);
  } else {
    milliseconds = fraction;
  }

  return {
    "value": fraction,
    "precision": fractionPrecision,
    "milliseconds": milliseconds
  };
}

function BinLog(options, binLogManager) {
  this.options = options;

  this.binLogManager = binLogManager;

  Sequence.call(this, options);
}

BinLog.prototype = Object.create(Sequence.prototype);

BinLog.prototype.start = function () {
  this.emit('packet', new Packets.ComBinLog(this.options));
};

BinLog.prototype.determinePacket = function (firstByte) {
  switch (firstByte) {
  case 0xfe:
    return Packets.Eof;

  case 0xff:
    return Packets.Error;

  default:
    return Packets.BinLogHeader;
  }
};

BinLog.prototype.BinLogHeader = function (packet) {
  if (!packet.eventType) {
    return;
  }

  this[packet.eventType](packet);
};

// https://dev.mysql.com/doc/internals/en/table-map-event.html
BinLog.prototype.tableMap = function (packet) {
  const {parser, tableId} = packet,
    descriptor = parser._buffer.slice(parser._offset, parser._packetEnd),
    {binLogManager} = this,
    map = {tableId};

  // To avoid parsing every tableMap event we can cache the buffer
  if (binLogManager.hasTableId(tableId)) {
    if (binLogManager.matchDescriptor(tableId, descriptor)) {
      return;
    }

    throw new Error("Schema change, without a new ID");
  }

  // schema name
  map.database = parser.parseString(parser.parseUnsignedNumber(1));

  // padding
  parser.parseUnsignedNumber(1);

  // table name
  map.name = parser.parseString(parser.parseUnsignedNumber(1));

  // descriptor caching takes care of schema changes
  binLogManager.cacheDescriptor(tableId, descriptor, map, parser);

  // padding
  parser.parseUnsignedNumber(1);

  map.columnCount = parser.parseLengthCodedNumber();

  map.columnTypes = [];

  for (let i = 0; i < map.columnCount; i += 1) {
    map.columnTypes[i] = parser.parseUnsignedNumber(1);
  }

  // column meta data length
  parser.parseLengthCodedNumber();

  // This needs to happen because the real type is parsed out
  // It may be tempting to comment out this code, but you can not
  map.columnsMetadata = map.columnTypes.map((code, i) => {
    switch (code) {
    case types.FLOAT:
    case types.DOUBLE:
      return {
        "size": parser.parseUnsignedNumber(1)
      };

    case types.VARCHAR:
      return {
        'max_length': parser.parseUnsignedNumber(2)
      };

    case types.BIT:
      const bits = parser.parseUnsignedNumber(1),
        bytes = parser.parseUnsignedNumber(1);

      return {
        "bits": bytes * 8 + bits
      };

    case types.NEWDECIMAL:
      return {
        "precision": parser.parseUnsignedNumber(1),
        "decimals": parser.parseUnsignedNumber(1)
      };

    case types.BLOB:
    case types.GEOMETRY:
    case types.JSON:
      return {
        'length_size': parser.parseUnsignedNumber(1)
      };

    case types.STRING:
    case types.VAR_STRING:
      const metadata = (parser.parseUnsignedNumber(1) << 8) + parser.parseUnsignedNumber(1),
        realType = metadata >> 8;

      if (
        realType === types.ENUM ||
          realType === types.SET
      ) {
        map.columnTypes[i] = realType;
      }

      return {
        'max_length': (((metadata >> 4) & 0x300) ^ 0x300) + (metadata & 0x00ff)
      };

    case types.TIMESTAMP2:
    case types.DATETIME2:
    case types.TIME2:
      return {
        "decimals": parser.parseUnsignedNumber(1)
      };
    }
  });
};

BinLog.prototype.update = function (packet) {
  const {parser, tableId} = packet,
    {map, columns} = this.binLogManager.getInfo(tableId);

  // Then we know not to use it
  if (!columns) {
    return;
  }

  const columnCount = parser.parseLengthCodedNumber(),
    bitmapSize = Math.floor((columnCount + 7) / 8);

  // Skip the columns present mask
  parser._offset += bitmapSize;

  // Skip the columns present mask
  parser._offset += bitmapSize;

  this.binLogManager.handleUpdate(
    tableId,
    this.readRow(parser, columns, map),
    this.readRow(parser, columns, map)
  );
};

BinLog.prototype.delete = function (packet) {
  const {parser, tableId} = packet,
    {map, columns} = this.binLogManager.getInfo(tableId);

  // Then we know not to use it
  if (!columns) {
    return;
  }

  const columnCount = parser.parseLengthCodedNumber(),
    bitmapSize = Math.floor((columnCount + 7) / 8);

  // Skip the columns present mask
  parser._offset += bitmapSize;

  this.binLogManager.handleDelete(tableId, this.readRow(parser, columns, map));
};

BinLog.prototype.insert = function (packet) {
  const {parser, tableId} = packet,
    {map, columns} = this.binLogManager.getInfo(tableId);

  // Then we know not to use it
  if (!columns) {
    return;
  }

  const columnCount = parser.parseLengthCodedNumber(),
    bitmapSize = Math.floor((columnCount + 7) / 8);

  // Skip the columns present mask
  parser._offset += bitmapSize;

  this.binLogManager.handleInsert(tableId, this.readRow(parser, columns, map));
};

BinLog.prototype.readRow = function (parser, columns, tableMap) {
  const nullBitmapSize = Math.floor((columns.length + 7) / 8),
    nullBuffer = parser._buffer.slice(parser._offset, parser._offset + nullBitmapSize),
    row = {};

  let curNullByte,
    curBit;

  parser._offset += nullBitmapSize;

  columns.forEach((column, i) => {
    curBit = i % 8;

    if (curBit === 0) {
      curNullByte = nullBuffer.readUInt8(Math.floor(i / 8));
    }

    row[column.COLUMN_NAME] = (curNullByte & (1 << curBit))
      ? null
      : this.readColumn(parser, column, tableMap.columnTypes[i]);
  });

  return row;
};

BinLog.prototype.readColumn = function (parser, column, TYPE) {
  switch (TYPE) {
  case types.TINY:
    return this.readColumn.int(1, parser, column);

  case types.SHORT:
    return this.readColumn.int(2, parser, column);

  case types.INT24:
    return this.readColumn.int(3, parser, column);

  case types.LONG:
    return this.readColumn.int(4, parser, column);

  case types.LONGLONG:
    return this.readColumn.int(8, parser, column);

  case types.FLOAT:
    // 32-bit IEEE-754
    return parseIEEE754Float(parser.parseUnsignedNumber(4));

  case types.DOUBLE:
    let low = parser.parseUnsignedNumber(4),
      high = parser.parseUnsignedNumber(4);

    return parseIEEE754Float(high, low);

  case types.NEWDECIMAL:
    return this.readColumn.newDecimal(parser, column);

  case types.ENUM:
    let index = parser.parseUnsignedNumber(column.options.length > 255 ? 2 : 1);

    return index ? column.options[index - 1] : "";

  case types.VARCHAR:
  case types.STRING:
    let size = parser.parseUnsignedNumber(column.maxLength > 255 ? 2 : 1);

    return parser.parseString(size);

  case types.VAR_STRING:
    return parser.parseLengthCodedString();

  case types.DATETIME:
    const raw = parseUInt64(parser),
      date = Math.floor(raw / 1000000),
      time = raw % 1000000;

    return new Date(
      Math.floor(date / 10000),
      Math.floor((date % 10000) / 100) - 1,
      date % 100,
      Math.floor(time / 10000),
      Math.floor((time % 10000) / 100),
      time % 100
    );

  case types.DATETIME2:
    // Overlapping high-low to get all data in 32-bit numbers
    const rawHigh = readIntBE(parser._buffer, parser._offset, 4),
      rawLow = readIntBE(parser._buffer, parser._offset + 1, 4);

    parser._offset += 5;

    const fractionD = readTemporalFraction(parser, column.decimalPlaces),
      yearMonth = sliceBits(rawHigh, 14, 31);

    return new Date(
      Math.floor(yearMonth / 13),
      (yearMonth % 13) - 1,
      sliceBits(rawLow, 17, 22),
      sliceBits(rawLow, 12, 17),
      sliceBits(rawLow, 6, 12),
      sliceBits(rawLow, 0, 6),
      fractionD !== false ? fractionD.milliseconds : 0
    );

  case types.TIMESTAMP:
    return new Date(parser.parseUnsignedNumber(4) * 1000);

  case types.TIMESTAMP2:
    const rawT = readIntBE(parser._buffer, parser._offset, 4);

    parser._offset += 4;

    const fractionT = readTemporalFraction(parser, column.decimalPlaces),
      millisecondsT = fractionT !== false ? fractionT.milliseconds : 0;

    return new Date((rawT * 1000) + millisecondsT);

  default:
    console.log(column);
    throw new Error("Type not supported");
  }
};

BinLog.prototype.readColumn.int = function (size, parser, column) {
  let unsigned;

  if (size === 3) {
    let low = parser.parseUnsignedNumber(2),
      high = parser.parseUnsignedNumber(1);

    unsigned = (high << 16) + low;
  } else if (size === 8) {
    unsigned = parseUInt64(parser);

    if (!column.unsigned) {
      throw new Error("signed 64bit int not supported yet");
    }
  } else {
    unsigned = parser.parseUnsignedNumber(size);
  }

  if (column.unsigned) {
    return unsigned;
  }

  let length = size * 8;

  if (unsigned & (1 << length - 1)) {
    return ((unsigned ^ (Math.pow(2, length) - 1)) * -1) - 1;
  }

  return unsigned;
};

BinLog.prototype.readColumn.newDecimal = function (parser, column) {
  // Constants of format
  let digitsPerInteger = 9,
    compressedBytes = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    scale = column.decimalPlaces,
    integral = column.precision - scale,
    uncompIntegral = Math.floor(integral / digitsPerInteger),
    uncompFractional = Math.floor(scale / digitsPerInteger),
    compIntegral = integral - (uncompIntegral * digitsPerInteger),
    compFractional = scale - (uncompFractional * digitsPerInteger),
    size = (uncompIntegral * 4) + compressedBytes[compIntegral] +
             (uncompFractional * 4) + compressedBytes[compFractional],
    buffer = parser._buffer.slice(parser._offset, parser._offset + size);

  // Move binlog parser position forward
  parser._offset += size;

  let str,
    mask,
    pos = 0;

  const isPositive = (buffer.readInt8(0) & (1 << 7)) === 128;

  buffer.writeInt8(buffer.readInt8(0) ^ (1 << 7), 0, true);

  if (isPositive) {
    // Positive number
    str = '';
    mask = 0;
  } else {
    // Negative number
    str = '-';
    mask = -1;
  }

  // Build integer digits
  const compIntegralSize = compressedBytes[compIntegral];


  if (compIntegralSize > 0) {
    str += (readIntBE(buffer, 0, compIntegralSize) ^ mask).toString(10);
    pos += compIntegralSize;
  }

  for (let i = 0; i < uncompIntegral; i += 1) {
    str += zeroPad((buffer.readInt32BE(pos) ^ mask).toString(10), 9);
    pos += 4;
  }

  // Build fractional digits
  let fractionDigits = '';

  for (let i = 0; i < uncompFractional; i += 1) {
    fractionDigits += zeroPad((buffer.readInt32BE(pos) ^ mask).toString(10), 9);
    pos += 4;
  }

  let compFractionalSize = compressedBytes[compFractional];

  if (compFractionalSize > 0) {
    fractionDigits += zeroPad((readIntBE(buffer, pos, compFractionalSize) ^ mask).toString(10), compFractional);
  }

  // Fractional digits may have leading zeros
  str += '.' + fractionDigits;

  return parseFloat(str);
};

module.exports = BinLog;
