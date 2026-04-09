# Neopro Web Admin Interface

Interface d'administration web pour gérer un système Neopro sur Raspberry Pi.

## Accès

**URL :** `http://neopro.local:8080`

Accessible depuis n'importe quel appareil connecté au WiFi `NEOPRO-[CLUB]`.

## Modes d'utilisation

L'interface propose deux modes adaptés à chaque profil utilisateur :

### 🏠 Mode club (par défaut)

Mode simplifié pour le staff sportif bénévole. Affiche uniquement :

- **Dashboard** : carte santé globale (vert/jaune/rouge) + widget sync cloud
- **Vidéos** : bibliothèque, upload, catégories, blocs temps
- **Réseau** : connexion WiFi actuelle uniquement

Les onglets Logs et Système sont masqués. Les métriques techniques (CPU, RAM, température détaillées) sont cachées.

### 🔧 Mode technicien

Mode complet pour les techniciens Neopro. Affiche toutes les fonctionnalités : métriques détaillées, scanner WiFi, hotspot, logs, services systemd, etc.

Le mode est persisté dans le navigateur (localStorage). Toggle accessible dans le header.

## Fonctionnalités

### 📊 Dashboard

- **Mode club** : carte santé système (🟢 vert / ⚠️ jaune / 🔴 rouge) basée sur les seuils CPU, RAM, température, stockage + uptime, avec compteurs vidéos/sponsors
- **Mode technicien** : monitoring système complet en temps réel (CPU, Mémoire, Température, Stockage, Services, Uptime)
- **Widget Sync Status** (les deux modes) : état de connexion cloud, dernière synchronisation, commandes en attente, erreurs dead-letter. Historique récent expandable en mode tech
- **Indicateur Socket.IO temps réel** : connexion au serveur Pi (:3000), rafraîchissement automatique du dashboard/vidéos/sponsors sur événements (`config_updated`, `license_update`)
- Rafraîchissement automatique toutes les 5s

### 🎬 Vidéos

Interface organisée en 4 sous-onglets :

#### 📁 Bibliothèque

- **Affichage de toutes les vidéos** par catégories et sous-catégories
- **Miniatures vidéos** : aperçu visuel de chaque vidéo (générées automatiquement)
- **Régénération des miniatures** : bouton pour régénérer les miniatures manquantes ou toutes
- **Métadonnées** : durée affichée pour chaque vidéo
- **Recherche/filtre en temps réel** : filtrer les vidéos par nom ou chemin
- **Prévisualisation vidéo** : cliquez sur la miniature ou l'icône œil pour lire la vidéo
- **Modifier une vidéo** : changer le nom, la catégorie ou la sous-catégorie
- **Supprimer une vidéo** : suppression du fichier et de la configuration
- **Drag & Drop** : réorganiser les vidéos par glisser-déposer (même catégorie ou vers une autre)
- **Sélection multiple** : cocher plusieurs vidéos pour actions groupées (déplacer, supprimer)
- **Vidéos orphelines** : détection et intégration des vidéos non référencées
- **Catégorisation groupée** : sélectionner plusieurs vidéos orphelines et les ajouter à une catégorie en une seule action

#### 📤 Ajouter

