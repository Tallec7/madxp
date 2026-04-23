'use strict';

const { frame } = require('./framing');
const {
  buildMsg18,
  buildMsg19,
  buildMsg30,
  buildMsg31,
  buildMsg36,
  buildMsg50,
  buildMsg60,
} = require('./messages-basket');
const { createInitialState, applyEvent, tickChrono } = require('./match-state');

function createEmitter({ scenario, onFrame, verbose = false, roundIntervalMs = 200 } = {}) {
  let state = createInitialState();
  let scenarioEvents = scenario ? [...scenario] : [];
  let simElapsedMs = 0;
  let lastTickWallMs = Date.now();

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

  function emitRound() {
    const messages = [
      { id: '18', buf: buildMsg18(state) },
      { id: '30', buf: buildMsg30(state) },
      { id: '31', buf: buildMsg31(state) },
      { id: '50', buf: buildMsg50(state) },
      { id: '60', buf: buildMsg60(state) },
    ];
    if (state.chronoMs < 60_000 && state.clockRunning) {
      messages.push({ id: '36', buf: buildMsg36(state) });
    }
    if (state.timeoutActive) {
      messages.push({ id: '19', buf: buildMsg19(state) });
    }
    for (const { id, buf } of messages) {
      const framed = frame(buf);
      onFrame(framed, id);
      if (verbose) {
        dumpFrame(id, framed);
      }
    }
  }

  const tick = () => {
    const now = Date.now();
    const deltaWall = now - lastTickWallMs;
    lastTickWallMs = now;
    const simDelta = deltaWall * (tick.timeScale || 1);
    simElapsedMs += simDelta;
    state = tickChrono(state, simDelta);
    consumeDueEvents();
    emitRound();
  };
  tick.timeScale = 1;

  let timerHandle = null;
  function start({ timeScale = 1 } = {}) {
    tick.timeScale = timeScale;
    lastTickWallMs = Date.now();
    timerHandle = setInterval(tick, roundIntervalMs);
  }
  function stop() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  return {
    start,
    stop,
    getState: () => state,
  };
}

function dumpFrame(id, buf) {
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  msg ${id} [${buf.length}B] ${hex}`);
}

module.exports = { createEmitter };
