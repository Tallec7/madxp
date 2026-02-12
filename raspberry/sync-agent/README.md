# NEOPRO Sync Agent

Agent de synchronisation pour les boîtiers Raspberry Pi NEOPRO. Permet la gestion centralisée depuis le serveur NEOPRO Central.

## 🎯 Fonctionnalités

- ✅ **Connexion WebSocket** au serveur central
- ✅ **Authentification sécurisée** via API Key unique
- ✅ **Heartbeat automatique** (métriques système toutes les 30s)
- ✅ **Déploiement de vidéos** à distance
- ✅ **Mises à jour logicielles** avec rollback automatique
- ✅ **Commandes à distance** (reboot, restart services, logs, etc.)
- ✅ **Backup automatique** avant chaque mise à jour
- ✅ **Reconnexion automatique** en cas de perte réseau

## 📦 Installation

### Prérequis

- Node.js >= 18.0.0
- npm
- Accès sudo pour l'installation du service systemd

### Étape 1 : Installer les dépendances

```bash
cd /home/neopro/sync-agent
npm install
```

### Étape 2 : Enregistrer le site auprès du serveur central

```bash
sudo node scripts/register-site.js
```

Vous devrez fournir :

- URL du serveur central (ex: https://neopro-central-production.up.railway.app)
- Email et mot de passe admin NEOPRO
- Informations du site (nom, club, localisation, sports)
- Modèle du boîtier (détecté automatiquement sur Raspberry Pi)

Le script créera automatiquement la configuration dans `/etc/neopro/site.conf`.

### Étape 3 : Installer le service systemd

```bash
sudo npm run install-service
```

L'agent démarrera automatiquement et se lancera au boot du Raspberry Pi.

## 🔧 Configuration

### Fichier de configuration

**Emplacement :** `/etc/neopro/site.conf`

```ini
# Serveur central
CENTRAL_SERVER_URL=https://neopro-central-production.up.railway.app
CENTRAL_SERVER_ENABLED=true

# Identifiants (générés automatiquement lors de l'enregistrement)
SITE_ID=uuid-du-site
SITE_API_KEY=cle-api-unique

# Informations du site
SITE_NAME=Site Rennes
CLUB_NAME=Rennes FC
LOCATION_CITY=Rennes
LOCATION_REGION=Bretagne
LOCATION_COUNTRY=France
SPORTS=football,futsal
HARDWARE_MODEL=Raspberry Pi 4 Model B Rev 1.4

# Chemins
NEOPRO_ROOT=/home/pi/neopro
VIDEOS_PATH=/home/pi/neopro/videos
CONFIG_PATH=/home/pi/neopro/webapp/configuration.json
BACKUP_PATH=/home/pi/neopro/backups

# Monitoring
HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=300000

# Logs
LOG_LEVEL=info
LOG_PATH=/home/pi/neopro/logs/sync-agent.log

# Mises à jour
AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_HOUR=3

# Sécurité
MAX_DOWNLOAD_SIZE=1073741824
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs,get_system_info,get_config,update_hotspot,get_hotspot_config
```

## 🚀 Utilisation

### Commandes du service

```bash
# Vérifier le statut
sudo systemctl status neopro-sync-agent

# Démarrer
sudo systemctl start neopro-sync-agent

# Arrêter
sudo systemctl stop neopro-sync-agent

# Redémarrer
sudo systemctl restart neopro-sync-agent

# Voir les logs en temps réel
sudo journalctl -u neopro-sync-agent -f

# Voir les logs récents (100 dernières lignes)
sudo journalctl -u neopro-sync-agent -n 100
```

### Mode développement

```bash
npm run dev
```

### Diagnostic de connexion

En cas de problème de connexion ou d'authentification :

```bash
npm run diagnose
```

Ce script vérifie :

- La présence et validité des fichiers de configuration
- Les variables requises (SITE_ID, SITE_API_KEY, etc.)
- La connectivité au serveur central
- L'authentification Socket.IO

### Resynchroniser l'API key

Si l'authentification échoue (API key invalide ou désynchronisée) :

```bash
npm run resync
```

Ce script :

1. Se connecte au serveur central avec vos credentials admin
2. Régénère une nouvelle API key pour le site
3. Met à jour automatiquement la configuration locale

### Test de connexion

```bash
npm test
```

## 📡 Communication avec le serveur central

### Connexion initiale

```javascript
// L'agent se connecte automatiquement au démarrage
socket.emit('authenticate', {
  siteId: 'uuid-du-site',
  apiKey: 'cle-api-unique',
});

// Confirmation d'authentification
socket.on('authenticated', (data) => {
  console.log('Connecté:', data);
});
```

### Heartbeat (métriques)

Envoyé automatiquement toutes les 30 secondes :

```javascript
{
  siteId: 'uuid-du-site',
  timestamp: 1234567890,
  metrics: {
    cpu: 45.2,      // Utilisation CPU en %
    memory: 62.1,   // Utilisation RAM en %
    temperature: 52.3, // Température en °C
    disk: 78.5,     // Utilisation disque en %
    uptime: 3600000 // Uptime en ms
  }
}
```

### Réception de commandes

```javascript
socket.on('command', async (cmd) => {
  // cmd = { id, type, data }

  // Exécuter la commande
  const result = await executeCommand(cmd);

  // Renvoyer le résultat
  socket.emit('command_result', {
    commandId: cmd.id,
    status: 'success',
    result: result,
  });
});
```

## 🎬 Commandes supportées

### 1. deploy_video

Déploie une vidéo sur le boîtier.

```json
{
  "type": "deploy_video",
  "data": {
    "videoUrl": "https://server/videos/file.mp4",
    "filename": "entrainement.mp4",
    "originalName": "Entrainement passes.mp4",
    "category": "Technique",
    "subcategory": "Passes",
    "videoId": "uuid",
    "duration": 154
  }
}
```

Processus :

1. Téléchargement depuis serveur central
2. Enregistrement dans `/home/neopro/videos/Technique/Passes/`
3. Mise à jour de `configuration.json`
4. Notification de l'app locale

### 2. delete_video

Supprime une vidéo du boîtier.

```json
{
  "type": "delete_video",
  "data": {
    "filename": "entrainement.mp4",
    "category": "Technique",
    "subcategory": "Passes"
  }
}
```

### 3. update_software

Met à jour le logiciel NEOPRO.

```json
{
  "type": "update_software",
  "data": {
    "updateUrl": "https://server/updates/neopro-v2.1.3.tar.gz",
    "version": "2.1.3",
    "checksum": "sha256-hash"
  }
}
```

Processus :

1. Téléchargement du package
2. Vérification checksum (si fourni)
3. **Backup automatique**
4. Arrêt des services
5. Installation
6. Redémarrage des services
7. Vérification santé
8. Rollback automatique si échec

### 4. update_config

Met à jour la configuration locale.

```json
{
  "type": "update_config",
  "data": {
    "configuration": {
      "version": "1.0",
      "categories": [...]
    }
  }
}
```

### 5. reboot

Redémarre le Raspberry Pi. La commande utilise `exec` en mode fire-and-forget (pas `execAsync`) car `sudo reboot` tue le système avant que le child process ne puisse retourner un exit code. Le résultat `{ success: true }` est envoyé au serveur central avant l'exécution effective du reboot (délai de 2 secondes).

```json
{
  "type": "reboot"
}
```

### 6. restart_service

Redémarre un service spécifique.

```json
{
  "type": "restart_service",
  "data": {
    "service": "neopro-app"
  }
}
```

Services disponibles :

- `neopro-app` - Application Angular
- `neopro-admin` - Interface admin
- `neopro-sync-agent` - Cet agent

### 7. get_logs

Récupère les logs d'un service.

```json
{
  "type": "get_logs",
  "data": {
    "service": "neopro-app",
    "lines": 100
  }
}
```

### 8. get_system_info

Récupère des informations système détaillées.

```json
{
  "type": "get_system_info"
}
```

Retourne :

- Informations matériel (CPU, RAM, modèle Raspberry Pi)
- Informations OS (distribution, kernel, arch)
- État réseau
- Métriques actuelles

## 🔐 Sécurité

### Authentification

- Chaque site possède une **API Key unique** (32 bytes hex)
- L'API Key est générée lors de l'enregistrement
- Stockée de manière sécurisée dans `/etc/neopro/site.conf`

### Whitelist de commandes

Par défaut, seules ces commandes sont autorisées :

- `deploy_video`
- `delete_video`
- `update_software`
- `update_config`
- `reboot`
- `restart_service`
- `get_logs`

Pour autoriser d'autres commandes, modifier `ALLOWED_COMMANDS` dans la config.

### Limite de téléchargement

Par défaut : **1 GB max** par téléchargement.

Configurable via `MAX_DOWNLOAD_SIZE` (en bytes).

### Communication chiffrée

- WebSocket sur **TLS** (wss://) en production
- Certificats vérifiés automatiquement

## 📊 Monitoring

### Métriques collectées

- **CPU** : Utilisation moyenne (%)
- **RAM** : Utilisation mémoire (%)
- **Température** : Température CPU (°C)
- **Disque** : Utilisation espace disque (%)
- **Uptime** : Temps depuis dernier boot (ms)

### Alertes automatiques

Le serveur central génère des alertes si :

- Température > 75°C (warning) ou > 80°C (critical)
- Disque > 90% (warning) ou > 95% (critical)
- Mémoire > 90% (warning)
- Site offline > 5 minutes

### Logs

Logs écrits dans :

- **Journal systemd** : `journalctl -u neopro-sync-agent`
- **Fichier local** : `/home/neopro/logs/sync-agent.log`

Rotation automatique : max 5 fichiers de 10 MB.

## 🔄 Mises à jour

### Mise à jour automatique

Si `AUTO_UPDATE_ENABLED=true`, l'agent peut recevoir et installer des mises à jour.

L'heure de mise à jour préférée peut être configurée via `AUTO_UPDATE_HOUR` (défaut: 3h du matin).

### Mise à jour manuelle

```bash
cd /home/neopro/sync-agent
git pull
npm install
sudo systemctl restart neopro-sync-agent
```

### Rollback

En cas d'échec de mise à jour, l'agent effectue automatiquement un **rollback** vers la dernière version fonctionnelle.

Les backups sont conservés dans `/home/neopro/backups/` (5 derniers).

## 🛠️ Développement

### Structure du projet

```
sync-agent/
├── src/
│   ├── agent.js              # Point d'entrée principal
│   ├── config.js             # Configuration
│   ├── logger.js             # Winston logger
│   ├── metrics.js            # Collecte métriques
│   ├── analytics.js          # Collecte analytics
│   └── commands/
│       ├── index.js          # Routeur de commandes
│       ├── deploy-video.js   # Handler déploiement vidéo
│       ├── delete-video.js   # Handler suppression vidéo
│       └── update-software.js # Handler mise à jour
├── scripts/
│   ├── install-service.js    # Installation service systemd
│   ├── register-site.js      # Enregistrement auprès serveur
│   ├── diagnose.js           # Diagnostic connexion/auth
│   └── resync-apikey.js      # Resynchronisation API key
├── config/
│   └── .env.example          # Template configuration
├── package.json
└── README.md
```

### Ajouter une nouvelle commande

1. Créer `src/commands/ma-commande.js` :

```javascript
const logger = require('../logger');

class MaCommandeHandler {
  async execute(data) {
    logger.info('Exécution de ma commande', data);

    // Votre logique ici

    return { success: true, result: 'OK' };
  }
}

module.exports = new MaCommandeHandler();
```

2. Enregistrer dans `src/commands/index.js` :

```javascript
const maCommande = require('./ma-commande');

const commands = {
  // ...
  ma_commande: maCommande,
};
```

3. Ajouter dans la whitelist :

```bash
ALLOWED_COMMANDS=...,ma_commande
```

## ❓ Troubleshooting

### L'agent ne se connecte pas

```bash
# Lancer le diagnostic complet
npm run diagnose

# Vérifier la configuration
cat /etc/neopro/site.conf

# Vérifier la connectivité
ping neopro-central-production.up.railway.app

# Vérifier les logs
sudo journalctl -u neopro-sync-agent -n 50
```

### Erreur "Authentication failed" / "Authentification échouée"

Le message d'erreur détaillé indique la cause :

| Message                  | Cause                               | Solution                               |
| ------------------------ | ----------------------------------- | -------------------------------------- |
| `Site non trouvé: <id>`  | Le site n'existe pas sur le serveur | Ré-enregistrer avec `npm run register` |
| `Clé API invalide`       | API key locale ≠ API key serveur    | Resync avec `npm run resync`           |
| `Identifiants manquants` | SITE_ID ou SITE_API_KEY vide        | Vérifier `/etc/neopro/site.conf`       |

**Diagnostic rapide :**

```bash
# 1. Lancer le diagnostic
npm run diagnose

# 2. Si API key invalide, resynchroniser
npm run resync
# Entrer email/password admin

# 3. Redémarrer le service
sudo systemctl restart neopro-sync-agent
```

**Si le site n'existe plus sur le serveur :**

```bash
npm run register
sudo systemctl restart neopro-sync-agent
```

### Les métriques ne remontent pas

```bash
# Vérifier que l'agent est connecté
sudo systemctl status neopro-sync-agent

# Tester la collecte de métriques manuellement
node -e "require('./src/metrics').collectAll().then(console.log)"
```

### Les analytics vidéo ne remontent pas

Les analytics sont collectées par le frontend Angular, stockées localement, puis envoyées au serveur central par le sync-agent.

**Flux des analytics :**

```
Frontend Angular → POST /api/analytics → serveur local → analytics_buffer.json
                                                              ↓
Sync-agent (5 min) → POST /api/analytics/video-plays → serveur central
```

**Diagnostic :**

```bash
# 1. Vérifier le buffer local
cat ~/neopro/data/analytics_buffer.json

# 2. Vérifier que le serveur local accepte les analytics
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{"events":[]}'
# Doit retourner {"success":true,...}

# 3. Vérifier les logs du sync-agent
journalctl -u neopro-sync-agent -n 50 | grep -i analytic
# Rechercher "Analytics sent" ou "Starting analytics sync"

# 4. Forcer l'envoi immédiat
sudo systemctl restart neopro-sync-agent
```

**Causes courantes :**

| Symptôme                       | Cause                                                    | Solution                                         |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Buffer vide `[]`               | Frontend n'envoie pas ou serveur local manque l'endpoint | Vérifier `server.js` contient `/api/analytics`   |
| "Cannot POST /api/analytics"   | Ancienne version du serveur                              | Mettre à jour `/home/pi/neopro/server/server.js` |
| Buffer plein mais pas envoyé   | Sync-agent ne démarre pas le sync                        | Vérifier les logs, redémarrer le service         |
| Erreur HTTP 404 sur le central | Endpoint central non déployé                             | Vérifier que le serveur central est à jour       |

### Mise à jour échouée

L'agent devrait avoir effectué un rollback automatique.

Pour vérifier :

```bash
# Voir les backups disponibles
ls -lah /home/neopro/backups/

# Restaurer manuellement si nécessaire
sudo systemctl stop neopro-app neopro-admin
cp -r /home/neopro/backups/backup-XXXX/* /home/neopro/
sudo systemctl start neopro-app neopro-admin
```

## 📞 Support

Pour toute question ou problème, contacter l'équipe NEOPRO.

---

**Version :** 1.0.1
**Dernière mise à jour :** Février 2026
