/**
 * NetworkWatchdog Service
 *
 * Phase 4 de la Network Resilience : Surveillance et auto-recovery réseau.
 *
 * Ce service surveille en continu :
 * - wlan0 (hotspot) : hostapd, dnsmasq, mode AP, IP 192.168.4.1
 * - wlan1 (internet) : IP valide, ping gateway, ping 8.8.8.8
 * - Socket.IO (cloud) : connexion active, dernier pong
 *
 * En cas de problème, il tente une récupération automatique avec :
 * - Max 3 tentatives avant cooldown
 * - Rollback si perte de connexion après un changement
 * - Alertes envoyées au central si échec
 *
 * @version 2.37.0
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

// Configuration
const HOTSPOT_CHECK_INTERVAL = 30 * 1000; // 30 secondes
const INTERNET_CHECK_INTERVAL = 60 * 1000; // 60 secondes
const CLOUD_CHECK_INTERVAL = 30 * 1000; // 30 secondes
const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const ROLLBACK_TIMEOUT = 30 * 1000; // 30 secondes pour rollback

// Interfaces
const HOTSPOT_INTERFACE = 'wlan0';
const INTERNET_INTERFACE = 'wlan1';

// État interne
const state = {
  hotspot: {
    healthy: true,
    lastCheck: null,
    recoveryAttempts: 0,
    lastRecoveryTime: 0,
    issues: [],
  },
  internet: {
    healthy: true,
    lastCheck: null,
    recoveryAttempts: 0,
    lastRecoveryTime: 0,
    issues: [],
    ipAddress: null,
    gateway: null,
    connectionType: null, // 'ethernet' or 'wifi'
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
};

// Intervalles
let hotspotInterval = null;
let internetInterval = null;
let cloudInterval = null;
let rollbackTimeout = null;

// Référence au socket (injectée par l'agent)
let socketRef = null;

/**
 * Définit la référence au socket pour la surveillance cloud
 */
function setSocketRef(socket) {
  socketRef = socket;
}

// =============================================================================
// CHECKS HOTSPOT (wlan0)
// =============================================================================

/**
 * Vérifie si hostapd est actif
 */
