'use strict';

const SOH = 0x01;
const STX = 0x02;
const ETX = 0x03;
const DEFAULT_ADDRESS = 0x7f;
const DEFAULT_CTRL = 0x47;

function computeLrc(buffer) {
  let lrc = 0;
  for (const byte of buffer) {
    lrc ^= byte;
  }
  lrc &= 0x7f;
  if (lrc < 0x20) {
    lrc += 0x20;
  }
  return lrc;
}

function frame(payload, { address = DEFAULT_ADDRESS, ctrl = DEFAULT_CTRL } = {}) {
  if (!Buffer.isBuffer(payload)) {
    throw new TypeError('payload must be a Buffer');
  }
  // LRC covers Address..ETX inclusive per PDF p.14 ("XOR of all bytes between SOH (excluded) and ETX (included)").
  const inner = Buffer.concat([
    Buffer.from([address, STX, ctrl]),
    payload,
    Buffer.from([ETX]),
  ]);
  const lrc = computeLrc(inner);
  return Buffer.concat([Buffer.from([SOH]), inner, Buffer.from([lrc])]);
}

module.exports = {
  frame,
  computeLrc,
  SOH,
  STX,
  ETX,
  DEFAULT_ADDRESS,
  DEFAULT_CTRL,
};
