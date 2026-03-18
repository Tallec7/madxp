# ADR-035: Séparation Annonceurs Neopro / Sponsors Club

## Status

Accepted

## Context

Le système actuel fusionne les annonceurs Neopro (advertisers) et les sponsors locaux (site_sponsors) dans un modèle unique. Quand un annonceur est assigné à un site, un `site_sponsor` fantôme (`source='neopro'`) est auto-créé via `upsertForAdvertiserSite()`. Ce pont permet aux vidéos annonceur d'utiliser le même pipeline analytics que les sponsors locaux (`site_sponsor_id` dans `video_plays`).

### Problèmes à l'échelle

| Problème                                      | Impact                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Fuite de données commerciales**             | L'opérateur club voit les stats des annonceurs Neopro dans son onglet Sponsors — données confidentielles                    |
| **Benchmark pollué**                          | Le sponsor "Boulangerie du coin" est comparé à "Décathlon" national — pas de sens métier                                    |
| **FK redondante dans video_plays**            | `site_sponsor_id` ET `sponsor_id` (= advertiser_id mal nommé) — confusion                                                   |
| **advertiser_daily_stats sans advertiser_id** | Agrège par `video_id + site_id` — si 2 annonceurs partagent une vidéo, stats mélangées                                      |
| **Pas de déploiement depuis l'annonceur**     | Il faut aller site par site pour ajouter les vidéos à la boucle                                                             |
| **Campagnes non opérationnelles**             | Table `campaigns` existe mais n'est connectée à rien (pas de déploiement, pas de ciblage réel)                              |
| **Deux mondes, un seul pipeline**             | Sponsor local = relation club/commerçant. Annonceur = relation commerciale Neopro. Business models différents, mêmes tables |

### Schéma actuel

```
advertisers ──M:N──▶ advertiser_sites ──auto-crée──▶ site_sponsors (source=neopro)
                                                          │
site_sponsors (source=local) ────────────────────────────┘
       │
       └──▶ site_sponsor_videos ──▶ video_plays (site_sponsor_id)
                                         │
                                         ├── sponsor_id (= advertiser_id, redondant)
                                         └── campaign_id (inutilisé)
```

## Decision

Séparer les deux business models en conservant un point de collecte analytics unifié.

### Modèle cible

```
═══════════════════════════════════════════════════════════════
                 MONDE ANNONCEUR NEOPRO
═══════════════════════════════════════════════════════════════

agencies ──1:N──▶ advertisers
                      │
                      ├──1:N──▶ advertiser_videos (catalogue)
                      │
                      └──1:N──▶ campaigns
                                    │
                                    ├── target_criteria JSONB
                                    │   { sports: [], regions: [],
                                    │     min_audience: N, tiers: [] }
                                    │
                                    ├──1:N──▶ campaign_videos
                                    │
                                    └──M:N──▶ campaign_sites
                                               (résolu par target_criteria)

═══════════════════════════════════════════════════════════════
                 MONDE CLUB LOCAL
═══════════════════════════════════════════════════════════════

site_sponsors (source=local UNIQUEMENT)
     │
     └──1:N──▶ site_sponsor_videos

═══════════════════════════════════════════════════════════════
                 COLLECTE UNIFIÉE (video_plays)
═══════════════════════════════════════════════════════════════

video_plays
     ├── site_sponsor_id    → sponsor local  (stats club)
     ├── advertiser_id      → annonceur      (stats annonceur)
     ├── campaign_id        → campagne       (stats campagne)
     └── analytics_category → 'sponsor_local' | 'sponsor_neopro' | ...
```

### Principes

1. **Le Pi envoie les deux identifiants** : `site_sponsor_id` (sponsor local) OU `advertiser_id` + `campaign_id` (annonceur), jamais les deux
2. **`site_sponsors` = sponsors locaux uniquement** : plus de `source='neopro'`, plus de `site_sponsor` fantôme
3. **Les stats annonceur sont requêtées par `advertiser_id`** directement sur `video_plays` — plus besoin du pont `site_sponsor`
4. **Les campagnes pilotent le déploiement** : l'annonceur crée une campagne → critères de ciblage → sites résolus → vidéos déployées automatiquement
5. **Séparation front stricte** : l'opérateur club ne voit que ses sponsors locaux, l'admin Neopro gère les annonceurs dans un espace dédié

### Changements par composant

#### Config envoyée au Pi

```typescript
// Avant : seul site_sponsor_id
{ path: "07_DECATHLON.mp4", site_sponsor_id: "ss-456" }

// Après : advertiser_id + campaign_id pour les vidéos annonceur
{ path: "07_DECATHLON.mp4", advertiser_id: "adv-123", campaign_id: "camp-789" }

// Les sponsors locaux gardent site_sponsor_id
{ path: "03_BOULANGERIE.mp4", site_sponsor_id: "ss-456" }
```

