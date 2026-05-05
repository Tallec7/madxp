---
phase: 03-gate-publication
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
  - central-server/src/validation/schemas.ts
  - central-server/src/repositories/template-studio.repository.ts
  - central-server/src/services/remotion-render-worker.service.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render.test.ts
autonomous: true
requirements: [PUB-02]
must_haves:
  truths:
    - 'POST /api/remotion-templates/:id/test-render enqueue un job render réutilisant remotion-render-jobs'
    - 'Job test-render upload sur /test-renders/{templateId}/{timestamp}.mp4'
    - 'Repository expose updateTestRenderTracking({status, url, at})'
    - "Worker met à jour test_render_status sur 'queued'/'rendering'/'success'/'failed'"
  artifacts:
    - path: central-server/src/repositories/template-studio.repository.ts
      provides: 'updateTestRenderTracking(templateId, {status, url?, at?}) method'
    - path: central-server/src/controllers/remotion-templates.controller.ts
      provides: 'createTestRender controller — fixtures injection + enqueue'
    - path: central-server/src/services/remotion-render-worker.service.ts
      provides: 'Hook test-render path: marks test_render_status + uploads to /test-renders/'
  key_links:
    - from: POST /:id/test-render
      to: remotionRenderJobRepository.create
      via: "controller injects PREVIEW_FIXTURES → enqueue with title prefix 'test-render:'"
      pattern: "title:\\s*['\"`]test-render:"
    - from: worker render success
      to: templateStudioRepository.updateTestRenderTracking
      via: 'after upload, branch on title prefix to update template tracking'
      pattern: "updateTestRenderTracking\\("
---

<objective>
Backend test render async (PUB-02) : POST /:id/test-render → enqueue job réutilisant `remotion_render_jobs`, fixtures injectées côté serveur, upload FTP `/test-renders/`, persistance test_render_status sur templates.

Purpose: Phase 3 success criteria #2 — super_admin lance un test render avant publish, un échec bloque l'affichage "test réussi" (warning seul, pas blocker).
Output: 1 route, 1 controller, 1 repo method, 1 hook worker, 1 smoke RED→GREEN.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-gate-publication/03-CONTEXT.md
@docs/adr/ADR-054-remotion-async-render.md
@docs/adr/ADR-055-remotion-template-versions.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/code-patterns.md
@.claude/rules/testing.md

<interfaces>
Existing render queue (read first) :

```typescript
// central-server/src/repositories/remotion-render-job.repository.ts
export interface CreateRenderJobInput {
  template_id: string;
  props: Record<string, unknown>;
  title: string;                 // Used as discriminator : prefix 'test-render:' for Phase 3
  requested_by: string | null;
  requested_for_site_id: string | null;
}
remotionRenderJobRepository.create(input): Promise<RemotionRenderJob>;
remotionRenderJobRepository.findById(id): Promise<RemotionRenderJob | null>;
```

Worker hook (central-server/src/services/remotion-render-worker.service.ts) — extend the existing render success branch :

- BEFORE upload : detect `job.title.startsWith('test-render:')` → upload to `/test-renders/{templateId}/{timestamp}.mp4` instead of normal videos path.
- AFTER success : call `templateStudioRepository.updateTestRenderTracking(templateId, { status: 'success', url, at: new Date() })`.
- On failure : call `templateStudioRepository.updateTestRenderTracking(templateId, { status: 'failed', at: new Date() })`.

Fixtures source (Phase 2 reuse) — central-dashboard/.../studio-v3/wizard/preview-fixtures.ts contains client-side fixtures. For Phase 3, mirror them as a server-side const `TEST_RENDER_FIXTURES` in the controller (or extract to `central-server/src/services/template-validation/test-render-fixtures.ts`) :

```typescript
export const TEST_RENDER_FIXTURES = {
  player_first_name: 'PRÉNOM',
  player_last_name: 'NOM',
  club_name: 'NOM DU CLUB',
  player_photo: 'https://placehold.co/600x800?text=PHOTO',
  club_logo: 'https://placehold.co/200x200?text=LOGO',
  // + boolean defaults for options : intro_mode='logo' etc.
};
```

Repository method to add :

```typescript
async updateTestRenderTracking(
  templateId: string,
  patch: { status: 'queued'|'rendering'|'success'|'failed', url?: string, at?: Date }
): Promise<void>
```

