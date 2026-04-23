'use strict';

// Mirror of sim-bodet-scorepad basket-demo so both simulators can be A/B compared.
// Timestamps in simulated match-time ms (real wall time depends on --time-scale).
function buildScenario() {
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
    // Force chrono into last minute so § 1.4.1 encoding kicks in.
    { at: 45_000, event: { type: 'chrono-set', remainingMs: 55_000 } },
    { at: 60_000, event: { type: 'period-end' } },
  ];
}

module.exports = { buildScenario };
