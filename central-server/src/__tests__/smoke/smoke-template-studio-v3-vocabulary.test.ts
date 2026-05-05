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
const studioV3Dir = path.join(
  repoRoot,
  'central-dashboard',
  'src',
  'app',
  'features',
  'content',
  'remotion-templates',
  'studio-v3'
);
const vocabFile = path.join(studioV3Dir, 'vocabulary.constants.ts');

const BANLIST = [
  'layer',
  'slot',
  'pix_fmt',
  'option_key',
  'composition_id',
  // Plan 02-03 (UX-02) — animation numeric params must NOT leak to the UI.
  // The runtime engine is parametric (scaleFrom/scaleTo/durationMs baked into
  // each preset); the v3 admin only sees named cards (Apparition, Glissement,
  // Zoom arrière, Logo Pop, Aucune animation). Banning these strings as quoted
  // user-facing literals locks the anti-feature.
  'scaleFrom',
  'scaleTo',
  'durationMs',
] as const;

function listFilesRecursive(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

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

  it('exports an ERROR_MESSAGES const with FR strings for every Phase 1 backend error code', () => {
    expect(content).toMatch(/export\s+const\s+ERROR_MESSAGES\b/);
    // The 3 codes thrown by Phase 1 backend (see 01-fondations-VERIFICATION.md)
    expect(content).toMatch(/asset_alpha_required\s*:\s*['"][^'"]+['"]/);
    expect(content).toMatch(/duplicate_requires_v2\s*:\s*['"][^'"]+['"]/);
    expect(content).toMatch(/asset_in_use\s*:\s*['"][^'"]+['"]/);
  });

  it('no studio-v3/ source file leaks DB jargon as a string-quoted value', () => {
    const files = listFilesRecursive(studioV3Dir, ['.ts', '.html']);
    // Exclude vocabulary.constants.ts from this scan — it intentionally
    // mentions DB column names on the right side of VOCABULARY_MAP for
    // traceability (e.g. 'template_layers'). Test 3 already covers it
    // with a stricter rule on bare singular forms.
    const scanFiles = files.filter((f) => !f.endsWith('vocabulary.constants.ts'));
    const offenders: string[] = [];
    for (const file of scanFiles) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const banned of BANLIST) {
          // Match the bare word inside single OR double quotes only.
          // Allow templateLayer, slotKey, etc. (substrings of identifiers).
          const re = new RegExp(`(['"])${banned}\\1`);
          if (re.test(lines[i])) {
            offenders.push(`${path.relative(repoRoot, file)}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
