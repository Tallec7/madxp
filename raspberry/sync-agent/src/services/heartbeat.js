/**
 * Heartbeat — periodic health reporting to central server.
 * Extracted from agent.js (ADR-044).
 *
 * Issue #824: lastSuccessfulHeartbeat is only updated when the server ACKs the
 * heartbeat. In a TCP zombie state socket.emit() succeeds locally (data is
 * buffered in the OS TCP send queue) without the server ever receiving it.
 * Updating the timestamp unconditionally after emit() made the health check
 * at startConnectionHealthCheck() blind to zombie connections for hours.
 */

const logger = require('../logger');
const { config } = require('../config');
const metricsCollector = require('../metrics');
const { getVersionInfo } = require('../utils/version-info');
const connectionStatus = require('./connection-status');
const localSocket = require('./local-socket');

// Zombie socket recoveries since last successful heartbeat ACK.
// Included in the next heartbeat payload so the central server can count them
// in Prometheus (neopro_sync_agent_zombie_socket_recoveries_total).
let pendingZombieRecoveries = 0;

function incrementZombieRecovery() {
  pendingZombieRecoveries += 1;
}

/**
 * Fetch recording state from local Pi server via persistent connection.
 * Uses cached broadcast value with explicit-fetch fallback.
 * @returns {Promise<{isRecording: boolean, isManualOverride: boolean} | null>}
 */
function fetchLocalRecordingState() {
  return localSocket.getRecordingState();
}

function fetchLocalHdmiState() {
  return localSocket.request('get-hdmi-state', 2000);
}

function fetchLocalConnectedClients() {
  return localSocket.request('get-connected-clients', 2000);
}

/**
 * Fetch transition metrics from local Pi server via persistent connection (get + reset).
 * @returns {Promise<{earlySwitchCount: number, safetyTimeoutCount: number, cleanupSkippedCount: number, videoErrorCount: number, totalTransitions: number} | null>}
 */
function fetchLocalTransitionMetrics() {
  return localSocket.request('get-transition-metrics', 2000);
}

/**
 * Fetch player state from local Pi server via persistent connection.
 * Used by heartbeat to include the current TV player state.
 * @returns {Promise<object|null>}
 */
function fetchLocalPlayerState() {
  return localSocket.request('get-player-state', 2000);
}

/**
 * Send a single heartbeat to the central server.
 * @param {object} agent - NeoproSyncAgent instance
 */
async function sendHeartbeat(agent) {
  // Vérifier à la fois le flag interne ET l'état réel de la socket
  if (!agent.connected) {
    return;
  }

  // Détecter les connexions zombies : this.connected=true mais socket morte
  if (!agent.socket?.connected) {
    logger.warn('Zombie connection detected: connected flag is true but socket is disconnected', {
      connected: agent.connected,
      socketConnected: agent.socket?.connected,
      socketId: agent.socket?.id,
    });
    // Corriger l'état et forcer une reconnexion
    agent.connected = false;
    connectionStatus.setConnected(false, 'zombie_detected');
    if (agent.socket) {
      logger.info('Forcing socket reconnection...');
      agent.socket.connect();
    }
    return;
  }

  try {
    const metrics = await metricsCollector.collectAll();

    if (metrics) {
      let versionInfo = null;
      let softwareVersion = null;
      try {
        versionInfo = await getVersionInfo();
        if (versionInfo?.version && versionInfo.version !== 'unknown') {
          softwareVersion = versionInfo.version;
        }
      } catch (error) {
        logger.warn('Failed to load version info for heartbeat:', error.message);
      }

      // Inclure le statut kiosk (fichier écrit par le watchdog)
      let kioskStatus = null;
      try {
        kioskStatus = await metricsCollector.getKioskStatus();
      } catch {
        // Ignore — le fichier peut ne pas encore exister
      }

      // Fetch recording state from local server
      const recordingState = await fetchLocalRecordingState();

      // Fetch transition metrics from local server (get + reset)
      const transitionMetrics = await fetchLocalTransitionMetrics();

      // Fetch player state from local server (for cloud monitoring)
      const playerState = await fetchLocalPlayerState();

      // Fetch HDMI port status and connected clients (E-23)
      const hdmiStatus = await fetchLocalHdmiState();
      const connectedClients = await fetchLocalConnectedClients();

      // Detect orphan systemd services (crash-looping non-legitimate neopro-* units)
      let orphanServices = null;
      try {
        orphanServices = await metricsCollector.getOrphanServices();
        if (orphanServices && orphanServices.length === 0) orphanServices = null;
      } catch {
        // Ignore — non-critical monitoring data
      }

      // Detect legitimate services in failed/crash-loop state (neopro-app, admin, kiosk)
      let failedServices = null;
      try {
        failedServices = await metricsCollector.getFailedServices();
        if (failedServices && failedServices.length === 0) failedServices = null;
      } catch {
        // Ignore — non-critical monitoring data
      }

      // Capture and reset the pending counter atomically before the emit so we
      // don't lose increments that arrive while the ACK round-trip is in-flight.
      const capturedZombieRecoveries = pendingZombieRecoveries;

      // socket.timeout(5000).emit() sends the heartbeat and waits for a server
      // ACK within 5 s. lastSuccessfulHeartbeat is ONLY updated when the server
      // confirms receipt. In a TCP zombie state emit() would succeed locally
      // (data buffered in OS TCP queue) but the ACK callback would time out,
      // keeping lastSuccessfulHeartbeat stale so the health check can detect it.
      agent.socket.timeout(5000).emit('heartbeat', {
        siteId: config.site.id,
        timestamp: Date.now(),
        metrics,
        softwareVersion,
        versionInfo,
        kioskStatus,
        recordingState,
        transitionMetrics,
        playerState,
        wifiStatus: metrics.wifiStatus || null,
        fanStatus: metrics.fanStatus || null,
        filesystemHealth: metrics.filesystemHealth || null,
        hdmiStatus: hdmiStatus || null,
        connectedClients: connectedClients || null,
        // E-23 US-23.4.4: dual-display is active when both HDMI ports are connected
        dualDisplayActive: !!(hdmiStatus && hdmiStatus.hdmi0 && hdmiStatus.hdmi1),
        orphanServices: orphanServices || null,
        failedServices: failedServices || null,
        zombieSocketRecoveries: capturedZombieRecoveries > 0 ? capturedZombieRecoveries : undefined,
      }, (err) => {
        if (!err) {
          // Server confirmed receipt — connection is genuinely alive.
          agent.lastSuccessfulHeartbeat = Date.now();
          pendingZombieRecoveries = 0;
        } else {
          // ACK timed out — server did not receive the heartbeat within 5 s.
          // This is the normal signature of a TCP zombie connection. Do NOT
          // update lastSuccessfulHeartbeat so startConnectionHealthCheck() will
          // detect the stale threshold (60 s) and force a reconnection.
          logger.debug('Heartbeat ACK timeout — zombie state suspected', {
            error: err.message,
            timeSinceLastHeartbeat: agent.lastSuccessfulHeartbeat
              ? Date.now() - agent.lastSuccessfulHeartbeat
              : null,
          });
        }
      });

      logger.debug('Heartbeat sent', {
        cpu: metrics.cpu,
        memory: metrics.memory,
        temperature: metrics.temperature,
        disk: metrics.disk,
      });
    }
  } catch (error) {
    logger.error('Failed to send heartbeat', { error: error.message });
  }
}

