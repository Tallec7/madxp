/**
 * Smoke tests — Template versioning + backgrounds grants
 * Garde-fous des contrats ADR-106 + ADR-107.
 * File-based assertions only — no HTTP server boot.
 *
 * Protects :
 *   - Migration : columns + tables + constraints + backfill
 *   - SPEC JOUEUR slot capabilities : text_transform, auto_crop, user_offset_x, require_alpha
 *   - templateBackgroundsRepository : visibilité filtrée par grants
 *   - Repository pattern : pas d'import direct config/database hors repo
 *
 * Usage : npm run test:smoke (ou npm run test:smoke:smart)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');
const migrationFile = path.join(
  centralSrc,
  'scripts',
  'migrations',
  'add-template-versioning-and-backgrounds.sql'
);

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

function readMigration(): string {
  return fs.readFileSync(migrationFile, 'utf8');
}

describe('Template versioning — ADR-106', () => {
  it('migration adds version + status + published_* columns to neopro_templates', () => {
    const sql = readMigration();
    expect(sql).toMatch(/ALTER\s+TABLE\s+neopro_templates/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+version\s+TEXT/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+status\s+TEXT/i);
    expect(sql).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'draft'\s*,\s*'published'\s*,\s*'archived'\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+published_at/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+published_by/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+parent_template_id/i);
  });

  it('migration creates template_versions snapshot table with all SPEC v2 fields', () => {
    const sql = readMigration();
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+template_versions/i);
    expect(sql).toMatch(/layers_snapshot\s+JSONB\s+NOT\s+NULL/i);
    expect(sql).toMatch(/text_fields_snapshot\s+JSONB\s+NOT\s+NULL/i);
    expect(sql).toMatch(/image_slots_snapshot\s+JSONB\s+NOT\s+NULL/i);
    expect(sql).toMatch(/variants_snapshot\s+JSONB/i);
    expect(sql).toMatch(/fonts_snapshot\s+JSONB/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*template_id\s*,\s*version\s*\)/i);
  });

  it('backfill seeds existing templates as published v1.0 with snapshot', () => {
    const sql = readMigration();
    expect(sql).toMatch(/UPDATE\s+neopro_templates\s+SET\s+status\s*=\s*'published'/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+template_versions/i);
    expect(sql).toMatch(/COALESCE\([^)]*version[^)]*'1\.0'\)/i);
    // backfill is idempotent : skipped if snapshot already exists
    expect(sql).toMatch(/WHERE\s+NOT\s+EXISTS[\s\S]*FROM\s+template_versions/i);
  });
});

describe('Slot capabilities — SPEC JOUEUR (text_transform, auto_crop)', () => {
  it('migration adds text_transform to template_text_fields with allowed values', () => {
    const sql = readMigration();
    expect(sql).toMatch(/ALTER\s+TABLE\s+template_text_fields/i);
    expect(sql).toMatch(/text_transform\s+TEXT/i);
    expect(sql).toMatch(/CHECK\s*\([^)]*'none'[^)]*'uppercase'[^)]*'lowercase'[^)]*'capitalize'/i);
  });

  it('migration adds auto_crop + user_offset_x + require_alpha to template_image_slots', () => {
    const sql = readMigration();
    expect(sql).toMatch(/ALTER\s+TABLE\s+template_image_slots/i);
    expect(sql).toMatch(/auto_crop\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
    expect(sql).toMatch(/user_offset_x\s+NUMERIC[\s\S]*DEFAULT\s+0/i);
    expect(sql).toMatch(/CHECK\s*\(\s*user_offset_x\s+BETWEEN\s+-100\s+AND\s+100\s*\)/i);
    expect(sql).toMatch(/require_alpha\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
  });
});

describe('Backgrounds + grants — ADR-107', () => {
  it('migration creates template_backgrounds with hex_color check + uniqueness', () => {
    const sql = readMigration();
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+template_backgrounds/i);
    expect(sql).toMatch(/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    expect(sql).toMatch(/hex_color\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\([^)]*'\^#\[0-9A-Fa-f\]\{6\}\$'/i);
    expect(sql).toMatch(/is_public\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/i);
    expect(sql).toMatch(/archived_at\s+TIMESTAMPTZ/i);
  });

  it('migration creates template_backgrounds_grants with composite PK + cascade', () => {
    const sql = readMigration();
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+template_backgrounds_grants/i);
    expect(sql).toMatch(/background_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+template_backgrounds[^,]*ON\s+DELETE\s+CASCADE/i);
    expect(sql).toMatch(/user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users[^,]*ON\s+DELETE\s+CASCADE/i);
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*background_id\s*,\s*user_id\s*\)/i);
  });

  it('repository implements visibility policy (public OR explicit grant)', () => {
    const repo = readFile('repositories/template-backgrounds.repository.ts');
    expect(repo).toMatch(/async\s+listForUser\s*\(\s*userId\s*:\s*string\s*\)/);
    // policy: is_public OR EXISTS in grants
    expect(repo).toMatch(/is_public\s*=\s*true\s*OR\s+EXISTS/i);
    expect(repo).toMatch(/FROM\s+template_backgrounds_grants\s+g\s+WHERE\s+g\.background_id\s*=\s*b\.id/i);
    // archived rows excluded
    expect(repo).toMatch(/archived_at\s+IS\s+NULL/i);
  });

  it('repository exposes lifecycle : create + grantBulk + revoke + archive', () => {
    const repo = readFile('repositories/template-backgrounds.repository.ts');
    expect(repo).toMatch(/async\s+create\s*\(/);
    expect(repo).toMatch(/async\s+grantBulk\s*\(/);
    expect(repo).toMatch(/async\s+revoke\s*\(/);
    expect(repo).toMatch(/async\s+archive\s*\(/);
    // bulk grant idempotent
    expect(repo).toMatch(/ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i);
    expect(repo).toContain('export const templateBackgroundsRepository = new TemplateBackgroundsRepository()');
  });

  it('repository does not import config/database directly (repository pattern)', () => {
    const repo = readFile('repositories/template-backgrounds.repository.ts');
    // Allowed: import { query } from '../config/database' (this file IS a repository)
    expect(repo).toMatch(/from\s+'\.\.\/config\/database'/);
    // No raw connection or pool import
    expect(repo).not.toMatch(/from\s+['"][^'"]*config\/database['"][^;]*Pool/);
  });
});

describe('PNG auto_crop service — POC SPEC JOUEUR Q15', () => {
  it('service exposes computeAlphaBbox + hasAlphaChannel', () => {
    const svc = readFile('services/png-bbox.service.ts');
    expect(svc).toMatch(/async\s+computeAlphaBbox\s*\(/);
    expect(svc).toMatch(/async\s+hasAlphaChannel\s*\(/);
    expect(svc).toContain('export const pngBboxService = new PngBboxService()');
  });

  it('service uses pngjs (pure JS, no native dep)', () => {
    const svc = readFile('services/png-bbox.service.ts');
    expect(svc).toMatch(/from\s+'pngjs'/);
    expect(svc).not.toMatch(/from\s+'sharp'/);
  });

  it('AutoCropResult exposes bbox + suggested_offset_x + empty flag', () => {
    const svc = readFile('services/png-bbox.service.ts');
    expect(svc).toMatch(/suggested_offset_x:\s*number/);
    expect(svc).toMatch(/empty:\s*boolean/);
    expect(svc).toMatch(/alpha_threshold:\s*number/);
  });

  it('package.json declares pngjs runtime + @types/pngjs devDep', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(centralSrc, '..', 'package.json'), 'utf8')
    );
    expect(pkg.dependencies?.pngjs).toBeDefined();
    expect(pkg.devDependencies?.['@types/pngjs']).toBeDefined();
  });
});

describe('Versioning API — ADR-106 endpoints publish/fork/list/setDefault', () => {
  it('repository expose publish + fork + listByTemplate + findVersion + setDefaultVersion', () => {
    const repo = readFile('repositories/template-versions.repository.ts');
    expect(repo).toMatch(/async\s+publish\s*\(/);
    expect(repo).toMatch(/async\s+fork\s*\(/);
    expect(repo).toMatch(/async\s+listByTemplate\s*\(/);
    expect(repo).toMatch(/async\s+findVersion\s*\(/);
    expect(repo).toMatch(/async\s+setDefaultVersion\s*\(/);
    expect(repo).toContain('export const templateVersionsRepository = new TemplateVersionsRepository()');
  });

  it('publish utilise une transaction BEGIN/COMMIT/ROLLBACK + FOR UPDATE', () => {
    const repo = readFile('repositories/template-versions.repository.ts');
    expect(repo).toMatch(/BEGIN/);
    expect(repo).toMatch(/COMMIT/);
    expect(repo).toMatch(/ROLLBACK/);
    expect(repo).toMatch(/FOR\s+UPDATE/);
  });

  it('publish refuse already_published et signale version_exists', () => {
    const repo = readFile('repositories/template-versions.repository.ts');
    expect(repo).toMatch(/already_published/);
    expect(repo).toMatch(/version_exists/);
  });

  it('fork copie les tables filles dynamiquement (information_schema, pas de hardcode)', () => {
    const repo = readFile('repositories/template-versions.repository.ts');
    expect(repo).toMatch(/information_schema\.columns/i);
    // Whitelist défensive contre injection
    expect(repo).toMatch(/\^\[a-z_\]\[a-z0-9_\]\*\$/);
    // Boucle sur les 4 tables filles
    expect(repo).toMatch(/template_layers/);
    expect(repo).toMatch(/template_text_fields/);
    expect(repo).toMatch(/template_image_slots/);
    expect(repo).toMatch(/template_variants/);
  });

  it('fork refuse invalid_version et fork_exists', () => {
    const repo = readFile('repositories/template-versions.repository.ts');
    expect(repo).toMatch(/invalid_version/);
    expect(repo).toMatch(/fork_exists/);
  });

  it('controller expose les 4 endpoints versioning', () => {
    const ctrl = readFile('controllers/template-versioning.controller.ts');
    expect(ctrl).toMatch(/export\s+const\s+publishTemplateVersion/);
    expect(ctrl).toMatch(/export\s+const\s+forkTemplateVersion/);
    expect(ctrl).toMatch(/export\s+const\s+listTemplateV2Versions/);
    expect(ctrl).toMatch(/export\s+const\s+setTemplateDefaultVersion/);
  });

  it('controller mappe les erreurs métier vers les bons codes HTTP', () => {
    const ctrl = readFile('controllers/template-versioning.controller.ts');
    // 409 sur conflits métier
    expect(ctrl).toMatch(/already_published[\s\S]*409/);
    expect(ctrl).toMatch(/fork_exists[\s\S]*409/);
    // 400 sur validation métier (next_version <= source)
    expect(ctrl).toMatch(/invalid_version[\s\S]*400/);
  });

  it('routes montent les 4 endpoints derrière super_admin + Joi', () => {
    const routes = readFile('routes/template-studio.routes.ts');
    expect(routes).toMatch(/'\/:id\/publish'[\s\S]*adminOnly[\s\S]*publishTemplateVersion/);
    expect(routes).toMatch(/'\/:id\/fork'[\s\S]*templateFork[\s\S]*forkTemplateVersion/);
    expect(routes).toMatch(/'\/:id\/versions'[\s\S]*adminOnly[\s\S]*listTemplateV2Versions/);
    expect(routes).toMatch(/'\/:id\/default-version'[\s\S]*templateSetDefaultVersion[\s\S]*setTemplateDefaultVersion/);
  });

  it('Joi schemas templateFork + templateSetDefaultVersion enforcent semver MAJOR.MINOR', () => {
    const validation = readFile('middleware/validation.ts');
    // templateFork.next_version pattern semver
    expect(validation).toMatch(/templateFork:[\s\S]*next_version:[\s\S]*\^\\d\+\\\.\\d\+\$/);
    expect(validation).toMatch(/templateSetDefaultVersion:[\s\S]*version:[\s\S]*\^\\d\+\\\.\\d\+\$/);
  });
});

describe('Auto-crop API — POST /photo/auto-crop (SPEC JOUEUR Q15)', () => {
  it('controller refuse les requêtes sans fichier (400 no_file)', () => {
    const ctrl = readFile('controllers/template-photo-autocrop.controller.ts');
    expect(ctrl).toMatch(/no_file[\s\S]*400/);
  });

  it('controller enforce require_alpha (refuse PNG opaques avec missing_alpha_channel)', () => {
    const ctrl = readFile('controllers/template-photo-autocrop.controller.ts');
    expect(ctrl).toMatch(/hasAlphaChannel/);
    expect(ctrl).toMatch(/missing_alpha_channel/);
  });

  it('controller valide threshold dans [0,255] et signale empty_alpha si bbox vide', () => {
    const ctrl = readFile('controllers/template-photo-autocrop.controller.ts');
    expect(ctrl).toMatch(/invalid_threshold/);
    expect(ctrl).toMatch(/empty_alpha/);
    expect(ctrl).toMatch(/0[\s\S]*255/);
  });

  it('upload middleware uploadPngBuffer accepte uniquement image/png', () => {
    const upload = readFile('middleware/upload.ts');
    expect(upload).toMatch(/export\s+const\s+uploadPngBuffer\s*=\s*multer/);
    expect(upload).toMatch(/file\.mimetype\s*===\s*'image\/png'/);
    // memory storage (PNG petits, pas besoin de disque)
    expect(upload).toMatch(/uploadPngBuffer[\s\S]*storage:\s*memoryStorage/);
  });

  it('route /photo/auto-crop est gated super_admin + multer single field "photo"', () => {
    const routes = readFile('routes/template-studio.routes.ts');
    expect(routes).toMatch(/'\/photo\/auto-crop'[\s\S]*adminOnly[\s\S]*uploadPngBuffer\.single\('photo'\)[\s\S]*autoCropPhoto/);
  });
});

describe('Backgrounds API — ADR-107 catalogue + grants', () => {
  it('repository expose listAll + update + listGrants', () => {
    const repo = readFile('repositories/template-backgrounds.repository.ts');
    expect(repo).toMatch(/async\s+listAll\s*\(/);
    expect(repo).toMatch(/async\s+update\s*\(/);
    expect(repo).toMatch(/async\s+listGrants\s*\(/);
  });

  it('controller expose 7 handlers (list + get + create + update + grantBulk + listGrants + revoke)', () => {
    const ctrl = readFile('controllers/template-backgrounds.controller.ts');
    expect(ctrl).toMatch(/export\s+const\s+listBackgroundsForUser/);
    expect(ctrl).toMatch(/export\s+const\s+getBackground[^s]/);
    expect(ctrl).toMatch(/export\s+const\s+createBackground/);
    expect(ctrl).toMatch(/export\s+const\s+updateBackground/);
    expect(ctrl).toMatch(/export\s+const\s+grantBackgroundBulk/);
    expect(ctrl).toMatch(/export\s+const\s+listBackgroundGrants/);
    expect(ctrl).toMatch(/export\s+const\s+revokeBackgroundGrant/);
  });

  it('controller cleanup le fichier temp après upload (mémoire / disque)', () => {
    const ctrl = readFile('controllers/template-backgrounds.controller.ts');
    expect(ctrl).toMatch(/cleanupTempFile/);
    expect(ctrl).toMatch(/finally[\s\S]*cleanupTempFile/);
  });

  it('controller mappe les conflits unique (name) vers 409 name_exists', () => {
    const ctrl = readFile('controllers/template-backgrounds.controller.ts');
    expect(ctrl).toMatch(/duplicate\s+key\|unique[\s\S]*409[\s\S]*name_exists/);
  });

  it('controller filtre les backgrounds restreints sans grant (403 Forbidden)', () => {
    const ctrl = readFile('controllers/template-backgrounds.controller.ts');
    expect(ctrl).toMatch(/!bg\.is_public[\s\S]*403[\s\S]*Forbidden/);
  });

  it('routes monte les endpoints derrière super_admin (sauf list/get visible à tous users authentifiés)', () => {
    const routes = readFile('routes/template-backgrounds.routes.ts');
    expect(routes).toMatch(/router\.get\(\s*'\/'[\s\S]*allUsers[\s\S]*listBackgroundsForUser/);
    expect(routes).toMatch(/router\.post\(\s*'\/'[\s\S]*adminOnly[\s\S]*uploadTemplateAsset\.single\('background'\)[\s\S]*createBackground/);
    expect(routes).toMatch(/router\.patch[\s\S]*'\/:id'[\s\S]*adminOnly[\s\S]*updateBackground/);
    expect(routes).toMatch(/router\.post[\s\S]*'\/:id\/grants'[\s\S]*adminOnly[\s\S]*grantBackgroundBulk/);
    expect(routes).toMatch(/router\.delete[\s\S]*'\/:backgroundId\/grants\/:userId'[\s\S]*adminOnly[\s\S]*revokeBackgroundGrant/);
  });

  it('Joi schemas backgrounds enforcent hex_color + bulk grant ≤ 500 user_ids', () => {
    const validation = readFile('middleware/validation.ts');
    expect(validation).toMatch(/templateBackgroundCreate:[\s\S]*hex_color:[\s\S]*\^#\[0-9A-Fa-f\]\{6\}\$/);
    expect(validation).toMatch(/templateBackgroundBulkGrant:[\s\S]*user_ids:[\s\S]*\.max\(500\)/);
  });

  it('routes sont montées dans server.ts sous /api/templates/backgrounds', () => {
    const server = readFile('server.ts');
    expect(server).toMatch(/templateBackgroundsRoutes/);
    expect(server).toMatch(/'\/api\/templates\/backgrounds'[\s\S]*templateBackgroundsRoutes/);
  });
});

describe('text_transform — runtime + types + repository plumbing', () => {
  it('TemplateTextField type expose textTransform avec union typée', () => {
    const types = readFile('types/template-studio.types.ts');
    expect(types).toMatch(/textTransform:\s*TextTransform/);
    expect(types).toMatch(/export\s+type\s+TextTransform\s*=\s*'none'\s*\|\s*'uppercase'\s*\|\s*'lowercase'\s*\|\s*'capitalize'/);
    // DB row aligné avec la colonne SQL
    expect(types).toMatch(/text_transform:\s*TextTransform/);
  });

  it('TemplateRuntime expose textTransform sur RuntimeTextField + applique le style CSS', () => {
    const runtime = fs.readFileSync(
      path.join(
        repoRoot,
        'templates-remotion',
        'src',
        'runtime',
        'TemplateRuntime.tsx'
      ),
      'utf8'
    );
    // Type field présent
    expect(runtime).toMatch(/textTransform\?:\s*'none'\s*\|\s*'uppercase'/);
    // Consommation dans le style CSS du <div> texte (default 'none')
    expect(runtime).toMatch(/textTransform:\s*tf\.textTransform\s*\?\?\s*'none'/);
  });

  it('templateStudioRepository mappe text_transform dans le SELECT (default "none")', () => {
    const repo = readFile('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/textTransform:\s*r\.text_transform\s*\?\?\s*'none'/);
    // INSERT contient la colonne text_transform
    expect(repo).toMatch(/animation_direction,\s*text_transform\)/);
    // UPDATE colMap contient le mapping
    expect(repo).toMatch(/textTransform:\s*'text_transform'/);
  });
});
