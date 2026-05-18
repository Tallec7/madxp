/**
 * Smoke tests — Templates Studio assets filesystem cache (ADR-130).
 *
 * Garde-fous file-based pour empêcher la régression du contrat suivant :
 *   1. Un mini serveur HTTP localhost démarre au boot du worker render
 *   2. Tous les assets bound (file + directory) sont préchargés en async
 *   3. `resolveTemplateAssets` consulte le cache local AVANT le FTP public
 *   4. Sans cache hit, fallback FTP (comportement legacy préservé)
 *
 * Sans ce cache, render `but_generique` ~14 min sur Railway Hobby (mesuré
 * 2026-05-18, dad5bb1f-e3cb-40f5-bfd9-a82e00159a7e = 890 s) parce que
 * Chromium re-télécharge à chaque render le mask `joueur-but-c-clean`
 * qui pèse 1.3 GB.
 *
 * Le test ne charge PAS le service (qui démarrerait un HTTP server) —
 * lecture file-based pure.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const CACHE_SERVICE = path.join(SRC, 'services', 'studio-assets-cache.service.ts');
const WORKER = path.join(SRC, 'services', 'studio-render-worker.service.ts');
const REPO = path.join(SRC, 'repositories', 'templates-studio.repository.ts');

const cacheServiceSrc = fs.readFileSync(CACHE_SERVICE, 'utf8');
const workerSrc = fs.readFileSync(WORKER, 'utf8');
const repoSrc = fs.readFileSync(REPO, 'utf8');

describe('ADR-130 — studio-assets-cache.service.ts contract', () => {
  it('exists', () => {
    expect(fs.existsSync(CACHE_SERVICE)).toBe(true);
  });

  it.each([
    ['startStudioCacheServer', /export\s+function\s+startStudioCacheServer/],
    ['stopStudioCacheServer', /export\s+function\s+stopStudioCacheServer/],
    ['preloadStudioAssets', /export\s+async\s+function\s+preloadStudioAssets/],
    ['getCachedAssetUrl', /export\s+function\s+getCachedAssetUrl/],
  ])('exporte %s', (_label, pattern) => {
    expect(cacheServiceSrc).toMatch(pattern);
  });

  it('écoute UNIQUEMENT sur 127.0.0.1 (jamais 0.0.0.0)', () => {
    // Sécurité : le cache server contient des assets internes, il ne doit
    // jamais être exposé sur l'interface publique.
    expect(cacheServiceSrc).toMatch(/listen\([^)]*['"]127\.0\.0\.1['"]/);
    expect(cacheServiceSrc).not.toMatch(/listen\([^)]*['"]0\.0\.0\.0['"]/);
  });

  it('sanitise les paths (anti path traversal)', () => {
    // Cache server expose un endpoint HTTP qui sert des fichiers locaux. Sans
    // sanitization, un attaquant local pourrait fetch /etc/passwd via une
    // URL avec ../../../. Le test exige un check explicit du filename.
    expect(cacheServiceSrc).toMatch(/SAFE_FILENAME_RE/);
    expect(cacheServiceSrc).toMatch(/[a-zA-Z0-9._-]/);
  });

  it('uniqueAssetIds dedup les bindings (asset partagé entre templates)', () => {
    // packshot-img + fonts sont partagés entre but_generique et entree_joueur
    // → 1 download seulement, pas 2.
    expect(cacheServiceSrc).toMatch(/new Set\(/);
  });

  it('skip les assets déjà cachés via comparaison de taille (resume crash)', () => {
    expect(cacheServiceSrc).toMatch(/isAlreadyCached/);
    expect(cacheServiceSrc).toMatch(/asset\.file_size/);
  });

  it('atomic rename .part → final pour éviter les fichiers tronqués', () => {
    // Sans le rename atomique, un crash mid-download laisserait un fichier
    // tronqué qui passerait isAlreadyCached et serait servi au worker.
    expect(cacheServiceSrc).toMatch(/\.part/);
    expect(cacheServiceSrc).toMatch(/fs\.rename/);
  });
});

describe('ADR-130 — studio-render-worker plugged into cache', () => {
  it('importe les 3 fonctions cache depuis le service', () => {
    expect(workerSrc).toMatch(/import\s*\{[^}]*getCachedAssetUrl[^}]*\}\s*from\s*['"]\.\/studio-assets-cache\.service['"]/s);
    expect(workerSrc).toMatch(/preloadStudioAssets/);
    expect(workerSrc).toMatch(/startStudioCacheServer/);
  });

  it('démarre le cache server puis preload au boot (after prewarmStudioBundle)', () => {
    // Ordre attendu : prewarmStudioBundle() puis startStudioCacheServer() puis
    // preloadStudioAssets() — le prewarm bundle peut tourner en parallèle, le
    // preload assets peut bloquer plusieurs minutes au boot (1.3 GB cross-region).
    const prewarmIdx = workerSrc.indexOf('prewarmStudioBundle()');
    const startCacheIdx = workerSrc.indexOf('startStudioCacheServer()');
    expect(prewarmIdx).toBeGreaterThan(-1);
    expect(startCacheIdx).toBeGreaterThan(-1);
    expect(startCacheIdx).toBeGreaterThan(prewarmIdx);
  });

  it('skip le preload en NODE_ENV=test (anti webpack cache corruption issue #1008)', () => {
    // Mêmes contraintes que prewarmStudioBundle : ne pas démarrer en jest.
    const lines = workerSrc.split('\n');
    const cacheLineIdx = lines.findIndex((l) => l.includes('startStudioCacheServer()'));
    expect(cacheLineIdx).toBeGreaterThan(-1);
    // Le bloc qui contient ces 2 appels doit être gardé par un check
    // NODE_ENV !== 'test'. On vérifie qu'un tel guard existe avant l'appel.
    const before = lines.slice(0, cacheLineIdx).join('\n');
    expect(before).toMatch(/NODE_ENV\s*!==\s*['"]test['"]/);
  });

  it('resolveTemplateAssets consulte getCachedAssetUrl AVANT getFtpPublicUrl', () => {
    // Ordre source critique : si on inverse, le fallback FTP est toujours
    // pris et le cache devient inutile (mais sans erreur visible).
    const resolveSection = workerSrc.split('async function resolveTemplateAssets')[1] ?? '';
    expect(resolveSection).toMatch(/getCachedAssetUrl/);
    const cachedIdx = resolveSection.indexOf('getCachedAssetUrl');
    const ftpIdx = resolveSection.indexOf('getFtpPublicUrl');
    expect(cachedIdx).toBeGreaterThan(-1);
    expect(ftpIdx).toBeGreaterThan(-1);
    expect(cachedIdx).toBeLessThan(ftpIdx);
  });

  it('garde le fallback getFtpPublicUrl (comportement legacy si cache miss)', () => {
    // Sans ce fallback, un cache miss = render bloqué. Le cache doit rester
    // optionnel pour préserver la robustesse pre-ADR-130.
    expect(workerSrc).toMatch(/cachedUrl\s*\?\?\s*getFtpPublicUrl/);
  });

  it('utilise crf: 23 (pas 18 quasi-lossless)', () => {
    expect(workerSrc).toMatch(/crf:\s*23\b/);
    expect(workerSrc).not.toMatch(/crf:\s*18\b/);
  });
});

describe('ADR-130 — TemplateAssetBindingRepository.findAll()', () => {
  it('exposé sur le repository (préchargement consomme tous les bindings)', () => {
    // Sans findAll(), le cache service ne peut pas découvrir l'ensemble des
    // assets à précharger — il itererait template par template, plus fragile.
    expect(repoSrc).toMatch(/async\s+findAll\s*\(\s*\)\s*:\s*Promise/);
    // Et la requête doit lire toute la table sans WHERE (sinon dedup partiel).
    const findAllSection = repoSrc.split('async findAll')[1]?.slice(0, 500) ?? '';
    expect(findAllSection).toMatch(/FROM\s+studio_template_asset_bindings/);
    expect(findAllSection).not.toMatch(/WHERE/);
  });
});
