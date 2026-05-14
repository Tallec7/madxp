/**
 * Tests unitaires pour studioAssetRepository + templateAssetBindingRepository
 * (ADR-125 — Phase 1.5).
 *
 * Couvre les chemins critiques :
 * - upsert content-addressable (ON CONFLICT DO NOTHING + fetch existant)
 * - findFiltered avec combinaisons de filtres (tag, mime, search)
 * - findUsageById (utilisé par DELETE pour le 409)
 * - upsertBinding (UPSERT côté bindings)
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import {
  studioAssetRepository,
  templateAssetBindingRepository,
} from './templates-studio.repository';

describe('studioAssetRepository (ADR-125)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── findByChecksum ────────────────────────────────────────────────────────
  describe('findByChecksum', () => {
    it('returns asset row when found', async () => {
      const row = { id: 'a1', checksum_sha256: 'abc', filename: 'x.png' };
      mockQuery.mockResolvedValueOnce({ rows: [row] });
      const out = await studioAssetRepository.findByChecksum('abc');
      expect(out).toEqual(row);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE checksum_sha256 = $1'),
        ['abc'],
      );
    });

    it('returns null when no match', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const out = await studioAssetRepository.findByChecksum('zzz');
      expect(out).toBeNull();
    });
  });

  // ── create (upsert content-addressable) ───────────────────────────────────
  describe('create', () => {
    const baseInput = {
      filename: 'metal.png',
      ftp_path: 'studio-assets/abc-metal.png',
      mime_type: 'image/png',
      file_size: 1234,
      checksum_sha256: 'abc',
    };

    it('returns inserted row when no conflict', async () => {
      const row = { id: 'a1', ...baseInput, tags: [], uploaded_by: null };
      mockQuery.mockResolvedValueOnce({ rows: [row] });
      const out = await studioAssetRepository.create(baseInput);
      expect(out).toEqual(row);
      // Vérifie que ON CONFLICT DO NOTHING est dans la requête.
      const sqlArg = mockQuery.mock.calls[0][0] as string;
      expect(sqlArg).toMatch(/ON\s+CONFLICT\s*\(\s*checksum_sha256\s*\)\s+DO\s+NOTHING/i);
    });

    it('falls back to findByChecksum when ON CONFLICT swallows the INSERT', async () => {
      // 1er call : INSERT renvoie [] (conflict)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 2e call : findByChecksum renvoie la row existante
      const existing = { id: 'a-existing', checksum_sha256: 'abc', filename: 'metal.png' };
      mockQuery.mockResolvedValueOnce({ rows: [existing] });
      const out = await studioAssetRepository.create(baseInput);
      expect(out).toEqual(existing);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('throws when ON CONFLICT fires but no existing row found (defensive)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(studioAssetRepository.create(baseInput)).rejects.toThrow(
        /ON CONFLICT swallowed/,
      );
    });

    it('passes optional dimensions + tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
      await studioAssetRepository.create({
        ...baseInput,
        width: 1920,
        height: 1080,
        duration_ms: 5000,
        tags: ['texture', 'overlay'],
        uploaded_by: 'user-1',
      });
      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual(
        expect.arrayContaining([1920, 1080, 5000, ['texture', 'overlay'], 'user-1']),
      );
    });
  });

  // ── findFiltered ──────────────────────────────────────────────────────────
  describe('findFiltered', () => {
    it('renvoie rows + total sans filtres', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '12' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }, { id: 'a2' }] });
      const out = await studioAssetRepository.findFiltered();
      expect(out.total).toBe(12);
      expect(out.rows).toHaveLength(2);
    });

    it('applique filtre tags (overlap GIN)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
      await studioAssetRepository.findFiltered({ tags: ['texture'] });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/tags\s+&&\s+\$1::text\[\]/i);
    });

    it('applique filtre mimePrefix avec LIKE', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await studioAssetRepository.findFiltered({ mimePrefix: 'image/' });
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain('image/%');
    });

    it('applique filtre search en LOWER + LIKE', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await studioAssetRepository.findFiltered({ search: 'WaterMark' });
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain('%watermark%');
    });

    it('borne limit à 500 max + offset à 0 min', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await studioAssetRepository.findFiltered({ limit: 9999, offset: -10 });
      // Limit max 500, offset min 0.
      const sqlArg = mockQuery.mock.calls[1][0] as string;
      expect(sqlArg).toMatch(/LIMIT\s+\$1\s+OFFSET\s+\$2/);
      const params = mockQuery.mock.calls[1][1];
      expect(params).toEqual([500, 0]);
    });
  });

  // ── updateMetadata ────────────────────────────────────────────────────────
  describe('updateMetadata', () => {
    it('coalesce vers existant si champ absent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1', filename: 'old.png' }] });
      await studioAssetRepository.updateMetadata('a1', { filename: 'new.png' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/COALESCE\(\$1,\s+filename\)/);
      expect(sql).toMatch(/COALESCE\(\$2::text\[\],\s+tags\)/);
    });

    it('returns null si row introuvable', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const out = await studioAssetRepository.updateMetadata('nope', { tags: ['x'] });
      expect(out).toBeNull();
    });
  });

  // ── findUsageById ─────────────────────────────────────────────────────────
  describe('findUsageById', () => {
    it('retourne les bindings ordonnés par template_slug + asset_key', async () => {
      const usages = [
        { template_slug: 'a', asset_key: 'k', bound_at: new Date() },
      ];
      mockQuery.mockResolvedValueOnce({ rows: usages });
      const out = await studioAssetRepository.findUsageById('a1');
      expect(out).toEqual(usages);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/FROM\s+studio_template_asset_bindings/);
      expect(sql).toMatch(/ORDER\s+BY\s+template_slug,\s+asset_key/);
    });
  });

  // ── deleteById ────────────────────────────────────────────────────────────
  describe('deleteById', () => {
    it('returns true quand rowCount > 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const out = await studioAssetRepository.deleteById('a1');
      expect(out).toBe(true);
    });

    it('returns false quand row absente', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const out = await studioAssetRepository.deleteById('a1');
      expect(out).toBe(false);
    });
  });
});

describe('templateAssetBindingRepository (ADR-125)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTemplate', () => {
    it('retourne les bindings du slug', async () => {
      const rows = [
        { template_slug: 'faits_de_jeu', asset_key: 'metalTexture', asset_id: 'a1' },
      ];
      mockQuery.mockResolvedValueOnce({ rows });
      const out = await templateAssetBindingRepository.findByTemplate('faits_de_jeu');
      expect(out).toEqual(rows);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE template_slug = $1'),
        ['faits_de_jeu'],
      );
    });
  });

  describe('upsertBinding', () => {
    it('utilise ON CONFLICT (template_slug, asset_key) DO UPDATE', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            template_slug: 'faits_de_jeu',
            asset_key: 'metalTexture',
            asset_id: 'a1',
            bound_by: 'u1',
            bound_at: new Date(),
          },
        ],
      });
      await templateAssetBindingRepository.upsertBinding({
        template_slug: 'faits_de_jeu',
        asset_key: 'metalTexture',
        asset_id: 'a1',
        bound_by: 'u1',
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(
        /ON\s+CONFLICT\s*\(\s*template_slug,\s*asset_key\s*\)\s+DO\s+UPDATE/i,
      );
      expect(sql).toMatch(/asset_id\s*=\s*EXCLUDED\.asset_id/);
      expect(sql).toMatch(/bound_at\s*=\s*NOW\(\)/);
    });

    it('passe bound_by à null si absent', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ template_slug: 's', asset_key: 'k', asset_id: 'a' }],
      });
      await templateAssetBindingRepository.upsertBinding({
        template_slug: 's',
        asset_key: 'k',
        asset_id: 'a',
      });
      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual(['s', 'k', 'a', null]);
    });
  });

  describe('deleteBinding', () => {
    it('returns true quand le binding existait', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const out = await templateAssetBindingRepository.deleteBinding('s', 'k');
      expect(out).toBe(true);
    });

    it('returns false quand absent', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const out = await templateAssetBindingRepository.deleteBinding('s', 'k');
      expect(out).toBe(false);
    });
  });
});
