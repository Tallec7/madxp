/**
 * Hotspot Watchdog — wlan0 monitoring and auto-recovery.
 * Extracted from network-watchdog.js (ADR-044).
 *
 * Checks: hostapd, dnsmasq, AP mode, rfkill, IP 192.168.4.1
 * Recovery: fast-path IP add (preserves clients) → full restart
 */

const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

const HOTSPOT_INTERFACE = 'wlan0';

// =============================================================================
// CHECKS
// =============================================================================

async function checkHostapd() {
  try {
    const { stdout } = await execAsync('systemctl is-active hostapd');
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}

async function checkApMode() {
  try {
    const { stdout } = await execAsync(`iw dev ${HOTSPOT_INTERFACE} info 2>/dev/null`);
    return stdout.includes('type AP');
  } catch {
    return false;
  }
}

async function checkDnsmasq() {
  try {
    const { stdout } = await execAsync('systemctl is-active dnsmasq');
    return stdout.trim() === 'active';
  } catch {
    return false;
  }
}

async function checkRfkill() {
  try {
    const { stdout } = await execAsync('rfkill list wifi 2>/dev/null');
    return !stdout.includes('Soft blocked: yes');
  } catch {
    return true;
  }
}

async function checkHotspotIp() {
  try {
    const { stdout } = await execAsync(`ip addr show ${HOTSPOT_INTERFACE} 2>/dev/null`);
    return stdout.includes('192.168.4.1');
  } catch {
    return false;
  }
}

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
// RECOVERY
// =============================================================================

/**
 * Attempt hotspot recovery.
 * @param {object} ctx - Shared context { state, socketRef, sleep, canAttemptRecovery, isInGracePeriod }
 */
async function attemptHotspotRecovery(ctx) {
  ctx.state.hotspot.recoveryAttempts++;
  ctx.state.hotspot.lastRecoveryTime = Date.now();

  logger.warn('NetworkWatchdog: Tentative récupération hotspot', {
    attempt: ctx.state.hotspot.recoveryAttempts,
    maxAttempts: ctx.MAX_RECOVERY_ATTEMPTS,
  });

  try {
    // Étape 0: Diagnostic — identifier le problème exact AVANT d'agir
    const ipMissing = !(await checkHotspotIp());
    const hostapdActive = await execAsync('systemctl is-active hostapd 2>/dev/null')
      .then(({ stdout }) => stdout.trim() === 'active')
      .catch(() => false);
    const dnsmasqActive = await execAsync('systemctl is-active dnsmasq 2>/dev/null')
      .then(({ stdout }) => stdout.trim() === 'active')
      .catch(() => false);

    // Fast path: IP manquante mais services OK → ajouter l'IP sans redémarrer
    if (ipMissing && hostapdActive && dnsmasqActive) {
      logger.info('NetworkWatchdog: IP absente mais hostapd/dnsmasq actifs — ajout IP sans restart');
      await execAsync(`sudo ip addr add 192.168.4.1/24 dev ${HOTSPOT_INTERFACE} 2>/dev/null || true`);
      await execAsync(`sudo ip link set ${HOTSPOT_INTERFACE} up 2>/dev/null || true`);
      await ctx.sleep(2000);

      if (await checkHotspotIp()) {
        logger.info('NetworkWatchdog: IP restaurée sans restart hostapd (clients préservés)');
        const health = await checkHotspotHealth();
        if (health.healthy) {
          ctx.state.hotspot.recoveryAttempts = 0;
          ctx.state.hotspot.healthy = true;
          ctx.state.hotspot.issues = [];
          return { success: true };
        }
      }
      logger.warn('NetworkWatchdog: IP ajoutée mais toujours absente — restart complet nécessaire');
    }

    // Full restart: quand hostapd ou dnsmasq sont vraiment morts
    await execAsync('sudo rfkill unblock wifi 2>/dev/null || true');
    await ctx.sleep(1000);

    // Redémarrer hostapd (AVANT de configurer l'IP)
    await execAsync('sudo systemctl restart hostapd 2>/dev/null');
    await ctx.sleep(3000);

    await execAsync('sudo systemctl restart dnsmasq 2>/dev/null');
    await ctx.sleep(2000);

    // Configurer l'IP si dhcpcd/systemd-networkd ne l'a pas ré-appliquée
    if (!(await checkHotspotIp())) {
      logger.warn('NetworkWatchdog: IP absente après restart hostapd, attente...');
      await ctx.sleep(3000);

      if (!(await checkHotspotIp())) {
        logger.warn('NetworkWatchdog: application manuelle de l\'IP');
        await execAsync(`sudo ip addr add 192.168.4.1/24 dev ${HOTSPOT_INTERFACE} 2>/dev/null || true`);
        await execAsync(`sudo ip link set ${HOTSPOT_INTERFACE} up 2>/dev/null || true`);
        await ctx.sleep(1000);
      }
    }

    const health = await checkHotspotHealth();
    if (health.healthy) {
      logger.info('NetworkWatchdog: Hotspot récupéré avec succès');
      ctx.state.hotspot.recoveryAttempts = 0;
      ctx.state.hotspot.healthy = true;
      ctx.state.hotspot.issues = [];
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
// WATCH LOOP
// =============================================================================

/**
 * @param {object} ctx - Shared context
 */
async function hotspotWatchLoop(ctx) {
  try {
    if (ctx.isInGracePeriod('hotspot')) {
      logger.info('NetworkWatchdog: Hotspot check skipped (grace period)');
      return;
    }

    const health = await checkHotspotHealth();
    ctx.state.hotspot.lastCheck = Date.now();
    ctx.state.hotspot.healthy = health.healthy;
    ctx.state.hotspot.issues = health.issues;

    if (!health.healthy) {
      logger.warn('NetworkWatchdog: Problèmes hotspot détectés', {
        issues: health.issues,
      });

      if (ctx.canAttemptRecovery('hotspot')) {
        await attemptHotspotRecovery(ctx);
      } else {
        logger.error('NetworkWatchdog: Trop de tentatives de récupération hotspot', {
          attempts: ctx.state.hotspot.recoveryAttempts,
          cooldown: ctx.RECOVERY_COOLDOWN,
        });

        if (ctx.socketRef && ctx.socketRef.connected) {
          ctx.socketRef.emit('network_alert', {
            siteId: config.site.id,
            type: 'hotspot_failure',
            severity: 'critical',
            issues: health.issues,
            recoveryAttempts: ctx.state.hotspot.recoveryAttempts,
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

module.exports = {
  checkHostapd,
  checkApMode,
  checkDnsmasq,
  checkRfkill,
  checkHotspotIp,
  checkHotspotHealth,
  attemptHotspotRecovery,
  hotspotWatchLoop,
};
