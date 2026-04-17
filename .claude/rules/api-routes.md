---
paths:
  - 'central-server/src/routes/**'
  - 'central-server/src/controllers/**'
---

# API Routes Reference

## Auth

```
POST /api/auth/login          → { email, password } → cookie + user
POST /api/auth/logout         → clear cookie
GET  /api/auth/me             → current user
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

## Sites (clubs)

```
GET    /api/sites             → liste paginée, filtres: status, sport, region
GET    /api/sites/:id         → détails + config + metrics
GET    /api/sites/:id/dashboard → endpoint agrégé (connection + metrics)
GET    /api/sites/:id/local-content → vidéos locales + stockage
POST   /api/sites             → créer site (génère api_key)
PUT    /api/sites/:id         → modifier
DELETE /api/sites/:id         → supprimer
POST   /api/sites/:id/copy-config → copier profils config vers un autre site { target_site_id, profile_ids? } (mode ajout)
POST   /api/sites/:id/command → envoyer commande au Pi
```

## Debug endpoints (requièrent connexion Pi active)

```
GET    /api/sites/:id/health-status → santé système
GET    /api/sites/:id/diagnostics → diagnostic complet
GET    /api/sites/:id/network-diagnostics → diagnostics réseau
GET    /api/sites/:id/logs?service=xxx&lines=100
GET    /api/sites/:id/debug-bundle → export JSON pour support
POST   /api/sites/:id/fix-hotspot → diagnostiquer/réparer le hotspot
```

## Contenu

```
POST   /api/content/upload    → multipart/form-data (vidéo)
GET    /api/content/videos    → liste vidéos
GET    /api/content/videos/for-site/:siteId → vidéos priorisées pour un site
DELETE /api/content/videos/:id
POST   /api/content/deploy    → { videoId, targetType, targetId }
POST   /api/content/image-to-video → image → vidéo MP4
```

### Permissions Club Portal (rôle `club`)

Les utilisateurs `club` ont accès aux endpoints contenu avec des restrictions :

- **Upload** : `uploaded_for_site_id` auto-tagué côté serveur avec `user.site_id`
- **Liste** : filtrée par `uploaded_for_site_id` = site du club + vidéos NEOPRO
- **Delete/Update** : uniquement les vidéos avec `uploaded_for_site_id` = `user.site_id` ET `category ≠ NEOPRO`
- **Deploy** : uniquement vers leur propre site

## Config Save (SaaS direct)

```
PUT    /api/sites/:id/config            → sauvegarde directe config (SaaS uniquement, refuse Pi)
```

## Config Drafts

```
GET    /api/sites/:siteId/draft         → brouillon du site (ou null)
PUT    /api/sites/:siteId/draft         → crée/met à jour le brouillon
DELETE /api/sites/:siteId/draft
POST   /api/sites/:siteId/draft/validate
POST   /api/sites/:siteId/draft/deploy  → déploie (vidéos + config orchestré)
```

## Subscriptions (v2.47+)

```
GET    /api/subscriptions/stats
GET    /api/subscriptions/at-risk
GET    /api/sites/:id/subscription
PUT    /api/sites/:id/subscription
PUT    /api/sites/:id/subscription/extend
POST   /api/sites/:id/subscription/suspend
POST   /api/sites/:id/subscription/reactivate
```

## Alerts & Benchmark

```
GET    /api/alerts
POST   /api/alerts/:id/resolve
GET    /api/benchmark/sites/:siteId
GET    /api/benchmark/global
```

## Pi Analytics (depuis sync-agent — API key optionnelle, piAnalyticsRateLimit 500/min)

```
POST /api/analytics/video-plays   → { site_id, plays[] } — piAnalyticsRateLimit + authenticateSiteApiKeyOptional
POST /api/analytics/sessions      → { site_id, action }  — piAnalyticsRateLimit + authenticateSiteApiKeyOptional
POST /api/analytics/impressions   → { impressions[] }     — piAnalyticsRateLimit + authenticateSiteApiKeyOptional
```

## Sponsor Portal (PUBLIQUE — magic link token)

```
GET  /api/sponsor-portal/verify      → ?token=xxx
GET  /api/sponsor-portal/stats       → ?token=xxx&from=...&to=...
GET  /api/sponsor-portal/report      → ?token=xxx (PDF)
GET  /api/sponsor-portal/benchmark   → ?token=xxx
GET  /api/sponsor-portal/export-csv  → ?token=xxx (CSV)
```

## Remote Cloud (PUBLIQUE - pas d'auth)

```
GET  /api/remote/:siteId/state    → État du site
POST /api/remote/:siteId/command  → Envoyer commande
GET  /api/remote/:siteId/videos   → Vidéos par catégorie
```

## Remotion Templates (ADR-054 async + ADR-055 versions)

```
GET    /api/remotion-templates                   → liste (admin voit tout, autres voient `is_published=true`)
GET    /api/remotion-templates/:id               → détail
POST   /api/remotion-templates/:id/render        → 202 { job_id } (rendu async — voir /render-jobs/:jobId)
GET    /api/remotion-templates/render-jobs/:jobId → statut job (status, progress 0-100, phase, video_url, file_size)

