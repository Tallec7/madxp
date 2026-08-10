/**
 * Heartbeat SaaS — rafraîchit `last_seen_at` pendant la diffusion.
 *
 * Régression gardée : sans battement, `last_seen_at` reste figé à la connexion
 * (`saas-register`) et tout jugement de présence par seuil déclare « hors ligne »
 * un club qui diffuse depuis plus de 90 s.
 */

import { saasHeartbeatService, SAAS_HEARTBEAT_INTERVAL_MS } from './saas-heartbeat.service';

jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('./db-circuit-breaker.service', () => ({
  dbCircuitBreaker: {
    isAvailable: jest.fn(() => true),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  },
}));

import { query } from '../config/database';
import { dbCircuitBreaker } from './db-circuit-breaker.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockBreaker = dbCircuitBreaker as jest.Mocked<typeof dbCircuitBreaker>;

describe('saasHeartbeatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saasHeartbeatService.stop();
    mockBreaker.isAvailable.mockReturnValue(true);
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] } as never);
  });

  afterEach(() => saasHeartbeatService.stop());

  it('bat toutes les 30 s — le seuil online de 90 s tolère 3 battements manqués', () => {
    expect(SAAS_HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  it('rafraîchit last_seen_at des sites ayant un écran connecté', async () => {
    saasHeartbeatService.start(() => ['site-a', 'site-b']);
    const updated = await saasHeartbeatService.tick();

    expect(updated).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE sites/);
    expect(sql).toMatch(/last_seen_at = NOW\(\)/);
    expect(params).toEqual([['site-a', 'site-b']]);
  });

  it('ne touche JAMAIS un site Pi — le filtre site_type est dans la requête', async () => {
    saasHeartbeatService.start(() => ['site-a']);
    await saasHeartbeatService.tick();
    expect(mockQuery.mock.calls[0][0]).toMatch(/site_type = 'saas'/);
  });

  it('un seul UPDATE batché quel que soit le nombre de sites', async () => {
    saasHeartbeatService.start(() => ['a', 'b', 'c', 'd', 'e']);
    await saasHeartbeatService.tick();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('ne crée pas de présence : aucun site connecté → aucune requête', async () => {
    saasHeartbeatService.start(() => []);
    const updated = await saasHeartbeatService.tick();
    expect(updated).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('s’abstient quand le circuit breaker DB est ouvert', async () => {
    mockBreaker.isAvailable.mockReturnValue(false);
    saasHeartbeatService.start(() => ['site-a']);
    const updated = await saasHeartbeatService.tick();
    expect(updated).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('avale les erreurs DB — un heartbeat cassé ne fait pas tomber le process', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    saasHeartbeatService.start(() => ['site-a']);
    await expect(saasHeartbeatService.tick()).resolves.toBe(0);
    expect(mockBreaker.recordFailure).toHaveBeenCalled();
  });

  it('ne bat pas tant qu’il n’est pas démarré', async () => {
    const updated = await saasHeartbeatService.tick();
    expect(updated).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('ne chevauche pas deux battements (tick lent)', async () => {
    let resolveQuery: (v: unknown) => void = () => undefined;
    mockQuery.mockImplementation(
      () => new Promise((resolve) => { resolveQuery = resolve; }) as never
    );

    saasHeartbeatService.start(() => ['site-a']);
    const first = saasHeartbeatService.tick();
    const second = await saasHeartbeatService.tick(); // pendant que le 1er est en vol

    expect(second).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    resolveQuery({ rowCount: 1, rows: [] });
    await first;
  });

  it('start est idempotent et stop libère le timer', () => {
    saasHeartbeatService.start(() => ['site-a']);
    expect(saasHeartbeatService.isRunning()).toBe(true);
    saasHeartbeatService.start(() => ['autre']); // second start ignoré
    expect(saasHeartbeatService.isRunning()).toBe(true);
    saasHeartbeatService.stop();
    expect(saasHeartbeatService.isRunning()).toBe(false);
  });

  it('bat réellement sur le timer', async () => {
    jest.useFakeTimers();
    try {
      saasHeartbeatService.start(() => ['site-a'], 1000);
      expect(mockQuery).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    } finally {
      saasHeartbeatService.stop();
      jest.useRealTimers();
    }
  });
});
