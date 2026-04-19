/**
 * hostapd-telemetry.js — ADR-072 OTA-2 / ADR-073 F7
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
 *
 * ADR-073 F7 — buffer offline : quand le socket central est déconnecté,
 * les événements sont persistés dans `/home/pi/neopro/data/hostapd-events-buffer.jsonl`
 * (cap à 1000 événements rolling). Au retour du socket, le buffer est flush
 * dans l'ordre FIFO avec un throttle de 50ms entre émissions.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const HOSTAPD_CLI_PATH = '/usr/sbin/hostapd_cli';
const INTERFACE = 'wlan0';
const RESPAWN_DELAY_MS = 5000;
const EVENT_REGEX = /(AP-STA-CONNECTED|AP-STA-DISCONNECTED|AP-STA-POSSIBLE-PSK-MISMATCH|CTRL-EVENT-EAP-FAILURE)\s+([0-9a-fA-F:]{17})/;

// ADR-073 F7 — buffer offline
const BUFFER_PATH = path.join(process.env.HOME || '/home/pi', 'neopro', 'data', 'hostapd-events-buffer.jsonl');
const BUFFER_MAX_EVENTS = 1000;
const FLUSH_THROTTLE_MS = 50;
let flushInProgress = false;

let child = null;
let socketRef = null;
let stopped = true;
let respawnTimer = null;

function setSocketRef(socket) {
  const wasDisconnected = !socketRef || !socketRef.connected;
  socketRef = socket;
  // Nouveau socket connecté → tenter de flush le buffer
  if (socket && socket.connected && wasDisconnected) {
    _flushBuffer().catch((err) => {
      logger.warn('hostapd-telemetry: flush buffer failed', { error: err.message });
    });
  }
}

function _appendToBuffer(payload) {
  try {
    const dir = path.dirname(BUFFER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Rolling cap : si le buffer dépasse BUFFER_MAX_EVENTS, on drop les plus anciens
    if (fs.existsSync(BUFFER_PATH)) {
      const stats = fs.statSync(BUFFER_PATH);
      // Approximation : chaque ligne ~150 bytes → cap ≈ 150KB
      if (stats.size > BUFFER_MAX_EVENTS * 150) {
        const lines = fs.readFileSync(BUFFER_PATH, 'utf8').split('\n').filter(Boolean);
        const kept = lines.slice(-BUFFER_MAX_EVENTS + 1);
        fs.writeFileSync(BUFFER_PATH, kept.join('\n') + '\n');
      }
    }
    fs.appendFileSync(BUFFER_PATH, JSON.stringify(payload) + '\n');
  } catch (err) {
    logger.warn('hostapd-telemetry: buffer write failed', { error: err.message });
  }
}

async function _flushBuffer() {
  if (flushInProgress) return;
  if (!socketRef || !socketRef.connected) return;
  if (!fs.existsSync(BUFFER_PATH)) return;

  flushInProgress = true;
  try {
    const content = fs.readFileSync(BUFFER_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length === 0) {
      flushInProgress = false;
      return;
    }

    logger.info('hostapd-telemetry: flushing buffered events', { count: lines.length });
    let flushed = 0;
    const remaining = [];

    for (const line of lines) {
      if (!socketRef || !socketRef.connected) {
        remaining.push(line);
        continue;
      }
      try {
        const payload = JSON.parse(line);
        payload.buffered = true;
        socketRef.emit('hostapd_event', payload);
        flushed++;
        await new Promise((resolve) => setTimeout(resolve, FLUSH_THROTTLE_MS));
      } catch {
        // Ligne corrompue → skip
      }
    }

    if (remaining.length > 0) {
      fs.writeFileSync(BUFFER_PATH, remaining.join('\n') + '\n');
    } else {
      fs.unlinkSync(BUFFER_PATH);
    }
    logger.info('hostapd-telemetry: buffer flush complete', { flushed, remaining: remaining.length });
  } catch (err) {
    logger.warn('hostapd-telemetry: flush error', { error: err.message });
  } finally {
    flushInProgress = false;
  }
}

function getBufferStatus() {
  try {
    if (!fs.existsSync(BUFFER_PATH)) return { count: 0, sizeBytes: 0 };
    const stats = fs.statSync(BUFFER_PATH);
    const lines = fs.readFileSync(BUFFER_PATH, 'utf8').split('\n').filter(Boolean);
    return { count: lines.length, sizeBytes: stats.size };
  } catch {
    return { count: 0, sizeBytes: 0 };
  }
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

  // ADR-073 F7 — si socket déconnecté OU emit échoue → buffer offline
  if (socketRef && socketRef.connected) {
    try {
      socketRef.emit('hostapd_event', payload);
      return;
    } catch (err) {
      logger.warn('hostapd-telemetry: emit failed, buffering', { error: err.message });
    }
  }
  _appendToBuffer(payload);
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

module.exports = { setSocketRef, start, stop, getBufferStatus };
