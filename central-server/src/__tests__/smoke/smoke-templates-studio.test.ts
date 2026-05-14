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
// Source de vérité monorepo lite (PR #983) — depuis central-server/src/__tests__/smoke/,
// 4 levels up = racine repo neopro, puis descendre dans studio-render-server.
const MANIFESTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'studio-render-server',
  'src',
  'templates',
);
const WORKER_FILE = path.join(SRC, 'services', 'studio-render-worker.service.ts');
const RESOLVER_FILE = path.join(SRC, 'services', 'templates-studio.service.ts');

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

  it('manifests dir exists with at least 1 slug subdir containing manifest.json', () => {
    expect(fs.existsSync(MANIFESTS_DIR)).toBe(true);
    const slugs = fs
      .readdirSync(MANIFESTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(MANIFESTS_DIR, d.name, 'manifest.json')))
      .map((d) => d.name);
    expect(slugs.length).toBeGreaterThanOrEqual(1);
  });

  it('each manifest has required V1 fields (id, version, label, kind, compositionId)', () => {
    const slugs = fs
      .readdirSync(MANIFESTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const slug of slugs) {
      const filepath = path.join(MANIFESTS_DIR, slug, 'manifest.json');
      if (!fs.existsSync(filepath)) continue;
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

describe('Templates Studio V1 — S2 Brand Kit + résolveur', () => {
  it('resolver service file exists', () => {
    expect(fs.existsSync(RESOLVER_FILE)).toBe(true);
  });

  it('resolver exports resolveBindings', () => {
    const content = fs.readFileSync(RESOLVER_FILE, 'utf8');
    expect(content).toMatch(/export\s+function\s+resolveBindings/);
  });

  it('createRenderRequest controller wires the resolver before storing props', () => {
    // Garde-fou : si quelqu'un retire le call, render_requests.props_json
    // contiendrait le raw input (pas de cascade brand kit) → le worker enverrait
    // des couleurs vides au render server. Bug subtil sans ça.
    const controller = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(controller).toMatch(/resolveBindings\(/);
    expect(controller).toMatch(/props_json:\s*resolvedProps/);
  });

  it('controller uses siteBrandKitRepository.findBySite', () => {
    const controller = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(controller).toMatch(/siteBrandKitRepository\.findBySite/);
  });

  it('routes mount GET + PUT /sites/:siteId/brand-kit with tenant guard + Joi', () => {
    const routes = fs.readFileSync(ROUTES_FILE, 'utf8');
    // GET
    expect(routes).toMatch(/router\.get\([\s\S]*?'\/sites\/:siteId\/brand-kit'[\s\S]*?\)/);
    // PUT
    expect(routes).toMatch(/router\.put\([\s\S]*?'\/sites\/:siteId\/brand-kit'[\s\S]*?\)/);
    // requireClubScope présent (impossible que les 2 routes l'aient sans qu'il
    // apparaisse au moins 1 fois — sinon un club user peut lire/écrire d'autres clubs).
    expect(routes).toMatch(/requireClubScope\(/);
    // Joi sur PUT
    expect(routes).toMatch(/validate\(templatesStudioSchemas\.upsertBrandKit\)/);
  });
});

describe('Templates Studio V1 — S4-A roster CRUD + résolveur câblé', () => {
  it('repository exposes update + deleteForSite for player CRUD', () => {
    const content = fs.readFileSync(REPO_FILE, 'utf8');
    expect(content).toMatch(/async\s+update\(/);
    expect(content).toMatch(/async\s+deleteForSite\(/);
  });

  it('repository.update scopes via WHERE site_id (defense-in-depth tenant guard)', () => {
    // Sans cette clause, un user club pourrait éditer un joueur d'un autre site
    // si l'attaquant connaît l'UUID. Tenant guard côté routes + repo = belt-and-suspenders.
    const content = fs.readFileSync(REPO_FILE, 'utf8');
    expect(content).toMatch(/WHERE\s+id\s*=\s*\$\d+\s+AND\s+site_id\s*=\s*\$\d+/i);
  });

  it('repository.update bumps cutout_status to pending when photo_raw_url changes', () => {
    // Sans ça, modifier la photo brute ne re-trigger pas le worker rembg
    // → l'ancien cutout reste affecté à la nouvelle raw → mismatch visuel.
    const content = fs.readFileSync(REPO_FILE, 'utf8');
    expect(content).toMatch(/cutoutStatusOverride/);
    expect(content).toMatch(/['"]pending['"]/);
  });

  it('controller exports listPlayers / createPlayer / updatePlayer / deletePlayer', () => {
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/export\s+const\s+listPlayers\s*=/);
    expect(content).toMatch(/export\s+const\s+createPlayer\s*=/);
    expect(content).toMatch(/export\s+const\s+updatePlayer\s*=/);
    expect(content).toMatch(/export\s+const\s+deletePlayer\s*=/);
  });

  it('createRenderRequest passes playersById to the resolver (S4-A unblocked)', () => {
    // Avant S4-A, le résolveur recevait playersById omitted → bindings player.*
    // retournaient null avec warn fail-soft. Maintenant on les charge.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/playerRepository\.findBySite/);
    expect(content).toMatch(/new\s+Map<string,\s*PlayerRow>/);
    expect(content).toMatch(/playersById,?\s*}\)/);
  });

  it('routes mount the 4 player endpoints with tenant guard + Joi', () => {
    const routes = fs.readFileSync(ROUTES_FILE, 'utf8');
    // Les 4 verbes
    expect(routes).toMatch(/router\.get\([\s\S]*?'\/sites\/:siteId\/players'/);
    expect(routes).toMatch(/router\.post\([\s\S]*?'\/sites\/:siteId\/players'/);
    expect(routes).toMatch(/router\.put\([\s\S]*?'\/sites\/:siteId\/players\/:playerId'/);
    expect(routes).toMatch(/router\.delete\([\s\S]*?'\/sites\/:siteId\/players\/:playerId'/);
    // Joi sur les routes mutations
    expect(routes).toMatch(/validate\(templatesStudioSchemas\.createPlayer\)/);
    expect(routes).toMatch(/validate\(templatesStudioSchemas\.updatePlayer\)/);
    // paramSchemas dédié pour les routes :siteId/:playerId
    expect(routes).toMatch(/validateParams\(paramSchemas\.siteIdAndPlayerId\)/);
  });

  it('routes require photo_raw_url to be a valid URI in createPlayer (no random strings)', () => {
    // Garde-fou côté Joi : les photos doivent être des URLs FTP, pas n'importe
    // quel string. Sans ce check, le worker rembg recevrait du garbage.
    const content = fs.readFileSync(
      path.join(SRC, 'middleware', 'validation.ts'),
      'utf8',
    );
    expect(content).toMatch(/createPlayer:\s*Joi\.object\([\s\S]*?photo_raw_url:\s*Joi\.string\(\)\.uri\(\)/);
  });
});

describe('Templates Studio V1 — S4-B upload photo multipart', () => {
  it('controller exports uploadPlayerPhoto handler', () => {
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/export\s+const\s+uploadPlayerPhoto\s*=/);
  });

  it('uploadPlayerPhoto verifies file mime + size before FTP upload', () => {
    // Garde-fous : sans ces checks, on accepterait un .mp4 nommé .png ou un
    // fichier vide → garbage sur FTP + worker rembg crash.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/ALLOWED_PHOTO_MIMES/);
    expect(content).toMatch(/file\.size === 0/);
    expect(content).toMatch(/image\/jpeg/);
    expect(content).toMatch(/image\/png/);
    expect(content).toMatch(/image\/webp/);
  });

  it('uploadPlayerPhoto enforces tenant guard via existing.site_id !== siteId', () => {
    // Defense-in-depth : même si requireClubScope passe (admin bypass), on
    // recheck que le player appartient bien au site_id de l'URL.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/existing\.site_id\s*!==\s*siteId/);
  });

  it('uploadPlayerPhoto storage path is content-addressable (sha1 hash)', () => {
    // Pattern `players/{siteId}/{playerId}-raw-{hash}.{ext}` — évite les
    // collisions si même joueur ré-upload différentes photos.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/createHash\(['"]sha1['"]\)/);
    expect(content).toMatch(/players\/\$\{siteId\}\/\$\{playerId\}-raw-/);
  });

  it('uploadPlayerPhoto bumps cutout_status to pending via repository.update', () => {
    // Le worker rembg (S4-C) poll `WHERE cutout_status='pending'`. Sans ce
    // bump, un nouveau raw_url ne déclenche pas le re-traitement.
    const content = fs.readFileSync(CONTROLLER_FILE, 'utf8');
    expect(content).toMatch(/playerRepository\.update\(playerId,\s*siteId,\s*\{[\s\S]*?photo_raw_url:\s*publicUrl/);
  });

  it('routes mount POST /sites/:siteId/players/:playerId/photo with multer + tenant guard', () => {
    const routes = fs.readFileSync(ROUTES_FILE, 'utf8');
    expect(routes).toMatch(/router\.post\([\s\S]*?'\/sites\/:siteId\/players\/:playerId\/photo'/);
    expect(routes).toMatch(/uploadPlayerPhotoMiddleware\.single\(['"]photo['"]\)/);
    expect(routes).toMatch(/multer\.memoryStorage\(\)/);
    expect(routes).toMatch(/fileSize:\s*8\s*\*\s*1024\s*\*\s*1024/);
    // Tenant guard sur le siteId
    expect(routes).toMatch(/requireClubScope\(siteIdFromParams\)/);
  });
});
