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

## Rate Limiting

```
Auth:         60 req/min
Monitoring:   300 req/min (status, metrics, dashboard, benchmark)
Admin:        400 req/min (lecture sites, logs)
API General:  100 req/min
Sensitive:    30 req/min (commands, deployments)
Remote Cloud: 60 req/min (par IP)
Upload:       10 req/hour
Pi Analytics: 500 req/min (par IP)
```

**Anti-pattern** : ne PAS appliquer `apiRateLimit` globalement ET par route (double comptage).
