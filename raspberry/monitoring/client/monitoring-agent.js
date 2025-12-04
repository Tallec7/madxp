#!/usr/bin/env node

/**
 * Neopro Monitoring Agent
 * Agent de monitoring qui tourne sur chaque Raspberry Pi
 * Collecte les métriques et les envoie au serveur central
 *
 * Installation: node monitoring-agent.js
 */

const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const os = require('os');

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  // URL du serveur de monitoring central (à configurer)
  serverUrl: process.env.MONITORING_SERVER || 'https://monitoring.neopro.fr',

  // Identifiant unique du site
  siteId: process.env.SITE_ID || 'unknown',

  // Club name
  clubName: process.env.CLUB_NAME || 'unknown',

  // Interval de collecte (5 minutes par défaut)
  interval: parseInt(process.env.MONITORING_INTERVAL) || 300000,

  // Interval de heartbeat (30 secondes)
  heartbeatInterval: 30000,

  // Fichier de configuration local
  configFile: '/home/pi/neopro/club-config.json',

  // Seuils d'alerte
  thresholds: {
    temperature: 75, // °C
    diskUsage: 90,   // %
    memoryUsage: 90  // %
  }
};

/**
 * Collecte des métriques système
 */
async function collectSystemMetrics() {
  const metrics = {
    timestamp: Date.now(),
    siteId: CONFIG.siteId,
    clubName: CONFIG.clubName,

    // Système
    hostname: os.hostname(),
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),

    // CPU
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0].model,
      usage: await getCpuUsage()
    },

    // Mémoire
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      percent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1)
    },

    // Température
    temperature: await getTemperature(),

    // Disque
    disk: await getDiskUsage(),

    // Réseau
    network: await getNetworkInfo(),

    // Services
    services: await getServicesStatus(),

    // Application
    application: await getApplicationStatus(),

    // Alertes
    alerts: []
  };

  // Générer les alertes
  metrics.alerts = generateAlerts(metrics);

  return metrics;
}

/**
 * Calcul usage CPU
 */
async function getCpuUsage() {
  try {
    const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)"');
    const match = stdout.match(/(\d+\.\d+)\s*id/);
    if (match) {
      const idle = parseFloat(match[1]);
      return (100 - idle).toFixed(1);
    }
  } catch (error) {
    console.error('Error getting CPU usage:', error);
  }
  return 0;
}

/**
 * Température du CPU
 */
async function getTemperature() {
  try {
    const temp = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return (parseInt(temp) / 1000).toFixed(1);
  } catch (error) {
    console.error('Error getting temperature:', error);
    return null;
  }
}

/**
 * Usage disque
 */
async function getDiskUsage() {
  try {
    const { stdout } = await execAsync('df -h /home/pi/neopro | tail -1');
    const parts = stdout.split(/\s+/);
    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      available: parts[3],
      percent: parseInt(parts[4])
    };
  } catch (error) {
    console.error('Error getting disk usage:', error);
    return null;
  }
}

/**
 * Informations réseau
 */
async function getNetworkInfo() {
  const network = {
    interfaces: {},
    wifi: {}
  };

  try {
    // Interfaces
    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      network.interfaces[name] = addrs
        .filter(addr => addr.family === 'IPv4')
        .map(addr => ({
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        }));
    }

    // WiFi actuel
    const { stdout } = await execAsync('iwconfig wlan0 2>/dev/null || echo ""');
    const ssidMatch = stdout.match(/ESSID:"([^"]+)"/);
    if (ssidMatch) {
      network.wifi.ssid = ssidMatch[1];
    }
  } catch (error) {
    console.error('Error getting network info:', error);
  }

  return network;
}

/**
 * Status des services
 */
