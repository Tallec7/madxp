/**
 * Smoke test — Template Studio v3 / DUP-02 + TEST-02.
 *
 * Locks the contract for transactional `duplicateDeep()` (P4 in PITFALLS.md):
 * the duplicate handler must clone all 6 child tables in a single
 * BEGIN/COMMIT, with layer_id remap, and the existing route handler must
 * call the deep version (not the legacy shallow `remotionTemplatesRepository.duplicate`).
 *
 * Pure file-based assertions — no HTTP server boot. Same pattern as
 * smoke-remotion.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Template Studio v3 — duplicateDeep (DUP-02)', () => {
  let repo: string;
  let ctrl: string;

  beforeAll(() => {
    repo = readFile('repositories/template-studio.repository.ts');
    ctrl = readFile('controllers/remotion-templates.controller.ts');
  });

  it('exposes a duplicateDeep method on templateStudioRepository', () => {
    expect(repo).toMatch(/\bduplicateDeep\s*\(/);
  });

  it('wraps the clone in a single BEGIN / COMMIT / ROLLBACK transaction', () => {
    expect(repo).toMatch(/['"`]BEGIN['"`]/);
    expect(repo).toMatch(/['"`]COMMIT['"`]/);
    expect(repo).toMatch(/['"`]ROLLBACK['"`]/);
  });

  it('clones the 6 child tables (FK chain rooted on neopro_templates)', () => {
    const tables = [
      'neopro_templates',
      'template_variants',
      'template_layers',
      'template_text_fields',
      'template_image_slots',
      'template_options',
      'template_packshot_refs',
    ];
    for (const t of tables) {
      expect(repo).toContain(t);
    }
  });

  it('builds a layerIdMap to remap FK on text_fields and image_slots', () => {
    expect(repo).toMatch(/layerIdMap/);
  });

  it('the existing duplicate route handler now calls duplicateDeep (not the shallow repo)', () => {
    expect(ctrl).toMatch(/templateStudioRepository\.duplicateDeep\s*\(/);
  });

  it('the duplicate handler no longer calls the shallow remotionTemplatesRepository.duplicate', () => {
    // Negative assertion — the legacy shallow path must be gone from the
    // duplicateTemplate handler. We grep for the function call signature
    // (with paren) to avoid matching unrelated identifiers in comments.
    expect(ctrl).not.toMatch(/remotionTemplatesRepository\.duplicate\s*\(/);
  });
});
