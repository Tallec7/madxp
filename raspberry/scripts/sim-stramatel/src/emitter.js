'use strict';

const { buildFrame0x33 } = require('./frame-0x33');
const { createInitialState, applyEvent, tickChrono } = require('./match-state');

// SPEC § 1.1 — ~10 Hz non mesuré, jitter réel absent.
const DEFAULT_RATE_HZ = 10;

function createEmitter({ scenario, onFrame, onFrameTyped, verbose = false, rateHz = DEFAULT_RATE_HZ, verboseEveryN = 10 } = {}) {
  let state = createInitialState();
  let scenarioEvents = scenario ? [...scenario] : [];
  let simElapsedMs = 0;
  let lastTickWallMs = Date.now();
  let frameCount = 0;

  function consumeDueEvents() {
    while (scenarioEvents.length > 0 && scenarioEvents[0].at <= simElapsedMs) {
      const { event } = scenarioEvents.shift();
      if (event.type === 'chrono-set') {
        state = { ...state, chronoMs: event.remainingMs };
      } else {
        state = applyEvent(state, event);
      }
      if (verbose) {
        console.log(`[event @${simElapsedMs}ms] ${JSON.stringify(event)}`);
      }
    }
  }

  function emitFrame() {
    const buf = buildFrame0x33(state);
    onFrame(buf);
    if (onFrameTyped) onFrameTyped(buf);
    frameCount += 1;
    if (verbose && frameCount % verboseEveryN === 0) {
      dumpFrame(buf);
    }
  }

  const intervalMs = Math.max(1, Math.round(1000 / rateHz));

  const tick = () => {
    const now = Date.now();
    const deltaWall = now - lastTickWallMs;
    lastTickWallMs = now;
    const simDelta = deltaWall * (tick.timeScale || 1);
    simElapsedMs += simDelta;
    state = tickChrono(state, simDelta);
    consumeDueEvents();
    emitFrame();
  };
  tick.timeScale = 1;

  let timerHandle = null;
  function start({ timeScale = 1 } = {}) {
    tick.timeScale = timeScale;
    lastTickWallMs = Date.now();
    timerHandle = setInterval(tick, intervalMs);
  }
  function stop() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  function injectEvent(event) {
    if (event.type === 'chrono-set') {
      state = { ...state, chronoMs: event.remainingMs };
    } else {
      state = applyEvent(state, event);
    }
    if (verbose) {
      console.log(`[event manual] ${JSON.stringify(event)}`);
    }
  }

  return {
    start,
    stop,
    injectEvent,
    getState: () => state,
  };
}

function dumpFrame(buf) {
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  0x33 [${buf.length}B] ${hex}`);
}

module.exports = { createEmitter, DEFAULT_RATE_HZ };
