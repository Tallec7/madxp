/**
 * ADR-126 — Smoke guard : la résolution `web_page` / `livestream` synthétique
 * (helper `resolveAndStripWebContent`) doit être câblée dans les 2 builders
 * Pi-bound de `profile-sync.service.ts` :
 *
 *  - `buildEnrichedNeoProContent` → utilisé pour `update_config` (push fresh
 *    config au Pi après mutation server-side).
 *  - `sendSyncProfilesToSite` → utilisé pour `sync_profiles` à la reconnexion
 *    d'un Pi avec >1 profil.
 *
 * Sans ce câblage, les entrées web_page stockées en synthétique arrivent brutes
 * au Pi, sont droppées par le filtre défensif TV-side (Phase 0.5) comme
 * placeholders, et la page n'est jamais affichée.
 *
 * Ordre critique dans `buildEnrichedNeoProContent` : le helper DOIT s'exécuter
 * AVANT `normalizeConfigVideoPaths`, sinon un synthetic nu tombe dans le
 * pattern legacy `videos/default/` et casse la résolution.
 *
 * Référence : ADR-126, SPEC `docs/specs/features/web-live-content.spec.md`.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Smoke — web-content resolve on Pi-bound channels (ADR-126)', () => {
  const sourcePath = path.join(__dirname, '..', '..', 'services', 'profile-sync.service.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('imports the resolve + strip helpers from strip-synthetic-web-content', () => {
    expect(source).toMatch(/collectSyntheticWebContentFilenames/);
    expect(source).toMatch(/resolveSyntheticWebContent/);
    expect(source).toMatch(/stripSyntheticWebContent/);
    expect(source).toMatch(
      /from\s+['"]\.\.\/utils\/strip-synthetic-web-content['"]/,
    );
  });

  it('imports videoRepository for findWebContentByFilenames lookup', () => {
    expect(source).toMatch(
      /import\s+\{\s*videoRepository\s*\}\s+from\s+['"]\.\.\/repositories\/video\.repository['"]/,
    );
  });

  it('defines the shared resolveAndStripWebContent helper', () => {
    expect(source).toMatch(/async\s+function\s+resolveAndStripWebContent\s*\(/);
  });

  it('helper calls collect → findWebContent → resolve → strip in that order', () => {
    const helperBody = source.match(
      /async\s+function\s+resolveAndStripWebContent[\s\S]+?^}/m,
    )?.[0];
    expect(helperBody).toBeDefined();
    const idxCollect = helperBody!.indexOf('collectSyntheticWebContentFilenames');
    const idxLookup = helperBody!.indexOf('findWebContentByFilenames');
    const idxResolve = helperBody!.indexOf('resolveSyntheticWebContent');
    const idxStrip = helperBody!.indexOf('stripSyntheticWebContent');
    expect(idxCollect).toBeGreaterThan(-1);
    expect(idxLookup).toBeGreaterThan(idxCollect);
    expect(idxResolve).toBeGreaterThan(idxLookup);
    expect(idxStrip).toBeGreaterThan(idxResolve);
  });

  it('buildEnrichedNeoProContent calls resolveAndStripWebContent BEFORE normalizeConfigVideoPaths', () => {
    // Extrait depuis le début de la fonction jusqu'à la fin du fichier (la
    // fonction est la dernière du module). Pas de regex sur `^}` car le match
    // lazy `+?` peut être coupé court par un `}` au début de ligne d'une
    // fonction précédente capturée par inadvertance.
    const startIdx = source.indexOf('export async function buildEnrichedNeoProContent');
    expect(startIdx).toBeGreaterThan(-1);
    const fnBody = source.slice(startIdx);
    // On cherche les appels (`name(`) — pas la mention textuelle, car le
    // commentaire ADR-103 mentionne `normalizeConfigVideoPaths` AVANT
    // d'appeler `resolveAndStripWebContent`, et `indexOf` matcherait le
    // commentaire au lieu de l'appel réel.
    const idxResolveCall = fnBody.search(/resolveAndStripWebContent\s*\(/);
    const idxNormalizeCall = fnBody.search(/normalizeConfigVideoPaths\s*\(/);
    expect(idxResolveCall).toBeGreaterThan(-1);
    expect(idxNormalizeCall).toBeGreaterThan(-1);
    expect(idxResolveCall).toBeLessThan(idxNormalizeCall);
  });

  it('sendSyncProfilesToSite calls resolveAndStripWebContent in the per-profile loop', () => {
    const startIdx = source.indexOf('export async function sendSyncProfilesToSite');
    const endIdx = source.indexOf('export async function buildEnrichedNeoProContent');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const fnBody = source.slice(startIdx, endIdx);
    expect(fnBody).toMatch(/resolveAndStripWebContent\s*\(/);
  });
});
