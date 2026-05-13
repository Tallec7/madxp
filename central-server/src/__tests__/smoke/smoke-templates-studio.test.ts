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

const REPO_FILE = path.join(
  __dirname,
  '..',
  '..',
  'repositories',
  'templates-studio.repository.ts',
);
const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'migrations',
  'add-templates-studio-v1.sql',
);

describe('Templates Studio V1 — files exist', () => {
  it('repository file exists', () => {
    expect(fs.existsSync(REPO_FILE)).toBe(true);
  });

  it('migration file exists', () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
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
