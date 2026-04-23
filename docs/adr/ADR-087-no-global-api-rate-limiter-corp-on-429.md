# ADR-087: Pas de rate limiter sur le préfixe `/api` nu + CORP/CORS sur 429

**Date** : 2026-04-23
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Incident prod : `GET /api/remotion-templates/asset-proxy` renvoyait des 429 en cascade dès l'ouverture d'un template dans le Template Studio. Le `<video>` Remotion émet N range requests par asset (seek + buffering), chacune consommait un slot du quota `apiRateLimit` (100 req/min). Les 429 servis **n'avaient pas** les headers `Cross-Origin-Resource-Policy` / `Access-Control-Allow-Origin` → Chrome basculait en `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` et masquait la cause réelle, ce qui faisait boucler le player.

Root cause : `app.use('/api', apiRateLimit, advertiserSitesRoutes)` attachait `apiRateLimit` au **préfixe `/api` global**. Express l'exécutait pour toute requête `/api/*` avant même de matcher le router advertiser — y compris sur `/api/remotion-templates/asset-proxy` qui devait rester non-limité.

## Décision

1. **Interdire tout rate limiter monté sur `app.use('/api', xxxRateLimit, …)`**. Les rate limits se posent **uniquement par route** dans les fichiers `routes/*.routes.ts` (pattern déjà utilisé pour `content.routes.ts`, `analytics.routes.ts`).
2. **Garantir les headers `Access-Control-Allow-Origin: *` + `Cross-Origin-Resource-Policy: cross-origin` sur les 429** renvoyés par `createLimitHandler`. Sans ça, un proxy cross-origin (asset-proxy aujourd'hui, futurs proxies demain) se faisant rate-limiter renvoie un 429 « nu » qui cascade en `NotSameOrigin` côté browser.
3. **Monter `/api/remotion-templates/asset-proxy` avant tout `app.use('/api', …)`** dans `server.ts` — defense-in-depth au cas où un futur middleware global viendrait quand même intercepter.
4. **Instrumenter `proxyTemplateAsset`** avec la metric `neopro_template_asset_proxy_upstream_total{status_class}` pour détecter toute nouvelle cascade d'erreurs FTP (404/5xx) au runtime — un seed cassé ou une URL erronée se voit immédiatement dans Prometheus/Grafana.

## Alternatives rejetées

- **Augmenter la limite `apiRateLimit` à 1000/min** : masque le problème sans le résoudre ; le découplage global/per-route est plus sain.
- **Exempter manuellement `/asset-proxy` du rate limiter** : fragile, dépendant de l'ordre des middlewares, illisible.
- **Alert Prometheus sur `rate_limit_hits_total{limiter=api}`** : trop bruité (beaucoup de routes légitimes passent par `apiRateLimit`), détecte la conséquence pas la cause.

## Conséquences

- **Positif** : toute régression future (nouveau `app.use('/api', xxxRateLimit, …)`) est bloquée par 2 smoke tests dans `smoke-remotion.test.ts` ; la metric asset-proxy remonte directement les 4xx/5xx upstream.
- **Positif** : les 429 cross-origin ne causeront plus de cascade `NotSameOrigin` silencieuse.
- **Négatif** : chaque nouvelle route doit penser à déclarer son propre rate limiter (ou utiliser les defaults `adminRateLimit`/`sensitiveRateLimit`). Les fichiers `routes/*.routes.ts` gagnent quelques lignes, mais c'est explicite plutôt qu'implicite.

## Fichiers impactés

- [central-server/src/server.ts](../../central-server/src/server.ts) — asset-proxy mount déplacé avant `app.use('/api', setRLSContext)`, `apiRateLimit` retiré du mount `advertiserSitesRoutes`.
- [central-server/src/routes/advertiser-sites.routes.ts](../../central-server/src/routes/advertiser-sites.routes.ts) — rate limits déclarés per-route (`adminRateLimit` pour GET, `sensitiveRateLimit` pour mutations).
- [central-server/src/middleware/user-rate-limit.ts](../../central-server/src/middleware/user-rate-limit.ts) — `createLimitHandler` pose `Access-Control-Allow-Origin` + `Cross-Origin-Resource-Policy` sur le 429.
- [central-server/src/controllers/remotion-templates.controller.ts](../../central-server/src/controllers/remotion-templates.controller.ts) — `proxyTemplateAsset` incrémente la metric par classe de statut upstream.
- [central-server/src/services/metrics.service.ts](../../central-server/src/services/metrics.service.ts) — counter `neopro_template_asset_proxy_upstream_total`.
- [central-server/src/scripts/migrations/fix-joueur-detaille-asset-urls-railway.sql](../../central-server/src/scripts/migrations/fix-joueur-detaille-asset-urls-railway.sql) — corrective migration repointant les `template_layers` `JoueurDetaille` vers Railway.
- [central-server/src/**tests**/smoke/smoke-remotion.test.ts](../../central-server/src/__tests__/smoke/smoke-remotion.test.ts) — 4 smoke tests enforcent les invariants ci-dessus.
- [.claude/rules/api-routes.md](../../.claude/rules/api-routes.md) — anti-pattern « global /api rate limiter » documenté.
