#!/usr/bin/env node

/**
 * Serveur Web Admin pour Neopro - MODE DEMO
 * Version démo avec données mockées pour présentations commerciales
 *
 * Usage: DEMO_MODE=true node admin-server-demo.js
 * Accès: http://localhost:8080
 */

const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;
const upload = multer();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Données mockées pour démo
const MOCK_DATA = {
  system: {
    hostname: 'neopro-demo',
    platform: 'linux',
    arch: 'arm64',
    uptime: 345678,
    cpu: {
      cores: 4,
      model: 'ARM Cortex-A72',
      usage: Math.floor(Math.random() * 30) + 20 // 20-50%
    },
    memory: {
      total: 4096000000,
      free: 2500000000,
      used: 1596000000,
      percent: 39
    },
    temperature: (Math.random() * 15 + 45).toFixed(1), // 45-60°C
    disk: {
      filesystem: '/dev/mmcblk0p2',
      size: '32G',
      used: '12G',
      available: '18G',
      percent: 40
    },
    network: {
      wlan0: [{ address: '192.168.4.1', netmask: '255.255.255.0' }],
      wlan1: [{ address: '192.168.1.50', netmask: '255.255.255.0' }]
    }
  },

  services: {
    'neopro-app': 'running',
    'neopro-admin': 'running',
    'nginx': 'running',
    'hostapd': 'running',
    'dnsmasq': 'running',
    'avahi-daemon': 'running'
  },

  videos: [
    { category: 'Focus-partenaires', name: 'sponsor-1.mp4', size: '45MB', date: '2024-12-01' },
    { category: 'Focus-partenaires', name: 'sponsor-2.mp4', size: '38MB', date: '2024-12-01' },
    { category: 'Focus-partenaires', name: 'sponsor-3.mp4', size: '42MB', date: '2024-12-02' },
    { category: 'Info-club', name: 'prochains-matchs.mp4', size: '28MB', date: '2024-12-01' },
    { category: 'Info-club', name: 'recrutement.mp4', size: '35MB', date: '2024-11-28' },
    { category: 'Match_SM1', name: 'goal-1.mp4', size: '15MB', date: '2024-12-03' },
    { category: 'Match_SM1', name: 'goal-2.mp4', size: '18MB', date: '2024-12-03' },
    { category: 'Match_SM1', name: 'timeout.mp4', size: '22MB', date: '2024-12-03' },
    { category: 'Jingles', name: 'celebration.mp4', size: '8MB', date: '2024-11-25' },
    { category: 'Jingles', name: 'intro.mp4', size: '12MB', date: '2024-11-25' }
  ],

  config: {
    clubName: 'CLUB DEMO',
    ssid: 'NEOPRO-DEMO',
    version: '1.0.0',
    installDate: '2024-11-20'
  },

  logs: {
    app: [
      '[2024-12-04 14:30:15] Server Socket.IO started on port 3000',
      '[2024-12-04 14:30:16] Connected to database',
      '[2024-12-04 14:32:45] Client connected: socket-abc123',
      '[2024-12-04 14:35:20] Video played: sponsor-1.mp4',
      '[2024-12-04 14:38:10] Video played: goal-1.mp4',
      '[2024-12-04 14:40:05] Client disconnected: socket-abc123',
      '[2024-12-04 14:42:30] Client connected: socket-def456',
      '[2024-12-04 14:45:00] Video played: sponsor-2.mp4'
    ],
    nginx: [
      '192.168.4.10 - - [04/Dec/2024:14:30:00 +0000] "GET /tv HTTP/1.1" 200 1234',
      '192.168.4.10 - - [04/Dec/2024:14:30:02 +0000] "GET /remote HTTP/1.1" 200 2345',
      '192.168.4.15 - - [04/Dec/2024:14:35:10 +0000] "GET /remote HTTP/1.1" 200 2345',
      '192.168.4.15 - - [04/Dec/2024:14:35:15 +0000] "GET /api/videos HTTP/1.1" 200 456'
    ],
    system: [
      'Dec 04 14:30:00 neopro systemd[1]: Started Neopro Application',
      'Dec 04 14:30:01 neopro systemd[1]: Started Neopro Admin Interface',
      'Dec 04 14:30:02 neopro systemd[1]: Started nginx.service',
      'Dec 04 14:30:03 neopro hostapd[1234]: wlan0: AP-ENABLED'
    ]
  }
};

/**
 * API: Informations système
 */
