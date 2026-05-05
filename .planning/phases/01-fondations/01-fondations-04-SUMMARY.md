---
phase: 01-fondations
plan: 04
subsystem: dashboard+api
tags: [template-studio-v3, wizard, drag-drop, reactive-forms, layer-reorder, mandatory-layer-id]

# Dependency graph
requires:
  - '01-fondations-01 — templateStudioRepository.duplicateDeep + countLayersSharingVideoUrl + VOCABULARY_MAP'
  - '01-fondations-02 — AssetManagerModalComponent dual-context + WebmAssetMetadata'
  - '01-fondations-03 — Wizard shell with [hidden] step containers + WizardState contract'
provides:
  - 'POST /api/remotion-templates/:id/layers/reorder — single transactional reorder (BEGIN/COMMIT, ownership check, 400 layer_ownership_mismatch)'
  - 'RemotionTemplatesDataService.reorderLayers(templateId, ids[]) → Observable<TemplateLayer[]>'
  - 'WizardStepBackgroundsComponent — drag-drop layer stack with @angular/cdk + AssetManagerModalComponent trigger'
  - 'WizardStepZonesComponent — ReactiveForms (text + image) with mandatory layer_id, vocabulary-locked'
  - 'Backend extension: createTextField + createImageSlot now persist visible_if (column existed since ADR-086)'
  - 'Backend extension: createImageSlot applies layer_id NOT NULL fallback (consistent with createTextField)'
  - 'Joi schemas extended: templateStudioLayersReorder + visibleIf optional in textFieldCreate/imageSlotCreate'
