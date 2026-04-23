'use strict';

const PERIOD_DURATION_MS = 10 * 60 * 1000;
const SHOT_CLOCK_MS = 24 * 1000;
const TIMEOUT_DURATION_MS = 60 * 1000;

function createInitialState({ homeTimeouts = 3, guestTimeouts = 3 } = {}) {
  return {
    period: 1,
    chronoMs: PERIOD_DURATION_MS,
    clockRunning: false,
    homeScore: 0,
    guestScore: 0,
    homeTeamFouls: 0,
    guestTeamFouls: 0,
    homeTimeoutsLeft: homeTimeouts,
    guestTimeoutsLeft: guestTimeouts,
    // 12 players per team, index 0..11 → physical line 1..12.
    homePlayerFouls: new Array(12).fill(0),
    guestPlayerFouls: new Array(12).fill(0),
    shotClockMs: SHOT_CLOCK_MS,
    shotClockRunning: false,
    // Timeout in progress.
    timeoutActive: null, // null | 'home' | 'guest'
    timeoutRemainingMs: 0,
  };
}

function applyEvent(state, event) {
  const next = {
    ...state,
    homePlayerFouls: [...state.homePlayerFouls],
    guestPlayerFouls: [...state.guestPlayerFouls],
  };
  switch (event.type) {
    case 'tipoff':
      next.clockRunning = true;
      next.shotClockRunning = true;
      break;
    case 'score':
      if (event.team === 'home') next.homeScore += event.points;
      else next.guestScore += event.points;
      next.shotClockMs = SHOT_CLOCK_MS;
      break;
    case 'foul': {
      const key = event.team === 'home' ? 'homePlayerFouls' : 'guestPlayerFouls';
      const line = event.playerLine - 1;
      next[key][line] = (next[key][line] || 0) + 1;
      if (event.team === 'home') next.homeTeamFouls += 1;
      else next.guestTeamFouls += 1;
      break;
    }
    case 'timeout-start':
      next.timeoutActive = event.team;
      next.timeoutRemainingMs = TIMEOUT_DURATION_MS;
      next.clockRunning = false;
      if (event.team === 'home') next.homeTimeoutsLeft = Math.max(0, next.homeTimeoutsLeft - 1);
      else next.guestTimeoutsLeft = Math.max(0, next.guestTimeoutsLeft - 1);
      break;
    case 'timeout-end':
      next.timeoutActive = null;
      next.timeoutRemainingMs = 0;
      break;
    case 'period-end':
      next.period += 1;
      next.chronoMs = PERIOD_DURATION_MS;
      next.clockRunning = false;
      next.homeTeamFouls = 0;
      next.guestTeamFouls = 0;
      break;
    case 'clock-stop':
      next.clockRunning = false;
      next.shotClockRunning = false;
      break;
    case 'clock-start':
      next.clockRunning = true;
      next.shotClockRunning = true;
      break;
    default:
      break;
  }
  return next;
}

function tickChrono(state, deltaMs) {
  const next = { ...state };
  if (next.clockRunning) {
    next.chronoMs = Math.max(0, next.chronoMs - deltaMs);
  }
  if (next.shotClockRunning) {
    next.shotClockMs = Math.max(0, next.shotClockMs - deltaMs);
  }
  if (next.timeoutActive) {
    next.timeoutRemainingMs = Math.max(0, next.timeoutRemainingMs - deltaMs);
    if (next.timeoutRemainingMs === 0) {
      next.timeoutActive = null;
    }
  }
  return next;
}

module.exports = {
  createInitialState,
  applyEvent,
  tickChrono,
  PERIOD_DURATION_MS,
  SHOT_CLOCK_MS,
  TIMEOUT_DURATION_MS,
};
