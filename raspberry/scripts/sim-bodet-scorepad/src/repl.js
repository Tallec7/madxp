'use strict';

const readline = require('readline');

const HELP = `
─────────────── REPL Bodet Scorepad (basket) ───────────────
  Score     1/2/3  home +1/+2/+3     7/8/9  guest +1/+2/+3
  Faute     f  home (joueur 4)       F  guest (joueur 4)
  Timeout   t  home                  T  guest              e  fin timeout
  Chrono    SPACE  play/pause        p  fin de période
  Shot      o  reset 24s             i  reset 14s
  Divers    r  tip-off               s  status              ? aide
  Quitter   x  ou Ctrl-C
─────────────────────────────────────────────────────────────
`;

function formatChrono(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function printStatus(state) {
  const chrono = formatChrono(state.chronoMs);
  const shot = Math.max(0, Math.ceil(state.shotClockMs / 1000));
  const clock = state.clockRunning ? '▶' : '⏸';
  const to = state.timeoutActive ? ` TO-${state.timeoutActive}(${Math.ceil(state.timeoutRemainingMs / 1000)}s)` : '';
  const bonus = `${state.homeBonus ? 'H-BONUS ' : ''}${state.guestBonus ? 'G-BONUS' : ''}`.trim();
  console.log(
    `[P${state.period}] ${clock} ${chrono} | H ${state.homeScore}-${state.guestScore} G | fautes H${state.homeTeamFouls}/G${state.guestTeamFouls} | shot ${shot}s | TO H${state.homeTimeoutsLeft}/G${state.guestTimeoutsLeft}${to}${bonus ? ' | ' + bonus : ''}`
  );
}

function startRepl({ emitter, onQuit }) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  console.log(HELP);
  printStatus(emitter.getState());

  const inject = (event) => {
    emitter.injectEvent(event);
    printStatus(emitter.getState());
  };

  process.stdin.on('keypress', (_str, key) => {
    if (!key) return;
    if (key.ctrl && key.name === 'c') return onQuit();
    const k = key.sequence;
    switch (k) {
      case '1': return inject({ type: 'score', team: 'home', points: 1 });
      case '2': return inject({ type: 'score', team: 'home', points: 2 });
      case '3': return inject({ type: 'score', team: 'home', points: 3 });
      case '7': return inject({ type: 'score', team: 'guest', points: 1 });
      case '8': return inject({ type: 'score', team: 'guest', points: 2 });
      case '9': return inject({ type: 'score', team: 'guest', points: 3 });
      case 'f': return inject({ type: 'foul', team: 'home', playerLine: 4 });
      case 'F': return inject({ type: 'foul', team: 'guest', playerLine: 4 });
      case 't': return inject({ type: 'timeout-start', team: 'home' });
      case 'T': return inject({ type: 'timeout-start', team: 'guest' });
      case 'e': return inject({ type: 'timeout-end' });
      case 'p': return inject({ type: 'period-end' });
      case 'r': return inject({ type: 'tipoff' });
      case 'o': emitter.getState().shotClockMs = 24000; return printStatus(emitter.getState());
      case 'i': emitter.getState().shotClockMs = 14000; return printStatus(emitter.getState());
      case ' ':
        return inject({ type: emitter.getState().clockRunning ? 'clock-stop' : 'clock-start' });
      case 's': return printStatus(emitter.getState());
      case '?':
      case 'h': return console.log(HELP);
      case 'x': return onQuit();
      default: break;
    }
  });
}

module.exports = { startRepl, printStatus };
