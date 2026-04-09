/**
 * Internet Watchdog — wlan1/eth0 monitoring and multi-phase auto-recovery.
 * Extracted from network-watchdog.js (ADR-044).
 *
 * Checks: Ethernet fallback, WiFi IP, gateway, ping, captive portal
 * Recovery phases: gentle → medium → aggressive → modprobe → USB power-cycle
 * Also: BSSID mismatch auto-clear, wlan1 background reconnect
 */

const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');
const { safeNetworkOperations, OPERATIONS } = require('./safe-network-operations');

const execAsync = util.promisify(exec);

const INTERNET_INTERFACE = 'wlan1';

// =============================================================================
// CHECKS
// =============================================================================

async function checkEthernetConnection() {
  try {
    const { stdout } = await execAsync('ip addr show eth0 2>/dev/null');
    const hasValidIp = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/) &&
                       !stdout.includes('169.254.');
    const isUp = stdout.includes('state UP');

    if (!hasValidIp || !isUp) {
      return { connected: false };
    }

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

async function getInternetIp() {
  try {
    const { stdout } = await execAsync(`ip addr show ${INTERNET_INTERFACE} 2>/dev/null | grep "inet " | head -1`);
    const match = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      const ip = match[1];
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

async function getGateway() {
  try {
    const { stdout } = await execAsync('ip route | grep default | head -1');
    const match = stdout.match(/via (\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function ping(host, timeout = 3) {
  try {
    await execAsync(`ping -c 1 -W ${timeout} ${host}`);
    return true;
  } catch {
    return false;
  }
}

async function checkInternetHealth() {
  const issues = [];

  const ethernet = await checkEthernetConnection();
  if (ethernet.connected) {
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

  const ip = await getInternetIp();
  if (!ip) {
    issues.push('Pas d\'IP valide sur wlan1');
  }

  const gateway = await getGateway();
  if (!gateway) {
    issues.push('Pas de gateway');
  } else if (!(await ping(gateway))) {
    issues.push('Gateway injoignable');
  }

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
// CAPTIVE PORTAL DETECTION
// =============================================================================

async function detectCaptivePortal() {
  try {
    const ip = await getInternetIp();
    if (!ip) {
      return { detected: false };
    }

    const { stdout } = await execAsync(
      'curl -s -o /dev/null -w "%{http_code}:%{redirect_url}" --max-time 5 --connect-timeout 3 http://connectivitycheck.gstatic.com/generate_204',
      { timeout: 10000 }
    );

    const [httpCode, redirectUrl] = stdout.split(':');
    const code = parseInt(httpCode, 10);

    if (code === 204) {
      return { detected: false };
    }

    if (code === 302 || code === 301 || code === 307 || code === 200) {
      logger.warn('NetworkWatchdog: Captive portal detected', {
        httpCode: code,
        redirectUrl: redirectUrl || 'N/A',
      });
      return { detected: true, redirectUrl: redirectUrl || null };
    }

    return { detected: false };
  } catch {
    return { detected: false };
  }
}

// =============================================================================
// USB POWER-CYCLE HELPERS
// =============================================================================

/**
 * @param {string} usbDevicePath
 * @param {Function} sleep
 */
async function attemptUsbPowerCycle(usbDevicePath, sleep) {
  try {
    logger.warn('NetworkWatchdog: USB power-cycle', { device: usbDevicePath });
    await execAsync(`echo "${usbDevicePath}" | sudo tee /sys/bus/usb/drivers/usb/unbind 2>/dev/null || true`);
    await sleep(3000);
    await execAsync(`echo "${usbDevicePath}" | sudo tee /sys/bus/usb/drivers/usb/bind 2>/dev/null || true`);
    await sleep(5000);

    try {
      await execAsync('ip link show wlan1 2>/dev/null');
      logger.info('NetworkWatchdog: wlan1 recovered via USB power-cycle', { device: usbDevicePath });
      return true;
    } catch {
      logger.error('NetworkWatchdog: wlan1 still missing after USB power-cycle', { device: usbDevicePath });
      return false;
    }
  } catch (error) {
    logger.error('NetworkWatchdog: USB power-cycle failed', { device: usbDevicePath, error: error.message });
    return false;
  }
}

/**
 * @param {Function} sleep
 */
async function attemptUsbPowerCycleAll(sleep) {
  try {
    const { stdout } = await execAsync(
      'for d in /sys/bus/usb/devices/[0-9]*-[0-9]*; do ' +
      'if [ -f "$d/product" ]; then echo "$(basename $d)|$(cat $d/product 2>/dev/null)"; fi; ' +
      'done 2>/dev/null || true'
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const [devId, product] = line.split('|');
      if (!product) continue;
      const lower = product.toLowerCase();
      if (lower.includes('wireless') || lower.includes('wifi') || lower.includes('wlan') || lower.includes('802.11')) {
        logger.warn('NetworkWatchdog: Found WiFi USB device for power-cycle', { devId, product });
        const recovered = await attemptUsbPowerCycle(devId, sleep);
        if (recovered) return true;
      }
    }

    logger.error('NetworkWatchdog: No WiFi USB device found for power-cycle');
    return false;
  } catch (error) {
    logger.error('NetworkWatchdog: USB power-cycle scan failed', { error: error.message });
    return false;
  }
}

// =============================================================================
// WPA_SUPPLICANT RESTART
// =============================================================================

async function restartWpaSupplicantWlan1() {
  try {
    await execAsync('sudo systemctl restart wpa_supplicant@wlan1 2>/dev/null');
    logger.info('NetworkWatchdog: wpa_supplicant@wlan1 restarted via systemd');
  } catch {
    logger.warn('NetworkWatchdog: systemd restart failed, falling back to raw wpa_supplicant');
    await execAsync('sudo wpa_supplicant -B -i wlan1 -c /etc/wpa_supplicant/wpa_supplicant-wlan1.conf 2>/dev/null || true');
  }
}

// =============================================================================
// RECOVERY
// =============================================================================

/**
 * Multi-phase internet recovery.
 * @param {object} ctx - Shared context
 */
async function attemptInternetRecovery(ctx) {
  ctx.state.internet.recoveryAttempts++;
  ctx.state.internet.lastRecoveryTime = Date.now();

  const attempt = ctx.state.internet.recoveryAttempts;

  logger.warn('NetworkWatchdog: Tentative récupération internet', {
    attempt,
    maxAttempts: ctx.MAX_RECOVERY_ATTEMPTS,
    phase: attempt <= 2 ? 'gentle' : attempt === 3 ? 'medium' : attempt === 4 ? 'aggressive' : attempt === 5 ? 'modprobe' : 'usb-power-cycle',
  });

  try {
    if (attempt <= 2) {
      // Phase 1: Gentle - wpa_cli reconfigure + dhclient
      await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null || true');
      await ctx.sleep(5000);

      let ip = await getInternetIp();
      if (!ip) {
        logger.info('NetworkWatchdog: Pas d\'IP, tentative DHCP...');
        await execAsync('sudo dhclient wlan1 2>/dev/null || true');
        await ctx.sleep(3000);
      }

    } else if (attempt === 3) {
      // Phase 2: Medium - interface down/up cycle
      logger.warn('NetworkWatchdog: Phase 2 - interface down/up cycle');
      await execAsync('sudo ip link set wlan1 down 2>/dev/null || true');
      await ctx.sleep(2000);
      await execAsync('sudo ip link set wlan1 up 2>/dev/null || true');
      await ctx.sleep(5000);
      await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null || true');
      await ctx.sleep(5000);
      await execAsync('sudo dhclient wlan1 2>/dev/null || true');
      await ctx.sleep(3000);

    } else if (attempt === 4) {
      // Phase 3: Aggressive - restart wpa_supplicant via systemd
      logger.warn('NetworkWatchdog: Phase 3 - wpa_supplicant@wlan1 restart via systemd');
      await restartWpaSupplicantWlan1();
      await ctx.sleep(5000);
      await execAsync('sudo dhclient wlan1 2>/dev/null || true');
      await ctx.sleep(3000);

    } else if (attempt === 5) {
      // Phase 4: Modprobe - USB WiFi driver reload
      const modprobeGuard = ctx.getModprobeGuard();
      const isMesh = ctx.isMeshEnvironment();
      const outageDuration = ctx.state.internet.recoveryStartedAt ? Date.now() - ctx.state.internet.recoveryStartedAt : 0;
      if (outageDuration < modprobeGuard) {
        logger.warn('NetworkWatchdog: Phase 4 (modprobe) SKIPPED — outage too recent', {
          outageDurationSec: Math.round(outageDuration / 1000),
          minRequiredSec: modprobeGuard / 1000,
          isMesh,
        });
        await restartWpaSupplicantWlan1();
        await ctx.sleep(5000);
        await execAsync('sudo dhclient wlan1 2>/dev/null || true');
        await ctx.sleep(3000);
        logger.warn('NetworkWatchdog: Phase 4 demoted to wpa_supplicant restart');
      } else {
      logger.warn('NetworkWatchdog: Phase 4 - USB WiFi driver reload (modprobe)');

      // Save USB device path BEFORE modprobe -r
      let savedUsbDevicePath = null;
      try {
        const { stdout: devPath } = await execAsync(
          'readlink -f /sys/class/net/wlan1/device 2>/dev/null | xargs -I{} basename $(dirname {}) 2>/dev/null || echo ""'
        );
        savedUsbDevicePath = devPath.trim() || null;
      } catch { /* wlan1 may already be gone */ }

      const driverResult = await execAsync(
        'readlink /sys/class/net/wlan1/device/driver 2>/dev/null | xargs basename 2>/dev/null || echo ""'
      ).catch(() => ({ stdout: '' }));
      const driverModule = driverResult.stdout.trim();

      if (driverModule) {
        logger.warn('NetworkWatchdog: Reloading USB WiFi driver module', { module: driverModule });
        await execAsync(`sudo modprobe -r ${driverModule} 2>/dev/null || true`);
        await ctx.sleep(3000);
        await execAsync(`sudo modprobe ${driverModule} 2>/dev/null || true`);

        let wlan1Back = false;
        for (let i = 0; i < 3; i++) {
          await ctx.sleep(3000);
          try {
            await execAsync('ip link show wlan1 2>/dev/null');
            wlan1Back = true;
            logger.info('NetworkWatchdog: wlan1 reappeared after modprobe', { waitSeconds: (i + 1) * 3 });
            break;
          } catch { /* wlan1 pas encore là */ }
        }

        if (!wlan1Back) {
          logger.error('NetworkWatchdog: wlan1 did NOT reappear after modprobe — USB hardware issue likely');
          if (savedUsbDevicePath) {
            await attemptUsbPowerCycle(savedUsbDevicePath, ctx.sleep);
          }
        }

        await restartWpaSupplicantWlan1();
        await ctx.sleep(5000);
        await execAsync('sudo dhclient wlan1 2>/dev/null || true');
        await ctx.sleep(3000);
      } else {
        logger.error('NetworkWatchdog: Cannot detect USB WiFi driver module, skipping modprobe');
        await execAsync('sudo ip link set wlan1 down 2>/dev/null || true');
        await ctx.sleep(2000);
        await execAsync('sudo ip link set wlan1 up 2>/dev/null || true');
        await ctx.sleep(5000);
        await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null || true');
        await ctx.sleep(3000);
      }
      } // end of outageDuration >= modprobeGuard

    } else {
      // Phase 5: USB power-cycle — last resort
      const usbCycleGuard = ctx.getUsbCycleGuard();
      const isMeshPhase5 = ctx.isMeshEnvironment();
      const outageDurationPhase5 = ctx.state.internet.recoveryStartedAt ? Date.now() - ctx.state.internet.recoveryStartedAt : 0;
      if (outageDurationPhase5 < usbCycleGuard) {
        logger.warn('NetworkWatchdog: Phase 5 (USB power-cycle) SKIPPED — outage too recent', {
          outageDurationSec: Math.round(outageDurationPhase5 / 1000),
          minRequiredSec: usbCycleGuard / 1000,
          isMesh: isMeshPhase5,
        });
        await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null || true');
        await ctx.sleep(5000);
        await execAsync('sudo dhclient wlan1 2>/dev/null || true');
        await ctx.sleep(3000);
      } else {
        logger.warn('NetworkWatchdog: Phase 5 - USB power-cycle (unbind/rebind)');
        await attemptUsbPowerCycleAll(ctx.sleep);
        await ctx.sleep(5000);
        await restartWpaSupplicantWlan1();
        await ctx.sleep(5000);
        await execAsync('sudo dhclient wlan1 2>/dev/null || true');
        await ctx.sleep(3000);
      }
    }

    // Final check
    const health = await checkInternetHealth();
    if (health.healthy) {
      await execAsync('sudo iwconfig wlan1 power off 2>/dev/null || true').catch(() => {});

      logger.info('NetworkWatchdog: Internet récupéré avec succès', {
        ip: health.ipAddress,
        gateway: health.gateway,
        phase: attempt <= 2 ? 'gentle' : attempt === 3 ? 'medium' : attempt === 4 ? 'aggressive' : attempt === 5 ? 'modprobe' : 'usb-power-cycle',
      });
      ctx.state.internet.recoveryAttempts = 0;
      ctx.state.internet.healthy = true;
      ctx.state.internet.issues = [];
      ctx.state.internet.ipAddress = health.ipAddress;
      ctx.state.internet.gateway = health.gateway;
      return { success: true, phase: attempt };
    } else {
      logger.error('NetworkWatchdog: Récupération internet échouée', {
        issues: health.issues,
        phase: attempt <= 2 ? 'gentle' : attempt === 3 ? 'medium' : attempt === 4 ? 'aggressive' : attempt === 5 ? 'modprobe' : 'usb-power-cycle',
      });
      return { success: false, issues: health.issues, phase: attempt };
    }
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors de la récupération internet', {
      error: error.message,
      attempt,
    });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// BSSID MISMATCH
// =============================================================================

/**
 * @param {object} ctx - Shared context
 */
async function checkBssidMismatch(ctx) {
  try {
    const { stdout } = await execAsync('wpa_cli -i wlan1 status 2>/dev/null');
    const bssidMatch = stdout.match(/^bssid=([0-9a-f:]+)/im);
    if (!bssidMatch) return;

    const connectedBssid = bssidMatch[1].toLowerCase();

    const wpaPaths = [
      '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
      '/etc/wpa_supplicant/wpa_supplicant.conf',
    ];
    let lockedBssid = null;
    const fs = require('fs-extra');
    for (const p of wpaPaths) {
      try {
        const content = await fs.readFile(p, 'utf8');
        const m = content.match(/^\s*bssid=([0-9a-f:]+)/im);
        if (m) { lockedBssid = m[1].toLowerCase(); break; }
      } catch { /* file not found */ }
    }

    if (!lockedBssid) {
      ctx.state.bssidMismatch.detectedAt = 0;
      ctx.state.bssidMismatch.cleared = false;
      return;
    }

    if (connectedBssid === lockedBssid) {
      ctx.state.bssidMismatch.detectedAt = 0;
      ctx.state.bssidMismatch.cleared = false;
      return;
    }

    if (!ctx.state.bssidMismatch.detectedAt) {
      ctx.state.bssidMismatch.detectedAt = Date.now();
      logger.warn('NetworkWatchdog: BSSID lock mismatch detected', {
        connected: connectedBssid,
        locked: lockedBssid,
      });
    }

    const elapsed = Date.now() - ctx.state.bssidMismatch.detectedAt;
    if (elapsed >= ctx.BSSID_MISMATCH_THRESHOLD && !ctx.state.bssidMismatch.cleared) {
      logger.info('NetworkWatchdog: Auto-clearing stale BSSID lock', {
        connected: connectedBssid,
        locked: lockedBssid,
        elapsedMs: elapsed,
      });
      await safeNetworkOperations.executeOperation(OPERATIONS.REMOVE_BSSID_LOCK);
      ctx.state.bssidMismatch.cleared = true;

      if (ctx.socketRef && ctx.socketRef.connected) {
        ctx.socketRef.emit('network_alert', {
          siteId: config.site.id,
          type: 'bssid_lock_auto_cleared',
          severity: 'info',
          message: `BSSID lock auto-cleared: was locked to ${lockedBssid} but connected to ${connectedBssid}`,
          connected: connectedBssid,
          locked: lockedBssid,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    logger.debug('NetworkWatchdog: BSSID mismatch check failed', { error: error.message });
  }
}

// =============================================================================
// WLAN1 BACKGROUND RECONNECT
// =============================================================================

/** @type {NodeJS.Timeout|null} */
let wlan1ReconnectInterval = null;

async function wlan1ReconnectLoop() {
  try {
    const wlan1Ip = await getInternetIp();
    if (wlan1Ip) {
      logger.info('NetworkWatchdog: wlan1 reconnected in background', { ip: wlan1Ip });
      stopWlan1Reconnect();
      return;
    }

    const ethernet = await checkEthernetConnection();
    if (!ethernet.connected) {
      logger.info('NetworkWatchdog: Ethernet lost, stopping wlan1 background reconnect (main watchdog takes over)');
      stopWlan1Reconnect();
      return;
    }

    logger.info('NetworkWatchdog: Background wlan1 reconnect attempt (Ethernet active)');

    await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 5000));

    await execAsync('sudo dhclient wlan1 -timeout 8 2>/dev/null || sudo dhcpcd -n wlan1 2>/dev/null').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const newIp = await getInternetIp();
    if (newIp) {
      logger.info('NetworkWatchdog: wlan1 reconnected via background loop', { ip: newIp });
      await execAsync('sudo iwconfig wlan1 power off 2>/dev/null || true').catch(() => {});
      stopWlan1Reconnect();
    } else {
      logger.info('NetworkWatchdog: wlan1 still disconnected, will retry in 5min');
    }
  } catch (error) {
    logger.error('NetworkWatchdog: wlan1 background reconnect error', { error: error.message });
  }
}

const WLAN1_RECONNECT_INTERVAL = 5 * 60 * 1000;

function startWlan1Reconnect() {
  if (wlan1ReconnectInterval) return;
  logger.info('NetworkWatchdog: Starting background wlan1 reconnect loop', {
    intervalMs: WLAN1_RECONNECT_INTERVAL,
  });
  setTimeout(() => wlan1ReconnectLoop(), 30 * 1000);
  wlan1ReconnectInterval = setInterval(wlan1ReconnectLoop, WLAN1_RECONNECT_INTERVAL);
}

function stopWlan1Reconnect() {
  if (!wlan1ReconnectInterval) return;
  clearInterval(wlan1ReconnectInterval);
  wlan1ReconnectInterval = null;
}

// =============================================================================
// WATCH LOOP
// =============================================================================

/**
 * @param {object} ctx - Shared context
 */
async function internetWatchLoop(ctx) {
  try {
    if (ctx.isInGracePeriod('internet')) {
      logger.info('NetworkWatchdog: Internet check skipped (grace period)');
      return;
    }

    const wasDown = !ctx.state.internet.healthy && ctx.state.internet.lastCheck !== null;
    const hadRecoveryAttempts = ctx.state.internet.recoveryAttempts > 0;

    const health = await checkInternetHealth();
    ctx.state.internet.lastCheck = Date.now();
    ctx.state.internet.healthy = health.healthy;
    ctx.state.internet.issues = health.issues;
    ctx.state.internet.ipAddress = health.ipAddress;
    ctx.state.internet.gateway = health.gateway;
    ctx.state.internet.connectionType = health.connectionType;

    // Notify central when internet recovers after a failure
    if (health.healthy && (wasDown || hadRecoveryAttempts)) {
      await execAsync('sudo iwconfig wlan1 power off 2>/dev/null || true').catch(() => {});

      const recoveryDurationMs = ctx.state.internet.recoveryStartedAt
        ? Date.now() - ctx.state.internet.recoveryStartedAt
        : null;
      const maxPhaseReached = ctx.state.internet.recoveryAttempts;

      logger.info('NetworkWatchdog: Internet recovered', {
        ip: health.ipAddress,
        connectionType: health.connectionType,
        recoveryDurationMs,
        maxPhaseReached,
      });
      ctx.state.internet.recoveryAttempts = 0;
      ctx.state.internet.recoveryStartedAt = 0;

      if (ctx.socketRef && ctx.socketRef.connected) {
        ctx.socketRef.emit('network_recovered', {
          siteId: config.site.id,
          type: 'internet',
          connectionType: health.connectionType,
          ip: health.ipAddress,
          recoveryDurationMs,
          maxPhaseReached,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // BSSID mismatch check when healthy on WiFi
    if (health.healthy && health.connectionType === 'wifi') {
      await checkBssidMismatch(ctx);
      stopWlan1Reconnect();
    }

    // Background wlan1 reconnect when healthy via Ethernet
    if (health.healthy && health.connectionType === 'ethernet') {
      const wlan1Ip = await getInternetIp();
      if (!wlan1Ip) {
        startWlan1Reconnect();
      } else {
        stopWlan1Reconnect();
      }
    }

    if (!health.healthy) {
      if (health.connectionType === 'ethernet') {
        logger.warn('NetworkWatchdog: Problèmes internet via Ethernet', {
          issues: health.issues,
        });
        return;
      }

      const captivePortal = await detectCaptivePortal();
      if (captivePortal.detected) {
        logger.warn('NetworkWatchdog: Captive portal detected — recovery skipped', {
          redirectUrl: captivePortal.redirectUrl,
        });
        if (ctx.socketRef && ctx.socketRef.connected) {
          ctx.socketRef.emit('network_alert', {
            siteId: config.site.id,
            type: 'captive_portal_detected',
            severity: 'warning',
            message: 'Portail captif détecté. Le Pi ne peut pas se connecter automatiquement. Solutions : whitelist MAC, Ethernet ou CPL.',
            redirectUrl: captivePortal.redirectUrl,
            timestamp: new Date().toISOString(),
          });
        }
        return;
      }

      if (!ctx.state.internet.recoveryStartedAt) {
        ctx.state.internet.recoveryStartedAt = Date.now();
      }

      logger.warn('NetworkWatchdog: Problèmes internet détectés', {
        issues: health.issues,
      });

      if (ctx.canAttemptRecovery('internet')) {
        const result = await attemptInternetRecovery(ctx);
        if (result.success) {
          if (ctx.socketRef && !ctx.socketRef.connected) {
            logger.info('NetworkWatchdog: WiFi recovered, forcing immediate Socket.IO reconnect');
            ctx.socketRef.disconnect();
            setTimeout(() => ctx.socketRef.connect(), 500);
          }
          setTimeout(() => internetWatchLoop(ctx), 5000);
        } else {
          const backoffDelay = ctx.getBackoffDelay(ctx.state.internet.recoveryAttempts);
          logger.info('NetworkWatchdog: Next retry with progressive back-off', {
            attempt: ctx.state.internet.recoveryAttempts,
            backoffDelaySec: backoffDelay / 1000,
          });
          setTimeout(() => internetWatchLoop(ctx), backoffDelay);
        }
      } else {
        logger.error('NetworkWatchdog: Trop de tentatives de récupération internet', {
          attempts: ctx.state.internet.recoveryAttempts,
          cooldown: ctx.RECOVERY_COOLDOWN,
        });

        if (ctx.socketRef && ctx.socketRef.connected) {
          ctx.socketRef.emit('network_alert', {
            siteId: config.site.id,
            type: 'internet_failure',
            severity: 'critical',
            issues: health.issues,
            recoveryAttempts: ctx.state.internet.recoveryAttempts,
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

module.exports = {
  checkEthernetConnection,
  getInternetIp,
  getGateway,
  ping,
  checkInternetHealth,
  detectCaptivePortal,
  attemptUsbPowerCycle,
  attemptUsbPowerCycleAll,
  restartWpaSupplicantWlan1,
  attemptInternetRecovery,
  checkBssidMismatch,
  wlan1ReconnectLoop,
  startWlan1Reconnect,
  stopWlan1Reconnect,
  internetWatchLoop,
};
