# Guide de Diagnostic - Socket.IO ne fonctionne pas

## 🔍 Étapes de diagnostic

### Étape 1 : Vérifier que le serveur Render est en ligne

1. **Aller sur le dashboard Render** : https://dashboard.render.com
2. **Vérifier l'état du service** :
   - ✅ Vert = En ligne
   - 🔴 Rouge = Erreur
   - 🟡 Jaune = En cours de déploiement

3. **Tester l'endpoint de santé** :
   - Ouvrir dans un navigateur : `https://VOTRE-URL-RENDER.onrender.com/`
   - **Réponse attendue** :
     ```json
     {
       "status": "ok",
       "service": "Neopro Socket.IO Server",
       "connections": 0
     }
     ```
   - **Si erreur** : Le serveur n'est pas démarré correctement

### Étape 2 : Vérifier l'URL dans environment.prod.ts

1. **Ouvrir** : `src/environments/environment.prod.ts`
2. **Vérifier** que `socketUrl` contient l'URL exacte de Render :
   ```typescript
   export const environment = {
     production: true,
     socketUrl: 'https://VOTRE-URL-RENDER.onrender.com' // ← Doit correspondre à l'URL Render
   };
   ```

3. **Si vous avez modifié ce fichier** :
   ```bash
   npm run build
   # Puis réuploader dist/neopro/browser/ sur Apache
   ```

### Étape 3 : Vérifier la console du navigateur

#### Sur https://neopro.kalonpartners.bzh/tv

1. **Ouvrir la console** (F12 → Console)
2. **Messages attendus** :
   ```
   Connecting to socket server: https://VOTRE-URL-RENDER.onrender.com
   tv player is ready
   tv player : play sponsors loop
   ```

3. **Erreurs possibles** :

   **Erreur A : "socket service : not initialized, reference error"**
   - **Cause** : La bibliothèque Socket.IO n'est pas chargée
   - **Solution** : Vérifier que `index.html` contient bien :
     ```html
     <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
     ```

   **Erreur B : "WebSocket connection failed"**
   - **Cause** : Le serveur Render n'est pas accessible
   - **Solutions** :
     1. Vérifier que le serveur Render est en ligne (Étape 1)
     2. Vérifier l'URL dans environment.prod.ts (Étape 2)
     3. Vérifier que vous avez rebuild et redéployé

   **Erreur C : "CORS error" ou "Access-Control-Allow-Origin"**
   - **Cause** : Le serveur refuse la connexion de votre domaine
   - **Solution** : Vérifier que `server-render/server.js` contient bien :
     ```javascript
     origin: ["https://neopro.kalonpartners.bzh", "http://localhost:4200"]
     ```

#### Sur https://neopro.kalonpartners.bzh/remote

1. **Ouvrir la console** (F12 → Console)
2. **Cliquer sur une vidéo**
3. **Messages attendus** :
   ```
   Connecting to socket server: https://VOTRE-URL-RENDER.onrender.com
   emit video [Object]
   socket service : emit command {...}
   ```

4. **Si vous ne voyez pas "socket service : emit command"** :
   - Le service Socket.IO n'est pas initialisé
   - Revoir l'Erreur A ci-dessus

### Étape 4 : Vérifier les logs Render

1. **Aller sur** : https://dashboard.render.com
2. **Cliquer sur votre service** (ex: neopro-socket-kalon)
3. **Onglet "Logs"**
4. **Messages attendus** :
   ```
   ✓ Serveur Socket.IO lancé sur le port 10000
   Client connecté: abc123
   Commande reçue: { type: 'video', data: {...} }
   ```

5. **Si vous ne voyez pas "Client connecté"** :
   - Les clients ne se connectent pas au serveur
   - Revenir aux Étapes 2 et 3

### Étape 5 : Test de connexion manuel

1. **Ouvrir la console du navigateur** sur n'importe quelle page
2. **Coller ce code** (remplacer l'URL) :
   ```javascript
   const socket = io('https://VOTRE-URL-RENDER.onrender.com');

   socket.on('connect', () => {
     console.log('✅ Connexion réussie !');
     socket.emit('command', { type: 'test', data: 'hello' });
   });

   socket.on('connect_error', (error) => {
     console.error('❌ Erreur de connexion:', error);
   });

   socket.on('action', (data) => {
     console.log('📥 Action reçue:', data);
   });
   ```

3. **Résultat attendu** :
   ```
   ✅ Connexion réussie !
   ```

4. **Si erreur** : Problème de connexion avec Render

---

## 🔧 Solutions rapides

### Solution 1 : Rebuild complet

```bash
# 1. Vérifier l'URL dans environment.prod.ts
cat src/environments/environment.prod.ts

# 2. Rebuilder
npm run build

# 3. Vérifier que l'URL est bien dans le build
grep -r "socketUrl" dist/neopro/browser/*.js

# 4. Réuploader dist/neopro/browser/ sur Apache
```

### Solution 2 : Redéployer le serveur Render

1. **Dashboard Render** → Votre service
2. **"Manual Deploy"** → **"Deploy latest commit"**
3. Attendre 2-3 minutes

### Solution 3 : Vérifier que Socket.IO est chargé

1. **Ouvrir** `dist/neopro/browser/index.html`
2. **Vérifier** la présence de :
   ```html
   <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
   ```
3. **Si absent**, ajouter dans `public/index.html` et rebuild

---

## 📊 Checklist complète

- [ ] Serveur Render en ligne (vert dans le dashboard)
- [ ] Endpoint `/` répond avec `{"status":"ok"}`
- [ ] `environment.prod.ts` contient la bonne URL Render
- [ ] Application rebuildée après modification de `environment.prod.ts`
- [ ] `dist/neopro/browser/` uploadé sur Apache
- [ ] `.htaccess` présent sur Apache
- [ ] Console `/tv` : "Connecting to socket server: https://..."
- [ ] Console `/remote` : "Connecting to socket server: https://..."
- [ ] Pas d'erreur CORS dans la console
- [ ] Logs Render : "Client connecté"

---

## 🆘 Si rien ne fonctionne

Envoyez-moi :
1. L'URL de votre serveur Render
2. Le contenu de `src/environments/environment.prod.ts`
3. Les messages dans la console (F12) sur `/tv` et `/remote`
4. Les dernières lignes des logs Render
