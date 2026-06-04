/**
 * Smoke — contenu LED « par côté » sur la variante (ADR-135, révision).
 *
 * Garde-fou du wiring : migration → full-schema → repo → controller → routes.
 * File-based (audit-then-guard), pas de DB requise.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — variante LED « par côté » (ADR-135)', () => {
  it('migration : side_files + storage_path/filename nullable', () => {
    const mig = read('scripts/migrations/add-video-variant-side-files.sql');
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS side_files JSONB/);
    expect(mig).toMatch(/ALTER COLUMN storage_path DROP NOT NULL/);
    expect(mig).toMatch(/ALTER COLUMN filename DROP NOT NULL/);
  });

  it('full-schema reflète side_files + storage_path nullable', () => {
    const schema = read('scripts/full-schema.sql');
    const table = schema.slice(
      schema.indexOf('CREATE TABLE public.video_variants'),
      schema.indexOf('CREATE TABLE public.videos')
    );
    expect(table).toMatch(/side_files jsonb/);
    // storage_path NE doit PLUS être NOT NULL dans le snapshot.
    expect(table).not.toMatch(/storage_path character varying\(1000\) NOT NULL/);
  });

  it('le repo expose setSideFile / clearSideFile + le type SideFile', () => {
    const repo = read('repositories/video-variant.repository.ts');
    expect(repo).toMatch(/export interface VideoVariantSideFile/);
    expect(repo).toMatch(/async setSideFile\(/);
    expect(repo).toMatch(/async clearSideFile\(/);
    // setSideFile crée la row si absente (variante par côté pure).
    expect(repo).toMatch(/INSERT INTO video_variants \(video_id, display_type, side_files/);
    // clearSideFile supprime la row si plus rien (anti-variante fantôme).
    expect(repo).toMatch(/DELETE FROM video_variants WHERE video_id/);
  });

  it('le controller expose upload/delete par côté, gardé led-perimeter', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/export const uploadVideoVariantSide/);
    expect(ctrl).toMatch(/export const deleteVideoVariantSide/);
    expect(ctrl).toMatch(/displayType !== 'led-perimeter'/);
    // getVideoVariants résout les URLs publiques des fichiers par côté.
    expect(ctrl).toMatch(/side_files: \(v\.side_files \?\? \[\]\)\.map/);
    // Choisir une vidéo existante par côté (sans upload).
    expect(ctrl).toMatch(/export const setVideoVariantSideFromVideo/);
  });

  it('le controller setVideoVariantSideFromVideo est re-exporté par le barrel content', () => {
    expect(read('controllers/content.controller.ts')).toMatch(/setVideoVariantSideFromVideo/);
  });

  it('les routes upload + delete + from-video par côté sont montées', () => {
    const routes = read('routes/content.routes.ts');
    expect(routes).toMatch(/router\.post\([^)]*\/variants\/:displayType\/sides\/:sideIndex['"]/);
    expect(routes).toMatch(/router\.delete\([^)]*\/variants\/:displayType\/sides\/:sideIndex['"]/);
    expect(routes).toMatch(/router\.post\([^)]*\/variants\/:displayType\/sides\/:sideIndex\/from-video['"]/);
  });

  it('le type SideFile est exporté par le barrel repositories', () => {
    expect(read('repositories/index.ts')).toMatch(/type VideoVariantSideFile/);
  });

  it('le worker d’export compose PAR CÔTÉ quand la variante a des side_files', () => {
    const worker = read('services/led-export-worker.service.ts');
    // Branche per-side : side_files → applyPerSideFold (géométrie par côté).
    expect(worker).toMatch(/computeFoldGeometryPerSide/);
    expect(worker).toMatch(/applyPerSideFold/);
    expect(worker).toMatch(/async function performPerSideExport/);
    // Détection : side_files non vide → composition par côté.
    expect(worker).toMatch(/sideFiles\.length > 0/);
    // Repli : un côté sans fichier retombe sur la source uniforme.
    expect(worker).toMatch(/\?\?\s*uniformFallback/);
  });

  it('l’enrichissement déploiement SAUTE les variantes par côté sans fichier (anti MP4 noir)', () => {
    const enrich = read('utils/config-secondary-variants.ts');
    // Garde-fou : ni storage_path ni filename → on n'injecte pas `videos-.../null`.
    expect(enrich).toMatch(/if \(!v\.storage_path && !v\.filename\) continue;/);
  });
});
