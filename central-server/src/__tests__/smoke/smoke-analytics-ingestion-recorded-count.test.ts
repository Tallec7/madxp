/**
 * Smoke tests — `recorded` reflète le VRAI nombre d'inserts (P3 incident 2026-05-14)
 *
 * Contexte de l'incident :
 * Le sync-agent Pi loggait `Sent 1 items to central server: { success: true, recorded: 1 }`
 * alors que le Postgres central retournait `rowCount = 0` après ON CONFLICT DO NOTHING
 * (cf. `analytics.repository.ts` : `(site_id, played_at, video_filename) DO NOTHING`).
 * Le controller renvoyait `recorded = validPlays.length` (count post-Joi) — masquant
 * complètement les Pi en flap recording qui replay le même `played_at` en boucle.
 *
 * Investigué Mangin-Beaulieu 2026-05-14, fix séparé du flap recording (PR #1018).
 *
 * Ce smoke test bloque la régression : si quelqu'un revient à `recorded: validPlays.length`
 * ou si la méthode `recordVideoPlays()` cesse de retourner le rowCount réel,
 * le compteur Prometheus `madxp_analytics_dedup_skipped_total` retombe muet et
 * un Pi en boucle redevient invisible.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../..');
const CONTROLLER = path.join(SRC_ROOT, 'controllers/analytics-ingestion.controller.ts');
const REPOSITORY = path.join(SRC_ROOT, 'repositories/analytics.repository.ts');
const METRICS = path.join(SRC_ROOT, 'services/metrics.service.ts');
const SYNC_AGENT_ANALYTICS = path.resolve(SRC_ROOT, '../../raspberry/sync-agent/src/analytics.js');
const SYNC_AGENT_SYNC = path.resolve(SRC_ROOT, '../../raspberry/sync-agent/src/services/analytics-sync.js');

const readFile = (p: string) => fs.readFileSync(p, 'utf8');

describe('Analytics ingestion — true recorded count (P3 incident 2026-05-14, smoke)', () => {
  describe('analytics.repository.ts — recordVideoPlays retourne { inserted, deduplicated }', () => {
    const src = readFile(REPOSITORY);

    it('signature retourne Promise<{ inserted, deduplicated }>', () => {
      expect(src).toMatch(/recordVideoPlays\([^)]*\):\s*Promise<\{\s*inserted:\s*number;\s*deduplicated:\s*number\s*\}>/);
    });

    it('lit result.rowCount du INSERT pour calculer inserted', () => {
      expect(src).toMatch(/result\.rowCount/);
    });

    it('deduplicated = plays.length - totalInserted (jamais hardcode 0)', () => {
      expect(src).toMatch(/deduplicated:\s*plays\.length\s*-\s*totalInserted/);
    });

    it('garde le ON CONFLICT DO NOTHING (dédup intentionnelle)', () => {
      expect(src).toMatch(/ON CONFLICT \(site_id, played_at, video_filename\) DO NOTHING/);
    });

    it('cas vide retourne { inserted: 0, deduplicated: 0 }', () => {
      expect(src).toMatch(/return\s*\{\s*inserted:\s*0,\s*deduplicated:\s*0\s*\}/);
    });
  });

  describe('analytics-ingestion.controller.ts — recorded = inserted réel, jamais validPlays.length', () => {
    const src = readFile(CONTROLLER);

    it('destructure { inserted, deduplicated } depuis recordVideoPlays()', () => {
      expect(src).toMatch(/const\s*\{\s*inserted,\s*deduplicated\s*\}\s*=\s*await\s+analyticsRepository\.recordVideoPlays\(/);
    });

    it('res.json renvoie recorded: inserted (pas validPlays.length)', () => {
      expect(src).toMatch(/recorded:\s*inserted/);
      // Garde-fou explicite contre la formulation buguée — le compteur DOIT venir du rowCount.
      expect(src).not.toMatch(/recorded:\s*validPlays\.length/);
    });

    it('res.json renvoie deduplicated pour que le Pi puisse logger', () => {
      expect(src).toMatch(/res\.json\(\{[^}]*deduplicated[^}]*\}\)/s);
    });

    it('appelle metricsService.recordAnalyticsDedupSkipped quand deduplicated > 0', () => {
      expect(src).toMatch(/metricsService\.recordAnalyticsDedupSkipped\(\s*site_id\s*,\s*deduplicated\s*\)/);
    });
  });

  describe('metrics.service.ts — Counter madxp_analytics_dedup_skipped_total', () => {
    const src = readFile(METRICS);

    it('déclare le Counter avec label site_id', () => {
      expect(src).toMatch(/name:\s*'madxp_analytics_dedup_skipped_total'/);
      expect(src).toMatch(/labelNames:\s*\[\s*'site_id'\s*\]/);
    });

    it('expose la méthode recordAnalyticsDedupSkipped(siteId, count)', () => {
      expect(src).toMatch(/recordAnalyticsDedupSkipped\(\s*siteId:\s*string,\s*count:\s*number\s*\):\s*void/);
    });
  });

  describe('raspberry/sync-agent — propagation deduplicated + warn local', () => {
    const analyticsSrc = readFile(SYNC_AGENT_ANALYTICS);
    const syncSrc = readFile(SYNC_AGENT_SYNC);

    it('analytics.js accumule totalDeduplicated depuis result.deduplicated', () => {
      expect(analyticsSrc).toMatch(/totalDeduplicated\s*\+=\s*result\.deduplicated\s*\|\|\s*0/);
    });

    it('analytics.js retourne deduplicated dans le payload sendToServer', () => {
      expect(analyticsSrc).toMatch(/deduplicated:\s*totalDeduplicated/);
    });

    it('analytics-sync.js logge un warn quand result.deduplicated > 0', () => {
      expect(syncSrc).toMatch(/result\.deduplicated\s*>\s*0/);
      expect(syncSrc).toMatch(/logger\.warn\(\s*['"]Analytics deduplicated by central/);
    });
  });

  describe('Comportement intégré — 2e POST identique retourne recorded: 0, deduplicated: 1', () => {
    // Validation behaviorale via le mock query : 1er batch insère 1 row,
    // 2e batch identique a Postgres rowCount = 0 (ON CONFLICT) → repo doit
    // reporter `inserted: 0, deduplicated: 1`.
    it('repository.recordVideoPlays reporte rowCount réel sur replay', async () => {
      jest.resetModules();
      const queryMock = jest.fn();
      jest.doMock('../../config/database', () => ({ query: queryMock }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { analyticsRepository } = require('../../repositories/analytics.repository');

      const play = {
        siteId: 'site-X', sessionId: null, videoFilename: 'v.mp4', category: 'sport',
        playedAt: '2026-05-14T10:00:00Z', durationPlayed: 30, videoDuration: 60,
        completed: false, triggerType: 'auto', videoId: null, sponsorId: null, tvStatus: null,
        eventType: null, period: null, audienceEstimate: null, positionInLoop: null, siteSponsorId: null,
        campaignId: null, source: null, interruptionReason: null,
      };

      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      const first = await analyticsRepository.recordVideoPlays([play]);
      expect(first).toEqual({ inserted: 1, deduplicated: 0 });

      queryMock.mockResolvedValueOnce({ rowCount: 0 });
      const second = await analyticsRepository.recordVideoPlays([play]);
      expect(second).toEqual({ inserted: 0, deduplicated: 1 });
    });
  });
});
