/**
 * Smoke tests — Templates Studio V1 (système code-driven parallèle).
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md
 *
 * Garde-fous pour empêcher le système V1 de se coupler accidentellement
 * au Template Studio v2 legacy (data-driven, `TemplateRuntime`, tables
 * `remotion_templates`/`template_layers`/...). C'est le **risque #1** du
 * spec — si une PR introduit un import legacy dans la repo V1, le smoke
 * doit échouer.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const REPO_FILE = path.join(SRC, 'repositories', 'templates-studio.repository.ts');
const MIGRATION_FILE = path.join(
  SRC,
  'scripts',
  'migrations',
  'add-templates-studio-v1.sql',
);
const CONTROLLER_FILE = path.join(
  SRC,
  'controllers',
  'templates-studio.controller.ts',
);
const ROUTES_FILE = path.join(SRC, 'routes', 'templates-studio.routes.ts');
const SERVER_FILE = path.join(SRC, 'server.ts');
const SEED_SCRIPT = path.join(SRC, 'scripts', 'seed-templates-studio-manifests.ts');
const MANIFESTS_DIR = path.join(SRC, 'scripts', 'templates-studio-manifests');
const WORKER_FILE = path.join(SRC, 'services', 'studio-render-worker.service.ts');

describe('Templates Studio V1 — files exist', () => {
  it.each([
    ['repository', REPO_FILE],
    ['migration', MIGRATION_FILE],
    ['controller', CONTROLLER_FILE],
    ['routes', ROUTES_FILE],
  ])('%s file exists', (_label, file) => {
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('Templates Studio V1 — risque #1 (no legacy import)', () => {
  const LEGACY_PATTERNS = [
    /from\s+['"][^'"]*TemplateRuntime[^'"]*['"]/,
    /from\s+['"][^'"]*template-studio\.repository[^'"]*['"]/,
    /\bremotion_templates\b/,
    /\btemplate_layers\b/,
    /\btemplate_text_fields\b/,
    /\btemplate_image_slots\b/,
  ];

  it('repository must NOT import or reference the data-driven legacy system', () => {
    const content = fs.readFileSync(REPO_FILE, 'utf8');
    // Strip JS/TS comments (block + line) — refs in JSDoc/notes are allowed.
    const code = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    for (const pattern of LEGACY_PATTERNS) {
      expect(code).not.toMatch(pattern);
    }
  });
});

describe('Templates Studio V1 — migration creates the 4 V1 tables', () => {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

  it.each([
    'template_definitions',
    'render_requests',
    'site_brand_kits',
    'players',
  ])('migration creates table %s', (table) => {
    // Match `CREATE TABLE [IF NOT EXISTS] <table>` (case-insensitive, allow whitespace).
    const re = new RegExp(
      `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`,
      'i',
    );
    expect(sql).toMatch(re);
  });

  it.each([
    'render_requests',
    'site_brand_kits',
    'players',
  ])('table %s has FK to sites(id) — multi-tenant invariant', (table) => {
    // Look for `REFERENCES sites(id)` within the CREATE TABLE block of <table>.
    const tableBlock = sql.match(
      new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b[\\s\\S]*?\\);`,
        'i',
      ),
    );
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/REFERENCES\s+sites\s*\(\s*id\s*\)/i);
  });

  it('render_requests status uses CHECK constraint with the 4 V1 states', () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'queued',\s*'rendering',\s*'ready',\s*'failed'\s*\)\s*\)/i,
    );
  });

  it('template_definitions.kind CHECK constraint covers video and still', () => {
    expect(sql).toMatch(/CHECK\s*\(\s*kind\s+IN\s*\(\s*'video',\s*'still'\s*\)\s*\)/i);
  });

  it('render_requests has partial index on active states for SKIP LOCKED throughput', () => {
    // Garde-fou : sans cet index partiel, claimNextQueued() scanne toute la table.
    expect(sql).toMatch(
      /CREATE\s+INDEX[\s\S]*?ON\s+render_requests\s*\(\s*status[\s\S]*?WHERE\s+status\s+IN\s*\(\s*'queued',\s*'rendering'\s*\)/i,
    );
  });
});

describe('Templates Studio V1 — repository exposes 4 named singletons', () => {
  const content = fs.readFileSync(REPO_FILE, 'utf8');

  it.each([
    'templateDefinitionRepository',
    'renderRequestRepository',
    'siteBrandKitRepository',
    'playerRepository',
  ])('exports %s', (name) => {
    expect(content).toMatch(new RegExp(`export\\s+const\\s+${name}\\s*=`));
  });

  it('renderRequestRepository.claimNextQueued uses FOR UPDATE SKIP LOCKED', () => {
    // Sans ça, plusieurs workers en parallèle se marcheraient dessus.
    expect(content).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
  });
});

describe('Templates Studio V1 — controller stays HTTP-only (no renderer import)', () => {
  // Invariant repris du rule `services.md` pour le legacy ADR-054 — étendu V1 :
  // le controller ne doit JAMAIS importer @remotion/renderer ou @remotion/bundler.
  // Le rendu vit dans le worker (livrable J4). Sans cette séparation on retombe
  // dans les 502 Railway timeout (un render bloque l'event loop HTTP).
  const raw = fs.readFileSync(CONTROLLER_FILE, 'utf8');
  // Strip comments — les refs en JSDoc / commentaires sont volontaires.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it.each([
    /@remotion\/renderer/,
    /@remotion\/bundler/,
    /from\s+['"][^'"]*config\/database['"]/,
  ])('controller code must NOT import %s', (pattern) => {
    expect(code).not.toMatch(pattern);
  });

  it('controller imports repositories barrel (repo pattern)', () => {
    expect(code).toMatch(/from\s+['"]\.\.\/repositories['"]/);
  });
});

describe('Templates Studio V1 — multi-tenant guards (risque #7 du spec)', () => {
  const controller = fs.readFileSync(CONTROLLER_FILE, 'utf8');

  it('createRenderRequest takes site_id from req.user, never from body', () => {
    // Le body NE doit PAS contenir site_id — pattern aligné sur uploaded_for_site_id.
    expect(controller).toMatch(/site_id:\s*siteId/);
    // Garde-fou : pas de `site_id` extrait du body destructuring.
    expect(controller).not.toMatch(/const\s*\{[^}]*site_id[^}]*\}\s*=\s*req\.body/);
  });

  it('getRenderRequest enforces tenant guard for non-internal roles', () => {
    expect(controller).toMatch(/row\.site_id\s*!==\s*req\.user\.site_id/);
  });
});

describe('Templates Studio V1 — routes mount validation middleware', () => {
  const content = fs.readFileSync(ROUTES_FILE, 'utf8');

  it('POST /render-requests uses validate(templatesStudioSchemas.createRenderRequest)', () => {
    expect(content).toMatch(/validate\(templatesStudioSchemas\.createRenderRequest\)/);
  });

  it('GET /render-requests/:id uses validateParams(paramSchemas.id)', () => {
    expect(content).toMatch(/validateParams\(paramSchemas\.id\)/);
  });

  it('all routes go through authenticate', () => {
    // Match `router.METHOD(..., authenticate, ...)` on each route declaration.
    const routeDecls = content.match(/router\.(get|post|put|delete|patch)\([^)]+\)/g) ?? [];
    expect(routeDecls.length).toBeGreaterThan(0);
    for (const decl of routeDecls) {
      expect(decl).toMatch(/authenticate/);
    }
  });
});

describe('Templates Studio V1 — wired in server.ts under /api/templates-studio', () => {
  const content = fs.readFileSync(SERVER_FILE, 'utf8');

  it('imports templatesStudioV1Routes', () => {
    expect(content).toMatch(
      /import\s+templatesStudioV1Routes\s+from\s+['"]\.\/routes\/templates-studio\.routes['"]/,
    );
  });

  it('mounts the routes under /api/templates-studio', () => {
    expect(content).toMatch(
      /app\.use\(['"]\/api\/templates-studio['"],\s*templatesStudioV1Routes\)/,
    );
  });
});

describe('Templates Studio V1 — manifest seed (J3, cf STUDIO_V1.md §5)', () => {
  it('seed script exists and exports seedTemplatesStudioManifests', () => {
    expect(fs.existsSync(SEED_SCRIPT)).toBe(true);
    const content = fs.readFileSync(SEED_SCRIPT, 'utf8');
    expect(content).toMatch(/export\s+async\s+function\s+seedTemplatesStudioManifests/);
  });

  it('vendored manifests dir exists with at least 1 .json', () => {
    expect(fs.existsSync(MANIFESTS_DIR)).toBe(true);
    const jsons = fs
      .readdirSync(MANIFESTS_DIR)
      .filter((f) => f.endsWith('.json'));
    expect(jsons.length).toBeGreaterThanOrEqual(1);
  });

  it('each vendored manifest has required V1 fields (id, version, label, kind, compositionId)', () => {
    const jsons = fs
      .readdirSync(MANIFESTS_DIR)
      .filter((f) => f.endsWith('.json'));
    for (const filename of jsons) {
      const filepath = path.join(MANIFESTS_DIR, filename);
      const parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      expect(typeof parsed.id).toBe('string');
      expect(typeof parsed.version).toBe('string');
      expect(typeof parsed.label).toBe('string');
      expect(['video', 'still']).toContain(parsed.kind);
      expect(typeof parsed.compositionId).toBe('string');
    }
  });

  it('seed is wired in server.ts boot after startRenderWorker', () => {
    const content = fs.readFileSync(SERVER_FILE, 'utf8');
    expect(content).toMatch(/seed-templates-studio-manifests/);
    // Check ordre : startRenderWorker() doit apparaître AVANT le seed (le worker
    // démarre indépendamment des manifests V1 — il poll sa propre table).
    const idxWorker = content.indexOf('startRenderWorker()');
    const idxSeed = content.indexOf('seed-templates-studio-manifests');
    expect(idxWorker).toBeGreaterThan(-1);
    expect(idxSeed).toBeGreaterThan(idxWorker);
  });
});

describe('Templates Studio V1 — render worker (J4, STUB)', () => {
  it('worker file exists', () => {
    expect(fs.existsSync(WORKER_FILE)).toBe(true);
  });

  it('worker exposes start/stop singleton + named exports', () => {
    const content = fs.readFileSync(WORKER_FILE, 'utf8');
    expect(content).toMatch(/export\s+async\s+function\s+startStudioRenderWorker/);
    expect(content).toMatch(/export\s+function\s+stopStudioRenderWorker/);
  });

  it('worker code does NOT import @remotion/renderer yet (J4 = STUB)', () => {
    // Le branchement réel viendra dans un commit ultérieur — séparation propre
    // évite que le commit J4 importe @remotion/renderer accidentellement.
    const content = fs.readFileSync(WORKER_FILE, 'utf8');
    const code = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/@remotion\/renderer/);
    expect(code).not.toMatch(/@remotion\/bundler/);
  });

  it('worker calls failStaleRunning(10) at boot before polling', () => {
    // Anti-orphan : un row claimé par un process mort doit pouvoir être retry.
    // Pattern aligné sur le legacy ADR-054 (smoke services.md enforced).
    const content = fs.readFileSync(WORKER_FILE, 'utf8');
    expect(content).toMatch(/failStaleRunning\(\s*(?:STALE_RUNNING_MAX_AGE_MIN|10)\s*\)/);
  });

  it('worker is wired in server.ts boot', () => {
    const content = fs.readFileSync(SERVER_FILE, 'utf8');
    expect(content).toMatch(/studio-render-worker\.service/);
    expect(content).toMatch(/startStudioRenderWorker/);
  });
});
