const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Exécute le script de diagnostic complet (diagnose-pi.sh)
 * Retourne un rapport structuré avec tous les checks
 */
async function runDiagnostics() {
  logger.info('Running comprehensive diagnostics');

  try {
    const scriptPath = config.paths.root + '/scripts/diagnose-pi.sh';

    // Vérifier si le script existe
    if (!await fs.pathExists(scriptPath)) {
      logger.warn('diagnose-pi.sh not found, running manual diagnostics');
      return await runManualDiagnostics();
    }

    // Exécuter le script avec timeout
    const { stdout, stderr } = await execAsync(`bash ${scriptPath} 2>&1`, {
      timeout: 60000, // 60 secondes max
    });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      output: stdout,
      errors: stderr || null,
      scriptPath,
    };
  } catch (error) {
    logger.error('Diagnostics failed:', error);

    // En cas d'erreur du script, tenter les diagnostics manuels
    try {
      return await runManualDiagnostics();
    } catch (manualError) {
      throw error;
    }
  }
}

/**
 * Diagnostics manuels si le script n'est pas disponible
 */
async function runManualDiagnostics() {
  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    manual: true,
    checks: [],
  };

  // 1. Services systemd
  const services = ['neopro-app', 'neopro-sync-agent', 'neopro-kiosk', 'nginx', 'hostapd', 'dnsmasq'];
  for (const service of services) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || echo "inactive"`);
      const status = stdout.trim();
      results.checks.push({
        category: 'Services',
        name: service,
        status: status === 'active' ? 'ok' : 'fail',
        value: status,
      });
    } catch {
      results.checks.push({
        category: 'Services',
        name: service,
        status: 'fail',
        value: 'error',
      });
    }
  }

  // 2. Ports
  const ports = [80, 3000, 8080];
  for (const port of ports) {
    try {
      const { stdout } = await execAsync(`ss -tlnp | grep :${port} | head -1`);
      results.checks.push({
        category: 'Ports',
        name: `Port ${port}`,
        status: stdout.trim() ? 'ok' : 'fail',
        value: stdout.trim() ? 'LISTEN' : 'NOT LISTENING',
      });
    } catch {
      results.checks.push({
        category: 'Ports',
        name: `Port ${port}`,
        status: 'fail',
        value: 'NOT LISTENING',
      });
    }
  }

  // 3. Fichiers critiques
  const files = [
    '/home/pi/neopro/webapp/index.html',
    '/home/pi/neopro/webapp/configuration.json',
    '/home/pi/neopro/sync-agent/src/agent.js',
  ];
  for (const file of files) {
    const exists = await fs.pathExists(file);
    results.checks.push({
      category: 'Files',
      name: file.split('/').pop(),
      status: exists ? 'ok' : 'fail',
      value: exists ? 'exists' : 'missing',
    });
  }

  // 4. GPU Memory
  try {
    const { stdout } = await execAsync('vcgencmd get_mem gpu 2>/dev/null');
    const match = stdout.match(/gpu=(\d+)M/);
    if (match) {
      const gpuMem = parseInt(match[1]);
      results.checks.push({
        category: 'System',
        name: 'GPU Memory',
        status: gpuMem >= 128 ? 'ok' : 'fail',
        value: `${gpuMem}M`,
        warning: gpuMem < 128 ? 'Minimum requis: 128M, recommandé: 256M' : null,
      });
    }
  } catch {
    results.checks.push({
      category: 'System',
      name: 'GPU Memory',
      status: 'unknown',
      value: 'vcgencmd not available',
    });
  }

  // 5. Température
  try {
    const { stdout } = await execAsync('vcgencmd measure_temp 2>/dev/null');
    const match = stdout.match(/temp=([\d.]+)/);
    if (match) {
      const temp = parseFloat(match[1]);
      results.checks.push({
        category: 'System',
        name: 'Temperature',
        status: temp < 80 ? 'ok' : 'warning',
        value: `${temp}°C`,
      });
    }
  } catch {
    // Fallback via systeminformation
  }

  // 6. Throttling
  try {
    const { stdout } = await execAsync('vcgencmd get_throttled 2>/dev/null');
    const match = stdout.match(/throttled=(0x[0-9a-fA-F]+)/);
    if (match) {
      const value = parseInt(match[1], 16);
      results.checks.push({
        category: 'System',
        name: 'Throttling',
        status: value === 0 ? 'ok' : 'warning',
        value: match[1],
        warning: value !== 0 ? 'Throttling détecté (alimentation ou température)' : null,
      });
    }
  } catch {
    // vcgencmd not available
  }

  // 7. Espace disque
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
    const usage = parseInt(stdout.trim());
    results.checks.push({
      category: 'System',
      name: 'Disk Usage',
      status: usage < 90 ? 'ok' : 'warning',
      value: `${usage}%`,
    });
  } catch {
    // Error getting disk usage
  }

  // 8. Mémoire
  try {
    const { stdout } = await execAsync("free -m | grep Mem | awk '{print int($3/$2*100)}'");
    const usage = parseInt(stdout.trim());
    results.checks.push({
      category: 'System',
      name: 'Memory Usage',
      status: usage < 90 ? 'ok' : 'warning',
      value: `${usage}%`,
    });
  } catch {
    // Error getting memory usage
  }

  // 9. Connectivité Internet
  try {
    await execAsync('ping -c 1 -W 2 8.8.8.8');
    results.checks.push({
      category: 'Network',
      name: 'Internet',
      status: 'ok',
      value: 'reachable',
    });
  } catch {
    results.checks.push({
      category: 'Network',
      name: 'Internet',
      status: 'fail',
      value: 'unreachable',
    });
  }

  // 10. Résolution DNS
  try {
    await execAsync('getent hosts google.com');
    results.checks.push({
      category: 'Network',
      name: 'DNS',
      status: 'ok',
      value: 'working',
    });
  } catch {
    results.checks.push({
      category: 'Network',
      name: 'DNS',
      status: 'fail',
      value: 'not working',
    });
  }

  return results;
}

/**
 * Récupère un rapport de santé complet du système
 */
async function getHealthStatus() {
  logger.info('Retrieving health status');

  try {
    const metricsCollector = require('../metrics');
    const healthStatus = await metricsCollector.getHealthStatus();

    return healthStatus;
  } catch (error) {
    logger.error('Failed to retrieve health status:', error);
    throw error;
  }
}

/**
 * Récupère les informations système
 */
async function getSystemInfo() {
  logger.info('Retrieving system information');

  try {
    const metricsCollector = require('../metrics');
    const systemInfo = await metricsCollector.getSystemInfo();
    const networkStatus = await metricsCollector.getNetworkStatus();
    const metrics = await metricsCollector.collectAll();

    return {
      success: true,
      systemInfo,
      networkStatus,
      metrics,
    };
  } catch (error) {
    logger.error('Failed to retrieve system info:', error);
    throw error;
  }
}

module.exports = {
  runDiagnostics,
  runManualDiagnostics,
  getHealthStatus,
  getSystemInfo,
};
