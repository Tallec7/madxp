import { Response } from 'express';
import { AuthRequest } from '../types';

// Mock repositories
jest.mock('../repositories', () => ({
  softwareUpdateRepository: {
    findAllUpdates: jest.fn(),
    findUpdateById: jest.fn(),
    createUpdate: jest.fn(),
    updateUpdate: jest.fn(),
    deleteUpdate: jest.fn(),
    findPackageDetails: jest.fn(),
    findAllDeployments: jest.fn(),
    findDeploymentById: jest.fn(),
    createDeployment: jest.fn(),
    updateDeployment: jest.fn(),
    deleteDeployment: jest.fn(),
  },
}));

// Mock storage service
jest.mock('../services/storage.service', () => ({
  uploadUpdate: jest.fn(),
}));

// Mock upload verification service
jest.mock('../services/upload-verification.service', () => ({
  uploadVerificationService: {
    isUpdateReadyForDeployment: jest.fn().mockResolvedValue({ ready: true, status: 'ready' }),
    getDeploymentBlockedMessage: jest.fn(),
  },
  UploadStatus: {},
}));

// Mock update deployment service
jest.mock('../services/update-deployment.service', () => ({
  updateDeploymentService: {
    startDeployment: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware/upload (cleanupTempFile)
jest.mock('../middleware/upload', () => ({
  cleanupTempFile: jest.fn(),
}));

// Mock fs.readFileSync for disk-storage file reads
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('file-content')),
}));

// Mock logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

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
import { softwareUpdateRepository } from '../repositories';
import { uploadUpdate } from '../services/storage.service';
import { uploadVerificationService } from '../services/upload-verification.service';