Joi schema (validation/schemas.ts pattern) :

```typescript
export const testRenderSchemas = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({}).unknown(false), // No user input — fixtures côté serveur
};
```

Route mounting : per Phase 1 deviation, studio routes mount on `/api/remotion-templates`. Add :

```typescript
router.post(
  '/:id/test-render',
  requireSuperAdmin,
  validate(testRenderSchemas.params, 'params'),
  remotionTemplatesController.createTestRender,
);
```

</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: RED smoke — POST /:id/test-render contracts</name>
  <files>central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts (file-based smoke shape)
    - central-server/src/repositories/remotion-render-job.repository.ts (existing schema, no need to modify)
    - central-server/src/services/remotion-render-worker.service.ts (existing render flow to hook into)
  </read_first>
  <action>
    Créer 5 file-based contracts :

    Test A — Joi schema exists :
    ```typescript
    const schemas = readFileSync('src/validation/schemas.ts', 'utf8');
    expect(schemas).toMatch(/testRenderSchemas/);
    expect(schemas).toMatch(/Joi\.string\(\)\.uuid\(\)\.required\(\)/);
    ```

    Test B — Route registered :
    ```typescript
    const routes = readFileSync('src/routes/remotion-templates.routes.ts', 'utf8');
    expect(routes).toMatch(/router\.post\(['"]\/:id\/test-render['"]/);
    expect(routes).toMatch(/requireSuperAdmin/);
    expect(routes).toMatch(/createTestRender/);
    ```

    Test C — Controller injects fixtures + enqueues with title prefix :
    ```typescript
    const ctrl = readFileSync('src/controllers/remotion-templates.controller.ts', 'utf8');
    expect(ctrl).toMatch(/export const createTestRender/);
    expect(ctrl).toMatch(/title:\s*['"`]test-render:/);
    expect(ctrl).toMatch(/TEST_RENDER_FIXTURES|player_first_name:\s*['"]PRÉNOM/);
    expect(ctrl).toMatch(/remotionRenderJobRepository\.create/);
    expect(ctrl).toMatch(/updateTestRenderTracking[\s\S]+status:\s*['"]queued/);
    ```

    Test D — Repository method present :
    ```typescript
    const repo = readFileSync('src/repositories/template-studio.repository.ts', 'utf8');
    expect(repo).toMatch(/async updateTestRenderTracking/);
    expect(repo).toMatch(/test_render_status\s*=\s*\$/);
    expect(repo).toMatch(/test_render_url\s*=\s*\$/);
    expect(repo).toMatch(/test_render_at\s*=\s*\$/);
    ```

    Test E — Worker test-render branch :
    ```typescript
    const worker = readFileSync('src/services/remotion-render-worker.service.ts', 'utf8');
    expect(worker).toMatch(/test-render:/);
    expect(worker).toMatch(/\/test-renders\//);
    expect(worker).toMatch(/updateTestRenderTracking[\s\S]+status:\s*['"]success/);
    expect(worker).toMatch(/updateTestRenderTracking[\s\S]+status:\s*['"]failed/);
    ```

    Lancer : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render\b' --no-coverage --forceExit` → DOIT être RED.
    Commit : `test(03-03): add RED smoke for test render endpoint + worker hook`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render\b' --no-coverage --forceExit 2>&1 | grep -E 'failed|FAIL'</automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render.test.ts` exists
    - 5 distinct `describe` or `it` blocks (Test A → E)
    - At least 13 `expect(...).toMatch(...)` assertions
    - `grep "test-render:" smoke-template-studio-v3-test-render.test.ts` returns ≥ 2 matches (controller + worker contracts)
    - jest exits non-zero (RED)
    - Commit message starts with `test(03-03):`
  </acceptance_criteria>
  <done>5 contracts RED committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement test render route + controller + repo + worker hook → GREEN</name>
  <files>central-server/src/validation/schemas.ts, central-server/src/repositories/template-studio.repository.ts, central-server/src/controllers/remotion-templates.controller.ts, central-server/src/routes/remotion-templates.routes.ts, central-server/src/services/remotion-render-worker.service.ts</files>
  <read_first>
    - central-server/src/repositories/remotion-render-job.repository.ts (full file — create() signature)
    - central-server/src/services/remotion-render-worker.service.ts (entire file — locate render success branch + upload path)
    - central-server/src/repositories/template-studio.repository.ts (existing methods + getClient pattern for transactions, locate where to add updateTestRenderTracking)
    - central-server/src/validation/schemas.ts (Joi schema export pattern)
    - central-server/src/routes/remotion-templates.routes.ts (Phase 1 deviation : library routes mounted before /:id, add /:id/test-render alongside)
    - central-server/src/controllers/remotion-templates.controller.ts (existing controllers as model — alpha gate, duplicate handler — for AuthRequest + Winston pattern)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts (PREVIEW_FIXTURES — mirror structure server-side)
  </read_first>
  <behavior>
    - POST /:id/test-render : super_admin only. No body. Returns 202 `{ jobId, templateId, status: 'queued' }`.
    - Server-side, controller :
      1. Loads template via `templateStudioRepository.getStudioView(id)` (404 if missing).
      2. Builds `props = { ...TEST_RENDER_FIXTURES, ...computeDefaultsFromOptions(template) }` (defaults : pour chaque option, prendre `default_value` si présent sinon `values[0]`).
      3. Calls `remotionRenderJobRepository.create({ template_id: id, props, title: \`test-render:${id}:${Date.now()}\`, requested_by: req.user.id, requested_for_site_id: null })`.
      4. Calls `templateStudioRepository.updateTestRenderTracking(id, { status: 'queued', at: new Date() })`.
      5. Returns 202 with jobId.
    - Worker (`remotion-render-worker.service.ts`) extension :
      - Before render : if `job.title.startsWith('test-render:')`, set `templateStudioRepository.updateTestRenderTracking(templateId, { status: 'rendering' })`.
      - On render success : if test-render, upload to FTP path `/test-renders/${templateId}/${Date.now()}.mp4` (instead of standard videos location), then `updateTestRenderTracking(templateId, { status: 'success', url: ftpUrl, at: new Date() })`.
      - On render failure : if test-render, `updateTestRenderTracking(templateId, { status: 'failed', at: new Date() })`. Log Winston `error` with `{ templateId, jobId, error }`.
    - Repository : single UPDATE statement, parameterized.
  </behavior>
  <action>
    1. Repository — add to `template-studio.repository.ts` :
    ```typescript
    async updateTestRenderTracking(
      templateId: string,
      patch: { status: 'queued'|'rendering'|'success'|'failed'; url?: string; at?: Date }
    ): Promise<void> {
      const sets: string[] = ['test_render_status = $2'];
      const params: unknown[] = [templateId, patch.status];
      let idx = 3;
      if (patch.url !== undefined) { sets.push(`test_render_url = $${idx++}`); params.push(patch.url); }
      if (patch.at !== undefined) { sets.push(`test_render_at = $${idx++}`); params.push(patch.at); }
      await query(`UPDATE templates SET ${sets.join(', ')} WHERE id = $1`, params);
    }
    ```

    2. Joi schema — append to `central-server/src/validation/schemas.ts` :
    ```typescript
    export const testRenderSchemas = {
      params: Joi.object({ id: Joi.string().uuid().required() }),
    };
    ```

    3. Controller — add to `remotion-templates.controller.ts` :
    ```typescript
    const TEST_RENDER_FIXTURES = {
      player_first_name: 'PRÉNOM',
      player_last_name: 'NOM',
      club_name: 'NOM DU CLUB',
      player_photo_url: 'https://placehold.co/600x800?text=PHOTO',
      club_logo_url: 'https://placehold.co/200x200?text=LOGO',
    };

    export const createTestRender = async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const view = await templateStudioRepository.getStudioView(id);
        if (!view) return res.status(404).json({ error: 'template_not_found' });
        const optionDefaults: Record<string, string|boolean> = {};
        for (const opt of view.options ?? []) {
          optionDefaults[opt.key] = opt.default_value ?? opt.values?.[0] ?? '';
        }
        const props = { ...TEST_RENDER_FIXTURES, ...optionDefaults };
        const job = await remotionRenderJobRepository.create({
          template_id: id,
          props,
          title: `test-render:${id}:${Date.now()}`,
          requested_by: req.user?.id ?? null,
          requested_for_site_id: null,
        });
        await templateStudioRepository.updateTestRenderTracking(id, { status: 'queued', at: new Date() });
        logger.info('Test render enqueued', { templateId: id, jobId: job.id, actor: req.user?.id });
        res.status(202).json({ jobId: job.id, templateId: id, status: 'queued' });
      } catch (error) {
        logger.error('Create test render error', { error, templateId: req.params.id });
        res.status(500).json({ error: 'internal_error' });
      }
    };
    ```

    4. Route — add in `central-server/src/routes/remotion-templates.routes.ts` (BEFORE the catch-all `/:id` GET, like library routes Phase 1) :
    ```typescript
    router.post('/:id/test-render',
      requireSuperAdmin,
      validate(testRenderSchemas.params, 'params'),
      remotionTemplatesController.createTestRender);
    ```

    5. Worker hook — in `central-server/src/services/remotion-render-worker.service.ts`, locate the render success branch and add :
    ```typescript
    const isTestRender = job.title.startsWith('test-render:');
    // BEFORE bundle/render :
    if (isTestRender) {
      await templateStudioRepository.updateTestRenderTracking(job.template_id, { status: 'rendering' });
    }
    // AFTER successful upload :
    if (isTestRender) {
      const testFtpPath = `/test-renders/${job.template_id}/${Date.now()}.mp4`;
      // … re-upload OR rename uploaded artifact to testFtpPath via storage.service / ftp-storage
      await templateStudioRepository.updateTestRenderTracking(job.template_id, {
        status: 'success', url: publicUrl, at: new Date(),
      });
      logger.info('Test render success', { templateId: job.template_id, url: publicUrl });
      return; // skip standard video DB insert for test renders
    }
    // ON CATCH :
    if (isTestRender) {
      await templateStudioRepository.updateTestRenderTracking(job.template_id, { status: 'failed', at: new Date() });
      logger.error('Test render failed', { templateId: job.template_id, jobId: job.id, error: err });
    }
    ```
    (Adapter à l'API exacte du worker existant — lire le fichier d'abord et placer les hooks aux bons endroits.)

    6. Run `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render\b' --no-coverage --forceExit` → DOIT être GREEN.
    7. `cd central-server && npx tsc --noEmit` → clean.
    8. `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → no regression.
    9. Commit : `feat(03-03): test render endpoint + worker hook + tracking`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render\b' --no-coverage --forceExit && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "router.post.*'/:id/test-render'" central-server/src/routes/remotion-templates.routes.ts` returns match
    - `grep "export const createTestRender" central-server/src/controllers/remotion-templates.controller.ts` returns match
    - `grep "test-render:" central-server/src/controllers/remotion-templates.controller.ts` returns match
    - `grep "async updateTestRenderTracking" central-server/src/repositories/template-studio.repository.ts` returns match
    - `grep "/test-renders/" central-server/src/services/remotion-render-worker.service.ts` returns match
    - `grep "console.log" central-server/src/{controllers/remotion-templates,services/remotion-render-worker,repositories/template-studio}.{ts,service.ts}` returns 0
    - `grep -E "import.*config/database" central-server/src/controllers/remotion-templates.controller.ts` returns 0 (repo pattern)
    - jest smoke-template-studio-v3-test-render exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>RED → GREEN ; route + controller + repo + worker hook wired ; tsc clean ; no v3 regression.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → all suites GREEN
- `cd central-server && npx tsc --noEmit` → clean
- `npm run test:smoke:smart` → no regression
</verification>

<success_criteria>

- POST /api/remotion-templates/:id/test-render renvoie 202 + jobId
- Job réutilise `remotion_render_jobs` (ADR-054/055) avec discriminateur `title: 'test-render:'`
- FTP upload vers `/test-renders/{templateId}/{timestamp}.mp4`
- `templates.test_render_status` UPDATE à chaque transition (queued → rendering → success|failed)
- Smoke `smoke-template-studio-v3-test-render` GREEN avec 5 contracts
- 0 `query()` direct dans controller, 0 `console.log`, Joi validation présente
- PUB-02 backend prêt pour Plan 04
  </success_criteria>

<output>
After completion, create `.planning/phases/03-gate-publication/03-gate-publication-03-SUMMARY.md`
</output>
