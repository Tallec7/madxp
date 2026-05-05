---
phase: 01-fondations
verified: 2026-05-05T09:08:00Z
status: passed
score: 13/13 must-haves verified
re_verification: null
---

# Phase 1: Fondations Verification Report

**Phase Goal:** Un super_admin peut créer un template complet via wizard dashboard (sans terminal ni SQL), dupliquer n'importe quel template existant, et gérer les assets WebM — avec zéro risque de perte de données ou de corruption DB.
**Verified:** 2026-05-05T09:08:00Z
**Status:** passed (with manual UAT items remaining for Daisy — see section "Human Verification Required")
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth                                                                                       | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Asset Manager: parcourir/uploader/supprimer WebM, alpha rejection, deletion guard published | ✓ VERIFIED | Routes `/assets`, `/library/upload`, `/assets/:assetId` mountées AVANT `/:id` (`remotion-templates.routes.ts:22-37`). Alpha gate retourne `400 asset_alpha_required` (`remotion-templates.controller.ts:348,865`). Delete guard retourne `409 asset_in_use { usedByPublishedCount }` (`remotion-templates.controller.ts:928`, `template-studio.controller.ts:221`). Dashboard composant standalone dual-context (modal+page).                                                                       |
| 2   | Wizard 4 étapes — INSERT immédiat step 1, refresh-safe, back-nav préservée, drag-reorder    | ✓ VERIFIED | `currentStep = signal<WizardStep>(1)` + 4 containers `[hidden]` (jamais `*ngIf` sur currentStep) — `studio-v3-wizard.component.html:28,37,55,73`. `location.replaceState('/content/templates-remotion/new/${tpl.id}')` après création (line 171). Step 2 utilise `DragDropModule + moveItemInArray + cdkDropList` câblé vers `POST /:id/layers/reorder` transactionnel. Step 3 zones avec `Validators.required` sur `layerId`.                                                                      |
| 3   | Duplication atomique — clone ouvre step 3, 6 tables clonées en 1 transaction, WebM partagés | ✓ VERIFIED | `duplicateDeep` enveloppé `BEGIN/COMMIT/ROLLBACK` (`template-studio.repository.ts:912,1130,1141`). Couvre 7 INSERT INTO : `neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`, `template_variants` (les 6 requis + variants). Bouton "⎘ Dupliquer" sur card (`template-card.component.ts:62`). Resume `?from=duplicate` force step 3 (`studio-v3-wizard.component.ts:136`). Pas de copie FTP — `video_url` partagé. |
| 4   | Smoke tests vocabulary + duplicate + asset-manager GREEN                                    | ✓ VERIFIED | `npx jest smoke-template-studio-v3` → **3 suites / 16 tests passed** (run 2026-05-05). VOCABULARY_MAP frozen, duplicate clone vérifié, alpha rejection vérifié.                                                                                                                                                                                                                                                                                                                                     |

**Score:** 4/4 success criteria verified.

### Required Artifacts

| Artifact                                                                                                                                | Expected                      | Status     | Details                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `central-server/src/__tests__/smoke/smoke-template-studio-v3-{vocabulary,duplicate,asset-manager}.test.ts`                              | 3 suites                      | ✓ VERIFIED | All present, 16 tests GREEN                                                     |
| `central-server/src/services/thumbnail.service.ts` — `pix_fmt` + `hasAlpha` + `computeHasAlpha`                                         | ffprobe alpha                 | ✓ VERIFIED | Lines 21, 31, 170, 187, 197                                                     |
| `central-server/src/repositories/template-studio.repository.ts` — `duplicateDeep`, `reorderLayers`, `countLayersSharingVideoUrl[ByUrl]` | Transactional repo            | ✓ VERIFIED | Lines 495, 542, 560, 906; 4 BEGIN/COMMIT pairs                                  |
| `central-server/src/controllers/remotion-templates.controller.ts` — alpha gate + library endpoints + duplicate handler                  | 4 controllers                 | ✓ VERIFIED | `asset_alpha_required` 348/865, `duplicate_requires_v2` 645, `asset_in_use` 928 |
| `central-server/src/controllers/template-studio.controller.ts` — `deleteLayer` 409 guard + `reorderLayers` handler                      | 2 controllers                 | ✓ VERIFIED | Lines 217-223 deleteLayer 409; reorderLayers handler present                    |
| `central-server/src/routes/template-studio.routes.ts` — `/:id/layers/reorder`, `/:id/options`, `/:id/packshot-refs`                     | Studio CRUD routes            | ✓ VERIFIED | Lines 113, 232-280                                                              |
| `central-server/src/routes/remotion-templates.routes.ts` — library routes mounted BEFORE `/:id`                                         | Route ordering                | ✓ VERIFIED | Lines 22, 29, 37 (library) avant 141 (`/:id/assets`)                            |
| `central-dashboard/.../studio-v3/vocabulary.constants.ts`                                                                               | Frozen UI labels              | ✓ VERIFIED | VOCABULARY_MAP + ANIMATION_PRESET_LABELS                                        |
| `central-dashboard/.../studio-v3/asset-manager/asset-manager-modal.component.{ts,html,scss}`                                            | Dual-context component        | ✓ VERIFIED | Modal + page modes via `@Input context`                                         |
| `central-dashboard/.../studio-v3/wizard/{studio-v3-wizard,wizard-step-{identity,backgrounds,zones,options}}.component.ts`               | Wizard shell + 4 steps        | ✓ VERIFIED | All 5 components present                                                        |
| `central-dashboard/.../studio-v3/wizard-state.types.ts`                                                                                 | WizardState contract          | ✓ VERIFIED | Present                                                                         |
| `central-dashboard/.../app.routes.ts` — 3 routes super_admin                                                                            | `/assets`, `/new`, `/new/:id` | ✓ VERIFIED | Lines 160, 170, 180                                                             |
| `central-dashboard/.../template-card.component.ts` — bouton Dupliquer                                                                   | Output `duplicateRequested`   | ✓ VERIFIED | Lines 62, 135, 148                                                              |

