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
