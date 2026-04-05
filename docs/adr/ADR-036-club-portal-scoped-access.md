# ADR-036: Club Portal — Acces scope par site

**Date** : 2026-04-05
**Statut** : Accepte
**Format** : Leger

---

## Contexte

Chaque club sportif (site) a besoin d'un acces au dashboard central pour gerer son propre contenu (videos, boucle, sponsors locaux) sans voir les donnees des autres clubs. Le systeme doit supporter des permissions granulaires controlees par les super_admin/operator.

## Decision

Ajout d'un role `club` dans le systeme d'authentification existant (meme page de login, JWT, cookie HttpOnly). Chaque utilisateur club est lie a un unique `site_id` via la table `users`. Les permissions granulaires sont stockees dans une table `club_permissions` (cle primaire: site_id + permission). Cote Angular, 4 routes `/club/*` avec `roleGuard` redirigent vers des composants wrapper qui reutilisent les tabs existants (`site-content-tab`, `site-sponsors-tab`) en passant le `siteId` du JWT.

## Alternatives rejetees

- **Systeme d'auth separe (login page distincte)** : rejete car doublon de code, maintenance double, confusion UX
- **Role `viewer` avec filtre dynamique** : rejete car pas de granularite suffisante (viewer voit tout), semantique differente
- **Portail externe (app separee)** : rejete car les composants Angular existants couvrent deja les besoins

## Consequences

- Les clubs peuvent gerer leur contenu en autonomie sans solliciter l'operateur Neopro
- Les super_admin controlent finement ce que chaque club voit/fait via 6 permissions toggleables
- Le middleware `requireClubScope` garantit l'isolation des donnees au niveau API
- Migration DB necessaire (`add-club-role-and-permissions.sql`) avant deploiement

## Fichiers impactes

### Backend

- `central-server/src/types/index.ts` — ajout 'club' a UserRole, site_id a User
- `central-server/src/types/express.d.ts` — sync UserRole + site_id AuthenticatedUser
- `central-server/src/middleware/auth.ts` — middlewares requireClubScope, requireClubPermission
- `central-server/src/repositories/user.repository.ts` — site_id dans CRUD + LEFT JOIN sites
- `central-server/src/repositories/club-permission.repository.ts` — nouveau repository
- `central-server/src/routes/club-permissions.routes.ts` — GET/PUT permissions par site
- `central-server/src/controllers/auth.controller.ts` — site_id dans JWT payload
- `central-server/src/controllers/users.controller.ts` — validation site_id pour role club

### Frontend

- `central-dashboard/src/app/core/models/index.ts` — ajout 'club' a UserRole
- `central-dashboard/src/app/features/auth/login.component.ts` — redirect role-based
- `central-dashboard/src/app/features/layout/layout.component.ts` — nav club
- `central-dashboard/src/app/app.routes.ts` — 4 routes /club/\*
- `central-dashboard/src/app/features/club-portal/` — 4 composants (dashboard, content, loop, sponsors)
- `central-dashboard/src/app/features/sites/components/club-access-tab/` — admin permissions UI

### Migration

- `central-server/src/scripts/migrations/add-club-role-and-permissions.sql`
