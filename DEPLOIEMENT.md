# Guide de Déploiement Neopro

## Architecture nécessaire

L'application nécessite **2 serveurs** :

1. **Serveur Web (Apache)** : Pour héberger les fichiers statiques Angular
2. **Serveur Node.js** : Pour le WebSocket Socket.IO (communication en temps réel)

---

## Configuration

### 1. Modifier l'URL du serveur Socket.IO

Éditez `src/environments/environment.prod.ts` :

```typescript
export const environment = {
  production: true,
  socketUrl: 'https://votre-serveur-nodejs.com:3000' // Remplacez par votre URL
};
```

**Important** : Si votre serveur Node.js utilise HTTPS, l'URL doit commencer par `https://` et le certificat SSL doit être valide.

---

## Déploiement

### Étape 1 : Build de l'application

```bash
npm run build
```

Cela génère les fichiers dans le dossier `dist/neopro/browser/`.

### Étape 2 : Déploiement des fichiers statiques (Apache)

1. Uploadez tout le contenu de `dist/neopro/browser/` sur votre hébergement Apache
2. Assurez-vous que le fichier `.htaccess` est présent :

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Étape 3 : Déploiement du serveur Node.js

**Option A : Serveur dédié ou VPS**

1. Copiez le fichier `public/server.js` et le dossier `node_modules/` sur votre serveur
2. Installez les dépendances si nécessaire :
   ```bash
   npm install express socket.io
   ```
3. Lancez le serveur :
   ```bash
   node server.js
   ```
4. Utilisez PM2 pour le garder actif en permanence :
   ```bash
   npm install -g pm2
   pm2 start server.js --name neopro-socket
   pm2 save
   pm2 startup
   ```

**Option B : Service cloud (Heroku, Render, Railway, etc.)**

Déployez `server.js` sur un service cloud qui supporte Node.js et WebSocket.

### Étape 4 : Configuration CORS (si nécessaire)

Si votre serveur Node.js est sur un domaine différent de votre site Apache, ajoutez CORS au serveur :

```javascript
const io = socketIO(server, {
  cors: {
    origin: "https://votre-site-apache.com",
    methods: ["GET", "POST"]
  }
});
```

---

## Vérification

1. Ouvrez la console du navigateur (F12)
2. Accédez à `/tv` et `/remote`
3. Vérifiez qu'il n'y a pas d'erreur Socket.IO
4. Vous devriez voir : `Connecting to socket server: https://...`
5. Testez une action depuis `/remote` pour vérifier la communication

---

## Ports et Firewall

- **Port 3000** : Serveur Node.js/Socket.IO (doit être ouvert)
- **Port 80/443** : Serveur web Apache (standard)

Assurez-vous que votre firewall autorise les connexions sur le port 3000.

---

## Troubleshooting

### "WebSocket connection failed"
- Vérifiez que le serveur Node.js est bien lancé
- Vérifiez l'URL dans `environment.prod.ts`
- Vérifiez que le port 3000 est ouvert dans le firewall

### "Mixed content" (HTTP/HTTPS)
- Si votre site Apache est en HTTPS, votre serveur Node.js doit aussi être en HTTPS
- Utilisez un reverse proxy (nginx) ou un certificat SSL pour Node.js

### Les commandes ne passent pas
- Ouvrez la console sur `/tv` ET `/remote`
- Vérifiez que les deux sont connectés au même serveur Socket.IO
