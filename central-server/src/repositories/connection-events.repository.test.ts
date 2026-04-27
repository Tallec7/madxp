/**
 * Tests unitaires pour connectionEventsRepository (ADR-099).
 *
 * Couvre :
 * - record() : insertion + résilience aux erreurs DB (best-effort)
 * - getUptimeStats() : calcul d'uptime sur cas réels
 *   - aucun event → null + state unknown
 *   - 1 connect persistant sur la fenêtre → 100%
 *   - flapping (5 disconnect en 24h) → uptime correct + disconnectCount = 5
 *   - longue coupure → longestGapSeconds correct
 * - purgeOlderThan()
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { connectionEventsRepository } from './connection-events.repository';

describe('ConnectionEventsRepository (ADR-099)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // record()
  // --------------------------------------------------------------------------

  describe('record', () => {
    it('inserts a connected event', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await connectionEventsRepository.record({
        siteId: 'site-1',
        eventType: 'connected',
        socketId: 'sock-abc',
        clientIp: '1.2.3.4',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO connection_events'),
        ['site-1', 'connected', null, 'sock-abc', '1.2.3.4']
      );
    });

    it('inserts a disconnected event with a reason', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await connectionEventsRepository.record({
        siteId: 'site-2',
        eventType: 'disconnected',
        reason: 'transport close',
        socketId: 'sock-xyz',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO connection_events'),
        ['site-2', 'disconnected', 'transport close', 'sock-xyz', null]
      );
    });

    it('does not throw when DB write fails (best-effort)', async () => {
      mockQuery.mockRejectedValue(new Error('boom'));
      await expect(
        connectionEventsRepository.record({ siteId: 's', eventType: 'connected' })
      ).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getUptimeStats() — algorithme central, le bug à éliminer
  // --------------------------------------------------------------------------

  describe('getUptimeStats', () => {
    it('returns null/unknown when no events exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const stats = await connectionEventsRepository.getUptimeStats('site-1', 24);
      expect(stats).toEqual({
        uptimePercent: null,
        disconnectCount: 0,
        longestGapSeconds: 0,
        currentState: 'unknown',
      });
    });

    it('returns ~100% when site connected before window and still connected', async () => {
      // Event antérieur à la fenêtre 24h ('connected' à -25h), aucun event dans la fenêtre.
      const before = new Date(Date.now() - 25 * 3600 * 1000);
      mockQuery.mockResolvedValue({
        rows: [{ event_type: 'connected', occurred_at: before }],
        rowCount: 1,
      });
      const stats = await connectionEventsRepository.getUptimeStats('site-1', 24);
      expect(stats.uptimePercent).toBeGreaterThanOrEqual(99.9);
      expect(stats.currentState).toBe('connected');
      expect(stats.disconnectCount).toBe(0);
      expect(stats.longestGapSeconds).toBe(0);
    });

    it('counts disconnects and computes uptime on flapping site', async () => {
      // Site qui flap 3 fois en 24h, ~30 min coupé à chaque fois.
      const now = Date.now();
      const h = (n: number) => new Date(now - n * 3600 * 1000);
      const rows = [
        // Antérieur à la fenêtre (état initial = connected).
        { event_type: 'connected', occurred_at: h(25) },
        // Cycle 1 : disconnect à -20h, reconnect à -19.5h (30 min coupé)
        { event_type: 'disconnected', occurred_at: h(20) },
        { event_type: 'connected', occurred_at: h(19.5) },
        // Cycle 2 : disconnect à -15h, reconnect à -14.5h
        { event_type: 'disconnected', occurred_at: h(15) },
        { event_type: 'connected', occurred_at: h(14.5) },
        // Cycle 3 : disconnect à -5h, reconnect à -4.5h
        { event_type: 'disconnected', occurred_at: h(5) },
        { event_type: 'connected', occurred_at: h(4.5) },
      ];
      mockQuery.mockResolvedValue({ rows, rowCount: rows.length });
      const stats = await connectionEventsRepository.getUptimeStats('site-1', 24);
      expect(stats.disconnectCount).toBe(3);
      expect(stats.currentState).toBe('connected');
      // 3 coupures × 30 min = 1.5h offline sur 24h = 93.75% uptime
      expect(stats.uptimePercent).toBeGreaterThanOrEqual(93);
      expect(stats.uptimePercent).toBeLessThanOrEqual(95);
      // Plus longue coupure ~30 min = 1800s
      expect(stats.longestGapSeconds).toBeGreaterThanOrEqual(1700);
      expect(stats.longestGapSeconds).toBeLessThanOrEqual(1900);
    });

    it('captures longest gap when site is currently still disconnected', async () => {
      const now = Date.now();
      const h = (n: number) => new Date(now - n * 3600 * 1000);
      const rows = [
        { event_type: 'connected', occurred_at: h(25) },
        { event_type: 'disconnected', occurred_at: h(2) }, // coupé depuis 2h
      ];
      mockQuery.mockResolvedValue({ rows, rowCount: rows.length });
      const stats = await connectionEventsRepository.getUptimeStats('site-1', 24);
      expect(stats.currentState).toBe('disconnected');
      expect(stats.disconnectCount).toBe(1);
      // ~22h online sur 24h = ~91.7%
      expect(stats.uptimePercent).toBeGreaterThanOrEqual(91);
      expect(stats.uptimePercent).toBeLessThanOrEqual(92);
      // Plus longue coupure = depuis 2h jusqu'à NOW = ~7200s
      expect(stats.longestGapSeconds).toBeGreaterThanOrEqual(7100);
    });

    it('does NOT reproduce the buggy ~10% uptime for stable Pi (regression guard #644)', async () => {
      // Simule un Pi parfaitement stable : 1 connect au début de la fenêtre,
      // aucun disconnect. Avant ADR-099, le dashboard affichait ~10% d'uptime
      // (count metrics / 2880 alors que metrics est sampled toutes les 5 min).
      // Ici on doit lire 100%, sans aucun lien avec la fréquence des metrics.
      const oneDayAgoMinusOneHour = new Date(Date.now() - 25 * 3600 * 1000);
      mockQuery.mockResolvedValue({
        rows: [{ event_type: 'connected', occurred_at: oneDayAgoMinusOneHour }],
        rowCount: 1,
      });
      const stats = await connectionEventsRepository.getUptimeStats('site-stable', 24);
      // Si quelqu'un re-couple ce calcul à la table metrics, ce test casse.
      expect(stats.uptimePercent).toBeGreaterThanOrEqual(99);
      expect(stats.uptimePercent).not.toBeNull();
      expect(stats.uptimePercent).not.toBeLessThanOrEqual(50);
    });
  });

  // --------------------------------------------------------------------------
  // purgeOlderThan()
  // --------------------------------------------------------------------------

  describe('purgeOlderThan', () => {
    it('deletes rows older than retention window', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 142 });
      const deleted = await connectionEventsRepository.purgeOlderThan(90);
      expect(deleted).toBe(142);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM connection_events'),
        [90]
      );
    });
  });
});
