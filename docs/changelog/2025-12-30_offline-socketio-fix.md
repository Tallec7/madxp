# Fix Socket.IO Offline Mode

**Date** : 30 décembre 2025

## Contexte

Le Raspberry Pi est conçu pour fonctionner en mode **autonome** (sans internet) :

- Le Pi crée son propre hotspot WiFi (`NEOPRO_xxx`)
- Un téléphone se connecte au hotspot
- Le téléphone accède à `/remote` pour contrôler l'affichage
- Le Pi affiche `/tv` sur un écran connecté
- Toutes les communications (vidéos, score, timer, breaking news) doivent fonctionner **localement**

## Problème identifié

Quand le Raspberry Pi était en mode hotspot **sans connexion internet**, les commandes depuis `/remote` (téléphone) n'arrivaient pas sur `/tv` (écran).

### Cause racine

Le fichier `index.html` chargeait la bibliothèque Socket.IO depuis un CDN externe :

```html
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
```

Sans internet, ce script ne pouvait pas être téléchargé. L'objet global `io` n'existait donc jamais, et la connexion WebSocket échouait silencieusement.

## Solution

### 1. Téléchargement local de Socket.IO

Le fichier `socket.io.min.js` (45 KB) a été téléchargé et placé dans :

```
raspberry/src/assets/socket.io.min.js
```

### 2. Modification de index.html

```html
<!-- Avant (CDN - ne fonctionne pas offline) -->
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>

<!-- Après (local - fonctionne toujours) -->
<script src="assets/socket.io.min.js"></script>
```

### 3. Configuration Angular

Ajout dans `angular.json` pour que le fichier soit copié dans le build :

```json
{
  "glob": "socket.io.min.js",
  "input": "raspberry/src/assets",
  "output": "assets"
}
```

## Architecture réseau du Raspberry Pi

```
┌──────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI (neopro.local)                    │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Hotspot   │    │ Socket.IO   │    │      Chromium       │  │
│  │  (hostapd)  │    │   Server    │    │    Kiosk Mode       │  │
│  │             │    │  Port 3000  │    │                     │  │
│  │  wlan0      │    │             │    │  /tv (affichage)    │  │
│  │  192.168.4.1│    │             │    │                     │  │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘  │
│         │                  │                      │              │
│         │          ┌───────┴───────┐              │              │
│         │          │   Événements  │              │              │
│         │          │   Socket.IO   │◄─────────────┘              │
│         │          │   'action'    │   Écoute les commandes      │
│         │          └───────┬───────┘                             │
│         │                  │                                     │
└─────────┼──────────────────┼─────────────────────────────────────┘
          │                  │
          │    WiFi          │
          ▼                  │
┌─────────────────────┐      │
│    TÉLÉPHONE        │      │
│                     │      │
│  Connecté au        │      │
│  hotspot NEOPRO     │      │
│                     │      │
│  /remote            │──────┘
│  (télécommande)     │  Envoie les commandes
│                     │  via Socket.IO 'command'
└─────────────────────┘
```

## Modes de fonctionnement

### Mode 1 : Hotspot seul (sans internet)

```
Internet ✗
WiFi externe ✗
Hotspot ✓

Fonctionnalités :
- Lecture vidéos locales ✓
- Télécommande /remote ✓
- Score live ✓
- Timer/Chrono ✓
- Breaking news ✓
- Sync cloud ✗
- Analytics push ✗
```

### Mode 2 : Hotspot + WiFi externe (avec internet)

```
Internet ✓ (via wlan1)
WiFi externe ✓
Hotspot ✓ (via wlan0)

Fonctionnalités :
- Lecture vidéos locales ✓
- Télécommande /remote ✓
- Score live ✓
- Timer/Chrono ✓
- Breaking news ✓
- Sync cloud ✓ (sync-agent)
- Analytics push ✓
```

### Mode 3 : WiFi externe seul (dépannage)

```
Internet ✓
WiFi externe ✓
Hotspot ✗

Fonctionnalités :
- Télécommande via IP locale
- Sync cloud ✓
- Analytics push ✓
```

## Communication Socket.IO

### Flux des événements

```
┌─────────────────────────────────────────────────────────────────┐
│                        Socket.IO Server                          │
│                         (Port 3000)                              │
│                                                                  │
│   socket.on('command', data) ──► io.emit('action', data)        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
           ▲                              │
           │ 'command'                    │ 'action'
           │                              ▼
┌──────────────────┐             ┌──────────────────┐
│     /remote      │             │       /tv        │
│   (Téléphone)    │             │    (Chromium)    │
│                  │             │                  │
│ socketService    │             │ socketService    │
│   .emit(...)     │             │   .on('action')  │
└──────────────────┘             └──────────────────┘
```

### Événements principaux

| Événement        | Source | Cible  | Description               |
| ---------------- | ------ | ------ | ------------------------- |
| `command`        | Remote | Server | Commande de l'utilisateur |
| `action`         | Server | TV     | Broadcast de la commande  |
| `score-update`   | Remote | TV     | Mise à jour du score      |
| `score-reset`    | Remote | TV     | Réinitialisation score    |
| `phase-change`   | Remote | TV     | Changement de phase match |
| `options-update` | Remote | TV     | Options overlay           |
| `breaking-news`  | Remote | TV     | Flash info                |
| `timer-update`   | Remote | TV     | Mise à jour chrono        |

## Sync-Agent

Le sync-agent gère la synchronisation avec le cloud **quand internet est disponible** :

```
┌─────────────────────────────────────────────────────────────────┐
│                       SYNC-AGENT                                 │
│                    (Node.js service)                             │
│                                                                  │
│  Fonctions :                                                     │
│  - Heartbeat toutes les 30s (CPU, RAM, disque, température)     │
│  - Pull config depuis le cloud                                  │
│  - Push analytics vers le cloud                                 │
│  - Push impressions sponsors vers le cloud                      │
│  - Téléchargement vidéos déployées                              │
│                                                                  │
│  Comportement offline :                                          │
│  - Buffer les analytics localement                              │
│  - Buffer les impressions localement                            │
│  - Retry automatique à la reconnexion                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Fichiers modifiés

| Fichier                                 | Modification                 |
| --------------------------------------- | ---------------------------- |
| `raspberry/src/index.html`              | CDN → fichier local          |
| `raspberry/src/assets/socket.io.min.js` | Nouveau fichier (45 KB)      |
| `angular.json`                          | Ajout asset socket.io.min.js |

## Tests de validation

1. **Mode hotspot sans internet** :

   ```bash
   # Sur le Pi
   curl http://localhost:3000/health
   # Depuis téléphone connecté au hotspot
   # Ouvrir http://neopro.local/remote
   # Lancer une vidéo → doit s'afficher sur /tv
   ```

2. **Test CLI** :
   ```bash
   cd /home/pi/neopro/sync-agent && node -e "
   const io = require('socket.io-client');
   const socket = io('http://localhost:3000');
   socket.on('connect', () => {
     socket.emit('command', {type:'video',data:{name:'TEST',path:'videos/test.mp4'}});
   });
   socket.on('action', (data) => console.log('Action:', data));
   setTimeout(() => process.exit(0), 2000);
   "
   ```

## Impact

- **Avant** : Télécommande ne fonctionnait pas sans internet
- **Après** : Télécommande fonctionne en mode 100% autonome

Cette correction est critique pour l'utilisation en match/événement où le Pi doit fonctionner sans dépendance internet.
