/**
 * NetworkWatchdog Service — Orchestrator
 *
 * Surveillance et auto-recovery réseau multi-couches.
 * Delegates to sub-modules (ADR-044):
 * - hotspot-watchdog.js  — wlan0 checks + recovery
 * - internet-watchdog.js — wlan1/eth0 checks + multi-phase recovery
 * - config-rollback.js   — config save/restore on risky operations
 *
 * @version 2.37.0
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');

const execAsync = util.promisify(exec);

// Sub-modules (ADR-044)
const hotspot = require('./hotspot-watchdog');
const internet = require('./internet-watchdog');
const rollback = require('./config-rollback');

// =============================================================================
// MESH DETECTION HELPERS
// =============================================================================

function _isMeshEnvironment() {
  try {
    const { networkDetector } = require('./network-detector');
    const profile = networkDetector.getFullProfile();
    return profile?.type === 'mesh' || profile?.type === 'mesh_isolated';
  } catch {
    return false;
  }
}

function _getBackoffDelay(attempt) {
  const index = Math.min(attempt - 1, PHASE_BACKOFF_DELAYS.length - 1);
  return PHASE_BACKOFF_DELAYS[Math.max(0, index)];
}

function _getModprobeGuard() {
  return _isMeshEnvironment() ? MIN_OUTAGE_FOR_MODPROBE_MESH : MIN_OUTAGE_FOR_MODPROBE_DEFAULT;
}

function _getUsbCycleGuard() {
  return _isMeshEnvironment() ? MIN_OUTAGE_FOR_USB_CYCLE_MESH : MIN_OUTAGE_FOR_USB_CYCLE_DEFAULT;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const HOTSPOT_CHECK_INTERVAL = 30 * 1000;
const INTERNET_CHECK_INTERVAL = 60 * 1000;
const CLOUD_CHECK_INTERVAL = 30 * 1000;
const MAX_RECOVERY_ATTEMPTS = 6;
const RECOVERY_COOLDOWN = 5 * 60 * 1000;
const GRACE_PERIOD_DURATION = 60 * 1000;

const PHASE_BACKOFF_DELAYS = [
  10 * 1000,
  20 * 1000,
  45 * 1000,
  60 * 1000,
  90 * 1000,
  120 * 1000,
];

const MIN_OUTAGE_FOR_MODPROBE_DEFAULT = 5 * 60 * 1000;
const MIN_OUTAGE_FOR_MODPROBE_MESH = 10 * 60 * 1000;
const MIN_OUTAGE_FOR_USB_CYCLE_DEFAULT = 5 * 60 * 1000;
const MIN_OUTAGE_FOR_USB_CYCLE_MESH = 10 * 60 * 1000;
const GRACE_PERIOD_FILE = '/tmp/neopro-watchdog-grace.json';
const BSSID_MISMATCH_THRESHOLD = 5 * 60 * 1000;

// =============================================================================
// SHARED STATE
// =============================================================================

const state = {
  hotspot: {
    healthy: true,
    lastCheck: null,
    recoveryAttempts: 0,
    lastRecoveryTime: 0,
    issues: [],
    gracePeriodUntil: 0,
  },
  internet: {
    healthy: true,
    lastCheck: null,
    recoveryAttempts: 0,
    lastRecoveryTime: 0,
    recoveryStartedAt: 0,
    issues: [],
    ipAddress: null,
    gateway: null,
    connectionType: null,
    gracePeriodUntil: 0,
  },
  cloud: {
    healthy: true,
    lastCheck: null,
    lastPong: null,
  },
  rollback: {
    pending: false,
    config: null,
    timestamp: null,
    operation: null,
  },
  bssidMismatch: {
    detectedAt: 0,
    cleared: false,
  },
};

let hotspotInterval = null;
let internetInterval = null;
let cloudInterval = null;
let rollbackTimeout = null;
let socketRef = null;

function setSocketRef(socket) {
  socketRef = socket;
}

// =============================================================================
// SHARED CONTEXT (passed to sub-modules)
// =============================================================================

function getContext() {
  return {
    state,
    get socketRef() { return socketRef; },
    get rollbackTimeout() { return rollbackTimeout; },
    set rollbackTimeout(v) { rollbackTimeout = v; },
    sleep,
    canAttemptRecovery,
    isInGracePeriod,
    checkCloudHealth,
    isMeshEnvironment: _isMeshEnvironment,
    getBackoffDelay: _getBackoffDelay,
    getModprobeGuard: _getModprobeGuard,
    getUsbCycleGuard: _getUsbCycleGuard,
    MAX_RECOVERY_ATTEMPTS,
    RECOVERY_COOLDOWN,
    BSSID_MISMATCH_THRESHOLD,
  };
}

// =============================================================================
// GRACE PERIOD
// =============================================================================

function canAttemptRecovery(type) {
  const stateObj = state[type];
  const now = Date.now();
  const timeSinceLast = now - stateObj.lastRecoveryTime;

  if (timeSinceLast > RECOVERY_COOLDOWN) {
    stateObj.recoveryAttempts = 0;
  }

  return stateObj.recoveryAttempts < MAX_RECOVERY_ATTEMPTS;
}

function enableGracePeriod(type, durationMs = GRACE_PERIOD_DURATION) {
  const stateObj = state[type];
  if (stateObj) {
    stateObj.gracePeriodUntil = Date.now() + durationMs;
    logger.info('NetworkWatchdog: Grace period enabled', {
      type,
      durationMs,
      until: new Date(stateObj.gracePeriodUntil).toISOString()
    });
    persistGracePeriods();
  }
}

function persistGracePeriods() {
  try {
    const data = {
      hotspot: state.hotspot.gracePeriodUntil,
      internet: state.internet.gracePeriodUntil,
    };
    fs.writeFileSync(GRACE_PERIOD_FILE, JSON.stringify(data));
  } catch (e) {
    logger.warn('NetworkWatchdog: Failed to persist grace periods', { error: e.message });
  }
}

function restoreGracePeriods() {
  try {
    if (!fs.existsSync(GRACE_PERIOD_FILE)) return;
    const raw = fs.readFileSync(GRACE_PERIOD_FILE, 'utf8');
    const data = JSON.parse(raw);
    const now = Date.now();

    if (data.hotspot && data.hotspot > now) {
      state.hotspot.gracePeriodUntil = data.hotspot;
      logger.info('NetworkWatchdog: Restored hotspot grace period from disk', {
        remainingMs: data.hotspot - now,
        until: new Date(data.hotspot).toISOString()
      });
    }

    if (data.internet && data.internet > now) {
      state.internet.gracePeriodUntil = data.internet;
      logger.info('NetworkWatchdog: Restored internet grace period from disk', {
        remainingMs: data.internet - now,
        until: new Date(data.internet).toISOString()
      });
    }

    fs.unlinkSync(GRACE_PERIOD_FILE);
  } catch (e) {
    logger.warn('NetworkWatchdog: Failed to restore grace periods', { error: e.message });
  }
}

function isInGracePeriod(type) {
  const stateObj = state[type];
  return stateObj && Date.now() < stateObj.gracePeriodUntil;
}

// =============================================================================
// CLOUD CHECK
// =============================================================================

function checkCloudHealth() {
  if (!socketRef) {
    return { healthy: false, reason: 'Socket non initialisé' };
  }

  const connected = socketRef.connected === true;
  const lastPong = state.cloud.lastPong;
  const now = Date.now();

  const isZombie = connected && lastPong && (now - lastPong > 60000);

  return {
    healthy: connected && !isZombie,
    connected,
    isZombie,
    lastPong,
    timeSinceLastPong: lastPong ? now - lastPong : null,
  };
}

function updateLastPong() {
  state.cloud.lastPong = Date.now();
}

// =============================================================================
// CLOUD WATCH LOOP
// =============================================================================

function cloudWatchLoop() {
  try {
    const health = checkCloudHealth();
    state.cloud.lastCheck = Date.now();
    state.cloud.healthy = health.healthy;

    if (health.isZombie) {
      logger.warn('NetworkWatchdog: Connexion zombie détectée', {
        lastPong: health.lastPong,
        timeSinceLastPong: health.timeSinceLastPong,
      });

      if (socketRef) {
        socketRef.disconnect();
        setTimeout(() => {
          socketRef.connect();
        }, 1000);
      }
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur dans cloudWatchLoop', {
      error: error.message,
    });
  }
}

// =============================================================================
// START / STOP
// =============================================================================

function start() {
  restoreGracePeriods();

  logger.info('NetworkWatchdog: Démarrage', {
    hotspotInterval: HOTSPOT_CHECK_INTERVAL,
    internetInterval: INTERNET_CHECK_INTERVAL,
    cloudInterval: CLOUD_CHECK_INTERVAL,
    hotspotGraceActive: isInGracePeriod('hotspot'),
    internetGraceActive: isInGracePeriod('internet'),
  });

  execAsync('sudo iwconfig wlan1 power off 2>/dev/null || true')
    .then(() => logger.info('NetworkWatchdog: WiFi power management disabled on wlan1'))
    .catch(() => {});

  enableGracePeriod('internet', 45000);
  logger.info('NetworkWatchdog: boot grace period enabled (45s) for internet checks');

  enableGracePeriod('hotspot', 45000);
  logger.info('NetworkWatchdog: boot grace period enabled (45s) for hotspot checks');

  const ctx = getContext();

  setTimeout(() => hotspot.hotspotWatchLoop(ctx), 5000);
  setTimeout(() => internet.internetWatchLoop(ctx), 10000);

  hotspotInterval = setInterval(() => hotspot.hotspotWatchLoop(ctx), HOTSPOT_CHECK_INTERVAL);
  internetInterval = setInterval(() => internet.internetWatchLoop(ctx), INTERNET_CHECK_INTERVAL);
  cloudInterval = setInterval(cloudWatchLoop, CLOUD_CHECK_INTERVAL);
}

function stop() {
  logger.info('NetworkWatchdog: Arrêt');

  if (hotspotInterval) {
    clearInterval(hotspotInterval);
    hotspotInterval = null;
  }

  if (internetInterval) {
    clearInterval(internetInterval);
    internetInterval = null;
  }

  if (cloudInterval) {
    clearInterval(cloudInterval);
    cloudInterval = null;
  }

  if (rollbackTimeout) {
    clearTimeout(rollbackTimeout);
    rollbackTimeout = null;
  }

  internet.stopWlan1Reconnect();
}

// =============================================================================
// STATUS
// =============================================================================

function getStatus() {
  return {
    hotspot: {
      healthy: state.hotspot.healthy,
      lastCheck: state.hotspot.lastCheck,
      issues: state.hotspot.issues,
      recoveryAttempts: state.hotspot.recoveryAttempts,
    },
    internet: {
      healthy: state.internet.healthy,
      lastCheck: state.internet.lastCheck,
      issues: state.internet.issues,
      ipAddress: state.internet.ipAddress,
      gateway: state.internet.gateway,
      connectionType: state.internet.connectionType,
      recoveryAttempts: state.internet.recoveryAttempts,
      recoveryStartedAt: state.internet.recoveryStartedAt || null,
      isMeshEnvironment: _isMeshEnvironment(),
      currentBackoffDelaySec: state.internet.recoveryAttempts > 0
        ? _getBackoffDelay(state.internet.recoveryAttempts) / 1000
        : null,
      modprobeGuardSec: _getModprobeGuard() / 1000,
      usbCycleGuardSec: _getUsbCycleGuard() / 1000,
    },
    cloud: {
      healthy: state.cloud.healthy,
      lastCheck: state.cloud.lastCheck,
      lastPong: state.cloud.lastPong,
    },
    rollback: {
      pending: state.rollback.pending,
      operation: state.rollback.operation,
      timestamp: state.rollback.timestamp,
    },
  };
}

// =============================================================================
// UTILITY
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// FACADE — Preserve original module.exports contract
// =============================================================================

module.exports = {
  // Core
  start,
  stop,
  getStatus,
  setSocketRef,

  // Cloud
  updateLastPong,
  checkCloudHealth,

  // Checks (delegate to sub-modules)
  checkHotspotHealth: hotspot.checkHotspotHealth,
  checkInternetHealth: internet.checkInternetHealth,
  detectCaptivePortal: internet.detectCaptivePortal,

  // Recovery (delegate with ctx injection)
  attemptHotspotRecovery: () => hotspot.attemptHotspotRecovery(getContext()),
  attemptInternetRecovery: () => internet.attemptInternetRecovery(getContext()),

  // Grace period
  enableGracePeriod,
  isInGracePeriod,

  // Rollback (delegate with ctx injection)
  saveRollbackPoint: (operation, configPath) => rollback.saveRollbackPoint(getContext(), operation, configPath),
  executeRollback: () => rollback.executeRollback(getContext()),
  clearRollbackPoint: () => rollback.clearRollbackPoint(getContext()),
  confirmOperation: () => rollback.confirmOperation(getContext()),
};
