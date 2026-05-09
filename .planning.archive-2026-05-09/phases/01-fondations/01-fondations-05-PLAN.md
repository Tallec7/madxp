---
phase: 01-fondations
plan: 05
type: execute
wave: 4
depends_on: ['01-fondations-04']
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
autonomous: true
requirements: [DUP-01, WIZARD-01]
must_haves:
  truths:
    - "Step 4 (Options club) lets super_admin create N options of type 'enum' or 'boolean'; option payload uses DB-real columns: { key, label, type, values: string[], default_value, user_editable, sort_order }"
    - 'Step 4 enum options expose a packshot mapping section: per option_value a dropdown of templates → POST /api/remotion-templates-studio/:id/packshot-refs { option_key, option_value, packshot_template_id }'
    - "Step 4 displays '✓ N zones reliées à cette option' by counting WizardState.zones text+image where visibleIf matches /\\b{key}\\s*==/ (Phase 2 will enrich)"
    - "Each template card on the list page shows a 'Dupliquer' button that POSTs to /api/remotion-templates/:id/duplicate (existing route — Plan 01 wired duplicateDeep) and routes to /content/templates-remotion/new/:newId?from=duplicate"
    - 'After duplicate, the cloned template opens with all 4 wizard steps pre-populated; resume forces step 3 when ?from=duplicate (per SPEC §Workflow Dupliquer)'
    - "v1 source templates surface 400 'duplicate_requires_v2' (Plan 01 backend contract) — UI shows message « Cette template legacy v1 doit être migrée avant duplication »"
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
      provides: 'Step 4 — option builder + packshot mapping'
      exports: ['WizardStepOptionsComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
      provides: "Adds 'Dupliquer' button per card + 'Nouveau template' CTA routing to /new"
      contains: 'onDuplicate'
  key_links:
    - from: WizardStepOptionsComponent
      to: dataService.createOption
      via: 'POST /api/remotion-templates-studio/:id/options { key, label, type, values, default_value, user_editable, sort_order }'
      pattern: 'createOption'
    - from: WizardStepOptionsComponent
      to: dataService.createPackshotRef
      via: 'POST /api/remotion-templates-studio/:id/packshot-refs { option_key, option_value, packshot_template_id }'
      pattern: 'createPackshotRef'
    - from: remotion-templates.component.ts
      to: dataService.duplicateTemplate
      via: 'Existing method (line 302) — calls POST /api/remotion-templates/:id/duplicate (Plan 01 wired duplicateDeep)'
      pattern: 'duplicateTemplate\\('
    - from: remotion-templates.component.ts
      to: 'router.navigate(["/content/templates-remotion/new", newId], { queryParams: { from: "duplicate" }})'
      via: 'computeResumeStep reads ?from=duplicate and forces step 3 (Plan 03 stub had basic resume; Plan 05 enriches)'
      pattern: 'from.*duplicate'
---

<objective>
Build Wizard Step 4 (Options club) and add the "Dupliquer" UX flow on the templates list — completing the Phase 1 core loop.

Purpose: WIZARD-01 (4-step wizard complete end-to-end), DUP-01 (duplicate button + clone opens at step 3 per SPEC).

Output: Step 4 component with option/packshot builder using REAL DB columns (`key`, `values`, `default_value`); duplicate button on each template card; routing logic that opens clone at step 3 via `?from=duplicate` query param consumed by Plan 03's `computeResumeStep`.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-02-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-03-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-04-PLAN.md
@docs/specs/features/template-studio-v3.spec.md
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-server/src/scripts/migrations/add-template-options-and-conditional-slots.sql
@central-server/src/routes/template-studio.routes.ts
@central-server/src/controllers/template-options.controller.ts
</context>

## Plan 01-04 contracts consumed

| Contract                                                                                                                                                                                                                        | Source plan       | Consumption in Plan 05                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templateStudioRepository.duplicateDeep(sourceId)` returns TemplateV2; throws `source_template_not_found` (404) or `clone_not_v2_readable` → controller returns 400 `duplicate_requires_v2`                                     | Plan 01           | Task 2 catches 400 in `onDuplicate` and surfaces « Cette template legacy v1 doit être migrée avant duplication »                                                                   |
| `RemotionTemplatesDataService.duplicateTemplate(id, name?)` (line 302) — calls POST `/api/remotion-templates/:id/duplicate` (NOTE: legacy mount, NOT studio mount)                                                              | Pre-existing      | Used as-is in Task 2 — no signature change                                                                                                                                         |
| Routes `/options` + `/packshot-refs` mounted on `/api/remotion-templates-studio` (server.ts:71 → template-studio.routes.ts L210-273); controllers in `template-options.controller.ts` (NOT template-studio.controller.ts)       | Pre-existing      | Task 1 dataservice methods use `/api/remotion-templates-studio/:id/options` and `/:id/packshot-refs`                                                                               |
| `template_options` REAL columns (migration `add-template-options-and-conditional-slots.sql` L31-43): `id, template_id, key, label, type, values JSONB, default_value, user_editable BOOLEAN, sort_order INT` — NOT `option_key` | Pre-existing      | Payload uses `{ key, label, type, values, default_value, user_editable: true, sort_order: 0 }`                                                                                     |
| `template_packshot_refs` REAL columns (same migration L83-95): `option_key VARCHAR(64) FK→template_options.key, option_value, packshot_template_id, start_at_ms, z_index_offset`                                                | Pre-existing      | Payload uses `{ option_key, option_value, packshot_template_id }` (start_at_ms + z_index_offset use DB defaults)                                                                   |
| `RemotionTemplatesDataService.getStudioView(id)` returns flat `TemplateStudioView` (camelCase at root, NO `view.template` envelope)                                                                                             | Plan 01 / Plan 03 | Plan 05 `computeResumeStep` reads `view.layers`, `view.textFields`, `view.imageSlots`, `view.options` (or whatever the real flat shape exposes — re-check via grep before writing) |
| `StudioV3WizardComponent` shell: signal-based currentStep, `[hidden]` step containers (Pitfall P2 lock)                                                                                                                         | Plan 03           | Plan 05 ADDS `<app-wizard-step-options [hidden]="currentStep() !== 4">` — NEVER `*ngIf`                                                                                            |
| `@Output()` named `next`/`prev`/`finish` (NEVER `submit` — `@angular-eslint/no-output-native` blocks)                                                                                                                           | Plan 03           | Step 4 outputs: `optionsChange`, `prev`, `finish`                                                                                                                                  |
| `'Continuer →'` / `'Terminer'` button labels (NOT `'Suivant'` — pre-commit i18n hook blocks)                                                                                                                                    | Plan 03           | « Terminer » verb is free (not in blocklist); verify before commit. If blocked, fallback « Valider et fermer »                                                                     |
| `WizardState.options: TemplateOption[]` already declared (wizard-state.types.ts L31)                                                                                                                                            | Plan 03           | Plan 05 emits to parent via `(optionsChange)`; parent calls `state.update(s => ({ ...s, options }))`                                                                               |
| `WizardState.zones.{textFields, imageSlots}` populated by Plan 04                                                                                                                                                               | Plan 04           | Plan 05 reads `zones()` to compute `countLinkedZones(optionKey)` for the « ✓ N zones reliées » indicator                                                                           |
| `VOCABULARY_MAP` labels « Option club » + « Vidéo packshot » (Plan 01 lock)                                                                                                                                                     | Plan 01           | All UI uses these terms — no leak of `template_options` / `template_packshot_refs` strings                                                                                         |

<interfaces>
Existing dataservice (NO change needed):
  duplicateTemplate(id: string, name?: string): Observable<RemotionTemplate>     // line 302 — POST /api/remotion-templates/:id/duplicate

To ADD in this plan (Task 1, mirror createTextField pattern — POSITIONAL signature):
// Note: backend routes ALREADY EXIST on /api/remotion-templates-studio (verified template-studio.routes.ts L220-273)
// Controllers live in template-options.controller.ts (createOption, updateOption, deleteOption, listPackshotRefs, createPackshotRef, deletePackshotRef)
// Joi schemas exist: schemas.templateOptionCreate, schemas.templateOptionUpdate, schemas.templatePackshotRefCreate

createOption(templateId: string, payload: {
key: string; // VARCHAR(64), regex /^[a-z][a-z0-9_]\*$/
label: string;
type: 'enum' | 'boolean';
values: string[]; // JSONB array
default_value: string;
user_editable?: boolean; // default true
sort_order?: number; // default 0
}): Observable<TemplateOption>
→ POST /api/remotion-templates-studio/:id/options

deleteOption(templateId: string, optionId: string): Observable<void>
→ DELETE /api/remotion-templates-studio/:id/options/:optionId

listPackshotRefs(templateId: string): Observable<TemplatePackshotRef[]>
→ GET /api/remotion-templates-studio/:id/packshot-refs

createPackshotRef(templateId: string, payload: {
option_key: string; // FK → template_options.key
option_value: string;
packshot_template_id: string; // FK → neopro_templates.id
start_at_ms?: number; // default 0
z_index_offset?: number; // default 100
}): Observable<TemplatePackshotRef>
→ POST /api/remotion-templates-studio/:id/packshot-refs

deletePackshotRef(templateId: string, refId: string): Observable<void>
→ DELETE /api/remotion-templates-studio/:id/packshot-refs/:packshotRefId

listPublishedTemplates(): Observable<RemotionTemplate[]>
→ GET /api/remotion-templates?published=true (verify query param against legacy controller; if not supported, filter client-side by tpl.is_published || tpl.publishedAt)

Types to ADD in remotion-templates.types.ts (mirror existing TemplateLayer / TemplateTextField shape):
export interface TemplateOption {
id: string; templateId: string;
key: string; label: string; type: 'enum' | 'boolean';
values: string[]; defaultValue: string;
userEditable: boolean; sortOrder: number;
createdAt: string; updatedAt: string;
}
export interface TemplatePackshotRef {
id: string; templateId: string;
optionKey: string; optionValue: string;
packshotTemplateId: string;
startAtMs: number; zIndexOffset: number;
createdAt: string;
}
// Backend may return snake_case or camelCase — confirm by reading template-options.controller.ts response shape
// before writing the types. If snake_case, declare snake_case interface fields and adapt UI accordingly.

Resume-step computation (refines Plan 03 stub):
computeResumeStep(view: TemplateStudioView): WizardStep
if (route.snapshot.queryParamMap.get('from') === 'duplicate') return 3; // SPEC §Workflow Dupliquer
if ((view.layers?.length ?? 0) === 0) return 2;
const zoneCount = (view.textFields?.length ?? 0) + (view.imageSlots?.length ?? 0);
if (zoneCount === 0) return 3;
return 4;
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WizardStepOptionsComponent (option builder + packshot mapping + linked-zone count)</name>
  <read_first>
    - docs/specs/features/template-studio-v3.spec.md (Étape 4 + Workflow Dupliquer)
    - central-server/src/scripts/migrations/add-template-options-and-conditional-slots.sql (REAL DB schema for template_options + template_packshot_refs)
    - central-server/src/controllers/template-options.controller.ts (verify response shape — snake_case vs camelCase)
    - central-server/src/routes/template-studio.routes.ts L210-273 (verify mount path /api/remotion-templates-studio)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (createTextField pattern to mirror — POSITIONAL signature)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts (add TemplateOption + TemplatePackshotRef interfaces)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (Plan 04 — pattern for inline form + list)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (« Option club », « Vidéo packshot »)
  </read_first>
  <behavior>
    - Test 1: Component lists existing options as cards (label, type pill « Choix multiple » / « Oui/Non », values pills with default highlighted, delete button)
    - Test 2: "+ Ajouter une option club" opens form: key (auto-slug from label, regex /^[a-z][a-z0-9_]*$/), label, type (enum | boolean), values (comma-separated parsed to array — boolean auto-fills ['true','false']), defaultValue
    - Test 3: For type='enum' options, after creation a packshot mapping section appears: per option value, dropdown listing publishedTemplates() (« — Aucun packshot — » default); on select POST createPackshotRef
    - Test 4: For each option, display « ✓ N zones reliées à cette option » computing N from WizardState.zones text+image where visibleIf matches /\\b{key}\\s*==/ (regex bounded — same key suffix safe)
    - Test 5: « Terminer » button routes back to /content/templates-remotion (no auto-publish — Phase 3 owns publish)
    - Test 6: Plan 03 contracts honored — no @Output named `submit`, no `'Suivant'` literal, [hidden] used in shell wiring
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts (add TemplateOption + TemplatePackshotRef interfaces)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (add 6 methods: createOption, deleteOption, listPackshotRefs, createPackshotRef, deletePackshotRef, listPublishedTemplates)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 4 + onOptionsChange + computeResumeStep refinement reading queryParam)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace step 4 placeholder)
  </files>
  <action>
    Step A — Types in remotion-templates.types.ts (verify backend response casing FIRST by reading template-options.controller.ts; declare interface accordingly):
    ```ts
    export interface TemplateOption {
      id: string; templateId: string;
      key: string; label: string; type: 'enum' | 'boolean';
      values: string[]; defaultValue: string;
      userEditable: boolean; sortOrder: number;
      createdAt: string; updatedAt: string;
    }
    export interface TemplatePackshotRef {
      id: string; templateId: string;
      optionKey: string; optionValue: string;
      packshotTemplateId: string;
      startAtMs: number; zIndexOffset: number;
      createdAt: string;
    }
    ```

    Step B — Add 6 methods to dataservice (POSITIONAL signature, mirror createTextField — uses ApiService Observable pattern, NO `fetch()` per dashboard.md rule):
    ```ts
    createOption(templateId: string, payload: {
      key: string; label: string; type: 'enum' | 'boolean';
      values: string[]; default_value: string;
      user_editable?: boolean; sort_order?: number;
    }): Observable<TemplateOption> {
      return this.api.post<TemplateOption>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/options`,
        payload
      );
    }
    deleteOption(templateId: string, optionId: string): Observable<void> {
      return this.api.delete<void>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/options/${encodeURIComponent(optionId)}`
      );
    }
    listPackshotRefs(templateId: string): Observable<TemplatePackshotRef[]> {
      return this.api.get<TemplatePackshotRef[]>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/packshot-refs`
      );
    }
    createPackshotRef(templateId: string, payload: {
      option_key: string; option_value: string; packshot_template_id: string;
      start_at_ms?: number; z_index_offset?: number;
    }): Observable<TemplatePackshotRef> {
      return this.api.post<TemplatePackshotRef>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/packshot-refs`,
        payload
      );
    }
    deletePackshotRef(templateId: string, refId: string): Observable<void> {
      return this.api.delete<void>(
        `/api/remotion-templates-studio/${encodeURIComponent(templateId)}/packshot-refs/${encodeURIComponent(refId)}`
      );
    }
    listPublishedTemplates(): Observable<RemotionTemplate[]> {
      // First try query param; if backend rejects, fallback to listTemplates() + client-side filter
      return this.api.get<RemotionTemplate[]>('/api/remotion-templates').pipe(
        map(list => list.filter(t => (t as any).is_published || (t as any).publishedAt))
      );
    }
    ```
    NOTE on backend payload casing: the migration uses snake_case (`default_value`, `user_editable`, `sort_order`, `option_key`, `option_value`, `packshot_template_id`). Existing Joi schemas (`schemas.templateOptionCreate`, `schemas.templatePackshotRefCreate`) accept snake_case based on column names. Verify by reading those schemas in `central-server/src/middleware/validation.ts` BEFORE finalizing the payload casing — if Joi expects camelCase, adapt accordingly (DON'T change the schema, change the payload).

    Step C — Build wizard-step-options.component.ts (standalone, ReactiveFormsModule). Component contract:
      - Inputs: `templateId: string`, `options: WritableSignal<TemplateOption[]>`, `zones: Signal<{ textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] }>`
      - Outputs: `optionsChange`, `prev`, `finish` (NEVER `submit`)
      - Form (8-line summary): key (Validators.required + pattern /^[a-z][a-z0-9_]*$/), label (required, max 80), type (default 'enum'), valuesRaw (free text, parsed on submit), defaultValue (required)
      - autoSlug(label): normalize NFD, lowercase, /[^a-z0-9]+/g → '_', trim, slice 40
      - submitOption: `values = type === 'boolean' ? ['true','false'] : v.valuesRaw.split(',').map(s => s.trim()).filter(Boolean)`; require `values.length >= 1`. Then `dataService.createOption(templateId, { key: v.key!, label: v.label!, type: v.type!, values, default_value: v.defaultValue!, user_editable: true, sort_order: this.options().length })`.
      - countLinkedZones(optionKey): `const re = new RegExp(\`\\\\b\${optionKey}\\\\s*==\`); return zones.textFields.filter(f => f.visibleIf && re.test(f.visibleIf)).length + zones.imageSlots.filter(s => s.visibleIf && re.test(s.visibleIf)).length`
      - onPackshotChange(opt, value, ev): `dataService.createPackshotRef(templateId, { option_key: opt.key, option_value: value, packshot_template_id: tplId })`
      - ngOnInit: `dataService.listPublishedTemplates().subscribe(t => this.publishedTemplates.set(t)); dataService.listPackshotRefs(templateId).subscribe(r => this.packshotRefs.set(r))`

    Vocabulary lock (UI labels MUST be):
      « Étape 4 — Options club » (heading; Plan 03 STEP_LABELS)
      « + Ajouter une option club »
      « Choix multiple (ex: logo / numéro) » / « Oui / Non » (type select)
      « Valeurs possibles (séparées par virgule) »
      « Valeur par défaut »
      « Vidéo packshot par valeur » (sub-heading per VOCABULARY_MAP « Vidéo packshot »)
      « Si {value} → »
      « — Aucun packshot — »
      « ✓ {N} zone(s) reliée(s) à cette option »
      « ← Retour » / « Terminer »
      « Annuler » (form action — fallback « Abandonner » if i18n hook blocks)

    Step D — Refine computeResumeStep + wire step 4 in shell.
    In studio-v3-wizard.component.ts:
    ```ts
    private computeResumeStep(view: TemplateStudioView): WizardStep {
      const fromDup = this.route.snapshot.queryParamMap.get('from') === 'duplicate';
      if (fromDup) return 3;
      if ((view.layers?.length ?? 0) === 0) return 2;
      const zoneCount = (view.textFields?.length ?? 0) + (view.imageSlots?.length ?? 0);
      if (zoneCount === 0) return 3;
      return 4;
    }
    optionsSignal = signal<TemplateOption[]>(this.state().options);
    zonesSignal = computed(() => this.state().zones);
    onOptionsChange(options: TemplateOption[]) {
      this.state.update(s => ({ ...s, options }));
    }
    onFinish() { this.router.navigate(['/content/templates-remotion']); }
    ```
    Replace step 4 placeholder in .html (PRESERVE [hidden] pattern — Pitfall P2):
    ```html
    <app-wizard-step-options
      [hidden]="currentStep() !== 4"
      [templateId]="state().templateId!"
      [options]="optionsSignal"
      [zones]="zonesSignal"
      (optionsChange)="onOptionsChange($event)"
      (prev)="goToStep(3)"
      (finish)="onFinish()"
    ></app-wizard-step-options>
    ```

    Commit: `feat(template-studio-v3): step 4 options + packshot mapping (WIZARD-01)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && cd ../central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3' --no-coverage --forceExit 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File `wizard-step-options.component.ts` exists
    - `grep -n "createOption\|createPackshotRef\|listPublishedTemplates\|deleteOption\|listPackshotRefs" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` returns ≥5
    - `grep -nE "default_value|user_editable|sort_order|option_key|packshot_template_id" {component.ts} {dataservice.ts}` returns ≥5 (DB-real snake_case payload fields)
    - `grep -nE "'option_key'\\s*:|optionKey\\s*=" {component.ts}` shows the FK reference is named `option_key` in payloads (matches template_packshot_refs schema)
    - `grep -n "countLinkedZones" {component.ts}` returns ≥1
    - `grep -n "from.*=.*'duplicate'\|from=duplicate" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts` returns ≥1 (resume override)
    - `grep -n "@Output.*submit\b" {component.ts}` returns 0 (use `finish`/`next`)
    - `grep -nE "'Suivant\b" {component.ts}` returns 0
    - `grep -n "\\[hidden\\]=\"currentStep() !== 4\"" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html` returns 1 (Pitfall P2 preserved for step 4)
    - Build succeeds; smoke v3 16/16 GREEN
    - Manual: create option « Type d'intro » with values « logo, numéro » → option card appears with both pills + per-value packshot dropdown listing published templates
  </acceptance_criteria>
  <done>Step 4 functional; full 4-step wizard usable end-to-end; « Terminer » returns to list; resume from ?from=duplicate forces step 3.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add « Dupliquer » + « + Nouveau template » CTAs on the templates list page (DUP-01)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts:302 (existing duplicateTemplate — POST /api/remotion-templates/:id/duplicate, NOT /api/remotion-templates-studio)
    - .planning/phases/01-fondations/01-fondations-01-SUMMARY.md (Plan 01 backend wiring: duplicateDeep + 400 duplicate_requires_v2 for v1 sources)
    - docs/specs/features/template-studio-v3.spec.md (Workflow Dupliquer)
  </read_first>
  <behavior>
    - Test 1: A « + Nouveau template » button is visible at the top of the list page (super_admin only); click navigates to /content/templates-remotion/new
    - Test 2: Each template card has a « Dupliquer » button visible to super_admin
    - Test 3: Click « Dupliquer » calls dataService.duplicateTemplate(id) → on success navigates to /content/templates-remotion/new/{newId} with queryParams { from: 'duplicate' } → wizard opens at Step 3 (Plan 05 Task 1 computeResumeStep refinement)
    - Test 4: On 400 `duplicate_requires_v2`, displays inline message « Cette template legacy v1 doit être migrée avant duplication »; the list remains unchanged
    - Test 5: On 404 `source_template_not_found` or other errors, displays « Duplication échouée — réessayez ou consultez les logs »
    - Test 6: Button shows « Duplication… » + disabled while in-flight (per-card duplicating signal)
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
  </files>
  <action>
    Step A — Add duplicate handler + new template CTA in remotion-templates.component.ts:
    ```ts
    private router = inject(Router);
    duplicating = signal<string | null>(null);
    duplicateError = signal<string | null>(null);

    onNewTemplate() {
      this.router.navigate(['/content/templates-remotion/new']);
    }

    onDuplicate(tpl: RemotionTemplate, ev: Event) {
      ev.stopPropagation();
      this.duplicating.set(tpl.id);
      this.duplicateError.set(null);
      this.dataService.duplicateTemplate(tpl.id).subscribe({
        next: copy => {
          this.duplicating.set(null);
          this.router.navigate(
            ['/content/templates-remotion/new', copy.id],
            { queryParams: { from: 'duplicate' } }
          );
        },
        error: (err) => {
          this.duplicating.set(null);
          if (err?.status === 400 && err?.error?.error === 'duplicate_requires_v2') {
            this.duplicateError.set('Cette template legacy v1 doit être migrée avant duplication.');
          } else {
            this.duplicateError.set('Duplication échouée — réessayez ou consultez les logs.');
          }
        }
      });
    }
    ```

    Step B — Update remotion-templates.component.html. Add at the top of the page header:
    ```html
    <div class="rt__toolbar">
      <h1>Templates Remotion</h1>
      <div>
        <button class="btn btn-ghost" routerLink="/content/templates-remotion/assets">📁 Bibliothèque de fonds</button>
        <button class="btn btn-primary" (click)="onNewTemplate()">+ Nouveau template</button>
      </div>
    </div>
    <div class="rt__error" *ngIf="duplicateError()">{{ duplicateError() }}</div>
    ```
    On each template card actions row, add:
    ```html
    <button class="card-actions__btn"
            [disabled]="duplicating() === tpl.id"
            (click)="onDuplicate(tpl, $event)">
      {{ duplicating() === tpl.id ? 'Duplication…' : 'Dupliquer' }}
    </button>
    ```

    NOTE: « Duplication… » uses ellipsis char `…` (NOT `...`) — pre-commit i18n hook is more lenient on accented chars. Verify before commit; fallback « Duplication en cours » if blocked.

    Commit: `feat(template-studio-v3): duplicate button + new template CTA on list (DUP-01)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && cd ../central-server && npm run test:smoke:smart 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "onDuplicate\|duplicateTemplate" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts` returns ≥2
    - `grep -nE "from:\\s*'duplicate'|from=duplicate" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts` returns 1 (queryParam navigation)
    - `grep -n "duplicate_requires_v2" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts` returns 1 (Plan 01 v1 contract surfaced in UI)
    - `grep -n "Dupliquer\|Nouveau template" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html` returns ≥2
    - `grep -nE "fetch\\(" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts` returns 0 (dashboard.md rule — ApiService only)
    - Build succeeds; smoke smart green
    - Manual end-to-end: click Dupliquer on existing v2 template → wizard opens at Step 3 with all fields populated; verify clone via `psql` count: `SELECT (SELECT COUNT(*) FROM template_layers WHERE template_id = '<src>') AS src, (SELECT COUNT(*) FROM template_layers WHERE template_id = '<new>') AS new` should match
    - Manual: click Dupliquer on a v1 source → message « Cette template legacy v1 doit être migrée avant duplication »
  </acceptance_criteria>
  <done>Duplicate UX complete; new template CTA visible; Plan 01 backend contract (duplicate_requires_v2) surfaced; full Phase 1 acceptance achievable end-to-end.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx tsc --noEmit` clean
- `cd central-dashboard && npx ng build --configuration=development` succeeds
- All 3 v3 smoke suites + global smoke: `npm run test:smoke` GREEN
- Manual SPEC §Workflow Dupliquer: duplicate « BUT Simple » → wizard opens at step 3 → verify clone has independent layer ids but identical video_url, independent text_fields with NEW layer_id refs, independent options + packshot_refs
- DB sanity: `SELECT COUNT(*) FROM template_layers WHERE template_id = '<newId>'` matches source count; same for text_fields, image_slots, options, packshot_refs (6 child tables per Plan 01 duplicateDeep contract)
</verification>

<success_criteria>

- WIZARD-01: All 4 steps usable end-to-end from /new (create) and /new/:id (resume)
- DUP-01: Duplicate button works for v2/v3 sources; clone opens at Step 3; v1 sources surface explicit migration message
- All Phase 1 success criteria from ROADMAP achieved:
  1. Browse/upload/delete WebM with alpha enforcement (plan 01 + 02)
  2. 4-step wizard with no-data-loss + back nav + drag-reorder (plans 03 + 04)
  3. Duplicate flow opens at step 3, single-transaction (plan 01 + 05)
  4. 3 smoke tests green throughout (plan 01)
- Plan 01-04 contracts honored: snake_case payloads, real DB columns (`key` not `option_key` for template_options; `option_key` IS correct for template_packshot_refs FK), routes on `/api/remotion-templates-studio`, [hidden] preserved, no `submit` outputs, no `'Suivant'` literals
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-05-SUMMARY.md` documenting:
- Step 4 component public API (Inputs/Outputs)
- 6 dataservice methods added (signatures + endpoint mounts)
- Duplicate flow trace (click → POST /api/remotion-templates/:id/duplicate → router.navigate ?from=duplicate → computeResumeStep → step 3)
- v1 source rejection trace (400 duplicate_requires_v2 → French message)
- Final Phase 1 acceptance test results (4 success criteria)
- Cumulative requirement coverage (13/13 IDs)
- Plan 01-04 contracts consumed (table)
</output>
</content>
</invoke>
