import { Response } from 'express';
import {
  getUpdates,
  getUpdate,
  createUpdate,
  updateUpdate,
  deleteUpdate,
  getUpdateDeployments,
  getUpdateDeployment,
  createUpdateDeployment,
  updateUpdateDeployment,
  deleteUpdateDeployment,
} from './updates.controller';
import pool from '../config/database';
import { AuthRequest } from '../types';

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

describe('Updates Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Software Updates', () => {
    describe('getUpdates', () => {
      it('should return all software updates', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        const mockUpdates = [
          { id: '1', version: '1.0.0', release_notes: 'Initial release' },
          { id: '2', version: '1.1.0', release_notes: 'Bug fixes' },
        ];

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockUpdates });

        await getUpdates(req, res);

        expect(res.json).toHaveBeenCalledWith(mockUpdates);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getUpdates(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la récupération des mises à jour' });
      });
    });

    describe('getUpdate', () => {
      it('should return update by id', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        const mockUpdate = { id: 'update-123', version: '1.0.0' };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUpdate] });

        await getUpdate(req, res);

        expect(res.json).toHaveBeenCalledWith(mockUpdate);
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await getUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Mise à jour non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('createUpdate', () => {
      it('should create a new software update', async () => {
        const req = createAuthRequest({
          body: {
            version: '2.0.0',
            changelog: 'Major release',
            package_url: 'https://example.com/update.zip',
            package_size: 1024000,
            checksum: 'abc123',
          },
        });
        const res = createMockResponse();

        const mockUpdate = {
          id: 'new-update-id',
          version: '2.0.0',
          changelog: 'Major release',
        };

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUpdate] });

        await createUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockUpdate);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          body: { version: '1.0.0' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await createUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('updateUpdate', () => {
      it('should update software update fields', async () => {
        const req = createAuthRequest({
          params: { id: 'update-123' },
          body: { version: '1.0.1', changelog: 'Updated changelog' },
        });
        const res = createMockResponse();

        const updatedUpdate = { id: 'update-123', version: '1.0.1' };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [updatedUpdate] });

        await updateUpdate(req, res);

        expect(res.json).toHaveBeenCalledWith(updatedUpdate);
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { version: '1.0.1' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await updateUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Mise à jour non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          params: { id: 'update-123' },
          body: { version: '1.0.1' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await updateUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteUpdate', () => {
      it('should delete software update', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'update-123' }] });

        await deleteUpdate(req, res);

        expect(res.json).toHaveBeenCalledWith({ message: 'Mise à jour supprimée avec succès' });
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await deleteUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Mise à jour non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await deleteUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });
  });

  describe('Update Deployments', () => {
    describe('getUpdateDeployments', () => {
      it('should return all update deployments', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        const mockDeployments = [
          { id: '1', update_id: 'u1', target_name: 'Site A', status: 'completed' },
          { id: '2', update_id: 'u2', target_name: 'Group B', status: 'pending' },
        ];

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockDeployments });

        await getUpdateDeployments(req, res);

        expect(res.json).toHaveBeenCalledWith(mockDeployments);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getUpdateDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('getUpdateDeployment', () => {
      it('should return deployment by id', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        const mockDeployment = { id: 'deploy-123', status: 'in_progress', progress: 50 };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockDeployment] });

        await getUpdateDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await getUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement de mise à jour non trouvé' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('createUpdateDeployment', () => {
      it('should create update deployment', async () => {
        const req = createAuthRequest({
          body: { update_id: 'update-123', target_type: 'site', target_id: 'site-456' },
        });
        const res = createMockResponse();

        const mockDeployment = {
          id: 'deploy-123',
          update_id: 'update-123',
          target_type: 'site',
          target_id: 'site-456',
          status: 'pending',
        };

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockDeployment] });

        await createUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should use default target_type if not provided', async () => {
        const req = createAuthRequest({
          body: { update_id: 'u1', target_id: 's1' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: '1' }] });

        await createUpdateDeployment(req, res);

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          ['u1', 'site', 's1', 'user-123']
        );
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          body: { update_id: 'u1', target_id: 's1' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await createUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('updateUpdateDeployment', () => {
      it('should update deployment status', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { status: 'completed', progress: 100 },
        });
        const res = createMockResponse();

        const updated = { id: 'deploy-123', status: 'completed', progress: 100 };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [updated] });

        await updateUpdateDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(updated);
      });

      it('should update backup_path', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { backup_path: '/backups/site-123.tar.gz' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({
          rows: [{ id: 'deploy-123', backup_path: '/backups/site-123.tar.gz' }],
        });

        await updateUpdateDeployment(req, res);

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          [undefined, undefined, undefined, '/backups/site-123.tar.gz', 'deploy-123']
        );
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await updateUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await updateUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteUpdateDeployment', () => {
      it('should delete update deployment', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'deploy-123' }] });

        await deleteUpdateDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith({ message: 'Déploiement de mise à jour supprimé avec succès' });
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await deleteUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement de mise à jour non trouvé' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await deleteUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });
  });
});
