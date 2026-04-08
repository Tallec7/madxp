# 2026-04-08 — Club portal & SaaS hardening session

Session summary covering all changes from `bcbca437` (3.133.2) to `a24161c9` (3.136.4).

## Themes

### 1. Club portal UX (rose theme + restructure)

- **Rose theme** scoped to `.layout.club-theme` (no impact on admin views).
  Palette : fond `#3D3036`, primary `#FE6AA6`, light `#FF9EC6`.
- **SaaS quick actions** (Ouvrir l'écran / télécommande, QR codes, Aperçu live)
  extracted into shared `ClubSaasActionsComponent` and moved from
  "Ma boucle" → "Mon club" main dashboard page.
- **Aide button + modal** moved alongside the SaaS actions for a single
  consistent entry point on the dashboard.
- **i18n cache-bust** : `provideTranslateHttpLoader` suffix now appends
  `?v=${Date.now()}` to defeat stale CDN/browser cache after deploy.
- **FAQ keys** (`clubPortal.faq.screens|live|offline`) extracted from
  hardcoded HTML, cleared the i18n linter.

### 2. SaaS site analytics pipeline

- `getSaasConfig` now enriches the served config with sponsor analytics
  metadata (`video_id`, `advertiser_id`, `analytics_category`) so the
  browser TV reports `category: 'sponsor'` instead of fallback `'other'`.
- TV SaaS now starts an analytics session at boot (was waiting on a
  user interaction that never came in kiosk mode).
- "Écrans connectés" count corrected (was counting socket connections
  instead of unique browser tabs per site).
- Analytics 404 + spurious "manual player error" toast fixed (the SaaS
  player was hitting the Pi-only `/configuration.json` route).
- `getSiteLocalContent` now reads SaaS config from `config_profiles`
  (the source of truth for SaaS) instead of the empty
  `local_config_mirror` row.

### 3. Subscription tier gating (ADR-039)

- New `feat(billing)`: additive tier gating across the club portal.
  Premium/pro features hidden behind `SubscriptionTierService` checks
  without breaking existing free-tier sites.
- See `docs/adr/ADR-039-subscription-tier-additive-strategy.md`.

### 4. Dashboard 429 storms (rate-limit refactor)

- The global `sensitiveRateLimit` (30/min) on the `/api` mount was
  applied to `GET /videos` and `GET /deployments` — 3-6 dashboard
  navigations were enough to exhaust the quota and trigger a 429
  cascade.
- Per-route limits installed in `content.routes.ts`:
  - GET → `adminRateLimit` (400/min)
  - uploads → `uploadRateLimit` (10/h)
  - mutations → `sensitiveRateLimit` (30/min)
- The `/api` mount no longer wraps `contentRoutes` with
  `sensitiveRateLimit`.

### 5. Cross-cutting fixes

- `siteRepository.findConnectionInfo` now returns `software_version`
  (was missing from the SELECT and broke the SaaS dashboard's version
  card after a TS strict bump).
- Raspberry `socket.service.ts` casts `.off()` to satisfy the typed
  Socket.IO client (no behavioural change).

## Regression guards added

`central-server/src/__tests__/smoke.test.ts` now contains:

1. **`content.routes rate-limit guard`** — fails if a future refactor
   reintroduces `sensitiveRateLimit` on `GET /videos` / `GET /deployments`
   or wraps `contentRoutes` globally on the `/api` mount.
2. **`club portal SaaS actions placement guard`** — fails if
   `<app-club-saas-actions>` or `<app-club-help-modal>` reappear on the
   "Ma boucle" page or disappear from "Mon club".

These join the existing ~819 smoke tests run by `npm run test:smoke`.

## Monitoring

The SaaS analytics session/écrans-connectés fixes feed the existing
dashboard cards (`getSaasClientCount()`, `countSessions()`,
`countSponsorsDisplayed()`, `getCompletionRate()`) which are surfaced on
`site-detail` for SaaS sites. No new monitoring infra was required —
the gap was data correctness, now closed.

## Files modified (high level)

- `central-dashboard/src/app/features/club-portal/*` (theme, saas
  actions, dashboard, loop, help modal, FAQ keys)
- `central-dashboard/src/app/features/layout/layout.component.ts` (rose
  theme class binding)
- `central-dashboard/src/app/app.config.ts` (i18n cache-bust)
- `central-dashboard/src/assets/i18n/{fr,en,es}.json` (FAQ keys + tier
  copy)
- `central-server/src/controllers/saas.controller.ts` (analytics
  enrichment, config_profiles fallback)
- `central-server/src/routes/content.routes.ts` + `server.ts` (per-route
  rate limits)
- `central-server/src/repositories/site.repository.ts`
  (`software_version` in `findConnectionInfo`)
- `raspberry/src/app/services/socket.service.ts` (typed `.off()` cast)
- `central-server/src/__tests__/smoke.test.ts` (regression guards)
- `docs/adr/ADR-039-subscription-tier-additive-strategy.md`
