/**
 * Smoke tests — update_config payload contract.
 *
 * Garde-fou contre la régression observée le 2026-05-06 : trois call sites
 * cloud (cascade delete vidéo, replace vidéo, FTP orphan unlink) émettaient
 * `commandQueueService.sendOrQueue(siteId, 'update_config', { reason, videoId })`
 * sans `neoProContent`. Le handler Pi `raspberry/sync-agent/src/commands/update-config.js`
 * exige `neoProContent` ou `configuration` et rejetait la commande avec
 * "Missing neoProContent or configuration in update_config command", laissant
 * la config Pi avec des références mortes jusqu'au prochain deploy complet.
 *
 * Vérifie statiquement que :
 * - Les 3 emit sites passent maintenant par `buildEnrichedNeoProContent()` et
 *   incluent `neoProContent` dans le payload.
 * - `buildEnrichedNeoProContent()` reste exportée depuis `profile-sync.service.ts`.
 * - La chaîne d'enrichissement (auto-resolve + display variants + analytics)
 *   est appelée dans le helper, comme l'exige `.claude/rules/services.md`.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('update_config payload contract (smoke)', () => {
  it('profile-sync.service.ts exports buildEnrichedNeoProContent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'services/profile-sync.service.ts'), 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+buildEnrichedNeoProContent\s*\(/);
  });

  it('buildEnrichedNeoProContent runs the full enrichment chain', () => {
    const src = fs.readFileSync(path.join(ROOT, 'services/profile-sync.service.ts'), 'utf8');
    // Locate the helper body and assert each enrichment step is present.
    const startIdx = src.indexOf('export async function buildEnrichedNeoProContent');
    expect(startIdx).toBeGreaterThan(-1);
    const body = src.slice(startIdx);
    expect(body).toMatch(/autoResolveSponsorIds\s*\(/);
    expect(body).toMatch(/enrichConfigWithDisplayVariants\s*\(/);
    expect(body).toMatch(/enrichConfigWithAnalyticsMetadata\s*\(/);
    expect(body).toMatch(/findDefaultForSite\s*\(/);
  });

  it('content.controller.ts cascade-delete emit includes neoProContent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'controllers/content.controller.ts'), 'utf8');
    // The block has `reason: 'video_deleted_cascade'` — assert neoProContent is on the same emit.
    const cascadeIdx = src.indexOf("reason: 'video_deleted_cascade'");
    expect(cascadeIdx).toBeGreaterThan(-1);

    // Look backwards ~600 chars for sendOrQueue + neoProContent on this emit.
    const window = src.slice(Math.max(0, cascadeIdx - 600), cascadeIdx + 200);
    expect(window).toMatch(/sendOrQueue\([^)]*'update_config'/);
    expect(window).toMatch(/neoProContent\s*:/);
    expect(window).toMatch(/buildEnrichedNeoProContent\s*\(/);
  });

  it('content.controller.ts replace emit includes neoProContent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'controllers/content.controller.ts'), 'utf8');
    const replaceIdx = src.indexOf("reason: 'video_replaced'");
    expect(replaceIdx).toBeGreaterThan(-1);

    const window = src.slice(Math.max(0, replaceIdx - 600), replaceIdx + 200);
    expect(window).toMatch(/sendOrQueue\([^)]*'update_config'/);
    expect(window).toMatch(/neoProContent\s*:/);
    expect(window).toMatch(/buildEnrichedNeoProContent\s*\(/);
  });

  it('site-fleet-dashboard.controller.ts orphan-unlink emit includes neoProContent', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'controllers/site-fleet-dashboard.controller.ts'),
      'utf8'
    );
    const orphanIdx = src.indexOf("reason: 'ftp_orphan_unlinked'");
    expect(orphanIdx).toBeGreaterThan(-1);

    const window = src.slice(Math.max(0, orphanIdx - 600), orphanIdx + 200);
    expect(window).toMatch(/sendOrQueue\([^)]*'update_config'/);
    expect(window).toMatch(/neoProContent\s*:/);
    expect(window).toMatch(/buildEnrichedNeoProContent\s*\(/);
  });

  it('Pi handler still requires neoProContent (contract anchor)', () => {
    const piHandler = fs.readFileSync(
      path.resolve(ROOT, '../../raspberry/sync-agent/src/commands/update-config.js'),
      'utf8'
    );
    expect(piHandler).toMatch(/data\.neoProContent\s*\|\|\s*data\.configuration/);
    expect(piHandler).toMatch(/Missing neoProContent or configuration/);
  });
});
