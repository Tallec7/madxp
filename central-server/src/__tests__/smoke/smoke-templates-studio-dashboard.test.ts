/**
 * Smoke tests — Templates Studio V1 — UI Dashboard (S3).
 *
 * File-based : vérifie que la page Angular `/templates-studio/brand-kit` est
 * câblée correctement (route + composant + service consomment les bons
 * endpoints livrés en S2).
 *
 * Tourne dans la suite central-server (jest) pour bénéficier du gating
 * `test:smoke` standard — les tests Angular vrais (Karma) tournent à part.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DASHBOARD_FEATURE = path.join(
  REPO_ROOT,
  'central-dashboard',
  'src',
  'app',
  'features',
  'templates-studio',
);
const APP_ROUTES = path.join(
  REPO_ROOT,
  'central-dashboard',
  'src',
  'app',
  'app.routes.ts',
);

describe('Templates Studio V1 — dashboard feature scaffold (S3)', () => {
  it.each([
    'templates-studio.types.ts',
    'templates-studio.service.ts',
    'brand-kit/brand-kit.component.ts',
    'brand-kit/brand-kit.component.html',
    'brand-kit/brand-kit.component.scss',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(DASHBOARD_FEATURE, rel))).toBe(true);
  });

  it('service uses ApiService (no fetch() — invariant dashboard rule)', () => {
    const raw = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts'),
      'utf8',
    );
    // Strip JS/TS comments — les refs à `fetch()` en JSDoc/commentaires sont OK.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/from\s+['"][^'"]*core\/services\/api\.service['"]/);
    expect(code).not.toMatch(/\bfetch\(/);
  });

  it('service hits the V1 endpoints livrés en S2', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts'),
      'utf8',
    );
    // GET /api/templates-studio/sites/:siteId/brand-kit
    expect(content).toMatch(/\/templates-studio\/sites\/\$\{siteId\}\/brand-kit/);
    // GET /api/templates-studio/templates (catalogue)
    expect(content).toMatch(/['"]\/templates-studio\/templates['"]/);
  });

  it('brand-kit component validates hex pattern on colors (forme alignée Joi backend)', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'brand-kit/brand-kit.component.ts'),
      'utf8',
    );
    expect(content).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/);
  });

  it('brand-kit component takes site_id from auth.currentUser$ (never from body/URL)', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'brand-kit/brand-kit.component.ts'),
      'utf8',
    );
    // Aligné sur la sécurité backend : site_id du JWT, jamais saisi par l'user.
    expect(content).toMatch(/auth\.currentUser\$/);
    expect(content).toMatch(/user\?\.site_id/);
  });

  it('app.routes.ts wires /templates-studio/brand-kit with roleGuard', () => {
    const content = fs.readFileSync(APP_ROUTES, 'utf8');
    expect(content).toMatch(/path:\s*['"]templates-studio\/brand-kit['"]/);
    // Loaded lazy via loadComponent (split chunks dashboard)
    expect(content).toMatch(
      /loadComponent[\s\S]*templates-studio\/brand-kit\/brand-kit\.component/,
    );
    // Guard role obligatoire (la route gère du brand kit, accès limité)
    expect(content).toMatch(
      /path:\s*['"]templates-studio\/brand-kit['"][\s\S]*?canActivate:\s*\[roleGuard\]/,
    );
  });
});

describe('Templates Studio V1 — page studio principale (S3.2)', () => {
  const STUDIO_COMPONENT = path.join(
    DASHBOARD_FEATURE,
    'studio',
    'studio.component.ts',
  );

  it.each([
    'studio/studio.component.ts',
    'studio/studio.component.html',
    'studio/studio.component.scss',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(DASHBOARD_FEATURE, rel))).toBe(true);
  });

  it('studio component builds reactive form from manifest.inputSchema', () => {
    const content = fs.readFileSync(STUDIO_COMPONENT, 'utf8');
    expect(content).toMatch(/inputSchema/);
    expect(content).toMatch(/FormBuilder/);
  });

  it('studio component polls render status every 2s and stops on ready/failed', () => {
    const content = fs.readFileSync(STUDIO_COMPONENT, 'utf8');
    // Sans le poll : UI bloquée sur "rendering". Sans clearInterval : fuite
    // de timer quand l'user change de template.
    expect(content).toMatch(/setInterval\([\s\S]*?2_?000\)/);
    expect(content).toMatch(/snapshot\.status\s*===\s*['"]ready['"]/);
    expect(content).toMatch(/snapshot\.status\s*===\s*['"]failed['"]/);
    expect(content).toMatch(/clearInterval/);
  });

  it('studio component supports both video (<video>) and still (<img>) outputs', () => {
    // L'output viewer dispatch sur le `kind` du template. Sans ce check, un
    // still rendrait un <video> qui tente de jouer un PNG → erreur Chrome.
    const html = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'studio/studio.component.html'),
      'utf8',
    );
    expect(html).toMatch(/<video/);
    expect(html).toMatch(/<img/);
    expect(html).toMatch(/kind\s*===\s*['"]still['"]/);
  });

  it('studio component disables player ref inputs until S4 (roster joueurs)', () => {
    // Tant que S4 n'est pas livré, les bindings player.* ne peuvent pas être
    // remplis. On désactive l'input + message explicatif au lieu de laisser
    // l'user saisir un UUID au hasard qui retournera null côté résolveur.
    const html = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'studio/studio.component.html'),
      'utf8',
    );
    expect(html).toMatch(/isPlayerRef\(entry\.prop\)/);
    expect(html).toMatch(/S4/);
  });

  it('app.routes.ts wires /templates-studio (catalogue page) with roleGuard', () => {
    const content = fs.readFileSync(APP_ROUTES, 'utf8');
    // Match `path: 'templates-studio'` strict (sans /brand-kit derrière).
    expect(content).toMatch(/path:\s*['"]templates-studio['"]\s*,/);
    expect(content).toMatch(
      /loadComponent[\s\S]*templates-studio\/studio\/studio\.component/,
    );
  });
});
