# Migration Sponsor → Advertiser (Annonceur)

Date: 2025-12-29

## Résumé

Migration sémantique complète de "Sponsor" vers "Advertiser" (Annonceur) pour une meilleure cohérence avec le modèle d'affaires réel :

- **Sponsor** = Partenariat long terme, soutien en échange de visibilité
- **Advertiser** (Annonceur) = Relation commerciale, achat d'espace publicitaire

NEOPRO vend des espaces publicitaires sur écrans → "Annonceur" est plus approprié.

## Changements

### 1. Base de Données (PostgreSQL)

**Tables renommées** :
| Ancien | Nouveau |
|--------|---------|
| `sponsors` | `advertisers` |
| `sponsor_videos` | `advertiser_videos` |
| `sponsor_impressions` | `advertiser_impressions` |
| `sponsor_daily_stats` | `advertiser_daily_stats` |
| `sponsor_sites` | `advertiser_sites` |

**Colonnes renommées** :
| Table | Ancien | Nouveau |
|-------|--------|---------|
| `users` | `sponsor_id` | `advertiser_id` |
| `advertiser_videos` | `sponsor_id` | `advertiser_id` |
| `advertiser_sites` | `sponsor_id` | `advertiser_id` |

**Rôle utilisateur** :

- `sponsor` → `advertiser` (migration automatique des utilisateurs existants)
- Nouveau rôle `superadmin` ajouté pour rétrocompatibilité

**Vues recréées** :

- `advertiser_accessible_sites`
- `advertiser_stats_summary`
- `advertiser_analytics_summary`
- `top_advertiser_videos`
- `advertiser_performance_by_site`

**Fonctions recréées** :

- `is_advertiser_contract_active()`
- `get_advertiser_active_sites()`
- `get_site_active_advertisers()`
- `calculate_advertiser_daily_stats()`
- `calculate_all_advertiser_daily_stats()`

### 2. Backend (central-server)

**Nouveaux controllers** :

- `src/controllers/advertiser-analytics.controller.ts`
- `src/controllers/advertiser-sites.controller.ts`
- `src/controllers/advertiser-portal.controller.ts`

**Nouvelles routes** :

- `src/routes/advertiser-analytics.routes.ts`
- `src/routes/advertiser-sites.routes.ts`
- `src/routes/advertiser-portal.routes.ts`

**Rétrocompatibilité API** :

- Routes `/api/sponsors/*` redirigent vers `/api/advertisers/*`
- Alias d'exports : `listSponsors = listAdvertisers`, etc.

**Types mis à jour** :

- `src/types/index.ts` : `Advertiser` type + `Sponsor` alias deprecated
- `src/types/express.d.ts` : `advertiser_id` dans `AuthenticatedUser`
- `src/middleware/auth.ts` : `ROLE_HIERARCHY` inclut `superadmin` et `advertiser`

### 3. Frontend (central-dashboard)

**Nouveau composant** :

- `src/app/features/advertisers/advertisers-list.component.ts`

**Routes mises à jour** (`app.routes.ts`) :

```typescript
// Nouvelles routes
{ path: 'advertisers', ... }
{ path: 'advertisers/:id', ... }
{ path: 'advertisers/:id/analytics', ... }
{ path: 'advertisers/:id/videos', ... }
{ path: 'advertiser-portal', ... }

// Redirections legacy
{ path: 'sponsors', redirectTo: 'advertisers' }
{ path: 'sponsor-portal', redirectTo: 'advertiser-portal' }
```

**Navigation** (`layout.component.ts`) :

- Menu "Annonceurs" au lieu de "Sponsors"
- Section "Portails" avec "Portail Annonceur" et "Portail Agence"

**i18n** :

- `fr.json` : `"advertisers": "Annonceurs"`
- `en.json` : `"advertisers": "Advertisers"`

### 4. Raspberry Pi

**Interface mise à jour** (`sponsor.interface.ts`) :

```typescript
export interface LoopVideo {
  advertiser_id?: string; // Nouveau
  sponsor_id?: string; // @deprecated
  analytics_category?: string;
}

export type Sponsor = LoopVideo; // @deprecated
export type AdvertiserVideo = LoopVideo; // Alias sémantique
```

**sync-agent** :

- Utilise toujours les mêmes endpoints (rétrocompatibilité assurée côté serveur)

## Fichiers de migration

- `central-server/src/scripts/migrations/rename-sponsor-to-advertiser.sql`
- `central-server/src/scripts/migrations/check-before-migration.sql` (vérification pré-migration)

## Rétrocompatibilité

### API

- Les routes `/api/sponsors/:id/sites` restent fonctionnelles (redirections vers `/api/advertisers/:id/sites`)
- ⚠️ La route backward-compat `GET /api/sites/:id/sponsors` a été **supprimée** (2026-02-18) car elle entrait en conflit avec la nouvelle route `GET /api/sites/:siteId/sponsors` de `site-sponsor.routes.ts`. L'ancien handler retournait `{ advertisers: [] }` au lieu de `{ sponsors: [] }`, rendant la liste des sponsors invisible sur le dashboard.
- Les réponses JSON utilisent les nouveaux noms mais les alias sont acceptés

### Base de données

- Le rôle `sponsor` reste valide dans la contrainte check_role
- Les anciennes requêtes fonctionneront avec des vues de compatibilité si nécessaire

### Frontend

- Redirections automatiques de `/sponsors` vers `/advertisers`
- Redirections de `/sponsor-portal` vers `/advertiser-portal`

### Raspberry

- Le champ `sponsor_id` reste supporté (marqué deprecated)
- Le nouveau champ `advertiser_id` est utilisé en priorité

## Déploiement

1. **Exécuter la migration SQL** via Supabase Dashboard
2. **Déployer central-server** sur Railway
3. **Déployer central-dashboard** sur Hostinger
4. **Les Raspberry Pi** seront mis à jour lors du prochain build-and-deploy

## Tests validés

- ✅ Build `central-server` sans erreur
- ✅ Build `central-dashboard` sans erreur
- ✅ Build `raspberry` sans erreur

## Liens

- [Migration SQL](../../central-server/src/scripts/migrations/rename-sponsor-to-advertiser.sql)
- [Documentation Sponsor System (legacy)](2025-12-28_sponsor-system-production.md)
