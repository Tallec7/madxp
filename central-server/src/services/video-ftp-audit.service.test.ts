// Mocks must be hoisted BEFORE the service import.
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('./storage.service', () => ({
  getVideoUrl: jest.fn((path: string) => `https://kalonpartners.bzh/neopro-video/${path}`),
}));

jest.mock('./metrics.service', () => ({
  __esModule: true,
  default: { recordVideoFtpAudit: jest.fn() },
  metricsService: { recordVideoFtpAudit: jest.fn() },
}));

jest.mock('../repositories', () => ({
  alertRepository: { create: jest.fn() },
  videoFtpAuditRepository: { findMissingReferencedInProfiles: jest.fn(), markNotified: jest.fn() },
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { videoFtpAuditService } from './video-ftp-audit.service';
import { query } from '../config/database';
import metricsService from './metrics.service';
import { alertRepository, videoFtpAuditRepository } from '../repositories';

const mockCreateAlert = alertRepository.create as jest.MockedFunction<typeof alertRepository.create>;
const mockFindMissing = videoFtpAuditRepository.findMissingReferencedInProfiles as jest.MockedFunction<
  typeof videoFtpAuditRepository.findMissingReferencedInProfiles
>;
const mockMarkNotified = videoFtpAuditRepository.markNotified as jest.MockedFunction<
  typeof videoFtpAuditRepository.markNotified
>;

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRecord = metricsService.recordVideoFtpAudit as jest.MockedFunction<typeof metricsService.recordVideoFtpAudit>;

describe('VideoFtpAuditService.auditAllVideos (PR2.2)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns zero counters when no videos in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.scanned).toBe(0);
    expect(result.missing).toBe(0);
    expect(result.unreachable).toBe(0);
    expect(result.resolved).toBe(0);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ scanned: 0, missing: 0 }));
  });

  it('records a warning when HEAD returns 404', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-missing', storage_path: 'videos/ac/dead.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // upsertWarning UPDATE

    globalThis.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false } as Response);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.scanned).toBe(1);
    expect(result.missing).toBe(1);
    expect(result.unreachable).toBe(0);
    // upsertWarning called with status='missing'
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/INSERT INTO video_ftp_audit_warnings/);
    expect(lastCall[1]).toEqual(expect.arrayContaining(['v-missing', 'videos/ac/dead.mp4', 'missing', 404]));
  });

  it('records "unreachable" when HEAD AND Range fallback both throw', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-net', storage_path: 'videos/xx/x.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never);

    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.unreachable).toBe(1);
    expect(result.missing).toBe(0);
    // 2 fetch calls: HEAD then Range fallback
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(2);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][1].method).toBe('HEAD');
    expect((globalThis.fetch as jest.Mock).mock.calls[1][1].method).toBe('GET');
    // Le Range doit être là ; on ne fige plus l'objet entier, qui porte aussi
    // les en-têtes anti-cache.
    expect((globalThis.fetch as jest.Mock).mock.calls[1][1].headers).toMatchObject({
      Range: 'bytes=0-0',
    });
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[1]).toEqual(expect.arrayContaining(['v-net', 'unreachable']));
  });

  it('classifies as "ok" when HEAD fails but Range fallback returns 206 (Hostinger-style HEAD refusal)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-range-ok', storage_path: 'GOLDEN_CUP.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 0 } as never); // clearWarning DELETE — no prior warning

    let calls = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve({ status: 206, ok: true } as Response);
    });

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.unreachable).toBe(0);
    expect(result.missing).toBe(0);
    // No warning persisted — clearWarning called instead
    const dbCalls = mockQuery.mock.calls.map(c => c[0]);
    expect(dbCalls.some(sql => /DELETE FROM video_ftp_audit_warnings/.test(String(sql)))).toBe(true);
    expect(dbCalls.some(sql => /INSERT INTO video_ftp_audit_warnings/.test(String(sql)))).toBe(false);
  });

  it('classifies as "missing" if HEAD fails but Range fallback returns 404', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-range-404', storage_path: 'really-gone.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never);

    let calls = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve({ status: 404, ok: false } as Response);
    });

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.missing).toBe(1);
    expect(result.unreachable).toBe(0);
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[1]).toEqual(expect.arrayContaining(['v-range-404', 'missing', 404]));
  });

  it('auto-resolves (DELETE warning) when HEAD returns 200 and a warning existed', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-ok', storage_path: 'videos/ok.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // clearWarning DELETE

    globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true } as Response);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.resolved).toBe(1);
    expect(result.missing).toBe(0);
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/DELETE FROM video_ftp_audit_warnings/);
  });

  it('handles a mixed batch (200 OK + 404 + ECONNRESET) in a single run', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'ok', storage_path: 'a.mp4' },
          { id: 'gone', storage_path: 'b.mp4' },
          { id: 'down', storage_path: 'c.mp4' },
        ],
      } as never)
      // 3 follow-up writes (1 DELETE + 2 INSERT/UPDATE) — order depends on
      // concurrency, just resolve them all.
      .mockResolvedValue({ rowCount: 1 } as never);

    let n = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve({ status: 200, ok: true } as Response);
      if (n === 2) return Promise.resolve({ status: 404, ok: false } as Response);
      return Promise.reject(new Error('timeout'));
    });

    const result = await videoFtpAuditService.auditAllVideos({ batchSize: 10, concurrency: 1 });

    expect(result.scanned).toBe(3);
    expect(result.missing).toBe(1);
    expect(result.unreachable).toBe(1);
    expect(result.resolved).toBe(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});

