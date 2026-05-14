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

  it('studio component dispatches player ref bindings to <app-player-picker> (S4-D wired)', () => {
    // Avant S4-D : input disabled avec placeholder "S4 à venir".
    // Après S4-D : <app-player-picker> branché via ControlValueAccessor.
    const html = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'studio/studio.component.html'),
      'utf8',
    );
    expect(html).toMatch(/isPlayerRef\(entry\.prop\)/);
    expect(html).toMatch(/<app-player-picker/);
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

describe('Templates Studio V1 — S4-D roster UI + PlayerPicker', () => {
  const PLAYERS_COMPONENT = path.join(
    DASHBOARD_FEATURE,
    'players',
    'players.component.ts',
  );
  const PLAYER_PICKER = path.join(
    DASHBOARD_FEATURE,
    'shared',
    'player-picker.component.ts',
  );
  const STUDIO_HTML = path.join(
    DASHBOARD_FEATURE,
    'studio',
    'studio.component.html',
  );

  it.each([
    'players/players.component.ts',
    'players/players.component.html',
    'players/players.component.scss',
    'shared/player-picker.component.ts',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(DASHBOARD_FEATURE, rel))).toBe(true);
  });

  it('PlayerPicker implements ControlValueAccessor (Reactive Forms compatible)', () => {
    // Sans CVA, le composant ne se branche pas dans `[formControlName]` du
    // studio → pas d'integration possible avec le form auto-gen.
    const content = fs.readFileSync(PLAYER_PICKER, 'utf8');
    expect(content).toMatch(/ControlValueAccessor/);
    expect(content).toMatch(/NG_VALUE_ACCESSOR/);
    expect(content).toMatch(/writeValue/);
    expect(content).toMatch(/registerOnChange/);
  });

  it('PlayerPicker filters by cutout_status when onlyWithCutout=true', () => {
    // Garde-fou : un template BUT a besoin d'une photo détourée. Le PlayerPicker
    // doit pouvoir restreindre aux joueurs prêts pour ne pas exposer un choix
    // qui retournerait null côté résolveur (cutoutUrl).
    const content = fs.readFileSync(PLAYER_PICKER, 'utf8');
    expect(content).toMatch(/onlyWithCutout/);
    expect(content).toMatch(/cutout_status\s*===\s*['"]ready['"]/);
  });

  it('studio.component HTML uses <app-player-picker> for player ref bindings', () => {
    // Vérifie le wire-up : le placeholder "S4 à venir" est remplacé par le
    // vrai composant. Sans ça, les bindings player.* restent inutilisables UI.
    const html = fs.readFileSync(STUDIO_HTML, 'utf8');
    expect(html).toMatch(/<app-player-picker/);
    expect(html).toMatch(/\[siteId\]="siteId\(\)"/);
    // Le placeholder texte doit avoir disparu (anti-régression).
    expect(html).not.toMatch(/UUID du joueur \(S4/);
  });

  it('players component takes site_id from auth.currentUser$ (tenant guard)', () => {
    // Aligné backend : site_id du JWT, jamais saisi par l'user. Sans ce check,
    // un user pourrait potentiellement viser un autre site dans l'URL (mais le
    // backend bloquerait via requireClubScope quand même).
    const content = fs.readFileSync(PLAYERS_COMPONENT, 'utf8');
    expect(content).toMatch(/auth\.currentUser\$/);
    expect(content).toMatch(/user\?\.site_id/);
  });

  it('service exposes player CRUD methods (listPlayers/createPlayer/updatePlayer/deletePlayer)', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts'),
      'utf8',
    );
    expect(content).toMatch(/listPlayers\(/);
    expect(content).toMatch(/createPlayer\(/);
    expect(content).toMatch(/updatePlayer\(/);
    expect(content).toMatch(/deletePlayer\(/);
    // Et tape les bons endpoints
    expect(content).toMatch(/\/templates-studio\/sites\/\$\{siteId\}\/players/);
  });

  it('app.routes.ts wires /templates-studio/players with roleGuard + lazy', () => {
    const content = fs.readFileSync(APP_ROUTES, 'utf8');
    expect(content).toMatch(/path:\s*['"]templates-studio\/players['"]/);
    expect(content).toMatch(
      /loadComponent[\s\S]*templates-studio\/players\/players\.component/,
    );
  });
});

describe('Templates Studio V1 — S4-B upload photo UI', () => {
  it('service exposes uploadPlayerPhoto via FormData (multipart)', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts'),
      'utf8',
    );
    expect(content).toMatch(/uploadPlayerPhoto\(/);
    expect(content).toMatch(/new\s+FormData\(\)/);
    expect(content).toMatch(/form\.append\(['"]photo['"]/);
    // Le pattern endpoint matche le backend
    expect(content).toMatch(/\/templates-studio\/sites\/\$\{siteId\}\/players\/\$\{playerId\}\/photo/);
  });

  it('players page uses ApiService.upload (not raw fetch — invariant dashboard)', () => {
    const content = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts'),
      'utf8',
    );
    // Strip comments
    const code = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Verify upload() de l'ApiService est utilisé
    expect(code).toMatch(/this\.api\s*\.\s*upload</);
    expect(code).not.toMatch(/\bfetch\(/);
  });

  it('players component accepts only image/* mimes on the file input', () => {
    const html = fs.readFileSync(
      path.join(DASHBOARD_FEATURE, 'players/players.component.html'),
      'utf8',
    );
    // Restreint à JPEG/PNG/WebP — aligné avec ALLOWED_PHOTO_MIMES backend
    expect(html).toMatch(/accept="image\/jpeg,image\/png,image\/webp"/);
  });
});
