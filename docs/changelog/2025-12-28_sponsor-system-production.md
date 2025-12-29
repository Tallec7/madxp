# Système Sponsors Production-Ready

Date: 2025-12-28

> **Note** : Ce document utilise la terminologie "Sponsor". Depuis le 2025-12-29, la terminologie officielle est "Advertiser" (Annonceur). Voir [Migration Sponsor → Advertiser](2025-12-29_sponsor-to-advertiser-migration.md).

## Résumé

Implémentation complète du système de gestion des sponsors pour la production :
- Clarification sémantique du modèle de données
- Authentification sécurisée des impressions Raspberry
- Validation des contrats sponsors
- API complète de gestion des associations sponsor-sites
- Documentation technique

## Changements

### 1. Clarification sémantique

**Problème** : L'interface `SponsorConfig` représentait en réalité une vidéo dans la boucle de lecture, pas un sponsor en tant qu'entité.

**Solution** :
- Renommage `SponsorConfig` → `LoopVideoConfig` (central-dashboard)
- Renommage `Sponsor` → `LoopVideo` (raspberry)
- Alias de rétrocompatibilité conservés avec `@deprecated`
- Ajout des champs `video_id` et `sponsor_id` pour le tracking

### 2. Authentification API Key pour Impressions

**Problème** : L'endpoint `/api/analytics/impressions` utilisait l'authentification JWT utilisateur, inadaptée pour les boîtiers Raspberry.

**Solution** :
- Nouveau middleware `authenticateSiteApiKey` dans `auth.ts`
- Vérifie l'API key du site contre la table `sites`
- Le `siteId` est extrait de l'auth (pas du body)
- Sync-agent mis à jour pour envoyer `Authorization: Bearer <apiKey>`
- Limite de batch (500 impressions max)

### 3. Validation des Contrats Sponsors

**Problème** : Les dates de contrat (`contract_start`, `contract_end`) étaient stockées mais jamais vérifiées.

**Solution** :
- Migration SQL avec nouvelles fonctions :
  - `is_sponsor_contract_active(sponsor_id, site_id, date)`
  - `get_sponsor_active_sites(sponsor_id, date)`
  - `get_site_active_sponsors(site_id, date)`
- Vue `sponsor_accessible_sites` enrichie avec `contract_status` et `days_remaining`
- Filtrage par défaut sur les contrats actifs dans le portail sponsor
- Statuts : `active`, `pending`, `expired`, `inactive`

### 4. API Gestion Associations Sponsor-Sites

**Nouveaux endpoints** :

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sponsors/:id/sites` | Liste sites d'un sponsor |
| POST | `/api/sponsors/:id/sites` | Associer sites avec contrat |
| PUT | `/api/sponsors/:sponsorId/sites/:siteId` | Modifier contrat |
| DELETE | `/api/sponsors/:sponsorId/sites/:siteId` | Retirer association |
| GET | `/api/sites/:id/sponsors` | Liste sponsors d'un site |

### 5. Amélioration Portail Sponsor

- Filtrage par dates de contrat par défaut
- Paramètres `?include_expired=true` et `?include_pending=true`
- Nouveaux champs dans la réponse :
  - `contract_status` : état du contrat
  - `days_remaining` : jours avant expiration
  - `status_counts` : compteurs par statut
- Tri par statut (active → pending → expired)

## Fichiers modifiés

### Central Server
- `src/middleware/auth.ts` - Nouveau middleware `authenticateSiteApiKey`
- `src/routes/sponsor-analytics.routes.ts` - Auth par API key pour impressions
- `src/controllers/sponsor-analytics.controller.ts` - Utilisation `SiteAuthRequest`
- `src/controllers/sponsor-portal.controller.ts` - Filtrage contrats
- `src/controllers/sponsor-sites.controller.ts` - **Nouveau** - CRUD associations
- `src/routes/sponsor-sites.routes.ts` - **Nouveau** - Routes associations
- `src/server.ts` - Import des nouvelles routes
- `src/scripts/migrations/add-sponsor-contract-validation.sql` - **Nouveau**
- `docs/SPONSOR-SYSTEM.md` - **Nouveau** - Documentation complète

### Central Dashboard
- `src/app/core/models/site-config.model.ts` - `LoopVideoConfig`

### Raspberry
- `src/app/interfaces/sponsor.interface.ts` - `LoopVideo`
- `src/app/interfaces/configuration.interface.ts` - Utilisation `LoopVideo`
- `sync-agent/src/sponsor-impressions.js` - Header Authorization

## Migration SQL

La migration `add-sponsor-contract-validation.sql` a été appliquée :
- 2 index pour les requêtes par dates de contrat
- 3 fonctions SQL pour vérification des contrats
- Vue `sponsor_accessible_sites` mise à jour

## Documentation

- `central-server/docs/SPONSOR-SYSTEM.md` : documentation technique complète
  - Architecture et diagrammes
  - Description des tables
  - Flux de données
  - Référence API
  - Gestion des contrats
  - Sécurité et authentification

## Tests

Builds vérifiés :
- ✅ `central-server` compile sans erreur
- ✅ `central-dashboard` compile sans erreur
- ✅ `raspberry` compile sans erreur

## Liens

- [Documentation Sponsor System](../../central-server/docs/SPONSOR-SYSTEM.md)
- [Migration SQL](../../central-server/src/scripts/migrations/add-sponsor-contract-validation.sql)
