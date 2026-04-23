#!/usr/bin/env node
'use strict';

const net = require('net');
const { createEmitter } = require('./emitter');
const { buildScenario } = require('./scenarios/basket-demo');
const { startRepl } = require('./repl');
const { createWebUi } = require('./web-ui');

function parseArgs(argv) {
  const opts = {
    host: '127.0.0.1',
    port: 4001,
    scenario: 'basket-demo',
    rate: 200,
    timeScale: 1,
    verbose: false,
    repl: false,
    web: false,
    webHost: '127.0.0.1',
    webPort: 4100,
    noTcp: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') opts.host = argv[++i];
    else if (a === '--port') opts.port = parseInt(argv[++i], 10);
    else if (a === '--scenario') opts.scenario = argv[++i];
    else if (a === '--no-scenario') opts.scenario = 'none';
    else if (a === '--rate') opts.rate = parseInt(argv[++i], 10);
    else if (a === '--time-scale') opts.timeScale = parseFloat(argv[++i]);
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--repl') opts.repl = true;
    else if (a === '--web') opts.web = true;
    else if (a === '--web-host') opts.webHost = argv[++i];
    else if (a === '--web-port') opts.webPort = parseInt(argv[++i], 10);
    else if (a === '--no-tcp') opts.noTcp = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`sim-bodet-scorepad — simulateur Bodet Scorepad basketball FIBA

Usage:
  node src/index.js [options]

Options:
  --host <ip>            IP du serveur cible (default: 127.0.0.1)
  --port <port>          Port TCP cible (default: 4001)
  --scenario <name>      Scénario à jouer (default: basket-demo)
  --no-scenario          Démarre sans scénario (état vierge, pour --repl)
  --rate <ms>            Intervalle entre rondes d'émission (default: 200)
  --time-scale <x>       Accélération du temps simulé (default: 1)
  --verbose, -v          Active le hex dump des trames émises
  --repl                 Mode interactif clavier (voir README § REPL)
  --web                  Démarre l'UI web (http://127.0.0.1:4100)
  --web-host <ip>        Host d'écoute UI (default: 127.0.0.1)
  --web-port <port>      Port d'écoute UI (default: 4100)
  --no-tcp               Désactive le client TCP sortant (UI-only, pas d'ECONNREFUSED)
  --help, -h             Affiche cette aide
`);
}

function loadScenario(name) {
  if (name === 'none') return [];
  if (name === 'basket-demo') return buildScenario();
  throw new Error(`Unknown scenario: ${name}`);
}

function connectWithRetry(opts, onSocket) {
  let socket;
  let stopped = false;
  const tryConnect = () => {
    if (stopped) return;
    socket = net.connect(opts.port, opts.host);
    socket.on('connect', () => {
      console.log(`[sim] connected to ${opts.host}:${opts.port}`);
      onSocket(socket);
    });
    socket.on('error', (err) => {
      console.log(`[sim] socket error: ${err.message}`);
    });
    socket.on('close', () => {
      if (stopped) return;
      console.log('[sim] connection closed, retry in 2s');
      setTimeout(tryConnect, 2000);
    });
  };
  tryConnect();
  return {
    stop: () => {
      stopped = true;
      if (socket) socket.destroy();
    },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scenario = loadScenario(opts.scenario);
  let currentSocket = null;

  let webUi = null;
  const emitter = createEmitter({
    scenario,
    verbose: opts.verbose,
    roundIntervalMs: opts.rate,
    onFrame: (buf) => {
      if (currentSocket && !currentSocket.destroyed) {
        currentSocket.write(buf);
      }
    },
    onFrameTyped: (id, buf) => {
      if (webUi) webUi.recordFrame(id, buf);
    },
  });

  const controller = opts.noTcp
    ? { stop: () => {} }
    : connectWithRetry(opts, (sock) => {
        currentSocket = sock;
      });

  emitter.start({ timeScale: opts.timeScale });

  const shutdown = () => {
    console.log('\n[sim] shutting down');
    emitter.stop();
    controller.stop();
    if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (opts.web) {
    webUi = createWebUi({ emitter, host: opts.webHost, port: opts.webPort });
  }

  if (opts.repl) {
    startRepl({ emitter, onQuit: shutdown });
  }
}

main();