### Key Link Verification

| From                        | To                                              | Via                                                         | Status  | Details                                                               |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------- | --------------------------------------------------------------------- |
| Wizard Step 1 form          | `POST /api/remotion-templates`                  | `RemotionTemplatesDataService.createTemplate`               | ✓ WIRED | INSERT immédiat sur "Continuer →" + `replaceState`                    |
| Wizard Step 2 drag          | `POST /:id/layers/reorder`                      | `dataService.reorderLayers` (optimistic + revert)           | ✓ WIRED | Backend transactionnel BEGIN/COMMIT, ownership check                  |
| Wizard Step 2 + add layer   | AssetManagerModalComponent + `POST /:id/layers` | `(assetSelected)` event                                     | ✓ WIRED | Composant Plan 02 importé en mode modal                               |
| Wizard Step 3 zones         | `POST /:id/text-fields` + `/image-slots`        | createTextField + createImageSlot                           | ✓ WIRED | `layerId` Validators.required + Joi NOT NULL fallback ADR-086         |
| Wizard Step 4 options       | `POST /:id/options` + `/:id/packshot-refs`      | 6 dataservice methods                                       | ✓ WIRED | Snake↔camel adapter, packshot delete+create flow                      |
| Template list "⎘ Dupliquer" | `POST /:id/duplicate` + duplicateDeep           | `dataService.duplicateTemplate` + router.navigate           | ✓ WIRED | `?from=duplicate` queryParam → resume step 3 ; v1 source → 400 banner |
| Asset upload                | ffprobe → alpha gate                            | `thumbnailService.extractMetadata` → `hasAlpha=false` → 400 | ✓ WIRED | Pix_fmt regex (yuva\*, rgba, argb, abgr, bgra, a420)                  |
| Asset delete                | `countLayersSharingVideoUrl[ByUrl]` → 409       | Reference-count guard                                       | ✓ WIRED | Two variants: par layerId (template_studio) + par url (library)       |

### Requirements Coverage

| Requirement | Source Plan | Description                                    | Status      | Evidence                                                                           |
| ----------- | ----------- | ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| ASSET-01    | Plan 02     | Browse WebM library                            | ✓ SATISFIED | `GET /api/remotion-templates/assets` + AssetManagerModalComponent en mode page     |
| ASSET-02    | Plans 01+02 | Upload WebM with ffprobe alpha enforcement     | ✓ SATISFIED | `pix_fmt` + `hasAlpha` + `400 asset_alpha_required` ; smoke v3 GREEN               |
| ASSET-03    | Plan 01     | Delete blocked if used by published template   | ✓ SATISFIED | `409 asset_in_use { usedByPublishedCount }` deux variants ; smoke v3 GREEN         |
| WIZARD-01   | Plan 05     | Wizard 4 étapes complètes                      | ✓ SATISFIED | Steps 1-4 montés ; "+ Nouveau template" repointé sur V3 wizard                     |
| WIZARD-02   | Plan 03     | INSERT immédiat step 1 + replaceState          | ✓ SATISFIED | `createTemplate` appelé sur Continuer → `location.replaceState` (line 171)         |
| WIZARD-03   | Plans 03+05 | Resume from `/new/:id` préserve les saisies    | ✓ SATISFIED | `getStudioView` hydrate state ; back-nav garde inputs (signal parent + `[hidden]`) |
| WIZARD-04   | Plan 04     | Drag-reorder layers transactionnel             | ✓ SATISFIED | `POST /:id/layers/reorder` BEGIN/COMMIT + CdkDragDrop                              |
| WIZARD-05   | Plan 04     | Step 3 zones avec layer_id obligatoire         | ✓ SATISFIED | `Validators.required` sur layerId + Joi + UI dropdown forcé                        |
| DUP-01      | Plan 05     | Bouton Dupliquer sur card → clone ouvre step 3 | ✓ SATISFIED | `template-card.component.ts:135` + `?from=duplicate` resume override               |
| DUP-02      | Plan 01     | duplicateDeep transactionnel 6 tables          | ✓ SATISFIED | BEGIN/COMMIT + 7 INSERT (les 6 requis + variants) ; smoke v3 GREEN                 |
| TEST-01     | Plan 01     | smoke vocabulary lock                          | ✓ SATISFIED | 3/3 tests GREEN                                                                    |
| TEST-02     | Plan 01     | smoke duplicate (6 tables)                     | ✓ SATISFIED | 6/6 tests GREEN                                                                    |
| TEST-04     | Plan 01     | smoke asset-manager (alpha + ref-count)        | ✓ SATISFIED | 7/7 tests GREEN                                                                    |