/**
 * Start periodic heartbeat.
 * @param {object} agent - NeoproSyncAgent instance
 */
function startHeartbeat(agent) {
  logger.info('Starting heartbeat', { interval: config.monitoring.heartbeatInterval });

  sendHeartbeat(agent);

  agent.heartbeatInterval = setInterval(() => {
    sendHeartbeat(agent);
  }, config.monitoring.heartbeatInterval);
}

/**
 * Start periodic connection health check.
 * Detects zombie connections even if handleDisconnect is not called.
 * @param {object} agent - NeoproSyncAgent instance
 */
function startConnectionHealthCheck(agent) {
  const HEALTH_CHECK_INTERVAL = 30000; // 30 secondes
  const STALE_THRESHOLD = 60000; // 60 secondes sans heartbeat réussi = forcer reconnexion

  logger.info('Starting connection health check', { interval: HEALTH_CHECK_INTERVAL });

  agent.connectionHealthCheckInterval = setInterval(() => {
    // Vérifier la cohérence entre le flag et l'état réel de la socket
    const socketConnected = agent.socket?.connected ?? false;

    if (agent.connected && !socketConnected) {
      logger.warn('Health check: zombie connection detected (flag=true, socket=false)', {
        connected: agent.connected,
        socketConnected,
        lastSuccessfulHeartbeat: agent.lastSuccessfulHeartbeat,
      });
      agent.connected = false;
      connectionStatus.setConnected(false, 'health_check_zombie');

      // Forcer reconnexion
      if (agent.socket) {
        agent.socket.connect();
      }
      return;
    }

    // Vérifier si les heartbeats passent vraiment
    if (agent.connected && agent.lastSuccessfulHeartbeat) {
      const timeSinceLastHeartbeat = Date.now() - agent.lastSuccessfulHeartbeat;
      if (timeSinceLastHeartbeat > STALE_THRESHOLD) {
        logger.warn('Health check: heartbeats stale, forcing reconnection', {
          timeSinceLastHeartbeat,
          threshold: STALE_THRESHOLD,
          socketConnected,
        });
        agent.connected = false;
        connectionStatus.setConnected(false, 'health_check_stale_heartbeat');
        incrementZombieRecovery();

        // Forcer déconnexion puis reconnexion propre
        if (agent.socket) {
          agent.socket.disconnect();
          setTimeout(() => {
            logger.info('Reconnecting after stale heartbeat detection...');
            agent.socket.connect();
          }, 2000);
        }
        return;
      }
    }

    logger.debug('Health check: connection OK', {
      connected: agent.connected,
      socketConnected,
      lastSuccessfulHeartbeat: agent.lastSuccessfulHeartbeat,
    });
  }, HEALTH_CHECK_INTERVAL);
}

module.exports = {
  fetchLocalRecordingState,
  fetchLocalHdmiState,
  fetchLocalConnectedClients,
  fetchLocalTransitionMetrics,
  fetchLocalPlayerState,
  sendHeartbeat,
  startHeartbeat,
  startConnectionHealthCheck,
  incrementZombieRecovery,
};
