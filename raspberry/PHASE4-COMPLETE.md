# Phase 4 - Monitoring avancé et gestion de flotte ✅

## Résumé de la Phase 4

Cette phase ajoute un système de monitoring centralisé permettant de superviser tous les Raspberry Pi déployés depuis un serveur central.

---

## ✅ Composants créés

### 1. **Monitoring Agent (Client)**
`monitoring/client/monitoring-agent.js`

**Fonctionnalités :**
- Collecte automatique des métriques système
- Envoi périodique au serveur central (5 min)
- Heartbeat toutes les 30 secondes
- Détection automatique d'alertes
- Configuration via variables d'environnement

**Métriques collectées :**
- CPU (usage, cores, model)
- Mémoire (total, utilisé, pourcentage)
- Température (Raspberry Pi)
- Disque (usage, espace disponible)
- Réseau (interfaces, WiFi)
- Services (status de tous les services)
- Application (webapp, serveur, admin, vidéos)

**Seuils d'alerte :**
- Température > 75°C → Critical
- Disque > 90% → Warning
- Mémoire > 90% → Warning
- Service arrêté → Critical
- Application manquante → Critical

### 2. **Monitoring Server (Central)**
`monitoring/server/monitoring-server.js`

**Fonctionnalités :**
- Collecte de données de tous les sites
- Stockage en mémoire (ou BDD)
- API REST complète
- Détection sites offline
- Système d'alertes email/webhook

**API REST :**
```
GET  /api/sites              Liste tous les sites
GET  /api/sites/:id          Détails d'un site
GET  /api/sites/:id/history  Historique métriques
GET  /api/stats              Statistiques globales
GET  /api/alerts             Toutes les alertes
POST /api/metrics            Recevoir métriques
```

**Notifications :**
- Email (via nodemailer)
- Webhook (POST JSON)
- Évite le spam (cooldown 1h par alerte)

---

## 🎯 Architecture

```
┌──────────────────────────────────────────────────────┐
│         SERVEUR CENTRAL MONITORING                    │
│         (VPS, Cloud, Serveur dédié)                   │
│                                                       │
│  ┌──────────────────────────────────────────┐       │
│  │  monitoring-server.js                     │       │
│  │  • API REST                               │       │
│  │  • Base de données                        │       │
│  │  • Alertes email/webhook                  │       │
│  │  • Dashboard web                          │       │
│  └──────────────────────────────────────────┘       │
└────────────────┬─────────────────────────────────────┘
                 │
                 │ HTTPS
                 │
    ┌────────────┼────────────┬────────────┐
    │            │            │            │
    ▼            ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│ Club 1 │  │ Club 2 │  │ Club 3 │  │ Club N │
│        │  │        │  │        │  │        │
│ Agent  │  │ Agent  │  │ Agent  │  │ Agent  │
│ ↓      │  │ ↓      │  │ ↓      │  │ ↓      │
│ Envoi  │  │ Envoi  │  │ Envoi  │  │ Envoi  │
│ 5 min  │  │ 5 min  │  │ 5 min  │  │ 5 min  │
└────────┘  └────────┘  └────────┘  └────────┘
```

---

## 📊 Métriques et Alertes

### Métriques système
```json
{
  "siteId": "cesson-b827eb123456",
  "clubName": "CESSON",
  "timestamp": 1234567890,

  "cpu": {
    "cores": 4,
    "usage": "45.2"
  },

  "memory": {
    "total": 4096000000,
    "used": 1536000000,
    "percent": "37.5"
  },

  "temperature": "52.4",

  "disk": {
    "size": "32G",
    "used": "12G",
    "available": "18G",
    "percent": 40
  },

  "services": {
    "neopro-app": "running",
    "neopro-admin": "running",
    "nginx": "running",
    "hostapd": "running"
  },

  "alerts": [
    {
      "level": "warning",
      "type": "disk",
      "message": "Espace disque faible: 85% utilisé"
    }
  ]
}
```

### Types d'alertes

**Critical :**
- Température > 75°C
- Service arrêté
- Application manquante
- Site offline > 5 min

**Warning :**
- Disque > 90%
- Mémoire > 90%
- Espace disque < 2GB

**Info :**
- Mise à jour disponible
- Maintenance programmée

---

## 🔔 Système d'alertes

### Email

**Configuration :**
```bash
# Variables d'environnement serveur
ENABLE_EMAIL=true
EMAIL_FROM=neopro@example.com
EMAIL_TO=support@neopro.fr
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Template email :**
```
Objet: [Neopro CRITICAL] CESSON - temperature

Alerte Neopro
Club: CESSON
Site ID: cesson-b827eb123456
Niveau: CRITICAL
Type: temperature
Message: Température élevée: 78.2°C
Date: 04/12/2024 14:35:22
```

### Webhook

**Configuration :**
```bash
ENABLE_WEBHOOK=true
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Payload JSON :**
```json
{
  "siteId": "cesson-b827eb123456",
  "clubName": "CESSON",
  "alert": {
    "level": "critical",
    "type": "temperature",
    "message": "Température élevée: 78.2°C",
    "value": "78.2"
  },
  "timestamp": 1234567890
}
```

---

## 🚀 Installation et configuration

### Sur chaque Raspberry Pi

