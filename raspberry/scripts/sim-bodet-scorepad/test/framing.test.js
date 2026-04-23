'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { frame, computeLrc } = require('../src/framing');

test('LRC is XOR of all bytes, AND 0x7F', () => {
  // Known input: [0x7F, 0x02, 0x47, 0x31, 0x38, 0x03]
  // XOR = 0x7F ^ 0x02 ^ 0x47 ^ 0x31 ^ 0x38 ^ 0x03
  //     = 0x7D ^ 0x47 ^ 0x31 ^ 0x38 ^ 0x03
  //     = 0x3A ^ 0x31 ^ 0x38 ^ 0x03
  //     = 0x0B ^ 0x38 ^ 0x03
  //     = 0x33 ^ 0x03
  //     = 0x30
  const buf = Buffer.from([0x7f, 0x02, 0x47, 0x31, 0x38, 0x03]);
  assert.strictEqual(computeLrc(buf), 0x30);
});

test('LRC adds 32 when XOR result < 0x20 after mask', () => {
  // Input that XORs to a value < 0x20 to trigger +32 rule.
  // 0x7F ^ 0x00 ^ 0x00 = 0x7F ; 0x7F & 0x7F = 0x7F (>= 0x20, no +32). Craft a case: 0x01 ^ 0x02 = 0x03 < 0x20.
  const buf = Buffer.from([0x01, 0x02]);
  const lrc = computeLrc(buf);
  assert.strictEqual(lrc, 0x03 + 0x20);
  assert.ok(lrc >= 0x20);
});

test('frame wraps payload with SOH/STX/ETX/LRC and default address 0x7F / ctrl 0x47', () => {
  const payload = Buffer.from([0x31, 0x38]);
  const framed = frame(payload);
  assert.strictEqual(framed[0], 0x01); // SOH
  assert.strictEqual(framed[1], 0x7f); // Address
  assert.strictEqual(framed[2], 0x02); // STX
  assert.strictEqual(framed[3], 0x47); // CTRL
  assert.strictEqual(framed[4], 0x31);
  assert.strictEqual(framed[5], 0x38);
  assert.strictEqual(framed[6], 0x03); // ETX
  assert.strictEqual(framed.length, 8);
  const expectedLrc = computeLrc(Buffer.from([0x7f, 0x02, 0x47, 0x31, 0x38, 0x03]));
  assert.strictEqual(framed[7], expectedLrc);
});

test('computeLrc result is always >= 0x20 (printable-safe)', () => {
  for (let i = 0; i < 256; i++) {
    const buf = Buffer.from([i, 0x00]);
    const lrc = computeLrc(buf);
    assert.ok(lrc >= 0x20, `LRC for byte ${i.toString(16)} is ${lrc.toString(16)}`);
    assert.ok(lrc <= 0x7f);
  }
});
