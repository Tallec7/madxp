# Analytics Pipeline Consolidation — 21 Fév 2026

## Contexte

Le systeme analytics sponsors avait **deux pipelines paralleles** :

- **Pipeline A** (`video_plays` via `AnalyticsService`) : fonctionnel, avec `tv_status` HDMI-CEC
- **Pipeline B** (`advertiser_impressions` via `SponsorAnalyticsService`) : casse (401 permanent, buffer bloque)

**Alignement SAFe** : OVS2 (Sponsor to Impression), TS1 (Monetisation 67% PI-1), E-03 (Analytics Sponsors Avance, WSJF=20).

## Changements

### Phase 0 — Hotfix auth (v3.66)

- Middleware `authenticateSiteApiKeyOptional` : auth optionnelle sur `/api/analytics/impressions`
- Debloque le flush des 98 events en attente sur les Pi

### Phase 1 — Consolidation pipeline unique

- **Suppression `SponsorAnalyticsService`** : `AnalyticsService` gere toutes les videos (club + sponsor)
- **Enrichissement `VideoPlayEvent`** : `event_type`, `period`, `audience_estimate`, `position_in_loop`, `site_sponsor_id`
- **Central server** : nouveaux champs acceptes dans `POST /api/analytics/video-plays`
- **Migration DB** : colonnes ajoutees a `video_plays`
- **Vue de compatibilite** : `sponsor_impressions_bridge` pour le dashboard existant
- **Pipeline B desactive** : `sponsor-impressions.js` supprime du sync-agent

### Phase 2 — Valeur business KPIs

- **Nouvel endpoint** : `GET /api/analytics/advertisers/:id/kpis`
  - `verified_impressions` (TV allumee via HDMI-CEC)
  - `tv_on_rate`, `match_day_impressions`, `completion_rate`
  - `rotation_fairness` (coefficient de variation)
  - `renewal_score` (score composite vert/jaune/rouge)
  - `peak_hours` (heatmap 24h)
- **Dashboard enrichi** : 4 KPI cards avances, heatmap Chart.js, score de renouvellement
- **PDF enrichi** : section "Impressions Verifiees" avec taux TV-on et breakdown match day

### Phase 3 — Preparation data model PI-2

- **Table `campaigns`** : gestion de campagnes (standard, regional, ab_test)
- **Table `scheduled_reports`** : rapports automatiques (weekly/monthly/quarterly)
- **Colonne `campaign_id`** sur `video_plays` pour rattachement futur

### Phase 4 — Cleanup ancien pipeline

- **Suppression fichiers** : `SponsorAnalyticsService`, `sponsor-impressions.js`, routes associees
- **Migration queries** : 30+ queries dans 12+ fichiers de `advertiser_impressions` vers `video_plays WHERE category = 'sponsor'`
- **Backfill script** : enrichissement `video_plays` depuis `advertiser_impressions`
- **Drop table** : `advertiser_impressions` supprimee, 4 vues SQL recreees

### Phase 5 — Cleanup build scripts (v3.67)

- **`build-raspberry.sh`** : suppression de `sponsor-impressions.js` de la liste `SYNC_AGENT_CRITICAL` (integrite build)
- **`setup.sh`** : suppression de `sponsor-impressions.js` de la boucle de telechargement sync-agent
- **Documentation** : mise a jour TRACKING_IMPRESSIONS.md, IMPLEMENTATION.md, sync-agent.md, buffer.service.js
- **Alerte Prometheus** : ajout `SponsorAnalyticsPipelineStall` (detection pipeline sponsor en panne)

### Monitoring

- Alertes Prometheus ajoutees pour le pipeline consolide :
  - `AnalyticsKpisEndpointSlow` : latence P95 du nouvel endpoint KPIs
  - `CampaignDataInconsistency` : video_plays avec campaign_id orphelin
  - `VerifiedImpressionsDropoff` : chute du taux TV-on (qualite HDMI-CEC)
  - `SponsorAnalyticsPipelineStall` : zero sponsor plays alors que club plays OK (v3.67)

### Phase 6 — Fix comptage impressions dashboard (v3.68.5, 22 Fév)

- **Requêtes `listBySite` / `listBySiteForAdvertiser`** : ajout fallback `video_filename` via `UNION ALL`
- Les enregistrements `video_plays` sans `site_sponsor_id` (antérieurs à l'auto-résolution) sont désormais comptés via résolution `video_filename` → `site_sponsor_videos` → `site_sponsors`
- Pas de double-comptage (branches mutuellement exclusives `IS NOT NULL` / `IS NULL`)
- Corrige l'affichage "0 impressions" sur le dashboard sponsors pour les sites existants

## Tests

| Suite                   | Resultat         |
| ----------------------- | ---------------- |
| `npm run test:server`   | 1595 tests OK    |
| `npm run test:smoke`    | 142 tests OK     |
| `npm run build:central` | Build Angular OK |

## Fichiers cles modifies

- `raspberry/src/app/services/analytics.service.ts` (enrichi)
- `raspberry/src/app/components/tv/tv.component.ts` (pipeline unique)
- `raspberry/src/app/components/remote/remote.component.ts` (routing vers analyticsService)
- `central-server/src/controllers/analytics.controller.ts` (nouveaux champs)
- `central-server/src/controllers/advertiser-analytics.controller.ts` (endpoint KPIs)
- `central-server/src/repositories/analytics.repository.ts` (18 colonnes)
- `central-server/src/repositories/advertiser.repository.ts` (8 queries migrees)
- `central-server/src/repositories/site-sponsor.repository.ts` (12 queries migrees)
- `central-server/src/services/pdf-report.service.ts` (impressions verifiees)
- `central-dashboard/src/app/features/advertisers/advertiser-analytics.component.ts` (KPIs dashboard)
- `central-server/src/scripts/full-schema.sql` (campaigns, scheduled_reports, vues)
- `docker/prometheus/rules.yml` (3 nouvelles alertes)
