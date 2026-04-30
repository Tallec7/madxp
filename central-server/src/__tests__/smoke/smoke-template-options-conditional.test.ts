/**
 * Smoke tests — template options + conditional slots + packshot pluggable.
 * Garde-fous des 3 capabilities moteur ajoutées pour couvrir le PDF JOUEUR §démarrage.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');
const migrationFile = path.join(
  centralSrc,
  'scripts',
  'migrations',
  'add-template-options-and-conditional-slots.sql'
);

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Migration : template_options + visible_if + packshot refs', () => {
  const sql = fs.readFileSync(migrationFile, 'utf8');

  it('crée table template_options avec contraintes type + values JSONB array', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+template_options/i);
    expect(sql).toMatch(/CHECK\s*\(\s*type\s+IN\s*\(\s*'enum'\s*,\s*'boolean'\s*\)/i);
    expect(sql).toMatch(/CHECK\s*\(\s*jsonb_typeof\s*\(\s*values\s*\)\s*=\s*'array'\s*\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*template_id\s*,\s*key\s*\)/i);
  });

  it('ajoute visible_if sur template_text_fields ET template_image_slots', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+template_text_fields[\s\S]*visible_if\s+TEXT/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+template_image_slots[\s\S]*visible_if\s+TEXT/i);
  });

  it('crée table template_packshot_refs avec FK protégée + contraintes', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+template_packshot_refs/i);
    expect(sql).toMatch(/packshot_template_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+neopro_templates[^,]*ON\s+DELETE\s+RESTRICT/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*template_id\s*,\s*option_key\s*,\s*option_value\s*\)/i);
    expect(sql).toMatch(/CHECK\s*\(\s*start_at_ms\s+>=\s+0\s*\)/i);
  });
});

describe('Repository template-options', () => {
  const repo = readFile('repositories/template-options.repository.ts');

  it('expose listOptions + create + delete + listPackshotRefs + resolvePackshot', () => {
    expect(repo).toMatch(/async\s+listOptions\s*\(/);
    expect(repo).toMatch(/async\s+createOption\s*\(/);
    expect(repo).toMatch(/async\s+deleteOption\s*\(/);
    expect(repo).toMatch(/async\s+listPackshotRefs\s*\(/);
    expect(repo).toMatch(/async\s+createPackshotRef\s*\(/);
    expect(repo).toMatch(/async\s+resolvePackshot\s*\(/);
    expect(repo).toContain('export const templateOptionsRepository = new TemplateOptionsRepository()');
  });

  it('resolvePackshot match strict option_value pour mapper vers le packshot template_id', () => {
    expect(repo).toMatch(/selectedOptions\[ref\.option_key\]\s*===\s*ref\.option_value/);
  });
});

describe('Service template-visibility (eval visible_if)', () => {
  const svc = readFile('services/template-visibility.service.ts');

  it('expose evaluateVisibleIf + filterVisibleSlots', () => {
    expect(svc).toMatch(/export\s+function\s+evaluateVisibleIf\s*\(/);
    expect(svc).toMatch(/export\s+function\s+filterVisibleSlots\s*</);
  });

  it('regex EXPR strict (key max 64 char, value max 200 char) — sécurité regex DoS', () => {
    // Le regex doit être ancré ^...$ et avoir des bornes explicites
    expect(svc).toMatch(/EXPR_REGEX\s*=\s*\/\^/);
    expect(svc).toMatch(/\{0,63\}/); // key max 64 char
    expect(svc).toMatch(/\{0,200\}/); // value max 200 char
  });

  it('fail-open sur expression mal formée (slot considéré visible)', () => {
    expect(svc).toMatch(/return\s*\{\s*visible:\s*true,\s*invalid:\s*true\s*\}/);
  });
});

describe('Runtime TemplateRuntime — visible_if filtering', () => {
  const runtime = fs.readFileSync(
    path.join(repoRoot, 'templates-remotion', 'src', 'runtime', 'TemplateRuntime.tsx'),
    'utf8'
  );

  it('expose selectedOptions + visibleIf sur RuntimeTextField et RuntimeImageSlot', () => {
    expect(runtime).toMatch(/selectedOptions\?:\s*Record<string,\s*string>/);
    expect(runtime).toMatch(/visibleIf\?:\s*string\s*\|\s*null/);
  });

  it('filtre les slots avant stacking (skip si invisible)', () => {
    expect(runtime).toMatch(/if\s*\(\s*!isSlotVisible\s*\(\s*field\.visibleIf,\s*selectedOptions\s*\)\s*\)\s*continue/);
    expect(runtime).toMatch(/if\s*\(\s*!isSlotVisible\s*\(\s*slot\.visibleIf,\s*selectedOptions\s*\)\s*\)\s*continue/);
  });

  it('regex visible_if côté runtime cohérent avec le service backend (pas de divergence)', () => {
    expect(runtime).toMatch(/VISIBLE_IF_REGEX[\s\S]*\{0,63\}[\s\S]*\{0,200\}/);
  });
});

describe('Repository plumbing : visible_if dans mapping + types', () => {
  it('TemplateTextField + TemplateImageSlot exposent visibleIf', () => {
    const types = readFile('types/template-studio.types.ts');
    expect(types).toMatch(/visibleIf:\s*string\s*\|\s*null/);
    expect(types).toMatch(/visible_if:\s*string\s*\|\s*null/);
  });

  it('mapTextField + mapImageSlot lisent r.visible_if avec fallback null', () => {
    const repo = readFile('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/visibleIf:\s*r\.visible_if\s*\?\?\s*null/);
  });
});
