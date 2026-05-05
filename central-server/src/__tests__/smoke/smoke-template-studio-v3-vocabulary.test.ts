/**
 * Smoke test — Template Studio v3 / TEST-01.
 *
 * Locks the UI ↔ DB vocabulary contract before any v3 UI is written. The
 * VOCABULARY_MAP exported from the dashboard MUST list every business
 * label from docs/specs/features/template-studio-v3.spec.md. Any rename
 * of a label without updating the SPEC will break this test.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const vocabFile = path.join(
  repoRoot,
  'central-dashboard',
  'src',
  'app',
  'features',
  'content',
  'remotion-templates',
  'studio-v3',
  'vocabulary.constants.ts'
);

const SPEC_KEYS = [
  'Fond animé',
  'Zone modifiable',
  'Zone texte',
  'Zone image',
  'Limite caractères',
  'Police',
  'Quand cette zone apparaît',
  'Zone sûre & cadrage',
  'Apparition',
  'Glissement',
  'Zoom arrière',
  'Logo Pop',
  'Option club',
  'Vidéo packshot',
];

describe('Template Studio v3 — vocabulary lock (TEST-01)', () => {
  let content: string;

  beforeAll(() => {
    expect(fs.existsSync(vocabFile)).toBe(true);
    content = fs.readFileSync(vocabFile, 'utf8');
  });

  it('exports a VOCABULARY_MAP const', () => {
    expect(content).toMatch(/export\s+const\s+VOCABULARY_MAP\b/);
  });

  it('contains every SPEC label key', () => {
    for (const key of SPEC_KEYS) {
      expect(content).toContain(key);
    }
  });

  it('does not leak DB jargon ("layer", "slot", "pix_fmt") as user-facing string values', () => {
    // We allow mentions in *type names / DB column references on the right
    // side of the map (e.g. 'template_layers') — those are intentional.
    // We only ban the bare singular jargon as a quoted user-facing label
    // (e.g. `'layer'`, `'slot'`, `'pix_fmt'`) which must never end up in
    // the dashboard UI.
    expect(content).not.toMatch(/['"]layer['"]/);
    expect(content).not.toMatch(/['"]slot['"]/);
    expect(content).not.toMatch(/['"]pix_fmt['"]/);
  });
});