app.get('/api/system', (req, res) => {
  console.log('[DEMO] GET /api/system');

  // Varier légèrement les données à chaque requête
  const data = {
    ...MOCK_DATA.system,
    cpu: {
      ...MOCK_DATA.system.cpu,
      usage: Math.floor(Math.random() * 30) + 20
    },
    temperature: (Math.random() * 15 + 45).toFixed(1),
    services: MOCK_DATA.services
  };

  res.json(data);
});

/**
 * API: Configuration du club
 */
app.get('/api/config', (req, res) => {
  console.log('[DEMO] GET /api/config');
  res.json(MOCK_DATA.config);
});

/**
 * API: Services status
 */
app.get('/api/services', (req, res) => {
  console.log('[DEMO] GET /api/services');
  res.json(MOCK_DATA.services);
});

/**
 * API: Liste des vidéos
 */
app.get('/api/videos', (req, res) => {
  console.log('[DEMO] GET /api/videos');
  // Retourner le même format que le vrai serveur
  res.json({ videos: MOCK_DATA.videos });
});

/**
 * API: Upload vidéo (simulé)
 */
app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  const category = req.body.category;
  const subcategory = req.body.subcategory;
  const filename = req.file?.originalname || 'demo-video.mp4';

  console.log(`[DEMO] POST /api/videos/upload - Category: ${category}, Subcategory: ${subcategory || 'none'}`);

  // Simuler un upload réussi
  setTimeout(() => {
    const path = subcategory
      ? `${category || 'Unknown'}/${subcategory}/demo-video.mp4`
      : `${category || 'Unknown'}/demo-video.mp4`;

    res.json({
      success: true,
      message: 'Vidéo uploadée avec succès (mode démo)',
      filename,
      path: path
    });
  }, 1500);
});

/**
 * API: Supprimer vidéo (simulé)
 */
app.delete('/api/videos/:category/:filename', (req, res) => {
  console.log(`[DEMO] DELETE /api/videos/${req.params.category}/${req.params.filename}`);

  res.json({
    success: true,
    message: 'Vidéo supprimée (mode démo)'
  });
});

/**
 * API: Informations réseau
 */
app.get('/api/network', (req, res) => {
  console.log('[DEMO] GET /api/network');
  res.json(MOCK_DATA.system.network);
});

/**
 * API: Logs
 */
app.get('/api/logs/:service', (req, res) => {
  const { service } = req.params;
  const lines = parseInt(req.query.lines) || 50;

  console.log(`[DEMO] GET /api/logs/${service}?lines=${lines}`);

  let logs = [];
  switch (service) {
    case 'app':
    case 'neopro-app':
      logs = MOCK_DATA.logs.app;
      break;
    case 'nginx':
      logs = MOCK_DATA.logs.nginx;
      break;
    case 'system':
      logs = MOCK_DATA.logs.system;
      break;
    default:
      logs = ['No logs available for ' + service];
  }

  res.json({
    service,
    lines: logs.slice(-lines).join('\n')
  });
});

/**
 * API: Redémarrer service (simulé)
 */
app.post('/api/services/:service/restart', (req, res) => {
  const { service } = req.params;
  console.log(`[DEMO] POST /api/services/${service}/restart`);

  setTimeout(() => {
    res.json({
      success: true,
      message: `Service ${service} redémarré (mode démo)`
    });
  }, 1500);
});

/**
 * API: Redémarrage système (simulé)
 */
app.post('/api/system/reboot', (req, res) => {
  console.log('[DEMO] POST /api/system/reboot');

  res.json({
    success: true,
    message: 'Redémarrage du système planifié (mode démo - non effectué)'
  });
});

/**
 * API: Arrêt système (simulé)
 */
app.post('/api/system/shutdown', (req, res) => {
  console.log('[DEMO] POST /api/system/shutdown');

  res.json({
    success: true,
    message: 'Arrêt du système planifié (mode démo - non effectué)'
  });
});

/**
 * API: Mise à jour (simulé)
 */
app.post('/api/update', (req, res) => {
  console.log('[DEMO] POST /api/update');

  setTimeout(() => {
    res.json({
      success: true,
      message: 'Mise à jour installée avec succès (mode démo)',
      version: '1.0.1'
    });
  }, 3000);
});

/**
 * Page d'accueil - Redirection vers interface
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Démarrage du serveur
 */
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         NEOPRO ADMIN INTERFACE - MODE DEMO                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log('✓ Demo mode: All data is mocked');
  console.log('✓ No real system commands executed');
  console.log('');
  console.log('📊 Open your browser at: http://localhost:' + PORT);
  console.log('');
  console.log('Press Ctrl+C to stop');
});

// Gestion graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down demo server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down demo server...');
  process.exit(0);
});
