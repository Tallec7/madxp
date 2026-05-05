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
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
autonomous: true
requirements: [DUP-01, WIZARD-01]
must_haves:
  truths:
    - 'Step 4 (Options club) lets super_admin create N options of type enum or boolean with values + default + per-value packshot_template_id mapping'
    - "Step 4 shows '✓ N zones reliées à cette option' (basic count via local visible_if scan — Phase 2 enhances)"
    - "Each template card on the list page shows a 'Dupliquer' button that POSTs to /:id/duplicate and routes to /content/templates-remotion/new/:newId at step 3"
    - 'After duplicate, the cloned template opens with all 4 wizard steps pre-populated; step 3 is the entry view per SPEC'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
      provides: 'Step 4 — option builder + packshot mapping'
      exports: ['WizardStepOptionsComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
      provides: "Adds 'Dupliquer' button per card + 'Nouveau template' CTA routing to /new"
      contains: 'duplicate'
  key_links:
    - from: WizardStepOptionsComponent
      to: dataService.createOption / createPackshotRef
      via: 'POST per option, POST per packshot mapping'
      pattern: 'createOption|createPackshotRef'
    - from: remotion-templates.component.ts
      to: dataService.duplicateTemplate
      via: 'Existing method (line 279) — already calls POST /:id/duplicate'
      pattern: "duplicateTemplate\\("
---

<objective>
Build Wizard Step 4 (Options club) and add the "Dupliquer" UX flow on the templates list — completing the Phase 1 core loop.

Purpose: WIZARD-01 (4-step wizard complete), DUP-01 (duplicate button + clone opens at step 3).

Output: Step 4 component with option/packshot builder; duplicate button on each card; routing logic that opens clone at step 3 of the wizard.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md (Duplicate Flow lines 263-272)
@docs/specs/features/template-studio-v3.spec.md (Étape 4 lines 84-89, Workflow Dupliquer lines 95-101)
@docs/templates/mockups/template-studio-v3-mockup.html (.options-builder section)
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts

<interfaces>
Existing data service (already present, NO changes needed):
  duplicateTemplate(id: string, name?: string): Observable<RemotionTemplate>  // line 279

To VERIFY exists or ADD if missing (template-studio CRUD methods):
createOption({ templateId, optionKey, label, type: 'enum'|'boolean', values: string[], defaultValue: string }): Observable<TemplateOption>
deleteOption(templateId: string, optionId: string): Observable<void>
createPackshotRef({ templateId, optionKey, optionValue, packshotTemplateId, startAtMs?, zIndexOffset? }): Observable<TemplatePackshotRef>
deletePackshotRef(templateId: string, refId: string): Observable<void>
listPublishedTemplates(): Observable<RemotionTemplate[]> // for packshot dropdown

If any of these are missing in remotion-templates-data.service.ts, ADD them following the existing ApiService.post pattern (mirror createTextField).

Resume-step computation (extends plan 03 stub):
computeResumeStep(tpl): WizardStep - if tpl.layers.length === 0 → 2 - else if tpl.textFields.length + tpl.imageSlots.length === 0 → 3 - else if tpl.options.length === 0 → 4 - else → 4 (final review)
When opened from "Dupliquer" → force step 3 per SPEC (use a query param ?from=duplicate to override resume logic)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WizardStepOptionsComponent (option builder + packshot mapping + visible_if zone count)</name>
  <read_first>
    - docs/specs/features/template-studio-v3.spec.md (lines 84-89)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (verify create/delete option + packshot methods exist; add if missing)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (precedent for inline form + list pattern)
  </read_first>
  <behavior>
    - Test 1: Component lists existing options as cards (name, type, values pills, default highlighted)
    - Test 2: "+ Ajouter une option club" opens form: optionKey (auto-slug from label), label, type (enum | boolean), values (pill-input — comma-separated parsed to array), defaultValue (dropdown of values)
    - Test 3: For type='enum', after option is created, a packshot mapping section appears: per value, a dropdown listing PUBLISHED templates ('— Aucun packshot —' default) → on select, POST createPackshotRef
    - Test 4: For each option in the list, display "✓ N zones reliées à cette option" by counting WizardState.zones.{textFields, imageSlots} where visibleIf contains the option_key (simple string match `optionKey ==`)
    - Test 5: "Terminer" button (no auto-publish in Phase 1 — publication is Phase 3) routes back to /content/templates-remotion list
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (add missing methods if needed)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 4 + computeResumeStep refinement)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace step 4 placeholder)
  </files>
  <action>
    Step 1 — Verify/add option + packshot methods in data service. If missing, mirror createTextField pattern:
    ```ts
    createOption(payload: { templateId: string; optionKey: string; label: string; type: 'enum'|'boolean'; values: string[]; defaultValue: string }): Observable<TemplateOption> {
      const { templateId, ...body } = payload;
      return this.api.post<TemplateOption>(`/api/remotion-templates/${encodeURIComponent(templateId)}/options`, body);
    }
    deleteOption(templateId: string, optionId: string): Observable<void> {
      return this.api.delete<void>(`/api/remotion-templates/${encodeURIComponent(templateId)}/options/${encodeURIComponent(optionId)}`);
    }
    createPackshotRef(payload: { templateId: string; optionKey: string; optionValue: string; packshotTemplateId: string; startAtMs?: number; zIndexOffset?: number }): Observable<TemplatePackshotRef> {
      const { templateId, ...body } = payload;
      return this.api.post<TemplatePackshotRef>(`/api/remotion-templates/${encodeURIComponent(templateId)}/packshot-refs`, body);
    }
    listPublishedTemplates(): Observable<RemotionTemplate[]> {
      return this.api.get<RemotionTemplate[]>('/api/remotion-templates?published=true');
    }
    ```
    NOTE: If the backend routes do not exist yet, that's a Phase 1 gap — add a Wave 0 backend task in Plan 01 retro. For Phase 1 minimum, the controllers should accept these payloads (existing template-studio.routes.ts already has CRUD on options + packshot-refs per `grep` of the routes file).

    Step 2 — Build wizard-step-options.component.ts:
    ```ts
    @Component({
      selector: 'app-wizard-step-options',
      standalone: true,
      imports: [CommonModule, ReactiveFormsModule],
      template: `
        <div class="v3o">
          <h2>Étape 4 — Options club</h2>
          <p class="v3o__lead">Créez les choix proposés à l'utilisateur final (ex : type d'intro, type de packshot).</p>

          <div class="v3o__list">
            <article class="v3o__opt" *ngFor="let opt of options()">
              <div class="v3o__opt-head">
                <strong>{{ opt.label }}</strong>
                <span class="v3o__type">{{ opt.type === 'boolean' ? 'Oui/Non' : 'Choix multiple' }}</span>
                <button (click)="onDeleteOption(opt)">Supprimer</button>
              </div>
              <div class="v3o__opt-values">
                <span class="v3o__pill" *ngFor="let v of opt.values" [class.v3o__pill--default]="v === opt.defaultValue">{{ v }}</span>
              </div>
              <div class="v3o__opt-link">✓ {{ countLinkedZones(opt.optionKey) }} zone(s) reliée(s) à cette option</div>

              <div class="v3o__packshot" *ngIf="opt.type === 'enum'">
                <h4>Vidéo packshot par valeur</h4>
                <div class="v3o__packshot-row" *ngFor="let v of opt.values">
                  <span>Si {{ v }} →</span>
                  <select (change)="onPackshotChange(opt, v, $event)">
                    <option value="">— Aucun packshot —</option>
                    <option *ngFor="let t of publishedTemplates()" [value]="t.id"
                      [selected]="getCurrentPackshotId(opt.optionKey, v) === t.id">{{ t.name }}</option>
                  </select>
                </div>
              </div>
            </article>
          </div>

          <button class="v3o__add" (click)="formOpen.set(true)">+ Ajouter une option club</button>

          <form *ngIf="formOpen()" [formGroup]="optForm" (ngSubmit)="submitOption()" class="v3o__form">
            <label>Nom de l'option (ce que verra l'utilisateur)</label>
            <input formControlName="label" placeholder='Ex : Type d’intro' (input)="autoSlug($event)" />

            <label>Type</label>
            <select formControlName="type">
              <option value="enum">Choix multiple (ex: logo / numéro)</option>
              <option value="boolean">Oui / Non</option>
            </select>

            <label *ngIf="optForm.value.type === 'enum'">Valeurs possibles (séparées par virgule)</label>
            <input *ngIf="optForm.value.type === 'enum'" formControlName="valuesRaw" placeholder="logo, numéro" />

            <label>Valeur par défaut</label>
            <input formControlName="defaultValue" placeholder="logo" />

            <div class="v3o__form-actions">
              <button type="button" (click)="formOpen.set(false)">Annuler</button>
              <button type="submit" class="btn btn-primary" [disabled]="optForm.invalid">Créer l'option</button>
            </div>
          </form>

          <div class="v3o__nav">
            <button class="btn btn-ghost" (click)="prev.emit()">← Précédent</button>
            <button class="btn btn-primary" (click)="finish.emit()">Terminer</button>
          </div>
        </div>
      `,
      styles: [` /* ~120 lines */ `],
    })
    export class WizardStepOptionsComponent implements OnInit {
      private fb = inject(FormBuilder);
      private dataService = inject(RemotionTemplatesDataService);

      @Input() templateId!: string;
      @Input({ required: true }) options = signal<TemplateOption[]>([]);
      @Input({ required: true }) zones = signal<{ textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] }>({ textFields: [], imageSlots: [] });
      @Output() optionsChange = new EventEmitter<TemplateOption[]>();
      @Output() prev = new EventEmitter<void>();
      @Output() finish = new EventEmitter<void>();

      formOpen = signal(false);
      publishedTemplates = signal<RemotionTemplate[]>([]);
      packshotRefs = signal<TemplatePackshotRef[]>([]);

      optForm = this.fb.group({
        optionKey: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]*$/)]],
        label: ['', [Validators.required, Validators.maxLength(80)]],
        type: ['enum' as 'enum' | 'boolean', [Validators.required]],
        valuesRaw: [''],
        defaultValue: ['', [Validators.required]],
      });

      ngOnInit() {
        this.dataService.listPublishedTemplates().subscribe(t => this.publishedTemplates.set(t));
        // Load existing packshot refs for this template (add list endpoint or derive from getTemplateById)
      }

      autoSlug(ev: Event) {
        const label = (ev.target as HTMLInputElement).value;
        const slug = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
        this.optForm.patchValue({ optionKey: slug });
      }

      submitOption() {
        if (this.optForm.invalid) return;
        const v = this.optForm.getRawValue();
        const values = v.type === 'boolean' ? ['true', 'false'] : v.valuesRaw!.split(',').map(s => s.trim()).filter(Boolean);
        if (values.length === 0) return;
        this.dataService.createOption({
          templateId: this.templateId,
          optionKey: v.optionKey!,
          label: v.label!,
          type: v.type!,
          values,
          defaultValue: v.defaultValue!,
        }).subscribe(opt => {
          const updated = [...this.options(), opt];
          this.options.set(updated);
          this.optionsChange.emit(updated);
          this.formOpen.set(false);
          this.optForm.reset({ type: 'enum' });
        });
      }

      onDeleteOption(opt: TemplateOption) {
        if (!confirm(`Supprimer l'option ${opt.label} ?`)) return;
        this.dataService.deleteOption(this.templateId, opt.id).subscribe(() => {
          const updated = this.options().filter(x => x.id !== opt.id);
          this.options.set(updated);
          this.optionsChange.emit(updated);
        });
      }

      onPackshotChange(opt: TemplateOption, value: string, ev: Event) {
        const tplId = (ev.target as HTMLSelectElement).value;
        if (!tplId) return;
        this.dataService.createPackshotRef({
          templateId: this.templateId,
          optionKey: opt.optionKey,
          optionValue: value,
          packshotTemplateId: tplId,
        }).subscribe(ref => this.packshotRefs.update(list => [...list, ref]));
      }

      getCurrentPackshotId(optionKey: string, optionValue: string): string | null {
        const r = this.packshotRefs().find(x => x.optionKey === optionKey && x.optionValue === optionValue);
        return r?.packshotTemplateId ?? null;
      }

      countLinkedZones(optionKey: string): number {
        const z = this.zones();
        const pattern = new RegExp(`\\b${optionKey}\\s*==`);
        const tCount = z.textFields.filter(f => f.visibleIf && pattern.test(f.visibleIf)).length;
        const iCount = z.imageSlots.filter(s => s.visibleIf && pattern.test(s.visibleIf)).length;
        return tCount + iCount;
      }
    }
    ```

    Step 3 — Wire into wizard shell + refine computeResumeStep:
    ```ts
    private computeResumeStep(tpl: RemotionTemplate & { layers?: any[]; textFields?: any[]; imageSlots?: any[]; options?: any[] }): WizardStep {
      // Detect ?from=duplicate query param → force step 3
      const fromDup = this.route.snapshot.queryParamMap.get('from') === 'duplicate';
      if (fromDup) return 3;
      if (!tpl.layers || tpl.layers.length === 0) return 2;
      const zoneCount = (tpl.textFields?.length ?? 0) + (tpl.imageSlots?.length ?? 0);
      if (zoneCount === 0) return 3;
      return 4;
    }
    ```
    Replace step 4 placeholder in HTML with `<app-wizard-step-options [hidden]="currentStep() !== 4" [templateId]="state().templateId!" [options]="..." [zones]="..." (optionsChange)="onOptionsChange($event)" (prev)="goToStep(3)" (finish)="onFinish()"></app-wizard-step-options>`. Add `onFinish() { this.router.navigate(['/content/templates-remotion']); }`.

    Commit: `feat(template-studio-v3): step 4 options + packshot mapping (WIZARD-01)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - File wizard-step-options.component.ts exists
    - `grep -n "createOption\|createPackshotRef\|listPublishedTemplates" {component.ts}` returns 3+
    - `grep -n "countLinkedZones" {component.ts}` returns 1 (UX-03 precursor)
    - `grep -n "from=duplicate" {wizard.component.ts}` returns 1 (resume override)
    - Build succeeds
    - Manual: create option "Type d'intro" with values "logo, numéro" → option card appears with both pills + per-value packshot dropdown
  </acceptance_criteria>
  <done>Step 4 functional; full wizard usable end-to-end; "Terminer" returns to list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add "Dupliquer" + "Nouveau template" CTAs on the templates list page (DUP-01)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts:279 (existing duplicateTemplate)
    - docs/specs/features/template-studio-v3.spec.md (Workflow Dupliquer lines 95-101)
  </read_first>
  <behavior>
    - Test 1: A "+ Nouveau template" button is visible at the top of the list page; click navigates to /content/templates-remotion/new
    - Test 2: Each template card has a "Dupliquer" button visible to super_admin
    - Test 3: Click "Dupliquer" calls dataService.duplicateTemplate(id) → on success, navigates to /content/templates-remotion/new/{newId}?from=duplicate
    - Test 4: The wizard opens at Step 3 (Zones) per SPEC, with all data pre-populated
    - Test 5: On error, an inline toast or alert message displays; the list remains unchanged
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
  </files>
  <action>
    Step 1 — Add duplicate handler + new template CTA in remotion-templates.component.ts:
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
          this.router.navigate(['/content/templates-remotion/new', copy.id], { queryParams: { from: 'duplicate' } });
        },
        error: () => {
          this.duplicating.set(null);
          this.duplicateError.set('Duplication échouée — réessayez ou consultez les logs.');
        }
      });
    }
    ```

    Step 2 — Update template (remotion-templates.component.html):
    Add at the top of the page header:
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
    On each template card, add a "Dupliquer" action button:
    ```html
    <button class="card-actions__btn"
            [disabled]="duplicating() === tpl.id"
            (click)="onDuplicate(tpl, $event)">
      {{ duplicating() === tpl.id ? 'Duplication…' : 'Dupliquer' }}
    </button>
    ```

    Commit: `feat(template-studio-v3): duplicate button + new template CTA on list (DUP-01)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && npm run test:smoke:smart 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "onDuplicate\|duplicateTemplate" central-dashboard/.../remotion-templates.component.ts` returns 2+
    - `grep -n "from: 'duplicate'\|from=duplicate" central-dashboard/.../remotion-templates.component.ts` returns 1 (queryParam override)
    - `grep -n "Dupliquer\|Nouveau template" central-dashboard/.../remotion-templates.component.html` returns ≥2
    - Build succeeds; smoke green
    - Manual end-to-end: click Dupliquer on existing template → wizard opens at Step 3 with all fields populated → all 6 child tables verified clone via `psql` count query
  </acceptance_criteria>
  <done>Duplicate UX complete; new template CTA visible; full Phase 1 acceptance achievable end-to-end.</done>
</task>

</tasks>

<verification>
- `cd central-dashboard && npx ng build` succeeds
- Run all 3 v3 smoke tests + global smoke: `npm run test:smoke` → all green
- Manual CU2 from SPEC: duplicate "BUT Simple" → opens at step 3 → verify clone has independent layer ids but identical video_url, independent text_fields with new layer_id refs
- DB sanity: `SELECT COUNT(*) FROM template_layers WHERE template_id = '{newId}'` matches source count
</verification>

<success_criteria>

- WIZARD-01: All 4 steps usable end-to-end from /new (create) and /new/:id (resume)
- DUP-01: Duplicate button works; clone opens at Step 3
- All Phase 1 success criteria from ROADMAP achieved:
  1. Browse/upload/delete WebM with alpha enforcement (plan 01 + 02)
  2. 4-step wizard with no-data-loss + back nav + drag-reorder (plans 03 + 04)
  3. Duplicate flow opens at step 3, single-transaction (plan 01 + 05)
  4. 3 smoke tests green (plan 01)
     </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-05-SUMMARY.md` documenting:
- Step 4 component API
- Duplicate flow trace (click → POST → navigate)
- Final Phase 1 acceptance test results (4 success criteria)
- Cumulative requirement coverage (13/13 IDs)
</output>
