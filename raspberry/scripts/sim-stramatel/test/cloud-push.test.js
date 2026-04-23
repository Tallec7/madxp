'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildMatchState } = require('../src/cloud-push');
const { createInitialState, applyEvent } = require('../src/match-state');

test('buildMatchState tags vendor=stramatel + sport=basketball', () => {
  const state = createInitialState();
  const payload = buildMatchState(state);
  assert.strictEqual(payload.vendor, 'stramatel');
  assert.strictEqual(payload.sport, 'basketball');
});

test('buildMatchState reflects score/foul/timeout updates', () => {
  let state = createInitialState();
  state = applyEvent(state, { type: 'tipoff' });
  state = applyEvent(state, { type: 'score', team: 'guest', points: 2 });
  state = applyEvent(state, { type: 'foul', team: 'home', playerLine: 4 });
  state = applyEvent(state, { type: 'timeout-start', team: 'guest' });

  const payload = buildMatchState(state);
  assert.strictEqual(payload.guestScore, 2);
  assert.strictEqual(payload.homeScore, 0);
  assert.strictEqual(payload.homeTeamFouls, 1);
  assert.strictEqual(payload.timeoutActive, 'guest');
  assert.strictEqual(payload.timeoutRemainingMs, 60_000);
});

test('buildMatchState rounds chronoMs + shotClockMs to integers', () => {
  const state = { ...createInitialState(), chronoMs: 599_999.7, shotClockMs: 23_456.3 };
  const payload = buildMatchState(state);
  assert.strictEqual(Number.isInteger(payload.chronoMs), true);
  assert.strictEqual(Number.isInteger(payload.shotClockMs), true);
});

test('buildMatchState emits timeoutActive=null (not undefined)', () => {
  const state = createInitialState();
  const payload = buildMatchState(state);
  assert.strictEqual(payload.timeoutActive, null);
});
