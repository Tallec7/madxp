/**
 * hostapd-telemetry.js — ADR-072 OTA-2
 *
 * Attach à `hostapd_cli -i wlan0` en mode event-stream et relaie les événements
 * auth/deauth vers le central server. Objectif : diagnostiquer à distance les
 * prochains incidents hotspot (client rejeté, PSK mismatch, association ratée)
 * sans avoir besoin d'un accès SSH au Pi.
 *
 * Événements capturés :
 *   - AP-STA-CONNECTED <mac>
 *   - AP-STA-DISCONNECTED <mac>
 *   - AP-STA-POSSIBLE-PSK-MISMATCH <mac>
 *   - CTRL-EVENT-EAP-FAILURE <mac>
 *
 * Émission : `hostapd_event` via Socket.IO → handleHostapdEvent côté central.
 */

const { spawn } = require('child_process');
const logger = require('../logger');

const HOSTAPD_CLI_PATH = '/usr/sbin/hostapd_cli';
const INTERFACE = 'wlan0';
const RESPAWN_DELAY_MS = 5000;
const EVENT_REGEX = /(AP-STA-CONNECTED|AP-STA-DISCONNECTED|AP-STA-POSSIBLE-PSK-MISMATCH|CTRL-EVENT-EAP-FAILURE)\s+([0-9a-fA-F:]{17})/;

let child = null;
let socketRef = null;
let stopped = true;
let respawnTimer = null;

function setSocketRef(socket) {
  socketRef = socket;
}

function _spawn() {
  if (stopped) return;

  try {
    child = spawn('sudo', [HOSTAPD_CLI_PATH, '-i', INTERFACE], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    logger.warn('hostapd-telemetry: spawn failed', { error: err.message });
    _scheduleRespawn();
    return;
  }

  logger.info('hostapd-telemetry: attached to hostapd_cli', { iface: INTERFACE, pid: child.pid });

  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      _handleLine(line);
    }
  });

  child.stderr.on('data', (chunk) => {
    const msg = chunk.toString('utf8').trim();
    if (msg) logger.debug('hostapd-telemetry stderr', { msg });
  });

  child.on('exit', (code, signal) => {
    logger.warn('hostapd-telemetry: hostapd_cli exited', { code, signal });
    child = null;
    _scheduleRespawn();
  });

  child.on('error', (err) => {
    logger.warn('hostapd-telemetry: child error', { error: err.message });
  });
}

function _scheduleRespawn() {
  if (stopped) return;
  if (respawnTimer) return;
  respawnTimer = setTimeout(() => {
    respawnTimer = null;
    _spawn();
  }, RESPAWN_DELAY_MS);
}

function _handleLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  const match = line.match(EVENT_REGEX);
  if (!match) return;

  const [, eventType, clientMac] = match;
  const payload = {
    eventType,
    clientMac: clientMac.toLowerCase(),
    timestamp: new Date().toISOString(),
    rawLine: line.slice(0, 256),
  };

  logger.info('hostapd-telemetry: event', payload);

  if (socketRef && socketRef.connected) {
    try {
      socketRef.emit('hostapd_event', payload);
    } catch (err) {
      logger.warn('hostapd-telemetry: emit failed', { error: err.message });
    }
  }
}

function start() {
  if (!stopped) return;
  stopped = false;
  _spawn();
}

function stop() {
  stopped = true;
  if (respawnTimer) {
    clearTimeout(respawnTimer);
    respawnTimer = null;
  }
  if (child) {
    try { child.kill('SIGTERM'); } catch (_e) { /* ignore */ }
    child = null;
  }
}

module.exports = { setSocketRef, start, stop };
