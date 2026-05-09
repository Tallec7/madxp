---
phase: 260507-gxd-delete-template
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/repositories/templateStudioRepository.ts
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
  - central-server/src/services/metrics.service.ts
  - central-server/src/validation/schemas.ts
  - central-server/src/__tests__/smoke/smoke-template-delete.test.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.scss
autonomous: true
requirements:
  - AUDIT-P0-1
  - AUDIT-P0-2
must_haves:
  truths:
    - "Super_admin can click 'Supprimer' on a template card and confirm via typed-name modal"
    - 'DELETE /api/remotion-templates/:id removes all rows in cascade (templates + variants + layers + text_fields + slots + options + packshot_refs + versions + template_assets)'
    - 'FTP files of assets referenced ONLY by the deleted template are purged; shared assets remain'
    - 'Published templates (published=true) or in-use (usedByCount>0) return 409 unless ?force=true'
    - 'Prometheus counter neopro_template_deleted_total increments with cascade_status + reason labels'
  artifacts:
    - path: central-server/src/repositories/templateStudioRepository.ts
      provides: 'deleteTemplate(id, opts) method with BEGIN/COMMIT transaction'
      contains: 'deleteTemplate'
    - path: central-server/src/controllers/remotion-templates.controller.ts
      provides: 'deleteTemplate handler with 409 guard + force flag + FTP orphan cleanup'
      contains: 'deleteTemplate'
    - path: central-server/src/routes/remotion-templates.routes.ts
      provides: 'DELETE /:id route with super_admin guard + Joi validation'
      contains: 'router.delete'
    - path: central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
      provides: 'Delete button + typed-name confirmation modal'
      contains: 'openDeleteModal'
    - path: central-server/src/__tests__/smoke/smoke-template-delete.test.ts
      provides: 'Smoke test guard wiring + cascade + FTP cleanup + metric'
  key_links:
    - from: 'remotion-templates.component.ts (UI)'
      to: 'remotion-templates-data.service.ts deleteTemplate()'
      via: 'Angular service call'
      pattern: 'deleteTemplate'
    - from: 'remotion-templates.routes.ts'
      to: 'remotion-templates.controller.ts deleteTemplate'
      via: 'Express router.delete'
      pattern: "router\\.delete.*deleteTemplate"
    - from: 'controller deleteTemplate'
      to: 'templateStudioRepository.deleteTemplate'
      via: 'repository pattern (no query() in controller)'
      pattern: "templateStudioRepository\\.deleteTemplate"
    - from: 'controller deleteTemplate'
      to: 'storage.service deleteVideo (or equivalent)'
      via: 'FTP orphan cleanup loop'
      pattern: 'storage.*delete'
    - from: 'controller deleteTemplate'
      to: 'metricsService.recordTemplateDeleted'
      via: 'Prometheus counter'
      pattern: 'neopro_template_deleted_total'
---

<objective>
Implement DELETE template end-to-end: API endpoint with cascade DB transaction, FTP orphan cleanup, super_admin guard, typed-name confirmation UI modal, smoke test.

Purpose: Close P0 #1 (UX gap — no way to remove templates) + P0 #2 (FTP orphan accumulation, 3rd occurrence of this pattern in codebase, cf. PR #613 video cleanup cascade).
Output: Working DELETE flow shipped on a single PR, atomic per task.
</objective>

<execution_context>
Worktree: /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/romantic-lehmann-b8c43f
Milestone v4.0 Firestick is on Phase 6 — DO NOT touch firestick/captive/receivers files.
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@docs/audits/templates-remotion-audit-2026-05-07.md

<interfaces>
<!-- Discover at runtime by reading actual files; key contracts the executor must match: -->

Repository pattern (from CLAUDE.md):

- 0 query() in controllers (ESLint enforced via no-restricted-imports)
- All DB access via repositories/\*.ts barrel

Existing controller patterns to mirror (from remotion-templates.controller.ts):

- export const publishTemplate = async (req: AuthRequest, res: Response): Promise<void> => { ... }
- logger.info('Action', { context, template_id })
- res.status(409).json({ error: '...' })

Route guard pattern (from template-studio.routes.ts):

- router.delete('/:id', authenticateJwt, requireRole('super_admin'), validateParams(schema), handler)

Joi UUID validation pattern (from validation/schemas.ts):

