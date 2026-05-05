/**
 * Smoke test — Template Studio v3 / Phase 3 Plan 05 / PUB-01.
 *
 * Locks the contract for publish gate + unpublish endpoint + Winston structured
 * audit log + repository pattern enforcement. File-based assertions only —
 * no HTTP server boot. Same pattern as smoke-template-studio-v3-options.test.ts.
 *
 * Contract :
 * - POST /:id/publish + POST /:id/unpublish are mounted with requireSuperAdmin
 * - publishTemplate controller calls runValidation, refuses 409 on error severity
 * - unpublishTemplate controller calls templateStudioRepository.updatePublishedFlag
 * - Both controllers emit Winston structured info logs (action / actor_id / template_id / timestamp)
 * - Repository exposes async updatePublishedFlag(id, published) wrapping a parameterized UPDATE
 * - 0 bare query() in controller publish/unpublish blocks (CLAUDE.md repo pattern)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const ctrlFile = path.join(
  repoRoot,
  'central-server/src/controllers/remotion-templates.controller.ts',
);
const routeFile = path.join(
  repoRoot,
  'central-server/src/routes/remotion-templates.routes.ts',
);
const repoFile = path.join(
  repoRoot,
  'central-server/src/repositories/template-studio.repository.ts',
);

describe('Template Studio v3 — publish gate + unpublish + audit (Phase 3 PUB-01)', () => {
  it('A: routes /:id/publish + /:id/unpublish registered with requireSuperAdmin', () => {
    const routes = fs.readFileSync(routeFile, 'utf8');
    expect(routes).toMatch(/router\.post\(['"]\/:id\/publish['"]/);
    expect(routes).toMatch(/router\.post\(['"]\/:id\/unpublish['"]/);
    expect(routes).toMatch(/requireSuperAdmin/);
  });

  it('B: publishTemplate calls runValidation + refuses 409 on error severity', () => {
    const ctrl = fs.readFileSync(ctrlFile, 'utf8');
    expect(ctrl).toMatch(/export const publishTemplate/);
    expect(ctrl).toMatch(/runValidation/);
    expect(ctrl).toMatch(/severity === ['"]error['"]/);
    expect(ctrl).toMatch(/validation_failed/);
    expect(ctrl).toMatch(/status\(409\)/);
  });

  it('C: Winston structured audit log for publish + unpublish', () => {
    const ctrl = fs.readFileSync(ctrlFile, 'utf8');
    // logger.info('template.published', { ... actor_id ... })
    expect(ctrl).toMatch(/logger\.info\([\s\S]*?['"]template\.published['"][\s\S]*?actor_id/);
    expect(ctrl).toMatch(/logger\.info\([\s\S]*?['"]template\.unpublished['"][\s\S]*?actor_id/);
    expect(ctrl).toMatch(/template_id/);
    expect(ctrl).toMatch(/timestamp/);
  });

  it('D: unpublishTemplate calls repository.updatePublishedFlag(false) + 0 bare query() in controller', () => {
    const ctrl = fs.readFileSync(ctrlFile, 'utf8');
    expect(ctrl).toMatch(/export const unpublishTemplate/);
    expect(ctrl).toMatch(/templateStudioRepository\.updatePublishedFlag\([^)]*false/);
    expect(ctrl).toMatch(/templateStudioRepository\.updatePublishedFlag\([^)]*true/);
    // bare query() forbidden in controllers per CLAUDE.md
    expect(ctrl).not.toMatch(/^\s*await\s+query\(/m);
    expect(ctrl).not.toMatch(/from\s+['"]\.\.\/config\/database['"]/);
  });

  it('E: repository exposes updatePublishedFlag with parameterized UPDATE neopro_templates', () => {
    const repo = fs.readFileSync(repoFile, 'utf8');
    expect(repo).toMatch(/async updatePublishedFlag\s*\(/);
    // Real table is neopro_templates (Memory note 2026-05-05) — parameterized $1/$2
    expect(repo).toMatch(/UPDATE\s+neopro_templates\s+SET\s+published\s*=\s*\$2[\s\S]*WHERE\s+id\s*=\s*\$1/);
  });
});
