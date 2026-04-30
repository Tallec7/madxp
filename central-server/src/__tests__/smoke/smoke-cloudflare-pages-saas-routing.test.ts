/**
 * Smoke tests — Cloudflare Pages SaaS routing (ADR-071 phase 3).
 *
 * Garde-fou : Cloudflare Pages n'honore pas le wildcard `_redirects`
 * `/saas/* /saas/index.html 200` pour les nested SPAs. Le routing prod sous
 * `/saas/*` repose sur 3 artefacts qui DOIVENT exister + 1 verify CI :
 *   1. Script `scripts/cloudflare-saas-route-stubs.sh` qui copie
 *      `dist/.../saas/index.html` à chaque path de route SaaS connue
 *   2. Pages Function `central-dashboard/cloudflare/functions/saas/[[catchall]].js`
 *      en mode fallback-only (404 → /saas/index.html)
 *   3. `package.json` script `build:cloudflare:prod` qui enchaîne ces 2 étapes
 *   4. Workflow `release.yml` qui copie functions vers `dist/central-dashboard/`
 *      et utilise `workingDirectory: dist/central-dashboard` côté wrangler
 *
 * Sans ces invariants, un dev pourrait casser le routing SaaS prod sans que
 * rien ne le détecte avant de revoir le bug en console (chunks MIME errors).
 *
 * Référence : docs/specs/services/cloudflare-pages-saas-routing.spec.md
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — Cloudflare Pages SaaS routing (ADR-071)', () => {
  // ------------ Route stubs script ------------

  it('script `cloudflare-saas-route-stubs.sh` exists and is executable', () => {
    const scriptPath = 'scripts/cloudflare-saas-route-stubs.sh';
    expect(exists(scriptPath)).toBe(true);
    const stat = fs.statSync(path.join(repoRoot, scriptPath));
    // chmod 755 → bit owner-execute (0o100) doit être set
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it('route stubs script covers all known SaaS routes (cf. raspberry/src/app/app.routes.ts)', () => {
    const script = read('scripts/cloudflare-saas-route-stubs.sh');
    // Routes single-segment SaaS — toute nouvelle route doit être ajoutée
    // ici ET dans le script en même temps.
    const requiredRoutes = ['login', 'remote', 'tv', 'secondary'];
    for (const route of requiredRoutes) {
      expect(script).toContain(route);
    }
    // display/:n couverte par la boucle for n in 0 1 2 3
    expect(/for n in 0 1 2 3/.test(script)).toBe(true);
    expect(script).toContain('display/$n');
  });

  it('route stubs script copies SaaS index.html (pas dashboard)', () => {
    const script = read('scripts/cloudflare-saas-route-stubs.sh');
    expect(script).toContain('dist/central-dashboard/browser/saas');
    expect(/cp\s+["']?\$SAAS_INDEX/.test(script)).toBe(true);
  });

  // ------------ Pages Function catchall ------------

  it('Pages Function catchall exists at expected path', () => {
    expect(
      exists('central-dashboard/cloudflare/functions/saas/[[catchall]].js'),
    ).toBe(true);
  });

  it('Pages Function exporte onRequest (contrat CF Pages)', () => {
    const fn = read('central-dashboard/cloudflare/functions/saas/[[catchall]].js');
    expect(/export\s+(const|async\s+function)\s+onRequest/.test(fn)).toBe(true);
    expect(fn).toContain('env.ASSETS.fetch(request)');
  });

  it('Pages Function détecte content-type mismatch sur asset request (guard cache poisoning)', () => {
    const fn = read('central-dashboard/cloudflare/functions/saas/[[catchall]].js');
    // Guard critique : si CF Pages auto-fallback intrinsèque sert HTML pour
    // une URL asset (`*.js`/`*.css`/etc.), retourner 404. Sans ça, `_headers`
    // `*.js → max-age=31536000, immutable` cache le HTML 1 an comme JS chunk.
    expect(fn).toContain('isAssetRequest');
    expect(fn).toContain('isHtmlResponse');
    // Court-circuit explicite : asset + HTML → notFoundResponse.
    expect(
      /isAssetRequest\(url\.pathname\)\s*&&\s*isHtmlResponse\(response\)[\s\S]{0,200}notFoundResponse/.test(
        fn,
      ),
    ).toBe(true);
    // Le 404 retourné doit avoir Cache-Control no-store.
    expect(/notFoundResponse[\s\S]{0,300}'Cache-Control':\s*'no-store'/.test(fn)).toBe(
      true,
    );
  });

  it('Pages Function strip les Link rel=modulepreload sur HTML responses', () => {
    const fn = read('central-dashboard/cloudflare/functions/saas/[[catchall]].js');
    // CF Pages auto-injecte des `Link: <chunk-X>; rel="modulepreload"` HTTP
    // headers depuis les `<link>` du HTML. Ces paths sont relatifs et se
    // résolvent côté browser RELATIVEMENT À L'URL DE LA RÉPONSE — donc cassés
    // pour toute deep route (`/saas/display/0/`, etc.). Le strip force le
    // browser à utiliser les `<link>` du body parsé avec `<base href="/saas/">`.
    expect(fn).toContain('stripModulePreloadLinks');
    expect(fn).toContain('rel="modulepreload"');
  });

  it('Pages Function override Cache-Control: no-store sur HTML response', () => {
    const fn = read('central-dashboard/cloudflare/functions/saas/[[catchall]].js');
    expect(fn).toContain('overrideCacheNoStore');
    expect(fn).toContain("'Cache-Control'");
    expect(fn).toContain("'no-store'");
  });

  // ------------ Pages Function ROOT catchall (Dashboard) ------------

  it('Pages Function ROOT catchall exists at expected path', () => {
    expect(
      exists('central-dashboard/cloudflare/functions/[[catchall]].js'),
    ).toBe(true);
  });

  it('Pages Function ROOT applique les mêmes guards que SaaS', () => {
    const fn = read('central-dashboard/cloudflare/functions/[[catchall]].js');
    expect(/export\s+(const|async\s+function)\s+onRequest/.test(fn)).toBe(true);
    expect(fn).toContain('env.ASSETS.fetch(request)');
    // Mêmes 3 helpers de défense : mismatch detect + strip preload + no-store
    expect(fn).toContain('isAssetRequest');
    expect(fn).toContain('isHtmlResponse');
    expect(fn).toContain('stripModulePreloadLinks');
    expect(fn).toContain('overrideCacheNoStore');
    expect(fn).toContain('notFoundResponse');
    // Court-circuit asset+HTML → 404 (idem SaaS)
    expect(
      /isAssetRequest\(url\.pathname\)\s*&&\s*isHtmlResponse\(response\)[\s\S]{0,200}notFoundResponse/.test(
        fn,
      ),
    ).toBe(true);
  });

  it('_redirects ne contient PAS la règle `/* /index.html 200`', () => {
    // La règle SPA fallback racine est désormais gérée par la Pages Function
    // root (avec guard asset). Garder la règle en plus créerait un double
    // fallback non-guardé qui empoisonnerait le cache via `_headers` immutable.
    const redirects = read('central-dashboard/cloudflare/_redirects');
    expect(/^\s*\/\*\s+\/index\.html\s+200/m.test(redirects)).toBe(false);
  });

  // ------------ build:cloudflare:prod ------------

  it('package.json `build:cloudflare:prod` enchaîne route stubs + functions copy', () => {
    const pkg = JSON.parse(read('package.json'));
    const buildScript: string | undefined = pkg.scripts?.['build:cloudflare:prod'];
    expect(buildScript).toBeDefined();
    expect(buildScript).toContain('scripts/cloudflare-saas-route-stubs.sh');
    // Copie des Functions vers dist/central-dashboard/functions/ (sibling
    // du upload dir, requis pour wrangler --workingDirectory).
    expect(buildScript).toContain('dist/central-dashboard/functions/saas');
    expect(buildScript).toContain('[[catchall]].js');
    // ROOT catchall doit être copié aussi (PR cache poisoning suite).
    expect(buildScript).toMatch(
      /dist\/central-dashboard\/functions\/\[\[catchall\]\]\.js/,
    );
  });

  // ------------ release.yml workflow ------------

  it('release.yml job `deploy-frontend-cloudflare` configure workingDirectory', () => {
    const workflow = read('.github/workflows/release.yml');
    expect(workflow).toContain('deploy-frontend-cloudflare:');
    // workingDirectory: dist/central-dashboard pour que wrangler auto-détecte
    // le sibling functions/ (cf. ADR-071 phase 3).
    expect(workflow).toContain('workingDirectory: dist/central-dashboard');
  });

  it('release.yml `Verify build output` checke la présence des 2 Pages Functions (saas + root)', () => {
    const workflow = read('.github/workflows/release.yml');
    expect(workflow).toMatch(
      /test\s+-s\s+['"]dist\/central-dashboard\/functions\/saas\/\[\[catchall\]\]\.js['"]/,
    );
    expect(workflow).toMatch(
      /test\s+-s\s+['"]dist\/central-dashboard\/functions\/\[\[catchall\]\]\.js['"]/,
    );
  });

  it('release.yml `Verify deployment` est content-aware (assert_saas_html avec curl -L)', () => {
    const workflow = read('.github/workflows/release.yml');
    // Function bash assert_saas_html doit exister
    expect(workflow).toContain('assert_saas_html()');
    // curl avec -L pour suivre les 308 redirects Cloudflare (route stubs)
    expect(/curl\s+-sL\s+-A\s+["']neopro-ci-verify/.test(workflow)).toBe(true);
    // L'assertion doit checker `<base href="/saas/">` côté HTML pour
    // détecter un faux positif (200 mais HTML dashboard servi).
    expect(workflow).toContain('base href="/saas/"');
  });

  it('release.yml gate les jobs Hostinger sur vars.HOSTING != "cloudflare"', () => {
    const workflow = read('.github/workflows/release.yml');
    // Les 2 jobs Hostinger lftp doivent être gated pour permettre la bascule
    // par flippage de vars.HOSTING (cf. ADR-071 phase 2).
    expect(/deploy-dashboard:[\s\S]{0,500}vars\.HOSTING\s*!=\s*['"]cloudflare/.test(workflow)).toBe(
      true,
    );
    expect(/deploy-saas:[\s\S]{0,500}vars\.HOSTING\s*!=\s*['"]cloudflare/.test(workflow)).toBe(
      true,
    );
  });

  // ------------ SPEC ------------

  it('SPEC `cloudflare-pages-saas-routing` exists', () => {
    expect(exists('docs/specs/services/cloudflare-pages-saas-routing.spec.md')).toBe(true);
  });
});
