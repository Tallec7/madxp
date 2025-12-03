# 🆕 Nouvelle Fonctionnalité NEOPRO

## 🔐 Authentification Globale

### Description
Toute personne accédant à `neopro.kalonpartners.bzh` doit maintenant s'authentifier avec un mot de passe avant d'accéder à l'application.

### Mot de passe
```
GG_NEO_25k!
```

### Fonctionnement
- **Page de connexion** : Tous les utilisateurs sont redirigés vers `/login` s'ils ne sont pas authentifiés
- **Session de 8 heures** : Une fois connecté, l'utilisateur reste authentifié pendant 8 heures
- **Stockage local** : Le token d'authentification est stocké dans le `localStorage` du navigateur
- **Vérification automatique** : La session est vérifiée toutes les minutes pour déconnecter automatiquement si expirée
- **Protection de toutes les routes** : `/tv` et `/remote` sont protégées par le guard d'authentification

### Fichiers créés
- `src/app/services/auth.service.ts` - Service d'authentification
- `src/app/guards/auth.guard.ts` - Guard pour protéger les routes
- `src/app/components/login/login.component.ts` - Composant de connexion
- `src/app/components/login/login.component.html` - Template de connexion
- `src/app/components/login/login.component.scss` - Styles de connexion

### Interface de connexion

L'interface de connexion présente un design moderne et professionnel :

- **Couleurs** : Gradient violet (#667eea → #764ba2)
- **Animations** :
  - Apparition fluide de la carte (slideUp)
  - Secousse en cas d'erreur (shake)
  - Spinner lors de la connexion
- **États** :
  - Focus sur le champ avec bordure bleue
  - Message d'erreur en rouge
  - Bouton désactivé si champ vide ou en cours de chargement
- **Responsive** : Adapté mobile (< 480px)

### Sécurité

⚠️ **Important** : Le mot de passe est actuellement hardcodé dans le code. Pour une sécurité renforcée en production, il faudrait :
- Utiliser un backend pour vérifier les credentials
- Hacher le mot de passe côté serveur
- Utiliser JWT ou OAuth pour l'authentification
- Implémenter une limitation des tentatives de connexion (brute force protection)

---

## 🚀 Déploiement

### Build
```bash
npm run build
```

### Fichiers à déployer
Les fichiers buildés se trouvent dans `dist/neopro/` :
- `index.html`
- `main-*.js`
- `styles-*.css`
- `polyfills-*.js`

### Configuration Apache
Aucun changement nécessaire dans la configuration Apache. Le routage Angular gère la nouvelle route `/login`.

---

## 🧪 Tests

### Test 1 : Accès sans authentification
1. Ouvrir un navigateur en navigation privée
2. Accéder à `http://localhost:4200/tv`
3. **Résultat attendu** : Redirection automatique vers `/login`

### Test 2 : Login réussi
1. Sur la page `/login`, entrer le mot de passe : `GG_NEO_25k!`
2. Cliquer sur "Se connecter"
3. **Résultat attendu** : Redirection vers `/tv` et accès à l'application

### Test 3 : Login échoué
1. Sur la page `/login`, entrer un mauvais mot de passe
2. Cliquer sur "Se connecter"
3. **Résultat attendu** : Message d'erreur "Mot de passe incorrect" avec animation

### Test 4 : Persistance de session
1. Se connecter avec le bon mot de passe
2. Rafraîchir la page (F5)
3. **Résultat attendu** : Toujours authentifié, pas de redirection vers login

### Test 5 : Expiration de session
1. Attendre 8 heures OU modifier manuellement le localStorage
2. **Résultat attendu** : Déconnexion automatique et redirection vers `/login`

---

## 📝 Notes de développement

### Architecture
- **AuthService** : Gère l'authentification, la session et la vérification périodique
- **AuthGuard** : Protège les routes en vérifiant l'état d'authentification
- **LoginComponent** : Interface utilisateur pour la connexion

### TypeScript
- Utilisation de `BehaviorSubject` pour l'état réactif
- Observable `isAuthenticated$` pour suivre les changements d'état
- Vérification périodique toutes les 60 secondes

### Sécurité actuelle
- Mot de passe en clair dans le code (à améliorer pour production)
- Session stockée en localStorage (vulnérable XSS)
- Pas de limitation de tentatives (vulnérable brute force)

### Améliorations futures recommandées
1. **Backend d'authentification** avec API REST
2. **JWT tokens** avec refresh token
3. **Rate limiting** sur les tentatives de connexion
4. **HTTPS obligatoire** en production
5. **Session côté serveur** au lieu de localStorage uniquement
6. **2FA (authentification à deux facteurs)** optionnelle

---

## 🎯 Prochaines étapes recommandées

1. **Tester en local** avec `npm start`
2. **Valider les 5 tests** ci-dessus
3. **Builder pour production** avec `npm run build`
4. **Déployer sur Apache** (neopro.kalonpartners.bzh)
5. **Communiquer le mot de passe** aux utilisateurs autorisés
6. **Planifier** les améliorations de sécurité futures

---

## ❓ Support

Pour toute question ou problème :
1. Vérifier les logs de la console navigateur (F12)
2. Vérifier que le mot de passe est exact : `GG_NEO_25k!`
3. Effacer le localStorage si problème : `localStorage.clear()`
4. Tester en navigation privée pour éliminer les problèmes de cache

---

**Date de création** : 3 décembre 2025
**Version NEOPRO** : 2.0.0 (avec authentification globale)
