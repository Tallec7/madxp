# Guide de Déploiement Complet - Neopro avec Render

## Architecture

L'application Neopro est composée de deux parties :

1. **Frontend Angular** → Hébergé sur Apache (votre hébergeur actuel)
2. **Serveur Socket.IO** → Hébergé sur Render (gratuit)

---

## Étape 1 : Déployer le serveur Socket.IO sur Render

### A. Préparer le dépôt Git

1. Assurez-vous que votre projet est dans un dépôt Git (GitHub, GitLab, Bitbucket)
2. Commitez les nouveaux fichiers du dossier `server-render/` :

```bash
git add server-render/
git commit -m "Add Socket.IO server for Render deployment"
git push
```

### B. Créer le service sur Render

1. Allez sur https://render.com et créez un compte (gratuit)
2. Cliquez sur **"New +"** → **"Web Service"**
3. Connectez votre dépôt Git (GitHub/GitLab/Bitbucket)
4. Sélectionnez votre dépôt `neopro`

### C. Configuration du Web Service

Remplissez les champs suivants :

| Champ | Valeur |
|-------|--------|
| **Name** | `neopro-socket` (ou le nom de votre choix) |
| **Region** | Choisissez le plus proche de vous |
| **Branch** | `eloquent-bartik` (ou votre branche principale) |
| **Root Directory** | `server-render` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

### D. Déployer

1. Cliquez sur **"Create Web Service"**
2. Render va automatiquement :
   - Cloner votre dépôt
   - Installer les dépendances
   - Démarrer le serveur
3. Attendez que le déploiement soit terminé (environ 2-3 minutes)

### E. Récupérer l'URL du serveur

Une fois déployé, Render affiche l'URL de votre service, par exemple :
```
https://neopro-socket.onrender.com
```

**⚠️ IMPORTANT : Notez cette URL**, vous en aurez besoin pour la prochaine étape.

---

## Étape 2 : Configurer l'application Angular

### A. Mettre à jour l'URL du serveur Socket.IO

Éditez le fichier `src/environments/environment.prod.ts` :

```typescript
export const environment = {
  production: true,
  socketUrl: 'https://neopro-socket.onrender.com' // Remplacez par VOTRE URL Render
};
```

### B. Builder l'application

```bash
npm run build
```

Cela génère les fichiers optimisés dans `dist/neopro/browser/`

---

## Étape 3 : Déployer sur Apache

### A. Préparer les fichiers

1. Allez dans le dossier `dist/neopro/browser/`
2. Vérifiez que le fichier `.htaccess` est présent avec ce contenu :

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

### B. Uploader sur Apache

Uploadez **tout le contenu** de `dist/neopro/browser/` sur votre hébergeur Apache via FTP/SFTP.

---

## Étape 4 : Tester

### A. Ouvrir deux onglets

1. **Onglet 1** : Ouvrez `https://votre-site.com/tv`
2. **Onglet 2** : Ouvrez `https://votre-site.com/remote`

### B. Vérifier dans la console (F12)

Dans les deux onglets, ouvrez la console développeur et vérifiez :

✅ **Messages attendus :**
```
Connecting to socket server: https://neopro-socket.onrender.com
```

❌ **Erreurs à surveiller :**
```
socket service : not initialized, reference error
WebSocket connection failed
```

### C. Tester la communication

1. Sur `/remote`, naviguez dans les catégories
2. Cliquez sur une vidéo
3. Sur `/tv`, la vidéo devrait se lancer automatiquement

---

## Troubleshooting

### Le serveur Socket.IO ne démarre pas sur Render

- Vérifiez que le **Root Directory** est bien `server-render`
- Vérifiez les logs dans Render : Cliquez sur votre service → **"Logs"**

### "WebSocket connection failed"

- Vérifiez que l'URL dans `environment.prod.ts` est correcte
- Vérifiez que le serveur Render est bien en ligne (vert)
- Sur le plan gratuit de Render, le serveur s'endort après 15 min d'inactivité. La première connexion peut prendre 30-60 secondes.

### "Mixed content" error (HTTP/HTTPS)

- Votre site Apache doit être en HTTPS
- Render fournit automatiquement HTTPS
- Assurez-vous d'utiliser `https://` dans `environment.prod.ts`

### Les vidéos ne se chargent pas sur `/tv`

- Vérifiez que le dossier `videos/` et `configuration.json` sont bien uploadés sur Apache
- Vérifiez les chemins dans `configuration.json`

---

## Important : Plan gratuit de Render

⚠️ **Le plan gratuit de Render a des limitations :**

- Le serveur s'endort après **15 minutes d'inactivité**
- Au réveil (première connexion), il faut **30-60 secondes** pour redémarrer
- **750 heures/mois gratuites** (suffisant pour un usage normal)

**Solution :** Utilisez un service comme [UptimeRobot](https://uptimerobot.com) (gratuit) pour pinger votre serveur toutes les 5 minutes et le garder actif.

---

## Coûts

- **Render** : 0€ (plan gratuit)
- **Apache** : Selon votre hébergeur actuel
- **Total** : 0€ pour le serveur Socket.IO

---

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs Render
2. Vérifiez la console navigateur (F12)
3. Testez l'endpoint de santé : `https://votre-app.onrender.com/`
   - Devrait retourner : `{"status":"ok","service":"Neopro Socket.IO Server","connections":0}`

---

## Mise à jour future

Pour mettre à jour le serveur Socket.IO :

1. Modifiez `server-render/server.js`
2. Commitez et pushez
3. Render redéploie automatiquement !

Pour l'application Angular :

1. Modifiez votre code
2. `npm run build`
3. Uploadez `dist/neopro/browser/` sur Apache
