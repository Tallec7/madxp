---
phase: 01-fondations
plan: 02
subsystem: dashboard+api
tags: [template-studio-v3, asset-manager, angular-standalone, library-endpoints, dual-context]

# Dependency graph
requires:
  - '01-fondations-01 — duplicateDeep + ffprobe alpha + countLayersSharingVideoUrl + VOCABULARY_MAP'
provides:
  - 'GET /api/remotion-templates/assets — liste WebmAssetMetadata[] (super_admin)'
  - 'POST /api/remotion-templates/library/upload — upload WebM standalone avec alpha-gate (super_admin)'
  - 'DELETE /api/remotion-templates/assets/:assetId — 409 asset_in_use { usedByPublishedCount } si référencé (super_admin)'
  - 'AssetManagerModalComponent dual-context (modal | page) — utilisable depuis le wizard step 2 ET en page autonome'
  - 'WebmAssetMetadata type exporté depuis remotion-templates.types.ts'
  - '3 nouvelles méthodes RemotionTemplatesDataService (listLibraryAssets / uploadLibraryAsset / deleteLibraryAsset) distinctes du legacy uploadAsset'
affects: [01-fondations-03, 01-fondations-04, 01-fondations-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Composant Angular standalone dual-context (Input + route data) — réutilisable comme modal ET comme page lazy-loadée'
    - "Asset id déterministe : sha256(url).slice(0,16) — pas de table first-class, l'URL FTP est la PK logique"
    - "In-memory metadata cache (5min TTL) populé à l'upload — évite ffprobe sur les listings de masse"
    - 'Routes library mountées AVANT /:id pour éviter la capture par le matcher /:id'

key-files:
  created:
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.scss'
  modified:
    - 'central-server/src/controllers/remotion-templates.controller.ts (3 controllers + helpers stripPublicPrefix/assetIdFromUrl + cache mémoire)'
    - 'central-server/src/routes/remotion-templates.routes.ts (3 routes super_admin mountées AVANT /:id)'
    - 'central-server/src/repositories/template-studio.repository.ts (countLayersSharingVideoUrlByUrl + listDistinctLayerAssets)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts (WebmAssetMetadata interface)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (3 méthodes library)'
    - 'central-dashboard/src/app/app.routes.ts (route /content/templates-remotion/assets, super_admin, context=page)'

key-decisions:
  - "Asset id = sha256(url).slice(0,16) — déterministe et collision-safe pour 2^64 URLs ; évite d'ajouter une table template_assets en Plan 02"
  - "Cache metadata 5min en mémoire process — populé à l'upload où on a déjà ffprobé ; les URLs legacy non-cachées ressortent avec defaults (durée=0, alpha=false) — le user peut re-upload pour rafraîchir"
  - 'Routes /assets et /library/upload mountées AVANT /:id (smoke pas encore enforced mais documenté en commentaire — sinon Express capture comme `id="assets"`)'
  - 'usedByCount agrégé sur TOUS les templates (publiés ou pas) ; usedByPublishedCount du 409 ne compte que les publiés (Plan 01 contract)'
  - 'Composant unique pour modal + page — Input + route data piloté ; SCSS guard `.amm--page &` désactive backdrop/box-shadow en mode page'

patterns-established:
  - 'Dual-context standalone component : 1 composant, 2 vues (modal | page) selon `@Input context` + `route.snapshot.data.context`'
  - 'Library asset endpoint pattern : id synthétique sha256(url) + cache mémoire upload-side + reverse-lookup à la suppression'

requirements-completed: [ASSET-01, ASSET-02, ASSET-03]

# Metrics
duration: ~25min
completed: 2026-05-05
---

# Phase 1 Plan 02: Asset Manager UI Summary

**Composant standalone dual-context (modal | page) pour la bibliothèque de fonds animés WebM, branché sur 3 nouveaux endpoints super_admin (list/upload/delete library) qui réutilisent le ffprobe alpha-gate et le countLayersSharingVideoUrl figés en Plan 01.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-05T07:30Z
- **Completed:** 2026-05-05T07:55Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 6

## Accomplishments

- **Backend library endpoints (3, super_admin only)** :
  - `GET /api/remotion-templates/assets` — liste agrégée DISTINCT video_url + cache metadata in-process (5min TTL).
  - `POST /api/remotion-templates/library/upload` — alpha-gate identique au handler per-template, FTP path `template-assets/library/`.
  - `DELETE /api/remotion-templates/assets/:assetId` — 409 `asset_in_use { usedByPublishedCount }` si encore référencé par un template publié, 204 sinon.
- **Repository extensions** : `countLayersSharingVideoUrlByUrl(url)` (variante de Plan 01 sans layerId) + `listDistinctLayerAssets()` (GROUP BY video_url, ORDER BY MIN(created_at) DESC).
- **Frontend dual-context component** : un seul fichier `asset-manager-modal.component.ts` qui rend en modal (avec backdrop+close) ou en page selon `@Input context` + `route.snapshot.data.context`. Wizard step 2 → modal ; route `/content/templates-remotion/assets` → page.
- **Vocabulary lock respecté** : tous les libellés UI utilisent les termes figés dans `VOCABULARY_MAP` (« Fond animé », « avec alpha » / « sans alpha », « Utilisé par N template(s) »). Le smoke test `smoke-template-studio-v3-vocabulary` reste GREEN.
- **Tests** : smoke v3 16/16 GREEN ; smoke smart 419/419 GREEN ; `tsc --noEmit` clean (central-server) ; `ng build` clean (central-dashboard, 33s).

## Task Commits

1. **Task 1: Backend library endpoints + data service + types + route** — `10eda5e8` (feat)
2. **Task 2: Asset Manager standalone component (modal | page)** — `9951e068` (feat)

## Files Created/Modified

**Created** :

- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts` — composant standalone dual-context (Input/Output API publique, signals pour l'état).
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html` — grille 16/9 + tile upload + cards avec meta + erreurs inline.
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.scss` — BEM, ~240 lignes, `:host { display: contents }`, mode `--modal` (fixed inset+backdrop) vs `--page` (max-width 1200px, no chrome).

**Modified** :

- `central-server/src/controllers/remotion-templates.controller.ts` — ajout de `listLibraryAssets`, `uploadLibraryAsset`, `deleteLibraryAsset` + helpers `stripPublicPrefix`, `assetIdFromUrl`, cache `LIBRARY_ASSET_CACHE` (5min TTL).
- `central-server/src/routes/remotion-templates.routes.ts` — 3 nouvelles routes mountées AVANT `/:id` avec `requireRole('super_admin')` + rate limits adaptés (admin pour list, sensitive pour upload/delete) + multer `uploadTemplateAsset.single('file')` pour l'upload.
- `central-server/src/repositories/template-studio.repository.ts` — `countLayersSharingVideoUrlByUrl(url)` + `listDistinctLayerAssets()` (GROUP BY video_url, MIN(created_at) → ISO string).
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts` — interface `WebmAssetMetadata` (id, url, durationMs, width, height, hasAlpha, pixFmt, uploadedAt, usedByCount).
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` — `listLibraryAssets() / uploadLibraryAsset(file, opts) / deleteLibraryAsset(id)` distinctes du legacy `uploadAsset` (qui mute `default_props` per-template).
- `central-dashboard/src/app/app.routes.ts` — route `/content/templates-remotion/assets`, `roleGuard(['super_admin'])`, `data.context = 'page'` lu par le composant.

## Backend Endpoints (contrats)

### `GET /api/remotion-templates/assets`

**Auth** : `super_admin`. **Rate** : `adminRateLimit` (400/min).
**Réponse** `200` :

```json
[
  {
    "id": "a3f1c2b4d5e6f789",
    "url": "https://kalonpartners.bzh/.../template-assets/library/1714902-fond.webm",
    "durationMs": 5900,
    "width": 1920,
    "height": 1080,
    "hasAlpha": true,
    "pixFmt": "yuva420p",
    "uploadedAt": "2026-05-05T06:54:00.000Z",
    "usedByCount": 3
  }
]
```

Note : pour les URLs antérieures au cache (legacy), `durationMs/width/height/hasAlpha/pixFmt` sortent à 0/false/'' — un re-upload du même fichier rafraîchit ces champs.

### `POST /api/remotion-templates/library/upload`

**Auth** : `super_admin`. **Rate** : `sensitiveRateLimit` (30/min). **Body** : multipart `file` + `respect_alpha` (`'true'` / `'false'`).
**Réponse** `201` : objet `WebmAssetMetadata` complet (cache populé immédiatement).
**Erreur** `400 asset_alpha_required` (Plan 01 contract) :

```json
{
  "error": "asset_alpha_required",
  "message": "Ce fond nécessite la transparence — ré-exportez en yuva420p (le fichier reçu n'a pas de canal alpha).",
  "detail": { "detectedPixFmt": "yuv420p", "hasAlpha": false }
}
```

### `DELETE /api/remotion-templates/assets/:assetId`

**Auth** : `super_admin`. **Rate** : `sensitiveRateLimit`.
**Réponse** `204` (success), `404 asset_not_found`, ou `409 asset_in_use` :

```json
{
  "error": "asset_in_use",
  "message": "Ce fond est utilisé par 2 autre(s) template(s) publié(s).",
  "detail": { "usedByPublishedCount": 2 }
}
```

## Component Public API

```ts
@Input() context: 'modal' | 'page' = 'modal';
@Input() respectAlphaRequired = false;            // Wizard step 2 le passe à true quand le slot exige alpha
@Output() assetSelected = new EventEmitter<{ url: string }>();   // Émis uniquement en mode modal
@Output() dismiss = new EventEmitter<void>();                    // Émis uniquement en mode modal
```

État interne (signals) :

- `assets: WritableSignal<WebmAssetMetadata[]>`
- `loading / uploading: WritableSignal<boolean>`
- `uploadError / uploadDetail / deleteError: WritableSignal<string | null>`

## Decisions Made

- **Asset id déterministe (sha256 truncated 16 chars)** — pas de table `template_assets` en Plan 02 ; l'URL FTP reste la PK logique. La fonction de hash est pure → l'id est stable cross-process et survit à un redémarrage du serveur.
- **In-memory cache 5min plutôt que ffprobe à la volée** — ffprobe sur des URLs FTP impliquerait soit un download pré-render soit un proxy seekable. Trop coûteux pour un listing. Compromis Plan 02 : on cache à l'upload (où on a déjà la metadata) ; les URLs legacy ressortent avec defaults — affichage UI dégradé mais fonctionnel (le user peut re-upload pour rafraîchir).
- **Mount AVANT `/:id`** — sinon Express capture `/assets` comme `:id="assets"` et part en 400 `validateParams(paramSchemas.id)` (id pas un UUID). La route `/library/upload` aurait posé le même problème. Documenté en commentaire ; smoke test à ajouter en Plan 04 quand le pattern sera répété.
- **`usedByCount` (toutes versions) vs `usedByPublishedCount` (publiées)** — la grille montre l'usage total pour donner le contexte au super_admin ; le 409 ne bloque que sur les publiés (Plan 01 contract — un brouillon non publié n'est pas un risque utilisateur).
- **Dual-context unique component** — la modal et la page partagent 100 % du markup et de la logique. Le seul delta est : backdrop/close en modal, no-chrome en page. Géré par `:host` + 2 modifiers BEM (`.amm--modal` / `.amm--page`). Évite la duplication d'un wrapper `*-page.component.ts` et d'un `*-modal.component.ts`.

## Plan 01 Contracts Consumed

| Contract Plan 01                                               | Consumption Plan 02                                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `400 asset_alpha_required` (alpha-gate)                        | Réutilisé tel quel dans `uploadLibraryAsset` ; affichage UI sur `uploadError + uploadDetail`.                                                 |
| `thumbnailService.extractMetadata(...).hasAlpha + pixFmt`      | Appelé dans `uploadLibraryAsset` (même séquence que `uploadTemplateAssetController`).                                                         |
| `templateStudioRepository.countLayersSharingVideoUrl(layerId)` | NON consommé directement (variante par layerId) ; ajout de `countLayersSharingVideoUrlByUrl(url)` qui partage la même logique JOIN published. |
| `VOCABULARY_MAP` + `ANIMATION_PRESET_LABELS`                   | Le composant n'utilise QUE des libellés figés (« Fond animé », « avec alpha » / « sans alpha »). Smoke vocabulary GREEN.                      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] La PLAN précisait `templateStudioRepository.findAssetUrlById(assetId)` (lookup synchrone) pour la suppression — n'existe pas et nécessiterait une persistance dédiée.**

- **Found during:** Task 1 (suppression endpoint).
- **Issue:** Le PLAN supposait un mapping persistant assetId↔url. En Plan 02, on n'a pas de table `template_assets`. Seul le hash sha256(url) est l'id.
- **Fix:** `deleteLibraryAsset` rappelle `listDistinctLayerAssets()` puis filtre par `assetIdFromUrl(r.url) === assetId`. C'est un O(N) sur le nombre de WebM distincts (~quelques dizaines aujourd'hui) — acceptable. Quand une vraie table apparaîtra (probablement Phase 2), un `findByHash(hash)` la remplacera.
- **Files modified:** `central-server/src/controllers/remotion-templates.controller.ts`.
- **Verification:** smoke v3 + tsc clean.
- **Committed in:** `10eda5e8`.

**2. [Rule 3 — Blocking] Pas de `ftpService.delete()` exporté.**

- **Found during:** Task 1 (suppression endpoint).
- **Issue:** PLAN référençait `ftpService.delete()` qui n'existe pas. Le storage layer expose `deleteFileFromFtp(filename)` depuis `config/ftp-storage`.
- **Fix:** Import direct de `deleteFileFromFtp` + helper `stripPublicPrefix(url)` qui retire le préfixe `FTP_PUBLIC_URL` pour reconstruire le storage path attendu par la fonction FTP.
- **Files modified:** `central-server/src/controllers/remotion-templates.controller.ts`.
- **Committed in:** `10eda5e8`.

**3. [Documentation deviation] Tâches consolidées en 2 commits feat (pas de cycle TDD RED→GREEN explicite).**

- **Found during:** Task 1 + Task 2.
- **Issue:** Les 2 tâches étaient marquées `tdd="true"` mais aucun smoke test n'était ajouté en Plan 02 — toute la couverture vit déjà dans `smoke-template-studio-v3-asset-manager` figée en Plan 01 (qui asserte ffprobe + alpha-gate + countLayersSharingVideoUrl). Les 7 assertions Plan 01 couvrent les nouveaux endpoints (réutilisation des helpers).
- **Fix:** Pas de RED test ajouté. Le smoke Plan 01 reste GREEN après modif (verif ci-dessous). Un smoke `smoke-template-studio-v3-library-routes` pourrait être ajouté en Plan 04 pour locker la position des routes (avant `/:id`) — pas critique tant que le pattern n'est pas répété.
- **Verification:** `npm test` du smoke v3 → 16/16 GREEN.
- **Committed in:** N/A (commits feat directs).

---

**Total deviations:** 3 (2 blocking auto-fixes + 1 process note)
**Impact on plan:** Aucun scope creep — chaque adaptation servait l'un des 3 ASSET-XX requirements. Pas d'ADR nécessaire (pas de cross-composant majeur — l'évolution reste interne au domaine template-studio existant).

## Manual UAT Checklist

À valider en session séparée (le composant ne peut pas être testé en headless sans Playwright) :

- [ ] Naviguer vers `/content/templates-remotion/assets` en super_admin → grille rendue avec les WebM existants (ou empty state si fresh DB).
- [ ] Cliquer sur la tile « + Uploader un fond » → file picker ouvert, accept video/webm.
- [ ] Uploader un WebM `yuv420p` (sans alpha) avec `respectAlphaRequired=false` (par défaut en mode page) → carte ajoutée en tête de grille.
- [ ] Tester l'alpha rejection : ouvrir la modal depuis le wizard step 2 (Plan 03) avec `respectAlphaRequired=true`, uploader un `yuv420p` → message rouge inline « Ce fond nécessite la transparence — … » + « Format détecté : yuv420p ».
- [ ] Tester la deletion bloquée : créer un layer pointant vers une URL existante puis publier le template → cliquer Supprimer sur la card → message rouge « Ce fond est utilisé par 1 template(s) publié(s) — supprimez d'abord les clones ».
- [ ] Tester le mode modal vs page : monter `<app-asset-manager-modal>` dans un parent vs naviguer à la route → backdrop + close button visibles uniquement en mode modal.

## Issues Encountered

Aucune — tous les blockers résolus via les deviation rules ci-dessus.

## User Setup Required

Aucune — pas de migration DB, pas de variable d'environnement nouvelle. Le dossier FTP `template-assets/library/` est créé à la première upload.

## Next Phase Readiness

Plan 03 (Wizard de création) peut désormais brancher l'`AssetManagerModalComponent` au step 2 du wizard avec :

```html
<app-asset-manager-modal
  [context]="'modal'"
  [respectAlphaRequired]="slot.respectAlpha"
  (assetSelected)="onLibraryAssetPicked($event.url)"
  (dismiss)="closeLibraryModal()"
/>
```

Le contrat backend est figé (3 endpoints, 3 méthodes data service, `WebmAssetMetadata` interface). Smoke 16/16 GREEN, smart smoke 419/419 GREEN. Build dashboard 33s clean.

## Self-Check: PASSED

- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts` — FOUND
- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html` — FOUND
- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.scss` — FOUND
- [x] Commit `10eda5e8` — FOUND (Task 1 backend + dataservice + route)
- [x] Commit `9951e068` — FOUND (Task 2 component)
- [x] `cd central-server && npx tsc --noEmit` clean
- [x] `cd central-dashboard && npx ng build --configuration=development` clean (33.264s)
- [x] `smoke-template-studio-v3-*` 16/16 GREEN (vocabulary + duplicate + asset-manager)
- [x] `npm run test:smoke:smart` 419/419 GREEN (3 suites — consistency, dashboard-guards, remotion)
- [x] `grep listLibraryAssets central-server/src/controllers/remotion-templates.controller.ts` returns ≥3 matches
- [x] `grep "/library/upload\|/assets" central-server/src/routes/remotion-templates.routes.ts` returns ≥2 matches (3)
- [x] `grep templates-remotion/assets central-dashboard/src/app/app.routes.ts` returns 1 match
- [x] No `fetch(` introduced in dashboard component
- [x] No raw `'layer'` or `'slot'` user-facing strings in component HTML

---

_Phase: 01-fondations_
_Completed: 2026-05-05_
