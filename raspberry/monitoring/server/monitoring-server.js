#!/usr/bin/env node

/**
 * Neopro Monitoring Server
 * Serveur central de monitoring qui collecte les données de tous les Raspberry Pi
 *
 * Features:
 * - Collecte des métriques de tous les sites
 * - Stockage en mémoire (ou base de données)
 * - API REST pour dashboard
 * - Système d'alertes (email, webhook)
 * - Dashboard web temps réel
 */

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/public'));

// Stockage en mémoire (à remplacer par une vraie BDD en production)
const sites = new Map();
const metricsHistory = new Map();
const alerts = [];

// Configuration email (exemple avec Gmail)
const emailConfig = {
  enabled: process.env.ENABLE_EMAIL === 'true',
  from: process.env.EMAIL_FROM || 'neopro@example.com',
  to: process.env.EMAIL_TO || 'support@neopro.fr',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  }
};

// Configuration webhook
const webhookConfig = {
  enabled: process.env.ENABLE_WEBHOOK === 'true',
  url: process.env.WEBHOOK_URL
};

let emailTransporter = null;
if (emailConfig.enabled && emailConfig.smtp.auth.user) {
  emailTransporter = nodemailer.createTransporter(emailConfig.smtp);
}

/**
 * Recevoir les métriques d'un site
 */
app.post('/api/metrics', (req, res) => {
  const metrics = req.body;
  const siteId = metrics.siteId || req.headers['x-site-id'];
  const clubName = metrics.clubName || req.headers['x-club-name'];

  if (!siteId) {
    return res.status(400).json({ error: 'Site ID required' });
  }

  // Type heartbeat (léger)
  if (metrics.type === 'heartbeat') {
    if (sites.has(siteId)) {
      const site = sites.get(siteId);
      site.lastHeartbeat = Date.now();
      sites.set(siteId, site);
    }
    return res.json({ status: 'ok', type: 'heartbeat' });
  }

  // Métriques complètes
  metrics.receivedAt = Date.now();
  metrics.siteId = siteId;
  metrics.clubName = clubName;

  // Stocker les métriques actuelles
  sites.set(siteId, metrics);

  // Ajouter à l'historique
  if (!metricsHistory.has(siteId)) {
    metricsHistory.set(siteId, []);
  }
  const history = metricsHistory.get(siteId);
  history.push(metrics);

  // Garder seulement les 100 dernières entrées
  if (history.length > 100) {
    history.shift();
  }

  console.log(`[${new Date().toISOString()}] Received metrics from ${clubName} (${siteId})`);

  // Traiter les alertes
  if (metrics.alerts && metrics.alerts.length > 0) {
    processAlerts(siteId, clubName, metrics.alerts);
  }

  res.json({ status: 'ok', received: metrics.timestamp });
});

/**
 * API: Liste de tous les sites
 */
app.get('/api/sites', (req, res) => {
  const sitesList = Array.from(sites.values()).map(site => ({
    siteId: site.siteId,
    clubName: site.clubName,
    hostname: site.hostname,
    lastUpdate: site.timestamp,
    lastHeartbeat: site.lastHeartbeat || site.timestamp,
    status: getSiteStatus(site),
    alerts: site.alerts || [],
    summary: {
      temperature: site.temperature,
      cpu: site.cpu?.usage,
      memory: site.memory?.percent,
      disk: site.disk?.percent
    }
  }));

  res.json(sitesList);
});

/**
 * API: Détails d'un site
 */
app.get('/api/sites/:siteId', (req, res) => {
  const { siteId } = req.params;

  if (!sites.has(siteId)) {
    return res.status(404).json({ error: 'Site not found' });
  }

  const site = sites.get(siteId);
  res.json(site);
});

/**
 * API: Historique d'un site
 */
app.get('/api/sites/:siteId/history', (req, res) => {
  const { siteId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  if (!metricsHistory.has(siteId)) {
    return res.json([]);
  }

  const history = metricsHistory.get(siteId);
  res.json(history.slice(-limit));
});

/**
 * API: Statistiques globales
 */
app.get('/api/stats', (req, res) => {
  const stats = {
    totalSites: sites.size,
    activeSites: 0,
    warningsSites: 0,
    criticalSites: 0,
    offlineSites: 0,
    totalAlerts: 0,
    criticalAlerts: 0,
    averageMetrics: {
      temperature: 0,
      cpu: 0,
      memory: 0,
      disk: 0
    }
  };

  let tempSum = 0, cpuSum = 0, memSum = 0, diskSum = 0;
  let count = 0;

  for (const site of sites.values()) {
    const status = getSiteStatus(site);

    if (status === 'offline') stats.offlineSites++;
    else if (status === 'critical') stats.criticalSites++;
    else if (status === 'warning') stats.warningsSites++;
    else stats.activeSites++;

    if (site.alerts) {
      stats.totalAlerts += site.alerts.length;
      stats.criticalAlerts += site.alerts.filter(a => a.level === 'critical').length;
    }

    // Moyennes
    if (site.temperature) tempSum += parseFloat(site.temperature);
    if (site.cpu?.usage) cpuSum += parseFloat(site.cpu.usage);
    if (site.memory?.percent) memSum += parseFloat(site.memory.percent);
    if (site.disk?.percent) diskSum += site.disk.percent;
    count++;
  }

  if (count > 0) {
    stats.averageMetrics.temperature = (tempSum / count).toFixed(1);
    stats.averageMetrics.cpu = (cpuSum / count).toFixed(1);
    stats.averageMetrics.memory = (memSum / count).toFixed(1);
    stats.averageMetrics.disk = (diskSum / count).toFixed(1);
  }

  res.json(stats);
});

/**
 * API: Toutes les alertes
 */
app.get('/api/alerts', (req, res) => {
  const allAlerts = [];

  for (const site of sites.values()) {
    if (site.alerts && site.alerts.length > 0) {
      site.alerts.forEach(alert => {
        allAlerts.push({
          ...alert,
          siteId: site.siteId,
          clubName: site.clubName,
          timestamp: site.timestamp
        });
      });
    }
  }

  // Trier par criticité puis date
  allAlerts.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, info: 2 };
    if (levelOrder[a.level] !== levelOrder[b.level]) {
      return levelOrder[a.level] - levelOrder[b.level];
    }
    return b.timestamp - a.timestamp;
  });

  res.json(allAlerts);
});

