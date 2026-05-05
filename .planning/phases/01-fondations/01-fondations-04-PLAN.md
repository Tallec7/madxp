---
phase: 01-fondations
plan: 04
type: execute
wave: 3
depends_on: ['01-fondations-02', '01-fondations-03']
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-server/src/routes/template-studio.routes.ts
  - central-server/src/controllers/template-studio.controller.ts
  - central-server/src/repositories/template-studio.repository.ts
  - central-server/src/middleware/validation.ts
autonomous: true
requirements: [WIZARD-04, WIZARD-05]
must_haves:
  truths:
    - 'Step 2 renders an ordered list of layers (sorted ASC by z_index); super_admin can drag-reorder via @angular/cdk/drag-drop and z_index is updated server-side via a single POST /:id/layers/reorder'
    - "Step 2 'Ajouter un fond' opens AssetManagerModalComponent (context='modal'); on (assetSelected), POST /:id/layers creates a template_layers row with video_url + z_index + duration_ms (no 'alpha' / 'parent_layer_id' columns — they DO NOT exist)"
    - 'Step 3 lists zones (text + image) for each layer; admin can add a zone, set label/font/size/color/alignment/maxChars/visibleIf'
    - "Each zone created in Step 3 has a non-null layer_id (Joi-enforced server-side; UI disables 'Ajouter une zone' until ≥1 layer exists per Pitfall P1 + ADR-086 invariant template_text_fields.layer_id NOT NULL)"
    - 'WizardState (wizard-state.types.ts) extended so layers + zones are populated by step 2/3 emits, never local state (Plan 03 contract)'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts
      provides: 'Step 2 — drag-drop layer stack + asset-manager-modal trigger'
      exports: ['WizardStepBackgroundsComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
      provides: 'Step 3 — zone list + per-zone form (text or image) with mandatory layer_id'
      exports: ['WizardStepZonesComponent']
    - path: central-server/src/routes/template-studio.routes.ts
      provides: 'POST /:id/layers/reorder route mounted on /api/remotion-templates-studio'
      contains: 'layers/reorder'
  key_links:
    - from: WizardStepBackgroundsComponent
      to: AssetManagerModalComponent (context='modal')
      via: '*ngIf-toggled child component, (assetSelected) wired to onAssetPicked, (dismiss) closes modal'
      pattern: 'app-asset-manager-modal'
    - from: WizardStepBackgroundsComponent
      to: dataService.reorderLayers
      via: 'POST /api/remotion-templates-studio/:id/layers/reorder with { orderedLayerIds: string[] }'
      pattern: 'reorderLayers'
    - from: WizardStepZonesComponent
      to: 'dataService.createTextField / createImageSlot'
      via: 'POST /api/remotion-templates-studio/:id/text-fields|image-slots — payload includes layer_id (NOT NULL per ADR-086)'
      pattern: 'createTextField|createImageSlot'
    - from: StudioV3WizardComponent
      to: WizardState.layers + WizardState.zones
      via: '(layersChange) and (zonesChange) emits update parent signal — step components stay [hidden] (Plan 03 Pitfall P2 lock)'
      pattern: '\\[hidden\\]'
---

<objective>
Build Wizard Step 2 (Fonds animés) and Step 3 (Zones modifiables) — the heart of the structural design phase.

Purpose: WIZARD-04 (drag-reorder layers), WIZARD-05 (configure zone properties), with Pitfall P1 (orphan zones) hard-gated by both UI + Joi.

Output: Two new step components wired into the wizard shell created in Plan 03; layer create/reorder via the dual-context AssetManagerModalComponent (Plan 02); zone create with full per-type form (text vs image) — every zone has a non-null layer_id.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/research/STACK.md
@.planning/research/PITFALLS.md
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-02-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-03-SUMMARY.md
@docs/specs/features/template-studio-v3.spec.md
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/safe/safe-portfolio.component.ts
@central-server/src/routes/template-studio.routes.ts
@central-server/src/controllers/template-studio.controller.ts
@central-server/src/scripts/full-schema.sql
</context>

## Plan 01-03 contracts consumed

| Contract                                                                                                                                                                                        | Source plan                            | Consumption in Plan 04                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templateStudioRepository` (extend, never `query()` direct)                                                                                                                                     | Plan 01                                | Add `reorderLayers(templateId, orderedLayerIds)` — single transaction `BEGIN/COMMIT` with N `UPDATE template_layers SET z_index = $i WHERE id = $1 AND template_id = $2`   |
| Routes mounted on `/api/remotion-templates-studio` (server.ts:71)                                                                                                                               | Plan 01                                | NEW route `POST /:id/layers/reorder` registered AFTER existing `/:id/layers/:layerId` PATCH (no path conflict)                                                             |
| `template_layers` real columns: `id, template_id, name, z_index, start_at_ms, duration_ms, video_url, composition_id, mask_*` (NO `alpha`, NO `parent_layer_id`, NO `safe_zone`, NO `fit_mode`) | Plan 01 (full-schema.sql L2790-2813)   | createLayer payload uses `name, videoUrl, zIndex, durationMs` ONLY. Alpha lives on the WebM file (ffprobe), surfaced via `WebmAssetMetadata.hasAlpha` from Plan 02         |
| `template_text_fields.layer_id` NOT NULL (ADR-086)                                                                                                                                              | Plan 01 + `.claude/rules/templates.md` | UI dropdown enforces; backend Joi `templateStudioTextFieldCreate` already rejects null layer_id (verify)                                                                   |
| `template_image_slots.fit_mode` CHECK: `'contain' \| 'cover' \| 'fill-width-anchor-top' \| 'fill-height-anchor-left'` (full-schema.sql L2773)                                                   | Plan 01                                | Safe-zone preset map MUST emit only these 4 values (preset key === fit_mode value for the fill-\* presets)                                                                 |
| `WebmAssetMetadata { url, hasAlpha, ... }` returned by Plan 02 endpoints                                                                                                                        | Plan 02                                | `onAssetPicked(ev: { url: string })` payload — Plan 04 reads `ev.url` and POSTs to createLayer                                                                             |
| `AssetManagerModalComponent` (dual-context) — Inputs: `[context]`, `[respectAlphaRequired]`; Outputs: `(assetSelected)`, `(dismiss)`                                                            | Plan 02                                | Use `[context]="'modal'"`, `(dismiss)` (NOT `close`), wrap with `*ngIf="assetManagerOpen()"`                                                                               |
| `RemotionTemplatesDataService.createLayer(templateId, payload)` (signature: positional templateId + payload object)                                                                             | Plan 02 / pre-existing                 | NOT `createLayer({ templateId, ...})` — call `dataService.createLayer(this.templateId, { name, videoUrl, zIndex, durationMs })`                                            |
| `RemotionTemplatesDataService.deleteLayer(templateId, layerId)` returns 409 `asset_in_use { usedByPublishedCount }`                                                                             | Plan 01                                | Catch and surface — message uses VOCABULARY: « Ce fond est utilisé par N template(s) publié(s) »                                                                           |
| `StudioV3WizardComponent` shell with `currentStep = signal<WizardStep>()` + `[hidden]` step containers (Pitfall P2)                                                                             | Plan 03                                | Plan 04 ADDS `<app-wizard-step-backgrounds [hidden]="currentStep() !== 2">` and `<app-wizard-step-zones [hidden]="currentStep() !== 3">` — NEVER `*ngIf` per step          |
| `@Output()` named `next` (NOT `submit` — `@angular-eslint/no-output-native` blocks)                                                                                                             | Plan 03                                | All step outputs in Plan 04 use `next`                                                                                                                                     |
| `'Continuer →'` button label (NOT `'Suivant'` — blocked by `scripts/check-hardcoded-i18n.js`)                                                                                                   | Plan 03                                | All "next" buttons in Plan 04 use `'Continuer →'` ; back uses `'← Retour'`                                                                                                 |
| `WizardState.layers / zones` already declared (wizard-state.types.ts)                                                                                                                           | Plan 03                                | Plan 04 emits to parent which calls `state.update(s => ({ ...s, layers, zones }))`                                                                                         |
| `VOCABULARY_MAP` + `ANIMATION_PRESET_LABELS` (vocabulary.constants.ts)                                                                                                                          | Plan 01                                | All labels: « Fond animé », « Zone modifiable », « Zone texte », « Zone image », « Limite caractères », « Police », « Quand cette zone apparaît », « Zone sûre & cadrage » |

<interfaces>
Existing data service methods (verified via grep, signatures positional `(templateId, payload)`):
  createLayer(templateId: string, payload: TemplateLayerCreate): Observable<TemplateLayer>
  updateLayer(templateId: string, layerId: string, payload: ...): Observable<TemplateLayer>
  deleteLayer(templateId: string, layerId: string): Observable<void>
  createTextField(templateId: string, payload: TemplateTextFieldCreate): Observable<TemplateTextField>
  deleteTextField(templateId: string, fieldId: string): Observable<void>
  createImageSlot(templateId: string, payload: TemplateImageSlotCreate): Observable<TemplateImageSlot>
  deleteImageSlot(templateId: string, slotId: string): Observable<void>

To ADD in this plan (Task 1 backend + dataservice):
// dataservice
reorderLayers(templateId: string, orderedLayerIds: string[]): Observable<TemplateLayer[]>
→ POST /api/remotion-templates-studio/:id/layers/reorder { orderedLayerIds }
// backend
controller: ctrl.reorderLayers (template-studio.controller.ts)
repo: templateStudioRepository.reorderLayers(templateId, orderedLayerIds)
BEGIN; for (i, id) in orderedLayerIds: UPDATE template_layers
SET z_index = i + 1 WHERE id = $id AND template_id = $tpl;
COMMIT; return SELECT \* FROM template_layers WHERE template_id ORDER BY z_index ASC
joi: schemas.templateStudioLayersReorder = Joi.object({
orderedLayerIds: Joi.array().items(Joi.string().uuid()).min(1).required()
})

WizardState extension (already declared in Plan 03 wizard-state.types.ts — NO change):
state.layers: TemplateLayer[] // populated by step 2 (this plan)
state.zones.textFields: TemplateTextField[] // populated by step 3 (this plan)
state.zones.imageSlots: TemplateImageSlot[] // populated by step 3 (this plan)
</interfaces>

<spec_zone_form_fields>
Per docs/specs/features/template-studio-v3.spec.md:
TEXT zone form (8 controls):

- layerId (REQUIRED, dropdown of WizardState.layers — VOCABULARY label: « Fond animé parent »)
- label (free text, required, max 80)
- fontFamily (VOCABULARY label « Police », dropdown FONT_FAMILIES — see below)
- fontSize (number 12-200, label « Taille (px) »)
- color (color picker, label « Couleur »)
- textAlign (select left/center/right, label « Alignement »)
- maxChars (number 1-200, VOCABULARY label « Limite caractères »)
- visibleIf (free text optional, VOCABULARY label « Quand cette zone apparaît »)

IMAGE zone form (4 controls):

- layerId (REQUIRED dropdown, label « Fond animé parent »)
- label (required)
- safeZonePreset (VOCABULARY label « Zone sûre & cadrage », dropdown — preset key === fit_mode DB value, anchor inferred from preset semantics)
- visibleIf

FONT_FAMILIES: hardcoded in dashboard for now (templates.md note — table template_fonts NOT YET implemented).
Use the same array as admin-field-editor.component.ts:63: ['Anton', 'Bebas Neue', 'Montserrat', 'Roboto', 'Inter', 'Oswald']

SAFE_ZONE_PRESETS (key MUST match template_image_slots.fit_mode CHECK constraint):
{ key: 'fill-width-anchor-top', label: 'Photo en haut, déborde en bas', anchor: 'top-center' }
{ key: 'fill-height-anchor-left', label: 'Image plein cadre ancrée à gauche', anchor: 'center-left' }
{ key: 'contain', label: 'Logo centré (contain)', anchor: 'center' }
{ key: 'cover', label: 'Image plein cadre (cover)', anchor: 'center' }
</spec_zone_form_fields>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend POST /:id/layers/reorder + WizardStepBackgroundsComponent (drag-reorder + AssetManager modal trigger)</name>
  <read_first>
    - central-dashboard/src/app/features/safe/safe-portfolio.component.ts (CdkDragDrop + moveItemInArray precedent)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts (Plan 02 — verify Inputs/Outputs)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (createLayer signature is POSITIONAL: createLayer(templateId, payload))
    - central-server/src/routes/template-studio.routes.ts (mount path `/api/remotion-templates-studio`, mount AFTER `/:id/layers/:layerId` patch)
    - central-server/src/controllers/template-studio.controller.ts (existing layer CRUD pattern — repository pattern, NEVER query() direct from controller)
    - central-server/src/repositories/template-studio.repository.ts (extend; use getClient() for transactional reorder per Plan 01 convention)
    - central-server/src/middleware/validation.ts (add schemas.templateStudioLayersReorder)
    - docs/templates/mockups/template-studio-v3-mockup.html (.layers-stack, .layer-card)
  </read_first>
  <behavior>
    - Test 1 (backend): POST /api/remotion-templates-studio/:id/layers/reorder with valid uuid[] returns 200 + layers ASC by z_index reflecting new order
    - Test 2 (backend): repository wraps the N updates in a single BEGIN/COMMIT transaction (getClient(), ROLLBACK on throw)
    - Test 3 (backend): Joi rejects empty array, non-uuid items, or layerIds belonging to other templates (server-side ownership check)
    - Test 4 (UI): Layer cards render in z_index ASC order (1 = arrière, N = devant); each shows thumbnail (video metadata poster), name, duration `(durationMs/1000).toFixed(1)`s, position number
    - Test 5 (UI): Drag a layer card → moveItemInArray updates local order → calls dataService.reorderLayers(templateId, [ids]) → response replaces state.layers
    - Test 6 (UI): "+ Ajouter un fond animé" button toggles assetManagerOpen signal; AssetManagerModalComponent renders with [context]="'modal'" and (assetSelected)/(dismiss) wired
    - Test 7 (UI): onAssetPicked({url}) calls dataService.createLayer(templateId, { name: 'Fond {n}', videoUrl: url, zIndex: layers.length + 1, durationMs: 5900 }); on success layer appended + modal closes
    - Test 8 (UI): Delete button on layer card calls dataService.deleteLayer; on 409 displays « Ce fond est utilisé par N template(s) publié(s) — supprimez d'abord les clones » using err.error.detail.usedByPublishedCount
    - Test 9 (UI): "Continuer →" to step 3 is disabled until layers.length >= 1 (Pitfall P1 gate)
  </behavior>
  <files>
    - central-server/src/middleware/validation.ts (add templateStudioLayersReorder schema)
    - central-server/src/repositories/template-studio.repository.ts (add reorderLayers method)
    - central-server/src/controllers/template-studio.controller.ts (add reorderLayers handler)
    - central-server/src/routes/template-studio.routes.ts (register POST /:id/layers/reorder)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (add reorderLayers method)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 2 + onLayersChange handler + layers signal piped from state)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace step 2 placeholder)
  </files>
  <action>
    Step A — Backend reorder endpoint (3 commits — RED test first per TDD):
    1. Joi schema in middleware/validation.ts:
       ```ts
       templateStudioLayersReorder: Joi.object({
         orderedLayerIds: Joi.array().items(Joi.string().uuid()).min(1).required()
       }),
       ```
    2. Repository method (transactional via getClient(), Plan 01 convention):
       ```ts
       async reorderLayers(templateId: string, orderedLayerIds: string[]): Promise<TemplateLayerRow[]> {
         const client = await getClient();
         try {
           await client.query('BEGIN');
           // Ownership check: ensure all layerIds belong to templateId
           const owned = await client.query<{ id: string }>(
             'SELECT id FROM template_layers WHERE template_id = $1 AND id = ANY($2::uuid[])',
             [templateId, orderedLayerIds]
           );
           if (owned.rows.length !== orderedLayerIds.length) {
             throw new Error('layer_ownership_mismatch');
           }
           for (let i = 0; i < orderedLayerIds.length; i++) {
             await client.query(
               'UPDATE template_layers SET z_index = $1 WHERE id = $2 AND template_id = $3',
               [i + 1, orderedLayerIds[i], templateId]
             );
           }
           await client.query('COMMIT');
           const result = await client.query<TemplateLayerRow>(
             'SELECT * FROM template_layers WHERE template_id = $1 ORDER BY z_index ASC',
             [templateId]
           );
           return result.rows;
         } catch (err) {
           await client.query('ROLLBACK');
           throw err;
         } finally {
           client.release();
         }
       }
       ```
    3. Controller handler in template-studio.controller.ts:
       ```ts
       export const reorderLayers = async (req: AuthRequest, res: Response) => {
         try {
           const { id } = req.params;
           const { orderedLayerIds } = req.body;
           const layers = await templateStudioRepository.reorderLayers(id, orderedLayerIds);
           res.json(layers);
         } catch (err: any) {
           if (err?.message === 'layer_ownership_mismatch') {
             return res.status(400).json({ error: 'layer_ownership_mismatch' });
           }
           logger.error('reorderLayers error', { error: err, templateId: req.params.id });
           res.status(500).json({ error: 'Erreur serveur interne' });
         }
       };
       ```
    4. Route in template-studio.routes.ts (register AFTER existing `/:id/layers/:layerId` PATCH so Express matcher prefers more-specific paths):
       ```ts
       router.post(
         '/:id/layers/reorder',
         ...adminOnly,
         validateParams(paramSchemas.id),
         validate(schemas.templateStudioLayersReorder),
         sensitiveRateLimit,
         ctrl.reorderLayers,
       );
       ```
    Commit: `feat(template-studio-v3): POST /:id/layers/reorder transactional (WIZARD-04 backend)`

    Step B — Add reorderLayers to dataservice:
    ```ts
    reorderLayers(templateId: string, orderedLayerIds: string[]): Observable<TemplateLayer[]> {
      return this.api.post<TemplateLayer[]>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/layers/reorder`,
        { orderedLayerIds }
      );
    }
    ```

    Step C — Build wizard-step-backgrounds.component.ts (standalone, signal-based, mockup-aligned ~250 lines max). Key contract points:
      - Inputs: `templateId: string`, `layers: WritableSignal<TemplateLayer[]>` (passed by parent, NOT a fresh local signal)
      - Outputs: `layersChange = EventEmitter<TemplateLayer[]>()`, `prev = EventEmitter<void>()`, `next = EventEmitter<void>()` (NEVER named `submit`)
      - Imports: `CommonModule, DragDropModule, AssetManagerModalComponent`
      - Asset modal: `<app-asset-manager-modal *ngIf="assetManagerOpen()" [context]="'modal'" [respectAlphaRequired]="false" (assetSelected)="onAssetPicked($event)" (dismiss)="assetManagerOpen.set(false)" />`
      - Create call (POSITIONAL): `this.dataService.createLayer(this.templateId, { name: \`Fond \${next}\`, videoUrl: ev.url, zIndex: next, durationMs: 5900 })`
      - "Continuer →" button (NOT « Suivant ») disabled when `layers().length < 1`
      - Delete error handler reads `err?.error?.detail?.usedByPublishedCount` (Plan 01 contract)

    Step D — Wire into shell (studio-v3-wizard.component.ts + .html):
      - Import WizardStepBackgroundsComponent in `imports: [...]`
      - In .html replace step 2 placeholder:
        ```html
        <app-wizard-step-backgrounds
          [hidden]="currentStep() !== 2"
          [templateId]="state().templateId!"
          [layers]="layersSignal"
          (layersChange)="onLayersChange($event)"
          (prev)="goToStep(1)"
          (next)="goToStep(3)"
        ></app-wizard-step-backgrounds>
        ```
      - In .ts: `layersSignal = signal<TemplateLayer[]>(this.state().layers)` initialized in ctor; on `state` change (after resumeFromId), `effect(() => this.layersSignal.set(this.state().layers))`. `onLayersChange(layers) { this.state.update(s => ({ ...s, layers })); }`

    Commit: `feat(template-studio-v3): step 2 backgrounds with drag-reorder + asset modal (WIZARD-04)`

  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit && cd ../central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && cd ../central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3' --no-coverage --forceExit 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "POST.*layers/reorder\|/:id/layers/reorder" central-server/src/routes/template-studio.routes.ts` returns 1
    - `grep -n "reorderLayers" central-server/src/repositories/template-studio.repository.ts central-server/src/controllers/template-studio.controller.ts` returns ≥2
    - `grep -n "BEGIN\|ROLLBACK\|COMMIT" central-server/src/repositories/template-studio.repository.ts` shows reorderLayers wrapped in transaction
    - `grep -n "reorderLayers" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` returns 1
    - `grep -n "DragDropModule\|cdkDropList\|moveItemInArray" {wizard-step-backgrounds.component.ts}` returns ≥3
    - `grep -n "AssetManagerModalComponent\|app-asset-manager-modal" {component.ts}` returns ≥2
    - `grep -n "context]=\"'modal'\"\|(dismiss)\|(assetSelected)" {component.ts}` returns ≥3 (Plan 02 contract)
    - `grep -n "@Output.*submit" {component.ts}` returns 0 (forbidden — use `next`)
    - `grep -nE "'Suivant\b|>Suivant<" {component.ts}` returns 0 (use 'Continuer →')
    - `grep -n "layers().length < 1\|layers().length === 0" {component.ts}` returns ≥1 (P1 gate)
    - `grep -n "\\[hidden\\]=\"currentStep" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html` returns ≥2 (Plan 03 Pitfall P2 lock preserved)
    - Build succeeds; smoke v3 16/16 GREEN
  </acceptance_criteria>
  <done>Step 2 fully functional; backend reorder transactional; ≥1 layer required to advance; asset manager round-trip green; vocabulary smoke unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WizardStepZonesComponent (text + image zone forms with mandatory layer_id)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts (existing zone form precedent — DO NOT IMPORT, reference for FONT_FAMILIES list)
    - docs/specs/features/template-studio-v3.spec.md (zone form fields)
    - .planning/research/PITFALLS.md (Pitfall 1 — orphan zones)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (Plan 01 lock)
    - central-server/src/scripts/full-schema.sql L2741-2789 (template_image_slots — fit_mode CHECK constraint values)
    - .claude/rules/templates.md (template_text_fields.layer_id NOT NULL invariant ADR-086)
  </read_first>
  <behavior>
    - Test 1: Component shows 2 sub-tabs « Zones texte » and « Zones image »; each renders a list of existing zones grouped/ordered by their layer
    - Test 2: "+ Ajouter une zone texte" button DISABLED if layers().length === 0 (P1 gate); enabled otherwise + hint « Ajoutez au moins 1 fond animé à l'étape 2 avant de créer des zones »
    - Test 3: Click opens form with 8 controls; layerId dropdown labelled « Fond animé parent », pre-selected to first layer
    - Test 4: Submit calls dataService.createTextField(templateId, { layerId, slotKey, label, fontFamily, fontSize, color, textAlign, maxChars, visibleIf }) — UI validates !!layerId before submit
    - Test 5: Image zone form: 4 controls (layerId, label, safeZonePreset, visibleIf); submit maps preset → { anchor, fitMode } DB values matching CHECK constraint; calls createImageSlot
    - Test 6: Vocabulary check — all visible labels come from VOCABULARY_MAP (« Fond animé parent » not "Layer", « Limite caractères » not "max_chars", « Quand cette zone apparaît », « Zone sûre & cadrage »)
    - Test 7: « Continuer → » to step 4 enabled regardless of zone count (zones optional per SPEC); « ← Retour » to step 2 always enabled
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 3 + onZonesChange handlers)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace step 3 placeholder)
  </files>
  <action>
    Build wizard-step-zones.component.ts (standalone, ReactiveFormsModule). Key constants at top of file:
    ```ts
    const FONT_FAMILIES = ['Anton', 'Bebas Neue', 'Montserrat', 'Roboto', 'Inter', 'Oswald'] as const;

    // SAFE_ZONE_PRESETS — keys MUST match template_image_slots.fit_mode CHECK
    // (full-schema.sql L2773): contain | cover | fill-width-anchor-top | fill-height-anchor-left
    const SAFE_ZONE_PRESETS = [
      { key: 'fill-width-anchor-top',   label: 'Photo en haut, déborde en bas', anchor: 'top-center' },
      { key: 'fill-height-anchor-left', label: 'Image plein cadre ancrée à gauche', anchor: 'center-left' },
      { key: 'contain',                 label: 'Logo centré (contain)', anchor: 'center' },
      { key: 'cover',                   label: 'Image plein cadre (cover)', anchor: 'center' },
    ] as const;
    ```

    Component contract:
    - Inputs: `templateId: string`, `layers: WritableSignal<TemplateLayer[]>`, `textFields: WritableSignal<TemplateTextField[]>`, `imageSlots: WritableSignal<TemplateImageSlot[]>`
    - Outputs: `textFieldsChange`, `imageSlotsChange`, `prev`, `next` (NEVER `submit`)
    - Tabs: `tab = signal<'text' | 'image'>('text')`
    - Forms (ReactiveForms): textForm with 8 controls (layerId required + Validators.required, label required maxLength 80, fontFamily required default 'Anton', fontSize 12-200 default 56, color required default '#FFFFFF', textAlign required default 'center', maxChars 1-200 default 40, visibleIf optional)
    - imageForm with 4 controls (layerId required, label required, safeZonePreset required, visibleIf optional)
    - submitText: validate `!!v.layerId` then call `this.dataService.createTextField(this.templateId, { layerId, slotKey: \`text_\${Date.now().toString(36)}\`, label, fontFamily, fontSize, color, textAlign, maxChars, visibleIf: v.visibleIf || null })`
    - submitImage: lookup `const preset = SAFE_ZONE_PRESETS.find(p => p.key === v.safeZonePreset)`; call `createImageSlot(this.templateId, { layerId, slotKey: \`img_\${...}\`, label, anchor: preset.anchor, fitMode: preset.key, visibleIf: v.visibleIf || null })`

    Vocabulary lock (UI labels MUST be):
      « Étape 3 — Zones modifiables » (heading; Plan 03 STEP_LABELS)
      « Zones texte (N) » / « Zones image (N) » (tabs)
      « + Ajouter une zone texte » / « + Ajouter une zone image »
      « Fond animé parent » (layerId label)
      « Libellé », « Police », « Taille (px) », « Couleur », « Alignement », « Limite caractères »
      « Quand cette zone apparaît (optionnel) », « Zone sûre & cadrage »
      « Créer la zone », « Annuler » (form actions — verify « Annuler » not blocked by hook; if blocked use « Abandonner » per Plan 03 deviation note)
      « ← Retour » / « Continuer → » (nav)

    Wire into wizard shell (studio-v3-wizard.component.html — REPLACE step 3 placeholder):
    ```html
    <app-wizard-step-zones
      [hidden]="currentStep() !== 3"
      [templateId]="state().templateId!"
      [layers]="layersSignal"
      [textFields]="textFieldsSignal"
      [imageSlots]="imageSlotsSignal"
      (textFieldsChange)="onTextFieldsChange($event)"
      (imageSlotsChange)="onImageSlotsChange($event)"
      (prev)="goToStep(2)"
      (next)="goToStep(4)"
    ></app-wizard-step-zones>
    ```
    In wizard.component.ts: declare `textFieldsSignal = signal<TemplateTextField[]>(this.state().zones.textFields)` + `imageSlotsSignal = signal<TemplateImageSlot[]>(this.state().zones.imageSlots)`; `effect(() => { this.textFieldsSignal.set(this.state().zones.textFields); this.imageSlotsSignal.set(this.state().zones.imageSlots); })`. Handlers: `onTextFieldsChange(tf) { this.state.update(s => ({ ...s, zones: { ...s.zones, textFields: tf } })); }` and mirror for image.

    Commit: `feat(template-studio-v3): step 3 zones with mandatory layer_id (WIZARD-05)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && cd ../central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - File `wizard-step-zones.component.ts` exists
    - `grep -n "Validators.required" {component.ts}` returns ≥4 (layerId + label required for both forms)
    - `grep -n "layers().length === 0\|layers().length < 1" {component.ts}` returns ≥1 (P1 gate)
    - `grep -nE "'fill-width-anchor-top'|'fill-height-anchor-left'|'contain'|'cover'" {component.ts}` returns 4 distinct preset keys (matches DB CHECK)
    - `grep -nE "'fill-width'\b|'cover-center'|'fit-contain-center'" {component.ts}` returns 0 (NO invalid preset keys — these would violate template_image_slots_fit_mode_check)
    - `grep -n "@Output.*submit\b" {component.ts}` returns 0 (use `next`)
    - `grep -nE "'Suivant\b|>Suivant<" {component.ts}` returns 0 (use 'Continuer →')
    - `grep -nE "Fond animé parent|Limite caractères|Quand cette zone apparaît|Zone sûre & cadrage" {component.ts}` returns ≥4 (VOCABULARY_MAP labels)
    - `grep -n "createTextField\|createImageSlot" {component.ts}` returns ≥2
    - `grep -n "layerId" {component.ts}` returns ≥4 (form control + payload field for both forms)
    - `grep -n "\\[hidden\\]=\"currentStep" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html` returns ≥3 (steps 2, 3, 4 — Pitfall P2 preserved)
    - Build succeeds; smoke vocabulary GREEN
  </acceptance_criteria>
  <done>Step 3 functional; zones cannot be created without a layer (UI + Joi); vocabulary 100% French; safe-zone presets match DB CHECK constraint.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx tsc --noEmit` clean
