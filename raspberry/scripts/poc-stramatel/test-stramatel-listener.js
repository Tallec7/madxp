#!/usr/bin/env node
/**
 * POC Stramatel Listener — lecture brute d'une table de marque Stramatel via RS-485.
 *
 * Usage:
 *   node test-stramatel-listener.js                       # /dev/serial0 par défaut
 *   node test-stramatel-listener.js --port /dev/ttyUSB0   # port custom
 *   node test-stramatel-listener.js --tcp 192.168.1.50:4001  # via convertisseur Serial-to-Ethernet
 *   node test-stramatel-listener.js --raw                 # dump hexa brut (debug)
 *
 * Protocole Stramatel (cf. PROP-003) :
 *   - Binaire, 54 octets par trame, ~10 Hz
 *   - 19200 bps, 8N1
 *   - Octet 0 = 0xF8 (début)
 *   - Octet 1 = type message (0x33, 0x37, 0x38)
 *   - Octets 2-47 = données (score, chrono, période, fautes, timeouts, shot clock)
 *
 * Ce script est volontairement standalone :
 *   - pas de dépendance au sync-agent, au serveur Socket.IO ou à l'orchestrateur
 *   - peut tourner sur un Pi, un Pi Zero, un laptop Linux avec un convertisseur USB-RS485
 *   - peut aussi parler à un Serial-to-Ethernet (Waveshare RS485 TO ETH, USR-TCP232, etc.)
 *
 * Objectif POC : valider en < 1h la capacité à lire et décoder une trame Stramatel
 * depuis une vraie console, avec mesure de latence et détection d'erreurs.
 *
 * Installation :
 *   cd raspberry/scripts/poc-stramatel
 *   npm install
 *   node test-stramatel-listener.js
 */

'use strict';

const net = require('net');

// ----- Parsing des arguments -----

const args = process.argv.slice(2);
const options = {
  port: '/dev/serial0',
  baudRate: 19200,
  tcpHost: null,
  tcpPort: null,
  raw: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' || arg === '-p') {
    options.port = args[++i];
  } else if (arg === '--baud' || arg === '-b') {
    options.baudRate = parseInt(args[++i], 10);
  } else if (arg === '--tcp') {
    const [host, port] = args[++i].split(':');
    options.tcpHost = host;
    options.tcpPort = parseInt(port, 10);
  } else if (arg === '--raw') {
    options.raw = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 30).map(l => l.replace(/^ \* ?/, '')).join('\n'));
    process.exit(0);
  }
}

// ----- Constantes protocole -----

const FRAME_START = 0xf8;
const FRAME_LENGTH = 54;
const BUFFER_MAX = 1024;

// ----- Décodeur -----

/**
 * Décode une trame Stramatel de 54 octets.
 * Mapping basé sur PROP-003 et le projet open-source Panel2Net.
 * Les champs ASCII sont encodés avec les codes 0x30-0x39 ('0' à '9').
 */
function decodeStramatelFrame(buf) {
  if (buf.length !== FRAME_LENGTH) {
    throw new Error(`Frame length mismatch: expected ${FRAME_LENGTH}, got ${buf.length}`);
  }
  if (buf[0] !== FRAME_START) {
    throw new Error(`Invalid start byte: 0x${buf[0].toString(16).padStart(2, '0')}`);
  }

  const readAscii = (start, len) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = buf[start + i];
      // On accepte 0x20 (espace) comme placeholder si la console envoie des champs vides
      if (c >= 0x30 && c <= 0x39) s += String.fromCharCode(c);
      else if (c === 0x20) s += ' ';
      else s += '?';
    }
    return s;
  };

  return {
    startByte: buf[0],
    messageType: buf[1],
    gameMinutes: readAscii(2, 2),
    gameSeconds: readAscii(4, 2),
    homeScore: parseInt(readAscii(6, 3).replace(/\s/g, '0'), 10),
    awayScore: parseInt(readAscii(9, 3).replace(/\s/g, '0'), 10),
    period: buf[12],
    homeFouls: buf[13],
    awayFouls: buf[14],
    homeTimeouts: buf[15],
    awayTimeouts: buf[16],
    matchStopped: buf[18] === 1,
    timeoutActive: buf[19] !== 0,
    timeoutDuration: readAscii(44, 2),
    shotClock: readAscii(46, 2),
  };
}

// ----- État du parser -----

const state = {
  buffer: Buffer.alloc(0),
  frameCount: 0,
  errorCount: 0,
  startedAt: Date.now(),
  lastFrameAt: null,
  lastFrame: null,
  previousFrame: null,
};

/**
 * Reçoit un chunk brut et essaie d'en extraire toutes les trames valides.
 * Garde en mémoire les octets partiels pour les coller au prochain chunk.
 */
