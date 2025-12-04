#!/usr/bin/env node

/**
 * Serveur Web Admin pour Neopro Raspberry Pi
 * Interface d'administration accessible sur http://neopro.local:8080
 *
 * Fonctionnalités:
 * - Dashboard système (CPU, mémoire, température, stockage)
 * - Upload de vidéos
 * - Configuration WiFi client
 * - Visualisation des logs
 * - Gestion des mises à jour
 * - Redémarrage des services
 */

const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Configuration
const app = express();
const PORT = process.env.ADMIN_PORT || 8080;
const NEOPRO_DIR = '/home/pi/neopro';
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const LOGS_DIR = path.join(NEOPRO_DIR, 'logs');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration multer pour upload de vidéos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const category = req.body.category || 'autres';
    const uploadPath = path.join(VIDEOS_DIR, category);

    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Nettoyer le nom de fichier
    const cleanName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    cb(null, cleanName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter seulement les vidéos
    const allowedMimes = ['video/mp4', 'video/x-matroska', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format vidéo non supporté. Utilisez MP4, MKV ou MOV.'));
    }
  }
});

/**
 * Utilitaires
 */

// Exécuter une commande shell de manière sécurisée
async function execCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Obtenir les informations système
async function getSystemInfo() {
  try {
    // CPU
    const cpuUsage = await getCpuUsage();

    // Mémoire
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Température (Raspberry Pi)
    const tempResult = await execCommand('cat /sys/class/thermal/thermal_zone0/temp');
    const temperature = tempResult.success
      ? (parseInt(tempResult.output) / 1000).toFixed(1)
      : 'N/A';

    // Stockage
    const diskResult = await execCommand(`df -h ${NEOPRO_DIR} | tail -1`);
    const diskInfo = diskResult.success ? parseDiskInfo(diskResult.output) : null;

    // Uptime
    const uptimeSeconds = os.uptime();
    const uptime = formatUptime(uptimeSeconds);

    // Status des services
    const services = await getServicesStatus();

    return {
      cpu: cpuUsage,
      memory: {
        total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        free: (freeMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        percent: ((usedMem / totalMem) * 100).toFixed(1) + '%'
      },
      temperature: temperature + '°C',
      disk: diskInfo,
      uptime: uptime,
      services: services,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return { error: error.message };
  }
}

// Calculer l'usage CPU
async function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - (100 * idle / total);

  return {
    usage: usage.toFixed(1) + '%',
    cores: cpus.length
  };
}

// Parser les informations de disque
function parseDiskInfo(output) {
  const parts = output.split(/\s+/);
  return {
    total: parts[1],
    used: parts[2],
    available: parts[3],
    percent: parts[4]
  };
}

// Formater l'uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Vérifier le status des services
async function getServicesStatus() {
  const services = ['neopro-app', 'nginx', 'hostapd', 'dnsmasq', 'avahi-daemon'];
  const statuses = {};

  for (const service of services) {
    const result = await execCommand(`systemctl is-active ${service}`);
    statuses[service] = result.output.trim() === 'active' ? 'running' : 'stopped';
  }

  return statuses;
}

/**
 * Routes API
 */

// Page d'accueil (dashboard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Informations système
app.get('/api/system', async (req, res) => {
  const info = await getSystemInfo();
  res.json(info);
});

// API: Configuration du club
app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(NEOPRO_DIR, 'club-config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    res.json(JSON.parse(configData));
  } catch (error) {
    res.status(500).json({ error: 'Configuration non trouvée' });
  }
});

// API: Liste des vidéos
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await listVideosRecursive(VIDEOS_DIR);
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function listVideosRecursive(dir, baseDir = dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const videos = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      const subVideos = await listVideosRecursive(fullPath, baseDir);
      videos.push(...subVideos);
    } else if (file.name.match(/\.(mp4|mkv|mov|avi)$/i)) {
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(baseDir, fullPath);

      videos.push({
        name: file.name,
        path: relativePath,
        category: path.dirname(relativePath),
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        modified: stats.mtime
      });
    }
  }

  return videos;
}