# Admin-only (requireRole('admin'|'super_admin')) :
PATCH  /api/remotion-templates/:id                  → édite name/description/props_schema/default_props
POST   /api/remotion-templates/:id/duplicate        → clone (unpublished)
GET    /api/remotion-templates/:id/versions         → historique (DESC, trigger auto-snapshot)
POST   /api/remotion-templates/:id/versions/:versionId/restore → applique un ancien schéma
```

**Async render contract (ADR-054)** : `POST /render` ne rend plus la vidéo dans la requête HTTP. Le controller enqueue dans `remotion_render_jobs` et retourne `202 { job_id }`. Le worker in-process (`remotion-render-worker.service.ts`, polling 5s, `FOR UPDATE SKIP LOCKED`) traite les jobs et met à jour `progress` + `phase` (bundling → selecting → rendering → uploading). Le dashboard poll `GET /render-jobs/:jobId`. Supervision : `alerting.checkStuckRenderJobs()` alerte à 15/30 min (warning/critical) et auto-fail à 30 min, + taux échec 1h.

**Versions trigger (ADR-055)** : `trg_neopro_templates_snapshot` capture OLD automatiquement à chaque UPDATE de `props_schema`/`default_props` — la route restore est donc une simple UPDATE qui déclenche elle-même un snapshot (zéro perte possible).

## SaaS (PUBLIQUE — UUID site, ADR-037)

```
GET  /api/saas/:siteId/config                     → Config complète (URLs vidéo résolues)
GET  /api/saas/:siteId/profiles                   → Liste des profils disponibles
GET  /api/saas/:siteId/profiles/:profileId/config → Config d'un profil spécifique
```

## Rate Limiting

```
Auth:         60 req/min
Monitoring:   300 req/min (status, metrics, dashboard, benchmark)
Admin:        400 req/min (lecture sites, logs)
API General:  100 req/min
Sensitive:    30 req/min (commands, deployments)
Remote Cloud: 60 req/min (par IP)
SaaS:         60 req/min (par IP, remoteRateLimit partagé)
Upload:       10 req/hour
Pi Analytics: 500 req/min (par IP)
```

**Anti-pattern** : ne PAS appliquer `apiRateLimit` globalement ET par route (double comptage).

## NE JAMAIS FAIRE (smoke test enforced)

- Ajouter une route avec paramètre (`:id`, `:siteId`) sans `validateParams(paramSchemas.X)` dans le fichier routes (la validation se fait au niveau routes, pas controllers)
- Ajouter une route POST/PUT/PATCH avec body sans `validate(schemas.X)` dans le fichier routes
- Supprimer `authenticateSiteApiKeyOptional` des routes `POST /video-plays` et `POST /sessions` dans `analytics.routes.ts` (sans ce middleware, n'importe quel client peut POST des analytics avec un `site_id` arbitraire)
- Supprimer `piAnalyticsRateLimit` des routes `POST /video-plays` et `POST /sessions` dans `analytics.routes.ts` (sans rate limiter per-route, les deux routes héritent de `apiRateLimit` 100/min — trop bas pour les Pi en backlog)
- Accepter un upload vidéo de 0 octets dans `createVideo` / `createVideos` de `content.controller.ts` (guard `file.size === 0` → 400 obligatoire)
- Wrapper `contentRoutes` avec `sensitiveRateLimit` (30/min) sur le mount `/api` dans `server.ts` (3-6 vues dashboard exhaustent le quota → cascade de 429 — incident v3.136.4 — utiliser rate limits per-route dans `content.routes.ts`)
- Revenir au mode "delete-all + replace" dans `copyConfig` de `site-copy.controller.ts` (le mode actuel est ajout sans suppression — `deleteById` des profils existants casse les configs des clubs en production — les conflits de nom sont résolus par suffixe `(copie)` — smoke test enforced)
- Remettre `isDefault: true` sur les profils copiés dans `copyConfig` (les profils copiés ne doivent JAMAIS écraser le profil par défaut de la cible — toujours `isDefault: false` — smoke test enforced)
- Rendre `POST /api/remotion-templates/:id/render` synchrone (attendre le bundle+render dans la requête HTTP). Le rendu prend 60-120s et faisait cascader les 502 Railway (proxy timeout 120s). Toujours enqueue dans `remotion_render_jobs` et retourner `202 { job_id }` — le worker polling (ADR-054) gère le rendu hors du cycle HTTP. Smoke test enforced.
- Remettre `import ... from '@remotion/renderer'` dans `remotion-templates.controller.ts` (le renderer vit uniquement dans `remotion-render-worker.service.ts` depuis ADR-054 — sinon le controller redevient synchrone). Smoke test enforced.
- Supprimer `failStaleRunningJobs(10)` du boot du worker (sans ça, un job claimed par un process mort reste `running` ad vitam → le user ne peut pas retry). Smoke test enforced.
- Ajouter `PATCH/POST /:id/duplicate/versions/restore` sans `requireRole('admin'|'super_admin')` (l'édition du schéma template impacte tous les clubs — jamais accessible aux rôles club/viewer). Smoke test enforced.
- Supprimer le trigger `trg_neopro_templates_snapshot` ou remplacer l'audit trail par un INSERT manuel côté repository (un futur endpoint qui oublie le snapshot perd silencieusement l'historique — le trigger DB garantit la capture quelle que soit la route — ADR-055). Smoke test enforced.