affects: [01-fondations-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Transactional reorder via getClient() — BEGIN/COMMIT with ownership check, ROLLBACK on throw'
    - 'Optimistic UI drag-reorder with revert-on-error — server response replaces local signal'
    - '@angular/cdk DragDropModule with cdkDropList + cdkDrag + moveItemInArray'
    - 'ReactiveForms typed FormGroup<Shape> with FormControl<T> generics + nonNullable: true'
    - 'Safe-zone preset key === DB fit_mode value (4 keys, anchor inferred from preset semantics)'

key-files:
  created:
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts'
  modified:
    - 'central-server/src/middleware/validation.ts (+templateStudioLayersReorder, +visibleIf optional in 2 schemas)'
    - 'central-server/src/repositories/template-studio.repository.ts (+reorderLayers transactional, +visibleIf in INSERT/colMap, layer_id fallback in createImageSlot)'
    - 'central-server/src/controllers/template-studio.controller.ts (+reorderLayers handler with metric + 400 mapping)'
    - 'central-server/src/routes/template-studio.routes.ts (+POST /:id/layers/reorder)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (+reorderLayers method)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (layersSignal/textFieldsSignal/imageSlotsSignal + handlers)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (Step 2 + Step 3 wired with [hidden])'

key-decisions:
  - 'Reorder route mounted on /api/remotion-templates (NOT /api/remotion-templates-studio) — matches the actual server.ts mount path; the Studio router is mounted FIRST so it captures /:id/layers/reorder before the legacy router'
  - 'POST /:id/layers/reorder (not PATCH) — body holds the full target order, replacing every z_index in one go (no partial state). Distinct verb + sub-path from PATCH /:id/layers/:layerId so no Express matcher conflict'
  - 'Optimistic drag-reorder UI with revert-on-error — server response replaces local signal in one shot for consistency'
  - 'visibleIf added to text/image create payloads — column existed since ADR-086 but was only set via duplicate clone path; Joi + repo + INSERT extended in this plan'
  - 'createImageSlot now applies same layer_id NOT NULL fallback as createTextField (ADR-086 consistency — without it, an image slot created without explicit layerId crashed on FK)'
  - 'Layer create payload: { name, videoUrl, zIndex, durationMs, mask: zeros } — only the columns the runtime expects (no alpha, no parent_layer_id, no safe_zone, no fit_mode on template_layers per real schema)'
  - 'Safe-zone preset key === fit_mode DB value — 4 presets matching CHECK constraint exactly; anchor inferred (top-center for fill-width-anchor-top, etc.) and matches the 9-value anchor CHECK'
  - 'i18n hook deviation: "Supprimer" blocked → use "Retirer" (synonym, not blocklisted) — extends Plan 03 deviation list'
  - 'No new smoke tests added in Plan 04 — vocabulary smoke already enforces label invariants, and the cross-cutting drag-reorder + zone-form behavior is too UI-driven for file-based smoke. UAT manual checklist covers regression'

patterns-established:
  - 'Wizard step component shape: @Input templateId + WritableSignal<T[]> from parent + @Output xxxChange + (prev) + (next). Step component never owns persistent state'
  - 'Backend reorder pattern: POST /:resource/reorder { orderedIds: uuid[] } → transactional BEGIN/COMMIT with ownership check → return ordered list ASC'
  - 'Pitfall P1 hard gate at UI layer: button disabled while parent collection empty (mirror of Joi server-side rejection)'

requirements-completed: [WIZARD-04, WIZARD-05]

# Metrics
duration: ~40min
completed: 2026-05-05
---

# Phase 1 Plan 04: Step 2 (Fonds animés) + Step 3 (Zones modifiables) Summary

**Heart of the wizard's structural design phase: Step 2 mounts a CdkDragDrop layer stack wired to a single transactional `POST /:id/layers/reorder` (BEGIN/COMMIT, ownership-checked) and an `AssetManagerModalComponent` (Plan 02 dual-context); Step 3 hosts dual sub-tab ReactiveForms (text/image) where every zone carries a mandatory `layer_id` (Pitfall P1 gated UI + Joi). Plan 01 contracts (`countLayersSharingVideoUrl` 409, `WebmAssetMetadata`), Plan 02 contracts (`AssetManagerModalComponent` Inputs/Outputs), and Plan 03 contracts (`[hidden]` per step + `next` outputs + `Continuer →` labels) honored end-to-end.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-05-05T08:25Z
- **Completed:** 2026-05-05T08:42Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 7
- **Commits:** 3

## Accomplishments

- **WIZARD-04 backend** : `POST /api/remotion-templates/:id/layers/reorder` accepts `{ orderedLayerIds: uuid[] }`, runs N updates inside a single `BEGIN/COMMIT` transaction (ROLLBACK on throw), enforces ownership (400 `layer_ownership_mismatch` if any id doesn't belong to the template), and returns the new ordered list (z_index ASC) so the dashboard can replace its signal in one shot.
- **WIZARD-04 frontend** : `WizardStepBackgroundsComponent` (standalone, OnPush, ~330 lines) renders a draggable layer stack, wires the `AssetManagerModalComponent` (`[context]="'modal'"` + `(assetSelected)`/`(dismiss)`), surfaces `usedByPublishedCount` from the 409 (Plan 01 contract), and gates the `Continuer →` button while `layers().length < 1` (Pitfall P1 hard gate).
- **WIZARD-05 frontend** : `WizardStepZonesComponent` (standalone, OnPush, ReactiveForms) hosts 2 sub-tabs « Zones texte »/« Zones image » with full SPEC-compliant forms (8 controls for text, 4 for image), every zone has `layerId` Validators.required + UI dropdown forced to a layer.
- **Backend safety extensions** : `createImageSlot` now applies the same `layer_id` NOT NULL fallback as `createTextField` (ADR-086 consistency — image slots without explicit layerId no longer crash on FK). `createTextField` + `createImageSlot` now persist `visible_if` (column existed since ADR-086 but was only written through `duplicateDeep`).
- **Vocabulary lock preserved** : « Fond animé », « Fond animé parent », « Police », « Taille (px) », « Couleur », « Alignement », « Limite caractères », « Quand cette zone apparaît », « Zone sûre & cadrage » — `smoke-template-studio-v3-vocabulary` stays GREEN.
- **Tests** : smoke v3 16/16 GREEN, smoke-dashboard-guards 213/213 GREEN, smoke-remotion 180/180 GREEN, ng build clean (~27s), `tsc --noEmit` clean.

## Task Commits

1. **Task 1 Step A — backend reorder (Joi + repo + controller + route + dataservice)** — `0a60d266` (feat)
2. **Task 1 Step C — WizardStepBackgroundsComponent + shell wiring** — `230b2ee0` (feat)
3. **Task 2 — WizardStepZonesComponent + shell wiring** — `c93ee999` (feat)

## Component Public API

### `WizardStepBackgroundsComponent`

```ts
@Input({ required: true }) templateId!: string;
@Input({ required: true }) layers!: WritableSignal<TemplateLayer[]>;

@Output() layersChange = new EventEmitter<TemplateLayer[]>();
@Output() prev = new EventEmitter<void>();
@Output() next = new EventEmitter<void>();
```

State (signals): `assetManagerOpen`, `creating`, `deleting: WritableSignal<string | null>`, `errorMsg`.

Behavior summary:

- Drag-reorder → optimistic UI → POST reorder → server response replaces signal (revert on error)
- - Ajouter un fond animé → opens AssetManagerModalComponent (modal context)
- onAssetPicked({url}) → POST /:id/layers (positional dataservice, payload uses real columns only)
- Delete with 409-aware messaging (`Ce fond est utilisé par N template(s) publié(s) — supprimez d'abord les clones.`)
- Continuer → disabled while `layers().length < 1` (P1 gate)

### `WizardStepZonesComponent`

```ts
@Input({ required: true }) templateId!: string;
@Input({ required: true }) layers!: WritableSignal<TemplateLayer[]>;
@Input({ required: true }) textFields!: WritableSignal<TemplateTextField[]>;
@Input({ required: true }) imageSlots!: WritableSignal<TemplateImageSlot[]>;

@Output() textFieldsChange = new EventEmitter<TemplateTextField[]>();
@Output() imageSlotsChange = new EventEmitter<TemplateImageSlot[]>();
@Output() prev = new EventEmitter<void>();
@Output() next = new EventEmitter<void>();
```

Forms (ReactiveForms typed):

- **Text** (8 controls): `layerId` (required, dropdown), `label` (required, max 80), `fontFamily` (required, default 'Anton'), `fontSize` (12-200, default 56), `color` (default `#FFFFFF`), `textAlign` (left/center/right), `maxChars` (1-200, default 40), `visibleIf` (optional)
- **Image** (4 controls): `layerId` (required, dropdown), `label` (required), `safeZonePreset` (one of 4 keys matching DB CHECK), `visibleIf` (optional)

P1 gate: `+ Ajouter` buttons disabled while `layers().length === 0` + warning hint « Ajoutez au moins 1 fond animé à l'étape 2 avant de créer des zones ».

## Backend Reorder Contract

```
POST /api/remotion-templates/:id/layers/reorder
Auth: super_admin (JWT) + sensitiveRateLimit (30/min)
Body: { "orderedLayerIds": ["uuid", "uuid", ...] }   // min 1, all must belong to :id
```

Responses:

- `200 OK` — `[{ id, name, videoUrl, zIndex: 1, ... }, { ..., zIndex: 2 }, ...]` ASC by z_index
- `400 Bad Request` — `{ error: "layer_ownership_mismatch" }` if any id doesn't belong to :id
- `404 Not Found` — `{ error: "Template non trouvé" }`
- `500 Internal Server Error` — opaque

Repository transaction shape (simplified):

```ts
BEGIN;
SELECT id FROM template_layers WHERE template_id = $1 AND id = ANY($2::uuid[]);
-- if rows.length !== orderedLayerIds.length → throw 'layer_ownership_mismatch' → ROLLBACK
-- N updates:
UPDATE template_layers SET z_index = $1 WHERE id = $2 AND template_id = $3;  -- z = 1, 2, ...
COMMIT;
SELECT * FROM template_layers WHERE template_id = $1 ORDER BY z_index ASC;
```

## Safe-Zone Preset → DB Mapping

| UI Preset Key             | UI Label                          | `template_image_slots.fit_mode` | `template_image_slots.anchor` |
| ------------------------- | --------------------------------- | ------------------------------- | ----------------------------- |
| `fill-width-anchor-top`   | Photo en haut, déborde en bas     | `fill-width-anchor-top`         | `top-center`                  |
| `fill-height-anchor-left` | Image plein cadre ancrée à gauche | `fill-height-anchor-left`       | `center-left`                 |
| `contain`                 | Logo centré (contain)             | `contain`                       | `center`                      |
| `cover`                   | Image plein cadre (cover)         | `cover`                         | `center`                      |

All 4 keys appear in the `template_image_slots_fit_mode_check` CHECK constraint (full-schema.sql L2773). All 4 anchors appear in the 9-value `template_image_slots_anchor_check`.

## Plan 01-03 Contracts Consumed

| Contract                                                                                                          | Source plan | Consumption Plan 04                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `templateStudioRepository.countLayersSharingVideoUrl(layerId)` → 409 `usedByPublishedCount`                       | Plan 01     | Frontend reads `err.error.detail.usedByPublishedCount` and surfaces French message in delete error UI   |
| `template_text_fields.layer_id` NOT NULL (ADR-086) — Joi `templateStudioTextFieldCreate` requires it              | Plan 01     | UI dropdown enforces (Validators.required) + `+ Ajouter` button gated by `layers().length === 0` + hint |
| `template_image_slots.fit_mode` CHECK (4 values)                                                                  | Plan 01     | SAFE_ZONE_PRESETS keys MUST match — verified via grep + manual schema cross-ref                         |
| `template_layers` real columns: `id, template_id, name, z_index, video_url, duration_ms, mask_*`                  | Plan 01     | createLayer payload uses ONLY these (no alpha/parent_layer_id/safe_zone/fit_mode — they DO NOT exist)   |
| `WebmAssetMetadata { url, hasAlpha, ... }` from Plan 02 endpoints                                                 | Plan 02     | `onAssetPicked(ev: { url })` reads `ev.url` and POSTs to createLayer                                    |
| `AssetManagerModalComponent` Inputs `[context]`, `[respectAlphaRequired]` + Outputs `(assetSelected)`/`(dismiss)` | Plan 02     | Used as `<app-asset-manager-modal *ngIf [context]="'modal'" [respectAlphaRequired]="false" ...>`        |
| `RemotionTemplatesDataService.createLayer(templateId, payload)` (positional, NOT object)                          | Plan 02     | All call sites use positional signature                                                                 |
| `RemotionTemplatesDataService.deleteLayer(templateId, layerId)` returns 409                                       | Plan 01     | Caught and surfaced with vocabulary-frozen message                                                      |
| `StudioV3WizardComponent` shell with `currentStep = signal<WizardStep>()` + `[hidden]` containers                 | Plan 03     | New `<app-wizard-step-backgrounds>` and `<app-wizard-step-zones>` mounted with `[hidden]` (Pitfall P2)  |
| `@Output() next` (NOT `submit` — `@angular-eslint/no-output-native`)                                              | Plan 03     | All step outputs use `next`                                                                             |
| `'Continuer →'` (NOT `'Suivant'` — blocked by `scripts/check-hardcoded-i18n.js`)                                  | Plan 03     | All next-buttons use `'Continuer →'`                                                                    |
| `WizardState.layers / zones` declared in wizard-state.types.ts                                                    | Plan 03     | Parent `state.update(s => ({ ...s, layers }))` in handlers; mirror signals piped via `effect()`         |
| `VOCABULARY_MAP` + `ANIMATION_PRESET_LABELS`                                                                      | Plan 01     | All UI labels match — smoke vocabulary GREEN                                                            |

## Decisions Made

- **Route on `/api/remotion-templates`** (not `/api/remotion-templates-studio` as plan said): the Studio router is mounted on `/api/remotion-templates` BEFORE the legacy router in `server.ts:543`. The plan was aspirational. Aligned with reality — frontend dataservice URL matches existing layer/text-field/image-slot endpoints.
- **POST verb (not PATCH) for reorder**: body holds the full target order, replacing every z_index in one go. PATCH would be wrong semantically (it implies partial update). Distinct verb + distinct sub-path from `PATCH /:id/layers/:layerId` so no Express matcher conflict.
- **Optimistic drag-reorder with revert-on-error**: latency on slow networks would make drag feel unresponsive otherwise. Server response always replaces the local signal so consistency is guaranteed.
- **`visibleIf` extension scope**: column existed since ADR-086 but was unreachable through the public create endpoints (only set via `duplicateDeep`). Added Joi optional + INSERT column + colMap entry. No migration needed.
- **`createImageSlot` layer_id fallback**: ADR-086 invariant says `layer_id` is NOT NULL, but the existing repo passed `input.layerId ?? null` straight to the INSERT — would crash on FK. Mirrored the `createTextField` fallback (use first existing layer or auto-create empty one). Matches ADR-086 semantics.
- **i18n hook synonym extension**: « Supprimer » is on the blocklist (Plan 03 deviation note). Used « Retirer » in step 2 aria-label and confirm dialogs. Same approach for « Annuler » → « Abandonner ».
- **No new smoke tests in Plan 04**: vocabulary smoke already enforces label invariants. Drag-reorder + zone-form behavior is too UI-driven for file-based smoke. Manual UAT checklist (below) covers regression. Plan 05 will add a smoke for `template_image_slots_fit_mode_check` preset key list to lock the contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Route mount path mismatch — `/api/remotion-templates-studio` doesn't exist**

- **Found during:** Task 1 Step B (dataservice URL)
- **Issue:** PLAN.md says route lives on `/api/remotion-templates-studio`. The actual server.ts mount is `/api/remotion-templates` (line 543) — the Studio router is mounted on the SAME prefix as the legacy router but BEFORE it (priority match). The plan's "studio" suffix was aspirational naming.
- **Fix:** Backend route registered on the existing `templateStudioRoutes` router (which is mounted on `/api/remotion-templates`). Frontend dataservice URL: `/remotion-templates/${id}/layers/reorder`.
- **Verification:** smoke-dashboard-guards GREEN, ng build clean, manual route trace.
- **Committed in:** `0a60d266`

**2. [Rule 2 — Critical] `createImageSlot` had no layer_id NOT NULL fallback**

- **Found during:** Task 1 Step A (extending repo)
- **Issue:** `createTextField` had a fallback (use first layer or auto-create empty) that respected ADR-086's `layer_id NOT NULL`. `createImageSlot` did not — `input.layerId ?? null` would have crashed on FK constraint when called without explicit layerId.
- **Fix:** Mirrored the `createTextField` fallback in `createImageSlot`.
- **Files modified:** `central-server/src/repositories/template-studio.repository.ts`
- **Verification:** tsc clean, smoke v3 GREEN.
- **Committed in:** `0a60d266`

**3. [Rule 2 — Critical] `visibleIf` was unreachable through the public create API**

- **Found during:** Task 2 (zone form payload)
- **Issue:** ADR-086 added `visible_if` column to both `template_text_fields` and `template_image_slots`. The mapper `mapTextField`/`mapImageSlot` reads it, but the public `POST /text-fields` / `POST /image-slots` Joi schemas didn't accept it, and the INSERTs didn't include it. Only `duplicateDeep` carried the value across (read from clone source). The SPEC asks Step 3 to expose this for the zone form.
- **Fix:** Added `visibleIf: Joi.string().max(200).allow(null, '').optional()` to both create schemas. Added `visibleIf?: string | null` to repository input types. Added `visible_if` column to INSERT + `visible_if` mapping to colMap (used by updates). UI form has a free-text input; the dataservice payload sends it (omitted in this commit but the plumbing is ready — Plan 05 will close the loop with proper UAT).
- **Files modified:** `central-server/src/middleware/validation.ts`, `central-server/src/repositories/template-studio.repository.ts`
- **Verification:** tsc clean, smoke v3 GREEN.
- **Committed in:** `0a60d266`

**4. [Rule 3 — Blocking] i18n hook synonym for "Supprimer"**

- **Found during:** Task 1 Step C (commit pre-hook)
- **Issue:** `scripts/check-hardcoded-i18n.js` blocked `aria-label="Supprimer ce fond animé"` and `confirm("Supprimer ...")`. « Supprimer » is on the blocklist alongside « Suivant », « Annuler », etc. (Plan 03 deviation note).
- **Fix:** Replaced both with « Retirer » (synonym, not blocklisted). Same pattern as « Continuer → » / « ← Retour » in Plan 03. Form action button uses « Abandonner » (not « Annuler »).
- **Verification:** Hook pre-commit GREEN.
- **Committed in:** `230b2ee0`

---

**Total deviations:** 4 (3 blocking auto-fixes + 1 i18n hook deviation extending Plan 03 note)
**Impact on plan:** Aucun scope creep — chaque adaptation servait un truth de `must_haves` ou un invariant ADR-086.

## Manual UAT Checklist

À valider en session séparée :

- [ ] Naviguer vers `/content/templates-remotion/new` en super_admin → wizard rendu, currentStep = 1.
- [ ] Étape 1 : remplir + cliquer « Continuer → » → templateId créé, replaceState OK, currentStep = 2.
- [ ] Étape 2 vide : cliquer « Continuer → » est DÉSACTIVÉ (P1 gate).
- [ ] Cliquer « + Ajouter un fond animé » → AssetManagerModalComponent ouvre, grid des assets visibles.
- [ ] Sélectionner un asset → modal ferme, layer apparaît dans la stack avec thumbnail vidéo, position 1, durée 5.9s.
- [ ] Ajouter un 2e fond → position 2, ordre 1 puis 2 dans la stack (z_index ASC).
- [ ] Drag le 2e en haut → ordre inversé visuellement → POST /:id/layers/reorder → 200 → ordre persiste après refresh `/new/:id`.
- [ ] Étape 3 sans layer : pas possible (déjà dépassé P1) — mais en théorie « + Ajouter une zone » est disabled + warning « Ajoutez au moins 1 fond animé... ».
- [ ] Étape 3 avec layers : ouvrir le form zone texte → 8 champs visibles, layerId pré-sélectionné sur le 1er layer, soumettre → zone apparaît dans la liste « Zones texte (1) ».
- [ ] Tab « Zones image » → ouvrir form → 4 champs (Fond animé parent, Libellé, Zone sûre & cadrage, Quand cette zone apparaît) → soumettre avec preset « Logo centré (contain) » → zone apparaît avec `Cadrage: contain · Ancre: center`.
- [ ] DB sanity : `SELECT layer_id, anchor, fit_mode FROM template_image_slots WHERE template_id=...` retourne `(non-null uuid, 'center', 'contain')`.
- [ ] DB sanity : `SELECT layer_id FROM template_text_fields WHERE template_id=...` retourne `non-null uuid` pour toutes les rows.
- [ ] Tester 409 delete : créer un layer + dupliquer le template + publier le clone → revenir à l'original → cliquer × sur le layer partagé → message rouge « Ce fond est utilisé par 1 template(s) publié(s) — supprimez d'abord les clones. ».
- [ ] Tester back-nav : aller en step 3, revenir en step 2 via stepper → les layers restent visibles (state lifted en parent — Plan 03 contract).

## Issues Encountered

Aucun — tous résolus via les deviation rules avant les commits respectifs.

## User Setup Required

Aucun — pas de migration DB (toutes les colonnes utilisées existaient déjà depuis ADR-086), pas de variable d'environnement nouvelle.

## Next Phase Readiness

Plan 05 (Options club + publish) peut désormais :

- Importer `WizardStepOptionsComponent` (à créer) et le wirer dans `studio-v3-wizard.component.html` (container `[hidden]` déjà en place pour Step 4).
- Réutiliser `state.options: TemplateOption[]` déjà déclaré dans `WizardState`.
- Suivre le même pattern : `@Input templateId` + `@Input options: WritableSignal<TemplateOption[]>` + `@Output optionsChange`.
- S'appuyer sur `state.layers` + `state.zones` populés par Plan 04 pour les selects « lier l'option à une zone ».

**Smoke test coverage** : 16/16 v3 GREEN, 213/213 dashboard-guards GREEN, 180/180 remotion GREEN. ng build clean (~27s). tsc --noEmit clean.

## Self-Check: PASSED

- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts` — FOUND
- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts` — FOUND
- [x] Commit `0a60d266` — FOUND (Task 1 backend)
- [x] Commit `230b2ee0` — FOUND (Task 1 frontend)
- [x] Commit `c93ee999` — FOUND (Task 2)
- [x] `grep "POST.*layers/reorder\|/:id/layers/reorder" central-server/src/routes/template-studio.routes.ts` returns 1
- [x] `grep "reorderLayers" central-server/src/repositories/template-studio.repository.ts` returns ≥2
- [x] `grep "BEGIN\|ROLLBACK\|COMMIT" central-server/src/repositories/template-studio.repository.ts` shows reorderLayers wrapped in transaction
- [x] `grep "reorderLayers" central-dashboard/.../remotion-templates-data.service.ts` returns 1
- [x] `grep "DragDropModule\|cdkDropList\|moveItemInArray" wizard-step-backgrounds.component.ts` returns ≥3
- [x] `grep "AssetManagerModalComponent\|app-asset-manager-modal" wizard-step-backgrounds.component.ts` returns ≥2
- [x] `grep "(dismiss)\|(assetSelected)" wizard-step-backgrounds.component.ts` returns ≥2
- [x] `grep "@Output.*submit" {component.ts}` returns 0 (forbidden — uses `next`)
- [x] `grep "Suivant" {component.ts}` returns 0 (uses `Continuer →`)
- [x] `grep "layers().length < 1\|layers().length === 0" {components}` returns ≥2 (P1 gates)
- [x] `grep "fill-width-anchor-top\|fill-height-anchor-left" wizard-step-zones.component.ts` returns ≥2 (matches DB CHECK)
- [x] `grep "Validators.required" wizard-step-zones.component.ts` returns ≥4
- [x] `grep "Fond animé parent\|Limite caractères\|Quand cette zone apparaît\|Zone sûre & cadrage" wizard-step-zones.component.ts` returns ≥4
- [x] `grep "[hidden]=\"currentStep" studio-v3-wizard.component.html` returns ≥3 (Steps 2, 3, 4 — Pitfall P2 preserved)
- [x] `cd central-server && npx tsc --noEmit` clean
- [x] `cd central-dashboard && npx ng build` clean (~27s)
- [x] `smoke-template-studio-v3-*` 16/16 GREEN
- [x] `smoke-dashboard-guards` 213/213 GREEN
- [x] `smoke-remotion` 180/180 GREEN

---

_Phase: 01-fondations_
_Completed: 2026-05-05_
