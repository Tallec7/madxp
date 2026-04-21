/**
 * Smoke tests — Remotion templates domain (ADR-054 async render + ADR-055 versions).
 * File-based assertions only — no HTTP server boot.
 *
 * Protects:
 *   - Async render job contract (ADR-054) : POST /render returns 202 with a job_id,
 *     the worker + repository are wired, the stuck-job alert hook exists.
 *   - Template versions / restore (ADR-055) : trigger snapshot, admin-only
 *     PATCH/duplicate/versions/restore routes with validateParams + validate.
 *
 * Usage: npm run test:smoke (or npm run test:smoke:smart)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Remotion — async render (ADR-054)', () => {
  it('migration adds remotion_render_jobs table + trigger', () => {
    const sql = fs.readFileSync(
      path.join(centralSrc, 'scripts', 'migrations', 'add-remotion-render-jobs.sql'),
      'utf8'
    );
    expect(sql).toMatch(/CREATE\s+TABLE[\s\S]*remotion_render_jobs/i);
    // status + phase + claimed_by are the load-bearing columns
    expect(sql).toMatch(/\bstatus\b/);
    expect(sql).toMatch(/\bphase\b/);
    expect(sql).toMatch(/\bclaimed_by\b/);
  });

  it('repository exposes the atomic claim + lifecycle methods', () => {
    const repo = readFile('repositories/remotion-render-job.repository.ts');
    expect(repo).toMatch(/async\s+claimNextPending\s*\(/);
    expect(repo).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
    expect(repo).toMatch(/async\s+markCompleted\s*\(/);
    expect(repo).toMatch(/async\s+markFailed\s*\(/);
    expect(repo).toMatch(/async\s+failStaleRunningJobs\s*\(/);
    expect(repo).toContain(
      'export const remotionRenderJobRepository = new RemotionRenderJobRepository()'
    );
  });

  it('render worker exports start/stop and self-heals stale jobs on boot', () => {
    const worker = readFile('services/remotion-render-worker.service.ts');
    expect(worker).toMatch(/export\s+function\s+startRenderWorker\s*\(/);
    expect(worker).toMatch(/export\s+function\s+stopRenderWorker\s*\(/);
    // Stale-job recovery is the safety net if the process dies mid-render
    expect(worker).toMatch(/failStaleRunningJobs\s*\(/);
  });

  it('server.ts starts the render worker and stops it on shutdown', () => {
    const server = readFile('server.ts');
    expect(server).toMatch(/startRenderWorker\s*\(/);
    expect(server).toMatch(/stopRenderWorker\s*\(/);
  });

  it('controller enqueues the render (202 + job_id) instead of rendering synchronously', () => {
    const ctrl = readFile('controllers/remotion-templates.controller.ts');
    // Must NOT import remotion/renderer directly in the controller anymore
    expect(ctrl).not.toMatch(/from\s+['"]@remotion\/renderer['"]/);
    // Must use the repository to enqueue and respond with 202
    expect(ctrl).toMatch(/remotionRenderJobRepository/);
    expect(ctrl).toMatch(/\.status\(202\)/);
    // Must expose a job polling endpoint
    expect(ctrl).toMatch(/export\s+const\s+getRenderJob\b/);
  });

  it('routes declare GET /render-jobs/:jobId with auth + param validation', () => {
    const routes = readFile('routes/remotion-templates.routes.ts');
    expect(routes).toMatch(/render-jobs\/:jobId/);
    expect(routes).toMatch(/validateParams\s*\(\s*paramSchemas\.jobId/);
  });

  it('paramSchemas.jobId exists in validation middleware', () => {
    const validation = readFile('middleware/validation.ts');
    expect(validation).toMatch(/jobId:\s*Joi\./);
  });

  it('alerting monitors stuck render jobs (ADR-054 supervision)', () => {
    const types = readFile('services/alerting.types.ts');
    expect(types).toMatch(/render_job_stuck_minutes/);
    expect(types).toMatch(/render_job_failure_rate_1h/);

    const checks = readFile('services/alerting-checks.service.ts');
    expect(checks).toMatch(/checkStuckRenderJobs\s*\(/);
    expect(checks).toMatch(/remotion_render_jobs/);

    const service = readFile('services/alerting.service.ts');
    // Must be wired into the periodic loop, not just declared
    expect(service).toMatch(/checkStuckRenderJobs\s*\(/);
  });
});

describe('Remotion — template versions (ADR-055)', () => {
  it('migration creates neopro_template_versions with AFTER INSERT/UPDATE trigger', () => {
    const sql = fs.readFileSync(
      path.join(centralSrc, 'scripts', 'migrations', 'add-remotion-template-versions.sql'),
      'utf8'
    );
    expect(sql).toMatch(/CREATE\s+TABLE[\s\S]*neopro_template_versions/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_neopro_templates_snapshot/i);
    expect(sql).toMatch(/AFTER\s+INSERT\s+OR\s+UPDATE/i);
    // Backfill ensures existing templates have an initial version
    expect(sql).toMatch(/INSERT\s+INTO\s+neopro_template_versions/i);
  });

  it('repository exposes update/duplicate + dedicated versions repo', () => {
    const repo = readFile('repositories/remotion-templates.repository.ts');
    expect(repo).toMatch(/async\s+update\s*\(/);
    expect(repo).toMatch(/async\s+duplicate\s*\(/);
    expect(repo).toMatch(/class\s+RemotionTemplateVersionsRepository/);
    expect(repo).toMatch(/listByTemplate\s*\(/);
    expect(repo).toContain('export const remotionTemplateVersionsRepository');
  });

  it('controller exposes update/duplicate/listVersions/restoreVersion with admin ownership', () => {
    const ctrl = readFile('controllers/remotion-templates.controller.ts');
    expect(ctrl).toMatch(/export\s+const\s+updateTemplate\b/);
    expect(ctrl).toMatch(/export\s+const\s+duplicateTemplate\b/);
    expect(ctrl).toMatch(/export\s+const\s+listTemplateVersions\b/);
    expect(ctrl).toMatch(/export\s+const\s+restoreTemplateVersion\b/);
    // Restore must verify that the version belongs to the template (guard against cross-template replay)
    expect(ctrl).toMatch(/template_id/);
  });

  it('routes require admin role + validateParams + validate on all 4 admin endpoints', () => {
    const routes = readFile('routes/remotion-templates.routes.ts');

    // PATCH /:id
    expect(routes).toMatch(/router\.patch\s*\(\s*['"]\/:id['"]/);
    expect(routes).toMatch(/templateUpdateSchema/);

    // POST /:id/duplicate
    expect(routes).toMatch(/router\.post\s*\(\s*['"]\/:id\/duplicate['"]/);

    // GET /:id/versions
    expect(routes).toMatch(/router\.get\s*\(\s*['"]\/:id\/versions['"]/);

    // POST /:id/versions/:versionId/restore
    expect(routes).toMatch(/\/:id\/versions\/:versionId\/restore/);

    // All admin routes must go through an admin-role guard (requireRole or requireAdmin)
    expect(routes).toMatch(/require(Role|Admin)/);
  });

  it('validation middleware declares templateUpdateSchema + templateDuplicate', () => {
    const validation = readFile('middleware/validation.ts');
    expect(validation).toMatch(/templateUpdateSchema/);
    expect(validation).toMatch(/templateDuplicate/);
  });
});

describe('Remotion — preview stutter/console-spam guards (ADR-052 §5)', () => {
  const previewApp = fs.readFileSync(
    path.join(repoRoot, 'templates-remotion', 'preview', 'src', 'app.tsx'),
    'utf8'
  );
  const maskCanvas = fs.readFileSync(
    path.join(repoRoot, 'templates-remotion', 'src', 'mask-canvas.tsx'),
    'utf8'
  );
  const butSimple = fs.readFileSync(
    path.join(repoRoot, 'templates-remotion', 'src', 'ButSimple.tsx'),
    'utf8'
  );
  const butImgJoueur = fs.readFileSync(
    path.join(repoRoot, 'templates-remotion', 'src', 'ButImgJoueur.tsx'),
    'utf8'
  );

  it('canvas-based masking replaces CSS mask-image on text/image layers', () => {
    // CSS `mask-image: url(frameXXXX.png)` qui change 30 fois/sec invalide
    // le cache raster du compositeur → flash visible sur le preview (club
    // self-service, ADR-037). MaskedCanvas composite tout en un raster par frame.
    expect(maskCanvas).toMatch(/export const MaskedCanvas/);
    expect(maskCanvas).toMatch(/globalCompositeOperation\s*=\s*['"]destination-in['"]/);
    expect(butSimple).toMatch(/<MaskedCanvas\b/);
    expect(butImgJoueur).toMatch(/<MaskedCanvas\b/);
    // Les anciens <div style={luminanceMask(...)}> ne doivent pas revenir
    expect(butSimple).not.toMatch(/luminanceMask\s*\(/);
    expect(butImgJoueur).not.toMatch(/luminanceMask\s*\(/);
  });

  it('mask frames + fonts are preloaded via delayRender gates (SSR parity)', () => {
    // useMaskFrames + useFontsReady bloquent delayRender → le render MP4 headless
    // Chromium attend que tous les PNGs et @font-face soient prêts avant capture.
    expect(maskCanvas).toMatch(/useMaskFrames/);
    expect(maskCanvas).toMatch(/useFontsReady/);
    expect(maskCanvas).toMatch(/delayRender\s*\(/);
    expect(maskCanvas).toMatch(/continueRender\s*\(/);
    expect(butSimple).toMatch(/fontsReady\s*&&/);
    expect(butImgJoueur).toMatch(/fontsReady\s*&&/);
  });

  it('console.error filter swallows AbortError spam from video-only power-save', () => {
    // Chrome met en pause power-save les <video> sans piste audio, même avec
    // initiallyMuted + allow="autoplay" — chaque OffthreadVideo empilé spam.
    // Filtre cosmétique, la lecture n'est pas affectée.
    expect(previewApp).toMatch(/console\.error\s*=/);
    expect(previewApp).toMatch(/Could not play video/);
  });

  it('Player stays mounted with initiallyMuted (regression guard)', () => {
    expect(previewApp).toMatch(/initiallyMuted/);
  });
});

describe('Remotion — ADR docs exist', () => {
  it('ADR-054 (async render) and ADR-055 (versions) are checked in', () => {
    const adrDir = path.join(repoRoot, 'docs', 'adr');
    expect(fs.existsSync(path.join(adrDir, 'ADR-054-async-remotion-render-jobs.md'))).toBe(true);
    expect(fs.existsSync(path.join(adrDir, 'ADR-055-remotion-template-versions.md'))).toBe(true);

    const readme = fs.readFileSync(path.join(adrDir, 'README.md'), 'utf8');
    expect(readme).toMatch(/ADR-054/);
    expect(readme).toMatch(/ADR-055/);
  });
});

describe('Template Studio v2 (ADR-075)', () => {
  const migration = readFile('scripts/migrations/add-template-studio-v2.sql');
  const types = readFile('types/template-studio.types.ts');
  const repo = readFile('repositories/template-studio.repository.ts');
  const reposIndex = readFile('repositories/index.ts');
  const controller = readFile('controllers/template-studio.controller.ts');
  const routes = readFile('routes/template-studio.routes.ts');
  const validation = readFile('middleware/validation.ts');
  const server = readFile('server.ts');
  const runtime = fs.readFileSync(path.join(repoRoot, 'templates-remotion/src/runtime/TemplateRuntime.tsx'), 'utf8');
  const animations = fs.readFileSync(path.join(repoRoot, 'templates-remotion/src/runtime/animations.ts'), 'utf8');
  const root = fs.readFileSync(path.join(repoRoot, 'templates-remotion/src/Root.tsx'), 'utf8');

  it('migration extends neopro_templates and creates 4 studio tables', () => {
    expect(migration).toMatch(/ALTER TABLE neopro_templates/);
    expect(migration).toMatch(/schema_version/);
    expect(migration).toMatch(/duration_seconds/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS template_variants/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS template_layers/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS template_text_fields/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS template_image_slots/);
    expect(migration).toMatch(/UNIQUE \(template_id, slot_key\)/);
  });

  it('types file declares Row types extending QueryResultRow', () => {
    expect(types).toMatch(/QueryResultRow/);
    expect(types).toMatch(/TemplateVariantRow[^;]*QueryResultRow/);
    expect(types).toMatch(/TemplateLayerRow[^;]*QueryResultRow/);
    expect(types).toMatch(/TemplateTextFieldRow[^;]*QueryResultRow/);
    expect(types).toMatch(/TemplateImageSlotRow[^;]*QueryResultRow/);
    expect(types).toMatch(/AnimationPreset/);
  });

  it('repository exposes findV2ById + CRUD for 4 resource types', () => {
    expect(repo).toMatch(/async findV2ById\(/);
    expect(repo).toMatch(/async listVariants\(/);
    expect(repo).toMatch(/async createVariant\(/);
    expect(repo).toMatch(/async updateVariant\(/);
    expect(repo).toMatch(/async deleteVariant\(/);
    expect(repo).toMatch(/async listLayers\(/);
    expect(repo).toMatch(/async createLayer\(/);
    expect(repo).toMatch(/async updateLayer\(/);
    expect(repo).toMatch(/async deleteLayer\(/);
    expect(repo).toMatch(/async listTextFields\(/);
    expect(repo).toMatch(/async createTextField\(/);
    expect(repo).toMatch(/async updateTextField\(/);
    expect(repo).toMatch(/async deleteTextField\(/);
    expect(repo).toMatch(/async listImageSlots\(/);
    expect(repo).toMatch(/async createImageSlot\(/);
    expect(repo).toMatch(/async updateImageSlot\(/);
    expect(repo).toMatch(/async deleteImageSlot\(/);
  });

  it('repositories/index.ts exports templateStudioRepository', () => {
    expect(reposIndex).toMatch(/templateStudioRepository/);
  });

  it('controller exports studio view + 12 CRUD handlers', () => {
    expect(controller).toMatch(/export const getStudioView/);
    for (const fn of [
      'listVariants', 'createVariant', 'updateVariant', 'deleteVariant',
      'listLayers', 'createLayer', 'updateLayer', 'deleteLayer',
      'listTextFields', 'createTextField', 'updateTextField', 'deleteTextField',
      'listImageSlots', 'createImageSlot', 'updateImageSlot', 'deleteImageSlot',
    ]) {
      expect(controller).toMatch(new RegExp(`export const ${fn}`));
    }
    // Unique slot_key → 409
    expect(controller).toMatch(/23505/);
  });

  it('routes gate every endpoint with super_admin + validate + validateParams', () => {
    expect(routes).toMatch(/requireRole\('super_admin'\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.id\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndVariantId\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndLayerId\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndFieldId\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndSlotId\)/);
    expect(routes).toMatch(/validate\(schemas\.templateStudioVariantCreate\)/);
    expect(routes).toMatch(/validate\(schemas\.templateStudioLayerCreate\)/);
    expect(routes).toMatch(/validate\(schemas\.templateStudioTextFieldCreate\)/);
    expect(routes).toMatch(/validate\(schemas\.templateStudioImageSlotCreate\)/);
  });

  it('validation.ts declares all 8 studio schemas + 4 compound param schemas', () => {
    for (const s of [
      'templateStudioVariantCreate', 'templateStudioVariantUpdate',
      'templateStudioLayerCreate', 'templateStudioLayerUpdate',
      'templateStudioTextFieldCreate', 'templateStudioTextFieldUpdate',
      'templateStudioImageSlotCreate', 'templateStudioImageSlotUpdate',
    ]) {
      expect(validation).toMatch(new RegExp(s + '\\s*:'));
    }
    for (const p of ['idAndVariantId', 'idAndLayerId', 'idAndFieldId', 'idAndSlotId']) {
      expect(validation).toMatch(new RegExp(p + '\\s*:'));
    }
  });

  it('server.ts mounts templateStudioRoutes before legacy remotion-templates', () => {
    expect(server).toMatch(/templateStudioRoutes/);
    const studioIdx = server.indexOf('templateStudioRoutes');
    const legacyIdx = server.indexOf('remotionTemplatesRoutes');
    expect(studioIdx).toBeGreaterThan(-1);
    expect(legacyIdx).toBeGreaterThan(-1);
    // Mount order: studio must be registered before legacy for sub-resources.
    const studioMount = server.indexOf("app.use('/api/remotion-templates', templateStudioRoutes");
    const legacyMount = server.indexOf("app.use('/api/remotion-templates', sensitiveRateLimit, remotionTemplatesRoutes");
    expect(studioMount).toBeGreaterThan(-1);
    expect(legacyMount).toBeGreaterThan(-1);
    expect(studioMount).toBeLessThan(legacyMount);
  });

  it('TemplateRuntime + animations exist with 6 presets', () => {
    expect(runtime).toMatch(/TemplateRuntime/);
    expect(runtime).toMatch(/OffthreadVideo/);
    expect(runtime).toMatch(/AbsoluteFill/);
    expect(animations).toMatch(/computeAnimation/);
    for (const p of ['fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in']) {
      expect(animations).toContain(`'${p}'`);
    }
    expect(animations).toMatch(/spring\(/);
  });

  it('Root.tsx registers TemplateRuntime composition', () => {
    expect(root).toMatch(/id="TemplateRuntime"/);
    expect(root).toMatch(/component=\{TemplateRuntime\}/);
  });

  it('controller records Prometheus supervision metrics on every endpoint', () => {
    const metrics = readFile('services/metrics.service.ts');
    expect(metrics).toMatch(/neopro_template_studio_operations_total/);
    expect(metrics).toMatch(/recordTemplateStudioOperation\(/);
    // Every status path (success, not_found, conflict, error) must be wired.
    expect(controller).toMatch(/record\(/);
    expect(controller).toMatch(/metricsService/);
    for (const status of ['success', 'not_found', 'conflict', 'error']) {
      expect(controller).toContain(`'${status}'`);
    }
  });
});

describe('Template Studio v2 — user image uploads (ADR-077)', () => {
  const upload = readFile('middleware/upload.ts');
  const rateLimit = readFile('middleware/user-rate-limit.ts');
  const validation = readFile('middleware/validation.ts');
  const controller = readFile('controllers/remotion-templates.controller.ts');
  const routes = readFile('routes/remotion-templates.routes.ts');

  it('multer config uploadUserTemplateImage filters image/* with 10MB cap', () => {
    expect(upload).toMatch(/uploadUserTemplateImage/);
    expect(upload).toMatch(/image\/jpeg/);
    expect(upload).toMatch(/image\/png/);
    expect(upload).toMatch(/image\/webp/);
    // 10 MB limit per ADR-077
    expect(upload).toMatch(/10\s*\*\s*1024\s*\*\s*1024/);
  });

  it('templateUserUploadRateLimit caps to 20/hour', () => {
    expect(rateLimit).toMatch(/templateUserUploadRateLimit/);
    expect(rateLimit).toMatch(/60\s*\*\s*60\s*\*\s*1000/);
    expect(rateLimit).toMatch(/template-user-upload/);
  });

  it('templateUserUploadBody Joi schema validates slot_key', () => {
    expect(validation).toMatch(/templateUserUploadBody/);
    expect(validation).toMatch(/slot_key/);
  });

  it('controller exposes uploadUserImageAsset with audit log', () => {
    expect(controller).toMatch(/export const uploadUserImageAsset\b/);
    expect(controller).toMatch(/template_user_image_uploaded/);
    // FTP namespacing per ADR-077: template-assets/user-uploads/{siteId}/{userId}/
    expect(controller).toMatch(/template-assets\/user-uploads/);
  });

  it('routes expose POST /:id/user-uploads open to club/operator/admin/super_admin', () => {
    expect(routes).toMatch(/router\.post\(\s*['"]\/:id\/user-uploads['"]/);
    expect(routes).toMatch(/templateUserUploadRateLimit/);
    expect(routes).toMatch(/uploadUserTemplateImage\.single\(['"]file['"]\)/);
    expect(routes).toMatch(/validate\(schemas\.templateUserUploadBody\)/);
    // Must be open to all authenticated roles (ADR-077), not super_admin-only
    const routeBlock = routes.slice(routes.indexOf("/:id/user-uploads"));
    expect(routeBlock.slice(0, 500)).toMatch(/requireRole\([^)]*['"]club['"]/);
  });

  it('ADR-077 doc is checked in and listed in README', () => {
    const adrDir = path.join(repoRoot, 'docs', 'adr');
    expect(
      fs.existsSync(path.join(adrDir, 'ADR-077-template-studio-preview-and-uploads.md'))
    ).toBe(true);
    const readme = fs.readFileSync(path.join(adrDir, 'README.md'), 'utf8');
    expect(readme).toMatch(/ADR-077/);
  });
});

describe('Template Studio v2 — dashboard wiring (ADR-075 / ADR-077)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const studioDir = path.join(
    dashRoot,
    'src/app/features/content/remotion-templates',
  );

  function readDash(rel: string): string {
    return fs.readFileSync(path.join(dashRoot, rel), 'utf8');
  }

  it('data service exposes getStudioView + enqueueRenderV2 + uploadUserImage', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/getStudioView\s*\(/);
    expect(svc).toMatch(/enqueueRenderV2\s*\(/);
    expect(svc).toMatch(/uploadUserImage\s*\(/);
    expect(svc).toMatch(/\/remotion-templates\/\$\{templateId\}\/studio/);
    expect(svc).toMatch(/\/remotion-templates\/\$\{templateId\}\/user-uploads/);
  });

  it('types file declares studio v2 contracts + isV2Template helper', () => {
    const types = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.types.ts',
    );
    expect(types).toMatch(/interface TemplateStudioView\b/);
    expect(types).toMatch(/interface RenderTemplateRequestV2\b/);
    expect(types).toMatch(/export function isV2Template\b/);
  });

  it('StudioV2EditorComponent declares @Input view + payloadChange + readyChange', () => {
    const p = path.join(studioDir, 'studio-v2', 'studio-v2-editor.component.ts');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/@Input\(\s*\{\s*required:\s*true\s*\}\s*\)\s+view!:\s*TemplateStudioView/);
    expect(src).toMatch(
      /@Output\(\)\s+payloadChange\s*=\s*new\s+EventEmitter<RenderTemplateRequestV2>/,
    );
    expect(src).toMatch(/@Output\(\)\s+readyChange\s*=\s*new\s+EventEmitter<boolean>/);
    expect(src).toMatch(/uploadUserImage\(/);
  });

  it('TemplateStudioPlayerComponent bridges React via createRoot + @remotion/player', () => {
    const p = path.join(studioDir, 'studio-player', 'template-studio-player.component.ts');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/from ['"]react-dom\/client['"]/);
    expect(src).toMatch(/from ['"]@remotion\/player['"]/);
    expect(src).toMatch(/createRoot\(/);
    expect(src).toMatch(/this\.root\.unmount\(\)/);
    expect(fs.existsSync(path.join(studioDir, 'studio-player', 'template-runtime.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(studioDir, 'studio-player', 'animations.ts'))).toBe(true);
  });

  it('orchestrator imports StudioV2EditorComponent and branches on isV2Template', () => {
    const ts = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(ts).toMatch(/StudioV2EditorComponent/);
    expect(ts).toMatch(/isV2Template\(/);
    expect(ts).toMatch(/enqueueRenderV2\(/);
    expect(ts).toMatch(/getStudioView\(/);
    const html = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toMatch(/<app-studio-v2-editor/);
    expect(html).toMatch(/\[class\.render-panel-body--v2\]="isV2"/);
  });

  it('dashboard Karma specs for v2 editor + studio player are checked in', () => {
    expect(
      fs.existsSync(path.join(studioDir, 'studio-v2', 'studio-v2-editor.component.spec.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(studioDir, 'studio-player', 'template-studio-player.component.spec.ts'),
      ),
    ).toBe(true);
  });

  it('tsconfig enables jsx:react-jsx and package.json declares react + @remotion/player', () => {
    const tsconfig = JSON.parse(readDash('tsconfig.json'));
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    const pkg = JSON.parse(readDash('package.json'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(deps['react']).toBeTruthy();
    expect(deps['react-dom']).toBeTruthy();
    expect(deps['@remotion/player']).toBeTruthy();
  });
});

describe('Template Studio v2 — Sprint 4 migration + permissions (ADR-075)', () => {
  it('legacy shadow-seed migration exists for ButSimple/ButImgJoueur', () => {
    const p = path.join(
      centralSrc,
      'scripts',
      'migrations',
      'seed-but-simple-but-img-joueur-v2-shadow.sql',
    );
    expect(fs.existsSync(p)).toBe(true);
    const sql = fs.readFileSync(p, 'utf8');
    // Targets both legacy composition_ids
    expect(sql).toMatch(/composition_id\s*=\s*'ButSimple'/);
    expect(sql).toMatch(/composition_id\s*=\s*'ButImgJoueur'/);
    // Touches the 3 V2 tables
    expect(sql).toMatch(/INSERT INTO template_variants/);
    expect(sql).toMatch(/INSERT INTO template_text_fields/);
    expect(sql).toMatch(/INSERT INTO template_image_slots/);
    // Idempotent (ON CONFLICT or NOT EXISTS guards)
    expect(sql).toMatch(/ON CONFLICT/);
    expect(sql).toMatch(/NOT EXISTS/);
    // Does NOT flip schema_version=2 automatically (safety — manual opt-in).
    // Strip SQL line-comments before asserting so the documented manual flip
    // command in the header comment doesn't trigger a false positive.
    const sqlNoComments = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(sqlNoComments).not.toMatch(/UPDATE\s+neopro_templates\s+SET\s+schema_version\s*=\s*2/);
  });

  it('permission test covers all studio routes × non-super_admin roles', () => {
    const p = path.join(centralSrc, '__tests__', 'template-studio.permissions.test.ts');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    // Routes (reads + writes)
    expect(src).toMatch(/\/studio/);
    expect(src).toMatch(/\/variants/);
    expect(src).toMatch(/\/layers/);
    expect(src).toMatch(/\/text-fields/);
    expect(src).toMatch(/\/image-slots/);
    // All non-super_admin roles are exercised
    for (const role of ['admin', 'operator', 'club', 'viewer']) {
      expect(src).toContain(`'${role}'`);
    }
    // 401 when no token, 403 for non-super_admin, super_admin passes auth
    expect(src).toMatch(/toBe\(401\)/);
    expect(src).toMatch(/toBe\(403\)/);
    expect(src).toMatch(/super_admin/);
    expect(src).toMatch(/not\.toBe\(403\)/);
  });
});

describe('Template Studio v2 — Legacy v2 URL backfill migration (ADR-075 PR #538)', () => {
  const migrationPath = path.join(
    centralSrc,
    'scripts',
    'migrations',
    'backfill-legacy-templates-v2-urls.sql',
  );

  it('backfill migration exists and seeds both legacy templates', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    // Cible les 2 composition_id legacy
    expect(sql).toMatch(/composition_id\s*=\s*'ButSimple'/);
    expect(sql).toMatch(/composition_id\s*=\s*'ButImgJoueur'/);
    // Seed le background (variant) + les layers (runtime v2 exige URLs http/blob/data)
    expect(sql).toMatch(/UPDATE\s+template_variants/);
    expect(sql).toMatch(/SET\s+background_video_url/);
    expect(sql).toMatch(/INSERT\s+INTO\s+template_layers/);
    // Base URL publique FTP Hostinger (si elle bouge, casser ce test force le resync)
    expect(sql).toContain('https://kalonpartners.bzh/neopro-video/template-assets/studio/legacy');
    // Idempotence : UPDATE guardé, INSERT guardé
    expect(sql).toMatch(/background_video_url\s+IS\s+NULL\s+OR\s+background_video_url\s*=\s*''/i);
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+template_layers/i);
  });

  it('backfill migration references all 8 fragments (3 for ButSimple, 5 for ButImgJoueur)', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    for (const frag of ['BUT_simple_A', 'BUT_simple_B', 'BUT_simple_C']) {
      expect(sql).toContain(`${frag}.webm`);
    }
    for (const frag of [
      'BUT_img_joueur_A',
      'BUT_img_joueur_B',
      'BUT_img_joueur_C',
      'BUT_img_joueur_D',
      'BUT_img_joueur_E',
    ]) {
      expect(sql).toContain(`${frag}.webm`);
    }
  });

  it('TemplateRuntime v2 keeps isValidSrc guard (prevents preview regression)', () => {
    // Si ce guard disparaît, les URLs vides ne sont plus skip → OffthreadVideo
    // plante sur src="" et on retombe sur un preview cassé/console-spam.
    const runtimePath = path.join(
      repoRoot,
      'templates-remotion',
      'src',
      'runtime',
      'TemplateRuntime.tsx',
    );
    const src = fs.readFileSync(runtimePath, 'utf8');
    expect(src).toMatch(/isValidSrc/);
    expect(src).toMatch(/\/\^\(https\?:\|blob:\|data:\)\//);
    // Le guard doit être appliqué au background ET aux layers
    expect(src).toMatch(/bgSrc\s*=\s*isValidSrc/);
    expect(src).toMatch(/layerSrc\s*=\s*isValidSrc/);
  });
});

describe('Template Studio v2 — Sprint 3 admin dashboard (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const studioAdminDir = path.join(
    dashRoot,
    'src/app/features/content/remotion-templates/studio-v2/admin',
  );

  const readAdmin = (rel: string): string =>
    fs.readFileSync(path.join(studioAdminDir, rel), 'utf8');

  const readDashFile = (rel: string): string =>
    fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('data service exposes admin CRUD for variants/layers/textFields/imageSlots', () => {
    const svc = readDashFile(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    // Variants
    expect(svc).toMatch(/createVariant\(/);
    expect(svc).toMatch(/updateVariant\(/);
    expect(svc).toMatch(/deleteVariant\(/);
    // Layers
    expect(svc).toMatch(/createLayer\(/);
    expect(svc).toMatch(/updateLayer\(/);
    expect(svc).toMatch(/deleteLayer\(/);
    // Text fields
    expect(svc).toMatch(/createTextField\(/);
    expect(svc).toMatch(/updateTextField\(/);
    expect(svc).toMatch(/deleteTextField\(/);
    // Image slots
    expect(svc).toMatch(/createImageSlot\(/);
    expect(svc).toMatch(/updateImageSlot\(/);
    expect(svc).toMatch(/deleteImageSlot\(/);
    // Template creation
    expect(svc).toMatch(/createTemplate\(/);
  });

  it('orchestrator gates studio admin mode behind isSuperAdmin', () => {
    const cmp = readDashFile(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(cmp).toContain('isSuperAdmin');
    expect(cmp).toContain('studioAdminMode');
    expect(cmp).toContain('toggleStudioAdminMode');
    // The toggle must refuse for non-super_admin
    expect(cmp).toMatch(/if\s*\(\s*!this\.isSuperAdmin\s*\)\s*return/);
  });

  it('admin panels + wizard are declared as standalone components', () => {
    const fieldEditor = readAdmin('admin-field-editor.component.ts');
    expect(fieldEditor).toContain('standalone: true');
    expect(fieldEditor).toMatch(/@Input.*field/);
    expect(fieldEditor).toMatch(/@Output.*patch/);

    const variants = readAdmin('admin-variants-panel.component.ts');
    expect(variants).toContain('standalone: true');
    expect(variants).toMatch(/@Output.*create/);
    expect(variants).toMatch(/@Output.*delete/);

    const layers = readAdmin('admin-layers-panel.component.ts');
    expect(layers).toContain('standalone: true');
    expect(layers).toMatch(/@Output.*create/);

    const studioPanel = readAdmin('admin-studio-panel.component.ts');
    expect(studioPanel).toContain('AdminFieldEditorComponent');
    expect(studioPanel).toContain('AdminVariantsPanelComponent');
    expect(studioPanel).toContain('AdminLayersPanelComponent');

    const wizard = readAdmin('create-template-wizard.component.ts');
    expect(wizard).toContain('standalone: true');
    expect(wizard).toMatch(/WizardStep\s*=\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4/);
  });

  it('admin HTML renders toggle + wizard button behind isSuperAdmin', () => {
    const html = readDashFile(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toContain('studio-admin-toggle');
    expect(html).toContain('create-template-btn');
    expect(html).toContain('app-admin-studio-panel');
    expect(html).toContain('app-create-template-wizard');
    // Both entry points gated on isSuperAdmin
    expect(html).toMatch(/\*ngIf="isSuperAdmin"/);
  });

  it('Karma specs exist for admin components', () => {
    expect(fs.existsSync(path.join(studioAdminDir, 'admin-field-editor.component.spec.ts'))).toBe(true);
    expect(fs.existsSync(path.join(studioAdminDir, 'admin-variants-panel.component.spec.ts'))).toBe(true);
    expect(fs.existsSync(path.join(studioAdminDir, 'create-template-wizard.component.spec.ts'))).toBe(true);
  });
});

describe('Template Studio v2 — schema_version UI toggle (ADR-075)', () => {
  const readSrv = (rel: string): string => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string): string => fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('route PATCH /:id/schema-version is super_admin-only with Joi validation', () => {
    const routes = readSrv('routes/remotion-templates.routes.ts');
    expect(routes).toMatch(/['"]\/:id\/schema-version['"]/);
    // Route block must include super_admin guard + validate(templateSchemaVersionUpdate)
    const block = routes.match(/router\.patch\(\s*['"]\/:id\/schema-version['"][\s\S]*?\)\s*;/);
    expect(block).not.toBeNull();
    expect(block?.[0]).toMatch(/requireRole\(\s*['"]super_admin['"]\s*\)/);
    expect(block?.[0]).toMatch(/validate\(\s*schemas\.templateSchemaVersionUpdate\s*\)/);
    expect(block?.[0]).toMatch(/sensitiveRateLimit/);
  });

  it('Joi schema rejects values outside {1, 2}', () => {
    const v = readSrv('middleware/validation.ts');
    expect(v).toMatch(/templateSchemaVersionUpdate\s*:\s*Joi\.object/);
    // schema_version must be Joi.number().valid(1, 2).required()
    expect(v).toMatch(/schema_version\s*:\s*Joi\.number\(\)\.valid\(\s*1\s*,\s*2\s*\)\.required\(\)/);
  });

  it('controller guards v2 flip with shadow-data count check (409)', () => {
    const ctl = readSrv('controllers/remotion-templates.controller.ts');
    expect(ctl).toMatch(/setTemplateSchemaVersion/);
    expect(ctl).toMatch(/countStudioShadowData/);
    expect(ctl).toMatch(/status\(409\)/);
    expect(ctl).toMatch(/recordTemplateStudioOperation/);
  });

  it('repository exposes findSchemaVersion + setSchemaVersion + countStudioShadowData', () => {
    const repo = readSrv('repositories/remotion-templates.repository.ts');
    expect(repo).toMatch(/findSchemaVersion\(/);
    expect(repo).toMatch(/setSchemaVersion\(/);
    expect(repo).toMatch(/countStudioShadowData\(/);
  });

  it('dashboard data service exposes setSchemaVersion', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/setSchemaVersion\(/);
    expect(svc).toMatch(/\/schema-version/);
  });

  it('dashboard toggle UI gated on isSuperAdmin with data-testid', () => {
    const html = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toContain('schema-version-toggle');
    expect(html).toContain('toggleSchemaVersion()');
    // Gated behind isSuperAdmin
    const block = html.match(/<div[^>]*schema-version-toggle[\s\S]*?<\/div>/);
    expect(block).not.toBeNull();
    const componentTs = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(componentTs).toMatch(/toggleSchemaVersion\(\)\s*:\s*void/);
    // 409 handling hint (missing shadow data)
    expect(componentTs).toMatch(/err\?\.status === 409|status === 409/);
  });
});

describe('Template Studio V2 — site-scoped templates (ADR-075)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');

  it('repository exposes findVisibleForSite for club/operator gallery', () => {
    const repo = read('repositories/remotion-templates.repository.ts');
    expect(repo).toMatch(/async\s+findVisibleForSite\s*\(/);
    // Query must filter by site_id IS NULL (global) OR site_id = $1 (club-scoped)
    expect(repo).toMatch(/site_id\s+IS\s+NULL\s+OR\s+site_id\s*=\s*\$1/i);
  });

  it('controller branches on role to scope template list (super_admin, site user, anonymous)', () => {
    const ctl = read('controllers/remotion-templates.controller.ts');
    expect(ctl).toMatch(/findVisibleForSite/);
    expect(ctl).toMatch(/isAdmin/);
    expect(ctl).toMatch(/siteId/);
  });

  it('Joi templateCreateSchema accepts optional site_id (uuid or null)', () => {
    const v = read('middleware/validation.ts');
    expect(v).toMatch(/templateCreateSchema\s*:\s*Joi\.object/);
    // site_id must accept UUID or null
    expect(v).toMatch(/site_id\s*:\s*Joi\.string\(\)\.uuid\(\)\.allow\(\s*null\s*\)/);
  });

  it('POST / route applies validate(templateCreateSchema)', () => {
    const routes = read('routes/remotion-templates.routes.ts');
    const postBlock = routes.match(/router\.post\(\s*['"]\/['"][\s\S]*?\)\s*;/);
    expect(postBlock).not.toBeNull();
    expect(postBlock?.[0]).toMatch(/validate\(\s*schemas\.templateCreateSchema\s*\)/);
  });

  it('UpdateTemplateInput interface accepts site_id for white-glove reassignment', () => {
    const repo = read('repositories/remotion-templates.repository.ts');
    // UpdateTemplateInput must declare site_id as optional
    expect(repo).toMatch(/interface\s+UpdateTemplateInput[\s\S]*?site_id\?\s*:\s*string\s*\|\s*null/);
  });
});

describe('Template Studio V2 — Sprint 6 Premium gate + UI filter (ADR-075)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('renderTemplate enforces Premium tier + site scope when template has site_id', () => {
    const ctl = read('controllers/remotion-templates.controller.ts');
    // Must reference the feature flag used for override bypass
    expect(ctl).toMatch(/template_studio_club_scoped/);
    // Must look up the scoped site and enforce Premium tier
    expect(ctl).toMatch(/TIER_LEVEL\.premium/);
    expect(ctl).toMatch(/resolveTierLevel/);
    expect(ctl).toMatch(/hasFeatureOverride/);
    // Must reject club users whose site_id does not match
    expect(ctl).toMatch(/Template r[ée]serv[ée] [àa] un autre club/i);
    // Must return 403 when tier is insufficient
    expect(ctl).toMatch(/r[ée]serv[ée]s? au tier Premium/i);
  });

  it('dashboard FeatureGateService registers template_studio_club_scoped as premium', () => {
    const svc = readDash('src/app/core/services/feature-gate.service.ts');
    expect(svc).toMatch(/template_studio_club_scoped/);
    // The key must map to the premium tier in FEATURE_TIERS
    expect(svc).toMatch(/template_studio_club_scoped\s*:\s*['"]premium['"]/);
  });

  it('dashboard FeatureGateService registers template_studio_byo as premium (ADR-075 V3 Phase A)', () => {
    const svc = readDash('src/app/core/services/feature-gate.service.ts');
    expect(svc).toMatch(/template_studio_byo/);
    expect(svc).toMatch(/template_studio_byo\s*:\s*['"]premium['"]/);
  });

  it('dashboard remotion-templates component exposes scope filter + hasClubScopedTemplates', () => {
    const cmp = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(cmp).toMatch(/templateScopeFilter\s*:\s*['"]all['"]\s*\|\s*['"]mine['"]\s*\|\s*['"]global['"]/);
    expect(cmp).toMatch(/get\s+hasClubScopedTemplates/);
    expect(cmp).toMatch(/get\s+filteredTemplates/);
    expect(cmp).toMatch(/setTemplateScopeFilter/);
  });

  it('dashboard template gallery HTML renders segmented scope filter conditionally', () => {
    const html = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toMatch(/template-scope-filter/);
    expect(html).toMatch(/hasClubScopedTemplates/);
    expect(html).toMatch(/filteredTemplates/);
  });

  it('dashboard template-card shows Club badge when template has site_id', () => {
    const card = readDash(
      'src/app/features/content/remotion-templates/template-card.component.ts',
    );
    expect(card).toMatch(/badge-club/);
    expect(card).toMatch(/template\.site_id/);
  });

  it('club-scoping migration exists and adds nullable site_id + partial index', () => {
    const mig = read('scripts/migrations/add-template-studio-v2-club-scoping.sql');
    expect(mig).toMatch(/ADD COLUMN\s+IF NOT EXISTS\s+site_id\s+UUID\s+REFERENCES\s+sites/);
    expect(mig).toMatch(/ON DELETE CASCADE/);
    // Partial index on scoped rows only (WHERE site_id IS NOT NULL)
    expect(mig).toMatch(/CREATE INDEX\s+IF NOT EXISTS[\s\S]*WHERE\s+site_id\s+IS\s+NOT\s+NULL/i);
  });

  it('seed script exists for white-glove template demo', () => {
    const seed = read('scripts/seed-white-glove-template.ts');
    expect(seed).toMatch(/INSERT INTO\s+neopro_templates/);
    expect(seed).toMatch(/site_id/);
    // Must be idempotent (skip if already seeded)
    expect(seed).toMatch(/SELECT id FROM neopro_templates WHERE/);
  });
});

describe('Template Studio v2 — preview hardening (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('dashboard TemplateRuntime validates URL scheme before OffthreadVideo', () => {
    const rt = readDash(
      'src/app/features/content/remotion-templates/studio-player/template-runtime.tsx',
    );
    expect(rt).toMatch(/isValidSrc/);
    expect(rt).toMatch(/\/\^\(https\?:\|blob:\|data:\)\//);
    // bgSrc and layerSrc must be trimmed and validated
    expect(rt).toMatch(/\.trim\(\)/);
  });

  it('templates-remotion runtime mirrors dashboard URL validation (parity)', () => {
    const rt = fs.readFileSync(
      path.join(repoRoot, 'templates-remotion/src/runtime/TemplateRuntime.tsx'),
      'utf8',
    );
    expect(rt).toMatch(/isValidSrc/);
    expect(rt).toMatch(/\/\^\(https\?:\|blob:\|data:\)\//);
    expect(rt).toMatch(/\.trim\(\)/);
  });

  it('dashboard CSP media-src allows Railway + kalonpartners for template previews', () => {
    const csp = readDash('src/index.html');
    expect(csp).toMatch(/media-src[^;]*neopro-central-production\.up\.railway\.app/);
    expect(csp).toMatch(/media-src[^;]*kalonpartners\.bzh/);
    expect(csp).toMatch(/media-src[^;]*blob:/);
  });

  // Regression guard: studio-v2 variant thumbnails must follow the template
  // canvas aspect ratio, not a hardcoded 9/16 (deformed 16/9 or 1/1 templates).
  // Driven by the `--thumb-ratio` CSS variable set from canvasWidth/Height.
  it('studio-v2-editor binds --thumb-ratio from canvasWidth/canvasHeight', () => {
    const ts = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts',
    );
    expect(ts).toMatch(/variantThumbRatio/);
    expect(ts).toMatch(/canvasWidth.*canvasHeight|canvasWidth\}\s*\/\s*\$\{this\.view\.canvasHeight/);

    const html = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.html',
    );
    expect(html).toMatch(/\[style\.--thumb-ratio\]="variantThumbRatio"/);

    const scss = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.scss',
    );
    expect(scss).toMatch(/aspect-ratio:\s*var\(--thumb-ratio/);
    // Fixed column width prevents single-variant row from stretching.
    expect(scss).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*96px\)/);
  });

  // Regression guard: legacy v1→v2 scaffold creates variants with empty
  // background_video_url. The runtime `isValidSrc` guard skips empty URLs →
  // black preview with no explanation. An explicit warning banner must be
  // shown when the active variant has no background.
  it('studio-v2-editor surfaces missing background warning for empty variants', () => {
    const ts = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts',
    );
    expect(ts).toMatch(/isBackgroundMissing/);
    expect(ts).toMatch(/backgroundVideoUrl/);

    const html = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.html',
    );
    expect(html).toMatch(/\*ngIf="isBackgroundMissing"/);
    expect(html).toMatch(/studio-v2__bg-missing/);
  });

  // Regression guard: Chrome power-saves video-only <video> tags and spams
  // "Could not play video: AbortError" in the console. The Angular host of
  // the Player filters these specific messages without silencing real errors.
  it('template-studio-player filters benign AbortError console noise', () => {
    const host = readDash(
      'src/app/features/content/remotion-templates/studio-player/template-studio-player.component.ts',
    );
    expect(host).toMatch(/Could not play video/);
    expect(host).toMatch(/_origConsoleError/);
  });
});

describe('Template Studio v2 — scaffold placeholders (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot, rel), 'utf8');
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');

  it('repository exposes scaffoldPlaceholders to unblock v1→v2 flip', () => {
    const repo = read('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/async\s+scaffoldPlaceholders\s*\(/);
    // Idempotent: only seeds when list is empty
    expect(repo).toMatch(/variants\.length\s*===\s*0/);
    expect(repo).toMatch(/textFields\.length\s*===\s*0/);
    expect(repo).toMatch(/imageSlots\.length\s*===\s*0/);
  });

  it('controller exposes scaffoldStudio with metric tracking', () => {
    const ctl = read('controllers/template-studio.controller.ts');
    expect(ctl).toMatch(/export\s+const\s+scaffoldStudio\s*=/);
    expect(ctl).toMatch(/scaffoldPlaceholders/);
    expect(ctl).toMatch(/record\(\s*['"]studio_view['"]/);
  });

  it('POST /:id/studio/scaffold route is adminOnly with rate limit', () => {
    const routes = read('routes/template-studio.routes.ts');
    const block = routes.match(/router\.post\(\s*['"]\/:id\/studio\/scaffold['"][\s\S]*?\)\s*;/);
    expect(block).not.toBeNull();
    expect(block?.[0]).toMatch(/adminOnly/);
    expect(block?.[0]).toMatch(/sensitiveRateLimit/);
    expect(block?.[0]).toMatch(/ctrl\.scaffoldStudio/);
  });

  it('dashboard data service exposes scaffoldStudio(id)', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/scaffoldStudio\s*\([\s\S]*?id\s*:\s*string/);
    expect(svc).toMatch(/\/studio\/scaffold/);
  });

  it('component handles 409 with scaffold confirm flow, not just a toast', () => {
    const ts = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(ts).toMatch(/handleSchemaVersionConflict/);
    expect(ts).toMatch(/scaffoldStudio/);
    // Confirm UX before auto-seeding
    expect(ts).toMatch(/window\.confirm|confirm\(/);
  });
});

describe('Template Studio v2 — direct asset upload in admin panels (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot, rel), 'utf8');
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');

  it('uploadTemplateAssetController accepts requests without prop_key (studio v2 path)', () => {
    const ctl = read('controllers/remotion-templates.controller.ts');
    // Legacy v1 branch must keep requiring prop_key — gated by ternary, not an early return
    expect(ctl).not.toMatch(/if\s*\(\s*!prop_key\s*\)\s*{\s*return\s+res\.status\(400\)/);
    expect(ctl).toMatch(/prop_key\s*\?\s*['"]remotion-assets['"]\s*:\s*['"]template-assets\/studio['"]/);
  });

  it('uploadTemplateAssetController only mutates default_props when prop_key is present', () => {
    const ctl = read('controllers/remotion-templates.controller.ts');
    // updateDefaultProps must be guarded by an `if (prop_key)` block — studio v2 must not touch v1 default_props
    const uploadMatch = ctl.match(/uploadTemplateAssetController[\s\S]*?^};/m);
    expect(uploadMatch).not.toBeNull();
    const body = uploadMatch?.[0] ?? '';
    expect(body).toMatch(/if\s*\(\s*prop_key\s*\)\s*{[\s\S]*?updateDefaultProps/);
  });

  it('url-upload-input component exists and posts to studio asset endpoint', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/url-upload-input.component.ts',
    );
    expect(comp).toMatch(/selector:\s*['"]app-url-upload-input['"]/);
    expect(comp).toMatch(/uploadStudioAsset/);
    // Must surface the URL via (valueChange), never auto-patch the resource
    expect(comp).toMatch(/@Output\(\)\s+valueChange/);
  });

  it('data service exposes uploadStudioAsset(id, file) without prop_key', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/uploadStudioAsset\s*\([\s\S]*?templateId\s*:\s*string[\s\S]*?file\s*:\s*File/);
    // Must NOT append prop_key in formData (that would re-trigger v1 default_props mutation)
    const m = svc.match(/uploadStudioAsset[\s\S]*?^\s{2}}/m);
    expect(m).not.toBeNull();
    expect(m?.[0]).not.toMatch(/prop_key/);
  });

  it('admin-variants-panel imports UrlUploadInputComponent and requires templateId', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-variants-panel.component.ts',
    );
    expect(comp).toMatch(/import\s*\{\s*UrlUploadInputComponent\s*\}\s*from\s*['"]\.\/url-upload-input\.component['"]/);
    expect(comp).toMatch(/imports:\s*\[[^\]]*UrlUploadInputComponent/);
    expect(comp).toMatch(/@Input\(\{\s*required:\s*true\s*\}\)\s+templateId/);
    expect(comp).toMatch(/<app-url-upload-input/);
  });

  it('admin-layers-panel imports UrlUploadInputComponent and requires templateId', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-layers-panel.component.ts',
    );
    expect(comp).toMatch(/import\s*\{\s*UrlUploadInputComponent\s*\}\s*from\s*['"]\.\/url-upload-input\.component['"]/);
    expect(comp).toMatch(/imports:\s*\[[^\]]*UrlUploadInputComponent/);
    expect(comp).toMatch(/@Input\(\{\s*required:\s*true\s*\}\)\s+templateId/);
    expect(comp).toMatch(/<app-url-upload-input/);
  });

  it('admin-studio-panel passes templateId to variants + layers panels', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts',
    );
    const variantsBlock = comp.match(/<app-admin-variants-panel[\s\S]*?><\/app-admin-variants-panel>/);
    const layersBlock = comp.match(/<app-admin-layers-panel[\s\S]*?><\/app-admin-layers-panel>/);
    expect(variantsBlock?.[0]).toMatch(/\[templateId\]="view\.id"/);
    expect(layersBlock?.[0]).toMatch(/\[templateId\]="view\.id"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-075 — Canvas format picker (16:9 / 9:16 / 1:1 / 4:5)
// Protège contre les régressions qui reverseraient le format visuel côté DB,
// repository, validation, contrôleur, types ou UI admin.
// ─────────────────────────────────────────────────────────────────────────────
describe('Template Studio v2 — canvas format picker (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string): string =>
    fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('migration adds canvas_width + canvas_height to neopro_templates', () => {
    const sql = fs.readFileSync(
      path.join(centralSrc, 'scripts', 'migrations', 'add-template-canvas-dimensions.sql'),
      'utf8',
    );
    expect(sql).toMatch(/ALTER\s+TABLE\s+neopro_templates/i);
    expect(sql).toMatch(/canvas_width\s+INT\s+NOT\s+NULL\s+DEFAULT\s+1920/i);
    expect(sql).toMatch(/canvas_height\s+INT\s+NOT\s+NULL\s+DEFAULT\s+1080/i);
  });

  it('template-studio repository selects + maps canvas_width / canvas_height', () => {
    const repo = readFile('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/canvas_width:\s*number/);
    expect(repo).toMatch(/canvas_height:\s*number/);
    // SELECT must include both columns, else findV2ById returns undefined for canvas dims
    expect(repo).toMatch(/SELECT[\s\S]*canvas_width,\s*canvas_height[\s\S]*FROM neopro_templates/);
    expect(repo).toMatch(/canvasWidth:\s*row\.canvas_width/);
    expect(repo).toMatch(/canvasHeight:\s*row\.canvas_height/);
  });

  it('TemplateV2 type exposes canvasWidth / canvasHeight', () => {
    const types = readFile('types/template-studio.types.ts');
    expect(types).toMatch(/canvasWidth:\s*number/);
    expect(types).toMatch(/canvasHeight:\s*number/);
  });

  it('remotion-templates repository UpdateTemplateInput + update() accept canvas dims', () => {
    const repo = readFile('repositories/remotion-templates.repository.ts');
    expect(repo).toMatch(/canvas_width\?:\s*number/);
    expect(repo).toMatch(/canvas_height\?:\s*number/);
    expect(repo).toMatch(/canvas_width\s*=\s*\$/);
    expect(repo).toMatch(/canvas_height\s*=\s*\$/);
  });

  it('Joi templateUpdateSchema validates canvas_width + canvas_height bounds', () => {
    const validation = readFile('middleware/validation.ts');
    const block = validation.match(/templateUpdateSchema:\s*Joi\.object\(\{[\s\S]*?\}\)\.min\(1\)/);
    expect(block?.[0]).toBeTruthy();
    expect(block?.[0]).toMatch(/canvas_width:\s*Joi\.number\(\)\.integer\(\)\.min\(240\)\.max\(7680\)/);
    expect(block?.[0]).toMatch(/canvas_height:\s*Joi\.number\(\)\.integer\(\)\.min\(240\)\.max\(7680\)/);
  });

  it('updateTemplate controller forwards canvas_width + canvas_height to repo', () => {
    const ctrl = readFile('controllers/remotion-templates.controller.ts');
    const updateBlock = ctrl.match(/export\s+const\s+updateTemplate\s*=[\s\S]*?\n\};/);
    expect(updateBlock?.[0]).toBeTruthy();
    expect(updateBlock?.[0]).toMatch(/canvas_width\s*,\s*canvas_height/);
    expect(updateBlock?.[0]).toMatch(/remotionTemplatesRepository\.update\([\s\S]*canvas_width[\s\S]*canvas_height/);
  });

  it('dashboard TemplateStudioView type exposes canvasWidth / canvasHeight', () => {
    const types = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.types.ts',
    );
    const block = types.match(/interface\s+TemplateStudioView\s*\{[\s\S]*?\}/);
    expect(block?.[0]).toMatch(/canvasWidth:\s*number/);
    expect(block?.[0]).toMatch(/canvasHeight:\s*number/);
  });

  it('dashboard data service updateTemplate() patch accepts canvas_width/height', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    const block = svc.match(/updateTemplate\([\s\S]*?\)\s*:\s*Observable/);
    expect(block?.[0]).toMatch(/canvas_width:\s*number/);
    expect(block?.[0]).toMatch(/canvas_height:\s*number/);
  });

  it('studio-v2-editor reads canvas dims from view (not hardcoded)', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts',
    );
    expect(editor).toMatch(/canvasWidth:\s*this\.view\.canvasWidth/);
    expect(editor).toMatch(/canvasHeight:\s*this\.view\.canvasHeight/);
    // Guard against regression to hardcoded 1920/1080 landscape
    expect(editor).not.toMatch(/canvasWidth:\s*1920,\s*\n\s*canvasHeight:\s*1080/);
  });

  it('admin-studio-panel exposes format picker with 4 presets + onSelectFormat PATCH', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts',
    );
    expect(comp).toMatch(/data-testid="admin-format-picker"/);
    expect(comp).toMatch(/formatPresets/);
    // 4 presets: 16:9 TV, 9:16 Vertical, 1:1 Carré, 4:5 Portrait
    expect(comp).toMatch(/id:\s*['"]16-9['"][\s\S]*width:\s*1920[\s\S]*height:\s*1080/);
    expect(comp).toMatch(/id:\s*['"]9-16['"][\s\S]*width:\s*1080[\s\S]*height:\s*1920/);
    expect(comp).toMatch(/id:\s*['"]1-1['"][\s\S]*width:\s*1080[\s\S]*height:\s*1080/);
    expect(comp).toMatch(/id:\s*['"]4-5['"][\s\S]*width:\s*1080[\s\S]*height:\s*1350/);
    expect(comp).toMatch(/onSelectFormat[\s\S]*updateTemplate[\s\S]*canvas_width[\s\S]*canvas_height/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-075 — Add text/image buttons + curated Google Fonts dropdown
// ─────────────────────────────────────────────────────────────────────────────
describe('Template Studio v2 — add-field buttons + curated fonts (ADR-075)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string): string =>
    fs.readFileSync(path.join(dashRoot, rel), 'utf8');

  it('admin-studio-panel exposes "+ Ajouter un champ texte" and "+ Ajouter un slot image"', () => {
    const comp = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts',
    );
    expect(comp).toMatch(/data-testid="admin-add-text-field"/);
    expect(comp).toMatch(/data-testid="admin-add-image-slot"/);
    expect(comp).toMatch(/onAddTextField\(\)[\s\S]*createTextField/);
    expect(comp).toMatch(/onAddImageSlot\(\)[\s\S]*createImageSlot/);
    // Unique slotKey generator must remain — duplicates would hit 409 on POST
    expect(comp).toMatch(/private\s+nextSlotKey\(/);
  });

  it('admin-field-editor uses curated font dropdown (not free-text) with preview', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts',
    );
    expect(editor).toMatch(/FONT_FAMILIES\s*=\s*\[/);
    // Core families across display / sans / serif / mono / script buckets
    for (const fam of ['Anton', 'Inter', 'Montserrat', 'Playfair Display', 'JetBrains Mono', 'Pacifico']) {
      expect(editor).toContain(`'${fam}'`);
    }
    // Dropdown must be <select>, not free <input type="text">, and preview via [style.fontFamily]
    expect(editor).toMatch(/<select[^>]*ngModel[^>]*fontFamily[\s\S]*\*ngFor="let ff of fontFamilies"/);
    expect(editor).toMatch(/\[style\.fontFamily\]="ff"/);
  });

  it('dashboard index.html preloads curated Google Fonts families', () => {
    const html = readDash('src/index.html');
    expect(html).toMatch(/fonts\.googleapis\.com\/css2\?family=/);
    for (const fam of [
      'Anton',
      'Bebas\\+Neue',
      'Inter',
      'Montserrat',
      'Playfair\\+Display',
      'JetBrains\\+Mono',
      'Pacifico',
    ]) {
      expect(html).toMatch(new RegExp(`family=[^"']*${fam}`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-075 V3 Phase 1 — Visual drag-to-position super_admin overlay
// ─────────────────────────────────────────────────────────────────────────────
describe('Template Studio v2 — drag-to-position admin overlay (ADR-075 V3 Phase 1)', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const readDash = (rel: string): string =>
    fs.readFileSync(path.join(dashRoot, rel), 'utf8');
  const overlayPath =
    'src/app/features/content/remotion-templates/studio-v2/admin/admin-canvas-overlay.component.ts';
  const panelPath =
    'src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts';

  it('admin-canvas-overlay component exists with canvas + drag handles', () => {
    const comp = readDash(overlayPath);
    expect(comp).toMatch(/selector:\s*['"]app-admin-canvas-overlay['"]/);
    expect(comp).toMatch(/data-testid="admin-canvas-overlay"/);
    expect(comp).toMatch(/data-testid="admin-canvas"/);
    // Uses view.canvasWidth/Height to drive aspect-ratio (format picker wiring).
    expect(comp).toMatch(/view\.canvasWidth[\s\S]*view\.canvasHeight/);
  });

  it('admin-canvas-overlay wires pointer events and emits debounced patches', () => {
    const comp = readDash(overlayPath);
    // Pointer-based drag (no mousedown-only) so touch + pen work too.
    expect(comp).toMatch(/\(pointerdown\)="startDrag/);
    expect(comp).toMatch(/pointermove[\s\S]*pointerup/);
    // Debounced via scheduleEmit with setTimeout — not raw patch flood.
    expect(comp).toMatch(/scheduleEmit\(/);
    expect(comp).toMatch(/setTimeout\([\s\S]*300\)/);
    // Position values are clamped to [0,1] — positions are fractions of canvas.
    expect(comp).toMatch(/clamp\([^,]+,\s*0,\s*1\)/);
  });

  it('admin-canvas-overlay emits patchTextField / patchImageSlot events', () => {
    const comp = readDash(overlayPath);
    expect(comp).toMatch(/@Output\(\)\s+patchTextField\s*=\s*new EventEmitter</);
    expect(comp).toMatch(/@Output\(\)\s+patchImageSlot\s*=\s*new EventEmitter</);
    // Resize corner exists for image slots (width/height tuning).
    expect(comp).toMatch(/data-testid]="'resize-image-/);
    expect(comp).toMatch(/applyResize\(/);
  });

  it('admin-studio-panel renders the overlay and wires it to patch handlers', () => {
    const panel = readDash(panelPath);
    expect(panel).toMatch(/import\s*\{\s*AdminCanvasOverlayComponent\s*\}\s*from\s*'\.\/admin-canvas-overlay\.component'/);
    expect(panel).toMatch(/AdminCanvasOverlayComponent/);
    expect(panel).toMatch(/<app-admin-canvas-overlay[\s\S]*\[view\]="view"[\s\S]*patchTextField[\s\S]*patchImageSlot/);
  });

  // Regression guard: the server Joi schemas (templateStudioTextFieldUpdate /
  // templateStudioImageSlotUpdate) accept FLAT fields (positionX / positionY /
  // width / height). Emitting a nested `position: { x, y }` payload gets the
  // unknown key stripped, the body becomes empty, `.min(1)` fails and the
  // drag/resize patches return 400. Incident: ADR-075 V3 Phase 1 rollout.
  it('admin-canvas-overlay emits FLAT positionX/positionY patches (not nested)', () => {
    const comp = readDash(overlayPath);
    // Drag emissions must send flat fields matching the server Joi schema.
    expect(comp).toMatch(/patchTextField\.emit\(\s*\{\s*id,\s*patch:\s*\{\s*positionX:/);
    expect(comp).toMatch(/patchImageSlot\.emit\(\s*\{\s*id,\s*patch:\s*\{\s*positionX:/);
    // And resize emits flat width/height, not a nested position object.
    expect(comp).toMatch(/patchImageSlot\.emit\(\s*\{\s*id,\s*patch:\s*\{\s*width,\s*height\s*\}/);
    // Explicit guard: never emit `patch: { position:` from the overlay.
    expect(comp).not.toMatch(/patch:\s*\{\s*position\s*:/);
  });

  it('admin-field-editor emits FLAT positionX/positionY patches', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts',
    );
    expect(editor).toMatch(/positionX:\s*v\.position\.x/);
    expect(editor).toMatch(/positionY:\s*v\.position\.y/);
    // No nested position passthrough in emitted patch payload.
    expect(editor).not.toMatch(/this\.patch\.emit\([\s\S]*position:\s*\{/);
  });

  // Regression guard: onAddTextField / onAddImageSlot must POST flat payloads,
  // same class of bug as the drag PATCH (Joi Create schema also uses flat fields).
  it('admin-studio-panel CREATE payloads are FLAT (positionX / positionY)', () => {
    const panel = readDash(panelPath);
    // TextField create
    expect(panel).toMatch(/TemplateTextFieldCreate\s*=\s*\{[\s\S]*positionX:\s*0\.5,[\s\S]*positionY:\s*0\.5,/);
    // ImageSlot create
    expect(panel).toMatch(/TemplateImageSlotCreate\s*=\s*\{[\s\S]*positionX:\s*0\.5,[\s\S]*positionY:\s*0\.5,[\s\S]*width:\s*0\.3,[\s\S]*height:\s*0\.3,/);
    // Neither may send a nested `position: { x, y` at creation time.
    expect(panel).not.toMatch(/position:\s*\{\s*x:/);
  });

  // Regression guard: drag fluidity. OnPush + raw mutation of `tf.position`
  // inside pointermove doesn't trigger change detection, so the handle only
  // repositions on pointerup. Fix: markForCheck() after each mutation.
  it('admin-canvas-overlay calls markForCheck during drag/resize', () => {
    const comp = readDash(overlayPath);
    expect(comp).toMatch(/ChangeDetectorRef/);
    expect(comp).toMatch(/this\.cdr\.markForCheck\(\)/);
    // Must expose a `refresh()` hook for the parent panel to re-render the
    // overlay after a field-editor card edits a nested property in-place.
    expect(comp).toMatch(/refresh\(\)\s*:\s*void/);
  });

  // Regression guard: card edits (typographie, couleur, fontSize, …) mutate
  // the shared `view.textFields[i]` reference via ngModel; the OnPush overlay
  // child does not re-render unless the parent explicitly pushes it.
  it('admin-studio-panel refreshes canvas overlay after card patches', () => {
    const panel = readDash(panelPath);
    expect(panel).toMatch(/#canvasOverlay/);
    expect(panel).toMatch(/@ViewChild\('canvasOverlay'\)\s+canvasOverlay\?:\s*AdminCanvasOverlayComponent/);
    // Both PATCH handlers must call refresh() so the visual canvas follows
    // the card input immediately.
    expect(panel).toMatch(/onPatchTextField[\s\S]*this\.canvasOverlay\?\.refresh\(\)/);
    expect(panel).toMatch(/onPatchImageSlot[\s\S]*this\.canvasOverlay\?\.refresh\(\)/);
  });

  // Regression guard: `emitPatch` used to blindly include DB-null values
  // (color=null, fontFamily=null, …) that Joi rejects. Result: every ngModel
  // keystroke returned 400. Fix: strip null/undefined before emitting,
  // except the whitelisted fields Joi explicitly `.allow(null)`.
  it('admin-field-editor strips null/undefined before emitting PATCH', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts',
    );
    expect(editor).toMatch(/function\s+stripNullish/);
    expect(editor).toMatch(/stripNullish\(\{[\s\S]*slotKey:\s*v\.slotKey/);
    // maxChars / aspectRatio must be whitelisted to preserve explicit null.
    expect(editor).toMatch(/\['maxChars'\]/);
    expect(editor).toMatch(/\['aspectRatio'\]/);
  });

  // Regression guard: PATCH handlers must NOT trigger a full view reload on
  // success. Reload unmounts/remounts the card → flash at every keystroke
  // (reported by user on field editor inputs).
  it('admin-studio-panel PATCH handlers do not reload the view on success', () => {
    const panel = readDash(panelPath);
    const patchBlocks = panel.match(
      /onPatch(?:TextField|ImageSlot)\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/g,
    );
    expect(patchBlocks).toBeTruthy();
    expect(patchBlocks!.length).toBe(2);
    for (const block of patchBlocks!) {
      expect(block).not.toMatch(/next:\s*\(\)\s*=>\s*this\.changed\.emit/);
      // Still have an error handler to notify the user.
      expect(block).toMatch(/error:\s*\(\)\s*=>/);
    }
  });
});

describe('Club self-service templates (ADR-075 V3 Phase B)', () => {
  const repoRoot2 = path.resolve(__dirname, '..', '..', '..', '..');
  const dashRoot2 = path.join(repoRoot2, 'central-dashboard');
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot2, rel), 'utf8');

  it('middleware requireClubByoAccess enforces template_studio_byo + premium', () => {
    const mw = read('middleware/require-club-byo-access.ts');
    expect(mw).toMatch(/template_studio_byo/);
    expect(mw).toMatch(/hasFeatureOverride/);
    expect(mw).toMatch(/TIER_LEVEL\.premium/);
    // super_admin bypass + site_id assignment check
    expect(mw).toMatch(/super_admin/);
    expect(mw).toMatch(/req\.clubSiteId\s*=/);
  });

  it('club-templates routes wire authenticate + requireRole + requireClubByoAccess', () => {
    const routes = read('routes/club-templates.routes.ts');
    expect(routes).toMatch(/requireClubByoAccess/);
    expect(routes).toMatch(/requireRole\(\s*['"]club['"]/);
    // MUST NOT be gated super_admin only (Phase B contract)
    expect(routes).not.toMatch(/requireRole\(\s*['"]super_admin['"]\s*\)/);
    // validateParams on every :id route
    expect(routes).toMatch(/validateParams\(paramSchemas\.id\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndFieldId\)/);
    expect(routes).toMatch(/validateParams\(paramSchemas\.idAndSlotId\)/);
  });

  it('server.ts mounts club-templates under /api/club/remotion-templates', () => {
    const server = read('server.ts');
    expect(server).toMatch(/clubTemplatesRoutes/);
    expect(server).toMatch(/\/api\/club\/remotion-templates/);
  });

  it('controller enforces template.site_id === req.clubSiteId on every write', () => {
    const ctl = read('controllers/club-templates.controller.ts');
    expect(ctl).toMatch(/loadOwnedTemplate/);
    expect(ctl).toMatch(/site_id\s*!==\s*clubSiteId/);
    // Child resources (text fields / image slots) verify template ownership
    expect(ctl).toMatch(/assertChildBelongs/);
    expect(ctl).toMatch(/'text_field'/);
    expect(ctl).toMatch(/'image_slot'/);
  });

  it('dashboard ClubTemplatesDataService hits /club/remotion-templates/*', () => {
    const svc = readDash('src/app/features/content/remotion-templates/club-templates-data.service.ts');
    expect(svc).toMatch(/\/club\/remotion-templates/);
    expect(svc).toMatch(/getStudioView/);
    expect(svc).toMatch(/updateTextField/);
    expect(svc).toMatch(/updateImageSlot/);
    expect(svc).toMatch(/updateTemplate/);
  });

  it('admin-studio-panel exposes clubMode input that hides variants + layers + add-buttons', () => {
    const panel = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts',
    );
    expect(panel).toMatch(/@Input\(\)\s+clubMode\s*=\s*false/);
    // Variants/layers hidden under *ngIf="!clubMode"
    expect(panel).toMatch(/<app-admin-variants-panel[\s\S]*\*ngIf="!clubMode"/);
    expect(panel).toMatch(/<app-admin-layers-panel[\s\S]*\*ngIf="!clubMode"/);
    // Add-field / add-slot buttons gated too
    expect(panel).toMatch(/admin-add-text-field[\s\S]*!clubMode|!clubMode[\s\S]*admin-add-text-field/);
    // Patch methods route through ClubTemplatesDataService when clubMode
    expect(panel).toMatch(/ClubTemplatesDataService/);
    expect(panel).toMatch(/this\.clubMode\s*\?\s*this\.clubApi\s*:\s*this\.api/);
  });

  it('dashboard /content/my-templates route is registered with club role', () => {
    const routes = readDash('src/app/app.routes.ts');
    expect(routes).toMatch(/content\/my-templates/);
    expect(routes).toMatch(/my-templates\.component[\s\S]*MyTemplatesComponent/);
    // Route data includes 'club' role
    expect(routes).toMatch(/my-templates[\s\S]*roles:\s*\[[^\]]*'club'/);
  });

  it('MyTemplatesComponent passes clubMode=true to admin-studio-panel', () => {
    const cmp = readDash(
      'src/app/features/content/remotion-templates/my-templates.component.ts',
    );
    expect(cmp).toMatch(/\[clubMode\]="true"/);
    expect(cmp).toMatch(/ClubTemplatesDataService/);
    expect(cmp).toMatch(/app-admin-studio-panel/);
  });
});

describe('Club template background upload (ADR-075 V3 Phase C)', () => {
  const repoRoot3 = path.resolve(__dirname, '..', '..', '..', '..');
  const dashRoot3 = path.join(repoRoot3, 'central-dashboard');
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot3, rel), 'utf8');

  it('POST /:id/background route uses multer uploadTemplateAsset.single("file")', () => {
    const routes = read('routes/club-templates.routes.ts');
    expect(routes).toMatch(/uploadTemplateAsset/);
    expect(routes).toMatch(/\/:id\/background/);
    expect(routes).toMatch(/uploadTemplateAsset\.single\(\s*['"]file['"]\s*\)/);
    expect(routes).toMatch(/uploadMyVariantBackground/);
  });

  it('controller enforces ownership + targets first variant + uploads to FTP', () => {
    const ctl = read('controllers/club-templates.controller.ts');
    expect(ctl).toMatch(/uploadMyVariantBackground/);
    expect(ctl).toMatch(/loadOwnedTemplate/);
    expect(ctl).toMatch(/listVariants/);
    expect(ctl).toMatch(/uploadAsset/);
    expect(ctl).toMatch(/getAssetUrl/);
    // Updates the variant's backgroundVideoUrl
    expect(ctl).toMatch(/updateVariant[\s\S]*backgroundVideoUrl/);
    // Cleans up tmp file on every code path (success, failure, forbidden)
    expect(ctl).toMatch(/cleanupTmp/);
  });

  it('dashboard data service exposes uploadVariantBackground via FormData', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/club-templates-data.service.ts',
    );
    expect(svc).toMatch(/uploadVariantBackground/);
    expect(svc).toMatch(/\/club\/remotion-templates\/\$\{templateId\}\/background/);
    expect(svc).toMatch(/FormData/);
    expect(svc).toMatch(/api\.upload</);
  });

  it('MyTemplatesComponent exposes the bg-upload input with testid', () => {
    const cmp = readDash(
      'src/app/features/content/remotion-templates/my-templates.component.ts',
    );
    expect(cmp).toMatch(/data-testid="my-templates-bg-upload"/);
    expect(cmp).toMatch(/onBackgroundSelected/);
    expect(cmp).toMatch(/uploading\s*=\s*signal/);
    expect(cmp).toMatch(/uploadVariantBackground/);
    expect(cmp).toMatch(/accept="video\/mp4,video\/webm"/);
  });
});

describe('Club template quotas (ADR-075 V3 Phase D)', () => {
  const repoRoot4 = path.resolve(__dirname, '..', '..', '..', '..');
  const dashRoot4 = path.join(repoRoot4, 'central-dashboard');
  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot4, rel), 'utf8');

  it('service exposes CLUB_TEMPLATE_LIMIT=3 and CLUB_RENDER_DAILY_LIMIT=10', () => {
    const svc = read('services/club-template-quota.service.ts');
    expect(svc).toMatch(/CLUB_TEMPLATE_LIMIT\s*=\s*3\b/);
    expect(svc).toMatch(/CLUB_RENDER_DAILY_LIMIT\s*=\s*10\b/);
    expect(svc).toMatch(/getQuotaFor/);
    expect(svc).toMatch(/assertRenderAllowed/);
  });

  it('render job repo counts renders in last 24h per site', () => {
    const repo = read('repositories/remotion-render-job.repository.ts');
    expect(repo).toMatch(/countRendersLast24h/);
    expect(repo).toMatch(/requested_for_site_id\s*=\s*\$1/);
    expect(repo).toMatch(/INTERVAL '24 hours'/);
  });

  it('templates repo counts owned templates per site', () => {
    const repo = read('repositories/remotion-templates.repository.ts');
    expect(repo).toMatch(/countOwnedBySite/);
    expect(repo).toMatch(/WHERE site_id = \$1/);
  });

  it('renderTemplate returns 429 when club exceeds daily render quota', () => {
    const ctl = read('controllers/remotion-templates.controller.ts');
    expect(ctl).toMatch(/clubTemplateQuotaService/);
    expect(ctl).toMatch(/assertRenderAllowed/);
    // 429 path with quota payload
    expect(ctl).toMatch(/429[\s\S]*quota:/);
  });

  it('GET /api/club/remotion-templates/quota route + controller exist', () => {
    const routes = read('routes/club-templates.routes.ts');
    expect(routes).toMatch(/\/quota/);
    expect(routes).toMatch(/getMyQuota/);
    const ctl = read('controllers/club-templates.controller.ts');
    expect(ctl).toMatch(/export const getMyQuota/);
    expect(ctl).toMatch(/clubTemplateQuotaService\.getQuotaFor/);
  });

  it('dashboard data service + UI render quota badges', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/club-templates-data.service.ts',
    );
    expect(svc).toMatch(/getQuota\(\)/);
    expect(svc).toMatch(/\/club\/remotion-templates\/quota/);
    expect(svc).toMatch(/ClubTemplateQuota/);

    const cmp = readDash(
      'src/app/features/content/remotion-templates/my-templates.component.ts',
    );
    expect(cmp).toMatch(/data-testid="my-templates-quota-templates"/);
    expect(cmp).toMatch(/data-testid="my-templates-quota-renders"/);
    expect(cmp).toMatch(/quota\s*=\s*signal/);
    expect(cmp).toMatch(/loadQuota/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-084 — Custom fonts + alwaysVisible + scale-in configurable
// ─────────────────────────────────────────────────────────────────────────────

describe('Template Studio v2 — ADR-084 custom fonts + visibility + scale-in', () => {
  const dashRoot = path.join(repoRoot, 'central-dashboard');
  const remotionRoot = path.join(repoRoot, 'templates-remotion');

  const read = (rel: string) => fs.readFileSync(path.join(centralSrc, rel), 'utf8');
  const readDash = (rel: string) => fs.readFileSync(path.join(dashRoot, rel), 'utf8');
  const readRemotionFile = (rel: string) => fs.readFileSync(path.join(remotionRoot, rel), 'utf8');

  // ── Fonts ──────────────────────────────────────────────────────────────────

  it('custom OTF fonts exist in templates-remotion/public/', () => {
    const pub = path.join(remotionRoot, 'public');
    expect(fs.existsSync(path.join(pub, 'Bulevar-Regular.otf'))).toBe(true);
    expect(fs.existsSync(path.join(pub, 'GeneralSans-Semibold.otf'))).toBe(true);
    expect(fs.existsSync(path.join(pub, 'GeneralSans-Bold.otf'))).toBe(true);
  });

  it('custom OTF fonts exist in central-dashboard/src/assets/fonts/', () => {
    const assetsDir = path.join(dashRoot, 'src', 'assets', 'fonts');
    expect(fs.existsSync(path.join(assetsDir, 'Bulevar-Regular.otf'))).toBe(true);
    expect(fs.existsSync(path.join(assetsDir, 'GeneralSans-Semibold.otf'))).toBe(true);
    expect(fs.existsSync(path.join(assetsDir, 'GeneralSans-Bold.otf'))).toBe(true);
  });

  it('fonts.ts registers Bulevar + General Sans via staticFile()', () => {
    const fonts = readRemotionFile('src/fonts.ts');
    expect(fonts).toMatch(/registerCustomFonts/);
    expect(fonts).toMatch(/staticFile\(/);
    expect(fonts).toMatch(/Bulevar-Regular\.otf/);
    expect(fonts).toMatch(/GeneralSans-Semibold\.otf/);
    expect(fonts).toMatch(/GeneralSans-Bold\.otf/);
    expect(fonts).toMatch(/@font-face/);
  });

  it('index.ts calls registerCustomFonts() before registerRoot()', () => {
    const idx = readRemotionFile('src/index.ts');
    expect(idx).toMatch(/registerCustomFonts\s*\(\s*\)/);
    const customPos = idx.indexOf('registerCustomFonts');
    const rootPos = idx.indexOf('registerRoot');
    expect(customPos).toBeGreaterThan(-1);
    expect(rootPos).toBeGreaterThan(-1);
    expect(customPos).toBeLessThan(rootPos);
  });

  it('styles.scss declares @font-face for Bulevar and General Sans', () => {
    const styles = readDash('src/styles.scss');
    expect(styles).toMatch(/@font-face/);
    expect(styles).toMatch(/Bulevar/);
    expect(styles).toMatch(/General Sans/);
    expect(styles).toMatch(/assets\/fonts\/Bulevar-Regular\.otf/);
    expect(styles).toMatch(/assets\/fonts\/GeneralSans-Semibold\.otf/);
    expect(styles).toMatch(/assets\/fonts\/GeneralSans-Bold\.otf/);
  });

  it('admin-field-editor lists Bulevar and General Sans in FONT_FAMILIES', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts',
    );
    expect(editor).toContain("'Bulevar'");
    expect(editor).toContain("'General Sans'");
  });

  // ── alwaysVisible ──────────────────────────────────────────────────────────

  it('migration adds always_visible + scale_from + scale_to columns', () => {
    const sql = fs.readFileSync(
      path.join(centralSrc, 'scripts', 'migrations', 'add-template-text-field-visibility-scale.sql'),
      'utf8',
    );
    expect(sql).toMatch(/always_visible\s+BOOLEAN\s+NOT NULL\s+DEFAULT FALSE/i);
    expect(sql).toMatch(/scale_from/i);
    expect(sql).toMatch(/scale_to/i);
  });

  it('server types declare alwaysVisible + scaleFrom + scaleTo on TemplateTextField and Row', () => {
    const types = read('types/template-studio.types.ts');
    expect(types).toMatch(/alwaysVisible\s*:\s*boolean/);
    expect(types).toMatch(/scaleFrom\s*:\s*number/);
    expect(types).toMatch(/scaleTo\s*:\s*number/);
    expect(types).toMatch(/always_visible\s*:\s*boolean/);
    expect(types).toMatch(/scale_from\s*:\s*string/);
    expect(types).toMatch(/scale_to\s*:\s*string/);
  });

  it('repository colMap includes alwaysVisible + scaleFrom + scaleTo', () => {
    const repo = read('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/alwaysVisible\s*:\s*['"]always_visible['"]/);
    expect(repo).toMatch(/scaleFrom\s*:\s*['"]scale_from['"]/);
    expect(repo).toMatch(/scaleTo\s*:\s*['"]scale_to['"]/);
    expect(repo).toMatch(/always_visible.*scale_from.*scale_to/s);
  });

  it('Joi schemas (create + update) accept alwaysVisible + scaleFrom + scaleTo', () => {
    const validation = read('middleware/validation.ts');
    const createIdx = validation.indexOf('templateStudioTextFieldCreate');
    const updateIdx = validation.indexOf('templateStudioTextFieldUpdate');
    const createBlock = validation.slice(createIdx, updateIdx);
    const updateBlock = validation.slice(updateIdx, updateIdx + 800);
    expect(createBlock).toMatch(/alwaysVisible/);
    expect(createBlock).toMatch(/scaleFrom/);
    expect(createBlock).toMatch(/scaleTo/);
    expect(updateBlock).toMatch(/alwaysVisible/);
    expect(updateBlock).toMatch(/scaleFrom/);
    expect(updateBlock).toMatch(/scaleTo/);
  });

  it('TemplateRuntime short-circuits computeAnimation when alwaysVisible is true', () => {
    const runtime = readRemotionFile('src/runtime/TemplateRuntime.tsx');
    expect(runtime).toMatch(/alwaysVisible/);
    expect(runtime).toMatch(/if\s*\(tf\.alwaysVisible\)/);
    expect(runtime).toMatch(/opacity\s*=\s*1/);
  });

  it('animations.ts (Remotion) accepts scaleFrom + scaleTo with defaults 0.7 / 1.0', () => {
    const anim = readRemotionFile('src/runtime/animations.ts');
    expect(anim).toMatch(/scaleFrom\s*\?/);
    expect(anim).toMatch(/scaleTo\s*\?/);
    expect(anim).toMatch(/params\.scaleFrom\s*\?\?\s*0\.7/);
    expect(anim).toMatch(/params\.scaleTo\s*\?\?\s*1\.0/);
  });

  it('dashboard animations.ts mirrors scaleFrom/scaleTo params', () => {
    const dashAnim = readDash(
      'src/app/features/content/remotion-templates/studio-player/animations.ts',
    );
    expect(dashAnim).toMatch(/scaleFrom\s*\?/);
    expect(dashAnim).toMatch(/scaleTo\s*\?/);
    expect(dashAnim).toMatch(/params\.scaleFrom\s*\?\?\s*0\.7/);
    expect(dashAnim).toMatch(/params\.scaleTo\s*\?\?\s*1\.0/);
  });

  it('dashboard types declare alwaysVisible + scaleFrom + scaleTo on TemplateTextField', () => {
    const types = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.types.ts',
    );
    expect(types).toMatch(/alwaysVisible\s*:\s*boolean/);
    expect(types).toMatch(/scaleFrom\s*:\s*number/);
    expect(types).toMatch(/scaleTo\s*:\s*number/);
  });

  it('data service payloads include optional alwaysVisible + scaleFrom + scaleTo', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/alwaysVisible\s*\?\s*:\s*boolean/);
    expect(svc).toMatch(/scaleFrom\s*\?\s*:\s*number/);
    expect(svc).toMatch(/scaleTo\s*\?\s*:\s*number/);
  });

  it('admin field editor: alwaysVisible checkbox + scale-in section + emitPatch', () => {
    const editor = readDash(
      'src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts',
    );
    expect(editor).toMatch(/alwaysVisible/);
    expect(editor).toMatch(/animation.*===.*scale-in/);
    expect(editor).toMatch(/scaleFrom/);
    expect(editor).toMatch(/scaleTo/);
    const patchIdx = editor.indexOf('emitPatch');
    const patchBlock = editor.slice(patchIdx, patchIdx + 1400);
    expect(patchBlock).toMatch(/alwaysVisible/);
    expect(patchBlock).toMatch(/scaleFrom/);
    expect(patchBlock).toMatch(/scaleTo/);
  });

  it('ADR-084 doc is checked in and listed in ADR README', () => {
    const adrDir = path.join(repoRoot, 'docs', 'adr');
    expect(
      fs.existsSync(path.join(adrDir, 'ADR-084-template-studio-fonts-visibility-scale.md')),
    ).toBe(true);
    const readme = fs.readFileSync(path.join(adrDir, 'README.md'), 'utf8');
    expect(readme).toMatch(/ADR-084/);
  });
});
