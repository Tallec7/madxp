# Serveur Neopro pour Raspberry Pi

⚠️ **IMPORTANT : NE PAS MODIFIER CES FICHIERS DIRECTEMENT**

Ce dossier contient une **copie** des fichiers du serveur pour permettre une installation autonome du dossier `raspberry/`.

## Source de vérité

Les fichiers sources se trouvent dans : `../../server-render/`

## Workflow de développement

### Pour modifier le serveur :

1. **Modifiez les fichiers dans** `server-render/`
   ```bash
   cd server-render/
   # Éditez server.js ou package.json
   ```

2. **Testez localement**
   ```bash
   cd server-render/
   npm install
   npm start
   ```

3. **Synchronisez vers raspberry/server/**
   ```bash
   cd raspberry/scripts/
   ./sync-server.sh
   ```

4. **Committez les deux dossiers**
   ```bash
   git add server-render/ raspberry/server/
   git commit -m "feat: update server"
   ```

## Pourquoi cette duplication ?

Le dossier `raspberry/` doit être autonome pour pouvoir être copié seul sur un Raspberry Pi sans nécessiter tout le projet. C'est pourquoi nous maintenons une copie synchronisée du serveur.

## Fichiers

- `package.json` - Dépendances du serveur (express, socket.io)
- `server.js` - Serveur Socket.IO pour la communication temps réel + endpoint analytics
- `.gitignore` - Fichiers à ignorer (node_modules, logs)

## Endpoints

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

## Installation sur Raspberry Pi

Ces fichiers sont automatiquement copiés et installés par le script `install.sh` :
```bash
cp -r ./server/* /home/pi/neopro/server/
cd /home/pi/neopro/server
npm install --production
```
