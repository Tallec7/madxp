# Déploiement Neopro pour Kalon Partners

## 🎯 Configuration spécifique

**Site de production** : https://neopro.kalonpartners.bzh
**Hébergement** : Apache (Kalon Partners)
**Serveur Socket.IO** : Render (à déployer)

---

## 📋 Checklist de déploiement

### Étape 1 : Déployer le serveur Socket.IO sur Render

1. **Aller sur** https://render.com
2. **Créer un compte** (gratuit)
3. **New +** → **Web Service**
4. **Connecter** votre dépôt GitHub : `Tallec7/neopro`
5. **Configurer le service** :

   | Champ | Valeur |
   |-------|--------|
   | Name | `neopro-socket-kalon` |
   | Branch | `eloquent-bartik` |
   | Root Directory | `server-render` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | `Free` |

6. **Cliquer sur** "Create Web Service"
7. **Attendre** 2-3 minutes que le déploiement se termine
8. **Noter l'URL** fournie par Render (ex: `https://neopro-socket-kalon.onrender.com`)

---

### Étape 2 : Configurer l'URL Render dans l'application

1. **Ouvrir** `src/environments/environment.prod.ts`
2. **Remplacer** la ligne 5 :

```typescript
export const environment = {
  production: true,
  socketUrl: 'https://VOTRE-URL-RENDER.onrender.com' // ← Coller l'URL Render ici
};
```

Exemple :
```typescript
export const environment = {
  production: true,
  socketUrl: 'https://neopro-socket-kalon.onrender.com'
};
```

---

### Étape 3 : Builder l'application

```bash
npm run build
```

Cela génère les fichiers dans `dist/neopro/browser/`

---

### Étape 4 : Uploader sur Apache (Kalon Partners)

1. **Se connecter** à votre hébergement via FTP/SFTP
2. **Aller** dans le dossier racine de `https://neopro.kalonpartners.bzh`
3. **Uploader tout le contenu** de `dist/neopro/browser/` :
   - `index.html`
   - `.htaccess` ⚠️ Important pour le routing Angular
   - `configuration.json`
   - Tous les dossiers (`chunk-*.js`, `videos/`, etc.)

⚠️ **Vérifier que le fichier `.htaccess` est bien uploadé** (il est parfois caché)

---

### Étape 5 : Tester

1. **Ouvrir** https://neopro.kalonpartners.bzh/tv
2. **Ouvrir** https://neopro.kalonpartners.bzh/remote (sur un autre appareil/onglet)
3. **Ouvrir la console** (F12) dans les deux onglets
4. **Vérifier** qu'il n'y a pas d'erreur Socket.IO
5. **Tester** : Cliquer sur une vidéo dans `/remote` → La vidéo doit se lancer sur `/tv`

---

## ✅ Points de vérification

### Console navigateur (/tv et /remote)

✅ **Messages attendus** :
```
Connecting to socket server: https://neopro-socket-kalon.onrender.com
```

❌ **Erreurs à surveiller** :
```
socket service : not initialized, reference error
WebSocket connection failed
CORS error
```

### Endpoint de santé du serveur

Ouvrir dans un navigateur : `https://votre-url-render.onrender.com/`

✅ **Réponse attendue** :
```json
{
  "status": "ok",
  "service": "Neopro Socket.IO Server",
  "connections": 0
}
```

---

## 🔧 Configuration CORS

Le serveur Socket.IO est configuré pour accepter les connexions de :
- ✅ `https://neopro.kalonpartners.bzh` (production)
- ✅ `http://localhost:4200` (développement local)

Si vous changez de domaine, modifiez `server-render/server.js:11`

---

## ⚠️ Important : Plan gratuit Render

Le serveur Socket.IO sur le plan gratuit Render :
- **S'endort** après 15 minutes d'inactivité
- **Se réveille** en 30-60 secondes à la première connexion
- **750 heures/mois** gratuites (largement suffisant)

### Solution pour le garder actif

Utilisez **UptimeRobot** (gratuit) :
1. Créer un compte sur https://uptimerobot.com
2. Ajouter un monitor HTTP(S)
3. URL : `https://votre-url-render.onrender.com/`
4. Intervalle : 5 minutes
5. Le serveur restera actif en permanence

---

## 🚀 Commandes rapides

### Builder l'application
```bash
npm run build
```

### Tester le serveur en local
```bash
cd server-render
npm install
npm start
```

### Tester l'app Angular en local avec le serveur
```bash
# Terminal 1
cd server-render
npm start

# Terminal 2
ng serve
# Puis ouvrir http://localhost:4200/tv et /remote
```

---

## 📞 Troubleshooting

### Problème : Les routes /tv et /remote retournent 404

**Solution** : Vérifier que `.htaccess` est bien présent et uploadé sur Apache

### Problème : "WebSocket connection failed"

**Solutions** :
1. Vérifier que le serveur Render est en ligne (dashboard Render)
2. Vérifier l'URL dans `environment.prod.ts`
3. Vérifier les logs Render pour voir les erreurs

### Problème : "CORS error"

**Solution** : Vérifier que `https://neopro.kalonpartners.bzh` est bien dans la liste CORS du serveur (`server-render/server.js:11`)

### Problème : Les vidéos ne se chargent pas

**Solutions** :
1. Vérifier que le dossier `videos/` est bien uploadé
2. Vérifier les chemins dans `configuration.json`
3. Ouvrir la console et regarder les erreurs réseau (onglet Network)

---

## 📊 Architecture finale

```
┌──────────────────────────────────┐
│  https://neopro.kalonpartners.bzh │
│  (Apache - Kalon Partners)        │
│                                   │
│  /tv       → Interface TV         │
│  /remote   → Télécommande         │
│  /videos/  → Fichiers vidéo       │
└───────────────┬──────────────────┘
                │
                │ Socket.IO Client
                │
                ↓
┌───────────────────────────────────┐
│  https://[...].onrender.com       │
│  (Render - Gratuit)                │
│                                   │
│  Serveur Socket.IO Node.js        │
│  • Relaie les commandes           │
│  • CORS configuré                 │
│  • HTTPS automatique              │
└───────────────────────────────────┘
```

---

## 📝 Après le premier déploiement

Une fois que tout fonctionne, commitez la modification de `environment.prod.ts` :

```bash
git add src/environments/environment.prod.ts
git commit -m "Update production Socket.IO URL"
git push
```

---

**Besoin d'aide ?** Consultez les guides détaillés :
- `DEPLOIEMENT-RAPIDE.md`
- `GUIDE-DEPLOIEMENT-RENDER.md`
