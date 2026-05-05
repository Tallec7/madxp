---
phase: 01-fondations
plan: 03
type: execute
wave: 2
depends_on: ['01-fondations-01']
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-identity.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
  - central-dashboard/src/app/app.routes.ts
autonomous: true
requirements: [WIZARD-01, WIZARD-02, WIZARD-03]
must_haves:
  truths:
    - 'Single route /content/templates-remotion/new mounts a wizard shell with internal step state (signal<1|2|3|4>)'
    - 'Step 1 (Identité) creates the neopro_templates row immediately on Next; templateId is stored in WizardState'
    - 'Closing the browser after Step 1 does NOT lose data: re-entering the wizard with /new/:id resumes at the appropriate step'
    - 'Pressing Back preserves all field values (form state held in WizardState parent, not in step component local state)'
    - 'Vocabulary labels (étape titles, field labels) come from VOCABULARY_MAP / hardcoded SPEC strings — never DB jargon'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
      provides: 'Wizard shell — currentStep signal, WizardState holder, step navigation'
      exports: ['StudioV3WizardComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-identity.component.ts
      provides: 'Step 1 form — name, description, durationSec, fps, width, height; emits valid + values'
      exports: ['WizardStepIdentityComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
      provides: 'WizardState interface shared across steps'
      exports: ['WizardState']
  key_links:
    - from: WizardStepIdentityComponent
      to: parent StudioV3WizardComponent.onStep1Submit
      via: '@Output() submit emits IdentityFormValue → parent calls dataService.createTemplate'
      pattern: "@Output\\(\\) submit"
    - from: StudioV3WizardComponent
      to: RemotionTemplatesDataService.createTemplate
      via: 'POST /api/remotion-templates with { name, composition_id, ... }'
      pattern: "createTemplate\\("
---

## Plan 01 contracts consumed

This plan does not directly consume Plan 01 backend artifacts (those are wired by Plans 02/04/05). It does consume the frontend constant Plan 01 froze:

- `VOCABULARY_MAP` from `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — every visible étape title and field label MUST come from this map or from the SPEC's frozen French copy. Adding new labels requires updating the SPEC + smoke-template-studio-v3-vocabulary in the same commit.

<objective>
Build the wizard shell + Step 1 (Identité) — the entry point of the v3 creation flow.

Purpose: WIZARD-01 (4-step wizard exists), WIZARD-02 (Step 1 INSERTs immediately, no data loss on close), WIZARD-03 (back-navigation preserves data).

Output: Single Angular route, parent shell with signal-based step state, Step 1 sub-component with ReactiveForms + Joi-mirrored validators, INSERT on Next, resume-by-id support.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md (Pattern 1, Pattern 2)
@.planning/research/STACK.md (Section 1: ReactiveForms)
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@docs/specs/features/template-studio-v3.spec.md (Étape 1 — Identité, lines 64-69)
@docs/templates/mockups/template-studio-v3-mockup.html (.wizard, .stepper, .form-row sections)
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts

<interfaces>
EXISTING data service methods (already present in remotion-templates-data.service.ts):
  createTemplate(payload: {
    name: string;
    composition_id: string;            // snake_case — match existing method signature at line 269
    description?: string | null;
    props_schema?: TemplatePropDef[];
    default_props?: Record<string, unknown>;
  }): Observable<RemotionTemplate>
  getTemplateById(id: string): Observable<RemotionTemplate>     // alias of getStudioView for v3 — verify; if missing, use getTemplate from existing methods

NOTE: existing createTemplate signature does NOT take canvasWidth/canvasHeight/durationSeconds/fps as top-level fields (those live in default_props). The wizard's Step 1 form collects them, but the POST body shape must match the existing endpoint. Two approaches:
(a) Pack identity fields into default_props: { duration_seconds, fps, canvas_width, canvas_height }
(b) Extend the backend createTemplate Joi schema (templateCreateSchema) to accept top-level identity fields
For Phase 1 minimum, use approach (a) — no backend schema change required. The runtime reads default_props.canvas_width etc. anyway.

Existing precedent (DO NOT modify, just imitate the pattern):
central-dashboard/.../create-template-wizard.component.ts → existing v2 wizard with internal step state (template-driven forms)

WizardState contract (this plan defines it):
interface WizardState {
templateId: string | null;
identity: { name: string; description: string; durationSec: number; fps: number; width: number; height: number };
layers: TemplateLayer[]; // populated in plan 04
zones: { textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] }; // plan 04
options: TemplateOption[]; // plan 05
}
</interfaces>

<step_1_insert_columns>
On Step 1 "Suivant" click, POST /api/remotion-templates with body matching the EXISTING createTemplate Joi schema:
{
name: form.value.name, // required, 3-120 chars
composition_id: slugify(form.value.name) + '-' + Date.now().toString(36),
description: form.value.description || null,
default_props: {
duration_seconds: form.value.durationSec, // 5.9 default
fps: form.value.fps, // 30 default
canvas_width: form.value.width, // 1920 default
canvas_height: form.value.height, // 1080 default
}
}

The backend INSERTs neopro_templates with published=false; returns the new template id.
WizardState.templateId is set; URL is replaced (history.replaceState) to /content/templates-remotion/new/:id so a refresh resumes at step 2.
</step_1_insert_columns>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wizard shell + WizardState types + route + resume-by-id support</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/create-template-wizard.component.ts (precedent)
    - central-dashboard/src/app/app.routes.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (createTemplate signature line 269)
    - docs/templates/mockups/template-studio-v3-mockup.html (.wizard / .stepper structure)
  </read_first>
  <behavior>
    - Test 1: Navigating to /content/templates-remotion/new mounts StudioV3WizardComponent with currentStep === 1, templateId === null
    - Test 2: Navigating to /content/templates-remotion/new/:id calls dataService.getStudioView(id) (or getTemplate fallback if v1), populates WizardState, sets currentStep to first incomplete step (Step 2 if identity exists)
    - Test 3: prevStep() decrements currentStep but never below 1; nextStep() increments but never above 4
    - Test 4: Stepper UI in left sidebar shows 4 steps with active/done classes per mockup
    - Test 5: Right pane uses [hidden] (NOT *ngIf) to switch between step sub-components — Step 1 stays mounted when navigating forward, preserving form state
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.scss (NEW)
    - central-dashboard/src/app/app.routes.ts
  </files>
  <action>
    Step 1 — Create wizard-state.types.ts:
    ```ts
    import type { TemplateLayer, TemplateTextField, TemplateImageSlot, TemplateOption } from '../remotion-templates.types';

    export interface IdentityFormValue {
      name: string;
      description: string;
      durationSec: number;
      fps: number;
      width: number;
      height: number;
    }

    export interface WizardState {
      templateId: string | null;
      identity: IdentityFormValue;
      layers: TemplateLayer[];
      zones: { textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] };
      options: TemplateOption[];
    }

    export const DEFAULT_WIZARD_STATE: WizardState = {
      templateId: null,
      identity: { name: '', description: '', durationSec: 5.9, fps: 30, width: 1920, height: 1080 },
      layers: [],
      zones: { textFields: [], imageSlots: [] },
      options: [],
    };

    export type WizardStep = 1 | 2 | 3 | 4;

    export const STEP_LABELS: Record<WizardStep, { title: string; subtitle: string }> = {
      1: { title: 'Identité', subtitle: 'Nom, durée, format' },
      2: { title: 'Fonds animés', subtitle: 'Empilez vos calques vidéo' },
      3: { title: 'Zones modifiables', subtitle: 'Texte, image, animations' },
      4: { title: 'Options club', subtitle: 'Choix proposés à l\'utilisateur' },
    };
    ```

    Step 2 — Create studio-v3-wizard.component.ts:
    ```ts
    @Component({
      selector: 'app-studio-v3-wizard',
      standalone: true,
      imports: [CommonModule, WizardStepIdentityComponent /* , WizardStepBackgroundsComponent (plan 04) */],
      templateUrl: './studio-v3-wizard.component.html',
      styleUrl: './studio-v3-wizard.component.scss',
    })
    export class StudioV3WizardComponent implements OnInit {
      private route = inject(ActivatedRoute);
      private router = inject(Router);
      private dataService = inject(RemotionTemplatesDataService);
      private location = inject(Location);

      currentStep = signal<WizardStep>(1);
      state = signal<WizardState>({ ...DEFAULT_WIZARD_STATE });
      readonly stepLabels = STEP_LABELS;
      saving = signal<boolean>(false);

      ngOnInit() {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) this.resumeFromId(id);
      }

      private resumeFromId(id: string) {
        // getStudioView returns 404 for v1 templates — for Phase 1, only v2/v3 templates are resumable
        this.dataService.getStudioView(id).subscribe(view => {
          const tpl = view.template;
          const dp = (tpl.default_props ?? {}) as Record<string, number>;
          this.state.update(s => ({
            ...s,
            templateId: tpl.id,
            identity: {
              name: tpl.name,
              description: tpl.description ?? '',
              durationSec: Number(dp['duration_seconds'] ?? 5.9),
              fps: Number(dp['fps'] ?? 30),
              width: Number(dp['canvas_width'] ?? 1920),
              height: Number(dp['canvas_height'] ?? 1080),
            },
            layers: view.layers ?? [],
            zones: { textFields: view.textFields ?? [], imageSlots: view.imageSlots ?? [] },
          }));
          this.currentStep.set(this.computeResumeStep(view));
        });
      }

      private computeResumeStep(view: { layers?: unknown[]; textFields?: unknown[]; imageSlots?: unknown[] }): WizardStep {
        // Plan 05 will refine to also consider options + ?from=duplicate query param
        if (!view.layers || view.layers.length === 0) return 2;
        const zoneCount = (view.textFields?.length ?? 0) + (view.imageSlots?.length ?? 0);
        if (zoneCount === 0) return 3;
        return 4;
      }

      onStep1Submit(value: IdentityFormValue) {
        this.saving.set(true);
        this.state.update(s => ({ ...s, identity: value }));

        if (this.state().templateId) {
          // Already created — PATCH instead (plan 05 will refine)
          this.saving.set(false);
          this.currentStep.set(2);
          return;
        }

        const composition_id = this.slugify(value.name) + '-' + Date.now().toString(36);
        this.dataService.createTemplate({
          name: value.name,
          composition_id,
          description: value.description || null,
          default_props: {
            duration_seconds: value.durationSec,
            fps: value.fps,
            canvas_width: value.width,
            canvas_height: value.height,
          },
        }).subscribe({
          next: tpl => {
            this.state.update(s => ({ ...s, templateId: tpl.id }));
            // Replace URL so refresh resumes
            this.location.replaceState(`/content/templates-remotion/new/${tpl.id}`);
            this.saving.set(false);
            this.currentStep.set(2);
          },
          error: () => { this.saving.set(false); }
        });
      }

      goToStep(s: WizardStep) {
        // Allow back-nav unconditionally; forward-nav requires templateId at minimum
        if (s > this.currentStep() && !this.state().templateId) return;
        this.currentStep.set(s);
      }

      prevStep() { this.currentStep.update(s => (s > 1 ? (s - 1) as WizardStep : s)); }

      private slugify(s: string): string {
        return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      }
    }
    ```

    Step 3 — Template (studio-v3-wizard.component.html) — match mockup .wizard 280px+1fr grid:
    ```html
    <div class="v3w">
      <aside class="v3w__stepper">
        <div class="v3w__step"
             *ngFor="let s of [1,2,3,4]"
             [class.v3w__step--active]="currentStep() === s"
             [class.v3w__step--done]="currentStep() > s"
             (click)="goToStep(s)">
          <div class="v3w__step-num">{{ s }}</div>
          <div class="v3w__step-content">
            <h4>{{ stepLabels[s].title }}</h4>
            <p>{{ stepLabels[s].subtitle }}</p>
          </div>
        </div>
      </aside>

      <section class="v3w__pane">
        <app-wizard-step-identity
          [hidden]="currentStep() !== 1"
          [initialValue]="state().identity"
          [saving]="saving()"
          (submit)="onStep1Submit($event)"
        ></app-wizard-step-identity>

        <!-- Step 2-4 placeholders, wired by plan 04 + 05 -->
        <div [hidden]="currentStep() !== 2" class="v3w__placeholder">Étape 2 — Fonds animés (plan 04)</div>
        <div [hidden]="currentStep() !== 3" class="v3w__placeholder">Étape 3 — Zones (plan 04)</div>
        <div [hidden]="currentStep() !== 4" class="v3w__placeholder">Étape 4 — Options (plan 05)</div>
      </section>
    </div>
    ```

    SCSS — replicate mockup .wizard / .stepper / .step / .step-num / .step-content tokens. Use [hidden] on step containers (CRITICAL — Pitfall P2).

    Step 4 — Add route in app.routes.ts (TWO entries, sharing the component):
    ```ts
    { path: 'content/templates-remotion/new',
      loadComponent: () => import('./features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component').then(m => m.StudioV3WizardComponent) },
    { path: 'content/templates-remotion/new/:id',
      loadComponent: () => import('./features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component').then(m => m.StudioV3WizardComponent) },
    ```

    Commit: `feat(template-studio-v3): wizard shell + step state machine + resume route (WIZARD-01..03)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "currentStep = signal<" {wizard.component.ts}` returns 1
    - `grep -n "\\[hidden\\]" {wizard.component.html}` returns ≥3 (one per step container)
    - `grep -n "templates-remotion/new" central-dashboard/src/app/app.routes.ts` returns 2 matches (with and without :id)
    - `grep -n "location.replaceState" {wizard.component.ts}` returns 1
    - `grep -n "composition_id" {wizard.component.ts}` returns 1 (matches existing dataService.createTemplate signature)
    - Build succeeds
  </acceptance_criteria>
  <done>Wizard route mounts; stepper sidebar visible; placeholder panes for steps 2-4; ready to plug Step 1.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WizardStepIdentityComponent (ReactiveForms, validators, emits IdentityFormValue)</name>
  <read_first>
    - central-dashboard/src/app/features/auth/login/login.component.ts (ReactiveForms precedent)
    - docs/specs/features/template-studio-v3.spec.md (Étape 1, lines 64-69)
    - docs/templates/mockups/template-studio-v3-mockup.html (form-row, row-2 sections)
  </read_first>
  <behavior>
    - Test 1: Form has 6 controls: name (required, 3-120), description (optional, 0-500), durationSec (required, min 0.5, max 60), fps (required, integer 24-60), width (required, integer 320-3840), height (required, integer 240-2160)
    - Test 2: "Suivant" button is disabled when form.invalid OR @Input() saving is true
    - Test 3: On Suivant click, emits (submit) with the IdentityFormValue
    - Test 4: When @Input() initialValue changes (resume case), form patches values without losing dirty user edits made after
    - Test 5: Per-field error messages visible (e.g., "Le nom doit faire entre 3 et 120 caractères")
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-identity.component.ts
  </files>
  <action>
    Build standalone component with ReactiveForms (inline template + style for brevity, or split if >150 lines):

    ```ts
    @Component({
      selector: 'app-wizard-step-identity',
      standalone: true,
      imports: [CommonModule, ReactiveFormsModule],
      template: `
        <form class="v3i" [formGroup]="form" (ngSubmit)="onSubmit()">
          <h2>Étape 1 — Identité</h2>
          <p class="v3i__lead">Donnez un nom à votre template et définissez son format.</p>

          <div class="v3i__row">
            <label>Nom du template</label>
            <input type="text" formControlName="name" placeholder="Ex : Joueur Simple — Image" />
            <small class="v3i__err" *ngIf="form.controls.name.touched && form.controls.name.invalid">
              Le nom doit faire entre 3 et 120 caractères
            </small>
          </div>

          <div class="v3i__row">
            <label>Description (optionnel)</label>
            <textarea formControlName="description" rows="2" placeholder="À quoi sert ce template ?"></textarea>
          </div>

          <div class="v3i__row v3i__row--3">
            <div>
              <label>Durée (secondes)</label>
              <input type="number" formControlName="durationSec" step="0.1" min="0.5" max="60" />
            </div>
            <div>
              <label>FPS</label>
              <input type="number" formControlName="fps" min="24" max="60" />
            </div>
            <div>
              <label>Format</label>
              <select (change)="applyFormatPreset($event)">
                <option value="1920x1080">1920×1080 (16:9 HD)</option>
                <option value="1080x1920">1080×1920 (9:16 vertical)</option>
                <option value="1080x1080">1080×1080 (carré)</option>
              </select>
            </div>
          </div>

          <div class="v3i__actions">
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving">
              {{ saving ? 'Création…' : 'Suivant →' }}
            </button>
          </div>
        </form>
      `,
      styles: [`
        .v3i { max-width: 640px; }
        .v3i__lead { color: var(--muted); margin-bottom: 24px; }
        .v3i__row { margin-bottom: 20px; }
        .v3i__row--3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .v3i__row label { display: block; font-size: 13px; margin-bottom: 6px; font-weight: 500; }
        .v3i__row input, .v3i__row textarea, .v3i__row select { width: 100%; padding: 9px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
        .v3i__err { color: var(--err, #f87171); font-size: 12px; margin-top: 4px; display: block; }
        .v3i__actions { margin-top: 32px; display: flex; justify-content: flex-end; }
      `],
    })
    export class WizardStepIdentityComponent implements OnChanges {
      private fb = inject(FormBuilder);

      @Input() initialValue: IdentityFormValue = DEFAULT_WIZARD_STATE.identity;
      @Input() saving = false;
      @Output() submit = new EventEmitter<IdentityFormValue>();

      form = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
        description: ['', [Validators.maxLength(500)]],
        durationSec: [5.9, [Validators.required, Validators.min(0.5), Validators.max(60)]],
        fps: [30, [Validators.required, Validators.min(24), Validators.max(60)]],
        width: [1920, [Validators.required, Validators.min(320), Validators.max(3840)]],
        height: [1080, [Validators.required, Validators.min(240), Validators.max(2160)]],
      });

      ngOnChanges(changes: SimpleChanges) {
        if (changes['initialValue'] && this.initialValue && !this.form.dirty) {
          this.form.patchValue(this.initialValue);
        }
      }

      applyFormatPreset(ev: Event) {
        const [w, h] = (ev.target as HTMLSelectElement).value.split('x').map(Number);
        this.form.patchValue({ width: w, height: h });
      }

      onSubmit() {
        if (this.form.invalid) return;
        this.submit.emit(this.form.getRawValue() as IdentityFormValue);
      }
    }
    ```

    Commit: `feat(template-studio-v3): step 1 identity form with reactive validators (WIZARD-02)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - File wizard-step-identity.component.ts exists
    - `grep -n "ReactiveFormsModule\|FormBuilder\|Validators" {component.ts}` returns 3+
    - `grep -n "@Output() submit" {component.ts}` returns 1
    - `grep -n "@Input() initialValue\|@Input() saving" {component.ts}` returns 2
    - Build succeeds
    - Manual: navigate to /content/templates-remotion/new → form renders, Submit disabled when name empty, Submit triggers POST and URL becomes /new/:id
  </acceptance_criteria>
  <done>Step 1 fully functional; INSERT happens on Next; refresh on /new/:id resumes at step 2 placeholder.</done>
</task>

</tasks>

<verification>
- `cd central-dashboard && npx ng build` succeeds
- Manual: full WIZARD-02 + WIZARD-03 verification:
  1. Open /content/templates-remotion/new → fill name "Test1" + duration 5.9 → click Suivant
  2. URL becomes /new/{uuid}; current step is 2 (placeholder visible)
  3. Click step 1 in stepper → form still shows "Test1" + 5.9 (back nav preserves data)
  4. Refresh browser at /new/{uuid} → resumes at step 2; clicking step 1 shows the saved values
- `npm run test:smoke:smart` → no regression (especially smoke-template-studio-v3-vocabulary stays green)
</verification>

<success_criteria>

- WIZARD-01: 4-step wizard scaffold renders
- WIZARD-02: Step 1 INSERT happens immediately; URL replaceState supports resume
- WIZARD-03: Back navigation preserves form values
- [hidden] used on step containers (P2 prevention)
- createTemplate payload matches existing snake_case signature (composition_id, default_props.{duration_seconds,fps,canvas_width,canvas_height})
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-03-SUMMARY.md` documenting:
- Component tree (shell + step 1)
- WizardState contract for plans 04 + 05
- Manual UAT results for resume scenarios
</output>
