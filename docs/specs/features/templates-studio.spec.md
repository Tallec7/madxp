# SPEC : Templates Studio V1 (code-driven)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-16
> **last_verified** : 2026-05-16
> **verified_against_commit** : main @ ADR-129

> ⚠️ **Pointer de SPEC vivante** : la SPEC détaillée des templates V1 vit dans le sibling repo
> `studio-template/templates-remotion/spec/STUDIO_V1.md` (composition Remotion + manifest +
> recette de portage). Cette SPEC `docs/specs/` n'en est que le pointer + le contrat d'invariants
> côté `neopro/`.
>
> **Historique** : le système V2 data-driven legacy (ADR-052/054/055/075/077/084/086/095/108/109/110/118)
> a été supprimé en **ADR-129** ([apps#1029](https://github.com/Tallec7/neopro/pull/1029) /
> [apps#1030](https://github.com/Tallec7/neopro/pull/1030) /
> [apps#1031](https://github.com/Tallec7/neopro/pull/1031) + cette PR). V1 est désormais
> l'unique implémentation.

## En une phrase

Templates Studio V1 = chaque template vidéo Neopro = **1 `.tsx` Remotion + 1 `manifest.json`** dans
`central-server/templates-studio/`, bundlé in-process par `studio-render-worker.service.ts`,
exposé via `/api/templates-studio/*` et le dashboard `/templates-studio`.

## Périmètre

**Dans le périmètre** :

- Compositions Remotion versionnées dans `central-server/templates-studio/<slug>/` (1 dossier =
  1 template, contient `template.tsx` + `manifest.json` + assets locaux éventuels).
- Asset library globale partagée (`studio_assets` + `studio_template_asset_bindings`) — ADR-125.
- Player roster (`studio_players` + `studio_player_site_grants`) avec grants multi-sites — ADR-123.
- Polices custom servies via `studio_assets` + hook `useCustomFont` — ADR-127.
- Assets type `directory` (séquences PNG frames pour masques alpha) — ADR-128.
- Brand-kit per-site (logos club, couleurs, fonts override) — `site_brand_kits`.
- Worker render in-process : poll `studio_render_requests` toutes les 2s, bundle Remotion +
  renderMedia, upload FTP (ADR-124 — consolidation du studio-render-server satellite ADR-118
  désormais déprécié).
- Worker photo-cutout in-process (BiRefNet via `@imgly/background-removal-node` ONNX) —
  ADR-124 (architecture) + ADR-131 (install effective de la lib Phase 2 + mock jest global).
- Distribution multi-sites des renders via le pattern grants ADR-082 (réutilisé par ADR-123).
- Rate limit + CORP/CORS sur les routes Studio (ADR-087 sur asset-proxy).

**Hors périmètre** :

- Templates Lottie (different stack, `/content/templates` route, `lottie-templates.component`).
- Templates V2 data-driven supprimés en ADR-129.
- Préparation de rushes vidéo bruts (= contenu utilisateur classique, cf. `video-cycle.spec.md`).

## Règles métier

1. **Un template ne peut pas être édité visuellement depuis le dashboard.** Toute modification
   passe par un commit `.tsx` + `manifest.json`. C'est volontaire (typage strict, review code,
   versioning git).
2. **Le manifest déclare le contrat I/O** : `requiredAssets[]` (avec slug, kind, fontFamily?,
   optional/required), `props[]` (texte, couleurs, joueur sélectionné). Le dashboard build le
   form à partir de ce manifest.
3. **Les assets sont des références par `slug`**, jamais des URLs. Le binding asset_id ↔ slug est
   résolu côté worker via `studio_template_asset_bindings` (ADR-125).
4. **Les renders sont distribuables** : ADR-123 + grants pattern ADR-082 permettent qu'un site
   admin push un render vers N sites clients sans dupliquer le rendu.
5. **Pas de Chromium séparé** : le primary path est `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium`
   (système, installé dans le Dockerfile runtime). Le `npx remotion browser ensure` n'est qu'un
   safety net fallback.
6. **Manifest seed au boot** : `seed-templates-studio-manifests.ts` synchronise les manifests
   vendored dans `template_definitions` à chaque démarrage (idempotent).

## Comportements observables

- `GET /api/templates-studio/templates` retourne la liste des templates actifs (`is_active = true`).
- `POST /api/templates-studio/renders` enqueue un job de rendu, retourne `{ id, status: 'pending' }`.
- Worker render poll `studio_render_requests WHERE status = 'pending'` toutes les 2s, claim avec
  `FOR UPDATE SKIP LOCKED`.
- Dashboard `/templates-studio` affiche le catalogue, formulaire dynamique à partir du manifest,
  preview iframe via `@remotion/player`.
- Render terminé → row `studio_render_requests.status = 'ready'`, `output_url` pointe sur FTP.
- Si le client a un grant via `studio_player_site_grants`, le render apparaît sur tous les sites
  grantés.

## Cas d'edge

- **Asset binding manquant** : si le manifest demande un `slug` que `studio_template_asset_bindings`
  ne résout pas, le render échoue avec `error_message: "binding not found: <slug>"`. Le dashboard
  remonte l'erreur dans le panel admin Asset Library.
- **Font custom manquante** : si `manifest.requiredAssets[i].fontFamily` n'est pas servie via
  `studio_assets`, le composant Remotion utilise une font fallback (Inter/system) et le render
  réussit avec une dérive visuelle. Smoke `smoke-templates-studio-fonts.test.ts` garde-fou.
- **Directory asset (PNG frames)** : ADR-128 — type `directory` listé via FTP listing avant
  d'être consommé par `OffthreadVideo` ou `Img` selon le composant.
- **Worker render crash** : `failStaleRunningJobs(10)` au boot relâche les rows `status = 'rendering'`
  bloquées par un process mort.
- **Asset proxy 4xx/5xx** : ADR-087 — réponse 429 doit poser CORP/CORS, sinon cascade
  `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` côté `<video>` Remotion.

## Ce qui n'est PAS dans ce domaine

- **Édition WYSIWYG de templates** depuis le dashboard. Volontaire (cf. règle 1).
- **Marketplace de templates** entre clubs. Hors scope court-terme.
- **Render local** sur le Pi. Tous les renders se font côté central server (Chromium + ffmpeg +
  GPU CPU côté Railway).
- **Templates Lottie** — voir `lottie-templates.component`.
- **Système V2 data-driven** — supprimé en ADR-129.

## Références

- **ADRs V1** : [ADR-082](../../adr/ADR-082-video-club-grants.md) (pattern grants),
  [ADR-087](../../adr/ADR-087-no-global-api-rate-limiter-corp-on-429.md) (CORP/CORS asset proxy),
  [ADR-123](../../adr/ADR-123-templates-studio-v1-sharing-distribution.md) (distribution multi-sites),
  [ADR-124](../../adr/ADR-124-templates-studio-consolidation-in-central.md) (consolidation in-process),
  [ADR-125](../../adr/ADR-125-templates-studio-asset-library.md) (asset library globale),
  [ADR-127](../../adr/ADR-127-templates-studio-custom-fonts.md) (fonts custom),
  [ADR-128](../../adr/ADR-128-templates-studio-asset-directory.md) (asset type directory).
- **ADR de suppression V2** : [ADR-129](../../adr/ADR-129-kill-templates-studio-v2-legacy.md).
- **Spec source V1** : `studio-template/templates-remotion/spec/STUDIO_V1.md` (sibling repo).
- **Recette E2E** : `docs/runbooks/STUDIO-RECIPE.md`.
- **Guide portage** : `docs/templates/STUDIO-PORTING-GUIDE.md`.
- **Worker** : [`central-server/src/services/studio-render-worker.service.ts`](../../../central-server/src/services/studio-render-worker.service.ts).
- **Routes** : [`central-server/src/routes/templates-studio.routes.ts`](../../../central-server/src/routes/templates-studio.routes.ts).
- **Dashboard** : [`central-dashboard/src/app/features/templates-studio/`](../../../central-dashboard/src/app/features/templates-studio/).