#### Pi analytics (video_plays)

```typescript
// Sponsor local → inchangé
{ video_filename, site_sponsor_id: "ss-456", analytics_category: "sponsor_local" }

// Annonceur Neopro → nouveau
{ video_filename, advertiser_id: "adv-123", campaign_id: "camp-789", analytics_category: "sponsor_neopro" }
```

#### Dashboard — ce que voit chaque rôle

| Vue                          | Rôle          | Données                                                       |
| ---------------------------- | ------------- | ------------------------------------------------------------- |
| Onglet Sponsors d'un site    | operator      | `site_sponsors WHERE source='local'` uniquement               |
| Benchmark intra-club         | operator      | Sponsors locaux uniquement                                    |
| Portail sponsor (magic link) | sponsor local | Stats d'UN site_sponsor local                                 |
| Page Annonceur               | admin neopro  | Stats cross-clubs par `advertiser_id` sur `video_plays`       |
| Dashboard Campagne           | admin neopro  | Objectifs, progression, CPM, completion par campagne          |
| Portail Annonceur            | advertiser    | Ses campagnes, stats agrégées, benchmark vs autres annonceurs |
| Portail Agence               | agency        | Multi-annonceurs, multi-campagnes                             |

#### Tables DB — évolutions

| Table                    | Action                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- |
| `video_plays`            | Renommer `sponsor_id` → `advertiser_id` (clarté). Déjà présent comme FK      |
| `video_plays`            | `analytics_category` : ajouter valeurs `'sponsor_local'`, `'sponsor_neopro'` |
| `campaigns`              | Ajouter `target_criteria JSONB`, budget/CPM fields                           |
| `campaign_videos`        | **Nouvelle** : `(campaign_id, video_id)` — quelles vidéos dans une campagne  |
| `campaign_sites`         | **Nouvelle** : `(campaign_id, site_id, status)` — sites résolus/déployés     |
| `advertiser_daily_stats` | Ajouter `advertiser_id` dans la PK, recalculer                               |
| `site_sponsors`          | Supprimer les lignes `source='neopro'` (après migration analytics)           |
| `site_sponsors`          | Retirer `advertiser_id`, retirer `source` (tout est local)                   |

## Migration progressive

### Phase 1 — Séparation front (0 migration DB) ✅

- Filtrer `source != 'neopro'` dans l'onglet Sponsors club
- Exclure `source = 'neopro'` du benchmark intra-club
- Aucun impact backend ni Pi

**Effort** : ~2-3h
**Risque** : Nul
**Implémenté** : v3.113.4

### Phase 2 — `advertiser_id` dans le pipeline Pi ✅

- ~~Enrichir la config Pi~~ : `advertiser_id` déjà injecté via `enrichConfigWithAnalyticsMetadata()`
- ~~Modifier le Pi `analytics.service.ts`~~ : `sponsor_id` (= advertiser_id) déjà envoyé
- ~~Modifier `analytics.repository.ts`~~ : `sponsor_id` déjà persisté dans `video_plays`
- ~~Les stats annonceur basculent sur des requêtes par `advertiser_id` direct~~ : via `advertiser_daily_stats_live` view
- `analytics_category` séparé : `sponsor_local` (club) / `sponsor_neopro` (annonceur) / `sponsor` (legacy rétrocompat)
- Toutes les requêtes SQL mises à jour avec `IN ('sponsor', 'sponsor_local', 'sponsor_neopro')`
- Migration DB : index partiel + 6 vues + fonction `calculate_daily_stats`
- Constantes SQL centralisées : `ALL_SPONSOR_CATEGORIES`, `LOCAL_SPONSOR_CATEGORIES`, `NEOPRO_SPONSOR_CATEGORIES`

**Effort** : ~1-2 jours
**Risque** : Moyen — nécessite OTA Pi, rétrocompatibilité pendant la transition
**Implémenté** : v3.113.5 (migration DB : `adr035-sponsor-category-split.sql`)

### Phase 3 — Campagnes opérationnelles ✅ (3a: CRUD + targeting, 3b: auto-deploy, 3c: dashboard, 3d: advertiser portal)

**Phase 3a — CRUD + targeting ✅** :

- `campaign_videos` : table d'association vidéos-campagne (avec `weight`)
- `campaign_sites` : table de sites résolus (remplace `target_sites UUID[]`)
- `target_criteria` JSONB : ciblage par sport, région, groupes (`{ sports: [], regions: [], group_ids: [] }`)
- Résolution dynamique des sites via `resolveSitesByCriteria()` + endpoint preview `POST /campaigns/resolve-sites`
- `campaign_stats_live` : vue temps réel (impressions, CPM effectif, progression vs objectif)
- API CRUD complète : `GET/POST/PUT/DELETE /api/campaigns`, sous-ressources `/videos`, `/sites`, `/stats`
- Budget tracking : `budget_cents`, `target_cpm_cents`, CPM effectif calculé automatiquement
- Repository + Controller + Routes enregistrés dans server.ts
- Smoke tests : routes, repository wiring, schema guards

