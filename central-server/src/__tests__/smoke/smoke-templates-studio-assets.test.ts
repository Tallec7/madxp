/**
 * Smoke tests — ADR-125 Templates Studio asset library + bindings.
 *
 * File-based smoke (no DB / HTTP) — vérifie que la chaîne migration → repo
 * → controller → routes → worker → composition est cohérente.
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

const MIGRATION_FILE = path.join(
  SRC,
  'scripts',
  'migrations',
  'add-studio-assets.sql',
);
const FULL_SCHEMA_FILE = path.join(SRC, 'scripts', 'full-schema.sql');
const REPO_FILE = path.join(
  SRC,
  'repositories',
  'templates-studio.repository.ts',
);
const REPO_INDEX_FILE = path.join(SRC, 'repositories', 'index.ts');
const CONTROLLER_FILE = path.join(
  SRC,
  'controllers',
  'templates-studio.controller.ts',
);
const ROUTES_FILE = path.join(SRC, 'routes', 'templates-studio.routes.ts');
const VALIDATION_FILE = path.join(SRC, 'middleware', 'validation.ts');
const WORKER_FILE = path.join(
  SRC,
  'services',
  'studio-render-worker.service.ts',
);

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
const FAITS_OBSOLETE_ASSET_HELPER = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'faits_de_jeu',
  'asset.ts',
);
const BUT_MANIFEST = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'but_generique',
  'manifest.json',
);
const ENTREE_MANIFEST = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'entree_joueur',
  'manifest.json',
);

const APP_ROUTES = path.join(DASHBOARD_SRC, 'app.routes.ts');
const DASHBOARD_SERVICE = path.join(
  DASHBOARD_SRC,
  'features',
  'templates-studio',
  'templates-studio.service.ts',
);
const DASHBOARD_TYPES = path.join(
  DASHBOARD_SRC,
  'features',
  'templates-studio',
  'templates-studio.types.ts',
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

describe('ADR-125 — Migration crée les 2 tables', () => {
  it('migration file existe', () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
  });

  it.each([
    'studio_assets',
    'studio_template_asset_bindings',
  ])('migration crée la table %s', (table) => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const re = new RegExp(
      `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`,
      'i',
    );
    expect(sql).toMatch(re);
  });

  it('studio_assets a UNIQUE sur checksum_sha256 (clé de dédup)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    expect(sql).toMatch(/checksum_sha256[\s\S]*UNIQUE/i);
  });

  it('studio_template_asset_bindings.asset_id est ON DELETE RESTRICT', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    // Sans RESTRICT, supprimer un asset cascaderait silencieusement et casserait
    // les renders en cours.
    expect(sql).toMatch(
      /asset_id[\s\S]*REFERENCES\s+studio_assets[\s\S]*ON\s+DELETE\s+RESTRICT/i,
    );
  });

  it('PK composite (template_slug, asset_key)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    expect(sql).toMatch(
      /PRIMARY\s+KEY\s*\(\s*template_slug,\s*asset_key\s*\)/i,
    );
  });

  it('full-schema.sql mirror les nouvelles tables', () => {
    const sql = fs.readFileSync(FULL_SCHEMA_FILE, 'utf8');
    expect(sql).toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.studio_assets/i);
    expect(sql).toMatch(
      /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.studio_template_asset_bindings/i,
    );
  });
});

describe('ADR-125 — Repository expose les méthodes attendues', () => {
  const content = fs.readFileSync(REPO_FILE, 'utf8');

  it('exporte studioAssetRepository + templateAssetBindingRepository', () => {
    expect(content).toMatch(/export\s+const\s+studioAssetRepository\s*=/);
    expect(content).toMatch(/export\s+const\s+templateAssetBindingRepository\s*=/);
  });

  it('studioAssetRepository.create est upsert ON CONFLICT (checksum_sha256) DO NOTHING', () => {
    // Garde-fou : sans le upsert content-addressable, un re-upload du même
    // contenu créerait des rows orphelines + double FTP.
    expect(content).toMatch(
      /ON\s+CONFLICT\s*\(\s*checksum_sha256\s*\)\s+DO\s+NOTHING/i,
    );
  });

  it.each([
    'findByChecksum',
    'findFiltered',
    'findUsageById',
    'updateMetadata',
    'deleteById',
  ])('studioAssetRepository expose %s', (method) => {
    expect(content).toMatch(new RegExp(`async\\s+${method}\\(`));
  });

  it.each([
    'findByTemplate',
    'upsertBinding',
    'deleteBinding',
  ])('templateAssetBindingRepository expose %s', (method) => {
    expect(content).toMatch(new RegExp(`async\\s+${method}\\(`));
  });

  it('barrel index re-exporte les 2 nouveaux repos', () => {
    const idx = fs.readFileSync(REPO_INDEX_FILE, 'utf8');
    expect(idx).toMatch(/studioAssetRepository/);
    expect(idx).toMatch(/templateAssetBindingRepository/);
  });
});

describe('ADR-125 — Routes câblées avec requireRole super_admin/admin/operator', () => {
  const content = fs.readFileSync(ROUTES_FILE, 'utf8');

  it.each([
    /router\.get\(\s*['"]\/assets['"]/,
    /router\.post\(\s*['"]\/assets['"]/,
    /router\.get\(\s*['"]\/assets\/:assetId['"]/,
    /router\.patch\(\s*['"]\/assets\/:assetId['"]/,
    /router\.delete\(\s*['"]\/assets\/:assetId['"]/,
    /router\.get\(\s*['"]\/templates\/:slug\/asset-bindings['"]/,
    /router\.put\(\s*['"]\/templates\/:slug\/asset-bindings\/:assetKey['"]/,
    /router\.delete\(\s*['"]\/templates\/:slug\/asset-bindings\/:assetKey['"]/,
  ])('route déclarée : %s', (pattern) => {
    expect(content).toMatch(pattern);
  });

  it('toutes les routes asset/binding gardent requireRole super_admin/admin/operator', () => {
    // Match les blocs router.METHOD(... '/assets...' ou '/templates/...asset-bindings...')
    // et vérifie que `requireRole('super_admin', 'admin', 'operator')` apparaît.
    const blocks = content.match(
      /router\.(get|post|put|patch|delete)\([^;]*?(\/assets|asset-bindings)[\s\S]*?\);/g,
    );
    expect(blocks).not.toBeNull();
    expect(blocks!.length).toBeGreaterThanOrEqual(8);
    for (const block of blocks!) {
      expect(block).toMatch(
        /requireRole\(['"]super_admin['"],\s*['"]admin['"],\s*['"]operator['"]\)/,
      );
    }
  });

  it('POST /assets monte multer en memoryStorage avec limite 100 MB', () => {
    // Bumpé de 50 → 100 MB (PR #1022) après échec upload PACKSHOT_GENERIC.webm
    // 51.9 MB. Couvre les packshots .webm 1080p de plusieurs secondes sans
    // saturer la RAM (multer.memoryStorage stocke le temps du upload+pipe FTP).
    expect(content).toMatch(/uploadStudioAssetMiddleware/);
    expect(content).toMatch(/fileSize:\s*100\s*\*\s*1024\s*\*\s*1024/);
  });

  it('PUT bindings utilise validate(templatesStudioSchemas.bindAsset)', () => {
    expect(content).toMatch(/validate\(templatesStudioSchemas\.bindAsset\)/);
  });

  it('routes paramétrées utilisent validateParams (assetId / templateSlug / templateSlugAndAssetKey)', () => {
    expect(content).toMatch(/validateParams\(paramSchemas\.assetId\)/);
    expect(content).toMatch(/validateParams\(paramSchemas\.templateSlug\)/);
    expect(content).toMatch(
      /validateParams\(paramSchemas\.templateSlugAndAssetKey\)/,
    );
  });
});

describe('ADR-125 — Validation Joi', () => {
  const content = fs.readFileSync(VALIDATION_FILE, 'utf8');

  it.each([
    /uploadAsset:\s*Joi\.object/,
    /listAssetsQuery:\s*Joi\.object/,
    /updateAssetMetadata:\s*Joi\.object/,
    /bindAsset:\s*Joi\.object/,
  ])('schéma déclaré : %s', (pattern) => {
    expect(content).toMatch(pattern);
  });

  it('bindAsset exige asset_id en uuid (anti-injection)', () => {
    expect(content).toMatch(
      /bindAsset:\s*Joi\.object\(\{[\s\S]*?asset_id:\s*Joi\.string\(\)\.uuid\(\)\.required\(\)/,
    );
  });

  it('paramSchemas expose assetId, templateSlug, templateSlugAndAssetKey', () => {
    expect(content).toMatch(/assetId:\s*Joi\.object\(\{\s*assetId:\s*Joi\.string\(\)\.uuid\(\)/);
    expect(content).toMatch(/templateSlug:\s*Joi\.object\(\{\s*slug:\s*Joi\.string\(\)/);
    expect(content).toMatch(/templateSlugAndAssetKey:\s*Joi\.object/);
  });
});

describe('ADR-125 — Worker render résoud __assets depuis bindings DB', () => {
  const content = fs.readFileSync(WORKER_FILE, 'utf8');

  it('importe templateAssetBindingRepository + studioAssetRepository', () => {
    expect(content).toMatch(/templateAssetBindingRepository/);
    expect(content).toMatch(/studioAssetRepository/);
  });

  it('appelle resolveTemplateAssets avant performRender', () => {
    expect(content).toMatch(/resolveTemplateAssets\s*\(/);
  });

  it('injecte __assets dans inputProps avant selectComposition / render*', () => {
    expect(content).toMatch(/__assets/);
    expect(content).toMatch(/propsWithAssets/);
    // Garde-fou : aucun appel à selectComposition / renderMedia / renderStill
    // ne doit utiliser `inputProps` brut sans injection __assets.
    const renderCalls = content.match(/(selectComposition|renderMedia|renderStill)\(\{[\s\S]*?\}\)/g);
    expect(renderCalls).not.toBeNull();
    for (const call of renderCalls!) {
      expect(call).toMatch(/inputProps:\s*propsWithAssets/);
    }
  });

  it('lève une erreur explicite "Asset manquant: <key>" pointant vers /templates-studio/admin/assets/<slug>', () => {
    expect(content).toMatch(/Asset\s+manquant/);
    expect(content).toMatch(/\/templates-studio\/admin\/assets\//);
  });
});

describe('ADR-125 — Manifests de templates déclarent requiredAssets', () => {
  it('faits_de_jeu déclare requiredAssets avec metalTexture, lensFlare, watermarkNeopro', () => {
    const manifest = JSON.parse(fs.readFileSync(FAITS_MANIFEST, 'utf8'));
    expect(Array.isArray(manifest.requiredAssets)).toBe(true);
    const keys = manifest.requiredAssets.map((a: { key: string }) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining(['metalTexture', 'lensFlare', 'watermarkNeopro']),
    );
  });

  it('but_generique et entree_joueur déclarent les requiredAssets ADR-128 (ports legacy V2)', () => {
    // ADR-128 — les designs legacy ont été portés depuis le V2. Chacun
    // déclare désormais ses 5 layers WebM + masques PNG frames + fonts
    // (BUT) ou son packshot WebM + masque + fonts (ENTRÉE).
    const but = JSON.parse(fs.readFileSync(BUT_MANIFEST, 'utf8'));
    const entree = JSON.parse(fs.readFileSync(ENTREE_MANIFEST, 'utf8'));
    const butKeys = but.requiredAssets.map((a: { key: string }) => a.key);
    expect(butKeys).toEqual(
      expect.arrayContaining([
        'layerA',
        'layerB',
        'layerC',
        'maskC',
        'packshot',
        'maskPackshot',
        'layerD',
        'fontBulevar',
        'fontGeneralSans',
      ]),
    );
    const entreeKeys = entree.requiredAssets.map((a: { key: string }) => a.key);
    expect(entreeKeys).toEqual(
      expect.arrayContaining([
        'packshot',
        'maskPackshot',
        'fontBulevar',
        'fontGeneralSans',
      ]),
    );
  });

  it('chaque entrée requiredAssets a key + filename + mime', () => {
    const manifest = JSON.parse(fs.readFileSync(FAITS_MANIFEST, 'utf8'));
    for (const slot of manifest.requiredAssets) {
      expect(typeof slot.key).toBe('string');
      expect(typeof slot.filename).toBe('string');
      expect(typeof slot.mime).toBe('string');
    }
  });
});

describe('ADR-125 — Composition faits_de_jeu consume __assets (no staticFile)', () => {
  const raw = fs.readFileSync(FAITS_COMPOSITION, 'utf8');
  // Strip comments — les refs en JSDoc / commentaires (ex: "fini les staticFile()")
  // sont volontaires et ne doivent pas faire échouer le smoke.
  const content = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('ne contient plus staticFile() ni helper asset()', () => {
    expect(content).not.toMatch(/staticFile\s*\(/);
    expect(content).not.toMatch(/from\s+['"]\.\/asset['"]/);
    expect(content).not.toMatch(/\basset\s*\(/);
  });

  it('helper local asset.ts a été supprimé', () => {
    expect(fs.existsSync(FAITS_OBSOLETE_ASSET_HELPER)).toBe(false);
  });

  it('schéma Zod déclare __assets optionnel', () => {
    expect(content).toMatch(/__assets:\s*z\.record/);
  });

  it('component lit __assets via destructuring des props', () => {
    expect(content).toMatch(/const\s+assets\s*=\s*__assets\s*\?\?\s*\{\}/);
  });
});

describe('ADR-125 — Frontend Angular pages', () => {
  it('AssetLibraryComponent existe', () => {
    expect(fs.existsSync(ADMIN_LIBRARY_COMPONENT)).toBe(true);
  });
  it('TemplateBindingsComponent existe', () => {
    expect(fs.existsSync(ADMIN_BINDINGS_COMPONENT)).toBe(true);
  });

  it('app.routes.ts expose les 3 routes admin avec roleGuard super_admin/admin/operator', () => {
    const content = fs.readFileSync(APP_ROUTES, 'utf8');
    expect(content).toMatch(/'templates-studio\/admin\/assets\/library'/);
    expect(content).toMatch(/'templates-studio\/admin\/assets'/);
    expect(content).toMatch(/'templates-studio\/admin\/assets\/:slug'/);
    // Les 3 routes doivent porter `roles: ['super_admin', 'admin', 'operator']`.
    const blocks = content.match(
      /'templates-studio\/admin\/assets[^']*'[\s\S]*?loadComponent:[\s\S]*?\.then\([\s\S]*?\)/g,
    );
    expect(blocks).not.toBeNull();
    for (const block of blocks!) {
      expect(block).toMatch(/roles:\s*\[['"]super_admin['"]\s*,\s*['"]admin['"]\s*,\s*['"]operator['"]\]/);
    }
  });

  it('templates-studio.service.ts expose les méthodes asset library + bindings', () => {
    const content = fs.readFileSync(DASHBOARD_SERVICE, 'utf8');
    for (const method of [
      'listStudioAssets',
      'getStudioAsset',
      'uploadStudioAsset',
      'updateStudioAssetMetadata',
      'deleteStudioAsset',
      'getTemplateAssetBindings',
      'bindTemplateAsset',
      'deleteTemplateAssetBinding',
    ]) {
      expect(content).toMatch(new RegExp(`\\b${method}\\(`));
    }
  });

  it('templates-studio.types.ts expose StudioAsset + RequiredAsset + TemplateAssetBinding', () => {
    const content = fs.readFileSync(DASHBOARD_TYPES, 'utf8');
    expect(content).toMatch(/export\s+interface\s+StudioAsset\b/);
    expect(content).toMatch(/export\s+interface\s+RequiredAsset\b/);
    expect(content).toMatch(/export\s+interface\s+TemplateAssetBinding\b/);
    expect(content).toMatch(/export\s+interface\s+TemplateAssetBindingsResult\b/);
  });
});