/**
 * Restitution des fichiers manquants.
 *
 * L'audit remplissait sa table depuis mai 2026 sans que personne ne le sache :
 * 46 fichiers absents, 51 lignes, `notified_at` NULL sur toutes. Ces tests
 * verrouillent les deux décisions qui rendent l'alerte lisible — n'alerter que
 * sur ce qui est diffusé, et agréger par site.
 */
describe('VideoFtpAuditService.notifyMissingReferencedInProfiles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('alerte une fois par site, avec le compte et la liste complète en metadata', async () => {
    mockFindMissing.mockResolvedValue([
      { site_id: 'site-a', site_name: 'Gymnase Mangin-Beaulieu', storage_paths: ['a.mp4', 'b.mp4'] },
      { site_id: 'site-b', site_name: 'GLT Sport', storage_paths: ['a.mp4'] },
    ]);
    mockMarkNotified.mockResolvedValue(2);

    const out = await videoFtpAuditService.notifyMissingReferencedInProfiles();

    expect(out).toEqual({ sitesAlerted: 2, pathsNotified: 2 });
    expect(mockCreateAlert).toHaveBeenCalledTimes(2);
    expect(mockCreateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        site_id: 'site-a',
        alert_type: 'video_missing_on_storage',
        // `warning`, pas `critical` : la diffusion continue, le player saute le
        // fichier absent. Ouvrir le branchement avec 4 alertes critiques ferait
        // passer un correctif de fond pour une panne.
        severity: 'warning',
        metadata: { storage_paths: ['a.mp4', 'b.mp4'], count: 2 },
      }),
    );
    // Le message doit porter le compte : « 2 vidéo(s) ... » se trie et se lit.
    expect(mockCreateAlert.mock.calls[0][0].message).toMatch(/^2 vidéo/);

    // Dédup des chemins avant marquage : 'a.mp4' est sur les deux sites.
    expect(mockMarkNotified).toHaveBeenCalledWith(['a.mp4', 'b.mp4']);
  });

  it('n’alerte PAS quand aucun fichier manquant n’est diffusé', async () => {
    // 30 des 46 fichiers absents ne sont dans aucune config : ce sont des rows
    // orphelines. Alerter dessus noierait les 16 qui sont réellement à l'écran.
    mockFindMissing.mockResolvedValue([]);

    const out = await videoFtpAuditService.notifyMissingReferencedInProfiles();

    expect(out).toEqual({ sitesAlerted: 0, pathsNotified: 0 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
    expect(mockMarkNotified).not.toHaveBeenCalled();
  });

  it('tronque le message au-delà de 5 fichiers mais garde tout en metadata', async () => {
    const paths = ['1.mp4', '2.mp4', '3.mp4', '4.mp4', '5.mp4', '6.mp4', '7.mp4'];
    mockFindMissing.mockResolvedValue([
      { site_id: 'site-a', site_name: 'Gros club', storage_paths: paths },
    ]);
    mockMarkNotified.mockResolvedValue(7);

    await videoFtpAuditService.notifyMissingReferencedInProfiles();

    const arg = mockCreateAlert.mock.calls[0][0];
    expect(arg.message).toContain('+2 autre(s)');
    expect(arg.message).not.toContain('7.mp4');
    // Celui qui traite l'incident a besoin de la liste entière.
    expect(arg.metadata).toEqual({ storage_paths: paths, count: 7 });
  });
});

/**
 * La sonde doit interroger l'ORIGINE, jamais un edge CDN.
 *
 * Incident du 2026-08-11 : neuf vidéos de Piraths supprimées de l'origine Hostinger
 * répondaient 200 avec la bonne taille depuis un edge chaud. L'audit les déclarait
 * saines — dont les deux sponsors ruban du club. Un audit qui confirme ce qu'on
 * espère est pire que pas d'audit.
 */
describe('VideoFtpAuditService — la sonde contourne le cache CDN', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Lance un audit sur une vidéo et rend les URLs réellement sondées. */
  async function probedUrls(fetchImpl: jest.Mock): Promise<string[]> {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'v-cdn', storage_path: 'videos/ab/cd.mp4' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never);
    globalThis.fetch = fetchImpl;
    await videoFtpAuditService.auditAllVideos();
    return fetchImpl.mock.calls.map((c) => String(c[0]));
  }

  it('ajoute un paramètre unique à chaque URL sondée', async () => {
    const urls = await probedUrls(jest.fn().mockResolvedValue({ status: 200, ok: true } as Response));

    expect(urls).toHaveLength(1);
    // Le chemin réel doit rester intact — on ne sonde pas une autre ressource.
    expect(urls[0]).toContain('videos/ab/cd.mp4');
    // C'est CE paramètre qui force l'origine : sans lui, un edge chaud sert un
    // fichier supprimé avec un 200 et l'audit conclut « sain ».
    expect(urls[0]).toMatch(/[?&]_audit=[0-9a-f-]{36}/);
  });

  it('n’envoie jamais deux fois la même URL — un cache-buster réutilisé ne busterait rien', async () => {
    // HEAD en échec → fallback Range : les deux sondes doivent être distinctes.
    const urls = await probedUrls(jest.fn().mockRejectedValue(new Error('ECONNRESET')));

    expect(urls).toHaveLength(2);
    expect(new Set(urls).size).toBe(2);
  });

  it('accompagne la sonde d’en-têtes anti-cache', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, ok: true } as Response);
    await probedUrls(fetchImpl);

    // Ceinture et bretelles : un edge peut ignorer ces en-têtes, d'où le
    // paramètre d'URL — mais les envoyer ne coûte rien.
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ 'Cache-Control': 'no-cache, no-store' });
  });
});
