/**
 * Smoke tests — Templates Studio V1 — distribution multi-sites des renders.
 *
 * Couvre :
 *  - Route `POST /api/templates-studio/render-requests/:id/distribute` câblée
 *    avec `authenticate` + `validateParams` + `validate(...distributeRender)`.
 *  - Controller `distributeRender` exporté, ne casse pas les invariants
 *    multi-tenant (tenant guard sur render.site_id pour les club users).
 *  - Service frontend expose `distributeRender` et tape le bon endpoint.
 *  - Studio component a le bouton + la modal câblés.
 *
 * Pattern réutilisé : ADR-082 (`video_club_grants.addGrant`) côté grant mode.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const CONTROLLER_FILE = path.join(
  SRC,
  'controllers',
  'templates-studio.controller.ts',
);
const ROUTES_FILE = path.join(SRC, 'routes', 'templates-studio.routes.ts');
const VALIDATION_FILE = path.join(SRC, 'middleware', 'validation.ts');
const REPO_FILE = path.join(SRC, 'repositories', 'video.repository.ts');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DASHBOARD_FEATURE = path.join(
  REPO_ROOT,
  'central-dashboard',
  'src',
  'app',
  'features',
  'templates-studio',
);
const SERVICE_FILE = path.join(DASHBOARD_FEATURE, 'templates-studio.service.ts');
const TYPES_FILE = path.join(DASHBOARD_FEATURE, 'templates-studio.types.ts');
const STUDIO_COMPONENT = path.join(
  DASHBOARD_FEATURE,
  'studio',
  'studio.component.ts',
);
const STUDIO_HTML = path.join(
  DASHBOARD_FEATURE,
  'studio',
  'studio.component.html',
);
const MODAL_FILE = path.join(
  DASHBOARD_FEATURE,
  'shared',
  'distribute-render-modal.component.ts',
);

describe('Templates Studio V1 — distribute backend wiring', () => {
  it('validation.ts exposes templatesStudioSchemas.distributeRender with mode/site_ids/category', () => {
    const content = fs.readFileSync(VALIDATION_FILE, 'utf8');
    // Le schéma doit exister et avoir les 3 champs requis
    expect(content).toMatch(/distributeRender:\s*Joi\.object\(/);
    expect(content).toMatch(/mode:\s*Joi\.string\(\)\.valid\(['"]push['"],\s*['"]grant['"]\)/);
    // site_ids array d'UUIDs avec min 1
    expect(content).toMatch(/site_ids:\s*Joi\.array\(\)\.items\(Joi\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  });

  it('controller exports distributeRender handler', () => {
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/export\s+const\s+distributeRender\s*=/);
  });

  it('controller distributeRender enforces tenant guard for non-internal roles', () => {
    // Un club user ne peut distribuer que ses propres renders. Sans ce check,
    // un user `club` connaissant un render_id pourrait déclencher la création
    // de rows videos sur N'IMPORTE quel site.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/render\.site_id\s*!==\s*req\.user\.site_id/);
    expect(content).toMatch(/isInternalRole\(req\.user\.role\)/);
  });

  it('controller distributeRender refuses renders not in `ready` status', () => {
    // Distribuer un render queued/rendering/failed n'a pas de sens : pas
    // d'output_url disponible → garbage côté videos.storage_path.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/render\.status\s*!==\s*['"]ready['"]/);
  });

  it('controller uses videoClubGrantRepository.addGrant for the grant mode (ADR-082)', () => {
    // Réutilise le pattern existant (INSERT ... ON CONFLICT DO NOTHING) pour
    // garantir l'idempotence et rester aligné sur les autres surfaces grants.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/videoClubGrantRepository\.addGrant\(/);
  });

  it('controller uses videoRepository.create for the push mode', () => {
    // 1 row videos par site cible côté push — `uploaded_for_site_id` non-null.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/videoRepository\.create\(/);
  });

  it('controller is idempotent: checks findByStoragePathForSite before insert', () => {
    // Sans ce check, re-cliquer "Distribuer" avec les mêmes site_ids crée N
    // rows videos doublons.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/findByStoragePathForSite\(/);
  });

  it('controller does NOT import config/database directly (repo pattern)', () => {
    // Invariant universel : controllers passent par les repositories barrel.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    const code = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\s+['"][^'"]*config\/database['"]/);
  });

  it('routes mount POST /render-requests/:id/distribute with validate + validateParams + authenticate', () => {
    const content = fs.readFileSync(ROUTES_FILE, 'utf8');
    expect(content).toMatch(
      /router\.post\([\s\S]*?'\/render-requests\/:id\/distribute'[\s\S]*?\)/,
    );
    // Le bloc doit contenir validate(...) + validateParams(...) + authenticate
    const distributeBlock = content.match(
      /router\.post\(\s*['"]\/render-requests\/:id\/distribute['"][\s\S]*?\);/,
    );
    expect(distributeBlock).not.toBeNull();
    expect(distributeBlock![0]).toMatch(/authenticate/);
    expect(distributeBlock![0]).toMatch(/validateParams\(paramSchemas\.id\)/);
    expect(distributeBlock![0]).toMatch(
      /validate\(templatesStudioSchemas\.distributeRender\)/,
    );
  });

  it('video.repository exposes findByStoragePathForSite (idempotence helper)', () => {
    const content = fs.readFileSync(REPO_FILE, 'utf8');
    expect(content).toMatch(/async\s+findByStoragePathForSite\(/);
    // IS NOT DISTINCT FROM pour matcher NULL = NULL côté Postgres (mode grant
    // recherche les rows globales).
    expect(content).toMatch(/IS\s+NOT\s+DISTINCT\s+FROM/i);
  });
});

describe('Templates Studio V1 — distribute frontend wiring', () => {
  it('service exposes distributeRender(renderId, payload)', () => {
    const content = fs.readFileSync(SERVICE_FILE, 'utf8');
    expect(content).toMatch(/distributeRender\s*\(/);
    // Endpoint matche le backend
    expect(content).toMatch(
      /\/templates-studio\/render-requests\/\$\{renderId\}\/distribute/,
    );
  });

  it('service uses ApiService (no fetch())', () => {
    const raw = fs.readFileSync(SERVICE_FILE, 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).toMatch(/this\.api\s*\.\s*post</);
  });

  it('types.ts declares RenderDistributionResult + RenderDistributionInput', () => {
    const content = fs.readFileSync(TYPES_FILE, 'utf8');
    expect(content).toMatch(/RenderDistributionResult/);
    expect(content).toMatch(/RenderDistributionInput/);
    // Mode union match du backend
    expect(content).toMatch(/RenderDistributionMode/);
  });

  it('studio component imports DistributeRenderModalComponent', () => {
    const content = fs.readFileSync(STUDIO_COMPONENT, 'utf8');
    expect(content).toMatch(/DistributeRenderModalComponent/);
  });

  it('studio component exposes openDistributeModal + onDistributed', () => {
    const content = fs.readFileSync(STUDIO_COMPONENT, 'utf8');
    expect(content).toMatch(/openDistributeModal\(\)/);
    expect(content).toMatch(/onDistributed\(/);
  });

  it('studio HTML has the Distribute button (data-testid="studio-distribute-button")', () => {
    const content = fs.readFileSync(STUDIO_HTML, 'utf8');
    expect(content).toMatch(/data-testid="studio-distribute-button"/);
    // Bouton appelle openDistributeModal()
    expect(content).toMatch(/openDistributeModal\(\)/);
  });

  it('studio HTML renders the modal with renderId + outputs', () => {
    const content = fs.readFileSync(STUDIO_HTML, 'utf8');
    expect(content).toMatch(/<app-distribute-render-modal/);
    expect(content).toMatch(/\[renderId\]="renderId"/);
    expect(content).toMatch(/\(distributed\)="onDistributed\(\$event\)"/);
  });

  it('modal component file exists and uses ApiService (via TemplatesStudioService)', () => {
    expect(fs.existsSync(MODAL_FILE)).toBe(true);
    const content = fs.readFileSync(MODAL_FILE, 'utf8');
    // Pas de fetch direct
    const code = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bfetch\(/);
    // Délègue au service partagé (pas d'appel HTTP direct)
    expect(content).toMatch(/TemplatesStudioService/);
    expect(content).toMatch(/distributeRender\(/);
  });

  it('modal supports both push and grant modes (UI radio)', () => {
    const content = fs.readFileSync(MODAL_FILE, 'utf8');
    expect(content).toMatch(/value="push"/);
    expect(content).toMatch(/value="grant"/);
  });

  it('modal loads sites via SitesService.loadSites (réutilise le pattern existant)', () => {
    const content = fs.readFileSync(MODAL_FILE, 'utf8');
    expect(content).toMatch(/SitesService/);
    expect(content).toMatch(/loadSites\(/);
  });
});