**Phase 3b — Déploiement auto ✅** :

- `enrichConfigWithCampaignVideos()` : injecte les vidéos des campagnes actives dans `sponsors[]` lors du déploiement config
- Intégré dans le pipeline d'enrichissement config-sync (AVANT `autoResolveSponsorIds`)
- `campaign_id` ajouté à `SponsorVideo` pour le tracking analytics côté Pi
- `deployCampaign()` / `undeployCampaign()` : service de déploiement orchestré
- `POST /api/campaigns/:id/deploy` + `POST /api/campaigns/:id/undeploy` : endpoints REST
- Repository : `getActiveCampaignsForSite()`, `listPendingSites()`, `batchUpdateDeploymentStatus()`
- Smoke tests : wiring, export guards, pipeline ordering

**Phase 3c — Dashboard Angular ✅** :

- Onglet "Campagnes" dans advertiser-detail avec liste, stats, deploy/undeploy
- CRUD campagne (create/edit/delete) via modal integre
- Boutons "Deployer" / "Mettre en pause" appelant `/deploy` et `/undeploy`
- Status badges (draft/active/paused/completed/failed)
- Stats inline : videos, sites, impressions, progression, budget
- Smoke tests : wiring, API calls

**Phase 3d — Portail annonceur campagnes ✅** :

- Endpoints API `getAdvertiserCampaigns` / `getAdvertiserCampaignDetail` dans `advertiser-portal.controller.ts`
- Routes `/campaigns` et `/campaigns/:campaignId` dans `advertiser-portal.routes.ts`
- Vérification ownership advertiser (`advertiser_id !== advertiserId`)
- `PortalCampaign` / `PortalCampaignDetail` interfaces + `getCampaigns` / `getCampaignDetail` dans `sponsor-portal.service.ts`
- Onglet campagnes dans `sponsor-dashboard.component.ts` avec liste + vue détail
- Smoke tests : controller exports, route wiring, service interfaces, component tabs

**Effort** : ~1 semaine total (3a: 2h ✅, 3b: 2h ✅, 3c: 1h ✅, 3d: 1h ✅)
**Risque** : Moyen — nouveau workflow, tests E2E nécessaires
**Implémenté (3a)** : v3.114.x (migration DB : `adr035-phase3-campaigns-operational.sql`)
**Implémenté (3d)** : v3.114.x

### Phase 4 — Nettoyage ✅

- Backfill `advertiser_id` sur `video_plays` historiques (via les `site_sponsors` source=neopro existants)
- Supprimer les `site_sponsors` source=neopro
- Retirer `advertiser_id` et `source` de `site_sponsors`
- Supprimer `upsertForAdvertiserSite()` et l'auto-création dans `addSitesToAdvertiser`
- Renommer `sponsor_id` → `advertiser_id` dans `video_plays` (ou supprimer si doublon)
- Supprimer `advertiser_daily_stats` (remplacée par requêtes directes sur `video_plays` + `campaign_sites`)
- Supprimer le `source` field de `SiteSponsorDeployment` dans `types/index.ts`
- Mettre à jour `full-schema.sql` (retrait table `advertiser_daily_stats`)

**Effort** : ~1 jour
**Risque** : Faible (données migrées en Phase 2)
**Implémenté** : v3.114.x (migration DB : `adr035-phase4-cleanup.sql`)

## Consequences

### Positif

- **Séparation métier claire** : le club gère ses sponsors, Neopro gère ses annonceurs
- **Confidentialité** : les stats annonceur ne fuient plus côté club
- **Scalabilité** : le modèle campagne permet de gérer N annonceurs × M clubs sans explosion de `site_sponsors`
- **Déploiement simplifié** : une campagne → des critères → déploiement auto (vs aller site par site)
- **Analytics propres** : une FK = un business model, pas de pont ni doublon
- **Portail annonceur dédié** : expérience adaptée (cross-clubs, campagnes, ROI) vs portail sponsor (mono-club, impressions)

### Négatif

- Migration en 4 phases → effort total ~2 semaines
- OTA Pi nécessaire en Phase 2 (ajout `advertiser_id` dans le payload analytics)
- Rétrocompatibilité à maintenir pendant la transition (Pi pas encore mis à jour envoient `site_sponsor_id`)
- Les `video_plays` historiques avec `site_sponsor_id` source=neopro doivent être backfillées

### Neutre

- Le portail sponsor local (magic link) reste inchangé
- Le modèle `site_sponsors` survit mais simplifié (local uniquement)
- La weighted playlist et le pinning ne sont pas impactés
