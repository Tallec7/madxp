'use strict';

// Scripted demo scenario compressed to ~60s with --time-scale 10.
// Timestamps are in simulated match-time ms (real wall time depends on --time-scale).
function buildScenario() {
  const periodStartOffset = 9 * 60 * 1000; // 9min elapsed = 1:00 remaining on the chrono at T+50s scene
  return [
    { at: 0, event: { type: 'tipoff' } },
    { at: 3_000, event: { type: 'score', team: 'home', points: 2 } },
    { at: 7_000, event: { type: 'score', team: 'guest', points: 3 } },
    { at: 12_000, event: { type: 'foul', team: 'home', playerLine: 4 } },
    { at: 14_000, event: { type: 'foul', team: 'home', playerLine: 7 } },
    { at: 16_000, event: { type: 'foul', team: 'home', playerLine: 4 } },
    { at: 18_000, event: { type: 'foul', team: 'home', playerLine: 11 } },
    { at: 20_000, event: { type: 'foul', team: 'home', playerLine: 4 } }, // 5th team foul → bonus
    { at: 30_000, event: { type: 'timeout-start', team: 'guest' } },
    { at: 35_000, event: { type: 'timeout-end' } },
    { at: 35_100, event: { type: 'clock-start' } },
    // Jump chrono into last minute so msg 36 kicks in.
    { at: 45_000, event: { type: 'chrono-set', remainingMs: 55_000 }, _periodStartOffset: periodStartOffset },
    { at: 60_000, event: { type: 'period-end' } },
  ];
}

module.exports = { buildScenario };
