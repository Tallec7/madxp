# Corrections Admin Panel HTTP - 26 Décembre 2025

## Contexte

Suite au déploiement d'un nouveau Raspberry Pi accessible en HTTP sur le réseau local (`neopro.local:8080`), plusieurs problèmes ont été identifiés et corrigés.

---

## Problèmes Corrigés

### 1. Erreurs 401 Unauthorized sur toutes les requêtes API

**Symptôme:** Après connexion au panel admin, toutes les requêtes API retournaient 401.

**Cause:** Le fetch interceptor ne gérait que les URLs relatives (`/api/...`) mais pas les URLs absolues (`http://.../api/...`).

**Correction:** `raspberry/admin/public/app.js`

```javascript
// Avant
if (url.startsWith('/api/')) { ... }

// Après
if (url.startsWith('/api/') || url.includes('/api/')) { ... }
```

---

### 2. Cookie d'authentification non stocké en HTTP

**Symptôme:** Le cookie `admin_session` n'était pas stocké par le navigateur.

**Cause:** Le flag `Secure` était défini sur `true` basé sur `NODE_ENV` au lieu de la connexion réelle. Les cookies `Secure` ne peuvent être envoyés qu'en HTTPS.

**Correction:** `raspberry/admin/admin-server.js`

```javascript
// Avant
secure: process.env.NODE_ENV === 'production'

// Après
const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
res.cookie('admin_session', token, {
  httpOnly: true,
  secure: isSecure,  // Dynamique selon connexion réelle
  sameSite: 'lax',
  ...
});
```

---

### 3. Thumbnails retournant 404

**Symptôme:** Les miniatures vidéo affichaient des erreurs 404.

**Cause:** Le répertoire `/thumbnails` n'était pas servi comme fichiers statiques.

**Correction:** `raspberry/admin/admin-server.js`

```javascript
// Ajouté
app.use('/thumbnails', express.static(THUMBNAILS_DIR));
```

---

### 4. Pas de redirection vers /login en cas de session expirée

**Symptôme:** Les utilisateurs avec session expirée voyaient des erreurs mais n'étaient pas redirigés.

**Correction:** `raspberry/admin/public/app.js`

```javascript
// Si une requête API retourne 401, rediriger vers login
if (response.status === 401 && ...) {
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}
```

---

### 5. Warnings d'accessibilité aria-hidden

**Symptôme:** Console affichait des warnings sur des éléments focusables à l'intérieur de conteneurs `aria-hidden="true"`.

**Cause:** Attributs `aria-hidden="true"` statiques sur les tab panels et modals.

**Correction:** `raspberry/admin/public/index.html`

- Suppression des `aria-hidden="true"` statiques des tab panels
- Suppression des `aria-hidden="true"` des modals

---

### 6. Manifest.webmanifest avec icônes manquantes

**Symptôme:** Erreurs console sur des icônes PNG/SVG inexistantes.

**Correction:** `raspberry/admin/public/manifest.webmanifest`

- Suppression des références aux icônes manquantes
- Conservation uniquement de `/favicon.ico`
- Mise à jour du nom en "Neopro Admin"

---

## Fichiers Modifiés

| Fichier                                       | Modifications                              |
| --------------------------------------------- | ------------------------------------------ |
| `raspberry/admin/admin-server.js`             | Cookie Secure dynamique, static thumbnails |
| `raspberry/admin/public/app.js`               | Fetch interceptor URLs, redirect 401       |
| `raspberry/admin/public/index.html`           | Suppression aria-hidden statiques          |
| `raspberry/admin/public/manifest.webmanifest` | Icônes corrigées, nom mis à jour           |

---

## Commits

```
ef116ae fix(admin): Fix authentication cookie and fetch credentials for HTTP
ed1acbe fix(admin): Serve thumbnails directory as static files
50ebbba fix(admin): Add 401 redirect to login and fix aria-hidden warnings
```

---

## Impact

Ces corrections assurent que le panel admin `:8080` fonctionne correctement sur les nouveaux déploiements Raspberry Pi accessibles en HTTP sur le réseau local.

---

## Déploiement

Pour appliquer ces corrections sur un Pi existant :

```bash
# Depuis la machine de développement
npm run deploy:raspberry neopro.local

# Ou manuellement sur le Pi
sudo systemctl restart neopro-admin
```

---

**Auteur:** Claude (Anthropic)
**Date:** 26 décembre 2025
