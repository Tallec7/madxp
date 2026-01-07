# NEOPRO Central Dashboard

Dashboard web Angular 20 pour la gestion centralisée de la flotte de boîtiers Raspberry Pi NEOPRO.

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
│   │   │   │   ├── logger.service.ts    # Logs structurés + correlation
│   │   │   │   └── groups.service.ts
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   │   └── error.interceptor.ts # HTTP retry + correlation ID
│   │   │   ├── handlers/
│   │   │   │   └── global-error.handler.ts
│   │   │   ├── utils/
│   │   │   │   └── error-extractor.ts
│   │   │   └── models/
│   │   │
│   │   ├── features/                # Composants UI
│   │   │   ├── auth/               # Login
│   │   │   ├── layout/             # Navigation
│   │   │   ├── dashboard/          # Vue d'ensemble
│   │   │   ├── sites/              # Gestion sites ⚡ Refactoré
│   │   │   │   ├── site-detail.component.ts    # Page avec 4 tabs
│   │   │   │   ├── config-editor/              # Éditeur config JSON
│   │   │   │   └── components/                 # Composants modulaires
│   │   │   │       ├── site-content-tab/       # Onglet Contenu
│   │   │   │       ├── site-settings-tab/      # Onglet Paramètres
│   │   │   │       ├── site-debug-tab/         # Onglet Debug
│   │   │   │       └── remote-preview/         # Simulation télécommande
│   │   │   ├── groups/             # Gestion groupes
│   │   │   ├── content/            # Gestion vidéos
│   │   │   ├── analytics/          # Analytics clubs
│   │   │   ├── updates/            # Mises à jour
│   │   │   ├── sponsor-portal/     # Portail sponsors
│   │   │   ├── agency-portal/      # Portail agences
│   │   │   └── admin/              # Administration (agences)
│   │   │
│   │   ├── shared/                  # Composants partagés
│   │   │   └── components/
│   │   │       ├── video-selector/  # Sélecteur de vidéos
│   │   │       └── remote-preview/  # Preview télécommande
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

| Composant             | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| Login                 | Authentification JWT                                         |
| Layout                | Navigation sidebar + header                                  |
| Dashboard             | Vue d'ensemble du parc avec stats                            |
| Sites List            | Liste, filtres, création, édition                            |
| **Site Detail**       | Page refactorisée avec 4 tabs (voir ci-dessous)              |
| Groups List           | Gestion des groupes                                          |
| Group Detail          | Actions groupées                                             |
| Content               | Gestion et déploiement vidéos (upload multiple, drag & drop) |
| Updates               | Mises à jour logicielles                                     |
| **Advertiser Portal** | Dashboard dédié annonceurs (vidéos, sites, stats)            |
| **Agency Portal**     | Dashboard dédié agences (clubs gérés, alertes)               |
| **Admin Agencies**    | Gestion des agences partenaires (CRUD)                       |

### Site Detail - Nouvelle Architecture (Janvier 2026)

La page de détail d'un site est organisée en **4 onglets** :

| Onglet         | Composant                  | Fonctionnalités                                  |
| -------------- | -------------------------- | ------------------------------------------------ |
| **État**       | `site-detail.component.ts` | Métriques, connexion, alertes                    |
| **Contenu**    | `SiteContentTabComponent`  | Boucles par phase, catégories, mapping analytics |
| **Paramètres** | `SiteSettingsTabComponent` | Config réseau, hotspot                           |
| **Debug**      | `SiteDebugTabComponent`    | Logs, commandes, diagnostics                     |

#### Boucles par Phase

Chaque phase de match peut avoir **N vidéos** en boucle :

- 🔄 **Boucle par défaut** (neutral) - Hors match
- 🏁 **Avant-match** (before) - Accueil
- ▶️ **Match** (during) - Mi-temps, temps morts
- 🏆 **Après-match** (after) - Célébrations

#### Mapping Analytics

Permet de mapper les catégories locales vers des types standardisés :

- Si catégorie **sans** sous-catégories → mapping sur la catégorie
- Si catégorie **avec** sous-catégories → mapping sur chaque sous-catégorie

Types disponibles : `sponsor`, `jingle`, `ambiance`, `other`

#### RemotePreviewComponent

Simulation visuelle de la télécommande Pi avec :

- Mockup de téléphone
- Navigation entre vues (home, catégories, vidéos)
- Affichage des vidéos en boucle par phase
- Compteur de vidéos dans la boucle

### Gestion du Contenu (Content)

- **Upload multiple** : jusqu'à 20 fichiers vidéo à la fois
- **Drag & Drop** : glisser-déposer des fichiers dans la zone d'upload
- Liste des fichiers sélectionnés avec possibilité de retirer individuellement
- Affichage des résultats détaillés (succès/erreurs)
- Déploiement vers sites individuels ou groupes

### Mises à jour logicielles (Updates)

Interface complète de gestion des mises à jour logicielles pour les Raspberry Pi :

| Onglet                  | Fonctionnalité                                       |
| ----------------------- | ---------------------------------------------------- |
| **Mises à jour**        | Liste des versions disponibles avec notes de version |
| **Déployer**            | Assistant de déploiement (site ou groupe)            |
| **Historique**          | Suivi des déploiements avec progression temps réel   |
| **Versions installées** | Distribution des versions sur la flotte              |

- Upload de packages (.tar.gz, .zip)
- Marquage des versions critiques
- Rollback automatique en cas d'échec
- Progression temps réel via Socket.IO

---

## ⚙️ Configuration

### Development (`src/environments/environment.ts`)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api',
  socketUrl: 'http://localhost:3001',
};
```

### Production (`src/environments/environment.prod.ts`)

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://neopro-central-production.up.railway.app/api',
  socketUrl: 'https://neopro-central-production.up.railway.app',
};
```

---

## 🎨 UI Framework

SCSS natif avec variables CSS :

```scss
--primary-color: #2563eb // Bleu
  --success-color: #10b981 // Vert
  --warning-color: #f59e0b // Orange
  --danger-color: #ef4444; // Rouge
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

| Rôle           | Permissions                                       |
| -------------- | ------------------------------------------------- |
| super_admin    | Accès complet, gestion utilisateurs               |
| admin          | Accès complet                                     |
| operator       | Déploiements, modifications                       |
| viewer         | Lecture seule                                     |
| **advertiser** | Portail annonceur uniquement (ses contenus/stats) |
| **agency**     | Portail agence uniquement (ses clubs)             |

> Les rôles `advertiser` et `agency` ont un accès limité à leurs propres données via isolation JWT.

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

- **Angular 20** - Framework (Standalone Components)
- **Chart.js / ng2-charts** - Graphiques
- **Leaflet** - Cartes
- **Socket.IO Client** - WebSocket temps réel
- **ngx-translate** - Internationalisation (EN/FR/ES)

---

**Version :** 2.7.0
**Framework :** Angular 20 Standalone Components
**Dernière mise à jour :** 7 janvier 2026