async function getServicesStatus() {
  const services = ['neopro-app', 'neopro-admin', 'nginx', 'hostapd', 'dnsmasq', 'avahi-daemon'];
  const status = {};

  for (const service of services) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${service}`);
      status[service] = stdout.trim() === 'active' ? 'running' : 'stopped';
    } catch (error) {
      status[service] = 'stopped';
    }
  }

  return status;
}

/**
 * Status de l'application
 */
async function getApplicationStatus() {
  const status = {
    webapp: false,
    server: false,
    admin: false,
    videos: 0
  };

  try {
    // Webapp
    status.webapp = await fileExists('/home/pi/neopro/webapp/index.html');

    // Server
    status.server = await fileExists('/home/pi/neopro/server/server.js');

    // Admin
    status.admin = await fileExists('/home/pi/neopro/admin/admin-server.js');

    // Compter les vidéos
    const { stdout } = await execAsync('find /home/pi/neopro/videos -type f \\( -name "*.mp4" -o -name "*.mkv" -o -name "*.mov" \\) 2>/dev/null | wc -l');
    status.videos = parseInt(stdout);
  } catch (error) {
    console.error('Error getting application status:', error);
  }

  return status;
}

/**
 * Vérifier si un fichier existe
 */
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Générer les alertes
 */
function generateAlerts(metrics) {
  const alerts = [];

  // Température
  if (metrics.temperature && parseFloat(metrics.temperature) > CONFIG.thresholds.temperature) {
    alerts.push({
      level: 'critical',
      type: 'temperature',
      message: `Température élevée: ${metrics.temperature}°C`,
      value: metrics.temperature
    });
  }

  // Disque
  if (metrics.disk && metrics.disk.percent > CONFIG.thresholds.diskUsage) {
    alerts.push({
      level: 'warning',
      type: 'disk',
      message: `Espace disque faible: ${metrics.disk.percent}% utilisé`,
      value: metrics.disk.percent
    });
  }

  // Mémoire
  if (parseFloat(metrics.memory.percent) > CONFIG.thresholds.memoryUsage) {
    alerts.push({
      level: 'warning',
      type: 'memory',
      message: `Utilisation mémoire élevée: ${metrics.memory.percent}%`,
      value: metrics.memory.percent
    });
  }

  // Services arrêtés
  for (const [service, status] of Object.entries(metrics.services)) {
    if (status !== 'running') {
      alerts.push({
        level: 'critical',
        type: 'service',
        message: `Service ${service} arrêté`,
        service: service
      });
    }
  }

  // Application manquante
  if (!metrics.application.webapp) {
    alerts.push({
      level: 'critical',
      type: 'application',
      message: 'Application web manquante'
    });
  }

  return alerts;
}

/**
 * Envoyer les métriques au serveur
 */
async function sendMetrics(metrics) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(metrics);
    const url = new URL(`${CONFIG.serverUrl}/api/metrics`);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'X-Site-ID': CONFIG.siteId,
        'X-Club-Name': CONFIG.clubName
      }
    };

    const protocol = url.protocol === 'https:' ? https : http;

    const req = protocol.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseData);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Heartbeat simple
 */
async function sendHeartbeat() {
  const heartbeat = {
    siteId: CONFIG.siteId,
    clubName: CONFIG.clubName,
    timestamp: Date.now(),
    type: 'heartbeat'
  };

  try {
    await sendMetrics(heartbeat);
  } catch (error) {
    // Heartbeat silencieux en cas d'erreur
  }
}

/**
 * Charger la configuration du club
 */
async function loadConfig() {
  try {
    const config = await fs.readFile(CONFIG.configFile, 'utf8');
    const clubConfig = JSON.parse(config);

    if (clubConfig.clubName) {
      CONFIG.clubName = clubConfig.clubName;
    }

    // Générer un ID unique basé sur le nom du club et le MAC
    const mac = Object.values(os.networkInterfaces())
      .flat()
      .find(i => i.mac && i.mac !== '00:00:00:00:00:00')?.mac || 'unknown';

    CONFIG.siteId = `${clubConfig.clubName.toLowerCase()}-${mac.replace(/:/g, '')}`;

    console.log(`Loaded config: ${CONFIG.clubName} (${CONFIG.siteId})`);
  } catch (error) {
    console.warn('Could not load club config, using defaults');
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('Neopro Monitoring Agent starting...');

  // Charger la configuration
  await loadConfig();

  console.log(`Site ID: ${CONFIG.siteId}`);
  console.log(`Club: ${CONFIG.clubName}`);
  console.log(`Server: ${CONFIG.serverUrl}`);
  console.log(`Interval: ${CONFIG.interval / 1000}s`);

  // Première collecte immédiate
  try {
    console.log('Collecting initial metrics...');
    const metrics = await collectSystemMetrics();
    console.log('Sending metrics to server...');
    await sendMetrics(metrics);
    console.log('Initial metrics sent successfully');

    // Afficher les alertes
    if (metrics.alerts.length > 0) {
      console.log(`Alerts: ${metrics.alerts.length}`);
      metrics.alerts.forEach(alert => {
        console.log(`  [${alert.level.toUpperCase()}] ${alert.message}`);
      });
    }
  } catch (error) {
    console.error('Error sending initial metrics:', error.message);
  }

  // Collecte périodique
  setInterval(async () => {
    try {
      const metrics = await collectSystemMetrics();
      await sendMetrics(metrics);
      console.log(`[${new Date().toISOString()}] Metrics sent (${metrics.alerts.length} alerts)`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error:`, error.message);
    }
  }, CONFIG.interval);

  // Heartbeat
  setInterval(async () => {
    await sendHeartbeat();
  }, CONFIG.heartbeatInterval);

  console.log('Monitoring agent running...');
}

// Gestion des signaux
process.on('SIGINT', () => {
  console.log('\nStopping monitoring agent...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nStopping monitoring agent...');
  process.exit(0);
});

// Lancement
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