// API: Upload de vidéo
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    res.json({
      success: true,
      message: 'Vidéo uploadée avec succès',
      file: {
        name: req.file.filename,
        size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
        path: req.file.path
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une vidéo
app.delete('/api/videos/:category/:filename', async (req, res) => {
  try {
    const { category, filename } = req.params;
    const filePath = path.join(VIDEOS_DIR, category, filename);

    // Vérifier que le fichier existe
    await fs.access(filePath);

    // Supprimer
    await fs.unlink(filePath);

    res.json({ success: true, message: 'Vidéo supprimée' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de supprimer la vidéo' });
  }
});

// API: Logs
app.get('/api/logs/:service', async (req, res) => {
  const { service } = req.params;
  const lines = req.query.lines || 100;

  const serviceMap = {
    'app': 'neopro-app',
    'nginx': 'nginx',
    'system': ''
  };

  const serviceName = serviceMap[service];
  if (serviceName === undefined) {
    return res.status(400).json({ error: 'Service invalide' });
  }

  const command = serviceName
    ? `journalctl -u ${serviceName} -n ${lines} --no-pager`
    : `journalctl -n ${lines} --no-pager`;

  const result = await execCommand(command);

  if (result.success) {
    res.json({ logs: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Configuration WiFi client
app.post('/api/wifi/client', async (req, res) => {
  const { ssid, password } = req.body;

  if (!ssid || !password) {
    return res.status(400).json({ error: 'SSID et mot de passe requis' });
  }

  try {
    // Exécuter le script de configuration WiFi
    const scriptPath = path.join(__dirname, '..', 'scripts', 'setup-wifi-client.sh');
    const result = await execCommand(`sudo ${scriptPath} "${ssid}" "${password}"`);

    if (result.success) {
      res.json({ success: true, message: 'WiFi client configuré', output: result.output });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Redémarrer un service
app.post('/api/services/:service/restart', async (req, res) => {
  const { service } = req.params;
  const allowedServices = ['neopro-app', 'nginx', 'neopro-kiosk'];

  if (!allowedServices.includes(service)) {
    return res.status(400).json({ error: 'Service non autorisé' });
  }

  const result = await execCommand(`sudo systemctl restart ${service}`);

  if (result.success) {
    res.json({ success: true, message: `Service ${service} redémarré` });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Redémarrer le système
app.post('/api/system/reboot', async (req, res) => {
  res.json({ success: true, message: 'Redémarrage du système dans 5 secondes...' });

  // Redémarrage différé pour avoir le temps de répondre
  setTimeout(() => {
    exec('sudo reboot');
  }, 5000);
});

// API: Arrêter le système
app.post('/api/system/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Arrêt du système dans 5 secondes...' });

  setTimeout(() => {
    exec('sudo shutdown -h now');
  }, 5000);
});

// API: Mise à jour de l'application
app.post('/api/update', upload.single('package'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Créer un backup
    const backupName = `backup-${Date.now()}.tar.gz`;
    await execCommand(`tar -czf ${NEOPRO_DIR}/backups/${backupName} -C ${NEOPRO_DIR} webapp server`);

    // Extraire le nouveau package
    const extractDir = '/tmp/neopro-update';
    await execCommand(`rm -rf ${extractDir} && mkdir -p ${extractDir}`);
    await execCommand(`tar -xzf ${req.file.path} -C ${extractDir}`);

    // Copier les nouveaux fichiers
    await execCommand(`cp -r ${extractDir}/deploy/webapp/* ${NEOPRO_DIR}/webapp/`);
    await execCommand(`cp -r ${extractDir}/deploy/server/* ${NEOPRO_DIR}/server/`);

    // Installer les dépendances
    await execCommand(`cd ${NEOPRO_DIR}/server && npm install --production`);

    // Redémarrer les services
    await execCommand('sudo systemctl restart neopro-app');
    await execCommand('sudo systemctl restart nginx');

    // Nettoyage
    await fs.unlink(req.file.path);
    await execCommand(`rm -rf ${extractDir}`);

    res.json({
      success: true,
      message: 'Mise à jour appliquée avec succès',
      backup: backupName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Informations réseau
app.get('/api/network', async (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const networkInfo = {};

    for (const [name, addrs] of Object.entries(interfaces)) {
      networkInfo[name] = addrs
        .filter(addr => addr.family === 'IPv4')
        .map(addr => ({
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        }));
    }

    // WiFi info
    const wifiResult = await execCommand('iwconfig wlan0 2>/dev/null');
    const ssidMatch = wifiResult.output.match(/ESSID:"([^"]+)"/);
    const currentSSID = ssidMatch ? ssidMatch[1] : null;

    res.json({
      interfaces: networkInfo,
      wifi: {
        currentSSID: currentSSID
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lancement du serveur
 */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Serveur Web Admin Neopro lancé sur le port ${PORT}`);
  console.log(`  Accessible sur:`);
  console.log(`  - http://neopro.local:${PORT}`);
  console.log(`  - http://192.168.4.1:${PORT}`);
  console.log(`  - http://localhost:${PORT}`);
});

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('Erreur non gérée:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée:', error);
});