/**
 * Déterminer le status d'un site
 */
function getSiteStatus(site) {
  const now = Date.now();
  const lastUpdate = site.lastHeartbeat || site.timestamp;

  // Offline si pas de nouvelles depuis 2 minutes
  if (now - lastUpdate > 120000) {
    return 'offline';
  }

  // Critical si alertes critiques
  if (site.alerts && site.alerts.some(a => a.level === 'critical')) {
    return 'critical';
  }

  // Warning si alertes warnings
  if (site.alerts && site.alerts.some(a => a.level === 'warning')) {
    return 'warning';
  }

  return 'online';
}

/**
 * Traiter les alertes
 */
async function processAlerts(siteId, clubName, siteAlerts) {
  for (const alert of siteAlerts) {
    // Vérifier si l'alerte a déjà été envoyée récemment (éviter spam)
    const existingAlert = alerts.find(a =>
      a.siteId === siteId &&
      a.type === alert.type &&
      a.level === alert.level &&
      (Date.now() - a.timestamp) < 3600000 // 1 heure
    );

    if (existingAlert) {
      continue; // Déjà envoyée récemment
    }

    // Enregistrer l'alerte
    alerts.push({
      ...alert,
      siteId,
      clubName,
      timestamp: Date.now()
    });

    // Garder seulement les 1000 dernières alertes
    if (alerts.length > 1000) {
      alerts.shift();
    }

    console.log(`[ALERT] ${clubName} (${siteId}) - [${alert.level.toUpperCase()}] ${alert.message}`);

    // Envoyer les notifications
    if (alert.level === 'critical' || alert.level === 'warning') {
      await sendAlertNotifications(siteId, clubName, alert);
    }
  }
}

/**
 * Envoyer les notifications d'alerte
 */
async function sendAlertNotifications(siteId, clubName, alert) {
  // Email
  if (emailConfig.enabled && emailTransporter) {
    try {
      await emailTransporter.sendMail({
        from: emailConfig.from,
        to: emailConfig.to,
        subject: `[Neopro ${alert.level.toUpperCase()}] ${clubName} - ${alert.type}`,
        html: `
          <h2>Alerte Neopro</h2>
          <p><strong>Club:</strong> ${clubName}</p>
          <p><strong>Site ID:</strong> ${siteId}</p>
          <p><strong>Niveau:</strong> ${alert.level.toUpperCase()}</p>
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Message:</strong> ${alert.message}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <hr>
          <p><small>Neopro Monitoring System</small></p>
        `
      });
      console.log(`Email alert sent for ${clubName}`);
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  // Webhook
  if (webhookConfig.enabled && webhookConfig.url) {
    try {
      const https = require('https');
      const data = JSON.stringify({
        siteId,
        clubName,
        alert,
        timestamp: Date.now()
      });

      const url = new URL(webhookConfig.url);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options);
      req.write(data);
      req.end();

      console.log(`Webhook alert sent for ${clubName}`);
    } catch (error) {
      console.error('Error sending webhook:', error);
    }
  }
}

/**
 * Vérifier les sites offline
 */
setInterval(() => {
  const now = Date.now();

  for (const [siteId, site] of sites.entries()) {
    const lastUpdate = site.lastHeartbeat || site.timestamp;

    // Si offline depuis 5 minutes, créer une alerte
    if (now - lastUpdate > 300000) {
      const offlineAlert = {
        level: 'critical',
        type: 'offline',
        message: `Site hors ligne depuis ${Math.floor((now - lastUpdate) / 60000)} minutes`
      };

      processAlerts(siteId, site.clubName, [offlineAlert]);
    }
  }
}, 60000); // Vérifier toutes les minutes

/**
 * Page d'accueil
 */
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Neopro Monitoring</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        h1 { color: #2563eb; }
        .card {
          background: white;
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .endpoint {
          padding: 10px;
          background: #f0f0f0;
          margin: 5px 0;
          border-radius: 4px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <h1>🎮 Neopro Monitoring Server</h1>
      <div class="card">
        <h2>API Endpoints</h2>
        <div class="endpoint">GET /api/sites - Liste des sites</div>
        <div class="endpoint">GET /api/sites/:id - Détails site</div>
        <div class="endpoint">GET /api/sites/:id/history - Historique</div>
        <div class="endpoint">GET /api/stats - Statistiques globales</div>
        <div class="endpoint">GET /api/alerts - Toutes les alertes</div>
        <div class="endpoint">POST /api/metrics - Recevoir métriques</div>
      </div>
      <div class="card">
        <h2>Status</h2>
        <p>Sites actifs: ${sites.size}</p>
        <p>Alertes totales: ${alerts.length}</p>
      </div>
    </body>
    </html>
  `);
});

/**
 * Démarrage du serveur
 */
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         NEOPRO MONITORING SERVER                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ API: http://localhost:${PORT}/api`);
  console.log(`✓ Email alerts: ${emailConfig.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`✓ Webhook alerts: ${webhookConfig.enabled ? 'Enabled' : 'Disabled'}`);
  console.log('');
  console.log('Waiting for sites to connect...');
});

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