- `cd central-dashboard && npx ng build --configuration=development` succeeds
- `npm run test:smoke:smart` GREEN — especially smoke-template-studio-v3-vocabulary stays GREEN
- Manual full flow on dev: create template (step 1) → upload + add 2 layers via asset modal, drag-reorder (step 2) → add 1 text zone + 1 image zone (step 3)
- DB sanity: `template_layers` z_index reflects UI order; `template_text_fields.layer_id` non-null; `template_image_slots.fit_mode` ∈ allowed CHECK values
</verification>

<success_criteria>

- WIZARD-04: drag-reorder works and persists z_index server-side via single transactional POST
- WIZARD-05: zone form covers all 8 SPEC fields for text + 4 fields for image, layer_id mandatory at UI + Joi
- Pitfall P1 gate: zones cannot be created with null layer_id (UI button disabled + backend rejects)
- Plan 03 contracts honored: signal+[hidden] (no \*ngIf), `next` not `submit`, `Continuer` not `Suivant`, state lifted to parent
- Vocabulary smoke test stays GREEN (no DB jargon leaked to UI)
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-04-SUMMARY.md` documenting:
- Step 2 + 3 component public API (Inputs/Outputs)
- Backend reorderLayers contract (route, joi, repo transaction)
- Safe-zone preset → fit_mode mapping table (4 presets)
- Manual UAT trace for the full create-then-design flow
- Plan 01-03 contracts consumed (table)
</output>
</content>
</invoke>
