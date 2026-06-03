/**
 * Smoke — pipeline d'export LED async (PROP-014 étape 6 / ADR-134).
 *
 * Garde-fou du wiring : migration → full-schema → repository → worker (boot + stop) →
 * controller (enqueue/status) → routes. File-based (audit-then-guard).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — export LED async (PROP-014 étape 6)', () => {
  it('migration + full-schema déclarent led_export_jobs', () => {
    expect(read('scripts/migrations/add-led-export-jobs.sql')).toMatch(/CREATE TABLE IF NOT EXISTS led_export_jobs/);
    const schema = read('scripts/full-schema.sql');
    expect(schema).toMatch(/CREATE TABLE public\.led_export_jobs/);
    expect(schema).toMatch(/idx_led_export_jobs_queued/);
  });

  it('le repository fait un claim atomique FOR UPDATE SKIP LOCKED + failStaleRunning', () => {
    const repo = read('repositories/led-export-job.repository.ts');
    expect(repo).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(repo).toMatch(/async failStaleRunning/);
    expect(repo).toMatch(/markReady/);
    expect(repo).toMatch(/markFailed/);
  });

  it('le worker recovère les jobs orphelins au boot et plie via applyFoldExport', () => {
    const worker = read('services/led-export-worker.service.ts');
    expect(worker).toMatch(/failStaleRunning/);
    expect(worker).toMatch(/applyFoldExport/);
    expect(worker).toMatch(/\.unref\(\)/); // timer non bloquant
  });

  it('le worker est démarré ET arrêté dans server.ts', () => {
    const server = read('server.ts');
    expect(server).toMatch(/startLedExportWorker/);
    expect(server).toMatch(/stopLedExportWorker/);
  });

  it('le controller expose enqueue (202) + status, gardé led-perimeter', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/enqueueLedExport/);
    expect(ctrl).toMatch(/getLedExportJob/);
    expect(ctrl).toMatch(/status\(202\)/);
    expect(ctrl).toMatch(/displayType !== 'led-perimeter'/);
  });

  it('les routes export + status sont montées', () => {
    const routes = read('routes/content.routes.ts');
    expect(routes).toMatch(/router\.post\([^)]*\/variants\/:displayType\/export['"]/);
    expect(routes).toMatch(/router\.get\([^)]*\/led-export-jobs\/:jobId['"]/);
  });

  it('l’export plie pour le CLUB CIBLE (target_site_id), pas le propriétaire de la vidéo', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/target_site_id/);
    // Le club cible doit avoir un profil LED périmétrique (fail-fast).
    expect(ctrl).toMatch(/getDisplays\(targetSiteId\)/);
  });

  it('réutilise un ruban déjà plié pour le même (vidéo × club × fit)', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/findReady\(/);
    expect(ctrl).toMatch(/reused: true/);
    const repo = read('repositories/led-export-job.repository.ts');
    expect(repo).toMatch(/async findReady\(/);
    expect(repo).toMatch(/status = 'ready'/);
  });

  // --- Banc d'essai (test bench) : plier une vidéo AU CHOIX pour ce club ---

  it('le worker retombe sur le binaire principal quand la vidéo n’a pas de variante', () => {
    const worker = read('services/led-export-worker.service.ts');
    // Source = variante led-perimeter si elle existe, sinon vidéo principale.
    expect(worker).toMatch(/findByVideoAndDisplay/);
    expect(worker).toMatch(/videoRepository\.findVideoById/);
    expect(worker).toMatch(/variant\?\.storage_path \?\? null/);
  });

  it('le controller expose enqueueLedTestExport (banc d’essai, vidéo au choix)', () => {
    const ctrl = read('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/export const enqueueLedTestExport/);
    expect(ctrl).toMatch(/normalizeLayout\(req\.body\?\.layout\)/);
    // Fail-fast : le club doit avoir un profil LED.
    expect(ctrl).toMatch(/getDisplays\(siteId\)/);
  });

  it('la route /led-test-export/:siteId est montée avec validation', () => {
    const routes = read('routes/content.routes.ts');
    expect(routes).toMatch(/router\.post\([^)]*\/led-test-export\/:siteId['"]/);
    expect(routes).toMatch(/validate\(schemas\.ledTestExport\)/);
    const validation = read('middleware/validation.ts');
    expect(validation).toMatch(/ledTestExport:/);
    expect(validation).toMatch(/repeated.*scrolling.*stretched.*centered/);
  });
});
