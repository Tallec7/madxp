#!/usr/bin/env node
'use strict';

const net = require('net');
const { createEmitter, DEFAULT_RATE_HZ } = require('./emitter');
const { buildScenario } = require('./scenarios/basket-demo');

function parseArgs(argv) {
  const opts = {
    host: '127.0.0.1',
    port: 5000,
    scenario: 'basket-demo',
    rateHz: DEFAULT_RATE_HZ,
    timeScale: 1,
    verbose: false,
    transport: 'tcp-server',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') opts.host = argv[++i];
    else if (a === '--port') opts.port = parseInt(argv[++i], 10);
    else if (a === '--scenario') opts.scenario = argv[++i];
    else if (a === '--rate-hz') opts.rateHz = parseFloat(argv[++i]);
    else if (a === '--time-scale') opts.timeScale = parseFloat(argv[++i]);
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--transport') opts.transport = argv[++i];
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`sim-stramatel — simulateur console Stramatel basketball FIBA

Usage:
  node src/index.js [options]

Options:
  --host <ip>            Adresse d'écoute TCP (default: 127.0.0.1)
  --port <port>          Port TCP d'écoute (default: 5000)
  --scenario <name>      Scénario à jouer (default: basket-demo)
  --rate-hz <n>          Fréquence d'émission des trames 0x33 (default: 10)
  --time-scale <x>       Accélération du temps simulé (default: 1)
  --transport <kind>     tcp-server (default) — émule un Serial-to-Ethernet bridge
  --verbose, -v          Hex dump d'une trame par seconde
  --help, -h             Cette aide
`);
}

function loadScenario(name) {
  if (name === 'basket-demo') return buildScenario();
  throw new Error(`Unknown scenario: ${name}`);
}

function createTcpServerTransport(opts) {
  const clients = new Set();
  const server = net.createServer((socket) => {
    clients.add(socket);
    console.log(`[sim] client connected ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on('close', () => {
      clients.delete(socket);
      console.log('[sim] client disconnected');
    });
    socket.on('error', (err) => {
      console.log(`[sim] client socket error: ${err.message}`);
    });
  });
  server.listen(opts.port, opts.host, () => {
    console.log(`[sim] TCP server listening on ${opts.host}:${opts.port}`);
  });
  return {
    write: (buf) => {
      for (const s of clients) {
        if (!s.destroyed) s.write(buf);
      }
    },
    stop: () => {
      for (const s of clients) s.destroy();
      clients.clear();
      server.close();
    },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.transport !== 'tcp-server') {
    console.error(`Unsupported transport: ${opts.transport}`);
    process.exit(2);
  }
  const scenario = loadScenario(opts.scenario);
  const transport = createTcpServerTransport(opts);

  const verboseEveryN = Math.max(1, Math.round(opts.rateHz)); // ≈ 1 dump / seconde

  const emitter = createEmitter({
    scenario,
    verbose: opts.verbose,
    rateHz: opts.rateHz,
    verboseEveryN,
    onFrame: (buf) => transport.write(buf),
  });

  emitter.start({ timeScale: opts.timeScale });

  const shutdown = () => {
    console.log('\n[sim] shutting down');
    emitter.stop();
    transport.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
