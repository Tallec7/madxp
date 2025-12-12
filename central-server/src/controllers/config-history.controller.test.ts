import { Response } from 'express';
import {
  getConfigHistory,
  getConfigVersion,
  saveConfigVersion,
  compareConfigVersions,
  previewConfigDiff,
} from './config-history.controller';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import socketService from '../services/socket.service';

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Helper to create authenticated request
const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthRequest);

const triggerPendingConfigSyncSpy = jest
  .spyOn(socketService, 'triggerPendingConfigSync')
  .mockResolvedValue(undefined);

describe('Config History Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfigHistory', () => {
    it('should return configuration history for a site', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { limit: '10', offset: '0' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'site-123', site_name: 'Test Site' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'version-1',
              site_id: 'site-123',
              configuration: { key: 'value' },
              deployed_at: new Date(),
              deployed_by_email: 'admin@example.com',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      await getConfigHistory(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-123',
          total: 5,
          history: expect.any(Array),
        })
      );
    });

    it('should use default limit and offset', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'site-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getConfigHistory(req, res);

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        ['site-123', 20, 0]
      );
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getConfigHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getConfigHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Erreur lors de la récupération de l'historique",
      });
    });
  });

  describe('getConfigVersion', () => {
    it('should return a specific config version', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123', versionId: 'version-456' },
      });
      const res = createMockResponse();

      const mockVersion = {
        id: 'version-456',
        site_id: 'site-123',
        configuration: { setting: 'value' },
        deployed_at: new Date(),
      };

      (query as jest.Mock).mockResolvedValueOnce({ rows: [mockVersion] });

      await getConfigVersion(req, res);

      expect(res.json).toHaveBeenCalledWith(mockVersion);
    });

    it('should return 404 if version not found', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123', versionId: 'nonexistent' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Version de configuration non trouvée',
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123', versionId: 'version-456' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la récupération de la version',
      });
    });
  });

  describe('saveConfigVersion', () => {
    it('should save a new config version', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {
          configuration: { newSetting: 'newValue' },
          comment: 'Initial deployment',
        },
      });
      const res = createMockResponse();

    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'site-123', site_name: 'Test Site' }] })
      .mockResolvedValueOnce({ rows: [] }) // No previous version
      .mockResolvedValueOnce({
        rows: [
          {
            id: expect.any(String),
            site_id: 'site-123',
            configuration: { newSetting: 'newValue' },
            deployed_at: new Date(),
          },
        ],
      });
      (query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // pending flag update

    await saveConfigVersion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        changes_summary: expect.arrayContaining([
          expect.objectContaining({
            field: 'newSetting',
            type: 'added',
          }),
        ]),
      })
    );
    expect(triggerPendingConfigSyncSpy).toHaveBeenCalledWith('site-123');
  });

    it('should compute diff with previous version', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {
          configuration: { setting: 'changed', newField: 'added' },
        },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'site-123', site_name: 'Test Site' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'prev-version', configuration: { setting: 'original', oldField: 'removed' } }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'new-version', site_id: 'site-123' }],
        });
      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await saveConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          changes_summary: expect.arrayContaining([
            expect.objectContaining({ field: 'setting', type: 'changed' }),
            expect.objectContaining({ field: 'oldField', type: 'removed' }),
            expect.objectContaining({ field: 'newField', type: 'added' }),
          ]),
        })
      );
      expect(triggerPendingConfigSyncSpy).toHaveBeenCalledWith('site-123');
    });

    it('should return 400 if configuration is missing', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {},
      });
      const res = createMockResponse();

      await saveConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Configuration requise' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { configuration: { test: true } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await saveConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { configuration: { test: true } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await saveConfigVersion(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la sauvegarde de la version',
      });
    });
  });

  describe('compareConfigVersions', () => {
    it('should compare two config versions', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { version1: 'v1', version2: 'v2' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { id: 'v1', configuration: { a: 1, b: 2 }, deployed_at: new Date('2025-01-01') },
          { id: 'v2', configuration: { a: 1, b: 3, c: 4 }, deployed_at: new Date('2025-01-02') },
        ],
      });

      await compareConfigVersions(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          version1: expect.objectContaining({ id: 'v1' }),
          version2: expect.objectContaining({ id: 'v2' }),
          diff: expect.arrayContaining([
            expect.objectContaining({ field: 'b', type: 'changed' }),
            expect.objectContaining({ field: 'c', type: 'added' }),
          ]),
        })
      );
    });

    it('should return 400 if versions not provided', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: {},
      });
      const res = createMockResponse();

      await compareConfigVersions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Deux versions à comparer sont requises (version1, version2)',
      });
    });

    it('should return 400 if only one version provided', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { version1: 'v1' },
      });
      const res = createMockResponse();

      await compareConfigVersions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if versions not found', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { version1: 'v1', version2: 'v2' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'v1' }] });

      await compareConfigVersions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Une ou plusieurs versions non trouvées',
      });
    });

    it('should return 404 if query returns wrong versions', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { version1: 'v1', version2: 'v2' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { id: 'v1', configuration: {} },
          { id: 'v3', configuration: {} }, // Wrong version returned
        ],
      });

      await compareConfigVersions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { version1: 'v1', version2: 'v2' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await compareConfigVersions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la comparaison des versions',
      });
    });
  });

  describe('previewConfigDiff', () => {
    it('should preview diff with current config', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { newConfiguration: { setting: 'new', added: true } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ configuration: { setting: 'old', removed: true } }],
      });

      await previewConfigDiff(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasChanges: true,
          changesCount: 3,
          diff: expect.arrayContaining([
            expect.objectContaining({ field: 'setting', type: 'changed' }),
            expect.objectContaining({ field: 'removed', type: 'removed' }),
            expect.objectContaining({ field: 'added', type: 'added' }),
          ]),
        })
      );
    });

    it('should handle no previous config', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { newConfiguration: { key: 'value' } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await previewConfigDiff(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasChanges: true,
          currentConfiguration: null,
          diff: expect.arrayContaining([
            expect.objectContaining({ field: 'key', type: 'added' }),
          ]),
        })
      );
    });

    it('should return no changes when configs are identical', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { newConfiguration: { same: 'value' } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ configuration: { same: 'value' } }],
      });

      await previewConfigDiff(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasChanges: false,
          changesCount: 0,
          diff: [],
        })
      );
    });

    it('should return 400 if newConfiguration missing', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {},
      });
      const res = createMockResponse();

      await previewConfigDiff(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Nouvelle configuration requise',
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { newConfiguration: { test: true } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await previewConfigDiff(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la génération du diff',
      });
    });

    it('should handle nested object changes', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {
          newConfiguration: {
            nested: { inner: 'changed', added: true },
          },
        },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            configuration: {
              nested: { inner: 'original', removed: true },
            },
          },
        ],
      });

      await previewConfigDiff(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasChanges: true,
          diff: expect.arrayContaining([
            expect.objectContaining({ path: 'nested.inner', type: 'changed' }),
            expect.objectContaining({ path: 'nested.removed', type: 'removed' }),
            expect.objectContaining({ path: 'nested.added', type: 'added' }),
          ]),
        })
      );
    });
  });
});
