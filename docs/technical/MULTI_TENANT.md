# Architecture Multi-tenant NeoPro

## Vue d'ensemble

NeoPro supporte une architecture multi-tenant permettant à différents types d'utilisateurs d'accéder à des portails dédiés avec des permissions adaptées.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CENTRAL DASHBOARD                             │
│                    (dashboard.neopro.fr)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ADMIN PANEL  │  │SPONSOR PORTAL│  │ AGENCY PORTAL│          │
│  │ /dashboard   │  │/sponsor-portal│ │/agency-portal│          │
│  │ /sites       │  │              │  │              │          │
│  │ /sponsors    │  │              │  │              │          │
│  │ /analytics   │  │              │  │              │          │
│  │ /admin/*     │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│        │                  │                  │                  │
│        ▼                  ▼                  ▼                  │
│  super_admin         sponsor            agency                  │
│  admin               (+ admin)          (+ admin)               │
│  operator                                                       │
│  viewer                                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RASPBERRY LOCAL                               │
│                    (neopro.local:8080)                           │
├─────────────────────────────────────────────────────────────────┤
│  Accès local uniquement - Gestion du contenu du club            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rôles Utilisateurs

### Hiérarchie des rôles

| Rôle | Description | Accès |
|------|-------------|-------|
| `super_admin` | Administrateur NeoPro | Accès complet |
| `admin` | Administrateur | Gestion sites, sponsors, agences |
| `operator` | Opérateur | Gestion contenu, analytics |
| `viewer` | Lecture seule | Consultation uniquement |
| `sponsor` | Sponsor/Annonceur | Portail sponsor uniquement |
| `agency` | Agence partenaire | Portail agence uniquement |

### Définition TypeScript

```typescript
// central-server/src/types/index.ts
export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'sponsor' | 'agency';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  sponsor_id: string | null;  // Pour les utilisateurs sponsor
  agency_id: string | null;   // Pour les utilisateurs agence
  // ...
}
```

---

## Portail Sponsor (`/sponsor-portal`)

### Description

Interface dédiée aux sponsors/annonceurs qui paient pour diffuser leurs contenus dans les clubs NeoPro.

### Fonctionnalités

- **Dashboard** : KPIs personnalisés (impressions, sites actifs, vidéos)
- **Mes vidéos** : Liste des contenus déployés avec statut
- **Sites de diffusion** : Clubs où les vidéos sont diffusées
- **Statistiques** : Graphiques de tendance des impressions

### Routes Angular

```typescript
// /sponsor-portal
{
  path: 'sponsor-portal',
  canActivate: [roleGuard],
  data: { roles: ['sponsor', 'admin', 'super_admin'] },
  loadComponent: () => import('./features/sponsor-portal/sponsor-dashboard.component')
}
```

### API Backend

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sponsor/dashboard` | Dashboard avec stats |
| GET | `/api/sponsor/sites` | Sites de diffusion |
| GET | `/api/sponsor/videos` | Vidéos du sponsor |
| GET | `/api/sponsor/stats` | Statistiques détaillées |

### Sécurité

Le middleware `requireSponsorAccess` vérifie que :
1. L'utilisateur a le rôle `sponsor` ou est admin
2. Le `sponsor_id` du JWT correspond à la ressource demandée

```typescript
// Middleware de vérification
export const requireSponsorAccess = (getSponsorIdFromRequest) => {
  return async (req, res, next) => {
    const user = req.user;

    // Admins ont accès à tout
    if (isAdmin(user.role)) return next();

    // Sponsors accèdent uniquement à leurs données
    if (user.role === 'sponsor') {
      const requestedSponsorId = getSponsorIdFromRequest(req);
      if (user.sponsor_id === requestedSponsorId) return next();
    }

    return res.status(403).json({ error: 'Accès non autorisé' });
  };
};
```

---

## Portail Agence (`/agency-portal`)

### Description

Interface pour les agences qui gèrent plusieurs clubs sportifs pour le compte de NeoPro.

### Fonctionnalités

- **Dashboard** : Vue d'ensemble des clubs gérés
- **Mes clubs** : Liste avec statut (online/offline/alerte)
- **Alertes** : Notifications de problèmes sur les clubs
- **Statistiques agrégées** : Données consolidées

### Routes Angular

```typescript
// /agency-portal - Portail agence
{
  path: 'agency-portal',
  canActivate: [roleGuard],
  data: { roles: ['agency', 'admin', 'super_admin'] },
  loadComponent: () => import('./features/agency-portal/agency-dashboard.component')
}

// /admin/agencies - Gestion des agences (admins uniquement)
{
  path: 'admin/agencies',
  canActivate: [roleGuard],
  data: { roles: ['admin', 'super_admin'] },
  loadComponent: () => import('./features/admin/agencies/agencies-management.component')
}
```

### API Backend

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/agencies` | Liste des agences (admin) |
| POST | `/api/agencies` | Créer une agence |
| PUT | `/api/agencies/:id` | Modifier une agence |
| DELETE | `/api/agencies/:id` | Supprimer une agence |
| GET | `/api/agencies/portal/dashboard` | Dashboard agence |
| GET | `/api/agencies/portal/sites` | Sites gérés par l'agence |
| GET | `/api/agencies/portal/sites/:id` | Détail d'un site |
| GET | `/api/agencies/portal/stats` | Statistiques agrégées |

### Schéma Base de Données

```sql
-- Table des agences
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Association agence-sites
CREATE TABLE agency_sites (
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (agency_id, site_id)
);

-- Utilisateur agence
ALTER TABLE users ADD COLUMN agency_id UUID REFERENCES agencies(id);
```

---

## Administration des Agences (`/admin/agencies`)

### Description

Interface pour les administrateurs NeoPro permettant de gérer les agences partenaires.

### Fonctionnalités

- **Liste des agences** : Tableau avec nom, contact, nombre de sites, statut
- **Créer une agence** : Formulaire de création
- **Modifier une agence** : Édition des informations
- **Supprimer une agence** : Avec confirmation
- **Gérer les sites** : Assigner/retirer des sites à une agence

---

## Authentification et JWT

### Structure du Token

```typescript
interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  sponsor_id: string | null;
  agency_id: string | null;
  iat: number;
  exp: number;
}
```

### Génération du Token

```typescript
// auth.controller.ts
const token = generateToken({
  id: user.id,
  email: user.email,
  role: user.role,
  sponsor_id: user.sponsor_id,
  agency_id: user.agency_id,
});
```

---

## Guards Angular

### RoleGuard

```typescript
// auth.guard.ts
export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles = route.data['roles'] as string[];
  const userRole = authService.getUserRole();

  if (requiredRoles.includes(userRole)) {
    return true;
  }

  router.navigate(['/forbidden']);
  return false;
};
```

---

## Isolation des Données

### Row-Level Security (RLS)

Les données sont isolées au niveau PostgreSQL via RLS :

```sql
-- Vue pour les sites accessibles par un sponsor
CREATE VIEW sponsor_accessible_sites AS
SELECT s.* FROM sites s
JOIN sponsor_sites ss ON s.id = ss.site_id
WHERE ss.sponsor_id = current_setting('app.current_sponsor_id')::uuid;

-- Vue pour les sites accessibles par une agence
CREATE VIEW agency_accessible_sites AS
SELECT s.* FROM sites s
JOIN agency_sites ags ON s.id = ags.site_id
WHERE ags.agency_id = current_setting('app.current_agency_id')::uuid;
```

---

## Services Angular

### SponsorPortalService

```typescript
@Injectable({ providedIn: 'root' })
export class SponsorPortalService {
  getDashboard(): Observable<SponsorDashboard>;
  getSites(): Observable<SponsorSite[]>;
  getVideos(): Observable<SponsorVideo[]>;
  getStats(period?: string): Observable<SponsorStats>;
}
```

### AgencyPortalService

```typescript
@Injectable({ providedIn: 'root' })
export class AgencyPortalService {
  // Portail agence
  getDashboard(): Observable<AgencyDashboard>;
  getSites(): Observable<AgencySite[]>;
  getSiteDetails(siteId: string): Observable<AgencySiteDetails>;
  getStats(): Observable<AgencyStats>;

  // Administration (admins uniquement)
  listAgencies(): Observable<Agency[]>;
  createAgency(data): Observable<Agency>;
  updateAgency(id, data): Observable<Agency>;
  deleteAgency(id): Observable<void>;
}
```

---

## Composants Angular

### Structure des fichiers

```
central-dashboard/src/app/features/
├── sponsor-portal/
│   └── sponsor-dashboard.component.ts    # Dashboard sponsor
├── agency-portal/
│   └── agency-dashboard.component.ts     # Dashboard agence
└── admin/
    └── agencies/
        └── agencies-management.component.ts  # Gestion agences
```

---

## Configuration Requise

### Variables d'environnement

Aucune variable supplémentaire requise. Les portails utilisent l'API centrale existante.

### Migration Base de Données

Exécuter la migration pour ajouter les tables et colonnes :

```bash
cd central-server
psql $DATABASE_URL < src/scripts/migrations/add-sponsor-agency-roles.sql
```

---

## Flux de Navigation

### Sponsor

```
Login → JWT avec sponsor_id
  ↓
Redirection automatique vers /sponsor-portal
  ↓
Dashboard sponsor (ses données uniquement)
```

### Agence

```
Login → JWT avec agency_id
  ↓
Redirection automatique vers /agency-portal
  ↓
Dashboard agence (ses clubs uniquement)
```

### Admin

```
Login → JWT avec role admin/super_admin
  ↓
Dashboard principal avec accès complet
  ↓
Peut accéder à /admin/agencies pour gérer les agences
```

---

**Version :** 1.0.0
**Dernière mise à jour :** 26 décembre 2025
