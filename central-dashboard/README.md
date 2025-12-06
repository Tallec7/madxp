# NEOPRO Central Dashboard

Dashboard web Angular pour la gestion centralisée de la flotte de boîtiers Raspberry Pi NEOPRO.

## Fonctionnalités

### Implémentées

- **Authentification JWT** avec guards et interceptors
- **Services API** pour tous les endpoints du serveur central
- **WebSocket temps réel** pour recevoir les événements des agents
- **Gestion des sites** (CRUD, filtres, statuts, métriques, commandes à distance)
- **Gestion des groupes** (sport, géographie, version, custom)
- **Commandes à distance** (restart service, reboot, logs, infos système)
- **Gestion du contenu** (vidéos, déploiement)
- **Gestion des mises à jour** (packages, déploiement)
- **Architecture modulaire** avec lazy loading
- **Responsive design** avec SCSS

### Composants UI

| Composant | Status | Description |
|-----------|--------|-------------|
| Login Component | Implémenté | Formulaire email/password avec JWT |
| Layout Component | Implémenté | Navigation sidebar + header |
| Dashboard Component | Implémenté | Vue d'ensemble du parc avec stats |
| Sites List Component | Implémenté | Liste, filtres, création, édition, suppression |
| Site Detail Component | Implémenté | Métriques, commandes, logs, infos système |
| Groups List Component | Implémenté | Liste des groupes avec création/édition |
| Group Detail Component | Implémenté | Sites membres, actions groupées |
| Content Management | Implémenté | Gestion et déploiement de vidéos |
| Updates Management | Implémenté | Gestion des mises à jour logicielles |

## Structure du projet

```
central-dashboard/
├── src/
│   ├── app/
│   │   ├── core/                    # Services core, guards, interceptors
│   │   │   ├── services/
│   │   │   │   ├── api.service.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── socket.service.ts
│   │   │   │   ├── sites.service.ts
│   │   │   │   └── groups.service.ts
│   │   │   ├── guards/
│   │   │   │   └── auth.guard.ts
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts
│   │   │   └── models/
│   │   │       └── index.ts
│   │   │
│   │   ├── features/                # Composants des fonctionnalités
│   │   │   ├── auth/
│   │   │   │   └── login.component.ts
│   │   │   ├── layout/
│   │   │   │   └── layout.component.ts
│   │   │   ├── dashboard/
│   │   │   │   └── dashboard.component.ts
│   │   │   ├── sites/
│   │   │   │   ├── sites-list.component.ts
│   │   │   │   └── site-detail.component.ts
│   │   │   ├── groups/
│   │   │   │   ├── groups-list.component.ts
│   │   │   │   └── group-detail.component.ts
│   │   │   ├── content/
│   │   │   │   └── content-management.component.ts
│   │   │   └── updates/
│   │   │       └── updates-management.component.ts
│   │   │
│   │   ├── app.component.ts
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   │
│   ├── environments/
│   │   ├── environment.ts           # Dev
│   │   └── environment.prod.ts      # Production
│   │
│   ├── main.ts
│   ├── index.html
│   └── styles.scss
│
├── angular.json
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

### Prérequis

- Node.js >= 18.0.0
- Angular CLI >= 17.0.0

```bash
npm install -g @angular/cli
```

### Installation locale

```bash
cd central-dashboard
npm install
```

### Configuration

**Development** (`src/environments/environment.ts`) :
- API: `http://localhost:3001/api`
- Socket: `http://localhost:3001`

**Production** (`src/environments/environment.prod.ts`) :
- API: `https://neopro-central-server.onrender.com/api`
- Socket: `https://neopro-central-server.onrender.com`

### Lancement en développement

```bash
npm start
# ou
ng serve
```

Dashboard disponible sur : `http://localhost:4200`

### Build production

```bash
npm run build:prod
```

Les fichiers sont générés dans `/dist/neopro-dashboard`

## API Services

### Sites Service

```typescript
// Lister les sites
sitesService.loadSites({ status: 'online' }).subscribe();

// Créer un site
sitesService.createSite({ site_name: 'Site A', club_name: 'Club A', ... });

// Mettre à jour un site
sitesService.updateSite(id, { club_name: 'Nouveau nom' });

// Supprimer un site
sitesService.deleteSite(id);

// Commandes à distance
sitesService.restartService(id, 'neopro-app');
sitesService.rebootSite(id);
sitesService.getLogs(id, 200);
sitesService.getSystemInfo(id);
```

### Groups Service

```typescript
// Lister les groupes
groupsService.loadGroups();

// Créer un groupe
groupsService.createGroup({
  name: 'Clubs Bretagne',
  type: 'geography',
  site_ids: ['uuid1', 'uuid2']
});

// Commandes groupées
groupsService.restartAllServices(groupId);
groupsService.rebootAllSites(groupId);
```

### WebSocket (temps réel)

```typescript
socketService.events$.subscribe(event => {
  switch (event.type) {
    case 'command_completed':
      console.log('Commande terminée:', event.data);
      break;
    case 'site_status_changed':
      sitesService.updateSiteStatus(event.data.siteId, event.data.status);
      break;
  }
});
```

## UI Framework

Le projet utilise **SCSS natif** avec des variables CSS pour le thème.

### Palette de couleurs

```scss
--primary-color: #2563eb    (Bleu)
--success-color: #10b981    (Vert)
--warning-color: #f59e0b    (Orange)
--danger-color: #ef4444     (Rouge)
--secondary-color: #64748b  (Gris)
```

### Classes utilitaires

```html
<!-- Cartes -->
<div class="card">Contenu</div>

<!-- Boutons -->
<button class="btn btn-primary">Action</button>
<button class="btn btn-danger">Supprimer</button>

<!-- Badges -->
<span class="badge badge-success">Online</span>
<span class="badge badge-danger">Offline</span>
```

## Authentification & Autorisation

### Guards

- **authGuard** : Vérifie si l'utilisateur est connecté
- **roleGuard** : Vérifie les rôles requis

### Rôles

- **admin** : Accès complet (CRUD sites, déploiements, MAJ)
- **operator** : Déploiements et modifications
- **viewer** : Lecture seule

## Déploiement sur Render

```yaml
# render.yaml
services:
  - type: web
    name: neopro-dashboard
    env: static
    buildCommand: npm install && npm run build:prod
    staticPublishPath: dist/neopro-dashboard
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: NODE_VERSION
        value: 18
```

**Coût :** Gratuit (plan Static Site)

## Scripts disponibles

```bash
npm start              # Dev server (port 4200)
npm run build          # Build development
npm run build:prod     # Build production
npm test               # Tests unitaires
npm run lint           # Linter
```

## Bibliothèques tierces

- **Chart.js** (`chart.js`, `ng2-charts`) : Graphiques
- **Leaflet** (`leaflet`, `@types/leaflet`) : Cartes
- **Socket.IO Client** (`socket.io-client`) : WebSocket

---

**Version :** 1.0.0
**Framework :** Angular 17 Standalone Components
**Build :** Production-ready
**Hébergement :** Render.com (Static Site - Gratuit)
