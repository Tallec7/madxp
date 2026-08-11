/**
 * Tests unitaires — `renderRequestRepository.claimNextQueued()` (ADR-141).
 *
 * Ce que ces tests protègent : un rendu Studio lance Chromium + le compositor
 * Remotion. La production a déjà connu deux `Compositor quit with signal
 * SIGKILL` (2026-05-15) — le conteneur tue le compositor quand la mémoire
 * manque. Avec un poll de 2 s et des rendus de 9 à 16 minutes, une file de N
 * demandes démarrait N rendus en 2N secondes.
 *
 * `FOR UPDATE SKIP LOCKED` ne protège que du double-claim d'une MÊME demande.
 * Le plafond de concurrence est un mécanisme distinct, et il doit vivre en DB
 * pour traverser les processus.
 *
 * On teste le comportement observable du claim, pas la forme du SQL.
 */

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: async () => ({ query: mockClientQuery, release: mockRelease }),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import {
  renderRequestRepository,
  getStudioRenderMaxConcurrency,
  STUDIO_RENDER_STALE_MIN,
} from './templates-studio.repository';

const REQUEST = { id: 'req-1', site_id: 'site-1', status: 'rendering' };

const sqlSent = (): string[] =>
  mockClientQuery.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

function stubClient({ lockGranted = true, inFlight = 0 } = {}) {
  mockClientQuery.mockImplementation(async (text: string) => {
    if (/advisory/i.test(text)) return { rows: [{ locked: lockGranted }], rowCount: 1 };
    if (/COUNT\(\*\)/i.test(text)) return { rows: [{ n: String(inFlight) }], rowCount: 1 };
    if (/RETURNING \*/i.test(text)) return { rows: [REQUEST], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

describe('renderRequestRepository.claimNextQueued — plafond de concurrence (ADR-141)', () => {
  const envBackup = process.env.STUDIO_RENDER_MAX_CONCURRENCY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STUDIO_RENDER_MAX_CONCURRENCY;
  });

  afterAll(() => {
    if (envBackup === undefined) delete process.env.STUDIO_RENDER_MAX_CONCURRENCY;
    else process.env.STUDIO_RENDER_MAX_CONCURRENCY = envBackup;
  });

  it('sérialise par défaut (un rendu à la fois)', () => {
    expect(getStudioRenderMaxConcurrency()).toBe(1);
  });

  it('le plafond est réglable par env, sans redéploiement', () => {
    process.env.STUDIO_RENDER_MAX_CONCURRENCY = '3';
    expect(getStudioRenderMaxConcurrency()).toBe(3);
    // Une valeur absurde ne doit pas désactiver le plafond.
    process.env.STUDIO_RENDER_MAX_CONCURRENCY = '0';
    expect(getStudioRenderMaxConcurrency()).toBe(1);
    process.env.STUDIO_RENDER_MAX_CONCURRENCY = 'beaucoup';
    expect(getStudioRenderMaxConcurrency()).toBe(1);
  });

  it('le seuil d’orphelin dépasse la durée d’un rendu réel (9–16 min observées)', () => {
    // À 10 min — la valeur historique — le seuil passait SOUS la durée normale :
    // un redémarrage en cours de rendu remettait en file un travail vivant.
    expect(STUDIO_RENDER_STALE_MIN).toBeGreaterThan(16);
  });

  it('ne claim rien quand un autre processus tient le verrou de claim', async () => {
    stubClient({ lockGranted: false });

    const request = await renderRequestRepository.claimNextQueued();

    expect(request).toBeNull();
    expect(sqlSent().some((s) => /RETURNING \*/.test(s))).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('ne claim rien quand un rendu est déjà en vol (plafond par défaut = 1)', async () => {
    // Ce rendu peut tourner sur CE process ou sur un autre replica : seule la DB
    // le sait, une garde booléenne en mémoire ne le verrait pas.
    stubClient({ lockGranted: true, inFlight: 1 });

    expect(await renderRequestRepository.claimNextQueued()).toBeNull();
    expect(sqlSent().some((s) => /RETURNING \*/.test(s))).toBe(false);
  });

  it('claim sous le plafond relevé, refuse au-dessus', async () => {
    stubClient({ lockGranted: true, inFlight: 2 });
    expect(await renderRequestRepository.claimNextQueued(3)).toEqual(REQUEST);

    jest.clearAllMocks();
    stubClient({ lockGranted: true, inFlight: 3 });
    expect(await renderRequestRepository.claimNextQueued(3)).toBeNull();
  });

  it('ordre imposé : verrou → décompte → claim', async () => {
    stubClient({ lockGranted: true, inFlight: 0 });

    await renderRequestRepository.claimNextQueued();

    const sql = sqlSent();
    const lockIdx = sql.findIndex((s) => /advisory/i.test(s));
    const countIdx = sql.findIndex((s) => /COUNT\(\*\)/i.test(s));
    const claimIdx = sql.findIndex((s) => /RETURNING \*/.test(s));
    // Compter avant de verrouiller laisserait deux replicas lire « 0 en vol »
    // à la même milliseconde et démarrer chacun un Chromium.
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(countIdx);
    expect(countIdx).toBeLessThan(claimIdx);
    expect(sql[claimIdx]).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('remet en file les rendus sans signe de vie AVANT de compter', async () => {
    stubClient({ lockGranted: true, inFlight: 0 });

    await renderRequestRepository.claimNextQueued(1, 30);

    const sql = sqlSent();
    const reclaimIdx = sql.findIndex((s) => /minutes/i.test(s));
    const countIdx = sql.findIndex((s) => /COUNT\(\*\)/i.test(s));
    // Sans auto-guérison avant le décompte, un replica tué en plein rendu
    // bloquerait la file entière (plafond = 1) jusqu'au prochain boot.
    expect(reclaimIdx).toBeGreaterThanOrEqual(0);
    expect(reclaimIdx).toBeLessThan(countIdx);
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringMatching(/minutes/i), ['30']);
  });

  it('touchRendering ne rafraîchit qu’un rendu encore `rendering`', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await renderRequestRepository.touchRendering('req-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/status = 'rendering'/);
    expect(String(sql)).toMatch(/updated_at = NOW\(\)/);
    expect(params).toEqual(['req-1']);
  });
});