function ingest(chunk) {
  state.buffer = Buffer.concat([state.buffer, chunk]);

  if (state.buffer.length > BUFFER_MAX) {
    // Protection anti-runaway : si on accumule plus de 1KB sans trame valide,
    // on resync sur le prochain 0xF8 trouvé.
    const idx = state.buffer.indexOf(FRAME_START);
    state.buffer = idx >= 0 ? state.buffer.slice(idx) : Buffer.alloc(0);
  }

  if (options.raw) {
    console.log(`[RAW] ${chunk.toString('hex').match(/.{1,2}/g).join(' ')}`);
  }

  // On lit tant qu'on a au moins une trame complète
  while (state.buffer.length >= FRAME_LENGTH) {
    if (state.buffer[0] !== FRAME_START) {
      // Resync : skip un octet et retry
      state.buffer = state.buffer.slice(1);
      continue;
    }

    const frameBytes = state.buffer.slice(0, FRAME_LENGTH);
    try {
      const decoded = decodeStramatelFrame(frameBytes);
      state.previousFrame = state.lastFrame;
      state.lastFrame = decoded;
      state.lastFrameAt = Date.now();
      state.frameCount++;
      onFrame(decoded);
    } catch (err) {
      state.errorCount++;
      console.error(`[ERR] ${err.message}`);
    }
    state.buffer = state.buffer.slice(FRAME_LENGTH);
  }
}

// ----- Affichage -----

function onFrame(f) {
  // Affichage concis d'une trame
  const scoreChanged = state.previousFrame &&
    (state.previousFrame.homeScore !== f.homeScore || state.previousFrame.awayScore !== f.awayScore);
  const marker = scoreChanged ? '⚡ SCORE' : '      ';
  const timeoutTag = f.timeoutActive ? ' ⏸ TO' : '';
  const stoppedTag = f.matchStopped ? ' ⏹ STOP' : '';

  console.log(
    `${marker} [${f.gameMinutes}:${f.gameSeconds}] ` +
    `P${f.period}  ${f.homeScore} - ${f.awayScore}  ` +
    `fautes ${f.homeFouls}/${f.awayFouls}  ` +
    `TO ${f.homeTimeouts}/${f.awayTimeouts}  ` +
    `24s ${f.shotClock}${timeoutTag}${stoppedTag}  ` +
    `[type 0x${f.messageType.toString(16)}]`
  );
}

function printStats() {
  const elapsedSec = (Date.now() - state.startedAt) / 1000;
  const hz = state.frameCount / elapsedSec;
  const errRate = state.errorCount / (state.frameCount + state.errorCount || 1);
  console.log(
    `\n[STATS] ${state.frameCount} trames / ${elapsedSec.toFixed(1)}s ` +
    `= ${hz.toFixed(1)} Hz, erreurs ${state.errorCount} (${(errRate * 100).toFixed(1)}%)`
  );
}

// ----- Transports -----

function startSerialTransport() {
  let SerialPort;
  try {
    ({ SerialPort } = require('serialport'));
  } catch (err) {
    console.error(
      '[FATAL] serialport not installed. Run:\n' +
      '  cd raspberry/scripts/poc-stramatel && npm install'
    );
    process.exit(1);
  }

  console.log(`[INIT] Opening ${options.port} @ ${options.baudRate} 8N1`);
  const port = new SerialPort({
    path: options.port,
    baudRate: options.baudRate,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    autoOpen: false,
  });

  port.on('open', () => {
    console.log(`[OPEN] Listening on ${options.port}`);
  });
  port.on('data', ingest);
  port.on('error', (err) => {
    console.error(`[SERIAL ERROR] ${err.message}`);
  });
  port.on('close', () => {
    console.log('[CLOSE] Serial port closed');
  });

  port.open((err) => {
    if (err) {
      console.error(`[FATAL] Cannot open ${options.port}: ${err.message}`);
      console.error('  Check: interface UART activée, user dans group dialout, device existe');
      process.exit(1);
    }
  });

  return () => port.close();
}

function startTcpTransport() {
  console.log(`[INIT] Connecting to ${options.tcpHost}:${options.tcpPort}`);
  const client = new net.Socket();

  client.connect(options.tcpPort, options.tcpHost, () => {
    console.log(`[CONNECT] TCP stream established`);
  });
  client.on('data', ingest);
  client.on('error', (err) => {
    console.error(`[TCP ERROR] ${err.message}`);
  });
  client.on('close', () => {
    console.log('[CLOSE] TCP connection closed');
    process.exit(0);
  });

  return () => client.destroy();
}

// ----- Main -----

function main() {
  console.log('=== Stramatel POC Listener ===');
  console.log(`Protocol: binary, 54 bytes, start=0xF8, ~10Hz`);
  console.log(`Mode: ${options.raw ? 'RAW dump' : 'decoded'}`);

  const cleanup = options.tcpHost ? startTcpTransport() : startSerialTransport();

  // Stats toutes les 10 secondes
  const statsTimer = setInterval(printStats, 10000);

  // Arrêt propre
  const shutdown = () => {
    console.log('\n[SHUTDOWN] Stopping...');
    clearInterval(statsTimer);
    printStats();
    cleanup();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
