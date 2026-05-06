/**
 * Smoke tests — deploy-progress.handler.ts in_progress throttle
 *
 * Garde-fou contre la régression de l'incident 2026-05-06 :
 * 20+ vidéos déployées en parallèle sur Pi RACC → handler.ts UPDATE par chunk
 * sans throttle → pool PG (size 5, ADR-070) saturé →
 * "Database query error: timeout exceeded when trying to connect" en boucle.
 *
 * Vérifie statiquement que le throttle in-memory est en place ET qu'il ne
 * s'applique PAS aux statuts terminaux (completed/failed/error).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const HANDLER = path.join(ROOT, 'handlers/deploy-progress.handler.ts');

describe('deploy-progress.handler.ts — in_progress throttle (smoke)', () => {
  const src = fs.readFileSync(HANDLER, 'utf8');

  it('declares the throttle interval and delta constants', () => {
    expect(src).toMatch(/PROGRESS_UPDATE_MIN_INTERVAL_MS\s*=\s*\d+/);
    expect(src).toMatch(/PROGRESS_UPDATE_MIN_DELTA\s*=\s*\d+/);
  });

  it('uses an in-memory Map keyed by deploymentId for throttle state', () => {
    expect(src).toMatch(/lastProgressWriteByDeployment\s*=\s*new Map/);
  });

  it('skip logic guards the in_progress UPDATE only (not error/completed)', () => {
    // Le shouldSkip doit exister et être appliqué AVANT le UPDATE in_progress.
    const skipIdx = src.indexOf('shouldSkip');
    const inProgressUpdateIdx = src.indexOf("status = 'in_progress'");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(inProgressUpdateIdx).toBeGreaterThan(skipIdx);
  });

  it('always fires UPDATE for terminal states (cleans throttle map)', () => {
    // Le delete() doit être appelé dans les branches error et completed pour
    // garantir qu'un futur déploiement réutilisant le même id repart à zéro.
    const deleteCalls = src.match(/lastProgressWriteByDeployment\.delete\(/g) || [];
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('forces UPDATE when progress = 0 (first event) or progress = 100', () => {
    // Le shouldSkip doit explicitement exclure 0 et >= 100 pour ne pas perdre
    // les bornes du déploiement (start visible côté dashboard, complete safety net).
    expect(src).toMatch(/roundedProgress\s*!==\s*0/);
    expect(src).toMatch(/roundedProgress\s*<\s*100/);
  });

  it('throttle interval is at least 500ms (avoid pool storm under burst)', () => {
    const match = src.match(/PROGRESS_UPDATE_MIN_INTERVAL_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const ms = parseInt(match![1], 10);
    expect(ms).toBeGreaterThanOrEqual(500);
  });
});
