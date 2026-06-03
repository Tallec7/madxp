/**
 * Smoke — wiring du champ `layout` sur video_variants (PROP-014 §8 / ADR-134).
 *
 * Garde-fou de la tranche verticale "mise en page de variante LED" : migration →
 * full-schema → repository → controller → route. File-based (pattern audit-then-guard).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — video_variants.layout (PROP-014 / ADR-134)', () => {
  it('la migration ajoute la colonne layout en IF NOT EXISTS', () => {
    const sql = read('scripts/migrations/add-video-variants-layout.sql');
    expect(sql).toMatch(/ALTER TABLE video_variants/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS layout/i);
  });

  it('full-schema.sql déclare la colonne layout sur video_variants', () => {
    const schema = read('scripts/full-schema.sql');
    const tableStart = schema.indexOf('CREATE TABLE public.video_variants');
    expect(tableStart).toBeGreaterThan(-1);
    const tableBlock = schema.slice(tableStart, tableStart + 1200);
    expect(tableBlock).toMatch(/layout character varying\(16\)/);
  });

  it('le repository expose layout (row, upsert, updateLayout) + enum VARIANT_LAYOUTS', () => {
    const repo = read('repositories/video-variant.repository.ts');
    expect(repo).toMatch(/VARIANT_LAYOUTS/);
    expect(repo).toMatch(/layout:\s*VariantLayout\s*\|\s*null/); // row type
    expect(repo).toMatch(/async updateLayout\(/);
    // l'upsert ne doit pas écraser un layout existant avec NULL
    expect(repo).toMatch(/layout = COALESCE\(EXCLUDED\.layout, video_variants\.layout\)/);
  });

  it('le controller valide le layout contre l’enum et délègue au repository', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/updateVideoVariantLayout/);
    expect(ctrl).toMatch(/VARIANT_LAYOUTS\.includes/);
    expect(ctrl).toMatch(/videoVariantRepository\.updateLayout/);
  });

  it('la route PATCH layout est montée avec auth + rôle', () => {
    const routes = read('routes/content.routes.ts');
    expect(routes).toMatch(
      /router\.patch\(\s*['"]\/videos\/:id\/variants\/:displayType\/layout['"]/
    );
    expect(routes).toMatch(/updateVideoVariantLayout/);
  });

  it('le barrel repositories réexporte VARIANT_LAYOUTS + VariantLayout', () => {
    const barrel = read('repositories/index.ts');
    expect(barrel).toMatch(/VARIANT_LAYOUTS/);
    expect(barrel).toMatch(/type VariantLayout/);
  });
});
