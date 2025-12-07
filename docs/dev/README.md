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

| Service | Port | URL |
|---------|------|-----|
| Angular (webapp) | 4200 | http://localhost:4200 |
| Dashboard | 4300 | http://localhost:4300 |
| Socket Server | 3000 | http://localhost:3000 |
| Central Server | 3001 | http://localhost:3001 |
| Admin Interface | 8080 | http://localhost:8080 |

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

**Dernière mise à jour :** 7 décembre 2025
