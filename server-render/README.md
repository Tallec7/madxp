# Serveur Socket.IO pour Neopro

Ce serveur gère la communication en temps réel entre l'interface TV et la télécommande.

## Déploiement sur Render

### 1. Créer un nouveau Web Service sur Render

1. Allez sur https://render.com
2. Cliquez sur "New +" → "Web Service"
3. Connectez votre dépôt Git

### 2. Configuration du service

- **Name**: `neopro-socket`
- **Region**: Choisissez le plus proche de vous
- **Branch**: `main` (ou votre branche principale)
- **Root Directory**: `server-render`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: `Free` (ou supérieur selon vos besoins)

### 3. Variables d'environnement (optionnel)

Vous pouvez ajouter ces variables dans Render :
- `PORT`: (automatiquement défini par Render)

### 4. Déployer

Cliquez sur "Create Web Service" et attendez le déploiement.

### 5. Récupérer l'URL

Une fois déployé, Render vous donnera une URL comme :
```
https://neopro-socket.onrender.com
```

### 6. Mettre à jour votre application Angular

Modifiez `src/environments/environment.prod.ts` avec cette URL :

```typescript
export const environment = {
  production: true,
  socketUrl: 'https://neopro-socket.onrender.com'
};
```

Puis rebuild votre application :
```bash
npm run build
```

## Test local

```bash
cd server-render
npm install
npm start
```

Le serveur démarre sur http://localhost:3000

## Synchronisation avec Raspberry Pi

⚠️ **Important** : Ce dossier est la **source de vérité** pour le serveur.

Après avoir modifié `server.js` ou `package.json`, synchronisez avec le dossier raspberry :

```bash
cd raspberry/scripts/
./sync-server.sh
```

Cela copiera automatiquement les fichiers vers `raspberry/server/` pour l'installation autonome sur Raspberry Pi.

## Endpoints

- `GET /` - Status du serveur et nombre de connexions

## CORS

Par défaut, le serveur accepte toutes les origines (`*`).

Pour plus de sécurité en production, modifiez la ligne dans `server.js` :

```javascript
origin: "https://votre-site-apache.com"
```
