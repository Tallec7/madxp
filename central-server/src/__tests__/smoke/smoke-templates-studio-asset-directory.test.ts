/**
 * Smoke tests — ADR-128 Templates Studio asset directories (séquences PNG frames).
 *
 * File-based smoke (no DB / HTTP) — vérifie que la chaîne migration → repo
 * → endpoint → routes → worker → composition est cohérente pour le nouveau
 * type d'asset `directory`.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..');
const TEMPLATES_STUDIO_DIR = path.resolve(__dirname, '..', '..', '..', 'templates-studio');

const MIGRATION_FILE = path.join(
  SRC,
  'scripts',
  'migrations',
  'add-studio-assets-directory.sql',
);
const FULL_SCHEMA_FILE = path.join(SRC, 'scripts', 'full-schema.sql');
const REPO_FILE = path.join(
  SRC,
  'repositories',
  'templates-studio.repository.ts',
);
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
const FTP_STORAGE_FILE = path.join(SRC, 'config', 'ftp-storage.ts');

const BUT_MANIFEST = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'but_generique',
  'manifest.json',
);
const BUT_COMPOSITION = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'but_generique',
  'Composition.tsx',
);
const ENTREE_MANIFEST = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'entree_joueur',
  'manifest.json',
);
const ENTREE_COMPOSITION = path.join(
  TEMPLATES_STUDIO_DIR,
  'templates',
  'entree_joueur',
  'Composition.tsx',
);

describe('ADR-128 — Migration directory columns', () => {
  it('migration file existe', () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
  });

  it.each(['asset_kind', 'frame_count', 'frame_pattern'])(
    'migration ajoute la colonne %s',
    (col) => {
      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      expect(sql).toMatch(new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}`, 'i'));
    },
  );

  it("migration enforce CHECK asset_kind IN ('file', 'directory')", () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    expect(sql).toMatch(/CHECK\s*\(\s*asset_kind\s+IN\s*\(\s*'file'\s*,\s*'directory'\s*\)/i);
  });

  it('full-schema.sql mirror les nouvelles colonnes + CHECK', () => {
    const sql = fs.readFileSync(FULL_SCHEMA_FILE, 'utf8');
    expect(sql).toMatch(/asset_kind\s+text\s+DEFAULT\s+'file'(?:::text)?\s+NOT\s+NULL/i);
    expect(sql).toMatch(/frame_count\s+integer/i);
    expect(sql).toMatch(/frame_pattern\s+text/i);
    expect(sql).toMatch(/asset_kind_check[\s\S]*'file'[\s\S]*'directory'/i);
  });
});

describe('ADR-128 — Repository expose createDirectory', () => {
  const content = fs.readFileSync(REPO_FILE, 'utf8');

  it('expose la méthode createDirectory()', () => {
    expect(content).toMatch(/async\s+createDirectory\(/);
  });

  it('createDirectory utilise asset_kind=\'directory\' dans INSERT', () => {
    expect(content).toMatch(/INSERT\s+INTO\s+studio_assets[\s\S]*'directory'/);
  });

  it('createDirectory dédup via ON CONFLICT (checksum_sha256) DO NOTHING', () => {
    // Deux occurrences attendues : create() pour 'file' + createDirectory() pour 'directory'.
    const matches = content.match(
      /ON\s+CONFLICT\s*\(\s*checksum_sha256\s*\)\s+DO\s+NOTHING/gi,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('expose le type StudioAssetKind = \'file\' | \'directory\'', () => {
    expect(content).toMatch(/StudioAssetKind\s*=\s*'file'\s*\|\s*'directory'/);
  });

  it('StudioAssetRow expose asset_kind / frame_count / frame_pattern', () => {
    expect(content).toMatch(/asset_kind:\s*StudioAssetKind/);
    expect(content).toMatch(/frame_count:\s*number\s*\|\s*null/);
    expect(content).toMatch(/frame_pattern:\s*string\s*\|\s*null/);
  });
});

describe('ADR-128 — Endpoint POST /assets/directory câblé', () => {
  const routes = fs.readFileSync(ROUTES_FILE, 'utf8');
  const controller = fs.readFileSync(CONTROLLER_FILE, 'utf8');

  it('route déclarée avec multer + validate + requireRole', () => {
    expect(routes).toMatch(/router\.post\(\s*['"]\/assets\/directory['"]/);
    expect(routes).toMatch(/uploadStudioAssetDirectoryMiddleware\.single\(['"]asset['"]\)/);
    expect(routes).toMatch(/validate\(templatesStudioSchemas\.uploadAssetDirectory\)/);
  });

  it('route directory garde requireRole super_admin/admin/operator', () => {
    const block = routes.match(
      /router\.post\(\s*['"]\/assets\/directory['"][\s\S]*?\);/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(
      /requireRole\(['"]super_admin['"],\s*['"]admin['"],\s*['"]operator['"]\)/,
    );
  });

  it('multer ZIP : memoryStorage + fileSize 200 MB', () => {
    // Garde-fou : un ZIP packshot 1080p 200+ frames PNG dépasse facilement
    // 50 MB. Bumpé 50 → 200 MB après incident 2026-05-15 (413 sur
    // packshot-img.zip côté Daisy). Heap Node Railway = 560 MB.
    expect(routes).toMatch(/uploadStudioAssetDirectoryMiddleware/);
    expect(routes).toMatch(/uploadStudioAssetDirectoryMiddleware[\s\S]*?fileSize:\s*200\s*\*\s*1024\s*\*\s*1024/);
  });

  it('controller expose uploadStudioAssetDirectory + dédup checksum', () => {
    expect(controller).toMatch(/export\s+const\s+uploadStudioAssetDirectory\s*=/);
    // Le controller doit dédupliquer par checksum SHA256 du ZIP avant
    // d'effectuer le upload FTP onéreux des N frames.
    expect(controller).toMatch(/findByChecksum/);
    expect(controller).toMatch(/createHash\(['"]sha256['"]\)/);
  });

  it('controller upload via uploadFilesToFtpBatch (pool FTP parallèle)', () => {
    expect(controller).toMatch(/uploadFilesToFtpBatch/);
  });

  it('controller exige le mime ZIP ou extension .zip', () => {
    expect(controller).toMatch(/application\/zip/);
  });

  it('Joi uploadAssetDirectory déclaré + accepte frame_pattern optionnel', () => {
    const validation = fs.readFileSync(VALIDATION_FILE, 'utf8');
    expect(validation).toMatch(/uploadAssetDirectory:\s*Joi\.object/);
    expect(validation).toMatch(
      /uploadAssetDirectory:\s*Joi\.object\([\s\S]*?frame_pattern:\s*Joi\.string/,
    );
  });
});

describe('ADR-128 — FTP batch helper', () => {
  const content = fs.readFileSync(FTP_STORAGE_FILE, 'utf8');

  it('expose uploadFilesToFtpBatch avec param concurrency (pool FTP parallèle)', () => {
    // Garde-fou : sans pool parallèle, 200+ frames PNG en série prennent
    // >100s sur Hostinger FTP → timeout edge Railway → 502 Bad Gateway
    // côté browser (incident 2026-05-15 packshot-img.zip).
    expect(content).toMatch(/export\s+const\s+uploadFilesToFtpBatch\s*=/);
    expect(content).toMatch(/concurrency\s*=\s*\d/);
    expect(content).toMatch(/Promise\.all\(\s*groups\.map/);
  });

  it('mutualise ensureDir via Set (1 ensureDir par dir distinct, AVANT le pool)', () => {
    // Critique : ensureDir doit être séquentiel + serialisé sur 1 client AVANT
    // le pool parallèle. Sinon N clients ensureDir le même path → race
    // condition côté FTP server (Hostinger renvoie alors 550 sur les uploads).
    expect(content).toMatch(/distinctDirs\s*=\s*new\s+Set/);
    expect(content).toMatch(/dirClient\.ensureDir/);
  });
});

describe('ADR-128 — Worker résoud directory en object { kind, baseUrl, framePattern, frameCount }', () => {
  const content = fs.readFileSync(WORKER_FILE, 'utf8');

  it('expose le type DirectoryAssetRef + ResolvedAsset = string | DirectoryAssetRef', () => {
    expect(content).toMatch(/export\s+interface\s+DirectoryAssetRef\b/);
    expect(content).toMatch(/ResolvedAsset\s*=\s*string\s*\|\s*DirectoryAssetRef/);
  });

  it('resolveTemplateAssets retourne Record<string, ResolvedAsset> (plus juste string)', () => {
    expect(content).toMatch(/Record<string,\s*ResolvedAsset>/);
  });

  it('branche asset_kind === \'directory\' assemble baseUrl + framePattern + frameCount', () => {
    expect(content).toMatch(/asset_kind\s*===\s*['"]directory['"]/);
    expect(content).toMatch(/kind:\s*['"]directory['"]/);
    expect(content).toMatch(/baseUrl/);
    expect(content).toMatch(/framePattern/);
    expect(content).toMatch(/frameCount/);
  });

  it('garde-fou : directory sans frame_count/frame_pattern → erreur explicite', () => {
    expect(content).toMatch(/Asset\s+directory\s+invalide/);
  });

  it('renderStill reçoit `frame: stillFrame` depuis manifest.stillFrame', () => {
    expect(content).toMatch(/manifest\.stillFrame/);
    expect(content).toMatch(/frame:\s*stillFrame/);
  });
});

describe('ADR-128 — Manifest BUT générique étendu', () => {
  const manifest = JSON.parse(fs.readFileSync(BUT_MANIFEST, 'utf8'));

  it('format : 1920×1080 @ 25 fps, 175 frames (port legacy V2)', () => {
    expect(manifest.format.width).toBe(1920);
    expect(manifest.format.height).toBe(1080);
    expect(manifest.format.fps).toBe(25);
    expect(manifest.format.durationInFrames).toBe(175);
  });

  it('expose 9 requiredAssets (5 WebM + 2 directories ZIP + 2 fonts)', () => {
    expect(manifest.requiredAssets).toHaveLength(9);
    const directorySlots = manifest.requiredAssets.filter(
      (a: { mime: string }) => a.mime === 'application/x-png-frames',
    );
    expect(directorySlots).toHaveLength(2);
    const directoryKeys = directorySlots.map((a: { key: string }) => a.key);
    expect(directoryKeys).toEqual(expect.arrayContaining(['maskC', 'maskPackshot']));
  });
});

describe('ADR-128 — Manifest ENTRÉE Joueur étendu', () => {
  const manifest = JSON.parse(fs.readFileSync(ENTREE_MANIFEST, 'utf8'));

  it('kind=still + stillFrame:174 (capture la dernière frame du reveal)', () => {
    expect(manifest.kind).toBe('still');
    expect(manifest.stillFrame).toBe(174);
  });

  it('expose 4 requiredAssets (1 WebM + 1 directory + 2 fonts)', () => {
    expect(manifest.requiredAssets).toHaveLength(4);
    const directorySlots = manifest.requiredAssets.filter(
      (a: { mime: string }) => a.mime === 'application/x-png-frames',
    );
    expect(directorySlots).toHaveLength(1);
    expect(directorySlots[0].key).toBe('maskPackshot');
  });
});

describe('ADR-128 — Composition BUT générique consume directory assets', () => {
  const content = fs.readFileSync(BUT_COMPOSITION, 'utf8');

  it('schéma Zod accepte directoryAssetSchema { kind, baseUrl, framePattern, frameCount }', () => {
    expect(content).toMatch(/directoryAssetSchema\s*=\s*z\.object/);
    expect(content).toMatch(/kind:\s*z\.literal\(['"]directory['"]\)/);
    expect(content).toMatch(/framePattern:\s*z\.string/);
  });

  it('helper frameUrl interpole framePattern (ex: \'frame_{i:03d}.png\')', () => {
    expect(content).toMatch(/frameUrl/);
    expect(content).toMatch(/\\\{i:0\(\\d\+\)d\\\}/);
  });

  it('utilise OffthreadVideo pour les 5 layers WebM', () => {
    expect(content).toMatch(/OffthreadVideo/);
  });

  it('utilise SVG <mask> pour appliquer les masques alpha PNG frames', () => {
    expect(content).toMatch(/<mask\s+id=/);
    expect(content).toMatch(/foreignObject/);
  });

  it('charge fonts custom Bulevar + General Sans via useCustomFont', () => {
    expect(content).toMatch(/useCustomFont\(['"]Bulevar['"]/);
    expect(content).toMatch(/useCustomFont\(['"]General Sans['"]/);
  });
});

describe('ADR-128 — Composition ENTRÉE Joueur consume directory + frame fixe', () => {
  const content = fs.readFileSync(ENTREE_COMPOSITION, 'utf8');

  it('utilise OffthreadVideo + SVG mask pour le packshot', () => {
    expect(content).toMatch(/OffthreadVideo/);
    expect(content).toMatch(/<mask\s+id=/);
  });

  it('charge fonts custom via useCustomFont', () => {
    expect(content).toMatch(/useCustomFont\(['"]Bulevar['"]/);
    expect(content).toMatch(/useCustomFont\(['"]General Sans['"]/);
  });

  it('schéma Zod accepte directoryAssetSchema', () => {
    expect(content).toMatch(/directoryAssetSchema/);
    expect(content).toMatch(/kind:\s*z\.literal\(['"]directory['"]\)/);
  });
});
