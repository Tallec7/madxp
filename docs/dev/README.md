# Documentation Développement

Ce dossier contient la documentation destinée aux développeurs du projet.

## 📂 Contenu

### Guides de développement

- Architecture du code
- Conventions de nommage
- Patterns utilisés
- Tests

### Spécifications techniques

- API endpoints détaillés
- Schémas de base de données
- Protocoles WebSocket
- Flows d'authentification

---

## 🔧 Configuration développement

### Prérequis

- Node.js 20+
- Angular CLI 20.3.3
- PostgreSQL (via Supabase)

### Installation

```bash
# Cloner le repo
git clone <repo-url>
cd neopro

# Copier la configuration
cp .env.example .env

# Éditer avec vos valeurs Supabase
nano .env

# Installer les dépendances
npm install

# Lancer en développement
./dev-local.sh
```

### Ports de développement

| Service          | Port | URL                   |
| ---------------- | ---- | --------------------- |
| Angular (webapp) | 4200 | http://localhost:4200 |
| Dashboard        | 4300 | http://localhost:4300 |
| Socket Server    | 3000 | http://localhost:3000 |
| Central Server   | 3001 | http://localhost:3001 |
| Admin Interface  | 8080 | http://localhost:8080 |

---

## 📋 Conventions

### Commits

Format : `type(scope): description`

Types :

- `feat` : Nouvelle fonctionnalité
- `fix` : Correction de bug
- `docs` : Documentation
- `refactor` : Refactoring
- `test` : Tests
- `chore` : Maintenance

Exemples :

```
feat(auth): add JWT refresh token
fix(sync-agent): handle connection timeout
docs(readme): update installation steps
```

### Branches

- `main` : Production
- `develop` : Développement
- `feature/*` : Nouvelles fonctionnalités
- `fix/*` : Corrections

---

## 🧪 Tests

```bash
# Tests unitaires Angular
npm test

# Tests central-server
cd central-server && npm test

# Lint
npm run lint
```

---

## 📚 Ressources

- [Angular Documentation](https://angular.io/docs)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [Render.com Documentation](https://render.com/docs)

---

---

## 🎨 Structure CSS/SCSS

### Variables globales (remote.component.scss)

Le fichier `remote.component.scss` utilise un système de variables SCSS pour une maintenance simplifiée :

```scss
// Couleurs principales
$primary: #667eea;
$success: #10b981;
$danger: #dc2626;
$pink: #ec4899;
$purple: #a855f7;
$blue: #3b82f6;

// Échelle de gris
$gray-50 à $gray-900

// Dark mode
$dark-bg: #1f2937;
$dark-bg-alt: #374151;
$dark-border: #4b5563;
```

### Mixins réutilisables

```scss
@mixin flex-center // display: flex + center
  @mixin card-base // styles de base carte
  @mixin card-hover // effet hover carte
  @mixin gradient($from, $to) // gradient 135deg
  @mixin icon-size($size); // width + height
```

### Budgets Angular

Configuration des budgets CSS par environnement dans `angular.json` :

| Configuration | Warning | Error |
| ------------- | ------- | ----- |
| production    | 16kB    | 20kB  |
| raspberry     | 48kB    | 64kB  |
| demo          | 48kB    | 64kB  |

---

**Dernière mise à jour :** 3 janvier 2026
