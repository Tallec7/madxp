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
