# 2026-04-23 — Asset-proxy hardening (429 NotSameOrigin + 404 FTP + monitoring)

**ADR** : [ADR-087](../adr/ADR-087-no-global-api-rate-limiter-corp-on-429.md) (Accepté)
**Type** : fix + hardening + observability
**Scope** : central-server — rate limiting, Remotion template assets

## Contexte

Depuis le cycle de fixes des 21-22 avril (`8bf86b0a`, `99d5d0ed`, `95bc6a55`, `502f81b1`), le Template Studio recevait en prod une cascade d'erreurs sur le preview Remotion :

1. `GET /api/remotion-templates/asset-proxy?url=…BUT_img_joueur_*.webm` → **429 Too Many Requests** → `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`
2. `GET …template-assets/studio/joueur-detaille/{A..E}.webm` → **404** sur l'upstream FTP → `<video>` en boucle

Le `<video>` Remotion émet N range requests par asset (seek + buffering) : chaque slot du template consommait 20+ requêtes en quelques secondes.

## Cause racine

### 1. 429 cascadant en NotSameOrigin (structurel)

`app.use('/api', apiRateLimit, advertiserSitesRoutes)` dans `server.ts` attachait `apiRateLimit` (100 req/min) au **préfixe `/api` global**. Express exécutait la chaîne pour toute requête `/api/*`, y compris `/api/remotion-templates/asset-proxy` — le quota était consommé avant même le matching du router advertiser.

Pire : le 429 de `createLimitHandler` n'avait pas les headers `Cross-Origin-Resource-Policy` / `Access-Control-Allow-Origin`. Chrome bloquait donc la réponse avec `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` → le player ne voyait plus un 429 mais une erreur CORP → retry infini.

### 2. 404 sur template Joueur Détaillé (data)

Le seed initial (`seed-joueur-detaille-template.sql`) pointait les `template_layers.video_url` sur `https://kalonpartners.bzh/neopro-video/template-assets/studio/joueur-detaille/{A..E}.webm` — chemin FTP inexistant. Le commit `502f81b1f` avait repointé le seed vers Railway (`/remotion-preview/public/BUT_img_joueur_{A..E}.webm`) mais le script est idempotent (`IF NOT EXISTS`) : les layers déjà en prod n'étaient pas mis à jour.

## Fix permanent

### Structurel — rate limiting

- [server.ts](../../central-server/src/server.ts) : `apiRateLimit` retiré du mount `advertiserSitesRoutes` ; asset-proxy déplacé AVANT tout `app.use('/api', …)`.
- [advertiser-sites.routes.ts](../../central-server/src/routes/advertiser-sites.routes.ts) : rate limits déclarés **per-route** (`adminRateLimit` sur GET, `sensitiveRateLimit` sur mutations).
- [user-rate-limit.ts](../../central-server/src/middleware/user-rate-limit.ts) : `createLimitHandler` pose `Access-Control-Allow-Origin: *` + `Cross-Origin-Resource-Policy: cross-origin` sur tout 429 → plus jamais de cascade `NotSameOrigin`.

### Data — correction DB prod

- [fix-joueur-detaille-asset-urls-railway.sql](../../central-server/src/scripts/migrations/fix-joueur-detaille-asset-urls-railway.sql) : migration corrective idempotente qui `UPDATE` les `template_layers` + `template_variants` contenant encore `/studio/joueur-detaille/` pour les repointer vers Railway.

### Monitoring — détection runtime

- [metrics.service.ts](../../central-server/src/services/metrics.service.ts) : nouveau counter `neopro_template_asset_proxy_upstream_total{status_class}` (2xx / 3xx / 4xx / 5xx / error).
- [remotion-templates.controller.ts](../../central-server/src/controllers/remotion-templates.controller.ts) : `proxyTemplateAsset` émet la metric sur chaque réponse upstream + log warning sur 4xx/5xx. Toute nouvelle cascade d'URLs cassées (nouveau seed, typo dashboard) est immédiatement visible dans Prometheus.

## Anti-régression (smoke tests)

4 invariants verrouillés dans [smoke-remotion.test.ts](../../central-server/src/__tests__/smoke/smoke-remotion.test.ts) :

1. `server.ts ne monte AUCUN rate limiter sur le préfixe /api nu (anti-pattern global)` — bloque tout nouveau `app.use('/api', xxxRateLimit, …)`.
2. `asset-proxy est monté AVANT tout app.use("/api", …)` — defense-in-depth.
3. `migration fix-joueur-detaille-asset-urls-railway.sql repoint les layers vers Railway` — verrouille la migration corrective.
4. `proxyTemplateAsset émet la metric Prometheus recordTemplateAssetProxyUpstream (ADR-087)` — garantit que le monitoring reste câblé.

## Déploiement

- Migration DB : auto-appliquée par `npm run db:migrate` au boot Railway (piste `schema_migrations`).
- Vérification prod : `curl -sI` sur `/api/remotion-templates/asset-proxy?url=…` ne doit plus porter `ratelimit-*` ; Grafana panel Prometheus `neopro_template_asset_proxy_upstream_total` doit montrer ~100 % `2xx`.

## Hors scope

- Les rate limiters `publicRateLimit` / `remoteRateLimit` / `piAnalyticsRateLimit` restent montés au niveau router (pas `/api` nu) — pas impactés par cette règle.
- La future UI d'upload admin pour Template Studio v2 (référence designer définitive des assets joueur-détaillé) reste traquée dans ADR-086.