- Joi.object({ id: Joi.string().uuid().required() })

Metrics pattern (from metrics.service.ts):

- new Counter({ name: 'neopro_xxx_total', help: '...', labelNames: ['label1','label2'] })
- recordXxx(label1: string, label2: string): void

Cleanup reference (PR #617 video cleanup cascade):

- grep videoCleanupService and storage.service.ts:deleteVideo for the FTP delete signature
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Repository deleteTemplate with cascade transaction</name>
  <files>central-server/src/repositories/templateStudioRepository.ts</files>
  <read_first>
    - central-server/src/repositories/templateStudioRepository.ts (existing patterns: createTemplate, duplicateTemplate v3 — model the BEGIN/COMMIT)
    - central-server/src/scripts/full-schema.sql (confirm tables: templates, template_variants, template_layers, template_text_fields, template_slots, template_options, template_packshot_refs, template_versions, template_assets)
    - central-server/src/repositories/index.ts (barrel export)
  </read_first>
  <behavior>
    - deleteTemplate(id, opts={force:false}) returns { deleted: boolean, orphanAssetIds: string[], cascadeRowCounts: Record&lt;string, number&gt; }
    - Reads template first; if not found returns { deleted: false, orphanAssetIds: [], cascadeRowCounts: {} } (idempotent 404 upstream)
    - Inside BEGIN/COMMIT: collects asset_ids referenced by this template via template_assets, then DELETEs in dependency order (text_fields → slots → layers → variants → options → packshot_refs → versions → template_assets → templates)
    - Computes orphanAssetIds = assets whose remaining usedByCount === 0 across all templates after deletion (SELECT COUNT(*) FROM template_assets WHERE asset_id = ANY(...) GROUP BY asset_id HAVING COUNT(*) = 0)
    - On any error: ROLLBACK and re-throw with logger.error context
    - opts.force has no effect at repo level (the 409 guard is at controller level — repo always deletes if called)
  </behavior>
  <action>
    Add `deleteTemplate(id: string): Promise&lt;DeleteTemplateResult&gt;` to templateStudioRepository.

    Signature:
    ```
    export interface DeleteTemplateResult {
      deleted: boolean;
      orphanAssetIds: string[];
      cascadeRowCounts: { variants: number; layers: number; textFields: number; slots: number; options: number; packshotRefs: number; versions: number; templateAssets: number };
    }
    export async function deleteTemplate(id: string): Promise&lt;DeleteTemplateResult&gt;
    ```

    Implementation:
    1. `const client = await pool.connect()` then `await client.query('BEGIN')`
    2. `SELECT id FROM templates WHERE id = $1` — if 0 rows: ROLLBACK, return `{ deleted: false, orphanAssetIds: [], cascadeRowCounts: {...zero} }`
    3. `SELECT asset_id FROM template_assets WHERE template_id = $1` → assetIds
    4. DELETE in this order, capturing rowCount each:
       - `DELETE FROM template_text_fields WHERE layer_id IN (SELECT id FROM template_layers WHERE template_id = $1)`
       - `DELETE FROM template_slots WHERE layer_id IN (SELECT id FROM template_layers WHERE template_id = $1)` (if table exists; gate via try/catch on undefined_table 42P01)
       - `DELETE FROM template_layers WHERE template_id = $1`
       - `DELETE FROM template_variants WHERE template_id = $1`
       - `DELETE FROM template_options WHERE template_id = $1`
       - `DELETE FROM template_packshot_refs WHERE template_id = $1`
       - `DELETE FROM template_versions WHERE template_id = $1`
       - `DELETE FROM template_assets WHERE template_id = $1`
       - `DELETE FROM templates WHERE id = $1`
    5. `SELECT asset_id FROM template_assets WHERE asset_id = ANY($1)` → still-referenced; orphans = assetIds \ stillRef
    6. `await client.query('COMMIT')` then return result
    7. On catch: `await client.query('ROLLBACK')`, `logger.error('templateStudioRepository.deleteTemplate failed', { template_id: id, error: err.message })`, re-throw
    8. `finally { client.release() }`

    Tests (write FIRST, RED):
    - central-server/src/__tests__/repositories/templateStudioRepository.deleteTemplate.test.ts
    - Test 1: returns { deleted: false } when template doesn't exist
    - Test 2: returns { deleted: true, orphanAssetIds: [a1] } when deleting a template with 1 unique asset
    - Test 3: returns { deleted: true, orphanAssetIds: [] } when deleting a template whose asset is shared with another template
    - Test 4: rolls back when any DELETE throws (mock to throw on template_layers)
    - Mock pg pool client with jest.mock('../../config/database')

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='templateStudioRepository.deleteTemplate' --no-coverage --forceExit</automated>
  </verify>
  <done>
    - grep -q "export async function deleteTemplate" central-server/src/repositories/templateStudioRepository.ts
    - grep -q "BEGIN" and "COMMIT" and "ROLLBACK" in templateStudioRepository.ts deleteTemplate scope
    - Jest test file passes 4/4
    - No `console.log` in new code (Winston only)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Controller + route DELETE + Joi + super_admin guard + metric</name>
  <files>
    central-server/src/controllers/remotion-templates.controller.ts,
    central-server/src/routes/remotion-templates.routes.ts,
    central-server/src/services/metrics.service.ts,
    central-server/src/validation/schemas.ts
  </files>
  <read_first>
    - central-server/src/controllers/remotion-templates.controller.ts (mirror publishTemplate / unpublishTemplate handlers)
    - central-server/src/routes/remotion-templates.routes.ts (existing super_admin/sensitiveRateLimit middleware chain)
    - central-server/src/routes/template-studio.routes.ts (adminOnly + validateParams pattern)
    - central-server/src/services/metrics.service.ts (recordXxx + Counter pattern, look at recordMatchSessionAutoclosed)
    - central-server/src/validation/schemas.ts (Joi UUID schema pattern)
    - central-server/src/services/storage.service.ts OR central-server/src/services/videoCleanupService.* (find the FTP delete entrypoint — grep `deleteVideo\\|deleteFile\\|removeFromFtp`)
  </read_first>
  <behavior>
    - DELETE /api/remotion-templates/:id with super_admin guard
    - 400 if id not UUID (Joi)
    - 401/403 if not authenticated / not super_admin
    - 404 if template not found
    - 409 with `{ error, code: 'TEMPLATE_IN_USE', published: bool, usedByCount: number }` if template.published === true OR usedByCount > 0 AND ?force !== 'true'
    - 200 `{ deleted: true, orphanAssetsRemoved: number, ftpFailures: number }` on success
    - For each orphan asset: call storageService.deleteAsset/deleteVideo (best-effort, log error per failure but don't fail the response — DB cascade already committed)
    - Metric: `metricsService.recordTemplateDeleted(cascade_status, reason)` where cascade_status ∈ ['success','partial','failed'], reason ∈ ['user','admin_force']
    - Winston logger.info at start ({ template_id, force, user_id }) and logger.info at end ({ template_id, orphan_count, ftp_failures })
  </behavior>
  <action>
    **A. metrics.service.ts** — add Counter + recorder:
    ```
    private templateDeletedCounter = new Counter({
      name: 'neopro_template_deleted_total',
      help: 'Templates deleted via DELETE /api/remotion-templates/:id',
      labelNames: ['cascade_status', 'reason'],
    });
    public recordTemplateDeleted(cascade_status: 'success'|'partial'|'failed', reason: 'user'|'admin_force'): void {
      this.templateDeletedCounter.inc({ cascade_status, reason });
    }
    ```
    Register in the registry alongside existing counters (mirror recordMatchSessionAutoclosed wiring).

    **B. validation/schemas.ts** — add to existing exports:
    ```
    export const remotionTemplateIdParam = Joi.object({ id: Joi.string().uuid().required() });
    export const remotionTemplateDeleteQuery = Joi.object({ force: Joi.string().valid('true','false').optional() });
    ```

    **C. remotion-templates.controller.ts** — add `deleteTemplate` handler:
    ```
    export const deleteTemplate = async (req: AuthRequest, res: Response): Promise&lt;void&gt; => {
      const { id } = req.params;
      const force = req.query.force === 'true';
      const userId = req.user?.id;
      logger.info('Template delete requested', { template_id: id, force, user_id: userId });

      const tpl = await templateStudioRepository.findTemplateById(id); // or existing getTemplate
      if (!tpl) { res.status(404).json({ error: 'Template not found' }); return; }

      const usedByCount = await templateStudioRepository.getTemplateUsedByCount(id); // implement or reuse
      if (!force && (tpl.published === true || usedByCount > 0)) {
        res.status(409).json({
          error: 'Template is in use or published. Use ?force=true to override.',
          code: 'TEMPLATE_IN_USE',
          published: tpl.published === true,
          usedByCount,
        });
        return;
      }

      let cascadeStatus: 'success'|'partial'|'failed' = 'success';
      let ftpFailures = 0;
      try {
        const result = await templateStudioRepository.deleteTemplate(id);
        // FTP orphan cleanup (best-effort)
        for (const assetId of result.orphanAssetIds) {
          try {
            const asset = await templateStudioRepository.findAssetById(assetId);
            if (asset?.storage_path) {
              await storageService.deleteAsset(asset.storage_path); // adapt to actual signature
            }
          } catch (e) {
            ftpFailures++;
            logger.error('FTP orphan cleanup failed', { template_id: id, asset_id: assetId, error: (e as Error).message });
          }
        }
        if (ftpFailures > 0) cascadeStatus = 'partial';
        metricsService.recordTemplateDeleted(cascadeStatus, force ? 'admin_force' : 'user');
        logger.info('Template deleted', { template_id: id, orphan_count: result.orphanAssetIds.length, ftp_failures: ftpFailures });
        res.json({ deleted: true, orphanAssetsRemoved: result.orphanAssetIds.length - ftpFailures, ftpFailures });
      } catch (err) {
        metricsService.recordTemplateDeleted('failed', force ? 'admin_force' : 'user');
        logger.error('Template delete failed', { template_id: id, error: (err as Error).message });
        res.status(500).json({ error: 'Template deletion failed' });
      }
    };
    ```

    NOTE: if `findTemplateById`, `getTemplateUsedByCount`, `findAssetById` don't already exist on the repo, implement them in templateStudioRepository.ts as part of this task (small read-only queries, no transaction).

    **D. remotion-templates.routes.ts** — add route at the right level:
    ```
    router.delete('/:id',
      authenticateJwt,
      requireRole('super_admin'),
      sensitiveRateLimit, // if pattern exists in this file
      validateParams(remotionTemplateIdParam),
      validateQuery(remotionTemplateDeleteQuery),
      remotionTemplatesController.deleteTemplate,
    );
    ```

    Tests (write FIRST, RED):
    - central-server/src/__tests__/controllers/remotion-templates.deleteTemplate.test.ts
    - Test 1: returns 404 when template doesn't exist
    - Test 2: returns 409 with code TEMPLATE_IN_USE when published && !force
    - Test 3: returns 200 + records metric `success`/`user` when deleting unpublished unused template
    - Test 4: returns 200 + records metric `partial`/`admin_force` when force=true and 1 FTP delete fails
    - Test 5: route requires super_admin (mock requireRole guard)

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='remotion-templates.deleteTemplate' --no-coverage --forceExit</automated>
  </verify>
  <done>
    - grep -q "router.delete.*':id'" central-server/src/routes/remotion-templates.routes.ts
    - grep -q "deleteTemplate" central-server/src/controllers/remotion-templates.controller.ts
    - grep -q "neopro_template_deleted_total" central-server/src/services/metrics.service.ts
    - grep -q "remotionTemplateIdParam" central-server/src/validation/schemas.ts
    - All 5 controller tests pass
    - 0 `query()` direct in controller (ESLint passes)
    - npm run lint passes
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Frontend data service + delete button + typed-name confirm modal</name>
  <files>
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts,
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts,
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.scss
  </files>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (existing publish/unpublish/duplicate methods — mirror signature + http.delete pattern)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts (existing card layout, action buttons row, modal pattern if any)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.scss (existing card + button tokens)
    - central-dashboard/src/styles.scss (--danger-* tokens — use these, NOT #fef2f2 hardcoded per audit P0 design issue)
  </read_first>
  <behavior>
    - data service exposes `deleteTemplate(id: string, force?: boolean): Observable&lt;DeleteTemplateResponse&gt;`
    - "Supprimer" button visible on each template card for super_admin only (use existing role check or inputs)
    - Click opens confirmation modal showing template name + warning if `published || usedByCount > 0`
    - User MUST type the exact template name into a text input to enable the red "Supprimer définitivement" button (GitHub repo delete pattern)
    - If 409 returned: show inline warning with usedByCount + checkbox "Forcer la suppression (admin)" → re-call with force=true
    - On success: remove card from grid + toast "Template supprimé" + decrement local count
    - data-testid: `template-delete-btn-{id}`, `template-delete-modal`, `template-delete-confirm-input`, `template-delete-confirm-btn`
  </behavior>
  <action>
    **A. data service** — add method:
    ```
    interface DeleteTemplateResponse { deleted: boolean; orphanAssetsRemoved: number; ftpFailures: number; }
    deleteTemplate(id: string, force = false): Observable&lt;DeleteTemplateResponse&gt; {
      const params = force ? new HttpParams().set('force', 'true') : undefined;
      return this.http.delete&lt;DeleteTemplateResponse&gt;(`${this.apiUrl}/remotion-templates/${id}`, { params });
    }
    ```
    Add `Conflict409Error` shape handler returning the body so the component can show usedByCount.

    **B. component** — add to existing template card a delete button (icon trash from lucide-angular if available, fallback Unicode "Supprimer" text):
    ```html
    <button class="rt-card__delete"
            *ngIf="isSuperAdmin"
            [attr.data-testid]="'template-delete-btn-' + tpl.id"
            (click)="openDeleteModal(tpl)">
      Supprimer
    </button>
    ```

    Modal (inline or shared confirm modal — match existing pattern in this component):
    ```html
    <div *ngIf="deleteModal.tpl" class="rt-delete-modal" data-testid="template-delete-modal">
      <h3>Supprimer "{{ deleteModal.tpl.name }}" ?</h3>
      <p *ngIf="deleteModal.tpl.published || deleteModal.usedByCount &gt; 0" class="rt-delete-modal__warning">
        ⚠️ Ce template est {{ deleteModal.tpl.published ? 'publié' : '' }}{{ deleteModal.usedByCount &gt; 0 ? ' et utilisé par ' + deleteModal.usedByCount + ' sponsor(s)' : '' }}.
      </p>
      <p>Pour confirmer, tape exactement <code>{{ deleteModal.tpl.name }}</code> :</p>
      <input data-testid="template-delete-confirm-input"
             [(ngModel)]="deleteModal.typed"
             [placeholder]="deleteModal.tpl.name" />
      <label *ngIf="deleteModal.requiresForce">
        <input type="checkbox" [(ngModel)]="deleteModal.force" /> Forcer (admin)
      </label>
      <button data-testid="template-delete-confirm-btn"
              [disabled]="deleteModal.typed !== deleteModal.tpl.name || (deleteModal.requiresForce && !deleteModal.force)"
              (click)="confirmDelete()"
              class="rt-delete-modal__confirm">
        Supprimer définitivement
      </button>
      <button (click)="closeDeleteModal()">Annuler</button>
    </div>
    ```

    Component methods:
    ```
    deleteModal: { tpl: Template | null; typed: string; usedByCount: number; requiresForce: boolean; force: boolean } = { tpl: null, typed: '', usedByCount: 0, requiresForce: false, force: false };

    openDeleteModal(tpl: Template) {
      this.deleteModal = { tpl, typed: '', usedByCount: tpl.usedByCount ?? 0, requiresForce: false, force: false };
    }
    closeDeleteModal() { this.deleteModal = { tpl: null, typed: '', usedByCount: 0, requiresForce: false, force: false }; }
    confirmDelete() {
      const t = this.deleteModal.tpl; if (!t) return;
      this.dataService.deleteTemplate(t.id, this.deleteModal.force).subscribe({
        next: () => { this.templates = this.templates.filter(x => x.id !== t.id); this.toast.success('Template supprimé'); this.closeDeleteModal(); },
        error: (err) => {
          if (err.status === 409) {
            this.deleteModal.usedByCount = err.error?.usedByCount ?? 0;
            this.deleteModal.requiresForce = true;
            this.toast.warn('Template utilisé — coche "Forcer" pour confirmer');
          } else { this.toast.error('Suppression impossible'); }
        },
      });
    }
    ```

    **C. SCSS** — use existing tokens, no hardcoded colors:
    ```scss
    .rt-card__delete { background: var(--danger-bg, #fee2e2); color: var(--danger-color, #b91c1c); border: none; padding: 0.4rem 0.75rem; border-radius: 4px; cursor: pointer; }
    .rt-card__delete:hover { background: var(--danger-hover, #fecaca); }
    .rt-delete-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: white; padding: 2rem; box-shadow: 0 8px 32px rgba(0,0,0,0.2); border-radius: 8px; z-index: 1000; min-width: 400px; }
    .rt-delete-modal__warning { background: var(--warning-bg, #fef3c7); padding: 0.75rem; border-radius: 4px; }
    .rt-delete-modal__confirm:disabled { opacity: 0.4; cursor: not-allowed; }
    ```

    Tests (Karma):
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.spec.ts — add a deleteTemplate spec verifying http.delete call
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.spec.ts — add specs: openDeleteModal sets tpl, confirmDelete disabled until name typed, 409 sets requiresForce

  </action>
  <verify>
    <automated>cd central-dashboard && npm test -- --include='**/remotion-templates*.spec.ts' --watch=false --browsers=ChromeHeadless</automated>
  </verify>
  <done>
    - grep -q "deleteTemplate" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    - grep -q "openDeleteModal\\|confirmDelete" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - grep -q "data-testid=\"template-delete" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - grep -nE "#7c3aed|#6d28d9|#fef2f2|#fee2e2" central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.scss returns ONLY occurrences inside CSS var fallbacks `var(--xxx, #xxx)` (audit P0 design)
    - Karma specs pass
  </done>
</task>

<task type="auto">
  <name>Task 4: Smoke test smoke-template-delete.test.ts (wiring + cascade + FTP + metric)</name>
  <files>central-server/src/__tests__/smoke/smoke-template-delete.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-remotion.test.ts (pattern for file-based smoke checks on routes/controllers/repos)
    - central-server/src/__tests__/smoke/smoke-alerts-dedup.test.ts (pattern for service-level smoke with grep + ordering checks)
    - central-server/src/__tests__/smoke/smoke-service-test-coverage.test.ts (pattern: grep source files for required strings, fail if missing)
  </read_first>
  <behavior>
    File-based smoke (no DB required) — read source files and assert wiring contract:
    1. Route `DELETE /:id` with `requireRole('super_admin')` exists in remotion-templates.routes.ts
    2. Controller deleteTemplate exists, calls templateStudioRepository.deleteTemplate, calls metricsService.recordTemplateDeleted, calls storageService delete for orphans
    3. Repository deleteTemplate has BEGIN and COMMIT (cascade transaction)
    4. Counter `neopro_template_deleted_total` registered in metrics.service.ts with labelNames cascade_status + reason
    5. Joi schema remotionTemplateIdParam exists in validation/schemas.ts
    6. 409 path exists for published || usedByCount > 0 in controller
    7. force=true bypass exists in controller
    8. Frontend: deleteTemplate exists in remotion-templates-data.service.ts and openDeleteModal exists in component
  </behavior>
  <action>
    Create `central-server/src/__tests__/smoke/smoke-template-delete.test.ts`:

    ```typescript
    import * as fs from 'fs';
    import * as path from 'path';

    const root = path.resolve(__dirname, '../../..');
    const dashRoot = path.resolve(__dirname, '../../../../central-dashboard');
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
    const readDash = (p: string) => fs.readFileSync(path.join(dashRoot, p), 'utf8');

    describe('smoke-template-delete (ADR P0 #1 + #2)', () => {
      it('route DELETE /:id is registered with super_admin guard', () => {
        const src = read('src/routes/remotion-templates.routes.ts');
        expect(src).toMatch(/router\.delete\(\s*['"]\/:id['"]/);
        expect(src).toMatch(/requireRole\(['"]super_admin['"]\)/);
        expect(src).toMatch(/validateParams\(remotionTemplateIdParam\)/);
      });

      it('controller deleteTemplate wires repository + metric + FTP cleanup', () => {
        const src = read('src/controllers/remotion-templates.controller.ts');
        expect(src).toMatch(/export const deleteTemplate\b/);
        expect(src).toMatch(/templateStudioRepository\.deleteTemplate/);
        expect(src).toMatch(/metricsService\.recordTemplateDeleted/);
        expect(src).toMatch(/storageService\.(deleteAsset|deleteVideo|deleteFile)/);
        // 409 guard
        expect(src).toMatch(/409/);
        expect(src).toMatch(/TEMPLATE_IN_USE/);
        // force bypass
        expect(src).toMatch(/force/);
      });

      it('repository deleteTemplate uses BEGIN/COMMIT transaction', () => {
        const src = read('src/repositories/templateStudioRepository.ts');
        expect(src).toMatch(/export async function deleteTemplate\b/);
        const fnStart = src.indexOf('export async function deleteTemplate');
        const fnEnd = src.indexOf('\nexport ', fnStart + 1);
        const body = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
        expect(body).toMatch(/BEGIN/);
        expect(body).toMatch(/COMMIT/);
        expect(body).toMatch(/ROLLBACK/);
        expect(body).toMatch(/template_layers/);
        expect(body).toMatch(/template_text_fields/);
        expect(body).toMatch(/template_assets/);
        expect(body).toMatch(/template_versions/);
      });

      it('Counter neopro_template_deleted_total is registered with proper labels', () => {
        const src = read('src/services/metrics.service.ts');
        expect(src).toMatch(/neopro_template_deleted_total/);
        expect(src).toMatch(/cascade_status/);
        expect(src).toMatch(/reason/);
        expect(src).toMatch(/recordTemplateDeleted/);
      });

      it('Joi schema remotionTemplateIdParam exists', () => {
        const src = read('src/validation/schemas.ts');
        expect(src).toMatch(/remotionTemplateIdParam/);
        expect(src).toMatch(/Joi\.string\(\)\.uuid\(\)/);
      });

      it('frontend exposes deleteTemplate + typed-name modal', () => {
        const svc = readDash('src/app/features/content/remotion-templates/remotion-templates-data.service.ts');
        expect(svc).toMatch(/deleteTemplate\s*\(/);
        expect(svc).toMatch(/this\.http\.delete/);
        const cmp = readDash('src/app/features/content/remotion-templates/remotion-templates.component.ts');
        expect(cmp).toMatch(/openDeleteModal/);
        expect(cmp).toMatch(/confirmDelete/);
        expect(cmp).toMatch(/data-testid=['"]template-delete-confirm-input['"]/);
      });

      it('SCSS uses CSS var tokens, no raw hardcoded danger colors outside fallbacks', () => {
        const scss = readDash('src/app/features/content/remotion-templates/remotion-templates.component.scss');
        // any direct usage that is NOT inside `var(--xxx, #xxx)` fails
        const lines = scss.split('\n');
        for (const line of lines) {
          if (/#[0-9a-fA-F]{6}/.test(line)) {
            expect(line).toMatch(/var\(--/);
          }
        }
      });
    });
    ```

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-delete' --no-coverage --forceExit</automated>
  </verify>
  <done>
    - File central-server/src/__tests__/smoke/smoke-template-delete.test.ts exists
    - All 7 smoke assertions pass
    - npm run test:smoke:smart picks up the new suite when remotion-templates.* is touched
  </done>
</task>

</tasks>

<verification>
- `cd central-server && npm run lint` passes (no query() in controllers)
- `cd central-server && npm run test:smoke:smart` includes smoke-template-delete and passes
- `cd central-server && npx jest --testPathPattern='templateStudioRepository.deleteTemplate|remotion-templates.deleteTemplate|smoke-template-delete' --forceExit` all green
- `cd central-dashboard && npm test -- --include='**/remotion-templates*.spec.ts' --watch=false --browsers=ChromeHeadless` passes
- Manual smoke: as super_admin, DELETE on a draft template removes card + DB rows + orphan FTP file (verify with `psql` and `ls` on FTP)
- Manual smoke: as super_admin, DELETE on a published template returns 409, retry with "Forcer" succeeds and increments `neopro_template_deleted_total{cascade_status="success",reason="admin_force"}`
</verification>

<success_criteria>

- Super_admin can delete any template via UI with typed-name confirmation
- Cascade transaction removes all child rows atomically (rollback on any failure)
- Orphan FTP assets are purged best-effort with metric tracking partial failures
- Published / in-use templates require explicit force=true (audited via reason='admin_force')
- 0 query() in controller (repository pattern strict)
- Smoke test guards the wiring against future regressions
- 1 atomic commit per task: feat(templates) repo / feat(templates) controller+route / feat(templates) UI / test(templates) smoke
  </success_criteria>

<output>
This is a /gsd:quick task — no SUMMARY.md required. Story Card in PR description per CLAUDE.md convention.
</output>
