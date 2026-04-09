/**
 * Heartbeat — periodic health reporting to central server.
 * Extracted from agent.js (ADR-044).
 */

const logger = require('../logger');
const { config } = require('../config');
const metricsCollector = require('../metrics');
const { getVersionInfo } = require('../utils/version-info');
const connectionStatus = require('./connection-status');
const localSocket = require('./local-socket');

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

      agent.socket.emit('heartbeat', {
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
      });

      // Enregistrer le succès du heartbeat
      agent.lastSuccessfulHeartbeat = Date.now();

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
};
