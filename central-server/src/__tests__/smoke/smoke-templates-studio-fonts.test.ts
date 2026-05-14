/**
 * Smoke tests — ADR-127 Templates Studio fonts custom (Phase 1.6).
 *
 * Vérifie que la chaîne hook → manifest → composition → controller MIME →
 * dashboard est cohérente. File-based (no DB / HTTP).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const TEMPLATES_STUDIO_DIR = path.resolve(__dirname, '..', '..', '..', 'templates-studio');
const DASHBOARD_SRC = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'central-dashboard',
  'src',
  'app',
);

const HOOK_FILE = path.join(TEMPLATES_STUDIO_DIR, 'lib', 'useCustomFont.ts');
const FAITS_MANIFEST = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'faits_de_jeu',
  'manifest.json',
);
const FAITS_COMPOSITION = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'faits_de_jeu',
  'Composition.tsx',
);
const CONTROLLER_FILE = path.join(
  SRC,
  'controllers',
  'templates-studio.controller.ts',
);
const ADMIN_LIBRARY_COMPONENT = path.join(
  DASHBOARD_SRC,
  'features',
  'templates-studio',
  'admin',
  'asset-library',
  'asset-library.component.ts',
);
const ADMIN_BINDINGS_COMPONENT = path.join(
  DASHBOARD_SRC,
  'features',
  'templates-studio',
  'admin',
  'template-bindings',
  'template-bindings.component.ts',
);

describe('ADR-127 — useCustomFont hook', () => {
  it('hook file exists at templates-studio/lib/useCustomFont.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('exporte useCustomFont(family, url): void', () => {
    const content = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(content).toMatch(
      /export\s+function\s+useCustomFont\s*\(\s*family\s*:\s*string\s*,\s*url\s*:\s*string\s*\|\s*null\s*\|\s*undefined\s*\)\s*:\s*void/,
    );
  });

  it('utilise delayRender + continueRender pour bloquer le render Remotion', () => {
    const content = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(content).toMatch(/from\s+['"]remotion['"]/);
    expect(content).toMatch(/\bdelayRender\s*\(/);
    expect(content).toMatch(/\bcontinueRender\s*\(/);
  });

  it('utilise FontFace + document.fonts.add pour register la font', () => {
    const content = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(content).toMatch(/new\s+FontFace\s*\(/);
    expect(content).toMatch(/document\.fonts/);
  });

  it('continueRender même si url est null ou load fail (fallback CSS, pas crash)', () => {
    const content = fs.readFileSync(HOOK_FILE, 'utf8');
    // Le handle doit toujours être libéré, sinon Remotion timeout (default 28s).
    // Cherche un continueRender dans la branche `!url` et dans le `.catch`.
    // Pattern : `if (!url) { ... continueRender(handle); ... return; }` — on
    // veut s'assurer que les 2 lignes apparaissent ensemble avant le return.
    expect(content).toMatch(
      /if\s*\(\s*!url\s*\)\s*\{[\s\S]*?continueRender\s*\([\s\S]*?return;/,
    );
    expect(content).toMatch(/\.catch\s*\([\s\S]*?continueRender/);
  });
});

describe('ADR-127 — manifest faits_de_jeu déclare slot font', () => {
  const manifest = JSON.parse(fs.readFileSync(FAITS_MANIFEST, 'utf8'));

  it('inclut un slot bulevarFont avec mime font/woff2 et fontFamily Bulevar', () => {
    const slot = manifest.requiredAssets.find(
      (a: { key: string }) => a.key === 'bulevarFont',
    );
    expect(slot).toBeDefined();
    expect(slot.mime).toBe('font/woff2');
    expect(slot.fontFamily).toBe('Bulevar');
    expect(slot.filename).toBe('Bulevar.woff2');
  });

  it('tout slot avec mime font/* doit avoir un fontFamily déclaré', () => {
    for (const slot of manifest.requiredAssets) {
      const isFont =
        typeof slot.mime === 'string' &&
        (slot.mime.startsWith('font/') ||
          slot.mime.startsWith('application/font-') ||
          slot.mime.startsWith('application/x-font-'));
      if (isFont) {
        expect(typeof slot.fontFamily).toBe('string');
        expect(slot.fontFamily.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('ADR-127 — Composition faits_de_jeu charge la font', () => {
  const raw = fs.readFileSync(FAITS_COMPOSITION, 'utf8');
  const content = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('importe useCustomFont depuis ../../lib/useCustomFont', () => {
    expect(content).toMatch(
      /import\s+\{\s*useCustomFont\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/useCustomFont['"]/,
    );
  });

  it('invoque useCustomFont avec Bulevar et assets.bulevarFont', () => {
    expect(content).toMatch(
      /useCustomFont\s*\(\s*['"]Bulevar['"]\s*,\s*assets\.bulevarFont\s*\)/,
    );
  });
});

describe('ADR-127 — Controller upload accepte les MIME font', () => {
  const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');

  it('ASSET_ALLOWED_MIMES_PREFIX inclut font/ et application/font- et application/x-font-', () => {
    // Match le bloc d'array et vérifie chaque entrée
    const arrayMatch = content.match(
      /ASSET_ALLOWED_MIMES_PREFIX\s*=\s*\[([\s\S]*?)\]/,
    );
    expect(arrayMatch).not.toBeNull();
    const arr = arrayMatch![1];
    expect(arr).toMatch(/['"]font\/['"]/);
    expect(arr).toMatch(/['"]application\/font-['"]/);
    expect(arr).toMatch(/['"]application\/x-font-['"]/);
  });

  it.each([
    'font/woff2',
    'font/woff',
    'font/ttf',
    'application/font-woff2',
    'application/x-font-woff',
    'application/x-font-ttf',
  ])('ASSET_ALLOWED_EXTRA_MIMES inclut explicitement %s', (mime) => {
    const extraMatch = content.match(
      /ASSET_ALLOWED_EXTRA_MIMES\s*=\s*\[([\s\S]*?)\]/,
    );
    expect(extraMatch).not.toBeNull();
    expect(extraMatch![1]).toMatch(new RegExp(`['"]${mime.replace(/[+/]/g, '\\$&')}['"]`));
  });

  it('extForMime mappe font/woff2 → woff2, font/ttf → ttf', () => {
    expect(content).toMatch(/['"]font\/woff2['"]\s*:\s*['"]woff2['"]/);
    expect(content).toMatch(/['"]font\/ttf['"]\s*:\s*['"]ttf['"]/);
  });
});

describe('ADR-127 — Frontend Angular gère le filtre font', () => {
  it('AssetLibraryComponent expose un chip type "font" en plus de image/video', () => {
    const content = fs.readFileSync(ADMIN_LIBRARY_COMPONENT, 'utf8');
    // L'union type doit inclure 'font'
    expect(content).toMatch(/'all'\s*\|\s*'image'\s*\|\s*'video'\s*\|\s*'font'/);
    // Et un chip dans la liste UI
    expect(content).toMatch(/id:\s*['"]font['"]/);
  });

  it('TemplateBindingsComponent isFont() helper pour les slots font', () => {
    const content = fs.readFileSync(ADMIN_BINDINGS_COMPONENT, 'utf8');
    // Le helper doit exister pour différencier les slots font dans le template HTML
    expect(content).toMatch(/isFont\s*\(/);
  });
});
