'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildMsg18,
  buildMsg30,
  buildMsg31,
  buildMsg36,
  buildMsg50,
  buildMsg60,
  buildMsg19,
  encodeScore3,
} = require('../src/messages-basket');
const { createInitialState, applyEvent } = require('../src/match-state');

test('msg 18 at chrono 10:00 period 1 has 13 bytes and proper layout', () => {
  const state = createInitialState();
  const buf = buildMsg18(state);
  assert.strictEqual(buf.length, 13);
  assert.strictEqual(buf[0], 0x31); // '1'
  assert.strictEqual(buf[1], 0x38); // '8'
  assert.strictEqual((buf[2] & 0x80) >> 7, 1); // b7 always 1
  assert.strictEqual(buf[3], 0x35); // sport '5'
  assert.strictEqual(buf[4], 0x31); // '1'
  assert.strictEqual(buf[5], 0x30); // '0'
  assert.strictEqual(buf[6], 0x30); // '0'
  assert.strictEqual(buf[7], 0x30); // '0'
  assert.strictEqual(buf[8], 0x33); // timeouts home 3
  assert.strictEqual(buf[9], 0x33); // timeouts guest 3
  assert.strictEqual(buf[10], 0x20);
  assert.strictEqual(buf[11], 0x20);
  assert.strictEqual(buf[12], 0x31); // period 1
});

test('msg 30 with score 42-38 encodes correctly with leading space for tens', () => {
  let state = createInitialState();
  state = { ...state, homeScore: 42, guestScore: 38 };
  const buf = buildMsg30(state);
  assert.strictEqual(buf.length, 9);
  assert.strictEqual(buf[0], 0x33);
  assert.strictEqual(buf[1], 0x30);
  assert.strictEqual(buf[2], 0x35);
  // Home 42: ' ' '4' '2'
  assert.strictEqual(buf[3], 0x20);
  assert.strictEqual(buf[4], 0x34);
  assert.strictEqual(buf[5], 0x32);
  // Guest 38: ' ' '3' '8'
  assert.strictEqual(buf[6], 0x20);
  assert.strictEqual(buf[7], 0x33);
  assert.strictEqual(buf[8], 0x38);
});

test('msg 30 with score 0-0 encodes as two spaces + 0', () => {
  const state = createInitialState();
  const buf = buildMsg30(state);
  assert.deepStrictEqual(Array.from(buf.slice(3, 6)), [0x20, 0x20, 0x30]);
  assert.deepStrictEqual(Array.from(buf.slice(6, 9)), [0x20, 0x20, 0x30]);
});

test('msg 30 with score 127 encodes hundreds correctly', () => {
  const buf = encodeScore3(127);
  assert.deepStrictEqual(Array.from(buf), [0x31, 0x32, 0x37]);
});

test('msg 31 after foul records player, team fouls, and team marker', () => {
  let state = createInitialState();
  state = applyEvent(state, { type: 'foul', team: 'home', playerLine: 4 });
  const buf = buildMsg31(state);
  assert.strictEqual(buf.length, 11);
  assert.strictEqual(buf[0], 0x33);
  assert.strictEqual(buf[1], 0x31);
  assert.strictEqual(buf[2], 0x35);
  assert.strictEqual(buf[3], 0x20);
  assert.strictEqual(buf[4], 0x31); // home team fouls = 1
  assert.strictEqual(buf[6], 0x30); // guest team fouls = 0
  assert.strictEqual(buf[7], 0x30); // line tens = '0'
  assert.strictEqual(buf[8], 0x34); // line units = '4'
  assert.strictEqual(buf[9], 0x31); // player fouls = 1
  assert.strictEqual(buf[10], 0x31); // team = '1' home
});

test('msg 36 emits SS+d 5-byte layout', () => {
  const state = { ...createInitialState(), chronoMs: 56_400 };
  const buf = buildMsg36(state);
  assert.strictEqual(buf.length, 5);
  assert.strictEqual(buf[0], 0x33);
  assert.strictEqual(buf[1], 0x36);
  assert.strictEqual(buf[2], 0x35); // '5'
  assert.strictEqual(buf[3], 0x36); // '6'
  assert.strictEqual(buf[4], 0x34); // '4' tenths
});

test('msg 50 shot clock at 24s encodes as "24"', () => {
  const state = createInitialState();
  const buf = buildMsg50(state);
  assert.strictEqual(buf.length, 5);
  assert.strictEqual(buf[0], 0x35);
  assert.strictEqual(buf[1], 0x30);
  assert.strictEqual((buf[2] & 0x80) >> 7, 1); // b7
  assert.strictEqual(buf[3], 0x32); // '2'
  assert.strictEqual(buf[4], 0x34); // '4'
});

test('msg 60 bonus indicator reflects homeBonus / guestBonus', () => {
  let state = createInitialState();
  for (let i = 0; i < 5; i++) {
    state = applyEvent(state, { type: 'foul', team: 'home', playerLine: 4 });
  }
  const buf = buildMsg60(state);
  assert.strictEqual(buf.length, 5);
  assert.strictEqual(buf[3] & 0x01, 0x01); // home bonus bit
  assert.strictEqual(buf[4] & 0x01, 0x00); // guest no bonus
});

test('msg 19 during active guest timeout emits countdown + indicator alternation', () => {
  let state = createInitialState();
  state = applyEvent(state, { type: 'timeout-start', team: 'guest' });
  const buf = buildMsg19(state);
  assert.strictEqual(buf.length, 7);
  assert.strictEqual(buf[0], 0x31);
  assert.strictEqual(buf[1], 0x39);
  assert.strictEqual(buf[2], 0x35);
  // Guest had 3 timeouts, consumed 1 → 2 remaining. Indicator base = 0x30+2=0x32 or 0x2F+2=0x31.
  assert.ok([0x31, 0x32].includes(buf[4]));
  // Chrono 60s → "60" -> '6' '0'
  assert.strictEqual(buf[5], 0x36);
  assert.strictEqual(buf[6], 0x30);
});
