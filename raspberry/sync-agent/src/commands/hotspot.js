const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');
const { safeNetworkOperations, OPERATIONS } = require('../services/safe-network-operations');

const execAsync = util.promisify(exec);

/**
 * Met à jour la configuration du hotspot WiFi (SSID et mot de passe)
 * Utilise SafeNetworkOperations pour adapter le comportement au profil réseau.
 *
 * En environnement mesh : Les changements sont sauvegardés mais un reboot est requis
 * En environnement simple : Les changements sont appliqués immédiatement
 *
 * @param {Object} data - { ssid?, password? }
 */
async function updateHotspot(data) {
  const { ssid, password } = data;

  logger.info('Updating hotspot configuration', { ssid: ssid || '(unchanged)' });

  if (!ssid && !password) {
    throw new Error('At least one of ssid or password must be provided');
  }

  // Validation du mot de passe WiFi (WPA2 requiert 8-63 caractères)
  if (password && (password.length < 8 || password.length > 63)) {
    throw new Error('WiFi password must be between 8 and 63 characters');
  }

  // Validation du SSID (max 32 caractères)
  if (ssid && ssid.length > 32) {
    throw new Error('SSID must be 32 characters or less');
  }

  const results = {
    success: true,
    ssidUpdated: false,
    passwordUpdated: false,
    needsReboot: false,
    message: '',
  };

  try {
    // Update SSID using safe operations
    if (ssid) {
      const ssidResult = await safeNetworkOperations.executeOperation(
        OPERATIONS.UPDATE_HOTSPOT_SSID,
        { ssid }
      );

      if (!ssidResult.success && !ssidResult.blocked) {
        throw new Error(ssidResult.error || 'Failed to update SSID');
      }

      results.ssidUpdated = true;
      if (ssidResult.needsReboot) {
        results.needsReboot = true;
      }
    }

    // Update password using safe operations
    if (password) {
      const passwordResult = await safeNetworkOperations.executeOperation(
        OPERATIONS.UPDATE_HOTSPOT_PASSWORD,
        { password }
      );

      if (!passwordResult.success && !passwordResult.blocked) {
        throw new Error(passwordResult.error || 'Failed to update password');
      }

      results.passwordUpdated = true;
      if (passwordResult.needsReboot) {
        results.needsReboot = true;
      }
    }

    // Build result message
    if (results.needsReboot) {
      results.message = 'Configuration saved. Reboot required to apply changes safely (mesh environment detected).';
    } else {
      results.message = 'Hotspot configuration updated and applied.';
    }

    logger.info('Hotspot configuration updated', {
      ssidUpdated: results.ssidUpdated,
      passwordUpdated: results.passwordUpdated,
      needsReboot: results.needsReboot,
    });

    return results;
  } catch (error) {
    logger.error('Hotspot update failed', { error: error.message });
    throw error;
  }
}

/**
 * Récupère la configuration actuelle du hotspot (SSID uniquement, pas le mot de passe)
 */
async function getHotspotConfig() {
  logger.info('Retrieving hotspot configuration');

  const hostapdPath = '/etc/hostapd/hostapd.conf';

  try {
    if (!await fs.pathExists(hostapdPath)) {
      return {
        success: true,
        configured: false,
        message: 'Hotspot not configured on this device',
      };
    }

    const hostapdContent = await fs.readFile(hostapdPath, 'utf8');

    // Extraire le SSID
    const ssidMatch = hostapdContent.match(/^ssid=(.*)$/m);
    const ssid = ssidMatch ? ssidMatch[1] : null;

    // Extraire le channel
    const channelMatch = hostapdContent.match(/^channel=(.*)$/m);
    const channel = channelMatch ? parseInt(channelMatch[1]) : null;

    // Vérifier si hostapd est actif
    let isActive = false;
    try {
      const { stdout } = await execAsync('sudo systemctl is-active hostapd');
      isActive = stdout.trim() === 'active';
    } catch {
      isActive = false;
    }

    return {
      success: true,
      configured: true,
      ssid,
      channel,
      isActive,
    };
  } catch (error) {
    logger.error('Failed to retrieve hotspot config:', error);
    throw error;
  }
}

/**
 * Répare le hotspot WiFi
 * Utilise SafeNetworkOperations pour adapter le comportement au profil réseau.
 *
 * @param {Object} data - { autoFix?, rebootNow? }
 *   - autoFix: Si true, applique les corrections (change le canal dans la config)
 *   - rebootNow: Si true ET autoFix, redémarre le Pi après avoir changé la config
 *
 * IMPORTANT: En environnement mesh, le changement de canal n'est PAS appliqué
 * immédiatement car redémarrer hostapd coupe la connexion WiFi cliente (wlan1).
 * Le changement sera effectif au prochain reboot du Pi.
 */
