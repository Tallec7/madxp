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
│           SERVEUR CENTRAL (Railway)                  │
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
Raspberry Pi (neopro-<club>.local / 192.168.4.1)
├── WiFi Hotspot: NEOPRO-[CLUB]
├── mDNS: neopro-<club>.local (dérivé du club_name, ex: neopro-usap.local)
│
├── Port 80 (nginx)
│   └── Application Angular (dist/neopro/browser/)
│       ├── /login       - Page de connexion
│       ├── /tv          - Mode TV principal (protégé)
│       ├── /secondary   - Mode écran secondaire (protégé)
│       └── /remote      - Télécommande (protégé)
│
├── Port 3000 (Node.js)
│   └── Serveur Socket.IO
│       └── Communication temps réel TV ↔ Remote
│
├── Port 8080 (Node.js)
│   └── Interface Admin (dual mode: club/technicien)
│       ├── Dashboard système (santé simplifiée ou métriques complètes)
│       ├── Widget Sync Status (état connexion cloud)
│       ├── Gestion configuration
│       ├── Contrôle services (restart app/nginx/kiosk, apply-services/daemon-reload)
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
    "serverUrl": "https://neopro-central-production.up.railway.app",
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

Le système de mises à jour logicielles permet de déployer de nouvelles versions sur les Raspberry Pi depuis le dashboard central.

**Fonctionnement :**

1. **Upload** : Créer une nouvelle version via `POST /api/updates` (package .tar.gz ou .zip)
2. **Déploiement** : Lancer un déploiement via `POST /api/update-deployments` (avec options `schedule_reboot` et `auto_rollback`)
3. **Distribution** : Le serveur envoie la commande `update_software` aux sites connectés
4. **Fallback** : Les sites déconnectés recevront la mise à jour à leur reconnexion
5. **Post-update** : Si `schedule_reboot: true`, le Pi reboot 10s après la fin de la mise à jour

**Endpoints API :**

```
GET    /api/updates                - Liste des versions disponibles
POST   /api/updates                - Créer une version (multipart avec package)
DELETE /api/updates/:id            - Supprimer une version

GET    /api/update-deployments          - Historique des déploiements (inclut update_version, target_name, total_count)
POST   /api/update-deployments          - Lancer un déploiement (body: { update_id, target_type, target_id, schedule_reboot?, auto_rollback? })
POST   /api/update-deployments/:id/retry - Relancer un déploiement échoué
PUT    /api/update-deployments/:id      - Mettre à jour statut
DELETE /api/update-deployments/:id      - Annuler un déploiement
```

**Variables d'environnement (FTP séparé pour les updates) :**

```bash
FTP_UPDATE_HOST=ftp.example.com
FTP_UPDATE_PORT=21
FTP_UPDATE_USER=xxx
FTP_UPDATE_PASSWORD=xxx
FTP_UPDATE_SECURE=false
FTP_UPDATE_PUBLIC_URL=https://cdn.example.com/updates
```

**Commande Socket.IO (Serveur → Pi) :**

```javascript
socket.on('update_software', (data) => {
  // data: { deploymentId, updateId, version, updateUrl, checksum, isCritical,
  //         scheduleReboot, autoRollback, ... }
});
```

**Progression (Pi → Serveur) :**

```javascript
socket.emit('update_progress', {
  deploymentId: 'uuid',
  progress: 50,
  completed: false,
  error: null,
});
// Le handler enrichit l'événement avant de le broadcaster au dashboard :
// → ajoute deployedCount (nombre de sites déployés) et status ('in_progress'|'completed'|'failed')
```

**Pré-migration OTA (serveur → Pi, avant `update_software`) :**

Avant chaque OTA, le serveur envoie une commande `remote_shell` de pré-migration via `applyPreUpdateMigration()` pour corriger les problèmes connus sur le Pi :

1. **Fix ownership** : `sudo chown -R pi:pi` sur VERSION/release.json/version.json (fichiers potentiellement `root:root` à cause d'anciens scripts)
2. **Patch legacy code** : remplace `sudo cp` et `sudo tee` par `cp`/`tee` dans le sync-agent (bloqués par NoNewPrivileges depuis v3.9.4)

**IMPORTANT** : un délai de 5s est inséré entre la pré-migration et l'envoi de `update_software` pour éviter une race condition (les deux commandes s'exécutent en parallèle côté Pi).

**Convention sudoers :** Les commandes `sudo` du sync-agent doivent **exactement** matcher les règles dans `raspberry/config/sudoers.d/neopro`. Exemples :

- `sudo chown -R pi:pi /home/pi/neopro/VERSION` ✅ (matche `/usr/bin/chown -R pi\:pi /home/pi/neopro/*`)
- `sudo chown pi:pi /home/pi/neopro/VERSION` ❌ (pas de `-R` → sudoers refuse silencieusement)

**Monitoring OTA :** La métrique `neopro_ota_errors_total{error_type}` catégorise les erreurs :
| error_type | Déclencheur |
|-------------|-------------|
| `permission` | EACCES, permission denied (fichier root, sudoers mismatch) |
| `timeout` | Déploiement dépassant le timeout (15 min) |
| `network` | Téléchargement du paquet échoue (ECONNREFUSED, ENOTFOUND) |
| `disk_full` | ENOSPC, pas d'espace disque |
| `cancelled` | Annulé manuellement depuis le dashboard |
| `other` | Erreur non catégorisée |

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

Si aucun mot de passe n'est configuré, un setup initial est requis au premier démarrage (voir SEC-002 dans SECURITY_IMPROVEMENTS.md).

---

## Serveur central

### URLs

- **API :** `https://neopro-central-production.up.railway.app`
- **Dashboard :** `https://neopro-admin.kalonpartners.bzh`

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
   - **Détection écran EDID** (v3.44+) : fabricant, modèle, résolution, type (TV/moniteur)
   - **Monitoring ventilateur** (v3.52+) : état, vitesse %, type, alertes si arrêté à haute température

3. **Déploiement**
   - Mise à jour OTA
   - Gestion des configurations
   - Push de contenu

### Statut de connexion des sites

Le serveur central calcule le statut de connexion des sites selon **deux critères** :

1. **Connexion Socket.IO active** : Vérifie si le Pi a une connexion WebSocket établie
2. **Dernier heartbeat** : Vérifie l'heure du dernier signal reçu (`last_seen_at`)

**Logique de calcul du statut (`displayStatus`) :**

```typescript
// Fichier: central-server/src/controllers/sites.controller.ts

const isConnectedNow = socketService.isConnected(siteId); // Vérifie Socket.IO
const secondsSinceLastSeen = (now - last_seen_at) / 1000;

if (isConnectedNow) {
  displayStatus = 'online'; // ✅ Socket.IO actif
} else if (secondsSinceLastSeen === null) {
  displayStatus = 'unknown'; // ⚪ Jamais vu
} else if (secondsSinceLastSeen < 120) {
  displayStatus = 'warning'; // 🟡 Vu il y a < 2min mais déconnecté
} else {
  displayStatus = 'offline'; // 🔴 Déconnecté depuis > 2min
}
```

**Mise à jour automatique du champ `sites.status` :**

- Lors de l'événement `'authenticate'` (Pi se connecte) → `status = 'online'`
- Lors de l'événement `'disconnect'` (Pi se déconnecte) → `status = 'offline'`
- Lors de la détection de connexion zombie (45s sans pong, réduit de 90s en v3.43) → `status = 'offline'`

**Affichage dans le dashboard :**

