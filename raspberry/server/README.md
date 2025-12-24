# Serveur Neopro Socket.IO

Ce dossier est la **source de vérité** pour le serveur Socket.IO utilisé à la fois :

- En **développement local** (`npm run server`)
- Sur le **Raspberry Pi** (déployé via `build-and-deploy.sh`)

## Workflow de développement

### Pour modifier le serveur :

1. **Modifiez les fichiers ici** (`raspberry/server/`)

   ```bash
   cd raspberry/server/
   # Éditez server.js ou package.json
   ```

2. **Testez localement**

   ```bash
   cd raspberry/server/
   npm install
   npm start
   ```

3. **Committez**

   ```bash
   git add raspberry/server/
   git commit -m "feat: update server"
   ```

4. **Déployez sur le Raspberry Pi**
   ```bash
   ./raspberry/scripts/build-and-deploy.sh
   ```

## Fichiers

- `package.json` - Dépendances du serveur (express, socket.io, axios)
- `server.js` - Serveur Socket.IO pour la communication temps réel + endpoint analytics
- `.gitignore` - Fichiers à ignorer (node_modules, logs)

---

## Fonctionnalités

### 1. Communication temps réel (Socket.IO)

Le serveur gère la communication entre la télécommande et l'écran TV via Socket.IO.

### 2. Persistance du score en mémoire

Le score est conservé côté serveur pour éviter le reset lors du refresh de la télécommande ou de l'écran TV. À chaque nouvelle connexion, le client reçoit automatiquement l'état actuel.

**État persisté :**

- Score (équipe domicile/extérieur)
- Phase du match (neutral, before, during, after)

### 3. Analytics

Collecte et stockage des événements de lecture vidéo pour synchronisation avec le serveur central.

---

## Événements Socket.IO

### Événements reçus du client

| Événement      | Description                           | Payload                                                   |
| -------------- | ------------------------------------- | --------------------------------------------------------- |
| `command`      | Commande générale (play, pause, etc.) | `{ action: string, ... }`                                 |
| `score-update` | Mise à jour du score                  | `{ homeTeam, awayTeam, homeScore, awayScore }`            |
| `score-reset`  | Remise à zéro des scores              | -                                                         |
| `phase-change` | Changement de phase du match          | `{ phase: 'neutral' \| 'before' \| 'during' \| 'after' }` |

### Événements émis vers les clients

| Événement      | Description              | Quand                                |
| -------------- | ------------------------ | ------------------------------------ |
| `score-update` | État actuel du score     | À la connexion + à chaque changement |
| `phase-change` | Phase actuelle du match  | À la connexion + à chaque changement |
| `action`       | Broadcast d'une commande | Quand un client envoie `command`     |
| `score-reset`  | Notification de reset    | Quand un client envoie `score-reset` |

### Exemple de flux

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│  Remote     │                    │   Server    │                    │     TV      │
└─────┬───────┘                    └─────┬───────┘                    └─────┬───────┘
      │                                  │                                  │
      │ ──── connect ────────────────────>                                  │
      │ <─── score-update (état actuel) ──                                  │
      │ <─── phase-change (état actuel) ──                                  │
      │                                  │                                  │
      │ ──── score-update (+1 home) ────>│                                  │
      │                                  │ ──── score-update (broadcast) ──>│
      │                                  │                                  │
```

---

## Endpoints REST

### GET /

Route de santé. Retourne le statut du serveur et le nombre de connexions WebSocket.

### POST /api/analytics

Reçoit les événements analytics du frontend Angular et les stocke localement.

**Body:**

```json
{
  "events": [
    {
      "video_filename": "sponsor1.mp4",
      "category": "sponsor",
      "played_at": "2025-01-01T12:00:00Z",
      "duration_played": 30,
      "video_duration": 30,
      "completed": true,
      "trigger_type": "auto"
    }
  ]
}
```

**Réponse:**

```json
{
  "success": true,
  "received": 1,
  "total": 5
}
```

Les événements sont stockés dans `~/neopro/data/analytics_buffer.json` et envoyés au serveur central par le sync-agent toutes les 5 minutes.

### GET /api/analytics/stats

Retourne les statistiques du buffer analytics local.

**Réponse:**

```json
{
  "count": 5,
  "oldestEvent": "2025-01-01T10:00:00Z",
  "newestEvent": "2025-01-01T12:00:00Z"
}
```

### POST /api/sync/sponsor-impressions

Reçoit les impressions sponsors du frontend et les stocke localement.

**Body:**

```json
{
  "impressions": [
    {
      "sponsor_id": "sponsor-123",
      "played_at": "2025-01-01T12:00:00Z",
      "duration": 15
    }
  ]
}
```

### GET /api/sync/sponsor-impressions/stats

Retourne les statistiques du buffer d'impressions sponsors.

---

## Installation sur Raspberry Pi

Ces fichiers sont automatiquement copiés et installés par le script `install.sh` :

```bash
cp -r ./server/* /home/pi/neopro/server/
cd /home/pi/neopro/server
npm install --production
```

### Mise à jour manuelle

Si vous devez mettre à jour le serveur manuellement sur un Pi existant :

```bash
# Depuis votre Mac
scp raspberry/server/server.js pi@neopro.local:/home/pi/neopro/server/
scp raspberry/server/package.json pi@neopro.local:/home/pi/neopro/server/

# Sur le Pi
ssh pi@neopro.local
cd /home/pi/neopro/server
npm install --production
sudo systemctl restart neopro-app
```

---

**Dernière mise à jour :** 24 décembre 2025