const mockSoftwareUpdateRepo = softwareUpdateRepository as jest.Mocked<typeof softwareUpdateRepository>;

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

        mockSoftwareUpdateRepo.findAllUpdates.mockResolvedValueOnce(mockUpdates as never);

        await getUpdates(req, res);

        expect(mockSoftwareUpdateRepo.findAllUpdates).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(mockUpdates);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findAllUpdates.mockRejectedValueOnce(new Error('DB Error'));

        await getUpdates(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la récupération des mises à jour' });
      });

      it('should return empty array when software_updates table is missing', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findAllUpdates.mockRejectedValueOnce({
          code: '42P01',
          message: 'relation "software_updates" does not exist',
        });

        await getUpdates(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith([]);
      });
    });

    describe('getUpdate', () => {
      it('should return update by id', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        const mockUpdate = { id: 'update-123', version: '1.0.0' };
        mockSoftwareUpdateRepo.findUpdateById.mockResolvedValueOnce(mockUpdate as never);

        await getUpdate(req, res);

        expect(mockSoftwareUpdateRepo.findUpdateById).toHaveBeenCalledWith('update-123');
        expect(res.json).toHaveBeenCalledWith(mockUpdate);
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findUpdateById.mockResolvedValueOnce(null);

        await getUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Mise à jour non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findUpdateById.mockRejectedValueOnce(new Error('DB Error'));

        await getUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('createUpdate', () => {
      it('should create a new software update', async () => {
        const req = createAuthRequest({
          body: {
            version: '2.0.0',
            description: 'Major release',
            release_notes: 'Notes détaillées',
            is_critical: 'true',
          },
          file: {
            originalname: 'update.tar.gz',
            mimetype: 'application/gzip',
            size: 1024,
            path: '/tmp/neopro-uploads/test-file.tar.gz',
          } as unknown as Express.Multer.File,
        });
        const res = createMockResponse();

        const mockUpdate = {
          id: 'new-update-id',
          version: '2.0.0',
          description: 'Major release',
        };

        (uploadUpdate as jest.Mock).mockResolvedValueOnce({
          path: 'uploads/update.tar.gz',
          url: 'https://storage/update.tar.gz',
          verified: true,
          actualSize: 1024,
        });

        mockSoftwareUpdateRepo.createUpdate.mockResolvedValueOnce(mockUpdate as never);

        await createUpdate(req, res);

        expect(mockSoftwareUpdateRepo.createUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            version: '2.0.0',
            is_critical: true,
            package_url: 'https://storage/update.tar.gz',
            package_size: 1024,
            upload_status: 'ready',
          })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockUpdate);
      });

      it('should return 400 when version or file is missing', async () => {
        const req = createAuthRequest({
          body: { version: '1.0.0' },
          // no file
        });
        const res = createMockResponse();

        await createUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Version et package requis' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          body: { version: '1.0.0', description: 'Bug fixes' },
          file: {
            originalname: 'update.tar.gz',
            mimetype: 'application/gzip',
            size: 2048,
            path: '/tmp/neopro-uploads/test-file.tar.gz',
          } as unknown as Express.Multer.File,
        });
        const res = createMockResponse();

        (uploadUpdate as jest.Mock).mockResolvedValueOnce({
          path: 'uploads/update.tar.gz',
          url: 'https://storage/update.tar.gz',
          verified: true,
          actualSize: 2048,
        });
        mockSoftwareUpdateRepo.createUpdate.mockRejectedValueOnce(new Error('DB Error'));

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
        mockSoftwareUpdateRepo.updateUpdate.mockResolvedValueOnce(updatedUpdate as never);

        await updateUpdate(req, res);

        expect(mockSoftwareUpdateRepo.updateUpdate).toHaveBeenCalledWith(
          'update-123',
          expect.objectContaining({ version: '1.0.1', changelog: 'Updated changelog' })
        );
        expect(res.json).toHaveBeenCalledWith(updatedUpdate);
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { version: '1.0.1' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.updateUpdate.mockResolvedValueOnce(null);

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

        mockSoftwareUpdateRepo.updateUpdate.mockRejectedValueOnce(new Error('DB Error'));

        await updateUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteUpdate', () => {
      it('should delete software update', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteUpdate.mockResolvedValueOnce(true);

        await deleteUpdate(req, res);

        expect(mockSoftwareUpdateRepo.deleteUpdate).toHaveBeenCalledWith('update-123');
        expect(res.json).toHaveBeenCalledWith({ message: 'Mise à jour supprimée avec succès' });
      });

      it('should return 404 if update not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteUpdate.mockResolvedValueOnce(false);

        await deleteUpdate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Mise à jour non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'update-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteUpdate.mockRejectedValueOnce(new Error('DB Error'));

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

        mockSoftwareUpdateRepo.findAllDeployments.mockResolvedValueOnce(mockDeployments as never);

        await getUpdateDeployments(req, res);

        expect(mockSoftwareUpdateRepo.findAllDeployments).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(mockDeployments);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findAllDeployments.mockRejectedValueOnce(new Error('DB Error'));

        await getUpdateDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('getUpdateDeployment', () => {
      it('should return deployment by id', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        const mockDeployment = { id: 'deploy-123', status: 'in_progress', progress: 50 };
        mockSoftwareUpdateRepo.findDeploymentById.mockResolvedValueOnce(mockDeployment as never);

        await getUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.findDeploymentById).toHaveBeenCalledWith('deploy-123');
        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findDeploymentById.mockResolvedValueOnce(null);

        await getUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement de mise à jour non trouvé' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.findDeploymentById.mockRejectedValueOnce(new Error('DB Error'));

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

        mockSoftwareUpdateRepo.createDeployment.mockResolvedValueOnce(mockDeployment as never);

        await createUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.createDeployment).toHaveBeenCalledWith({
          update_id: 'update-123',
          target_type: 'site',
          target_id: 'site-456',
          deployed_by: 'user-123',
          schedule_reboot: false,
          auto_rollback: true,
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should use default target_type if not provided', async () => {
        const req = createAuthRequest({
          body: { update_id: 'u1', target_id: 's1' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.createDeployment.mockResolvedValueOnce({ id: '1' } as never);

        await createUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.createDeployment).toHaveBeenCalledWith({
          update_id: 'u1',
          target_type: 'site',
          target_id: 's1',
          deployed_by: 'user-123',
          schedule_reboot: false,
          auto_rollback: true,
        });
      });

      it('should return 409 if update is not ready for deployment', async () => {
        const req = createAuthRequest({
          body: { update_id: 'u1', target_id: 's1' },
        });
        const res = createMockResponse();

        (uploadVerificationService.isUpdateReadyForDeployment as jest.Mock).mockResolvedValueOnce({
          ready: false,
          status: 'uploading',
          error: 'Upload in progress',
        });
        (uploadVerificationService.getDeploymentBlockedMessage as jest.Mock).mockReturnValueOnce(
          'Update is still uploading'
        );

        await createUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Update not ready for deployment',
            upload_status: 'uploading',
          })
        );
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          body: { update_id: 'u1', target_id: 's1' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.createDeployment.mockRejectedValueOnce(new Error('DB Error'));

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
        mockSoftwareUpdateRepo.updateDeployment.mockResolvedValueOnce(updated as never);

        await updateUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.updateDeployment).toHaveBeenCalledWith('deploy-123', {
          status: 'completed',
          progress: 100,
          error_message: undefined,
          backup_path: undefined,
        });
        expect(res.json).toHaveBeenCalledWith(updated);
      });

      it('should update backup_path', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { backup_path: '/backups/site-123.tar.gz' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.updateDeployment.mockResolvedValueOnce({
          id: 'deploy-123',
          backup_path: '/backups/site-123.tar.gz',
        } as never);

        await updateUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.updateDeployment).toHaveBeenCalledWith('deploy-123', {
          status: undefined,
          progress: undefined,
          error_message: undefined,
          backup_path: '/backups/site-123.tar.gz',
        });
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.updateDeployment.mockResolvedValueOnce(null);

        await updateUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.updateDeployment.mockRejectedValueOnce(new Error('DB Error'));

        await updateUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteUpdateDeployment', () => {
      it('should delete update deployment', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteDeployment.mockResolvedValueOnce(true);

        await deleteUpdateDeployment(req, res);

        expect(mockSoftwareUpdateRepo.deleteDeployment).toHaveBeenCalledWith('deploy-123');
        expect(res.json).toHaveBeenCalledWith({ message: 'Déploiement de mise à jour supprimé avec succès' });
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteDeployment.mockResolvedValueOnce(false);

        await deleteUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement de mise à jour non trouvé' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        mockSoftwareUpdateRepo.deleteDeployment.mockRejectedValueOnce(new Error('DB Error'));

        await deleteUpdateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });
  });
});
