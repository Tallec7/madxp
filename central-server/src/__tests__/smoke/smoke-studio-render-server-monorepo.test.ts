/**
 * Smoke tests — studio-render-server vit comme sibling dans le monorepo.
 *
 * Garde-fou contre la régression "ah on a oublié, faut aller dans l'autre repo".
 * Documente que `studio-render-server/` est la **copie déployable** des templates
 * Remotion V1 (cf studio-render-server/README.md). Le workspace d'authoring
 * d'origine vit dans `studio-template/` (sibling repo, conservé volontairement).
 *
 * Si la structure ici se casse (suppression dossier, manifest manquant), le
 * worker `studio-render-worker.service.ts` côté centrale ne peut plus déléguer
 * proprement → ce smoke échoue tôt.
 */

import * as fs from 'fs';
import * as path from 'path';

// Depuis central-server/src/__tests__/smoke/, remonter à la racine du repo neopro.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const STUDIO_DIR = path.join(REPO_ROOT, 'studio-render-server');

describe('studio-render-server — monorepo lite scaffold', () => {
  it('directory exists at repo root', () => {
    expect(fs.existsSync(STUDIO_DIR)).toBe(true);
  });

  it.each([
    'package.json',
    'README.md',
    '.gitignore',
    'studio-poc/server.mjs',
    'src/index.ts',
    'scripts/link-assets.sh',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(STUDIO_DIR, rel))).toBe(true);
  });

  it('package.json exposes the studio:server script consumed by the central worker', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(STUDIO_DIR, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts?.['studio:server']).toBeDefined();
  });

  it('.gitignore excludes node_modules + assets binaires (public/*) — repo léger', () => {
    const gi = fs.readFileSync(path.join(STUDIO_DIR, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^node_modules\//m);
    expect(gi).toMatch(/^public\/\*/m);
    // Sinon le repo gonfle de 5 GB (sources .mov + masks PNG du workspace authoring).
  });

  it('contains the 3 V1 manifests vendored in templates/', () => {
    for (const slug of ['but_generique', 'entree_joueur', 'faits_de_jeu']) {
      const manifest = path.join(
        STUDIO_DIR,
        'src',
        'templates',
        slug,
        'manifest.json',
      );
      expect(fs.existsSync(manifest)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      expect(parsed.id).toBe(slug);
      expect(['video', 'still']).toContain(parsed.kind);
    }
  });
});
