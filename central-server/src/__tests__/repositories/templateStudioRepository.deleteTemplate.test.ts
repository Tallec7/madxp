/**
 * Quick task 260507-gxd — Task 1
 * Tests unitaires pour templateStudioRepository.deleteTemplate.
 * Couvre :
 *   - idempotent quand le template n'existe pas
 *   - cascade BEGIN/COMMIT + détection orphelins (asset url unique)
 *   - asset partagé n'apparaît pas dans orphanAssetUrls
 *   - ROLLBACK si une DELETE intermédiaire throw
 *
 * Le schéma réel ne contient pas de table `template_assets`. Les assets sont
 * des URLs (`video_url` / `background_video_url`) sur `template_layers` et
 * `template_variants`. Le repo collecte ces URLs avant DELETE et calcule la
 * liste des URLs qui ne sont plus référencées par aucun autre template.
 */

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { deleteTemplate } from '../../repositories/template-studio.repository';

describe('templateStudioRepository.deleteTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it('returns { deleted: false } when template does not exist (idempotent path)', async () => {
    // BEGIN → SELECT (0 rows) → ROLLBACK
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT id FROM neopro_templates
      .mockResolvedValueOnce({}); // ROLLBACK

    const result = await deleteTemplate('00000000-0000-0000-0000-000000000000');
    expect(result.deleted).toBe(false);
    expect(result.orphanAssetUrls).toEqual([]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns { deleted: true, orphanAssetUrls: [url1] } when template owns 1 unique asset', async () => {
    const tplId = '11111111-1111-1111-1111-111111111111';
    const url1 = 'https://kalonpartners.bzh/neopro-asset/u1.webm';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: tplId }] }) // SELECT id template
      // collect asset URLs from layers
      .mockResolvedValueOnce({ rows: [{ video_url: url1 }] })
      // collect asset URLs from variants
      .mockResolvedValueOnce({ rows: [] })
      // collect asset URLs from image slots (file_url column may not exist; use empty)
      .mockResolvedValueOnce({ rows: [] })
      // DELETE template_text_fields
      .mockResolvedValueOnce({ rowCount: 2 })
      // DELETE template_image_slots
      .mockResolvedValueOnce({ rowCount: 1 })
      // DELETE template_layers
      .mockResolvedValueOnce({ rowCount: 1 })
      // DELETE template_variants
      .mockResolvedValueOnce({ rowCount: 1 })
      // DELETE template_options
      .mockResolvedValueOnce({ rowCount: 0 })
      // DELETE template_packshot_refs
      .mockResolvedValueOnce({ rowCount: 0 })
      // DELETE neopro_template_versions
      .mockResolvedValueOnce({ rowCount: 3 })
      // DELETE neopro_templates
      .mockResolvedValueOnce({ rowCount: 1 })
      // SELECT remaining references for collected URLs (after delete)
      .mockResolvedValueOnce({ rows: [] }) // none still referenced → orphan
      .mockResolvedValueOnce({}); // COMMIT

    const result = await deleteTemplate(tplId);
    expect(result.deleted).toBe(true);
    expect(result.orphanAssetUrls).toEqual([url1]);
    expect(result.cascadeRowCounts.layers).toBe(1);
    expect(result.cascadeRowCounts.textFields).toBe(2);
    expect(result.cascadeRowCounts.versions).toBe(3);
  });

  it('returns orphanAssetUrls = [] when asset is shared with another template', async () => {
    const tplId = '22222222-2222-2222-2222-222222222222';
    const sharedUrl = 'https://kalonpartners.bzh/neopro-asset/shared.webm';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: tplId }] }) // SELECT id
      .mockResolvedValueOnce({ rows: [{ video_url: sharedUrl }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 })
      // remaining-references query returns the URL → it's still in use
      .mockResolvedValueOnce({ rows: [{ url: sharedUrl }] })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await deleteTemplate(tplId);
    expect(result.deleted).toBe(true);
    expect(result.orphanAssetUrls).toEqual([]);
  });

  it('rolls back when an intermediate DELETE throws', async () => {
    const tplId = '33333333-3333-3333-3333-333333333333';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: tplId }] }) // SELECT id
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('FK violation on template_layers'))
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(deleteTemplate(tplId)).rejects.toThrow(/FK violation/);
    // ROLLBACK was called before re-throw
    const calls = mockClient.query.mock.calls.map((c: unknown[]) =>
      typeof c[0] === 'string' ? c[0] : '',
    );
    expect(calls.some((q) => /ROLLBACK/.test(q))).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