**Coverage: 13/13 requirements verified — 0 orphans, 0 gaps.**

### Anti-Patterns Found

Aucun blocker détecté. Vérifications effectuées :

- `*ngIf="currentStep` sur step containers → **0 occurrences** (Pitfall P2 respecté — le DOM reste mounted via `[hidden]`)
- `BEGIN`/`COMMIT`/`ROLLBACK` dans duplicateDeep → 4 paires présentes (transactional clone P4)
- `pix_fmt` / `hasAlpha` / `asset_alpha_required` → tous wirés (P10)
- `usedByPublishedCount` + 409 → wiré dans 2 endpoints (P5)
- TypeScript `tsc --noEmit` central-server → clean
- `ng build` central-dashboard → clean (29.5s, 60 lazy chunks)

### Pitfall Verification (ADR-110)

| Pitfall | Description                                     | Status | Evidence                                                 |
| ------- | ----------------------------------------------- | ------ | -------------------------------------------------------- |
| P1      | `layer_id` obligatoire UI + serveur             | ✓ PASS | `Validators.required` + Joi NOT NULL fallback            |
| P2      | React/Player root mounted-once (jamais `*ngIf`) | ✓ PASS | 4× `[hidden]` containers, 0× `*ngIf="currentStep`        |
| P4      | Duplication transactionnelle                    | ✓ PASS | BEGIN/COMMIT/ROLLBACK + 6 tables                         |
| P5      | Suppression asset référencé bloquée             | ✓ PASS | 409 `usedByPublishedCount`                               |
| P6      | Vocabulaire métier figé par smoke               | ✓ PASS | smoke-vocabulary 3/3 GREEN, ban "layer"/"slot"/"pix_fmt" |
| P10     | Alpha détectée serveur via ffprobe              | ✓ PASS | `pix_fmt` regex + 400 sur upload sans alpha              |

### Human Verification Required

Les composants UI ne peuvent pas être validés en headless sans Playwright. Items à valider en session UAT par Daisy (super_admin) :

1. **Wizard E2E** — Naviguer `/content/templates-remotion/new`, remplir 4 étapes, vérifier que la fermeture de l'onglet après step 1 ne perd pas la row DB.
2. **Drag-reorder fluide** — Step 2 : déplacer un layer, vérifier que l'ordre persiste après refresh `/new/:id`.
3. **Duplicate v2 → step 3** — Cliquer "⎘ Dupliquer" sur un template v2 publié, vérifier que le wizard s'ouvre directement sur step 3 (pas step 4).
4. **Duplicate v1 → banner** — Cliquer Dupliquer sur un template legacy v1, vérifier banner rouge "Cette template legacy v1 doit être migrée avant duplication."
5. **Alpha rejection inline** — Step 2 modal avec `respectAlphaRequired=true`, uploader un WebM `yuv420p`, vérifier message rouge inline avec format détecté.
6. **Delete library bloqué** — Supprimer un asset référencé par un template publié → message "utilisé par N template(s)".
7. **Asset Manager dual-context** — Naviguer `/content/templates-remotion/assets` (mode page) + ouvrir depuis Step 2 (mode modal), vérifier que backdrop+close apparaissent uniquement en modal.

### Gaps Summary

**Aucun gap technique.** Tous les 13 requirements de Phase 1 sont satisfaits dans le code, tous les 4 success criteria sont observables, les 6 pitfalls ADR-110 critiques pour Phase 1 sont gardés, et la suite smoke v3 est verte (16/16). Build TS + ng clean.

Note : ROADMAP.md ligne 83-84 affiche "Plans Complete: 2/5" — c'est un compteur stale qui doit être actualisé à 5/5 au merge de la phase. Inversement, REQUIREMENTS.md liste WIZARD-01/02/03 et DUP-01 comme `Pending` mais les Summaries démontrent qu'ils sont Done — la table Traceability doit être resyncée.

---

_Verified: 2026-05-05T09:08:00Z_
_Verifier: Claude (gsd-verifier)_