- **Upload multiple de vidéos** (jusqu'à 20 fichiers à la fois)
- **Drag & Drop** : glisser-déposer des fichiers directement dans la zone d'upload
- **Progression en temps réel** : affichage du pourcentage, taille envoyée/totale
  ```
  Upload en cours... 67% (45.2 MB / 67.5 MB)
  ```
- **Prévisualisation avant upload** : miniature et durée de chaque vidéo sélectionnée
- **Preview vidéo** : cliquez sur 👁️ pour visualiser la vidéo avant de l'uploader
- Formats supportés : MP4, MKV, MOV - Limite : 500MB par fichier
- Sélection de catégorie et sous-catégorie
- Affichage des résultats d'upload avec succès/erreurs détaillés

#### 📂 Organiser

- **Gestion des catégories** : création, modification et suppression
- **Gestion des sous-catégories** : ajout et suppression

#### ⏱️ Télécommande

- **Configuration des blocs temps** : Avant-match, Match, Après-match
- **Association des catégories** à chaque bloc temps

Chaque modification met automatiquement à jour `configuration.json`.

### 📡 Réseau

- Configuration WiFi client pour SSH distant
- Affichage des interfaces réseau
- Informations IP et MAC

### 📜 Logs

- Logs application (neopro-app)
- Logs Nginx
- Logs système
- Actualisation en temps réel
- **Colorisation** : erreurs en rouge, warnings en ambre, debug atténué
- **Filtre texte** : recherche avec surlignage des occurrences
- **Nombre de lignes configurable** : ajustable via sélecteur

### ⚙️ Système

- Redémarrage de services
- Mise à jour OTA (Over-The-Air)
- Redémarrage/Arrêt système
- Backups automatiques

## Installation

### Automatique (via install.sh)

```bash
sudo ./raspberry/install.sh CLUB_NAME PASSWORD
```

### Manuelle

```bash
# Installation
cd /home/pi/neopro/admin
npm install --production

# Lancement
node admin-server.js

# Ou via systemd
sudo systemctl start neopro-admin
```

## API REST

### Endpoints disponibles

#### Système

- `GET /api/system` - Infos système
- `GET /api/sync-status` - État de synchronisation cloud (connexion, dernière sync, queue offline, dead letters)
- `GET /api/config` - Configuration club
- `GET /api/network` - Infos réseau
- `POST /api/system/reboot` - Redémarrer
- `POST /api/system/shutdown` - Éteindre

#### Vidéos

- `GET /api/videos` - Liste toutes les vidéos (disque)
- `GET /api/videos/orphans` - Liste les vidéos non référencées dans la config
- `POST /api/videos/upload` - Upload simple (multipart, 1 fichier)
- `POST /api/videos/upload-multiple` - Upload multiple (multipart, jusqu'à 20 fichiers)
  ```json
  // Response
  { "success": true, "message": "5/5 vidéo(s) uploadée(s) avec succès", "files": [...], "errors": [] }
  ```
- `POST /api/videos/add-to-config` - Ajoute une vidéo orpheline à la configuration
  ```json
  { "videoPath": "MATCH_SF/BUT/video.mp4", "categoryId": "Match_SF", "subcategoryId": "But" }
  ```
- `POST /api/videos/add-to-config-bulk` - Ajoute plusieurs vidéos orphelines à une catégorie
  ```json
  {
    "videos": [{ "path": "video1.mp4" }, { "path": "video2.mp4" }],
    "categoryId": "Match_SF",
    "subcategoryId": "But"
  }
  ```
- `DELETE /api/videos/:category/:filename` - Supprimer une vidéo orpheline
- `DELETE /api/videos/delete-from-config` - Supprimer une vidéo de la config et du disque
  ```json
  { "videoPath": "videos/MATCH_SF/BUT/video.mp4", "categoryId": "Match_SF", "subcategoryId": "But" }
  ```
- `PUT /api/videos/edit` - Modifier une vidéo (déplacer, renommer)
  ```json
  {
    "originalPath": "MATCH_SF/BUT/video.mp4",
    "categoryId": "Match_SF",
    "subcategoryId": "But",
    "displayName": "But n°1",
    "newFilename": "but_1.mp4"
  }
  ```
- `PUT /api/videos/reorder` - Réorganiser une vidéo dans la même liste
  ```json
  {
    "videoPath": "videos/MATCH_SF/BUT/video.mp4",
    "categoryId": "Match_SF",
    "subcategoryId": "But",
    "newIndex": 2
  }
  ```
- `PUT /api/videos/move` - Déplacer une vidéo vers une autre catégorie
  ```json
  {
    "videoPath": "videos/MATCH_SF/BUT/video.mp4",
    "fromCategoryId": "Match_SF",
    "fromSubcategoryId": "But",
    "toCategoryId": "Match_H",
    "toSubcategoryId": "But",
    "newIndex": 0
  }
  ```

#### Configuration

- `GET /api/configuration` - Configuration complète (`configuration.json`)
- `GET /api/configuration/time-categories` - Récupérer les blocs temps et catégories disponibles
- `PUT /api/configuration/time-categories` - Mettre à jour les blocs temps
  ```json
  {
    "timeCategories": [
      { "id": "before", "name": "Avant-match", "icon": "🏁", "categoryIds": ["cat1"] }
    ]
  }
  ```

#### Catégories

- `GET /api/configuration/categories` - Liste toutes les catégories
- `POST /api/configuration/categories` - Créer une catégorie
  ```json
  { "id": "match-sf", "name": "Match SF", "videos": [], "subCategories": [] }
  ```
- `PUT /api/configuration/categories/:categoryId` - Modifier une catégorie
- `DELETE /api/configuration/categories/:categoryId` - Supprimer une catégorie
- `POST /api/configuration/categories/:categoryId/subcategories` - Ajouter une sous-catégorie
  ```json
  { "id": "but", "name": "But", "videos": [] }
  ```
- `DELETE /api/configuration/categories/:categoryId/subcategories/:subCategoryId` - Supprimer une sous-catégorie

#### Miniatures

- `POST /api/thumbnails/regenerate` - Régénère les miniatures en arrière-plan
  ```json
  { "force": false } // true = régénère tout, false = seulement les manquantes
  ```
- `POST /api/thumbnails/regenerate-sync` - Régénère les miniatures (synchrone, avec résultat)
  ```json
  // Response
  { "success": true, "stats": { "total": 10, "generated": 3, "skipped": 7, "failed": 0 } }
  ```

#### Authentification

- `GET /api/auth/status` - Statut d'authentification + token CSRF
- `POST /api/auth/login` - Connexion (crée session + cookies CSRF)
- `POST /api/auth/logout` - Déconnexion (supprime session)
- `POST /api/auth/change-password` - Changer le mot de passe admin (ancien + nouveau requis)

#### Logs

- `GET /api/logs/:service?lines=100` - Récupérer logs

#### WiFi

- `POST /api/wifi/connect` - Connexion WiFi avec option BSSID lock
  ```json
  {
    "ssid": "WiFi-Club",
    "password": "motdepasse8+",
    "bssid": "AA:BB:CC:DD:EE:FF",
    "lockBssid": false
  }
  ```
- `GET /api/wifi/scan` - Scanner les réseaux WiFi
- `GET /api/wifi/current` - Statut WiFi actuel
- `DELETE /api/wifi/bssid-lock` - Supprimer le verrouillage BSSID

#### Services

- `POST /api/services/:service/restart` - Redémarrer service

> ℹ️ En développement (conteneur Docker sans `sudo` ou avec l'option _no new privileges_),
> le serveur retente automatiquement la commande **sans `sudo`** lorsqu'il tourne en root.
> Le redémarrage peut néanmoins échouer si `systemd` n'est pas disponible dans l'environnement.

#### Mise à jour

- `POST /api/update` - Upload package (multipart .tar.gz)

## Configuration

### Port (défaut: 8080)

Modifier dans `/etc/systemd/system/neopro-admin.service` :

```ini
Environment=ADMIN_PORT=8888
```

### Répertoire d'installation

Par défaut : `/home/pi/neopro`.
En développement local, le serveur détecte automatiquement `public/` si seuls les médias y existent (pour que l'upload alimente `public/videos`). Vous pouvez forcer un autre chemin avec la variable d'environnement `NEOPRO_DIR`.

## Développement

### Lancement en mode dev

```bash
npm install
npm run dev
```

### Structure

```
admin/
├── admin-server.js          # Orchestrateur Express (wiring services ↔ routes)
├── helpers.js               # Utilitaires partagés (exec, sanitize, paths)
├── cache-manager.js         # Cache en mémoire avec TTL & namespaces
├── email-notifier.js        # Notifications email (nodemailer)
├── package.json             # Dépendances
│
├── services/                # Logique métier (pur, testable)
│   ├── errors.js            #   Classes d'erreur typées (NotFound, Locked, Validation…)
│   ├── configuration.service.js  #   CRUD sur configuration.json
│   ├── video.service.js     #   Upload, list, edit, delete, orphelins
│   ├── video-processing.service.js  #   File de traitement (compression, miniatures)
│   ├── system.service.js    #   CPU, disk, version, logs, services systemd
│   ├── network.service.js   #   WiFi scan, connect, BSSID lock, hotspot
│   └── backup.service.js    #   Backups CRUD, timer systemd
│
├── routes/                  # Contrôleurs HTTP minces (délèguent aux services)
│   ├── auth.js              #   Login, sessions, middleware requireAuth
│   ├── system.js            #   GET /api/system, POST /api/system/reboot…
│   ├── sync-status.js       #   GET /api/sync-status (état sync-agent)
│   ├── videos.js            #   CRUD vidéos, upload, orphelins, miniatures
│   ├── config.js            #   Catégories, sous-catégories, timeCategories
│   ├── network.js           #   WiFi, réseau, hotspot
│   ├── backup.js            #   Backups, auto-backup
│   ├── update.js            #   Mise à jour OTA (.tar.gz)
│   ├── email.js             #   Config email, test, envoi
│   └── cache.js             #   Stats cache, vidage
│
├── .eslintrc.json           # Config ESLint frontend (lint:frontend)
│
├── __tests__/               # Tests unitaires (Jest, 194 tests, 60%+ couverture)
│   ├── helpers.test.js
│   ├── errors.test.js
│   ├── configuration.service.test.js
│   ├── system.service.test.js
│   ├── network.service.test.js
│   ├── video-processing.service.test.js
│   ├── backup.service.test.js
│   └── auth.routes.test.js  #   Sessions, CSRF, rate limiting, change-password (46 tests)
│
└── public/                  # Frontend (HTML/CSS/JS statique)
    ├── index.html
    ├── styles.css            # Fichier concaténé (build output depuis styles/)
    ├── app.js                # Fichier concaténé (build output depuis modules/, gitignored)
    ├── styles/               # Sources CSS modulaires (10 fichiers → build-admin.sh → styles.css, gitignored)
    └── modules/              # Sources JS modulaires (voir MODULES.md)
        └── core/
            └── realtime.js   #   Connexion Socket.IO au serveur Pi (:3000), auto-refresh
```

### Architecture

Le serveur suit une architecture en couches :

```
HTTP Request → Route (thin controller) → Service (business logic) → helpers/fs/exec
```

- **Routes** : parsent les inputs HTTP, appellent le service, formatent la réponse
- **Services** : encapsulent la logique métier, lèvent des erreurs typées
- **Helpers** : fonctions utilitaires pures (sanitize, format, exec sécurisé)

### Tests

194 tests Jest couvrant les services, routes et authentification (sessions, CSRF, rate limiting, changement de mot de passe).

```bash
npm test              # Lance les 194 tests Jest
npm run test:coverage # Tests avec rapport de couverture
npm run lint:frontend # ESLint sur le code frontend (modules/)
```

## Dépannage

### Le serveur ne démarre pas

```bash
# Vérifier le service
sudo systemctl status neopro-admin

# Voir les erreurs
sudo journalctl -u neopro-admin -n 50

# Vérifier les dépendances
cd /home/pi/neopro/admin
npm install
```

### Erreur d'upload

```bash
# Vérifier l'espace
df -h

# Permissions
sudo chown -R pi:pi /home/pi/neopro
```

### Port déjà utilisé

```bash
# Voir ce qui utilise le port 8080
sudo netstat -tlnp | grep 8080

# Changer le port dans le service
sudo systemctl edit neopro-admin
```

## Sécurité

- **Authentification par session** : login obligatoire, cookie `admin_session` HttpOnly (expiration 24h)
- **Protection CSRF** : double cookie pattern (`admin_session` HttpOnly + `admin_csrf` JS-readable), header `X-CSRF-Token` requis sur toutes les mutations
- **Rate limiting** : 5 tentatives de login échouées → verrouillage 15 min par IP (Map en mémoire)
- **Changement de mot de passe** : route `POST /api/auth/change-password` + formulaire dans l'onglet Système
- Accessible uniquement sur réseau local
- Validations des uploads (type, taille)
- Confirmations pour actions critiques
- Backups automatiques avant mise à jour

## Support

Pour toute question : support@neopro.fr

---

**Version :** 3.93.0
**Licence :** MIT
**Auteur :** Neopro / Kalon Partners
**Dernière mise à jour :** 2 mars 2026