async function fixHotspot(data) {
  const { autoFix = false, rebootNow = false } = data || {};
  logger.info('Running hotspot fix', { autoFix, rebootNow });

  try {
    // Use SafeNetworkOperations for profile-aware behavior
    const result = await safeNetworkOperations.executeOperation(
      OPERATIONS.FIX_HOTSPOT,
      { autoFix, rebootNow }
    );

    // If operation was blocked (shouldn't happen for fix_hotspot)
    if (result.blocked) {
      return {
        success: false,
        blocked: true,
        reason: result.reason,
        timestamp: new Date().toISOString(),
      };
    }

    // Add metadata
    result.timestamp = new Date().toISOString();
    result.autoFix = autoFix;

    // If needs reboot and user requested it
    if (result.needsReboot && rebootNow) {
      logger.info('Reboot requested after fix_hotspot');
      // Schedule reboot
      setTimeout(() => {
        execAsync('sudo reboot').catch(e => logger.error('Reboot failed', { error: e.message }));
      }, 2000);
      result.rebootInitiated = true;
      result.message = 'Configuration saved and reboot initiated.';
    } else if (result.needsReboot) {
      result.message = 'Configuration saved. Reboot required to apply changes safely.';
    }

    logger.info('Hotspot fix completed', {
      needsReboot: result.needsReboot,
      rebootInitiated: result.rebootInitiated,
      channelChanged: result.channelChanged,
    });

    return result;
  } catch (error) {
    logger.error('Hotspot fix failed', { error: error.message });

    // En cas d'erreur, tenter les diagnostics manuels
    try {
      return await runManualHotspotDiagnostics();
    } catch (manualError) {
      throw error;
    }
  }
}

/**
 * Redémarre le Pi (pour appliquer un changement de canal en attente)
 */
async function rebootPi() {
  logger.warn('Reboot requested by user');

  // Attendre 2 secondes pour que la réponse soit envoyée
  setTimeout(async () => {
    try {
      await execAsync('sudo reboot');
    } catch (error) {
      logger.error('Reboot failed:', error);
    }
  }, 2000);

  return {
    success: true,
    message: 'Reboot initiated. The device will restart in a few seconds.',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Diagnostics manuels du hotspot si le script n'est pas disponible
 */
async function runManualHotspotDiagnostics() {
  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    manual: true,
    checks: [],
  };

  // 1. Vérifier hostapd
  try {
    const { stdout } = await execAsync('systemctl is-active hostapd 2>/dev/null || echo "inactive"');
    results.checks.push({
      name: 'hostapd',
      status: stdout.trim() === 'active' ? 'ok' : 'fail',
      value: stdout.trim(),
    });
  } catch {
    results.checks.push({ name: 'hostapd', status: 'fail', value: 'error' });
  }

  // 2. Vérifier dnsmasq
  try {
    const { stdout } = await execAsync('systemctl is-active dnsmasq 2>/dev/null || echo "inactive"');
    results.checks.push({
      name: 'dnsmasq',
      status: stdout.trim() === 'active' ? 'ok' : 'fail',
      value: stdout.trim(),
    });
  } catch {
    results.checks.push({ name: 'dnsmasq', status: 'fail', value: 'error' });
  }

  // 3. Vérifier wlan0
  try {
    const { stdout } = await execAsync('ip addr show wlan0 2>/dev/null | grep "inet " | head -1');
    const hasIp = stdout.trim().length > 0;
    results.checks.push({
      name: 'wlan0 IP',
      status: hasIp ? 'ok' : 'warning',
      value: hasIp ? stdout.trim().match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1] || 'configured' : 'no IP',
    });
  } catch {
    results.checks.push({ name: 'wlan0 IP', status: 'warning', value: 'not configured' });
  }

  // 4. Lire le SSID configuré
  try {
    const { stdout } = await execAsync('grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null || echo ""');
    const ssid = stdout.trim().replace('ssid=', '');
    results.checks.push({
      name: 'SSID',
      status: ssid ? 'ok' : 'warning',
      value: ssid || 'not configured',
    });
  } catch {
    results.checks.push({ name: 'SSID', status: 'warning', value: 'unable to read' });
  }

  // 5. Lire le channel configuré
  try {
    const { stdout } = await execAsync('grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null || echo ""');
    const channel = stdout.trim().replace('channel=', '');
    results.checks.push({
      name: 'Channel',
      status: channel ? 'ok' : 'warning',
      value: channel || 'not configured',
    });
  } catch {
    results.checks.push({ name: 'Channel', status: 'warning', value: 'unable to read' });
  }

  // 6. Vérifier rfkill
  try {
    const { stdout } = await execAsync('rfkill list wifi 2>/dev/null | grep -i "blocked" || echo ""');
    const blocked = stdout.toLowerCase().includes('yes');
    results.checks.push({
      name: 'rfkill',
      status: blocked ? 'fail' : 'ok',
      value: blocked ? 'WiFi blocked' : 'WiFi not blocked',
    });
  } catch {
    results.checks.push({ name: 'rfkill', status: 'ok', value: 'check failed (probably ok)' });
  }

  return results;
}

module.exports = {
  updateHotspot,
  getHotspotConfig,
  fixHotspot,
  rebootPi,
  runManualHotspotDiagnostics,
};
