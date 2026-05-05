---
phase: 01-fondations
plan: 02
type: execute
wave: 2
depends_on: ['01-fondations-01']
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/app.routes.ts
autonomous: true
requirements: [ASSET-01, ASSET-02, ASSET-03]
must_haves:
  truths:
    - 'Super_admin sees a grid of WebM assets with thumbnail, duration, dimensions, alpha flag, and used-by count'
    - 'Super_admin can upload a new WebM through the same component; alpha-rejected uploads display the French error message inline'
    - 'Same component works as a modal (called from wizard step 2) AND as a full page (route /content/templates-remotion/assets)'
    - 'Deletion attempt on an in-use asset shows the 409 message with template count'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
      provides: 'Standalone Angular component, dual-context (modal | page)'
      exports: ['AssetManagerModalComponent']
    - path: central-dashboard/src/app/app.routes.ts
      provides: 'New route content/templates-remotion/assets → lazy-loads AssetManagerModalComponent as page'
      contains: 'assets'
  key_links:
    - from: AssetManagerModalComponent
      to: RemotionTemplatesDataService.listAssets / uploadAsset / deleteAsset
      via: 'service method calls (no fetch)'
      pattern: "dataService\\.(list|upload|delete)Asset"
    - from: AssetManagerModalComponent
      to: VOCABULARY_MAP
      via: 'import from ../vocabulary.constants'
      pattern: 'VOCABULARY_MAP|ANIMATION_PRESET_LABELS'
---

<objective>
Build the Asset Manager UI as a single dual-context standalone Angular component (modal from wizard step 2 + full page at /content/templates-remotion/assets).

Purpose: ASSET-01 (browse), ASSET-02 (upload with alpha feedback), ASSET-03 (deletion blocked when in use) — all from the dashboard, no terminal.

Output: One standalone component, three data service methods, one new route entry.
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
@docs/specs/features/template-studio-v3.spec.md
@docs/templates/mockups/template-studio-v3-mockup.html
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts

<interfaces>
Existing data service file at central-dashboard/.../remotion-templates-data.service.ts:
  duplicateTemplate(id, name?): Observable<RemotionTemplate>  // line 279, ALREADY exists — used by plan 05
  // ADD: listAssets(): Observable<WebmAssetMetadata[]>
  // ADD: uploadAsset(file: File, opts: { respectAlpha?: boolean }): Observable<WebmAssetMetadata>
  // ADD: deleteAsset(assetId: string): Observable<void>

Backend response shape (from plan 01):
interface WebmAssetMetadata {
id: string;
url: string;
durationMs: number;
width: number;
height: number;
hasAlpha: boolean;
pixFmt: string;
uploadedAt: string;
usedByCount: number;
}

Backend endpoints (from plan 01):
GET /api/remotion-templates/assets → listAssets
POST /api/remotion-templates/upload → uploadAsset (multipart, body.respectAlpha)
DELETE /api/remotion-templates/assets/:id → deleteAsset (409 if usedByCount > 0)

Existing API service for HTTP calls:
central-dashboard/src/app/core/services/api.service.ts → use ApiService.get/post/delete
NEVER use fetch() directly (smoke-dashboard-guards enforced)
</interfaces>

<mockup_reference>
See docs/templates/mockups/template-studio-v3-mockup.html sections:

