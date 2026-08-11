/**
 * Tests unitaires — `ledExportJobRepository.claimNextQueued()`.
 *
 * Ce que ces tests protègent : le pliage LED ouvre un décodeur ffmpeg par côté
 * du ruban. Deux pliages simultanés sur un conteneur Railway suffisent à faire
 * échouer les décodeurs (« Resource temporarily unavailable » — 24 pliages
 * perdus sur 52 chez Piraths le 2026-08-11). La sérialisation doit donc tenir
 * entre PROCESSUS, pas seulement dans la boucle d'un worker : `FOR UPDATE SKIP
 * LOCKED` empêche deux workers de prendre le même job, jamais d'en prendre deux
 * différents.
 *
 * On teste le comportement observable du claim (quelles requêtes partent, dans
 * quel ordre, et ce qui est renvoyé), pas la forme du SQL.
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

import { ledExportJobRepository, LED_EXPORT_MAX_CONCURRENCY } from './led-export-job.repository';

const JOB = { id: 'job-1', site_id: 'site-1', status: 'processing' };

/** SQL envoyés au client transactionnel, normalisés (espaces écrasés). */
const sqlSent = (): string[] =>
  mockClientQuery.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

/**
 * Client Postgres simulé : répond selon la nature de la requête.
 * `lockGranted` = le verrou consultatif est-il obtenu ; `inFlight` = nombre de
 * jobs déjà en cours de pliage (tous processus confondus).
 */
function stubClient({ lockGranted = true, inFlight = 0 } = {}) {
  mockClientQuery.mockImplementation(async (text: string) => {
    if (/advisory/i.test(text)) return { rows: [{ locked: lockGranted }], rowCount: 1 };
    if (/COUNT\(\*\)/i.test(text)) return { rows: [{ n: String(inFlight) }], rowCount: 1 };
    if (/RETURNING \*/i.test(text)) return { rows: [JOB], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

describe('ledExportJobRepository.claimNextQueued', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('le plafond de concurrence par défaut est 1 (un pliage à la fois)', () => {
    expect(LED_EXPORT_MAX_CONCURRENCY).toBe(1);
  });

  it('ne claim rien quand un autre processus tient le verrou de claim', async () => {
    stubClient({ lockGranted: false });

    const job = await ledExportJobRepository.claimNextQueued();

    expect(job).toBeNull();
    // Aucun job ne doit être passé en `processing` : le RETURNING * ne part pas.
    expect(sqlSent().some((s) => /RETURNING \*/.test(s))).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('ne claim rien quand le plafond de jobs en vol est déjà atteint', async () => {
    // Un pliage tourne déjà — sur CE process ou sur un autre replica : c'est la
    // DB qui le sait, pas la mémoire du worker.
    stubClient({ lockGranted: true, inFlight: 1 });

    const job = await ledExportJobRepository.claimNextQueued();

    expect(job).toBeNull();
    expect(sqlSent().some((s) => /RETURNING \*/.test(s))).toBe(false);
  });

  it('claim un job quand le verrou est obtenu et qu’aucun pliage n’est en vol', async () => {
    stubClient({ lockGranted: true, inFlight: 0 });

    const job = await ledExportJobRepository.claimNextQueued();

    expect(job).toEqual(JOB);
    const sql = sqlSent();
    // Ordre imposé : verrou → décompte → claim. Compter avant de verrouiller
    // laisserait deux replicas lire « 0 en vol » à la même milliseconde.
    const lockIdx = sql.findIndex((s) => /advisory/i.test(s));
    const countIdx = sql.findIndex((s) => /COUNT\(\*\)/i.test(s));
    const claimIdx = sql.findIndex((s) => /RETURNING \*/.test(s));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(countIdx);
    expect(countIdx).toBeLessThan(claimIdx);
    // Le claim reste protégé du double-claim d'un même job.
    expect(sql[claimIdx]).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('remet en file les jobs `processing` sans signe de vie avant de compter', async () => {
    stubClient({ lockGranted: true, inFlight: 0 });

    await ledExportJobRepository.claimNextQueued(1, 15);

    const sql = sqlSent();
    const reclaimIdx = sql.findIndex((s) => /minutes/i.test(s));
    const countIdx = sql.findIndex((s) => /COUNT\(\*\)/i.test(s));
    // Sans cette auto-guérison AVANT le décompte, un replica tué en plein
    // pliage bloquerait la file entière (plafond = 1) jusqu'au prochain boot.
    expect(reclaimIdx).toBeGreaterThanOrEqual(0);
    expect(reclaimIdx).toBeLessThan(countIdx);
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringMatching(/minutes/i), ['15']);
  });

  it('touchProcessing ne rafraîchit qu’un job encore `processing`', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await ledExportJobRepository.touchProcessing('job-1');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/status = 'processing'/);
    expect(String(sql)).toMatch(/updated_at = NOW\(\)/);
    expect(params).toEqual(['job-1']);
  });
});