- **Liste des sites** : Appelle `/api/sites/connection-status` toutes les 30s (vérifie connexions Socket.IO temps réel + santé)
- **Page détail** : Utilise les données du endpoint `/api/sites/:id/dashboard` (polling 30s) qui inclut le statut de connexion + santé

Les deux vues utilisent la même logique basée sur `socketService.getConnectionHealth()` pour garantir une cohérence du statut affiché.

**Statuts de connexion (v2.42+) :**

| Statut                 | Couleur   | Conditions                                                          |
| ---------------------- | --------- | ------------------------------------------------------------------- |
| **Connecté**           | 🟢 Vert   | Socket connecté ET `isHealthy = true` (pong < 60s)                  |
| **Connexion instable** | 🟠 Orange | Socket connecté MAIS `isHealthy = false` (pong stale, zombie, etc.) |
| **Hors ligne**         | ⚪ Gris   | Socket non connecté ET dernier heartbeat > 5 min                    |

**Raisons d'instabilité (`health.reason`) :**

- `pong_stale` : Dernier pong reçu > 60 secondes
- `socket_disconnected` : Socket dans la map mais `socket.connected = false`
- `no_pong_received` : Jamais reçu de pong depuis la connexion
- `not_in_map` : Socket non enregistré dans la map

> **Note (v2.6.1)** : Le composant `connection-indicator` peut recevoir les données via l'input `[externalStatus]` pour éviter le double polling quand le parent gère déjà le rafraîchissement.

**Calcul de l'uptime 24h :**

L'uptime affiché sur la page détail d'un site est calculé à partir du nombre de heartbeats reçus dans les dernières 24 heures :

```typescript
// Backend: central-server/src/controllers/sites.controller.ts
// Frontend: central-dashboard/src/app/features/sites/site-detail.component.ts
const heartbeatCount24h = stats.heartbeat_count; // COUNT(*) FROM metrics WHERE recorded_at > NOW() - 24h
const uptime24h = Math.min(100, (heartbeatCount24h / 2880) * 100);
// 2880 = heartbeats attendus en 24h (1 toutes les 30s)
```

Le endpoint `/api/sites/:id/dashboard` renvoie `heartbeat_24h.count`, et le frontend calcule l'uptime localement.

### Détection écran EDID (v3.77+)

Le Pi détecte automatiquement l'écran connecté via les données **EDID** (Extended Display Identification Data) lues depuis `/sys/class/drm/card*-HDMI-*/edid`, enrichies par `edid-decode` (package apt optionnel).

> **Note sysfs (v3.80.4)** : Les fichiers EDID dans `/sys/class/drm/` sont des fichiers virtuels sysfs qui reportent `stat.size=0` même quand ils contiennent des données. La détection utilise `fs.readFileSync().length > 0` (et non `stat.size`).

**Données collectées (parsing binaire EDID) :**

| Champ              | Description                                    | Exemple                          |
| ------------------ | ---------------------------------------------- | -------------------------------- |
| `manufacturer`     | Code fabricant 3 lettres (EDID bytes 8-9)      | `SAM`, `DEL`, `LGD`              |
| `model`            | Nom du modèle (descriptor tag 0xFC)            | `DELL P2419H`                    |
| `resolution`       | Résolution native (Detailed Timing Descriptor) | `1920x1080`                      |
| `serial`           | Numéro de série (descriptor tag 0xFF)          | `H4ZN500001`                     |
| `display_type`     | Type d'écran détecté                           | `tv`, `monitor`, `unknown`       |
| `detection_method` | Méthode utilisée                               | `edid_raw`, `drm_status`, `none` |

**Données enrichies (`edid_detailed`, via edid-decode) :**

| Champ                  | Description                                           | Exemple                       |
| ---------------------- | ----------------------------------------------------- | ----------------------------- |
| `native_resolution`    | Résolution native (premier DTD edid-decode)           | `3840x2160`                   |
| `max_refresh_rate`     | Refresh rate max détecté (Hz)                         | `120`                         |
| `hdmi_version`         | Version HDMI inférée depuis TMDS clock max            | `2.1`, `2.0`, `1.4`           |
| `hdr_supported`        | HDR détecté (HDR10, HLG, SMPTE ST2084)                | `true`                        |
| `color_spaces`         | Espaces couleur supportés                             | `['BT2020_RGB', 'YCbCr_444']` |
| `standby_supported`    | Support DPMS (veille)                                 | `true`                        |
| `display_product_type` | Type produit EDID                                     | `projector`                   |
| `diagonal_inches`      | Diagonale en pouces (calculée depuis taille physique) | `55`                          |

> Si `edid-decode` n'est pas installé, `edid_detailed` est `null` et le parsing binaire basique continue de fonctionner.

**Heuristique de type d'écran (`display_type`) :**

1. Réponse CEC (devices > 0) → `tv`
2. CEA Extension Block dans EDID → `tv`
3. CEC dispo + 0 devices + écran connecté (EDID ou DRM status) → `monitor`
4. Sinon → `unknown`

**Catégorisation enrichie (`display_category` via `_inferDisplayCategory`) :**

En complément du `display_type` basique, la méthode `_inferDisplayCategory()` croise nom de modèle, taille physique, support audio et type détecté pour produire une catégorie fine :

