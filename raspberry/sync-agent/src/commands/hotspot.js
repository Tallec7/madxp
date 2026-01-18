const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Met à jour la configuration du hotspot WiFi (SSID et mot de passe)
 * Modifie /etc/hostapd/hostapd.conf et redémarre le service hostapd
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

  const hostapdPath = '/etc/hostapd/hostapd.conf';
  const backupPath = '/etc/hostapd/hostapd.conf.backup';

  try {
    // Vérifier que hostapd.conf existe
    if (!await fs.pathExists(hostapdPath)) {
      throw new Error('hostapd.conf not found - hotspot not configured on this device');
    }

    // Lire la configuration actuelle
    let hostapdContent = await fs.readFile(hostapdPath, 'utf8');

    // Créer un backup
    await execAsync(`sudo cp ${hostapdPath} ${backupPath}`);
    logger.info('Backup created', { path: backupPath });

    // Modifier le SSID si fourni
    if (ssid) {
      hostapdContent = hostapdContent.replace(/^ssid=.*/m, `ssid=${ssid}`);
      logger.info('SSID updated', { ssid });
    }

    // Modifier le mot de passe si fourni
    if (password) {
      hostapdContent = hostapdContent.replace(/^wpa_passphrase=.*/m, `wpa_passphrase=${password}`);
      logger.info('WiFi password updated');
    }

    // Écrire la nouvelle configuration (via sudo car fichier root)
    const tempPath = '/tmp/hostapd.conf.tmp';
    await fs.writeFile(tempPath, hostapdContent);
    await execAsync(`sudo mv ${tempPath} ${hostapdPath}`);
    await execAsync(`sudo chmod 600 ${hostapdPath}`);

    // Redémarrer hostapd pour appliquer les changements
    logger.info('Restarting hostapd service...');
    await execAsync('sudo systemctl restart hostapd');

    // Attendre que le service soit actif
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { stdout } = await execAsync('sudo systemctl is-active hostapd');
    const isActive = stdout.trim() === 'active';

    if (!isActive) {
      // Restaurer le backup si le service ne démarre pas
      logger.error('hostapd failed to start, restoring backup');
      await execAsync(`sudo cp ${backupPath} ${hostapdPath}`);
      await execAsync('sudo systemctl restart hostapd');
      throw new Error('Failed to restart hostapd with new configuration - backup restored');
    }

    logger.info('Hotspot configuration updated successfully');

    return {
      success: true,
      message: 'Hotspot configuration updated',
      ssidUpdated: !!ssid,
      passwordUpdated: !!password,
    };
  } catch (error) {
    logger.error('Hotspot update failed:', error);
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
 * Exécute fix-hotspot.sh avec les options appropriées
 *
 * @param {Object} data - { autoFix?, rebootNow? }
 *   - autoFix: Si true, applique les corrections (change le canal dans la config)
 *   - rebootNow: Si true ET autoFix, redémarre le Pi après avoir changé la config
 *
 * IMPORTANT: Le changement de canal n'est PAS appliqué immédiatement car redémarrer
 * hostapd coupe la connexion WiFi cliente (wlan1). Le changement sera effectif
 * au prochain reboot du Pi.
 */
async function fixHotspot(data) {
  const { autoFix = false, rebootNow = false } = data || {};
  logger.info('Running hotspot fix', { autoFix, rebootNow });

  try {
    const scriptPath = config.paths.root + '/scripts/fix-hotspot.sh';

    // Vérifier si le script existe
    if (!await fs.pathExists(scriptPath)) {
      logger.warn('fix-hotspot.sh not found, running manual hotspot check');
      return await runManualHotspotDiagnostics();
    }

    // Construire les arguments
    const args = ['--json'];
    if (autoFix) {
      args.push('--auto-fix');
    }
    if (autoFix && rebootNow) {
      args.push('--reboot-now');
    }

    const { stdout, stderr } = await execAsync(`sudo bash ${scriptPath} ${args.join(' ')} 2>&1`, {
      timeout: 120000, // 2 minutes max
    });

    // Parser le JSON retourné par le script
    let result;
    try {
      result = JSON.parse(stdout.trim());
    } catch (parseError) {
      logger.warn('Failed to parse JSON output, returning raw output', { stdout });
      return {
        success: true,
        timestamp: new Date().toISOString(),
        autoFix,
        rebootNow,
        output: stdout,
        errors: stderr || null,
        scriptPath,
      };
    }

    // Ajouter des métadonnées
    result.timestamp = new Date().toISOString();
    result.autoFix = autoFix;
    result.rebootRequested = autoFix && rebootNow;

    logger.info('Hotspot fix completed', {
      channelChanged: result.fix?.channelChanged,
      needsReboot: result.fix?.needsReboot,
      rebootRequested: result.rebootRequested,
    });

    return result;
  } catch (error) {
    logger.error('Hotspot fix failed:', error);

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
