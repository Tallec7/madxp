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
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
autonomous: true
requirements: [WIZARD-04, WIZARD-05]
must_haves:
  truths:
    - 'Step 2 renders an ordered list of layers; super_admin can drag-reorder via @angular/cdk/drag-drop and z_index is updated server-side in one call'
    - "Step 2 'Ajouter un fond' opens AssetManagerModalComponent (modal context); on selection, POST creates a template_layers row with the asset URL"
    - 'Step 3 lists zones (text + image) for the active layer; admin can add a zone, set label/font/size/color/alignment/maxChars/visibleIf'
    - "Each zone created in Step 3 has a non-null layer_id (Joi-enforced server-side; UI disables 'Ajouter une zone' until ≥1 layer exists per Pitfall P1)"
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts
      provides: 'Step 2 — drag-drop layer stack + asset-manager-modal trigger'
      exports: ['WizardStepBackgroundsComponent']
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
      provides: 'Step 3 — zone list + per-zone form (text or image)'
      exports: ['WizardStepZonesComponent']
  key_links:
    - from: WizardStepBackgroundsComponent
      to: AssetManagerModalComponent (context='modal')
      via: '[hidden]-toggled child component, (assetSelected) wired to onAssetPicked'
      pattern: 'app-asset-manager-modal'
    - from: WizardStepBackgroundsComponent
      to: dataService.reorderLayers
      via: 'POST /api/remotion-templates/:id/layers/reorder with [layerId...] in new order'
      pattern: 'reorderLayers'
    - from: WizardStepZonesComponent
      to: dataService.createTextField / createImageSlot
      via: 'POST with layer_id (REQUIRED, non-null per ADR-086)'
      pattern: 'createTextField|createImageSlot'
---

<objective>
Build Wizard Step 2 (Fonds animés) and Step 3 (Zones modifiables) — the heart of the structural design phase.

Purpose: WIZARD-04 (drag-reorder layers), WIZARD-05 (configure zone properties), with Pitfall P1 (orphan zones) hard-gated.

Output: Two new step components wired into the wizard shell; layer create/reorder via Asset Manager modal; zone create with full per-type form (text vs image).
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/research/STACK.md (Section 2: CDK DragDrop)
@.planning/research/PITFALLS.md (Pitfall 1, Pitfall 8)
@docs/specs/features/template-studio-v3.spec.md (Étapes 2 + 3, lines 70-83)
@docs/templates/mockups/template-studio-v3-mockup.html (.layers-stack, .zone-item sections)
@central-dashboard/src/app/features/safe/safe-portfolio.component.ts (CDK DragDrop precedent)
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts

<interfaces>
Existing data service methods (already present):
  createLayer, deleteLayer, updateLayer  // template-studio.repository pattern
  createTextField, deleteTextField, updateTextField
  createImageSlot, deleteImageSlot, updateImageSlot

To ADD in this plan:
reorderLayers(templateId: string, orderedLayerIds: string[]): Observable<TemplateLayer[]>
→ POST /api/remotion-templates/:id/layers/reorder { orderedLayerIds }
→ backend updates z_index = index + 1 in a single transaction

WizardState extension (read by step 2 + 3, written via parent emit):
state().layers: TemplateLayer[] // populated by step 2
state().zones.textFields: TemplateTextField[] // populated by step 3
state().zones.imageSlots: TemplateImageSlot[] // populated by step 3
</interfaces>

