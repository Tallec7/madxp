'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildFrame0x33, START_BYTE, TYPE_MAIN, FRAME_LEN } = require('../src/frame-0x33');
const { createInitialState, applyEvent } = require('../src/match-state');

test('default frame is 54 bytes, starts with 0xF8 0x33', () => {
  const state = createInitialState();
  const buf = buildFrame0x33(state);
  assert.strictEqual(buf.length, FRAME_LEN);
  assert.strictEqual(buf[0], START_BYTE);
  assert.strictEqual(buf[1], TYPE_MAIN);
});

test('chrono 10:00 encodes bytes 2-5 as "1000"', () => {
  const state = createInitialState();
  const buf = buildFrame0x33(state);
  assert.strictEqual(buf[2], 0x31); // '1'
  assert.strictEqual(buf[3], 0x30); // '0'
  assert.strictEqual(buf[4], 0x30); // '0'
  assert.strictEqual(buf[5], 0x30); // '0'
});

test('score 42-38 encodes bytes 6-8 " 42" and 9-11 " 38"', () => {
  const state = { ...createInitialState(), homeScore: 42, guestScore: 38 };
  const buf = buildFrame0x33(state);
  assert.deepStrictEqual(Array.from(buf.slice(6, 9)), [0x20, 0x34, 0x32]);
  assert.deepStrictEqual(Array.from(buf.slice(9, 12)), [0x20, 0x33, 0x38]);
});

test('clock STOP → byte 18 = 0x01; clock RUN → byte 18 != 0x01', () => {
  const stopped = createInitialState();
  assert.strictEqual(buildFrame0x33(stopped)[18], 0x01);
  const running = applyEvent(stopped, { type: 'clock-start' });
  assert.notStrictEqual(buildFrame0x33(running)[18], 0x01);
});

test('timeout active → byte 19 != 0x20', () => {
  let state = createInitialState();
  state = applyEvent(state, { type: 'timeout-start', team: 'guest' });
  const buf = buildFrame0x33(state);
  assert.notStrictEqual(buf[19], 0x20);
});

test('last-minute (chrono 7.5s, clock running) encodes bytes 2-5 SS + space + d', () => {
  // Per SPEC § 1.4.1 heuristic: bytes 4-5 trimmed must be a single non-space char.
  let state = createInitialState();
  state = applyEvent(state, { type: 'clock-start' });
  state = { ...state, chronoMs: 7_500 };
  const buf = buildFrame0x33(state);
  const bytes4_5 = Buffer.from([buf[4], buf[5]]).toString('ascii').trim();
  assert.strictEqual(bytes4_5.length, 1);
  assert.strictEqual(buf[5], 0x35); // tenths = 5 for 7.5s
});

test('shot clock 24 → bytes 46-47 = "24"', () => {
  const state = createInitialState();
  const buf = buildFrame0x33(state);
  assert.strictEqual(buf[46], 0x32);
  assert.strictEqual(buf[47], 0x34);
});

test('resync: concatenating 2 frames → byte 54 is 0xF8', () => {
  const state = createInitialState();
  const a = buildFrame0x33(state);
  const b = buildFrame0x33(state);
  const stream = Buffer.concat([a, b]);
  assert.strictEqual(stream.length, 108);
  assert.strictEqual(stream[54], START_BYTE);
});

test('period 1 encoded at byte 12 as ASCII "1"', () => {
  const state = createInitialState();
  const buf = buildFrame0x33(state);
  assert.strictEqual(buf[12], 0x31);
});

test('byte 17 reserved → space (SPEC § 1.4 l.17 hypothesis)', () => {
  const state = createInitialState();
  const buf = buildFrame0x33(state);
  assert.strictEqual(buf[17], 0x20);
});

test('padding bytes 48-53 → all spaces (SPEC § 4 pt.4 hypothesis)', () => {
  const buf = buildFrame0x33(createInitialState());
  for (let i = 48; i < 54; i++) {
    assert.strictEqual(buf[i], 0x20, `byte ${i} should be space`);
  }
});
