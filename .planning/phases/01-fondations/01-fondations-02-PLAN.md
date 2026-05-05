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
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
autonomous: true
requirements: [ASSET-01, ASSET-02, ASSET-03]
must_haves:
  truths:
    - 'Super_admin sees a grid of WebM assets with thumbnail, duration, dimensions, alpha flag, and used-by count'
    - 'Super_admin can upload a new WebM through the same component; alpha-rejected uploads display the French error message inline (consumes Plan 01 backend rejection)'
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
      to: RemotionTemplatesDataService.listLibraryAssets / uploadLibraryAsset / deleteLibraryAsset
      via: 'service method calls (no fetch)'
      pattern: "dataService\\.(list|upload|delete)LibraryAsset"
    - from: AssetManagerModalComponent
      to: VOCABULARY_MAP
      via: 'import from ../vocabulary.constants'
      pattern: 'VOCABULARY_MAP|ANIMATION_PRESET_LABELS'
---

## Plan 01 contracts consumed

- `POST /api/remotion-templates/:id/assets` returns `400 asset_alpha_required { detail.detectedPixFmt }` when `respect_alpha` is set + the file lacks alpha (Plan 01 / `remotion-templates.controller.ts:316-349`).
- `thumbnailService.extractMetadata()` now returns `{ pixFmt, hasAlpha, durationMs, width, height }` — these fields are echoed in the asset upload response (Plan 01 / `thumbnail.service.ts`).
- `templateStudioRepository.countLayersSharingVideoUrl(layerId)` — used by the new library-level delete endpoint to decide if the asset is in use (Plan 01).
- `VOCABULARY_MAP` + `ANIMATION_PRESET_LABELS` from `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — every user-facing label MUST come from this map (frozen by `smoke-template-studio-v3-vocabulary`).

<objective>
Build the Asset Manager UI as a single dual-context standalone Angular component (modal from wizard step 2 + full page at /content/templates-remotion/assets), plus the missing library-level backend endpoints (`GET /assets`, `DELETE /assets/:assetId`) since Plan 01 only froze the per-template `POST /:id/assets`.

Purpose: ASSET-01 (browse), ASSET-02 (upload with alpha feedback), ASSET-03 (deletion blocked when in use) — all from the dashboard, no terminal.

Output: Two new backend endpoints, one standalone component, three data service methods, one new route entry.
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
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@central-server/src/controllers/remotion-templates.controller.ts
@central-server/src/routes/remotion-templates.routes.ts
@central-server/src/repositories/template-studio.repository.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts

<interfaces>
EXISTING (Plan 01 frozen) — DO NOT redefine, just consume:
  POST /api/remotion-templates/:id/assets   → uploadTemplateAssetController in remotion-templates.controller.ts (alpha gating live)
  templateStudioRepository.countLayersSharingVideoUrl(layerId): number

EXISTING dataService method (kept for backward compat — DO NOT remove):
uploadAsset(templateId, file, propKey): Observable<AssetUploadResult> // line 193, used by v2 admin canvas — separate concern from v3 library

NEW (this plan adds — both backend + frontend):
GET /api/remotion-templates/assets → list all WebM assets across templates (super_admin only)
DELETE /api/remotion-templates/assets/:assetId → delete an asset (returns 409 if usedByCount > 0)
POST /api/remotion-templates/library/upload → standalone upload (no template_id binding) returning WebmAssetMetadata

Why new endpoints: existing /:id/assets is a per-template upload that mutates `default_props`; the v3 library is a flat catalog. Use a different controller export to avoid coupling the legacy v1 path to the v3 catalog.

NEW dataService methods (this plan adds, distinct from existing uploadAsset):
listLibraryAssets(): Observable<WebmAssetMetadata[]>
uploadLibraryAsset(file: File, opts: { respectAlpha?: boolean }): Observable<WebmAssetMetadata>
deleteLibraryAsset(assetId: string): Observable<void>

Backend response shape (define + export from remotion-templates.types.ts):
interface WebmAssetMetadata {
id: string; // synthetic — derived from storage_path hash since assets aren't a first-class table yet
url: string; // FTP URL (used as primary key for delete + lookup)
durationMs: number;
width: number;
height: number;
hasAlpha: boolean;
pixFmt: string;
uploadedAt: string;
usedByCount: number; // SUM across template_layers.video_url matches
}

Existing API service for HTTP calls:
central-dashboard/src/app/core/services/api.service.ts → use ApiService.get/post/delete/upload
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
  <name>Task 1: Backend library endpoints + data service methods + new route</name>
  <read_first>
    - central-server/src/controllers/remotion-templates.controller.ts (uploadTemplateAssetController pattern around line 316)
    - central-server/src/routes/remotion-templates.routes.ts (mount style for /:id/assets at lines 113-122)
    - central-server/src/repositories/template-studio.repository.ts (countLayersSharingVideoUrl + connection pattern via getClient/query)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (entire file — match existing method style around uploadAsset line 193)
    - central-dashboard/src/app/app.routes.ts (find content/templates-remotion route block)
    - central-dashboard/src/app/core/services/api.service.ts (HTTP wrapper signatures: get/post/delete/upload)
  </read_first>
  <behavior>
    - Test 1: GET /api/remotion-templates/assets returns 200 with a WebmAssetMetadata[] aggregated from `template_layers` distinct video_url + ffprobe lookup (cached in memory for ≤60s)
    - Test 2: POST /api/remotion-templates/library/upload accepts multipart {file, respectAlpha} — on alpha mismatch returns 400 asset_alpha_required (reuse the same logic block as uploadTemplateAssetController)
    - Test 3: DELETE /api/remotion-templates/assets/:assetId returns 409 asset_in_use { usedByPublishedCount } when ANY template_layer references the URL; otherwise removes from FTP and returns 204
    - Test 4: dataService.listLibraryAssets/uploadLibraryAsset/deleteLibraryAsset compile + match the new endpoint URLs
    - Test 5: Route '/content/templates-remotion/assets' lazy-loads AssetManagerModalComponent in page mode
  </behavior>
  <files>
    - central-server/src/controllers/remotion-templates.controller.ts (ADD listLibraryAssets, uploadLibraryAsset, deleteLibraryAsset; REUSE existing alpha gate logic from uploadTemplateAssetController)
    - central-server/src/routes/remotion-templates.routes.ts (ADD 3 new routes; place BEFORE /:id routes to avoid path collision with /:id matcher)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (ADD 3 new methods)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts (ADD WebmAssetMetadata interface)
    - central-dashboard/src/app/app.routes.ts (ADD assets route)
  </files>
  <action>
    Step 1 — Backend: extract the alpha-gate logic from `uploadTemplateAssetController` (lines 316-349) into a private helper `assertAlphaIfRequired(file, body)` and reuse it in the new `uploadLibraryAsset` controller. Add 3 controllers in `remotion-templates.controller.ts`:

    ```ts
    // listLibraryAssets — aggregates DISTINCT template_layers.video_url with ffprobe metadata
    export const listLibraryAssets = async (_req: AuthRequest, res: Response) => {
      try {
        // Use templateStudioRepository (read-only query OK) — DO NOT import config/database directly.
        // Repository will need a new method `listDistinctLayerAssets()` returning [{ url, usedByCount, uploadedAt }]
        // For each row, call thumbnailService.extractMetadata(localPathFromUrl(url)) and merge.
        // Cache in module-level Map<url, WebmAssetMetadata> with 60s TTL to avoid ffprobe on every list.
        const rows = await templateStudioRepository.listDistinctLayerAssets();
        const assets = await Promise.all(rows.map(async r => {
          const meta = await getCachedMetadata(r.url);
          const id = createHash('sha256').update(r.url).digest('hex').slice(0, 16);
          return { id, url: r.url, ...meta, uploadedAt: r.uploadedAt, usedByCount: r.usedByCount };
        }));
        res.json(assets);
      } catch (error) {
        logger.error('listLibraryAssets failed', { error });
        res.status(500).json({ error: 'list_failed' });
      }
    };

    // uploadLibraryAsset — same FTP path + alpha gate as per-template upload, no template binding
    export const uploadLibraryAsset = async (req: AuthRequest, res: Response) => {
      // Identical body parsing + thumbnailService.extractMetadata + assertAlphaIfRequired as
      // uploadTemplateAssetController; on success, store WebM in FTP under template-assets/library/
      // and return WebmAssetMetadata (id = sha256(url).slice(0,16))
    };

    // deleteLibraryAsset — guards with countLayersSharingVideoUrl-by-url variant
    export const deleteLibraryAsset = async (req: AuthRequest, res: Response) => {
      const { assetId } = req.params;
      const url = await templateStudioRepository.findAssetUrlById(assetId);  // reverse the sha256 mapping via Map
      if (!url) return res.status(404).json({ error: 'asset_not_found' });
      const usedByPublishedCount = await templateStudioRepository.countLayersSharingVideoUrlByUrl(url);
      if (usedByPublishedCount > 0) {
        return res.status(409).json({
          error: 'asset_in_use',
          message: `Ce fond est utilisé par ${usedByPublishedCount} autre(s) template(s) publié(s).`,
          detail: { usedByPublishedCount },
        });
      }
      await ftpService.delete(localPathFromUrl(url));
      res.status(204).send();
    };
    ```

    Repository additions in `template-studio.repository.ts` (use `query()` from config/database — read-only OK):
    ```ts
    // SELECT DISTINCT video_url, MIN(created_at) AS uploaded_at, COUNT(*) AS used_by_count
    //   FROM template_layers GROUP BY video_url ORDER BY MIN(created_at) DESC
    listDistinctLayerAssets(): Promise<Array<{ url: string; uploadedAt: string; usedByCount: number }>>;

    // Variant of countLayersSharingVideoUrl that takes the URL directly (no layerId)
    countLayersSharingVideoUrlByUrl(url: string): Promise<number>;
    ```

    Routes in `remotion-templates.routes.ts` — IMPORTANT: declare these BEFORE the `/:id` routes so the `/assets`, `/library/upload` paths don't get captured by the `/:id` matcher:
    ```ts
    // ── ADR-110 / Plan 02 — Library-level asset endpoints (super_admin) ────────
    router.get(
      '/assets',
      authenticate,
      requireRole('super_admin'),
      adminRateLimit,
      ctrl.listLibraryAssets,
    );
    router.post(
      '/library/upload',
      authenticate,
      requireRole('super_admin'),
      sensitiveRateLimit,
      uploadTemplateAsset.single('file'),
      ctrl.uploadLibraryAsset,
    );
    router.delete(
      '/assets/:assetId',
      authenticate,
      requireRole('super_admin'),
      sensitiveRateLimit,
      ctrl.deleteLibraryAsset,
    );
    ```

    Step 2 — Add interface to `remotion-templates.types.ts`:
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

    Step 3 — Add methods to `RemotionTemplatesDataService` (place AFTER existing `uploadAsset` at line 193, distinct names to avoid collision with the per-template uploader):
    ```ts
    listLibraryAssets(): Observable<WebmAssetMetadata[]> {
      return this.api.get<WebmAssetMetadata[]>('/remotion-templates/assets');
    }

    uploadLibraryAsset(file: File, opts: { respectAlpha?: boolean } = {}): Observable<WebmAssetMetadata> {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('respect_alpha', String(opts.respectAlpha ?? false));   // snake_case for multipart per Plan 01 contract
      return this.api.upload<WebmAssetMetadata>('/remotion-templates/library/upload', fd);
    }

    deleteLibraryAsset(assetId: string): Observable<void> {
      return this.api.delete<void>(`/remotion-templates/assets/${encodeURIComponent(assetId)}`);
    }
    ```

    Step 4 — Add route in `app.routes.ts` under the existing `content/templates-remotion` block:
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

    Commit: `feat(template-studio-v3): library asset endpoints + data service (ASSET-01..03)`

  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit 2>&1 | tail -10 && cd ../central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "listLibraryAssets\|uploadLibraryAsset\|deleteLibraryAsset" central-server/src/controllers/remotion-templates.controller.ts` returns 3+ matches
    - `grep -n "/assets'\|/library/upload" central-server/src/routes/remotion-templates.routes.ts` returns 2+ matches
    - `grep -n "listLibraryAssets\|uploadLibraryAsset\|deleteLibraryAsset" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` returns 3+ matches
    - `grep -n "templates-remotion/assets" central-dashboard/src/app/app.routes.ts` returns 1 match
    - `grep -n "WebmAssetMetadata" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts` returns 1 match
    - `npx tsc --noEmit` clean both sides
    - No `fetch(` token added (use ApiService)
  </acceptance_criteria>
  <done>Backend library endpoints live; dataService wired; route ready; component shell can be built next.</done>
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
        const ctx = this.route.snapshot.data?.['context'];
        if (ctx === 'page') this.context = 'page';
        this.loadAssets();
      }

      private loadAssets() {
        this.loading.set(true);
        this.dataService.listLibraryAssets().subscribe({
          next: (a) => { this.assets.set(a); this.loading.set(false); },
          error: () => { this.loading.set(false); }
        });
      }

      onFileSelected(ev: Event) {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.uploadError.set(null);
        this.uploadDetail.set(null);
        this.dataService.uploadLibraryAsset(file, { respectAlpha: this.respectAlphaRequired }).subscribe({
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
        this.dataService.deleteLibraryAsset(asset.id).subscribe({
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

    NOTE: The asset manager mainly uses metric labels — no `template_layers` reference in the UI strings. Use VOCABULARY_MAP only when DB jargon would otherwise leak (e.g. tooltips referencing "Fond animé" instead of "layer").

    Commit: `feat(template-studio-v3): asset manager modal + page component (ASSET-01..03)`

  </action>
  <verify>
    <automated>cd central-dashboard && npx ng build --configuration=development 2>&1 | tail -10 | grep -E "compiled|error" && cd .. && npm run test:smoke:smart 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File central-dashboard/.../studio-v3/asset-manager/asset-manager-modal.component.ts exists
    - `grep -n "selector: 'app-asset-manager-modal'" {component.ts}` returns 1
    - `grep -n "@Input() context\|assetSelected\|respectAlphaRequired" {component.ts}` returns 3+
    - `grep -n "listLibraryAssets\|uploadLibraryAsset\|deleteLibraryAsset" {component.ts}` returns 3
    - No `fetch(` in the component
    - No raw `'layer'` or `'slot'` string literals in the component HTML
    - Component renders in browser at /content/templates-remotion/assets (manual sanity check; defer full E2E to phase 2)
    - smoke-dashboard-guards remains green
    - smoke-template-studio-v3-vocabulary remains green
  </acceptance_criteria>
  <done>Asset manager usable as page (route) and as modal (input bind); upload + delete + alpha feedback working end-to-end with backend (Plan 01 alpha gate + Plan 02 library endpoints).</done>
</task>

</tasks>

<verification>
- `cd central-dashboard && npx ng build` succeeds
- `cd central-server && npx tsc --noEmit` clean
- Manual: navigate to /content/templates-remotion/assets in dev → grid renders with placeholder data
- Manual: upload a no-alpha WebM with respectAlphaRequired=true → French rejection message visible
- `npm run test:smoke:smart` from repo root → no regression
</verification>

<success_criteria>

- ASSET-01: grid with 7 metadata fields renders
- ASSET-02: upload returns hasAlpha; rejection message displays inline (consumes Plan 01 alpha gate)
- ASSET-03: delete on in-use asset displays the 409 message (consumes Plan 01 countLayersSharingVideoUrl)
- Component is dual-context (modal | page) controlled by Input + route data
- All v3 smoke tests stay green
  </success_criteria>

<output>
Create `.planning/phases/01-fondations/01-fondations-02-SUMMARY.md` documenting:
- Component public API (Inputs/Outputs)
- Backend endpoints added (URLs, payload, response)
- Route entry added
- Data service methods added (distinct from existing uploadAsset)
- Manual UAT checklist results
</output>
