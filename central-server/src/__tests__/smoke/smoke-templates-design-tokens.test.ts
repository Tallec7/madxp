/**
 * Smoke test — Templates Design Tokens (audit P0 design 2026-05-07)
 *
 * Garde-fou anti-régression :
 * - Aucun hex hardcoded #7c3aed/#6d28d9/#fef2f2/#ede9fe/#5b21b6 dans les composants Template Studio.
 * - Tokens --studio-accent-* déclarés dans styles.scss.
 * - Hit zones reorder layers panel ≥ 40px (WCAG AA).
 *
 * SEE: docs/audits/templates-remotion-audit-2026-05-07.md
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../../');
const TEMPLATES_DIR = resolve(
  ROOT,
  'central-dashboard/src/app/features/content/remotion-templates'
);

const SCOPED_FILES = [
  'studio-v2/admin/admin-layers-panel.component.ts',
  'studio-v2/admin/admin-field-editor.component.ts',
  'studio-v2/admin/admin-canvas-overlay.component.ts',
  'studio-v2/admin/admin-variants-panel.component.ts',
  'studio-v2/admin/admin-studio-panel.component.ts',
  'studio-v2/admin/create-template-wizard.component.ts',
  'template-card.component.ts',
  'my-templates.component.ts',
  'template-props-form.component.ts',
];

const BANNED_HEX = /#(7c3aed|6d28d9|fef2f2|ede9fe|5b21b6)\b/i;

describe('smoke-templates-design-tokens', () => {
  it.each(SCOPED_FILES)('no banned hex in %s', (rel) => {
    const content = readFileSync(resolve(TEMPLATES_DIR, rel), 'utf8');
    const match = content.match(BANNED_HEX);
    expect(match).toBeNull();
  });

  it('--studio-accent-* tokens declared in styles.scss', () => {
    const styles = readFileSync(
      resolve(ROOT, 'central-dashboard/src/styles.scss'),
      'utf8'
    );
    expect(styles).toMatch(/--studio-accent-50:/);
    expect(styles).toMatch(/--studio-accent-500:\s*#7c3aed/);
    expect(styles).toMatch(/--studio-accent-600:\s*#6d28d9/);
    expect(styles).toMatch(/--studio-danger-bg:/);
    expect(styles).toMatch(/--studio-disabled-bg:/);
  });

  it('alp__reorder hit zone is at least 40x40 (WCAG AA)', () => {
    const layers = readFileSync(
      resolve(TEMPLATES_DIR, 'studio-v2/admin/admin-layers-panel.component.ts'),
      'utf8'
    );
    // Match `.alp__reorder { width: 40px; height: 40px;` (allow other props between)
    expect(layers).toMatch(/\.alp__reorder\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/);
  });

  it('alp__reorder:disabled has cursor: not-allowed', () => {
    const layers = readFileSync(
      resolve(TEMPLATES_DIR, 'studio-v2/admin/admin-layers-panel.component.ts'),
      'utf8'
    );
    expect(layers).toMatch(/\.alp__reorder:disabled\s*\{[^}]*cursor:\s*not-allowed/);
  });
});
