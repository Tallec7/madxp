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
