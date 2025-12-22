# Documentation technique Neopro

## Table des matières

1. [Architecture globale](#architecture-globale)
2. [Configuration nouveau club](#configuration-nouveau-club)
3. [Mise à jour boîtier](#mise-à-jour-boîtier)
4. [Authentification](#authentification)
5. [Serveur central](#serveur-central)
6. [Scripts disponibles](#scripts-disponibles)
7. [Structure des fichiers](#structure-des-fichiers)
8. [Configuration réseau](#configuration-réseau)
9. [Services systemd](#services-systemd)
10. [API et WebSocket](#api-et-websocket)

---

## Architecture globale

### Vue d'ensemble

```
┌──────────────────────────────────────────────────────┐
│           SERVEUR CENTRAL (Render.com)               │
│                                                      │
│  • Dashboard Angular (monitoring)                   │
│  • API REST + WebSocket                             │
│  • PostgreSQL (métriques, sites)                    │
│  • Authentification JWT                             │
│                                                      │
└─────────────────┬────────────────────────────────────┘
                  │ Internet (WebSocket)
        ┌─────────┴─────────┬──────────────┐
        ↓                   ↓              ↓
   ┌─────────┐         ┌─────────┐    ┌─────────┐
   │  CLUB 1 │         │  CLUB 2 │    │  CLUB N │
   │   Pi    │         │   Pi    │    │   Pi    │
   └─────────┘         └─────────┘    └─────────┘
```

### Architecture locale (Raspberry Pi)

```
Raspberry Pi (neopro.local / 192.168.4.1)
├── WiFi Hotspot: NEOPRO-[CLUB]
├── mDNS: neopro.local
│
├── Port 80 (nginx)
│   └── Application Angular (dist/neopro/browser/)
│       ├── /login       - Page de connexion
│       ├── /tv          - Mode TV (protégé)
│       └── /remote      - Télécommande (protégé)
│
├── Port 3000 (Node.js)
│   └── Serveur Socket.IO
│       └── Communication temps réel TV ↔ Remote
│
├── Port 8080 (Node.js)
│   └── Interface Admin
│       ├── Dashboard système
│       ├── Gestion configuration
│       └── Upload vidéos
│
└── Sync Agent (systemd)
    └── Connexion WebSocket au serveur central
```

---

## Configuration nouveau club

### Méthode automatique (RECOMMANDÉE)

```bash
./raspberry/scripts/setup-new-club.sh
```

#### Ce que fait le script

1. **Collecte des informations**
   - Nom du club (identifiant unique, ex: CESSON)
   - Nom complet (ex: CESSON Handball)
   - Nom du site (ex: Complexe Sportif CESSON)
   - Localisation (ville, région, pays)
   - Sports pratiqués
   - Contact (email, téléphone)
   - Mot de passe (12+ caractères minimum)

2. **Création de la configuration**
   - Copie `raspberry/config/templates/TEMPLATE-configuration.json`
   - Remplace tous les placeholders
   - Génère `raspberry/config/templates/[CLUB_NAME]-configuration.json`

3. **Build de l'application**
   - Copie la config dans `webapp/configuration.json`
   - Exécute `npm run build:raspberry`
   - Archive dans `raspberry/deploy/neopro-raspberry-[timestamp].tar.gz`

4. **Déploiement sur le Pi**
   - Transfert SSH vers `pi@neopro.local`
   - Extraction dans `/home/pi/neopro/webapp/`
   - Configuration des permissions (www-data)

5. **Configuration du hotspot WiFi**
   - Met à jour le SSID dans `/etc/hostapd/hostapd.conf`
   - Redémarre hostapd
   - Le réseau WiFi `NEOPRO-[CLUB]` devient visible

6. **Configuration sync-agent**
   - Installation npm dans `/home/pi/neopro/sync-agent`
   - Enregistrement sur le serveur central
   - Installation du service systemd
   - Démarrage automatique

7. **Résumé**
   - Affiche toutes les infos du club
   - URLs d'accès (avec WiFi si configuré)
   - Commandes utiles
   - Prochaines étapes

### Méthode manuelle

#### 1. Créer la configuration

```bash
# Copier le template
cp raspberry/config/templates/TEMPLATE-configuration.json \
   raspberry/config/templates/CESSON-configuration.json

# Éditer
nano raspberry/config/templates/CESSON-configuration.json
```

**Structure de la configuration :**

```json
{
  "remote": {
    "title": "Télécommande Néopro - CESSON"
  },
  "auth": {
    "password": "VotreMotDePasseSecurise123!",
    "clubName": "CESSON",
    "sessionDuration": 28800000
  },
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central.onrender.com",
    "siteName": "Complexe Sportif CESSON",
    "clubName": "CESSON Handball",
    "location": {
      "city": "Cesson-Sévigné",
      "region": "Bretagne",
      "country": "France"
    },
    "sports": ["handball"],
    "contact": {
      "email": "contact@cesson-handball.fr",
      "phone": "+33 2 99 XX XX XX"
    }
  },
  "version": "1.0",
  "sponsors": [...],
  "categories": [...]
}
```

#### 2. Build

```bash
# Copier la config
mkdir -p webapp
cp raspberry/config/templates/CESSON-configuration.json webapp/configuration.json

# Build
npm run build:raspberry
```

#### 3. Déploiement

```bash
# Déploiement automatique
npm run deploy:raspberry neopro.local

# Ou manuel
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Corriger les permissions
ssh pi@neopro.local
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo chmod 755 /home/pi
sudo chmod 755 /home/pi/neopro
```

#### 4. Sync-agent

```bash
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent

# Installer
npm install --production

# Enregistrer
sudo node scripts/register-site.js

# Installer le service
sudo npm run install-service

# Vérifier
sudo systemctl status neopro-sync
```

---

## Mise à jour boîtier

### Via interface web (port 8080)

**URL :** `http://neopro.local:8080`

1. Onglet **Configuration**
2. Modifier le JSON
3. **Sauvegarder et Redémarrer**

L'interface redémarre automatiquement avec la nouvelle config.

### Via script

```bash
# 1. Modifier localement
nano raspberry/config/templates/CESSON-configuration.json

# 2. Copier
mkdir -p webapp
cp raspberry/config/templates/CESSON-configuration.json webapp/configuration.json

# 3. Build
npm run build:raspberry

# 4. Déployer
npm run deploy:raspberry neopro.local
```

### Mise à jour OTA (depuis le serveur central)

**Prochainement :** Possibilité de pousser des mises à jour depuis le dashboard central.

---

## Authentification

### Comment ça fonctionne

1. **Configuration :** Mot de passe défini dans `config.auth.password`
2. **Login :** `/login` vérifie le mot de passe
3. **Session :** Token JWT stocké dans localStorage
4. **Durée :** 8h par défaut (`config.auth.sessionDuration`)
5. **Protection :** Guard Angular sur `/tv` et `/remote`

### Fichiers impliqués

- `src/app/services/auth.service.ts` - Service d'authentification
- `src/app/guards/auth.guard.ts` - Protection des routes
- `src/app/login/login.component.ts` - Page de login
- `webapp/configuration.json` - Mot de passe configuré (sur le Pi)

### Personnaliser le mot de passe

**Option 1 : Script automatique**

```bash
./raspberry/scripts/setup-new-club.sh
# Le script demande le mot de passe interactivement
```

**Option 2 : Manuel**

```json
{
  "auth": {
    "password": "VotreNouveauMotDePasse123!",
    "clubName": "CLUB_NAME",
    "sessionDuration": 28800000
  }
}
```

**Exigences :**

- Minimum 12 caractères
- Mélange majuscules, minuscules, chiffres, symboles recommandé

### Mot de passe par défaut

Si aucun mot de passe n'est configuré : `GG_NEO_25k!`

**⚠️ À changer en production !**

---

## Serveur central

### URLs

- **API :** `https://neopro-central.onrender.com`
- **Dashboard :** `https://neopro-central.onrender.com`

### Fonctionnalités

1. **Gestion des sites**
   - Liste de tous les boîtiers
   - Statut en ligne/hors ligne
   - Dernière connexion
   - Métriques système

2. **Monitoring**
   - CPU, RAM, température
   - Espace disque
   - Uptime
   - Alertes automatiques

3. **Déploiement**
   - Mise à jour OTA (à venir)
   - Gestion des configurations
   - Push de contenu

### Enregistrement d'un site

```bash
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js
```

**Le script demande :**

- Site name (ex: Complexe Sportif CESSON)
- Club name (ex: CESSON Handball)
- City, region, country
- Sports (handball par défaut)
- Contact email
- Contact phone (optionnel)

**Résultat :**

- Enregistrement sur le serveur central
- Génération d'un site ID
- Création de `/etc/neopro/site.conf`

### Vérifier la connexion

```bash
# Statut du service
ssh pi@neopro.local 'sudo systemctl status neopro-sync'

# Logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 50'

# Dashboard
# Vérifier que le site apparaît avec 🟢 En ligne
```

---

## Scripts disponibles

### Scripts d'automatisation

| Script                 | Emplacement          | Description                                    |
| ---------------------- | -------------------- | ---------------------------------------------- |
| `setup-new-club.sh`    | `raspberry/scripts/` | Configuration complète nouveau club (5-10 min) |
| `build-raspberry.sh`   | `raspberry/scripts/` | Build Angular optimisé pour Pi                 |
| `build-and-deploy.sh`  | `raspberry/scripts/` | Build + déploiement combinés                   |
| `deploy-remote.sh`     | `raspberry/scripts/` | Déploiement SSH seul (transfert + permissions) |
| `copy-to-pi.sh`        | `raspberry/scripts/` | Copie des fichiers d'installation vers Pi      |
| `diagnose-pi.sh`       | `raspberry/scripts/` | Diagnostic complet du Pi                       |
| `backup-club.sh`       | `raspberry/scripts/` | Sauvegarde configuration club                  |
| `restore-club.sh`      | `raspberry/scripts/` | Restauration configuration club                |
| `cleanup-pi.sh`        | `raspberry/scripts/` | Nettoyage ~/raspberry après install            |
| `setup-wifi-client.sh` | `raspberry/scripts/` | Configuration WiFi client (accès internet)     |
| `fix-hostname.sh`      | `raspberry/scripts/` | Correction hostname après reboot               |

> `setup-wifi-client.sh` met à jour `/etc/wpa_supplicant/wpa_supplicant.conf`, crée le lien `wpa_supplicant-wlan1.conf`, active `wpa_supplicant@wlan1.service` et relance `dhcpcd` afin que la connexion WiFi du club survive aux redémarrages.

### Traçabilité des versions

1. `build-raspberry.sh` détecte automatiquement la version à partir du tag Git (ou suffixe `+<SHA>` pour les builds intermédiaires), génère `release.json`, `VERSION` et `webapp/version.json` et les embarque dans l’archive.
2. `setup-remote-club.sh` / `deploy-remote.sh` copient ces fichiers sur le Pi et redémarrent le sync-agent.
3. Le sync-agent lit cette version via `utils/version-info.js` et l’envoie dans chaque heartbeat.
4. Le central-server met à jour `sites.software_version`, ce qui alimente les écrans “Sites” / “Détails” du dashboard central.
5. L’admin local (port 8080) lit aussi `webapp/version.json` pour afficher la version (`Neopro vX.Y.Z | Raspberry Pi Admin Panel`).

> ℹ️ Besoin d’un build plus rapide sur macOS : ajoute `--skip-xattr` ou `SKIP_XATTR_CLEANUP=true` à `build-raspberry.sh` / `build-and-deploy.sh` pour sauter la purge des attributs étendus (gain ~30 s, mais tar peut afficher des warnings sur Linux).

### Scripts npm (à la racine du projet)

```json
{
  "build:raspberry": "./raspberry/scripts/build-raspberry.sh",
  "deploy:raspberry": "./raspberry/scripts/build-and-deploy.sh"
}
```

**Usage :**

```bash
# Build seul (crée l'archive de déploiement)
npm run build:raspberry

# Build + déploiement vers le Pi
npm run deploy:raspberry
npm run deploy:raspberry neopro.local
npm run deploy:raspberry 192.168.4.1
```

---

## Structure des fichiers

### Sur le Raspberry Pi

```
/home/pi/neopro/
├── webapp/              # Application Angular (nginx)
│   ├── index.html
│   ├── configuration.json
│   └── ...
│
├── server/              # Serveur Socket.IO
│   ├── server.js
│   └── package.json
│
├── admin/               # Interface admin
│   ├── admin-server.js
│   └── public/
│
├── sync-agent/          # Agent de sync central
│   ├── agent.js
│   ├── scripts/
│   │   └── register-site.js
│   └── package.json
│
├── videos/              # Vidéos du club
│   ├── sponsors/
│   ├── jingles/
│   └── ...
│
├── logs/                # Logs
│   ├── nginx-error.log
│   ├── app.log
│   └── sync.log
│
└── scripts/             # Scripts maintenance
    └── diagnose-pi.sh
```

### Dans le projet

```
neopro/
├── src/                 # Code Angular
├── raspberry/
│   ├── scripts/         # Scripts automation
│   ├── configs/         # Configurations clubs
│   ├── config/          # Configs système (nginx, systemd)
│   ├── server/          # Code serveur Socket.IO
│   ├── admin/           # Code interface admin
│   └── sync-agent/      # Code agent sync
├── central-server/      # Serveur central
├── central-dashboard/   # Dashboard central
└── docs/                # Documentation
```

---

## Configuration réseau

### WiFi Hotspot

**SSID :** `NEOPRO-[CLUB_NAME]`
**Mot de passe :** Défini lors de l'installation

**Fichiers :**

- `/etc/hostapd/hostapd.conf` - Configuration hotspot
- `/etc/dnsmasq.conf` - DHCP

### mDNS (Avahi)

**Hostname :** `neopro.local`

Permet l'accès sans connaître l'IP.

**Fallback :** `192.168.4.1` (IP fixe hotspot)

### Ports utilisés

| Port | Service | Description               |
| ---- | ------- | ------------------------- |
| 80   | nginx   | Application web           |
| 3000 | Node.js | Socket.IO                 |
| 8080 | Node.js | Interface admin           |
| 22   | SSH     | Accès distant (optionnel) |

---

## Services systemd

### neopro-app

**Serveur Socket.IO** (port 3000)

```bash
# Statut
sudo systemctl status neopro-app

# Logs
sudo journalctl -u neopro-app -f

# Redémarrer
sudo systemctl restart neopro-app
```

**Fichier :** `/etc/systemd/system/neopro-app.service`

### neopro-admin

**Interface admin** (port 8080)

```bash
sudo systemctl status neopro-admin
sudo journalctl -u neopro-admin -f
```

**Fichier :** `/etc/systemd/system/neopro-admin.service`

### neopro-sync

**Agent de synchronisation** (connexion serveur central)

```bash
sudo systemctl status neopro-sync
sudo journalctl -u neopro-sync -f
```

**Fichier :** `/etc/systemd/system/neopro-sync.service`

### nginx

**Serveur web** (port 80)

```bash
sudo systemctl status nginx
sudo tail -f /home/pi/neopro/logs/nginx-error.log
```

**Fichier :** `/etc/nginx/sites-enabled/neopro`

---

## API et WebSocket

### Socket.IO (TV ↔ Remote)

**Événements :**

```javascript
// Remote → TV
socket.emit('play-video', { videoId: 'video-123' });
socket.emit('pause');
socket.emit('resume');
socket.emit('stop');

// TV → Remote
socket.emit('video-status', {
  playing: true,
  currentVideo: 'video-123',
  duration: 45.2,
  currentTime: 12.5,
});
```

**Connexion :**

```typescript
// Angular environment
socketUrl: 'http://neopro.local:3000';
```

### Analytics API (Raspberry Pi)

Le serveur Socket.IO sur le Raspberry Pi expose également une API REST pour les analytics.

**Endpoints :**

```
POST   /api/analytics           - Recevoir les événements de lecture vidéo
GET    /api/analytics/stats     - Statistiques du buffer local
```

**POST /api/analytics**

Reçoit les événements de lecture vidéo depuis l'application Angular et les stocke dans un fichier buffer pour le sync-agent.

```json
// Request body
{
  "events": [
    {
      "video_filename": "sponsor1.mp4",
      "category": "sponsor",
      "played_at": "2025-12-10T10:30:00Z",
      "duration_played": 30,
      "video_duration": 30,
      "completed": true,
      "trigger_type": "auto",
      "session_id": "session_123456789"
    }
  ]
}

// Response
{
  "success": true,
  "received": 1,
  "total": 15
}
```

**GET /api/analytics/stats**

Retourne les statistiques du buffer d'analytics local.

```json
{
  "count": 15,
  "oldestEvent": "2025-12-10T08:00:00Z",
  "newestEvent": "2025-12-10T10:30:00Z"
}
```

**Fichier buffer :** `/home/pi/neopro/data/analytics_buffer.json`

**Flux de données :**

1. L'application Angular (TV component) track les lectures vidéo via `AnalyticsService`
2. Les événements sont bufferisés localement (localStorage + mémoire)
3. Toutes les 5 minutes, le buffer est envoyé au serveur local (`POST /api/analytics`)
4. Le sync-agent récupère ces données et les envoie au serveur central
5. Le dashboard central affiche les statistiques agrégées

### API Serveur Central

**Base URL :** `https://neopro-central.onrender.com/api`

**Endpoints :**

```
POST   /auth/login              - Authentification dashboard
GET    /sites                   - Liste des sites
GET    /sites/:id               - Détails site
GET    /sites/:id/metrics       - Métriques site
POST   /sites/:id/commands      - Envoyer commande OTA
```

**Authentification :** JWT Bearer token

---

## Sécurité

### Mots de passe

- ✅ Stockés dans configuration.json (non versionné)
- ✅ .gitignore protège les configs avec mots de passe
- ✅ Validation 12+ caractères
- ✅ Confirmation à la saisie
- ✅ Jamais loggés

### Réseau

- ✅ WiFi isolé (hotspot dédié)
- ✅ Pas d'accès internet par défaut
- ✅ SSH désactivable

### Application

- ✅ Routes protégées (AuthGuard)
- ✅ Session avec expiration
- ✅ Validation uploads

---

## Commandes utiles

### Diagnostic

```bash
# Diagnostic complet
ssh pi@neopro.local
cd /home/pi/neopro
./scripts/diagnose-pi.sh

# Vérifier tous les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status neopro-sync
sudo systemctl status nginx

# Logs en temps réel
sudo journalctl -f
```

### Maintenance

```bash
# Redémarrer un service
sudo systemctl restart neopro-app

# Redémarrer le Pi
sudo reboot

# Vérifier l'espace disque
df -h

# Température
vcgencmd measure_temp
```

### Mise à jour

```bash
# Rebuild + deploy
npm run build:raspberry
npm run deploy:raspberry neopro.local

# Redémarrer nginx
ssh pi@neopro.local 'sudo systemctl restart nginx'
```

---

## Checklist production

### Nouveau club

- [ ] Script `setup-new-club.sh` exécuté
- [ ] Configuration créée et validée
- [ ] Build réussi
- [ ] Déploiement SSH OK
- [ ] Sync-agent enregistré et actif
- [ ] Site visible sur dashboard central (🟢)
- [ ] Login fonctionne
- [ ] /tv affiche correctement
- [ ] /remote contrôle la TV
- [ ] Interface admin accessible
- [ ] Vidéos copiées et configurées
- [ ] WiFi hotspot fonctionnel
- [ ] Utilisateurs formés

### Mise à jour

- [ ] Backup de l'ancienne config
- [ ] Nouvelle config testée
- [ ] Build réussi
- [ ] Déploiement OK
- [ ] Services redémarrés
- [ ] Test login
- [ ] Test TV
- [ ] Test remote
- [ ] Vérification logs

---

## Support

### Logs à consulter

```bash
# Application
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 100'

# Admin
ssh pi@neopro.local 'sudo journalctl -u neopro-admin -n 100'

# Sync
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 100'

# Nginx
ssh pi@neopro.local 'sudo tail -100 /home/pi/neopro/logs/nginx-error.log'
```

### Problèmes courants

Voir **[docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

---

**Dernière mise à jour :** 10 décembre 2025
