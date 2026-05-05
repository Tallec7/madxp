/**
 * Smoke test — Template Studio v3 / Plan 02-04 / UX-03.
 *
 * Locks the contract for transactional `renameOptionKey()` (option key rename
 * propagates atomically across template_options, template_packshot_refs,
 * template_text_fields.visible_if, template_image_slots.visible_if). File-based
 * assertions only — no HTTP server boot. Same pattern as smoke-remotion.test.ts
 * and smoke-template-studio-v3-duplicate.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const repoFile = path.join(
  repoRoot,
  'central-server/src/repositories/template-studio.repository.ts',
);
const ctrlFile = path.join(
  repoRoot,
  'central-server/src/controllers/template-studio.controller.ts',
);
const routeFile = path.join(
  repoRoot,
  'central-server/src/routes/template-studio.routes.ts',
);
const validationFile = path.join(
  repoRoot,
  'central-server/src/middleware/validation.ts',
);

describe('Template Studio v3 — option key rename + visible_if propagation (UX-03)', () => {
  it('A: repository renameOptionKey is wrapped in BEGIN/COMMIT/ROLLBACK', () => {
    const src = fs.readFileSync(repoFile, 'utf8');
    expect(src).toMatch(/(?:async\s+)?renameOptionKey\s*\(/);
    const idx = src.search(/renameOptionKey\s*\(/);
    expect(idx).toBeGreaterThan(-1);
    const tail = src.slice(idx, idx + 4000);
    expect(tail).toContain('BEGIN');
    expect(tail).toContain('COMMIT');
    expect(tail).toContain('ROLLBACK');
  });

  it('B: renameOptionKey updates template_options, packshot_refs, text_fields visible_if, image_slots visible_if', () => {
    const src = fs.readFileSync(repoFile, 'utf8');
    const idx = src.search(/renameOptionKey\s*\(/);
    const tail = src.slice(idx, idx + 4000);
    expect(tail).toMatch(/UPDATE\s+template_options/);
    expect(tail).toMatch(/UPDATE\s+template_packshot_refs/);
    expect(tail).toMatch(/UPDATE\s+template_text_fields[\s\S]{0,400}visible_if/);
    expect(tail).toMatch(/UPDATE\s+template_image_slots[\s\S]{0,400}visible_if/);
  });

  it('C: route POST /:id/options/:optionId/rename is mounted with super_admin + validate + validateParams + rate limit', () => {
    const src = fs.readFileSync(routeFile, 'utf8');
    expect(src).toMatch(/['"`]\/:id\/options\/:optionId\/rename['"`]/);
    const renamePattern = /\/:id\/options\/:optionId\/rename[\s\S]{0,800}/;
    const block = src.match(renamePattern)?.[0] ?? '';
    expect(block).toMatch(/super_admin/);
    expect(block).toMatch(/validate\s*\(/);
    expect(block).toMatch(/validateParams/);
    expect(block).toMatch(/sensitiveRateLimit/);
  });

  it('D: validation middleware exports templateStudioOptionRename Joi schema', () => {
    const src = fs.readFileSync(validationFile, 'utf8');
    expect(src).toMatch(/templateStudioOptionRename\b/);
    const idx = src.search(/templateStudioOptionRename/);
    const tail = src.slice(idx, idx + 800);
    expect(tail).toMatch(/newKey/);
    expect(tail).toMatch(/Joi\.string\(\)/);
    expect(tail).toMatch(/\.max\(\s*64\s*\)/);
  });

  it('E: controller maps option_key_conflict → 400 and not_found → 404', () => {
    const src = fs.readFileSync(ctrlFile, 'utf8');
    const idx = src.search(/renameOptionKey/);
    expect(idx).toBeGreaterThan(-1);
    const tail = src.slice(idx, idx + 2000);
    expect(tail).toMatch(/option_key_conflict/);
    expect(tail).toMatch(/(?:status\s*\(\s*400\s*\)|400)/);
    expect(tail).toMatch(/(?:status\s*\(\s*404\s*\)|404)/);
  });
});