<spec_zone_form_fields>
Per docs/specs/features/template-studio-v3.spec.md lines 76-82:
TEXT zone form: - Libellé (label, free text) - Police (font_family, dropdown from FONT_FAMILIES — vocabulary "Police") - Taille (font_size, number 12-200) - Couleur (color, color picker) - Alignement (text_align: left/center/right) - Limite caractères (max_chars, number 1-200) - Quand cette zone apparaît (visible_if dropdown — Phase 2 will populate from template_options; here a free text input is acceptable)
IMAGE zone form: - Libellé (label) - Zone sûre & cadrage (named preset: "Photo en haut, déborde en bas" / "Logo centré dans hexagone" — maps to anchor + fit_mode) - Quand cette zone apparaît (visible_if)
ALL zones MUST have layer_id (non-null, dropdown of layers in WizardState; default = currently-selected layer)
</spec_zone_form_fields>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WizardStepBackgroundsComponent (drag-reorder + AssetManager modal trigger)</name>
  <read_first>
    - central-dashboard/src/app/features/safe/safe-portfolio.component.ts (CdkDragDrop + moveItemInArray pattern)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (createLayer, deleteLayer signatures)
    - docs/templates/mockups/template-studio-v3-mockup.html (.layers-stack, .layer-card)
  </read_first>
  <behavior>
    - Test 1: Layer cards render in z_index order (1 = arrière); each shows thumbnail (video poster), name, duration, dimensions, alpha pill
    - Test 2: Drag a layer card to a new position → moveItemInArray updates local order → calls dataService.reorderLayers(templateId, [ids]) → response updates state().layers
    - Test 3: "+ Ajouter un fond animé" button toggles assetManagerOpen signal; AssetManagerModalComponent renders with [context]="'modal'" and (assetSelected) wired to onAssetPicked
    - Test 4: onAssetPicked({url}) calls dataService.createLayer({ templateId, name, videoUrl: url, zIndex: layers.length + 1 }); on success, layer is appended to state and modal closes
    - Test 5: Delete button on a layer card calls dataService.deleteLayer; on 409 (in-use), shows the same French message as the asset manager
    - Test 6: "Suivant" button to step 3 is disabled until layers.length >= 1 (Pitfall P1 gate)
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-backgrounds.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (add reorderLayers)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 2)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace placeholder for step 2)
  </files>
  <action>
    Step 1 — Add reorderLayers to data service:
    ```ts
    reorderLayers(templateId: string, orderedLayerIds: string[]): Observable<TemplateLayer[]> {
      return this.api.post<TemplateLayer[]>(
        `/api/remotion-templates/${encodeURIComponent(templateId)}/layers/reorder`,
        { orderedLayerIds }
      );
    }
    ```

    Step 2 — Build wizard-step-backgrounds.component.ts:
    ```ts
    @Component({
      selector: 'app-wizard-step-backgrounds',
      standalone: true,
      imports: [CommonModule, DragDropModule, AssetManagerModalComponent],
      template: `
        <div class="v3b">
          <h2>Étape 2 — Fonds animés</h2>
          <p class="v3b__lead">Empilez vos calques vidéo. Le premier de la liste est en arrière, le dernier au-dessus.</p>

          <div class="v3b__stack" cdkDropList (cdkDropListDropped)="onDrop($event)">
            <article class="v3b__card" *ngFor="let l of layers(); let i = index" cdkDrag>
              <div class="v3b__handle" cdkDragHandle>⋮⋮</div>
              <div class="v3b__thumb">
                <video [src]="l.videoUrl" muted playsinline preload="metadata"></video>
              </div>
              <div class="v3b__info">
                <div class="v3b__name">{{ l.name }}</div>
                <div class="v3b__meta">
                  Position {{ i + 1 }} · {{ (l.durationMs / 1000).toFixed(1) }}s
                </div>
              </div>
              <button class="v3b__del" (click)="onDelete(l)">Supprimer</button>
            </article>

            <button class="v3b__add" (click)="openAssetManager()">+ Ajouter un fond animé</button>
          </div>

          <div class="v3b__error" *ngIf="error()">{{ error() }}</div>

          <div class="v3b__nav">
            <button class="btn btn-ghost" (click)="prev.emit()">← Précédent</button>
            <button class="btn btn-primary" [disabled]="layers().length < 1" (click)="next.emit()">
              Suivant → ({{ layers().length }} fond{{ layers().length > 1 ? 's' : '' }})
            </button>
          </div>

          <app-asset-manager-modal
            *ngIf="assetManagerOpen()"
            [context]="'modal'"
            [respectAlphaRequired]="false"
            (assetSelected)="onAssetPicked($event)"
            (dismiss)="assetManagerOpen.set(false)"
          ></app-asset-manager-modal>
        </div>
      `,
      styles: [` /* mockup-aligned tokens, ~80 lines max */ `],
    })
    export class WizardStepBackgroundsComponent {
      private dataService = inject(RemotionTemplatesDataService);

      @Input() templateId!: string;
      @Input({ required: true }) layers = signal<TemplateLayer[]>([]);
      @Output() layersChange = new EventEmitter<TemplateLayer[]>();
      @Output() prev = new EventEmitter<void>();
      @Output() next = new EventEmitter<void>();

      assetManagerOpen = signal(false);
      error = signal<string | null>(null);

      openAssetManager() { this.assetManagerOpen.set(true); }

      onAssetPicked(ev: { url: string }) {
        this.assetManagerOpen.set(false);
        const next = this.layers().length + 1;
        const name = `Fond ${next}`;
        this.dataService.createLayer({
          templateId: this.templateId,
          name, videoUrl: ev.url, zIndex: next,
        }).subscribe({
          next: layer => {
            const updated = [...this.layers(), layer];
            this.layers.set(updated);
            this.layersChange.emit(updated);
          },
          error: () => this.error.set("Création du fond échouée"),
        });
      }

      onDrop(ev: CdkDragDrop<TemplateLayer[]>) {
        const reordered = [...this.layers()];
        moveItemInArray(reordered, ev.previousIndex, ev.currentIndex);
        this.layers.set(reordered);
        this.dataService.reorderLayers(this.templateId, reordered.map(l => l.id)).subscribe({
          next: server => { this.layers.set(server); this.layersChange.emit(server); },
          error: () => this.error.set("Réordonnement échoué — rafraîchir la page"),
        });
      }

      onDelete(l: TemplateLayer) {
        if (!confirm(`Supprimer ${l.name} ?`)) return;
        this.dataService.deleteLayer(this.templateId, l.id).subscribe({
          next: () => {
            const updated = this.layers().filter(x => x.id !== l.id);
            this.layers.set(updated);
            this.layersChange.emit(updated);
          },
          error: (err) => {
            const cnt = err?.error?.detail?.usedByPublishedCount ?? 0;
            this.error.set(`Ce fond est utilisé par ${cnt} templates publiés — supprimez d'abord les clones`);
          }
        });
      }
    }
    ```

    Step 3 — Wire into shell (studio-v3-wizard.component.ts + .html):
    Add import for WizardStepBackgroundsComponent. Replace the step 2 placeholder div with:
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
    Add `layersSignal = computed(() => signal(this.state().layers))` or pass `signal(state().layers)`. Add `onLayersChange(layers: TemplateLayer[])` to update `state.update(s => ({ ...s, layers }))`.

    Commit: `feat(template-studio-v3): step 2 backgrounds with drag-reorder + asset modal (WIZARD-04)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - File wizard-step-backgrounds.component.ts exists
    - `grep -n "DragDropModule\|cdkDropList\|moveItemInArray" {component.ts}` returns 3+
    - `grep -n "AssetManagerModalComponent" {component.ts}` returns ≥2
    - `grep -n "reorderLayers" central-dashboard/.../remotion-templates-data.service.ts` returns 1
    - `grep -n "layers().length < 1" {component.ts}` returns 1 (P1 gate)
    - Manual: navigate to /content/templates-remotion/new/{id} step 2 → click + Ajouter, modal opens, pick asset → layer card appears → drag handle reorders cards → backend persists order
  </acceptance_criteria>
  <done>Step 2 fully functional; ≥1 layer required to advance; asset manager round-trip green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WizardStepZonesComponent (text + image zone forms with mandatory layer_id)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts (existing zone form precedent — DO NOT IMPORT, just reference)
    - docs/specs/features/template-studio-v3.spec.md (lines 76-83)
    - .planning/research/PITFALLS.md (Pitfall 1)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
  </read_first>
  <behavior>
    - Test 1: Component shows 2 sub-tabs: "Zones texte" and "Zones image"; each renders a list of zones
    - Test 2: "+ Ajouter une zone texte" button is DISABLED if layers().length === 0 (P1 gate); enabled otherwise
    - Test 3: On click, form expands inline with: layer_id dropdown (defaults to first layer), libellé, police (FONT_FAMILIES), taille, couleur, alignement, limite caractères, condition d'apparition
    - Test 4: Submit calls dataService.createTextField({ templateId, layerId, label, fontFamily, fontSize, color, textAlign, maxChars, visibleIf }) — layer_id is REQUIRED in the payload (UI validates !!layerId before submit)
    - Test 5: Image zone form: layer_id, libellé, "Zone sûre & cadrage" preset dropdown (4-6 named presets mapping to anchor + fit_mode pairs), condition d'apparition
    - Test 6: Vocabulary check — all visible labels come from VOCABULARY_MAP keys ("Fond animé parent" not "Layer", "Limite caractères" not "max_chars")
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (mount step 3)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (replace step 3 placeholder)
  </files>
  <action>
    Build wizard-step-zones.component.ts as a standalone component with ReactiveForms:

    ```ts
    const FONT_FAMILIES = ['Anton', 'Bebas Neue', 'Montserrat', 'Roboto', 'Inter', 'Oswald'] as const;

    const SAFE_ZONE_PRESETS = [
      { key: 'fill-width-anchor-top',    label: 'Photo en haut, déborde en bas' },
      { key: 'fit-contain-center',       label: 'Logo centré (contain)' },
      { key: 'fit-cover-center',         label: 'Image centrée (cover plein cadre)' },
      { key: 'fit-contain-anchor-bottom',label: 'Logo bas centré' },
    ];

    @Component({
      selector: 'app-wizard-step-zones',
      standalone: true,
      imports: [CommonModule, ReactiveFormsModule],
      template: `
        <div class="v3z">
          <h2>Étape 3 — Zones modifiables</h2>
          <p class="v3z__lead">Définissez les zones de texte et d'image que l'utilisateur final pourra remplir.</p>

          <div class="v3z__tabs">
            <button [class.v3z__tab--active]="tab() === 'text'" (click)="tab.set('text')">Zones texte ({{ textFields().length }})</button>
            <button [class.v3z__tab--active]="tab() === 'image'" (click)="tab.set('image')">Zones image ({{ imageSlots().length }})</button>
          </div>

          <ng-container *ngIf="tab() === 'text'">
            <div class="v3z__list">
              <article class="v3z__zone" *ngFor="let z of textFields()">
                <div class="v3z__zone-name">{{ z.label }}</div>
                <div class="v3z__zone-meta">{{ z.fontFamily }} · {{ z.fontSize }}px · max {{ z.maxChars }} car.</div>
                <button (click)="onDeleteText(z)">Supprimer</button>
              </article>
            </div>

            <button class="v3z__add" [disabled]="layers().length === 0" (click)="openTextForm()">
              + Ajouter une zone texte
            </button>
            <small class="v3z__hint" *ngIf="layers().length === 0">
              Ajoutez au moins 1 fond animé à l'étape 2 avant de créer des zones.
            </small>

            <form *ngIf="textFormOpen()" [formGroup]="textForm" (ngSubmit)="submitText()" class="v3z__form">
              <label>Fond animé parent</label>
              <select formControlName="layerId">
                <option [ngValue]="null" disabled>— Choisir un fond —</option>
                <option *ngFor="let l of layers()" [ngValue]="l.id">{{ l.name }}</option>
              </select>

              <label>Libellé</label>
              <input formControlName="label" placeholder="Ex : Prénom du joueur" />

              <div class="v3z__row-3">
                <div>
                  <label>Police</label>
                  <select formControlName="fontFamily">
                    <option *ngFor="let f of fontFamilies" [value]="f">{{ f }}</option>
                  </select>
                </div>
                <div>
                  <label>Taille (px)</label>
                  <input type="number" formControlName="fontSize" min="12" max="200" />
                </div>
                <div>
                  <label>Couleur</label>
                  <input type="color" formControlName="color" />
                </div>
              </div>

              <div class="v3z__row-2">
                <div>
                  <label>Alignement</label>
                  <select formControlName="textAlign">
                    <option value="left">Gauche</option>
                    <option value="center">Centre</option>
                    <option value="right">Droite</option>
                  </select>
                </div>
                <div>
                  <label>Limite caractères</label>
                  <input type="number" formControlName="maxChars" min="1" max="200" />
                </div>
              </div>

              <label>Quand cette zone apparaît (optionnel)</label>
              <input formControlName="visibleIf" placeholder='Ex: typeIntro == "logo"' />
              <small class="v3z__hint">Format : option == "valeur" — sera enrichi en Phase 2 avec dropdown auto.</small>

              <div class="v3z__form-actions">
                <button type="button" (click)="textFormOpen.set(false)">Annuler</button>
                <button type="submit" class="btn btn-primary" [disabled]="textForm.invalid">Créer la zone</button>
              </div>
            </form>
          </ng-container>

          <ng-container *ngIf="tab() === 'image'">
            <!-- Mirror structure: list + Ajouter + form with layerId, label, safeZonePreset, visibleIf -->
          </ng-container>

          <div class="v3z__nav">
            <button class="btn btn-ghost" (click)="prev.emit()">← Précédent</button>
            <button class="btn btn-primary" (click)="next.emit()">Suivant →</button>
          </div>
        </div>
      `,
      styles: [` /* ~100 lines, mockup-aligned */ `],
    })
    export class WizardStepZonesComponent {
      private fb = inject(FormBuilder);
      private dataService = inject(RemotionTemplatesDataService);

      @Input() templateId!: string;
      @Input({ required: true }) layers = signal<TemplateLayer[]>([]);
      @Input({ required: true }) textFields = signal<TemplateTextField[]>([]);
      @Input({ required: true }) imageSlots = signal<TemplateImageSlot[]>([]);
      @Output() textFieldsChange = new EventEmitter<TemplateTextField[]>();
      @Output() imageSlotsChange = new EventEmitter<TemplateImageSlot[]>();
      @Output() prev = new EventEmitter<void>();
      @Output() next = new EventEmitter<void>();

      tab = signal<'text' | 'image'>('text');
      textFormOpen = signal(false);
      imageFormOpen = signal(false);
      readonly fontFamilies = FONT_FAMILIES;
      readonly safeZonePresets = SAFE_ZONE_PRESETS;

      textForm = this.fb.group({
        layerId: this.fb.control<string | null>(null, [Validators.required]),
        label: ['', [Validators.required, Validators.maxLength(80)]],
        fontFamily: ['Anton', [Validators.required]],
        fontSize: [56, [Validators.required, Validators.min(12), Validators.max(200)]],
        color: ['#FFFFFF', [Validators.required]],
        textAlign: ['center', [Validators.required]],
        maxChars: [40, [Validators.required, Validators.min(1), Validators.max(200)]],
        visibleIf: [''],
      });

      openTextForm() {
        this.textForm.patchValue({ layerId: this.layers()[0]?.id ?? null });
        this.textFormOpen.set(true);
      }

      submitText() {
        if (this.textForm.invalid) return;
        const v = this.textForm.getRawValue();
        if (!v.layerId) return;  // P1 gate (also enforced backend Joi)
        const slotKey = `text_${Date.now().toString(36)}`;
        this.dataService.createTextField({
          templateId: this.templateId,
          layerId: v.layerId,
          slotKey, label: v.label!,
          fontFamily: v.fontFamily!, fontSize: v.fontSize!,
          color: v.color!, textAlign: v.textAlign!, maxChars: v.maxChars!,
          visibleIf: v.visibleIf || null,
        }).subscribe(tf => {
          const updated = [...this.textFields(), tf];
          this.textFields.set(updated);
          this.textFieldsChange.emit(updated);
          this.textFormOpen.set(false);
          this.textForm.reset({ fontFamily: 'Anton', fontSize: 56, color: '#FFFFFF', textAlign: 'center', maxChars: 40 });
        });
      }

      onDeleteText(z: TemplateTextField) {
        if (!confirm(`Supprimer ${z.label} ?`)) return;
        this.dataService.deleteTextField(this.templateId, z.id).subscribe(() => {
          const updated = this.textFields().filter(x => x.id !== z.id);
          this.textFields.set(updated);
          this.textFieldsChange.emit(updated);
        });
      }

      // Image form: mirror submitText/openTextForm/onDelete using safeZonePresets → { anchor, fit_mode } map
    }
    ```

    Wire into wizard shell: replace step 3 placeholder div with `<app-wizard-step-zones [hidden]="currentStep() !== 3" [templateId]="state().templateId!" [layers]="..." [textFields]="..." [imageSlots]="..." (textFieldsChange)="..." (imageSlotsChange)="..." (prev)="goToStep(2)" (next)="goToStep(4)"></app-wizard-step-zones>`.

    NOTE: For the image-form's safe-zone preset → anchor/fit_mode mapping, define a helper:
    ```ts
    const PRESET_TO_DB: Record<string, { anchor: string; fitMode: string }> = {
      'fill-width-anchor-top':    { anchor: 'top',    fitMode: 'fill-width' },
      'fit-contain-center':       { anchor: 'center', fitMode: 'contain' },
      'fit-cover-center':         { anchor: 'center', fitMode: 'cover' },
      'fit-contain-anchor-bottom':{ anchor: 'bottom', fitMode: 'contain' },
    };
    ```
    Submit posts `{ anchor, fitMode }` to backend.

    Commit: `feat(template-studio-v3): step 3 zones with mandatory layer_id (WIZARD-05)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - File wizard-step-zones.component.ts exists
    - `grep -n "Validators.required" {component.ts}` returns ≥2 (layerId required, label required)
    - `grep -n "layers().length === 0\|layers().length < 1" {component.ts}` returns ≥1 (P1 gate)
    - `grep -n "'layer'\|'slot'\|'pix_fmt'" {component.ts} {component.html if separate}` returns 0 raw user-facing strings (only in TS variable names / type imports)
    - Build succeeds
    - Manual: with 0 layers, "+ Ajouter une zone texte" is disabled with hint message; with ≥1 layer, form opens with parent dropdown pre-selected
  </acceptance_criteria>
  <done>Step 3 functional; zones cannot be created without a layer; vocabulary 100% French.</done>
</task>

</tasks>

<verification>
- `cd central-dashboard && npx ng build` succeeds
- Manual full flow: create template (step 1) → upload + add 2 layers, drag-reorder (step 2) → add 1 text zone + 1 image zone (step 3)
- Verify in DB: `template_layers` has correct z_index, `template_text_fields.layer_id` non-null
- `npm run test:smoke:smart` → no regression (especially smoke-template-studio-v3-vocabulary stays green)
</verification>

<success_criteria>

- WIZARD-04: drag-reorder works and persists z_index server-side
- WIZARD-05: zone form covers all 7 SPEC fields for text + 3 fields for image
- Pitfall P1 gate: zones cannot be created with null layer_id (UI + Joi)
- Vocabulary smoke test stays green
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-04-SUMMARY.md` documenting:
- Step 2 + 3 component APIs
- Safe-zone preset mapping table
- Manual UAT results for the full create-then-design flow
</output>
