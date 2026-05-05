/**
 * Smoke test — Template Studio v3 / Phase 03 / Plan 03 / PUB-02.
 *
 * Locks the contract for the async test render endpoint :
 *   POST /api/remotion-templates/:id/test-render → 202 { jobId, templateId, status: 'queued' }.
 * The job reuses `remotion_render_jobs` (ADR-054/055) discriminated by
 * `title: 'test-render:'` prefix, fixtures injected server-side, FTP upload to
 * `/test-renders/{templateId}/{timestamp}.mp4`, and tracking persisted to the
 * `neopro_templates.test_render_*` columns added in Plan 01.
 *
 * File-based assertions only (no HTTP boot) — same shape as
 * smoke-template-studio-v3-options.test.ts and -duplicate.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const schemasFile = path.join(
  repoRoot,
  'central-server/src/middleware/validation.ts',
);
const routesFile = path.join(
  repoRoot,
  'central-server/src/routes/remotion-templates.routes.ts',
);
const ctrlFile = path.join(
  repoRoot,
  'central-server/src/controllers/remotion-templates.controller.ts',
);
const repoFile = path.join(
  repoRoot,
  'central-server/src/repositories/template-studio.repository.ts',
);
const workerFile = path.join(
  repoRoot,
  'central-server/src/services/remotion-render-worker.service.ts',
);

describe('Template Studio v3 — POST /:id/test-render contract (PUB-02)', () => {
  it('A: validation middleware exports testRenderSchemas with uuid params + sealed body', () => {
    const src = fs.readFileSync(schemasFile, 'utf8');
    expect(src).toMatch(/testRenderSchemas/);
    const idx = src.search(/testRenderSchemas/);
    const tail = src.slice(idx, idx + 800);
    expect(tail).toMatch(/Joi\.string\(\)\.uuid\(\)\.required\(\)/);
    expect(tail).toMatch(/Joi\.object\(\{\}\)\.unknown\(false\)/);
  });

  it('B: route POST /:id/test-render is mounted with super_admin + Joi params + Joi body', () => {
    const src = fs.readFileSync(routesFile, 'utf8');
    expect(src).toMatch(/router\.post\(\s*['"`]\/:id\/test-render['"`]/);
    const idx = src.search(/['"`]\/:id\/test-render['"`]/);
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/super_admin/);
    expect(block).toMatch(/createTestRender/);
    expect(block).toMatch(/testRenderSchemas\.params/);
    expect(block).toMatch(/testRenderSchemas\.body/);
  });

  it('C: controller injects server-side fixtures + enqueues with title prefix', () => {
    const src = fs.readFileSync(ctrlFile, 'utf8');
    expect(src).toMatch(/export const createTestRender/);
    expect(src).toMatch(/title:\s*[`'"]test-render:/);
    expect(src).toMatch(/TEST_RENDER_FIXTURES|player_first_name:\s*['"]PRÉNOM/);
    expect(src).toMatch(/remotionRenderJobRepository\.create/);
    expect(src).toMatch(/updateTestRenderTracking[\s\S]{0,200}status:\s*['"]queued/);
  });

  it('D: repository updateTestRenderTracking writes to the 3 tracking columns', () => {
    const src = fs.readFileSync(repoFile, 'utf8');
    expect(src).toMatch(/async updateTestRenderTracking/);
    expect(src).toMatch(/test_render_status\s*=\s*\$/);
    expect(src).toMatch(/test_render_url\s*=\s*\$/);
    expect(src).toMatch(/test_render_at\s*=\s*\$/);
  });

  it('E: worker hooks test-render branch (FTP /test-renders/ + success + failed)', () => {
    const src = fs.readFileSync(workerFile, 'utf8');
    expect(src).toMatch(/test-render:/);
    expect(src).toMatch(/\/test-renders\//);
    expect(src).toMatch(/updateTestRenderTracking[\s\S]{0,300}status:\s*['"]success/);
    expect(src).toMatch(/updateTestRenderTracking[\s\S]{0,300}status:\s*['"]failed/);
  });
});