| Catégorie   | Condition                                                        |
| ----------- | ---------------------------------------------------------------- |
| `projector` | `display_product_type` contient "projector"                      |
| `tv_oled`   | TV + nom de modèle contient "OLED"                               |
| `tv_qled`   | TV + nom de modèle contient "QLED"                               |
| `tv_qned`   | TV + nom de modèle contient "QNED"                               |
| `tv_led`    | TV + nom de modèle contient "LED" ou "NANOCELL"                  |
| `tv_lcd`    | TV + nom de modèle contient "LCD"                                |
| `tv_plasma` | TV + nom de modèle contient "PLASMA" ou "PDP"                    |
| `tv`        | TV détectée (CEC, CEA, audio, diag ≥ 32") sans techno identifiée |
| `monitor`   | Moniteur (diag < 28", pas d'audio, CEC 0 devices)                |
| `unknown`   | Aucun signal exploitable                                         |

Signaux "TV" : `display_type === 'tv'` OU `audio_supported === true` OU `diagonal_inches >= 32`.
Signaux "Monitor" : `display_type === 'monitor'` OU (`diagonal_inches < 28` ET pas d'audio).

> **Détection physique :** La connexion d'un écran est vérifiée via EDID (taille > 0) ou le fichier DRM status (`/sys/class/drm/card*-HDMI-*/status` = `connected`). Le signal CEC `tv_connected` n'est **pas** utilisé car il génère des faux positifs sur Pi 5 (retourne `true` sans écran branché).

**Intégration :**

- `sync-agent/src/metrics.js` → `getDisplayInfo()` inclus dans `getHealthStatus()` sous la clé `displayInfo` (inclut `edid_detailed` + `display_category`)
- `server/services/hdmi.service.js` → `getFullStatus()` croise CEC + EDID + edid-decode
- Route `/api/hdmi-status` retourne CEC + display info + catégorie combinés
- Cache EDID : 5 minutes (l'écran change rarement)
- **Dépendance optionnelle** : `edid-decode` (apt package), parsing graceful si absent

**Impact dashboard :** La section HDMI-CEC s'adapte au type d'écran. Pour un moniteur PC, les métriques CEC sont masquées et un message explicatif est affiché. Quand `edid-decode` est installé sur le Pi, la page debug affiche les infos enrichies : catégorie écran (OLED/QLED/LED/etc.), taille diagonale, résolution native, refresh rate, version HDMI, support HDR, et espaces couleur. Si `edid-decode` est absent, seules les infos basiques (fabricant, modèle, résolution, type) sont affichées.

### Monitoring ventilateur (v3.52+)

Le Pi détecte automatiquement le ventilateur officiel GPIO via **sysfs** (`/sys/class/thermal/cooling_device0/`).

**Données collectées :**

| Champ          | Description                                      | Exemple   |
| -------------- | ------------------------------------------------ | --------- |
| `present`      | Ventilateur détecté (cooling_device0 existe)     | `true`    |
| `type`         | Type sysfs du ventilateur                        | `pwm-fan` |
| `curState`     | État courant (0 = arrêté)                        | `3`       |
| `maxState`     | État maximum (Pi 5 = 4, Pi 4 = 1)                | `4`       |
| `speedPercent` | Pourcentage de vitesse (curState/maxState × 100) | `75`      |
| `is_pi5`       | Modèle Raspberry Pi 5 détecté                    | `true`    |

**Matériel supporté :**

- **Pi 5 Active Cooler** : 5 niveaux (0=off, 1-4=low→full), régulation thermique automatique
- **Pi 4 Fan HAT** : 2 niveaux (0=off, 1=on), via GPIO

**Alertes :**

| Condition                          | Type          | Sévérité                                |
| ---------------------------------- | ------------- | --------------------------------------- |
| Fan présent + arrêté + temp > 70°C | `fan_failure` | `warning` (70-80°C), `critical` (>80°C) |

**Pipeline :**

```
Pi: getFanStatus() → collectAll() → heartbeat { fanStatus }
  → Central: INSERT metrics.fan_status (JSONB) → checkAlerts() → fan_failure → Slack
  → Dashboard: Status tab (carte ventilateur) + Debug tab (section santé)
  → Prometheus: neopro_fan_present, neopro_fan_state, neopro_fan_failures_total
```

**Impact santé :** Le health score perd 15 points si le ventilateur est installé mais arrêté à >70°C.

**Rétrocompatibilité :** Les Pi sans mise à jour envoient `fanStatus: undefined` → stocké NULL → carte masquée dans le dashboard.

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

### Résilience base de données (v3.71+)

Le central server intègre un **circuit breaker DB** pour survivre aux interruptions
transitoires de Supabase/PgBouncer sans intervention manuelle.

**Composants :**

| Mécanisme         | Fichier                                   | Rôle                                                                                                        |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Statement timeout | `config/database.ts`                      | `SET statement_timeout = 8000` sur chaque connexion — tue les requêtes bloquées avant le pool timeout (10s) |
| Circuit breaker   | `services/db-circuit-breaker.service.ts`  | CLOSED → OPEN (après 3 échecs) → HALF_OPEN (après 30s) → CLOSED (si probe OK)                               |
| Background skip   | realtime-stats, scheduler, alerting       | `dbCircuitBreaker.isAvailable()` avant chaque tick — zéro requête DB quand circuit OPEN                     |
| Pi backoff        | `socket.service.ts` → `retry_later` event | Quand circuit OPEN, le serveur dit au Pi d'attendre 30s au lieu de reconnecter toutes les 5s                |

**Variables d'environnement :**

| Variable               | Défaut | Description                                                     |
| ---------------------- | ------ | --------------------------------------------------------------- |
| `DB_POOL_MAX`          | 10     | Nombre max de connexions dans le pool Node.js                   |
| `DB_STATEMENT_TIMEOUT` | 8000   | Timeout par requête en ms (doit être < connectionTimeoutMillis) |

**Monitoring :**

- Health check `/api/health` → `checks.database.details.circuitBreaker` (CLOSED/OPEN/HALF_OPEN)
- Prometheus → `neopro_db_circuit_breaker_state` (0/1/2) — configurer alerting Grafana sur state > 0

---

## Scripts disponibles

### Scripts d'automatisation

| Script                 | Emplacement          | Description                                                                             |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `setup-new-club.sh`    | `raspberry/scripts/` | Configuration complète nouveau club (5-10 min)                                          |
| `build-raspberry.sh`   | `raspberry/scripts/` | Build Angular optimisé pour Pi                                                          |
| `build-and-deploy.sh`  | `raspberry/scripts/` | Build + déploiement combinés                                                            |
| `deploy-remote.sh`     | `raspberry/scripts/` | Déploiement SSH + diagnostic post-deploy auto                                           |
| `copy-to-pi.sh`        | `raspberry/scripts/` | Copie des fichiers d'installation vers Pi                                               |
| `diagnose-pi.sh`       | `raspberry/scripts/` | Diagnostic complet Pi (16 checks, `--json`)                                             |
| `backup-club.sh`       | `raspberry/scripts/` | Sauvegarde configuration club                                                           |
| `restore-club.sh`      | `raspberry/scripts/` | Restauration configuration club                                                         |
| `cleanup-pi.sh`        | `raspberry/scripts/` | Nettoyage ~/raspberry après install                                                     |
| `setup-wifi-client.sh` | `raspberry/scripts/` | Configuration WiFi client (accès internet)                                              |
| `fix-hostname.sh`      | `raspberry/scripts/` | Correction hostname au boot (lit `HOSTNAME_SLUG` depuis `site.conf`, fallback `neopro`) |

> `setup-wifi-client.sh` met à jour `/etc/wpa_supplicant/wpa_supplicant.conf`, crée le lien `wpa_supplicant-wlan1.conf`, active `wpa_supplicant@wlan1.service` et relance `dhcpcd` afin que la connexion WiFi du club survive aux redémarrages.

### Traçabilité des versions

1. `build-raspberry.sh` détecte automatiquement la version à partir du tag Git (ou suffixe `+<SHA>` pour les builds intermédiaires), génère `release.json`, `VERSION` et `webapp/version.json` et les embarque dans l’archive.
2. `setup-remote-club.sh` / `deploy-remote.sh` copient ces fichiers sur le Pi et redémarrent le sync-agent.
3. Le sync-agent lit cette version via `utils/version-info.js` et l’envoie dans chaque heartbeat.
4. Le central-server met à jour `sites.software_version`, ce qui alimente les écrans “Sites” / “Détails” du dashboard central.
5. L’admin local (port 8080) lit aussi `webapp/version.json` pour afficher la version (`Neopro vX.Y.Z | Raspberry Pi Admin Panel`).

> ℹ️ Besoin d’un build plus rapide sur macOS : ajoute `--skip-xattr` ou `SKIP_XATTR_CLEANUP=true` à `build-raspberry.sh` / `build-and-deploy.sh` pour sauter la purge des attributs étendus (gain ~30 s, mais tar peut afficher des warnings sur Linux).

### Scripts Central Server (SQL)

| Script                         | Emplacement                   | Description                                                       |
| ------------------------------ | ----------------------------- | ----------------------------------------------------------------- |
| `full-schema.sql`              | `central-server/src/scripts/` | Schéma complet de la BDD (init nouveau environnement)             |
| `pitch-deck-metrics.sql`       | `central-server/src/scripts/` | Extraction des métriques de traction pour pitch investisseur      |
| `analytics-tables.sql`         | `central-server/src/scripts/` | Création des tables analytics club                                |
| `sponsor-analytics-tables.sql` | `central-server/src/scripts/` | Création des tables analytics sponsors (legacy, voir video_plays) |

**Usage pitch-deck-metrics :**

```bash
source central-server/.env && psql "$DATABASE_URL" -f central-server/src/scripts/pitch-deck-metrics.sql
```

> Ce script génère 15 sections de métriques : croissance flotte, engagement (lectures/screen time), abonnements, impressions publicitaires, déploiements, fiabilité, vélocité produit, rétention par cohorte, et un résumé exécutif.

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
├── server/              # Serveur Socket.IO (Express modulaire)
│   ├── server.js        #   Orchestrateur (~110 lignes)
│   ├── helpers.js       #   Constantes partagées
│   ├── services/        #   6 services (state, buffer, license, hdmi+edid, auth)
│   ├── routes/          #   6 contrôleurs HTTP minces
│   ├── socket/          #   Handlers Socket.IO (18 events)
│   ├── __tests__/       #   Tests Jest (71 tests)
│   └── package.json
│
├── admin/               # Interface admin (Express modulaire, dual mode club/tech)
│   ├── admin-server.js  #   Orchestrateur (wiring services ↔ routes)
│   ├── helpers.js       #   Utilitaires partagés
│   ├── services/        #   7 services métier
│   ├── routes/          #   10 contrôleurs HTTP (dont sync-status)
│   ├── __tests__/       #   Tests Jest (60%+ couverture)
│   └── public/          #   Frontend statique (modules/ → build-admin.sh → app.js)
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
├── central-server/      # Serveur central (API backend)
│   └── src/
│       ├── controllers/     # HTTP route handlers
│       ├── routes/          # Express route definitions
│       ├── middleware/      # Auth, RLS, rate-limit
│       ├── services/        # Business logic
│       ├── handlers/        # 9 Socket.IO event handlers
│       └── repositories/    # 22 repositories (BaseRepository<T>)
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

### neopro-sync-agent

**Agent de synchronisation** (connexion serveur central)

```bash
sudo systemctl status neopro-sync-agent
sudo journalctl -u neopro-sync-agent -f
```

**Fichier :** `/etc/systemd/system/neopro-sync-agent.service`

### Convention : pas de NoNewPrivileges

Les fichiers `.service` Neopro ne doivent **jamais** contenir `NoNewPrivileges=true`. Ce flag kernel bloque irréversiblement `sudo` pour le process et ses enfants, ce qui empêche les commandes d'administration depuis le dashboard et l'OTA.

- **Smoke test** : `npm run test:smoke` vérifie cette convention automatiquement
- **Auto-correction** : l'OTA >= v3.17.1 corrige les `.service` via `POST /api/system/apply-services` sur l'admin-server local
- **Fichiers source** : `raspberry/config/systemd/` (copiés vers `/etc/systemd/system/` lors de l'OTA)

### nginx

**Serveur web** (port 80)

```bash
sudo systemctl status nginx
sudo tail -f /home/pi/neopro/logs/nginx-error.log
```

**Fichier :** `/etc/nginx/sites-enabled/neopro`

**Fix MIME type v3.43 :** Les fichiers statiques (`.js`, `.css`, `.woff2`, images, etc.) retournent désormais **404** si manquants au lieu du fallback SPA `index.html`. Cela corrige l'erreur `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"` qui survenait quand un fichier JS n'existait plus après un déploiement. Configs impactées : `nginx-captive-portal.conf` et `nginx/neopro-hls.conf`.

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

### Socket.IO (Pi & Dashboard ↔ Serveur Central)

**Authentification :**

Le serveur Socket.IO du serveur central supporte **deux types de connexions** :

1. **Raspberry Pi** : Authentification via événement `'authenticate'`

   ```javascript
   socket.on('connect', () => {
     socket.emit('authenticate', {
       siteId: 'uuid-du-site',
       apiKey: 'cle-api-bcrypt',
     });
   });
   ```

2. **Dashboard Admin** : Authentification via JWT dans handshake

   ```typescript
   const socket = io(serverUrl, {
     auth: { token: jwtToken }, // Token JWT de l'utilisateur
     transports: ['polling', 'websocket'],
   });

   socket.on('authenticated', (data) => {
     console.log('Dashboard connecté:', data.userId);
   });
   ```

**Événements (Pi → Serveur) :**

```javascript
// Heartbeat toutes les 30s
socket.emit('heartbeat', {
  cpu: 25.3,
  memory: 512,
  temperature: 45.2,
  disk: 15.8,
  uptime: 86400,
  kioskStatus: {            // optionnel — écrit par kiosk-watchdog.sh
    status: 'running',      // 'running' | 'crashed'
    chromiumAlive: true,
    restartCount: 0,
    lastEvent: '2026-02-13T10:00:00.000Z',
    reason: null,           // ex: 'GPU process exited'
    pid: 1234
  },
  fanStatus: {              // optionnel (v3.52+) — null si cooling_device0 absent
    present: true,          // true si /sys/class/thermal/cooling_device0/ existe
    type: 'pwm-fan',        // type du ventilateur (sysfs type file)
    curState: 3,            // état courant (Pi 5: 0-4, Pi 4: 0-1)
    maxState: 4,            // état maximum
    speedPercent: 75,       // curState/maxState * 100
    is_pi5: true
  }
});

// Progression déploiement vidéo
socket.emit('deploy_progress', {
  deploymentId: 'uuid',
  progress: 75,
  completed: false
});
// Le handler enrichit l'événement avant broadcast au dashboard :
// → ajoute deployedCount et status

// Résultat d'une commande
socket.emit('command_result', {
  commandId: 'uuid',
  status: 'success',
  result: { ... }
});
```

**Événements (Serveur → Pi) :**

```javascript
// Déployer une vidéo
socket.on('deploy_video', (data) => {
  // data: { deploymentId, videoUrl, filename, checksum, ... }
});

// Mettre à jour la configuration
socket.on('update_config', (data) => {
  // data: { neoProContent, mode }
  // neoProContent peut contenir:
  //   - sponsors, categories, timeCategories, categoryMappings
  //   - liveScoreEnabled, scoreOverlay
  //   - remotePassword → stocké dans auth.password (mot de passe /remote)
  //   - clubName → stocké dans auth.clubName
  // mode: 'merge' (défaut) ou 'replace'
});

// Exécuter une commande
socket.on('execute_command', (data) => {
  // data: { commandId, type, data }
});

// Health check ping
socket.on('ping_check', () => {
  socket.emit('pong_check');
});
```

**Événements (Serveur → Dashboard via room 'dashboard') :**

```javascript
// Progression déploiement contenu
socket.on('deploy_progress', (data) => {
  // data: { siteId, deploymentId, progress, deployedCount, status, completed, error, ... }
});

// Progression mise à jour logicielle
socket.on('update_progress', (data) => {
  // data: { siteId, deploymentId, progress, deployedCount, status, completed, error, version }
});

// Commande complétée
socket.on('command_completed', (data) => {
  // data: { siteId, commandId, status }
});

// Statut site changé
socket.on('site_status_changed', (data) => {
  // data: { siteId, status }
});

// Mise à jour config
socket.on('site_config_updated', (data) => {
  // data: { siteId, configHash, timestamp }
});
```

**Rooms Socket.IO :**

- `siteId` : Chaque Pi rejoint une room avec son UUID pour broadcast ciblé
- `'dashboard'` : Tous les dashboards admin rejoignent cette room pour recevoir les événements temps réel

**Détection de connexion zombie (v2.15+, améliorée v3.43) :**

La détection des connexions zombies se fait à **deux niveaux** :

1. **Côté serveur** (`socket.service.ts` + `handlers/health-monitor.handler.ts`) :
   - `pingInterval: 10s`, `pingTimeout: 20s` → détection d'une déconnexion en **30s** (vs 85s avant v3.43)
   - Health check serveur toutes les **15s**, seuil zombie **45s** sans pong
   - Sync DB/WebSocket toutes les 2 minutes : si site "online" en DB mais absent de `connectedSites` Map, passage en "offline"
   - Métrique Prometheus `neopro_websocket_disconnects_total{reason}` (zombie_timeout, zombie_cleanup)

2. **Côté client** (`sync-agent/src/agent.js`, v2.15+, amélioré v3.43) :
   - Vérification `socket.connected` avant chaque `sendHeartbeat()`
   - Si `this.connected = true` mais `socket.connected = false` → zombie détecté → auto-reconnexion
   - Health check périodique (**30s**, réduit de 60s en v3.43), seuil stale **60s** (réduit de 90s)
   - **v3.43** : force **déconnexion + reconnexion propre** quand heartbeats stale (au lieu de juste logger)
   - `randomizationFactor: 0.5` sur la reconnexion — anti-thundering herd pour 50+ Pi
   - Détection dans `handlePingCheck()` : si ping reçu mais socket morte → auto-reconnexion

**Pourquoi les deux ?**

Le serveur peut redémarrer/scaler sans que le Pi reçoive l'événement `disconnect`. Le Pi reste avec `this.connected = true` mais sa socket est morte. Sans détection côté client, les heartbeats sont envoyés dans le vide (Socket.IO `.emit()` ne throw pas sur connexion morte).

**Synchronisation DB/WebSocket :**

Toutes les 2 minutes, le service vérifie et synchronise les statuts entre la base de données et les connexions WebSocket réelles. Si un site est marqué "online" en DB mais n'est plus connecté via WebSocket, il est automatiquement passé en "offline".

### RecordingStateService (Angular — Raspberry Pi)

Service Angular (`raspberry/src/app/services/recording-state.service.ts`) contrôlant l'activation du tracking analytics. Tous les appels `trackVideoStart()`/`trackVideoEnd()` dans `AnalyticsService` sont gardés par `isRecording`. Depuis v3.66, le pipeline est unifié : `AnalyticsService` gère à la fois les vidéos club et sponsor (l'ancien `SponsorAnalyticsService` a été supprimé).

**Cycle de vie du recording :**

| Événement                                 | Comportement                                          |
| ----------------------------------------- | ----------------------------------------------------- |
| Boot                                      | OFF — aucune donnée enregistrée                       |
| Phase neutral → before/during/after       | Auto-ON (recording automatique)                       |
| Phase active → neutral                    | Auto-OFF immédiat (sauf override manuel)              |
| Vidéo manuelle en neutral (recording OFF) | Auto-ON temporaire (durée de la vidéo)                |
| 15 min d'inactivité (phases actives)      | Warning popup 3 min → auto-OFF + retour en neutral    |
| Override manuel (bouton REC)              | Toggle ON/OFF (pas affecté par le timer d'inactivité) |

**API publique :**

```typescript
// Observables
isRecording$: Observable<boolean>; // État du recording
warning$: Observable<RecordingWarningState>; // Warning inactivité
inactivityExpired$: Observable<void>; // Timer expiré → retour neutral

// Accès synchrone
isRecording: boolean; // Getter pour les guards analytics

// Méthodes
onPhaseChange(phase); // Auto-start/stop selon la phase
startRecording(manual); // Forcer le démarrage
stopRecording(manual); // Forcer l'arrêt
toggleRecording(); // Toggle manuel
resetInactivityTimer(); // Reset sur interaction significative
extendRecording(); // Bouton "Continuer" dans la popup warning
```

**Synchronisation multi-onglet/instance :**

- `BroadcastChannel` (LocalBroadcastService) : entre onglets du même navigateur
- `Socket.IO` (SocketService) : entre instances (ex: kiosk ↔ navigateur)

> Voir [ADR-021](../adr/ADR-021-recording-inactivity-timer.md) pour l'historique des décisions.

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

**Interprétation du buffer dans le diagnostic guidé (step 4) :**

| État buffer                   | Status diagnostic | Signification                               |
| ----------------------------- | ----------------- | ------------------------------------------- |
| `event_count > 0` et `≤ 1000` | ✅ ok             | Événements en attente de sync (normal)      |
| `event_count > 1000`          | ⚠️ warning        | File d'attente importante, vérifier la sync |
| `event_count == 0`            | ✅ ok             | Buffer vide — sync fonctionne normalement   |

> **Note :** Un buffer vide est l'état attendu quand la synchronisation fonctionne correctement. Le score santé système (hardware) et le diagnostic guidé (applicatif) doivent rester cohérents : un buffer vide ne doit pas déclencher de warning car il ne reflète pas un problème matériel.

### API Serveur Central

**Base URL :** `https://neopro-central-production.up.railway.app/api`

**Endpoints Authentification :**

```
POST   /auth/login              - Authentification (email, password)
POST   /auth/logout             - Déconnexion
GET    /auth/me                 - Utilisateur courant
POST   /auth/forgot-password    - Demande reset mot de passe
POST   /auth/reset-password     - Reset mot de passe
```

**Endpoints Sites :**

```
GET    /sites                   - Liste paginée, filtres: status, sport, region
GET    /sites/:id               - Détails + config + metrics
GET    /sites/:id/dashboard     - Endpoint agrégé (connection + metrics)
GET    /sites/:id/local-content - Vidéos locales + stockage
GET    /sites/:id/connection-status - Statut connexion temps réel
GET    /sites/:id/metrics       - Métriques système (CPU, RAM, temp)
POST   /sites                   - Créer site (génère api_key)
PUT    /sites/:id               - Modifier
DELETE /sites/:id               - Supprimer (admin)
POST   /sites/:id/api-key/regenerate - Régénérer la clé API
POST   /sites/:id/command       - Envoyer commande au Pi
GET    /sites/:id/remote-pin    - Statut PIN télécommande cloud
POST   /sites/:id/remote-pin    - Définir PIN télécommande cloud
DELETE /sites/:id/remote-pin    - Supprimer PIN télécommande cloud
```

**Endpoints Contenu :**

```
GET    /content/videos                  - Liste vidéos (paginé: ?page=1&limit=20&search=&category=, max 500)
GET    /content/videos/names            - Liste légère id+titre+file_size pour dropdowns (pas de pagination)
GET    /content/videos/:id              - Détails d'une vidéo
GET    /content/videos/:id/deployments  - Historique des déploiements d'une vidéo
GET    /content/videos/for-site/:siteId - Vidéos prioritaires pour un site (paginé)
POST   /content/videos                  - Upload vidéo (multipart/form-data)
POST   /content/videos/bulk             - Upload multiple (max 20 fichiers)
PUT    /content/videos/:id              - Modifier métadonnées vidéo
DELETE /content/videos/:id              - Supprimer vidéo
POST   /content/image-to-video          - Convertir image en vidéo MP4
GET    /content/deployments             - Liste des déploiements
GET    /content/deployments/:id         - Détails d'un déploiement
POST   /content/deployments             - Créer un déploiement vers site/groupe
PUT    /content/deployments/:id         - Mettre à jour un déploiement
DELETE /content/deployments/:id         - Supprimer un déploiement
```

**Endpoints Config Profiles (multi-config) :**

```
GET    /sites/:siteId/profiles              - Liste des profils du site
GET    /sites/:siteId/profiles/:profileId   - Détails d'un profil
POST   /sites/:siteId/profiles              - Créer un profil
PUT    /sites/:siteId/profiles/:profileId   - Modifier un profil
DELETE /sites/:siteId/profiles/:profileId   - Supprimer (interdit si dernier)
POST   /sites/:siteId/profiles/:profileId/deploy - Déployer un profil vers le Pi
POST   /sites/:siteId/profiles/sync         - Sync tous les profils vers le Pi
```

**Endpoints Alertes :**

```
GET    /alerts                  - Liste paginée, filtres: type, active, severity, siteId
GET    /alerts/stats            - Statistiques des alertes (admin+)
POST   /alerts/test-slack       - Test webhook Slack (super_admin)
POST   /alerts/:id/resolve      - Résoudre une alerte
POST   /alerts/sites/:siteId/resolve - Résoudre toutes les alertes d'un site
```

**Endpoints Analytics :**

```
GET    /analytics/overview      - Stats globales
GET    /analytics/sites/:id     - Stats par site
GET    /analytics/daily-stats   - Agrégation journalière
GET    /analytics/traction      - Métriques de traction business (admin)
GET    /analytics/comparison    - Comparaison multi-sites (admin/operator)
GET    /analytics/realtime      - Stats temps réel dashboard live (admin/operator)
GET    /advertiser-analytics/*  - Stats annonceurs
```

**Endpoints Site Sponsors (auth JWT, montés sur /api/sites) :**

```
GET    /sites/:siteId/sponsors                           - Liste sponsors d'un site (admin, operator)
GET    /sites/:siteId/sponsors/:sponsorId                - Détail d'un sponsor (admin, operator)
POST   /sites/:siteId/sponsors                           - Créer un sponsor local (admin, operator)
PUT    /sites/:siteId/sponsors/:sponsorId                - Modifier un sponsor (admin, operator)
DELETE /sites/:siteId/sponsors/:sponsorId                - Supprimer un sponsor (admin)
GET    /sites/:siteId/sponsors/benchmark                  - Benchmark sponsors du site (admin, operator) [P6.2]
GET    /sites/:siteId/sponsors/:sponsorId/stats          - Stats sponsor sur période + CPI (admin, operator) [P6.3: +cpi, +contract_amount]
POST   /sites/:siteId/sponsors/:sponsorId/videos         - Associer une vidéo à un sponsor (admin, operator)
DELETE /sites/:siteId/sponsors/:sponsorId/videos/:fname  - Retirer une vidéo (admin, operator)
POST   /sites/:siteId/sponsors/:sponsorId/access-link    - Générer magic link d'accès (admin, operator)
```

> **Magic Link URL (v3.59+) :** L'URL du lien d'accès sponsor utilise `FRONTEND_URL` > `CENTRAL_DASHBOARD_URL` > `https://admin-neopro.kalonpartners.bzh` (fallback prod).

**Endpoints Network Sponsors (auth JWT, montés sur /api/network) — P6.1 :**

```
GET    /network/advertisers/:advertiserId/stats   - Stats réseau cross-club d'un annonceur (admin, operator, advertiser)
```

> Agrège impressions, temps d'écran, reach, sites actifs, CPI, tendances quotidiennes, répartition par event_type et performance par club. Requêtes cross-club via `site_sponsors.advertiser_id`.

**Endpoints Sponsor Alerts / Health Matrix (auth JWT, montés sur /api/sponsor-alerts) — F-AUD-07 :**

```
GET    /sponsor-alerts/health                 - Matrice santé complète annonceurs × sites (operator+)
GET    /sponsor-alerts/health/:advertiserId   - Matrice santé filtrée pour un annonceur (operator+)
GET    /sponsor-alerts/config                 - Configuration seuils d'alerte actuels (admin+)
POST   /sponsor-alerts/check                  - Vérification manuelle des alertes (admin+)
```

> Calcule la santé de chaque paire annonceur-site (impressions 7j/30j, moyenne quotidienne, jours depuis dernière impression). Seuils configurables : `warningThresholdDaily` (défaut: 5), `criticalThresholdDays` (défaut: 3). Le check crée des alertes dans la table `alerts` pour les statuts critiques + notification Slack.

**Endpoints Fleet Benchmark (auth JWT, montés sur /api/benchmark) :**

```
GET    /benchmark/sites/:siteId   - Benchmark anonymisé d'un site vs ses pairs (operator+)
GET    /benchmark/global          - Résumé global par sport et région (admin)
GET    /benchmark/compare         - Comparaison de 2-10 sites côte à côte (admin)
```

> Compare un club à ses pairs sur 5 métriques : sessions/mois, vidéos/session, durée moyenne, uptime, vidéos totales.
> Segmentation par sport (`@>` JSONB), région (`location->>'region'`), taille de club.
> Résultats cachés 60s (`memoryCache`). Minimum 3 pairs pour un benchmark significatif.
> **Optimisation v3.72** : requêtes avec `LEFT JOIN` pré-agrégés (pas de sous-requêtes corrélées) — respect du `statement_timeout` 8s.

**Endpoints Reports (auth JWT, admin/super_admin, montés sur /api/reports) :**

```
POST   /reports/generate                        - Génération on-demand (body: {type, entityId, periodStart, periodEnd}) ⚠️ camelCase obligatoire
GET    /reports/clubs/:siteId                    - Rapports d'un club
GET    /reports/advertisers/:advertiserId         - Rapports d'un annonceur
GET    /reports/site-sponsors/:siteSponsorId      - Rapports d'un sponsor local
GET    /reports/stats                            - Statistiques des rapports (admin)
```

> **⚠️ Convention payload** : `POST /reports/generate` attend des clés **camelCase** (`entityId`, `periodStart`, `periodEnd`). Les clés snake_case (`entity_id`, `period_start`) sont rejetées 400.

**Endpoints Sponsor Portal (public, token-based, montés sur /api/sponsor-portal) :**

```
GET    /sponsor-portal/verify   - Vérifie un magic link token → { valid, sponsor }
GET    /sponsor-portal/stats    - Stats sponsor via token (période configurable)
GET    /sponsor-portal/report   - Téléchargement rapport PDF via token (page 2 conditionnelle match-by-match si matchs) [P6.4]
```

**Authentification :** JWT HttpOnly cookie + Bearer token

**Rate Limiting :**

```
Auth:            60 req/min (prod), 100 req/min (dev)  (anti-bruteforce)
API:            100 req/min     (standard — compteur partagé entre toutes les routes utilisant apiRateLimit)
Monitoring:     300 req/min     (status, metrics polling)
Logging:        200 req/min     (frontend logs - silently dropped if exceeded)
Sensitive:       30 req/min     (commands, deployments)
Remote Cloud:    60 req/min     (télécommande cloud - PUBLIC, par IP)
Upload:          10 req/hour    (video uploads)
Admin:          400 req/min     (dashboard ops — sponsors, admin panel, multiple components loading)
Pi Analytics:   500 req/min     (impressions sponsors depuis les Pi - par IP)
Sponsor Portal: 100 req/min    (PUBLIC, par IP)
```

**Note** : Chaque appel à `rateLimit()` crée un **compteur séparé**. Les routes utilisant `apiRateLimit` partagent un même compteur de 100 req/min. Les routes sponsors (`siteSponsorRoutes`) utilisent `adminRateLimit` (compteur séparé à 400 req/min) car le dashboard charge liste + stats + benchmark + rapports en parallèle.

**Note** : Les rate limits sont basés sur le `user_id` (et non sur l'IP) en production, sauf Remote Cloud, Pi Analytics et Sponsor Portal qui sont par IP (endpoints publics). En test (supertest), tous les requêtes partagent la même IP, donc le rate limiter peut se déclencher avant le middleware d'auth — les smoke tests RBAC acceptent 403 ou 429.

### Services Backend Critiques

| Service           | Fichier                     | Rôle                                                                                                                                                                                                                 |
| ----------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Socket**        | `socket.service.ts`         | Orchestrateur temps réel Pi ↔ Cloud (676 lignes)                                                                                                                                                                     |
| **Storage**       | `storage.service.ts`        | Upload/download vidéos FTP (unifié)                                                                                                                                                                                  |
| **Deployment**    | `deployment.service.ts`     | Orchestration déploiement vidéos                                                                                                                                                                                     |
| **CommandQueue**  | `command-queue.service.ts`  | File d'attente commandes (offline/online)                                                                                                                                                                            |
| **MemoryManager** | `memory-manager.service.ts` | Monitoring heap, cleanup automatique                                                                                                                                                                                 |
| **AdminOps**      | `admin-ops.service.ts`      | Opérations admin avec cleanup jobs mémoire                                                                                                                                                                           |
| **CronScheduler** | `cron-scheduler.service.ts` | Tâches récurrentes (stats, cleanup)                                                                                                                                                                                  |
| **Alerting**      | `alerting.service.ts`       | Alertes multi-canal (email, slack, webhook) — 19 seuils par défaut + `checkHourlyMetrics()` agrège WS disconnects, video safety timeouts, kiosk crashes et alimente `evaluateMetric()` toutes les 5 min              |
| **AlertService**  | `alert.service.ts`          | Notifications Slack (Block Kit) — méthodes pré-construites : `siteOffline`, `siteOnline`, `lowWifiSignal` (6h cooldown), `wifiSignalRecovered`, `networkFailure`, `enterShutdownMode`, `info/warning/error/critical` |
| **Health**        | `health.service.ts`         | Endpoints /health, /live, /ready                                                                                                                                                                                     |
| **Metrics**       | `metrics.service.ts`        | Export Prometheus — 32 métriques `neopro_*` (HTTP, WS, DB size/table, disconnect, kiosk, license push, deploy progress, OTA errors, WiFi config, video transitions)                                                  |

### Politique de rétention des données

Les données volumineuses sont nettoyées automatiquement par le `CronScheduler` :

| Table                           | Rétention        | Heure cleanup   | Notes                                                                       |
| ------------------------------- | ---------------- | --------------- | --------------------------------------------------------------------------- |
| `video_plays`                   | **30 jours**     | 3h15            | Agrégées dans `club_daily_stats` / `advertiser_daily_stats` avant nettoyage |
| `metrics`                       | 7 jours          | 3h45            | Diagnostics système court terme                                             |
| `remote_commands`               | 30 jours         | 4h00            | Historique debug                                                            |
| `alerts`                        | 90 jours         | 4h15            | Analyse patterns incidents                                                  |
| `config_history`                | 20 versions/site | 4h30            | Rollback configurations                                                     |
| `audit_logs`                    | 90 jours         | (logs schedule) | Conformité/audit                                                            |
| `recurring_schedule_executions` | 90 jours         | (logs schedule) | Historique exécution crons                                                  |

> **Monitoring :** `neopro_db_size_bytes` et `neopro_db_table_size_bytes{table}` sont collectés toutes les 5 min. Alertes Prometheus : `DbSizeWarning` (>400 MB), `DbSizeCritical` (>475 MB), `DbTableSizeHigh` (>200 MB/table). Supabase free tier = 500 MB.

### Socket Handlers (`src/handlers/`)

Le service Socket.IO délègue le traitement des événements à 9 handlers spécialisés :

| Handler               | Fichier                         | Événements                                               |
| --------------------- | ------------------------------- | -------------------------------------------------------- |
| **Heartbeat**         | `heartbeat.handler.ts`          | `heartbeat`, `pong_check`                                |
| **ConfigSync**        | `config-sync.handler.ts`        | `sync_local_state`                                       |
| **DeployProgress**    | `deploy-progress.handler.ts`    | `deploy_progress`, `update_progress`                     |
| **CommandDispatch**   | `command-dispatch.handler.ts`   | `command_result`                                         |
| **HealthMonitor**     | `health-monitor.handler.ts`     | Zombie detection, DB sync, disconnect metrics            |
| **License**           | `license.handler.ts`            | `license_status`                                         |
| **NetworkResilience** | `network-resilience.handler.ts` | `network_alert`, `network_rollback`, `network_recovered` |
| **ScoreUpdate**       | `score-update.handler.ts`       | `score_update`                                           |
| **MatchConfig**       | `match-config.handler.ts`       | `match_config`                                           |

### Repositories (`src/repositories/`)

Tous les accès PostgreSQL passent par des repositories typés héritant de `BaseRepository<T>` :

| Repository          | Table(s) principale(s)                                       |
| ------------------- | ------------------------------------------------------------ |
| `site`              | `sites`                                                      |
| `user`              | `users`                                                      |
| `video`             | `videos`                                                     |
| `group`             | `groups`, `group_sites`                                      |
| `deployment`        | `content_deployments`, `deployment_targets`                  |
| `software-update`   | `software_updates`, `update_deployments`                     |
| `alert`             | `alerts`, `alert_thresholds`                                 |
| `analytics`         | `video_plays`, `club_sessions`, `club_daily_stats`           |
| `sponsor`           | `video_plays` (category='sponsor'), `advertiser_daily_stats` |
| `config-history`    | `config_drafts`, `config_history`                            |
| `config-profile`    | `config_profiles`                                            |
| `advertising`       | `advertiser_videos`, `advertiser_sites`                      |
| `advertiser-portal` | `advertisers` (portail annonceurs)                           |
| `agency`            | `agencies`, `agency_sites`                                   |
| `subscription`      | `subscription_history`                                       |
| `metrics`           | `site_metrics`                                               |
| `objective`         | `objectives`                                                 |
| `playlist-schedule` | `playlist_schedules`                                         |
| `remote-command`    | `remote_commands`, `pending_commands`                        |
| `report`            | `reports`, `generated_reports`                               |
| `timeline`          | `timeline_events`                                            |
| `email`             | Notifications email (templates)                              |
| `pitch-deck`        | Vue agrégée multi-tables (métriques traction)                |
| `site-sponsor`      | `site_sponsors`, `site_sponsor_videos`                       |
| `benchmark`         | `sites`, `club_sessions`, `video_plays`, `metrics` (lecture) |

### Gestion Mémoire (Railway Hobby Plan)

Configuration optimisée pour ~256MB heap limit :

```javascript
// Limites pour éviter les fuites mémoire
MAX_PENDING_COMMANDS = 100; // Commandes en attente max
MAX_PONG_ENTRIES = 50; // Entrées pong max
MAX_JOBS_IN_MEMORY = 100; // Jobs admin ops max
JOB_MAX_AGE_MS = 3600000; // 1 heure avant cleanup

// Seuils Memory Manager (% heap)
HEAP_WARNING_THRESHOLD = 88; // Log warning
HEAP_CRITICAL_THRESHOLD = 93; // Trigger cleanup callbacks
HEAP_EMERGENCY_THRESHOLD = 97; // Emergency cleanup + GC
```

**Optimisations mémoire (v3.7.4+)** :

- Swagger chargé uniquement en dev (`NODE_ENV !== 'production'`)
- Winston file transports supprimés en prod (Railway n'a pas de filesystem persistant)
- Realtime-stats interval réduit de 10s à 30s
- Pas de rate limiter global (les rate limiters par route suffisent)

**Endpoints Health :**

```
GET /health    - Santé complète (DB, memory, uptime)
GET /live      - Liveness probe (process vivant)
GET /ready     - Readiness probe (prêt pour le trafic)
```

### Dashboard Central — Composants Site Detail

Le site-detail est organisé en **6 onglets** avec des composants Angular standalone :

| Onglet         | Composant                  | Fonctionnalités                                                                                                                                                                                                                                                  |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **État**       | `site-detail.component.ts` | Métriques, connexion temps réel, alertes, ventilateur                                                                                                                                                                                                            |
| **Contenu**    | `SiteContentTabComponent`  | Boucles par phase, catégories, mapping analytics                                                                                                                                                                                                                 |
| **Sponsors**   | `SiteSponsorsTabComponent` | CRUD sponsors locaux, KPIs, Chart.js trends, association vidéos (add/remove), magic link d'accès, benchmark                                                                                                                                                      |
| **Paramètres** | `SiteSettingsTabComponent` | Config réseau, hotspot, branding club (logo, couleurs)                                                                                                                                                                                                           |
| **Profils**    | `SiteProfilesTabComponent` | Multi-config CRUD, déploiement, synchronisation                                                                                                                                                                                                                  |
| **Debug**      | `SiteDebugTabComponent`    | 12 sections : diagnostic guidé, santé système, config & historique, fichiers, commandes, logs, réseau, buffer analytics, hotspot, export bundle, clients WiFi, timeline. Sous-composants : `DebugSummaryBarComponent` (barre résumé), `pollCommand<T>()` utility |

#### SiteProfilesTabComponent (multi-config)

Composant standalone pour gérer les profils de configuration d'un site :

- **Grille de cards** : chaque profil affiché avec nom, ville, sport, badge « défaut »
- **Modal CRUD** : création/édition avec choix de source (config actuelle, copie d'un profil, vide)
- **Déploiement unitaire** : bouton deploy par profil → `POST /sites/:id/profiles/:id/deploy`
- **Sync global** : synchronise tous les profils vers le Pi → `POST /sites/:id/profiles/sync`
- **Suppression** : avec confirmation, impossible si dernier profil

**Méthodes SitesService :**

| Méthode                                     | Endpoint API                                     |
| ------------------------------------------- | ------------------------------------------------ |
| `getProfiles(siteId)`                       | `GET /sites/:siteId/profiles`                    |
| `getProfile(siteId, profileId)`             | `GET /sites/:siteId/profiles/:profileId`         |
| `createProfile(siteId, payload)`            | `POST /sites/:siteId/profiles`                   |
| `updateProfile(siteId, profileId, payload)` | `PUT /sites/:siteId/profiles/:profileId`         |
| `deleteProfile(siteId, profileId)`          | `DELETE /sites/:siteId/profiles/:profileId`      |
| `deployProfile(siteId, profileId)`          | `POST /sites/:siteId/profiles/:profileId/deploy` |
| `syncProfiles(siteId)`                      | `POST /sites/:siteId/profiles/sync`              |

### Dashboard Central — Analytics (navigation par onglets)

Le module Analytics est organisé en **4 onglets** accessibles via une navigation partagée (`AnalyticsNavComponent`) :

| Onglet         | Route                   | Composant                      | Accès           |
| -------------- | ----------------------- | ------------------------------ | --------------- |
| **Fleet**      | `/analytics`            | `AnalyticsComponent`           | admin, operator |
| **Traction**   | `/analytics/traction`   | `AnalyticsTractionComponent`   | admin           |
| **Comparison** | `/analytics/comparison` | `AnalyticsComparisonComponent` | admin, operator |
| **Realtime**   | `/analytics/realtime`   | `RealtimeDashboardComponent`   | admin, operator |

**AnalyticsNavComponent** : Barre de navigation partagée injectée dans les 4 pages analytics. Affiche les onglets avec icônes, masque les tabs admin-only pour les operators. Responsive : labels masqués sur mobile, seules les icônes sont affichées.

**AnalyticsTractionComponent** : Page dédiée aux métriques de traction business (investisseur), avec 11 sections :

1. Résumé exécutif (8 KPI cards)
2. Croissance flotte (tableau mensuel)
3. Engagement mensuel (lectures, sites actifs, screen time)
4. Abonnements (statut + historique)
5. Annonceurs & Impressions
6. Déploiements (taux succès)
7. Fiabilité (uptime, alertes)
8. Vélocité produit (releases, adoption)
9. Rétention par cohorte
10. Répartition sports
11. Content mix

**API Backend** : `GET /api/analytics/traction` — Agrège 19 requêtes SQL via `pitchDeckRepository` (Promise.all). Données : fleet growth, engagement, subscriptions, advertiser impressions, deployments, reliability, product velocity, retention cohorts, sport distribution, content mix.

**Page Fleet enrichie** : L'onglet Fleet (`/analytics`) affiche désormais 6 KPI cards traction en haut (boîtiers déployés, lectures totales, screen time, impressions, annonceurs actifs, rétention) avec un lien vers la page Traction détaillée. Visible uniquement pour les admins.

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
# Diagnostic complet (interactif, couleurs)
ssh pi@neopro.local '/home/pi/neopro/scripts/diagnose-pi.sh'

# Diagnostic JSON (exploitable par dashboard / OTA)
ssh pi@neopro.local '/home/pi/neopro/scripts/diagnose-pi.sh --json'

# Vérifier tous les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status neopro-sync-agent
sudo systemctl status nginx

# Logs en temps réel
sudo journalctl -f
```

> `diagnose-pi.sh` vérifie 16 catégories : Node.js version, packages apt, services systemd (état + installation), ports, fichiers critiques, node_modules, webapp, Nginx (syntaxe + routes), WiFi (AP + SSID + IP), permissions, GPU, espace disque, version, HTTP. En mode `--json`, le exit code = nombre d'erreurs (0 = Pi sain). `deploy-remote.sh` et l'OTA l'exécutent automatiquement après chaque déploiement.

### Kiosk Watchdog (neopro-kiosk.service)

Le service `neopro-kiosk` lance `kiosk-watchdog.sh` — un superviseur qui gère le cycle de vie de Chromium en mode kiosk :

| Fonctionnalité         | Description                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Arrêt gracieux GPU** | SIGTERM (5s) → SIGKILL dernier recours. Critique sur Pi 5 : le driver V3D Mesa doit libérer les DMA buffers sinon artifacts GPU au restart |
| **KillMode=mixed**     | systemd envoie SIGTERM au watchdog seul (pas à Chromium), le trap handler fait le cleanup propre                                           |
| **TimeoutStopSec=15**  | Fenêtre de 15s pour l'arrêt gracieux avant SIGKILL automatique                                                                             |
| **Nginx readiness**    | Curl HTTP 200 sur `neopro.local/index.html` (15s timeout) avant de lancer Chromium                                                         |
| **Crash detection**    | Détecte "Aw, Snap!", "Page Unresponsive", `ERR_*` via `xdotool` et relance automatiquement                                                 |
| **GPU cleanup**        | Suppression `/dev/shm/.org.chromium.*` (segments mémoire partagée orphelins)                                                               |
| **kiosk-status.json**  | Écrit dans `/home/pi/neopro/data/` — lu par le heartbeat et remonté au central                                                             |

> ⚠️ **Ne jamais ajouter `ExecStop=pkill -9` dans le `.service`** — cela bypasse le trap handler et corrompt l'état GPU V3D sur Pi 5. Smoke test enforced.

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

**Dernière mise à jour :** 21 février 2026