async function checkHostapd() {
  try {
    const { stdout } = await execAsync('systemctl is-active hostapd');
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}

/**
 * Vérifie si wlan0 est en mode AP
 */
async function checkApMode() {
  try {
    const { stdout } = await execAsync(`iw dev ${HOTSPOT_INTERFACE} info 2>/dev/null`);
    return stdout.includes('type AP');
  } catch {
    return false;
  }
}

/**
 * Vérifie si dnsmasq est actif
 */
async function checkDnsmasq() {
  try {
    const { stdout } = await execAsync('systemctl is-active dnsmasq');
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}

/**
 * Vérifie si le WiFi n'est pas bloqué par rfkill
 */
async function checkRfkill() {
  try {
    const { stdout } = await execAsync('rfkill list wifi 2>/dev/null');
    return !stdout.includes('Soft blocked: yes');
  } catch {
    return true; // Pas de rfkill = OK
  }
}

/**
 * Vérifie si l'IP 192.168.4.1 est configurée sur wlan0
 */
async function checkHotspotIp() {
  try {
    const { stdout } = await execAsync(`ip addr show ${HOTSPOT_INTERFACE} 2>/dev/null`);
    return stdout.includes('192.168.4.1');
  } catch {
    return false;
  }
}

/**
 * Check complet de la santé du hotspot
 */
async function checkHotspotHealth() {
  const issues = [];

  if (!(await checkRfkill())) {
    issues.push('WiFi bloqué par rfkill');
  }

  if (!(await checkHostapd())) {
    issues.push('hostapd inactif');
  }

  if (!(await checkApMode())) {
    issues.push('wlan0 pas en mode AP');
  }

  if (!(await checkDnsmasq())) {
    issues.push('dnsmasq inactif');
  }

  if (!(await checkHotspotIp())) {
    issues.push('IP 192.168.4.1 non configurée');
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

// =============================================================================
// CHECKS INTERNET (eth0 or wlan1)
// =============================================================================

/**
 * Check if connected via Ethernet (eth0)
 */
async function checkEthernetConnection() {
  try {
    const { stdout } = await execAsync('ip addr show eth0 2>/dev/null');
    const hasValidIp = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/) &&
                       !stdout.includes('169.254.');
    const isUp = stdout.includes('state UP');

    if (!hasValidIp || !isUp) {
      return { connected: false };
    }

    // Check if default route goes through eth0
    const routeResult = await execAsync('ip route | grep default');
    const usesEthernet = routeResult.stdout.includes('dev eth0');

    const ipMatch = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);

    return {
      connected: usesEthernet,
      ipAddress: ipMatch ? ipMatch[1] : null
    };
  } catch {
    return { connected: false };
  }
}

/**
 * Récupère l'adresse IP de wlan1
 */
async function getInternetIp() {
  try {
    const { stdout } = await execAsync(`ip addr show ${INTERNET_INTERFACE} 2>/dev/null | grep "inet " | head -1`);
    const match = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      const ip = match[1];
      // Vérifier que ce n'est pas une adresse APIPA (169.254.x.x)
      if (ip.startsWith('169.254.')) {
        return null;
      }
      return ip;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Récupère la gateway par défaut
 */
async function getGateway() {
  try {
    const { stdout } = await execAsync('ip route | grep default | head -1');
    const match = stdout.match(/via (\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Ping une adresse avec timeout
 */
async function ping(host, timeout = 3) {
  try {
    await execAsync(`ping -c 1 -W ${timeout} ${host}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check complet de la connexion internet
 * Priorité : Ethernet (eth0) > WiFi (wlan1)
 */
async function checkInternetHealth() {
  const issues = [];

  // First, check if connected via Ethernet
  const ethernet = await checkEthernetConnection();
  if (ethernet.connected) {
    // Ethernet is working, just verify internet connectivity
    const gateway = await getGateway();
    const internetOk = await ping('8.8.8.8');

    if (!internetOk) {
      issues.push('Internet inaccessible via Ethernet');
    }

    return {
      healthy: issues.length === 0,
      issues,
      ipAddress: ethernet.ipAddress,
      gateway,
      connectionType: 'ethernet',
    };
  }

  // No Ethernet, check WiFi (wlan1)
  const ip = await getInternetIp();
  if (!ip) {
    issues.push('Pas d\'IP valide sur wlan1');
  }

  // Vérifier la gateway
  const gateway = await getGateway();
  if (!gateway) {
    issues.push('Pas de gateway');
  } else if (!(await ping(gateway))) {
    issues.push('Gateway injoignable');
  }

  // Vérifier la connexion Internet
  if (!(await ping('8.8.8.8'))) {
    issues.push('Internet inaccessible (8.8.8.8)');
  }

  return {
    healthy: issues.length === 0,
    issues,
    ipAddress: ip,
    gateway,
    connectionType: 'wifi',
  };
}

// =============================================================================
// CHECKS CLOUD (Socket.IO)
// =============================================================================

/**
 * Check de la connexion cloud
 */
function checkCloudHealth() {
  if (!socketRef) {
    return { healthy: false, reason: 'Socket non initialisé' };
  }

  const connected = socketRef.connected === true;
  const lastPong = state.cloud.lastPong;
  const now = Date.now();

  // Connexion zombie : flag connected mais pas de pong depuis 60s
  const isZombie = connected && lastPong && (now - lastPong > 60000);

  return {
    healthy: connected && !isZombie,
    connected,
    isZombie,
    lastPong,
    timeSinceLastPong: lastPong ? now - lastPong : null,
  };
}

/**
 * Met à jour le timestamp du dernier pong
 */
function updateLastPong() {
  state.cloud.lastPong = Date.now();
}

// =============================================================================
// RECOVERY HOTSPOT
// =============================================================================

/**
 * Vérifie si on peut tenter une recovery
 */
function canAttemptRecovery(type) {
  const stateObj = state[type];
  const now = Date.now();
  const timeSinceLast = now - stateObj.lastRecoveryTime;

  // Reset le compteur si assez de temps s'est écoulé
  if (timeSinceLast > RECOVERY_COOLDOWN) {
    stateObj.recoveryAttempts = 0;
  }

  return stateObj.recoveryAttempts < MAX_RECOVERY_ATTEMPTS;
}

/**
 * Tente la récupération du hotspot
 */
async function attemptHotspotRecovery() {
  state.hotspot.recoveryAttempts++;
  state.hotspot.lastRecoveryTime = Date.now();

  logger.warn('NetworkWatchdog: Tentative récupération hotspot', {
    attempt: state.hotspot.recoveryAttempts,
    maxAttempts: MAX_RECOVERY_ATTEMPTS,
  });

  try {
    // Étape 1: Débloquer rfkill
    await execAsync('sudo rfkill unblock wifi 2>/dev/null || true');
    await sleep(1000);

    // Étape 2: Configurer l'IP si manquante
    if (!(await checkHotspotIp())) {
      await execAsync(`sudo ip addr add 192.168.4.1/24 dev ${HOTSPOT_INTERFACE} 2>/dev/null || true`);
      await execAsync(`sudo ip link set ${HOTSPOT_INTERFACE} up 2>/dev/null || true`);
      await sleep(1000);
    }

    // Étape 3: Redémarrer hostapd
    await execAsync('sudo systemctl restart hostapd 2>/dev/null');
    await sleep(3000);

    // Étape 4: Redémarrer dnsmasq
    await execAsync('sudo systemctl restart dnsmasq 2>/dev/null');
    await sleep(2000);

    // Vérification finale
    const health = await checkHotspotHealth();
    if (health.healthy) {
      logger.info('NetworkWatchdog: Hotspot récupéré avec succès');
      state.hotspot.recoveryAttempts = 0;
      state.hotspot.healthy = true;
      state.hotspot.issues = [];
      return { success: true };
    } else {
      logger.error('NetworkWatchdog: Récupération hotspot échouée', {
        issues: health.issues,
      });
      return { success: false, issues: health.issues };
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors de la récupération hotspot', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// RECOVERY INTERNET
// =============================================================================

/**
 * Tente la récupération de la connexion internet
 */
async function attemptInternetRecovery() {
  state.internet.recoveryAttempts++;
  state.internet.lastRecoveryTime = Date.now();

  logger.warn('NetworkWatchdog: Tentative récupération internet', {
    attempt: state.internet.recoveryAttempts,
    maxAttempts: MAX_RECOVERY_ATTEMPTS,
  });

  try {
    // Étape 1: Reconfigurer wpa_supplicant
    await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null || true');
    await sleep(5000);

    // Vérifier si on a une IP
    let ip = await getInternetIp();
    if (!ip) {
      // Étape 2: Forcer DHCP
      logger.info('NetworkWatchdog: Pas d\'IP, tentative DHCP...');
      await execAsync('sudo dhclient wlan1 2>/dev/null || true');
      await sleep(3000);
      ip = await getInternetIp();
    }

    // Vérification finale
    const health = await checkInternetHealth();
    if (health.healthy) {
      logger.info('NetworkWatchdog: Internet récupéré avec succès', {
        ip: health.ipAddress,
        gateway: health.gateway,
      });
      state.internet.recoveryAttempts = 0;
      state.internet.healthy = true;
      state.internet.issues = [];
      state.internet.ipAddress = health.ipAddress;
      state.internet.gateway = health.gateway;
      return { success: true };
    } else {
      logger.error('NetworkWatchdog: Récupération internet échouée', {
        issues: health.issues,
      });
      return { success: false, issues: health.issues };
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors de la récupération internet', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// ROLLBACK
// =============================================================================

/**
 * Sauvegarde la configuration avant une opération risquée
 */
async function saveRollbackPoint(operation, configPath = '/home/pi/neopro/webapp/configuration.json') {
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    state.rollback = {
      pending: true,
      config: configContent,
      timestamp: Date.now(),
      operation,
      configPath,
    };

    // Démarre le timer de rollback
    if (rollbackTimeout) {
      clearTimeout(rollbackTimeout);
    }

    rollbackTimeout = setTimeout(async () => {
      if (state.rollback.pending) {
        // Vérifier si la connexion est toujours OK
        const cloudHealth = checkCloudHealth();
        if (cloudHealth.healthy) {
          // Connexion OK, annuler le rollback
          logger.info('NetworkWatchdog: Connexion stable après opération, rollback annulé', {
            operation: state.rollback.operation,
          });
          clearRollbackPoint();
        } else {
          // Connexion perdue, exécuter le rollback
          logger.warn('NetworkWatchdog: Connexion perdue après opération, exécution du rollback', {
            operation: state.rollback.operation,
          });
          await executeRollback();
        }
      }
    }, ROLLBACK_TIMEOUT);

    logger.info('NetworkWatchdog: Point de rollback sauvegardé', {
      operation,
      timeout: ROLLBACK_TIMEOUT,
    });

    return { success: true };
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors de la sauvegarde du point de rollback', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Exécute le rollback de la configuration
 */
async function executeRollback() {
  if (!state.rollback.pending || !state.rollback.config) {
    logger.warn('NetworkWatchdog: Aucun rollback en attente');
    return { success: false, reason: 'no_pending_rollback' };
  }

  try {
    const { config: configContent, configPath, operation } = state.rollback;

    // Restaurer la configuration
    await fs.writeFile(configPath, configContent, 'utf8');

    logger.info('NetworkWatchdog: Rollback exécuté avec succès', {
      operation,
      configPath,
    });

    // Nettoyer l'état
    clearRollbackPoint();

    // Notifier le serveur du rollback
    if (socketRef && socketRef.connected) {
      socketRef.emit('network_rollback', {
        siteId: config.site.id,
        operation,
        timestamp: new Date().toISOString(),
        reason: 'connection_lost_after_change',
      });
    }

    return { success: true };
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors du rollback', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Annule le rollback en attente
 */
function clearRollbackPoint() {
  if (rollbackTimeout) {
    clearTimeout(rollbackTimeout);
    rollbackTimeout = null;
  }
  state.rollback = {
    pending: false,
    config: null,
    timestamp: null,
    operation: null,
  };
}

/**
 * Confirme que l'opération s'est bien passée (annule le rollback)
 */
function confirmOperation() {
  if (state.rollback.pending) {
    logger.info('NetworkWatchdog: Opération confirmée, rollback annulé', {
      operation: state.rollback.operation,
    });
    clearRollbackPoint();
  }
}

// =============================================================================
// MAIN LOOPS
// =============================================================================

/**
 * Boucle de surveillance du hotspot
 */
async function hotspotWatchLoop() {
  try {
    const health = await checkHotspotHealth();
    state.hotspot.lastCheck = Date.now();
    state.hotspot.healthy = health.healthy;
    state.hotspot.issues = health.issues;

    if (!health.healthy) {
      logger.warn('NetworkWatchdog: Problèmes hotspot détectés', {
        issues: health.issues,
      });

      if (canAttemptRecovery('hotspot')) {
        await attemptHotspotRecovery();
      } else {
        logger.error('NetworkWatchdog: Trop de tentatives de récupération hotspot', {
          attempts: state.hotspot.recoveryAttempts,
          cooldown: RECOVERY_COOLDOWN,
        });

        // Envoyer une alerte au central
        if (socketRef && socketRef.connected) {
          socketRef.emit('network_alert', {
            siteId: config.site.id,
            type: 'hotspot_failure',
            severity: 'critical',
            issues: health.issues,
            recoveryAttempts: state.hotspot.recoveryAttempts,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur dans hotspotWatchLoop', {
      error: error.message,
    });
  }
}

/**
 * Boucle de surveillance internet
 */
async function internetWatchLoop() {
  try {
    const health = await checkInternetHealth();
    state.internet.lastCheck = Date.now();
    state.internet.healthy = health.healthy;
    state.internet.issues = health.issues;
    state.internet.ipAddress = health.ipAddress;
    state.internet.gateway = health.gateway;
    state.internet.connectionType = health.connectionType;

    if (!health.healthy) {
      // If using Ethernet, don't try WiFi recovery
      if (health.connectionType === 'ethernet') {
        logger.warn('NetworkWatchdog: Problèmes internet via Ethernet', {
          issues: health.issues,
        });
        // Ethernet issues are usually physical (cable unplugged) - no auto recovery
        return;
      }

      logger.warn('NetworkWatchdog: Problèmes internet détectés', {
        issues: health.issues,
      });

      if (canAttemptRecovery('internet')) {
        await attemptInternetRecovery();
      } else {
        logger.error('NetworkWatchdog: Trop de tentatives de récupération internet', {
          attempts: state.internet.recoveryAttempts,
          cooldown: RECOVERY_COOLDOWN,
        });

        // Envoyer une alerte au central (via HTTP si socket down)
        if (socketRef && socketRef.connected) {
          socketRef.emit('network_alert', {
            siteId: config.site.id,
            type: 'internet_failure',
            severity: 'critical',
            issues: health.issues,
            recoveryAttempts: state.internet.recoveryAttempts,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur dans internetWatchLoop', {
      error: error.message,
    });
  }
}

/**
 * Boucle de surveillance cloud
 */
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

      // Forcer la reconnexion
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
// START/STOP
// =============================================================================

/**
 * Démarre le watchdog
 */
function start() {
  logger.info('NetworkWatchdog: Démarrage', {
    hotspotInterval: HOTSPOT_CHECK_INTERVAL,
    internetInterval: INTERNET_CHECK_INTERVAL,
    cloudInterval: CLOUD_CHECK_INTERVAL,
  });

  // Première exécution immédiate
  setTimeout(() => hotspotWatchLoop(), 5000);
  setTimeout(() => internetWatchLoop(), 10000);

  // Puis intervalles réguliers
  hotspotInterval = setInterval(hotspotWatchLoop, HOTSPOT_CHECK_INTERVAL);
  internetInterval = setInterval(internetWatchLoop, INTERNET_CHECK_INTERVAL);
  cloudInterval = setInterval(cloudWatchLoop, CLOUD_CHECK_INTERVAL);
}

/**
 * Arrête le watchdog
 */
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
}

/**
 * Retourne l'état actuel du watchdog
 */
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

// Utilitaire
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  // Core
  start,
  stop,
  getStatus,
  setSocketRef,

  // Cloud
  updateLastPong,
  checkCloudHealth,

  // Checks
  checkHotspotHealth,
  checkInternetHealth,

  // Recovery
  attemptHotspotRecovery,
  attemptInternetRecovery,

  // Rollback
  saveRollbackPoint,
  executeRollback,
  clearRollbackPoint,
  confirmOperation,
};