- Asset grid: .grid > .card with .thumb (16/9), .card-body (name + meta), .card-actions
- Upload card: .card-new with dashed border + "+ Uploader" prompt
- Modal backdrop pattern: .ctw\_\_backdrop from create-template-wizard.component.ts (existing precedent)
  </mockup_reference>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add data service methods + new route + lazy-load entry</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (entire file — match existing method style)
    - central-dashboard/src/app/app.routes.ts (find content/templates-remotion route block)
    - central-dashboard/src/app/core/services/api.service.ts (HTTP wrapper signatures)
  </read_first>
  <behavior>
    - Test 1: dataService.listAssets() returns an Observable<WebmAssetMetadata[]>
    - Test 2: dataService.uploadAsset(file, { respectAlpha: true }) sends multipart with respectAlpha=true and returns Observable<WebmAssetMetadata>
    - Test 3: dataService.deleteAsset(id) returns Observable<void>; 409 surfaces as HttpErrorResponse with body { error: 'asset_in_use', detail: { usedByPublishedCount: number } }
    - Test 4: Route '/content/templates-remotion/assets' lazy-loads AssetManagerModalComponent in page mode
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
    - central-dashboard/src/app/app.routes.ts
  </files>
  <action>
    Step 1 — Add interface to remotion-templates.types.ts:
    ```ts
    export interface WebmAssetMetadata {
      id: string;
      url: string;
      durationMs: number;
      width: number;
      height: number;
      hasAlpha: boolean;
      pixFmt: string;
      uploadedAt: string;
      usedByCount: number;
    }
    ```

    Step 2 — Add methods to RemotionTemplatesDataService (match existing pattern around `duplicateTemplate` at line 279):
    ```ts
    listAssets(): Observable<WebmAssetMetadata[]> {
      return this.api.get<WebmAssetMetadata[]>('/api/remotion-templates/assets');
    }

    uploadAsset(file: File, opts: { respectAlpha?: boolean } = {}): Observable<WebmAssetMetadata> {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('respectAlpha', String(opts.respectAlpha ?? false));
      return this.api.post<WebmAssetMetadata>('/api/remotion-templates/upload', fd);
    }

    deleteAsset(id: string): Observable<void> {
      return this.api.delete<void>(`/api/remotion-templates/assets/${encodeURIComponent(id)}`);
    }
    ```

    Step 3 — Add route in app.routes.ts under the existing `content/templates-remotion` block:
    ```ts
    {
      path: 'content/templates-remotion/assets',
      loadComponent: () =>
        import('./features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component')
          .then(m => m.AssetManagerModalComponent),
      data: { context: 'page' }
    }
    ```
    The component reads `route.data.context` to render with full-page chrome (no backdrop).

    Commit: `feat(template-studio-v3): add asset manager data service methods + route (ASSET-01..03)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -20 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "listAssets\|uploadAsset\|deleteAsset" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` returns 3+ matches
    - `grep -n "templates-remotion/assets" central-dashboard/src/app/app.routes.ts` returns 1 match
    - `grep -n "WebmAssetMetadata" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts` returns 1 match
    - Build succeeds (Angular `ng build` exits 0)
    - No `fetch(` token added (use ApiService)
  </acceptance_criteria>
  <done>Data service + route ready; component shell can be built next.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build AssetManagerModalComponent (dual-context modal | page) + grid + upload + delete</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/joueur-tools (an existing standalone component pattern in the same folder)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
    - docs/templates/mockups/template-studio-v3-mockup.html (asset grid section)
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (card SCSS pattern reference)
  </read_first>
  <behavior>
    - Test 1: Component renders a grid of cards (CSS grid auto-fill minmax 240px); each card shows thumbnail (poster from URL or fallback gradient), name (filename derived), duration "5.9s", dimensions "1920×1080", alpha pill ("avec alpha" green / "sans alpha" gray), used-by count ("Utilisé par 3 templates")
    - Test 2: "+ Uploader un fond" tile opens a hidden <input type="file" accept="video/webm">; on file select, upload progresses, on alpha-rejection error, an inline message renders the backend French message + detected pixFmt
    - Test 3: Delete button on a card triggers confirm; on 409 from backend, an inline message displays "Ce fond est utilisé par N templates publiés — supprimez d'abord les clones"
    - Test 4: When `data.context === 'modal'` (from wizard input), backdrop + dismiss button render; when `'page'`, no backdrop and component takes full container
    - Test 5: Component emits `(assetSelected)` with `{ url: string }` when a card is clicked AND context is 'modal'
  </behavior>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.scss
  </files>
  <action>
    Build a standalone component with the following exact public API:

    ```ts
    @Component({
      selector: 'app-asset-manager-modal',
      standalone: true,
      imports: [CommonModule],
      templateUrl: './asset-manager-modal.component.html',
      styleUrl: './asset-manager-modal.component.scss',
    })
    export class AssetManagerModalComponent implements OnInit {
      @Input() context: 'modal' | 'page' = 'modal';
      @Input() respectAlphaRequired = false;  // wizard step 2 sets this when slot has respect_alpha
      @Output() assetSelected = new EventEmitter<{ url: string }>();
      @Output() dismiss = new EventEmitter<void>();

      private dataService = inject(RemotionTemplatesDataService);
      private route = inject(ActivatedRoute);

      assets = signal<WebmAssetMetadata[]>([]);
      loading = signal<boolean>(false);
      uploadError = signal<string | null>(null);
      uploadDetail = signal<string | null>(null);   // detected pixFmt
      deleteError = signal<string | null>(null);

      ngOnInit() {
        // If route data says page mode, override context Input
        const ctx = this.route.snapshot.data?.['context'];
        if (ctx === 'page') this.context = 'page';
        this.loadAssets();
      }

      private loadAssets() {
        this.loading.set(true);
        this.dataService.listAssets().subscribe({
          next: (a) => { this.assets.set(a); this.loading.set(false); },
          error: () => { this.loading.set(false); }
        });
      }

      onFileSelected(ev: Event) {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.uploadError.set(null);
        this.uploadDetail.set(null);
        this.dataService.uploadAsset(file, { respectAlpha: this.respectAlphaRequired }).subscribe({
          next: (a) => { this.assets.update(list => [a, ...list]); },
          error: (err) => {
            const body = err?.error ?? {};
            this.uploadError.set(body.message ?? 'Upload échoué');
            this.uploadDetail.set(body.detail?.detectedPixFmt ?? null);
          }
        });
      }

      onDelete(asset: WebmAssetMetadata) {
        if (!confirm(`Supprimer ${asset.url.split('/').pop()} ?`)) return;
        this.deleteError.set(null);
        this.dataService.deleteAsset(asset.id).subscribe({
          next: () => { this.assets.update(list => list.filter(x => x.id !== asset.id)); },
          error: (err) => {
            const body = err?.error ?? {};
            const count = body.detail?.usedByPublishedCount ?? 0;
            this.deleteError.set(`Ce fond est utilisé par ${count} templates publiés — supprimez d'abord les clones`);
          }
        });
      }

      onSelect(asset: WebmAssetMetadata) {
        if (this.context === 'modal') this.assetSelected.emit({ url: asset.url });
      }

      onDismiss() { this.dismiss.emit(); }

      formatDuration(ms: number): string { return `${(ms / 1000).toFixed(1)}s`; }
      formatDimensions(a: WebmAssetMetadata): string { return `${a.width}×${a.height}`; }
    }
    ```

    Template (asset-manager-modal.component.html):
    ```html
    <div class="amm" [class.amm--modal]="context === 'modal'" [class.amm--page]="context === 'page'">
      <div class="amm__backdrop" *ngIf="context === 'modal'" (click)="onDismiss()"></div>
      <div class="amm__panel">
        <header class="amm__header">
          <h2>Bibliothèque de fonds animés</h2>
          <button *ngIf="context === 'modal'" class="amm__close" (click)="onDismiss()" aria-label="Fermer">×</button>
        </header>

        <div class="amm__error" *ngIf="uploadError()">
          {{ uploadError() }}
          <small *ngIf="uploadDetail()">Format détecté : {{ uploadDetail() }}</small>
        </div>
        <div class="amm__error" *ngIf="deleteError()">{{ deleteError() }}</div>

        <div class="amm__grid">
          <label class="amm__upload" data-testid="amm-upload-tile">
            <input type="file" accept="video/webm" hidden (change)="onFileSelected($event)" />
            <span>+ Uploader un fond</span>
          </label>

          <article class="amm__card" *ngFor="let a of assets()" (click)="onSelect(a)">
            <div class="amm__thumb">
              <video [src]="a.url" muted playsinline preload="metadata"></video>
            </div>
            <div class="amm__body">
              <div class="amm__name">{{ a.url.split('/').pop() }}</div>
              <div class="amm__meta">
                {{ formatDuration(a.durationMs) }} · {{ formatDimensions(a) }}
                <span class="amm__pill" [class.amm__pill--ok]="a.hasAlpha">
                  {{ a.hasAlpha ? 'avec alpha' : 'sans alpha' }}
                </span>
              </div>
              <div class="amm__used">Utilisé par {{ a.usedByCount }} template(s)</div>
            </div>
            <button class="amm__delete" (click)="$event.stopPropagation(); onDelete(a)">Supprimer</button>
          </article>
        </div>
      </div>
    </div>
    ```

    SCSS (match mockup tokens; aspect-ratio:16/9 thumb; backdrop + panel only when modal). Keep <250 lines. Use `:host { display: contents }` to avoid layout interference per ADR-095 lessons.

    NOTE: Use VOCABULARY constants only where DB jargon would otherwise leak. The asset manager mainly uses metric labels — no `template_layers` reference in the UI strings.

    Commit: `feat(template-studio-v3): asset manager modal + page component (ASSET-01..03)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && npm run test:smoke:smart 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File central-dashboard/.../studio-v3/asset-manager/asset-manager-modal.component.ts exists
    - `grep -n "selector: 'app-asset-manager-modal'" {component.ts}` returns 1
    - `grep -n "@Input() context\|assetSelected\|respectAlphaRequired" {component.ts}` returns 3+
    - `grep -n "listAssets\|uploadAsset\|deleteAsset" {component.ts}` returns 3
    - No `fetch(` in the component
    - No raw `'layer'` or `'slot'` string literals in the component HTML
    - Component renders in browser at /content/templates-remotion/assets (manual sanity check; defer full E2E to phase 2)
    - smoke-dashboard-guards remains green
  </acceptance_criteria>
  <done>Asset manager usable as page (route) and as modal (input bind); upload + delete + alpha feedback working end-to-end with backend from plan 01.</done>
</task>

</tasks>

<verification>
- `cd central-dashboard && npx ng build` succeeds
- Manual: navigate to /content/templates-remotion/assets in dev → grid renders with placeholder data
- Manual: upload a no-alpha WebM with respectAlphaRequired=true → French rejection message visible
- `npm run test:smoke:smart` from repo root → no regression
</verification>

<success_criteria>

- ASSET-01: grid with 7 metadata fields renders
- ASSET-02: upload returns hasAlpha; rejection message displays inline
- ASSET-03: delete on in-use asset displays the 409 message
- Component is dual-context (modal | page) controlled by Input + route data
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-02-SUMMARY.md` documenting:
- Component public API (Inputs/Outputs)
- Route entry added
- Data service methods added
- Manual UAT checklist results
</output>