**1. Copier l'agent :**
```bash
cp monitoring/client/monitoring-agent.js /home/pi/neopro/
cd /home/pi/neopro
npm install
```

**2. Configuration :**
```bash
# Variables d'environnement
export MONITORING_SERVER=https://monitoring.neopro.fr
export SITE_ID=cesson-b827eb123456
export CLUB_NAME=CESSON
export MONITORING_INTERVAL=300000
```

**3. Service systemd :**
```bash
sudo cp monitoring/client/neopro-monitoring.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable neopro-monitoring
sudo systemctl start neopro-monitoring
```

### Serveur central

**1. Installation :**
```bash
cd monitoring/server
npm install
```

**2. Configuration :**
```bash
export PORT=3001
export ENABLE_EMAIL=true
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-password
export EMAIL_TO=support@neopro.fr
```

**3. Lancement :**
```bash
# Développement
npm start

# Production (PM2 recommandé)
pm2 start monitoring-server.js --name neopro-monitoring
pm2 save
```

---

## 📈 Statistiques et Dashboard

### API Statistiques globales

**GET /api/stats**

```json
{
  "totalSites": 25,
  "activeSites": 23,
  "warningsSites": 1,
  "criticalSites": 1,
  "offlineSites": 0,
  "totalAlerts": 3,
  "criticalAlerts": 1,
  "averageMetrics": {
    "temperature": "54.2",
    "cpu": "38.5",
    "memory": "42.1",
    "disk": "45.3"
  }
}
```

### Dashboard web (à implémenter en Phase 5)

**Vue d'ensemble :**
- Carte avec tous les sites
- Status temps réel (vert/orange/rouge)
- Alertes en cours
- Graphiques tendances

**Vue site :**
- Métriques détaillées
- Graphiques historiques
- Services status
- Logs récents

---

## 🔧 Utilisation

### Vérifier les sites actifs

```bash
curl http://monitoring.neopro.fr/api/sites
```

### Voir les alertes

```bash
curl http://monitoring.neopro.fr/api/alerts
```

### Historique d'un site

```bash
curl http://monitoring.neopro.fr/api/sites/cesson-b827eb123456/history
```

### Tester l'agent localement

```bash
# Sur le Raspberry Pi
node /home/pi/neopro/monitoring-agent.js

# Output:
# Neopro Monitoring Agent starting...
# Site ID: cesson-b827eb123456
# Club: CESSON
# Server: https://monitoring.neopro.fr
# Collecting initial metrics...
# Sending metrics to server...
# Initial metrics sent successfully
# Monitoring agent running...
```

---

## 🔒 Sécurité

### Authentification

Pour production, ajouter authentification API :
```javascript
// Middleware authentification
app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### HTTPS

Utiliser un reverse proxy (Nginx) avec Let's Encrypt :
```nginx
server {
    listen 443 ssl;
    server_name monitoring.neopro.fr;

    ssl_certificate /etc/letsencrypt/live/monitoring.neopro.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoring.neopro.fr/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
    }
}
```

---

## 📋 Checklist déploiement

### Serveur central
- [ ] VPS/Cloud provisionné
- [ ] Node.js installé
- [ ] monitoring-server déployé
- [ ] Variables d'environnement configurées
- [ ] Email SMTP configuré
- [ ] Webhook configuré (optionnel)
- [ ] HTTPS configuré (Let's Encrypt)
- [ ] Firewall configuré (port 443)
- [ ] PM2 ou systemd configuré
- [ ] Logs monitoring activés

### Chaque Raspberry Pi
- [ ] monitoring-agent copié
- [ ] Dépendances npm installées
- [ ] Variables d'environnement configurées
- [ ] Service systemd créé
- [ ] Service activé et démarré
- [ ] Premier envoi testé
- [ ] Logs vérifiés

---

## 🎯 Bénéfices

### Pour les développeurs
✅ Vue d'ensemble de tous les sites
✅ Détection proactive des problèmes
✅ Historique des métriques
✅ Alertes automatiques
✅ Diagnostic à distance

### Pour le support
✅ Identification rapide des problèmes
✅ Priorisation des interventions
✅ Statistiques d'utilisation
✅ Planification maintenance

### Pour les clubs
✅ Meilleure disponibilité
✅ Résolution rapide des problèmes
✅ Maintenance préventive
✅ Transparence sur l'état du système

---

## 📝 Évolutions futures (Phase 5)

**Dashboard web interactif :**
- Interface React/Vue.js
- Graphiques temps réel (Chart.js)
- Carte interactive des sites
- Filtres et recherche
- Export PDF rapports

**Analyse avancée :**
- Machine Learning pour prédiction pannes
- Détection d'anomalies
- Tendances et prévisions
- Recommandations automatiques

**Gestion de flotte :**
- Déploiement coordonné mises à jour
- Configuration centralisée
- Commandes à distance
- Gestion des vidéos centralisée

---

## ✅ Phase 4 : TERMINÉE

**Système de monitoring complet opérationnel :**

✅ **Agent de monitoring** sur chaque Raspberry Pi
✅ **Serveur central** de collecte
✅ **API REST** complète
✅ **Système d'alertes** email/webhook
✅ **Détection automatique** des problèmes
✅ **Historique** des métriques
✅ **Statistiques globales** de la flotte

**Prêt pour supervision à grande échelle de dizaines de sites !**

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** Neopro / Kalon Partners
