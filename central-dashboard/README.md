# NEOPRO Central Dashboard

Dashboard web Angular pour la gestion centralisée de la flotte de boîtiers Raspberry Pi NEOPRO.

## 🚀 Quick Start

### Installation locale

```bash
cd central-dashboard
npm install
npm start
```

Dashboard disponible sur : `http://localhost:4300`

### Build production

```bash
npm run build:prod
```

---

## 📂 Structure

```
central-dashboard/
├── src/
│   ├── app/
│   │   ├── core/                    # Services, guards, interceptors
│   │   │   ├── services/
│   │   │   │   ├── api.service.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── socket.service.ts
│   │   │   │   ├── sites.service.ts
│   │   │   │   └── groups.service.ts
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   └── models/
│   │   │
│   │   ├── features/                # Composants UI
│   │   │   ├── auth/               # Login
│   │   │   ├── layout/             # Navigation
│   │   │   ├── dashboard/          # Vue d'ensemble
│   │   │   ├── sites/              # Gestion sites
│   │   │   ├── groups/             # Gestion groupes
│   │   │   ├── content/            # Gestion vidéos
│   │   │   └── updates/            # Mises à jour
│   │   │
│   │   ├── app.component.ts
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   │
│   ├── environments/
│   ├── assets/
│   ├── fonts/
│   └── styles.scss
│
├── angular.json
├── package.json
└── tsconfig.json
```

---

## ✅ Fonctionnalités

| Composant | Description |
|-----------|-------------|
| Login | Authentification JWT |
| Layout | Navigation sidebar + header |
| Dashboard | Vue d'ensemble du parc avec stats |
| Sites List | Liste, filtres, création, édition |
| Site Detail | Métriques, commandes, logs |
| Groups List | Gestion des groupes |
| Group Detail | Actions groupées |
| Content | Gestion et déploiement vidéos (upload multiple, drag & drop) |
| Updates | Mises à jour logicielles |

### Gestion du Contenu (Content)

- **Upload multiple** : jusqu'à 20 fichiers vidéo à la fois
- **Drag & Drop** : glisser-déposer des fichiers dans la zone d'upload
- Liste des fichiers sélectionnés avec possibilité de retirer individuellement
- Affichage des résultats détaillés (succès/erreurs)
- Déploiement vers sites individuels ou groupes

---

## ⚙️ Configuration

### Development (`src/environments/environment.ts`)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api',
  socketUrl: 'http://localhost:3001'
};
```

### Production (`src/environments/environment.prod.ts`)
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://neopro-central.onrender.com/api',
  socketUrl: 'https://neopro-central.onrender.com'
};
```

---

## 🎨 UI Framework

SCSS natif avec variables CSS :

```scss
--primary-color: #2563eb    // Bleu
--success-color: #10b981    // Vert
--warning-color: #f59e0b    // Orange
--danger-color: #ef4444     // Rouge
```

### Classes utilitaires

```html
<div class="card">Contenu</div>
<button class="btn btn-primary">Action</button>
<span class="badge badge-success">Online</span>
```

---

## 🔐 Authentification

### Rôles

| Rôle | Permissions |
|------|-------------|
| admin | Accès complet |
| operator | Déploiements, modifications |
| viewer | Lecture seule |

---

## 🚀 Déploiement

Le déploiement est configuré via `render.yaml` à la racine du projet.

**Hébergement :** Render.com (Static Site - Gratuit)

---

## 🛠️ Scripts disponibles

```bash
npm start              # Dev server (port 4300)
npm run build          # Build development
npm run build:prod     # Build production
npm test               # Tests unitaires
npm run lint           # Linter
```

---

## 📦 Dépendances principales

- **Angular 17** - Framework
- **Chart.js / ng2-charts** - Graphiques
- **Leaflet** - Cartes
- **Socket.IO Client** - WebSocket temps réel

---

**Version :** 1.1.0
**Framework :** Angular 17 Standalone Components
**Dernière mise à jour :** 10 décembre 2025
