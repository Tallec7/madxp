# ✅ Correction du problème Socket.IO

## 🐛 Problème identifié

Le fichier `src/index.html` chargeait Socket.IO depuis `/socket.io/socket.io.js`, qui n'existe que sur un serveur Node.js. Sur Apache, ce fichier n'existe pas, donc Socket.IO ne se chargeait jamais.

## ✅ Correction appliquée

Le fichier a été corrigé pour utiliser le CDN Socket.IO :

```html
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js" crossorigin="anonymous"></script>
```

---

## 🚀 Étapes pour appliquer la correction

### 1. Récupérer votre URL Render

1. Aller sur https://dashboard.render.com
2. Cliquer sur votre service Socket.IO
3. Copier l'URL affichée en haut (ex: `https://neopro-socket-xxxxx.onrender.com`)

### 2. Mettre à jour environment.prod.ts

Ouvrir `src/environments/environment.prod.ts` et remplacer :

```typescript
export const environment = {
  production: true,
  socketUrl: 'https://neopro-socket-xxxxx.onrender.com' // ← Coller votre URL Render ici
};
```

### 3. Rebuilder l'application

```bash
npm run build
```

### 4. Uploader sur Apache

Uploader tout le contenu de `dist/neopro/browser/` sur `https://neopro.kalonpartners.bzh`

**⚠️ Important** : Vérifiez bien que le fichier `.htaccess` est uploadé !

### 5. Tester

1. Ouvrir https://neopro.kalonpartners.bzh/tv
2. Ouvrir https://neopro.kalonpartners.bzh/remote
3. Ouvrir la console (F12)
4. Vérifier les messages :
   ```
   Connecting to socket server: https://neopro-socket-xxxxx.onrender.com
   ```
5. Cliquer sur une vidéo dans `/remote`
6. La vidéo doit se lancer sur `/tv` ! ✅

---

## 🔍 Vérification

### Dans la console de /tv et /remote

✅ **Vous devez voir** :
```
Connecting to socket server: https://...
socket service : on action
```

❌ **Vous ne devez PAS voir** :
```
socket service : not initialized, reference error
GET /socket.io/socket.io.js 404 (Not Found)
```

### Dans les logs Render

https://dashboard.render.com → Votre service → Logs

✅ **Vous devez voir** :
```
✓ Serveur Socket.IO lancé sur le port 10000
Client connecté: abc123
Commande reçue: { type: 'video', data: {...} }
```

---

## ⚡ Résumé des modifications

| Fichier | Avant | Après |
|---------|-------|-------|
| `src/index.html` | `<script src="/socket.io/socket.io.js">` | `<script src="https://cdn.socket.io/4.6.1/socket.io.min.js">` |
| `src/environments/environment.prod.ts` | `socketUrl: 'https://votre-app-render.onrender.com'` | `socketUrl: 'https://[VOTRE-VRAIE-URL].onrender.com'` |

---

## 📞 Si ça ne fonctionne toujours pas

Donnez-moi :
1. L'URL de votre serveur Render
2. Les messages dans la console (F12) sur `/tv` et `/remote`
3. Une capture des logs Render
