/**
 * Service Metrics — systemd services status, orphan detection, kiosk status.
 * Extracted from metrics.js (ADR-044).
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const logger = require('../logger');

const execAsync = util.promisify(exec);

// =============================================================================
// SERVICES STATUS
// =============================================================================

/**
 * Récupère l'état des services systemd critiques
 */
async function getServicesStatus() {
  const services = [
    { name: 'neopro-app', description: 'Socket.IO local (port 3000)' },
    { name: 'neopro-sync-agent', description: 'Synchronisation cloud' },
    { name: 'neopro-kiosk', description: 'Affichage TV (Chromium)' },
    { name: 'neopro-admin', description: 'Admin panel (port 8080)' },
    { name: 'nginx', description: 'Serveur web' },
    { name: 'hostapd', description: 'Hotspot WiFi' },
    { name: 'dnsmasq', description: 'DNS/DHCP hotspot' },
  ];

  const results = [];

  for (const service of services) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${service.name} 2>/dev/null || echo "inactive"`);
      const status = stdout.trim();

      let statusInfo = {
        name: service.name,
        description: service.description,
        status: status,
        active: status === 'active',
        failed: status === 'failed',
      };

      // Si le service est failed, récupérer le message d'erreur
      if (status === 'failed') {
        try {
          const { stdout: errorOutput } = await execAsync(
            `journalctl -u ${service.name} -n 3 --no-pager -q 2>/dev/null | tail -1`
          );
          statusInfo.lastError = errorOutput.trim() || null;
        } catch {
          statusInfo.lastError = null;
        }
      }

      results.push(statusInfo);
    } catch {
      results.push({
        name: service.name,
        description: service.description,
        status: 'unknown',
        active: false,
        failed: false,
      });
    }
  }

  return results;
}

// =============================================================================
// ORPHAN SERVICES
// =============================================================================

/**
 * Détecte les services systemd orphelins (non-légitimes) qui tournent sous le préfixe neopro-*.
 * Les services orphelins sont ceux qui ne font pas partie de la liste des services légitimes
 * et qui sont soit actifs soit en état "failed" (crash-loop via Restart=always).
 * Retourne un tableau d'objets { name, status, restarts } pour chaque orphelin détecté.
 */
async function getOrphanServices() {
  const LEGITIMATE_SERVICES = new Set([
    'neopro-app',
    'neopro-admin',
    'neopro-kiosk',
    'neopro-sync-agent',
    'neopro-sync-guardian',
    'neopro-hotspot-watchdog',
    'neopro-hotspot-optimizer',
    'neopro-usb-wifi',
    'neopro-sd-health',
    'neopro-backup',
    'neopro-video-processor',
  ]);

  const orphans = [];

  try {
    // List all neopro-* units known to systemd (active, failed, or loaded)
    const { stdout } = await execAsync(
      'systemctl list-units "neopro-*" --all --no-pager --no-legend --plain 2>/dev/null || true'
    );

    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      // Format: UNIT LOAD ACTIVE SUB DESCRIPTION...
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const unitName = parts[0].replace('.service', '');
      const activeState = parts[2]; // active, inactive, failed

      if (LEGITIMATE_SERVICES.has(unitName)) continue;
      if (!unitName.startsWith('neopro-')) continue;
      if (activeState === 'inactive') continue;

      // This is an orphan that's active or failed — get restart count
      let restarts = 0;
      try {
        const { stdout: nRestarts } = await execAsync(
          `systemctl show ${unitName} -p NRestarts --value 2>/dev/null || echo "0"`
        );
        restarts = parseInt(nRestarts.trim(), 10) || 0;
      } catch {
        // ignore
      }

      orphans.push({
        name: unitName,
        status: activeState,
        restarts,
      });
    }
  } catch (error) {
    logger.warn('Failed to detect orphan services:', error.message);
  }

  return orphans;
}

// =============================================================================
// FAILED LEGITIMATE SERVICES
// =============================================================================

/**
 * Détecte les services légitimes neopro-* qui sont en état failed ou activating
 * (crash-loop). Complémente getOrphanServices() qui ne regarde que les services
 * NON-légitimes. Retourne un tableau d'objets { name, status, restarts }.
 */
async function getFailedServices() {
  const MONITORED_SERVICES = [
    'neopro-app',
    'neopro-admin',
    'neopro-kiosk',
    'neopro-sync-agent',
  ];

  const failed = [];

  for (const service of MONITORED_SERVICES) {
    try {
      const { stdout: status } = await execAsync(
        `systemctl is-active ${service} 2>/dev/null || echo "inactive"`,
        { timeout: 5000 }
      );
      const state = status.trim();
      if (state === 'active') continue;

      let restarts = 0;
      try {
        const { stdout: nRestarts } = await execAsync(
          `systemctl show ${service} -p NRestarts --value 2>/dev/null || echo "0"`,
          { timeout: 5000 }
        );
        restarts = parseInt(nRestarts.trim(), 10) || 0;
      } catch {
        // ignore
      }

      // Only report if actually failed/activating with restarts, not just stopped
      if (state === 'failed' || state === 'activating' || restarts > 3) {
        failed.push({ name: service, status: state, restarts });
      }
    } catch {
      // ignore — service might not exist on this Pi
    }
  }

  return failed;
}

// =============================================================================
// KIOSK STATUS
// =============================================================================

/**
 * Récupère le statut du kiosk Chromium via le fichier écrit par le watchdog.
 * Retourne null si le fichier n'existe pas (watchdog pas encore démarré).
 */
async function getKioskStatus() {
  const statusFile = '/home/pi/neopro/data/kiosk-status.json';
  try {
    const content = await fs.promises.readFile(statusFile, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// =============================================================================
// NODE.JS DEPENDENCIES CHECK
// =============================================================================

const path = require('path');

/**
 * Vérifie que toutes les dépendances Node.js sont installées pour chaque module.
 * Détecte les node_modules corrompus ou incomplets (ex: OTA interrompu).
 */
async function getDependenciesStatus() {
  const modules = [
    { dir: '/home/pi/neopro/server', name: 'server' },
    { dir: '/home/pi/neopro/admin', name: 'admin' },
    { dir: '/home/pi/neopro/sync-agent', name: 'sync-agent' },
  ];

  const results = [];
  for (const mod of modules) {
    try {
      const pkgPath = path.join(mod.dir, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = Object.keys(pkg.dependencies || {});
      const missing = deps.filter(dep => !fs.existsSync(path.join(mod.dir, 'node_modules', dep)));

      results.push({
        module: mod.name,
        totalDeps: deps.length,
        missing,
        status: missing.length === 0 ? 'ok' : 'error',
      });

      if (missing.length > 0) {
        logger.warn(`Missing dependencies in ${mod.name}:`, { missing });
      }
    } catch (err) {
      logger.error(`Error checking deps for ${mod.name}:`, { error: err.message });
      results.push({ module: mod.name, totalDeps: 0, missing: [], status: 'unknown' });
    }
  }
  return results;
}

module.exports = {
  getServicesStatus,
  getOrphanServices,
  getFailedServices,
  getKioskStatus,
  getDependenciesStatus,
};
