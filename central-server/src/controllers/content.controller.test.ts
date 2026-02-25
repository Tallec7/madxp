import { Response } from 'express';

// Mock repositories
jest.mock('../repositories', () => ({
  videoRepository: {
    filenameExists: jest.fn(),
    findAllPaginated: jest.fn(),
    findVideoById: jest.fn(),
    create: jest.fn(),
    createBulk: jest.fn(),
    update: jest.fn(),
    findStoragePath: jest.fn(),
    deleteAndReturn: jest.fn(),
    findForSitePaginated: jest.fn(),
  },
  deploymentRepository: {
    findDeploymentsForVideo: jest.fn(),
    findAllWithDetails: jest.fn(),
    findWithDetails: jest.fn(),
    createFull: jest.fn(),
    updateFields: jest.fn(),
    deleteAndReturn: jest.fn(),
  },
  siteRepository: {
    exists: jest.fn(),
  },
}));

// Mock storage service
jest.mock('../services/storage.service', () => ({
  uploadVideo: jest.fn(),
  uploadVideoFromDisk: jest.fn(),
  deleteVideo: jest.fn(),
  getVideoUrl: jest.fn().mockReturnValue('https://cdn.example.com/test.mp4'),
}));

// Mock deployment service
jest.mock('../services/deployment.service');

// Mock upload verification service
jest.mock('../services/upload-verification.service', () => ({
  uploadVerificationService: {
    isVideoReadyForDeployment: jest.fn().mockResolvedValue({ ready: true, status: 'ready' }),
    getDeploymentBlockedMessage: jest.fn(),
  },
  UploadStatus: {},
}));

// Mock logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

import {
  getVideos,
  getVideo,
  getVideoDeployments,
  createVideo,
  updateVideo,
  deleteVideo as deleteVideoController,
  getDeployments,
  getDeployment,
  createDeployment,
  updateDeployment,
  deleteDeployment,
} from './content.controller';
import { videoRepository, deploymentRepository, siteRepository } from '../repositories';
import { uploadVideo, deleteVideo as deleteStorageVideo } from '../services/storage.service';
import deploymentService from '../services/deployment.service';
import { AuthRequest } from '../types';

const mockVideoRepo = videoRepository as jest.Mocked<typeof videoRepository>;
const mockDeploymentRepo = deploymentRepository as jest.Mocked<typeof deploymentRepository>;
const mockSiteRepo = siteRepository as jest.Mocked<typeof siteRepository>;

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
    file: undefined,
    ...overrides,
  } as AuthRequest);

describe('Content Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Videos', () => {
    describe('getVideos', () => {
      it('should return all videos with titles', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        const mockVideos = [
          { id: '1', filename: 'video1.mp4', original_name: 'My Video', metadata: { title: 'Custom Title' } },
          { id: '2', filename: 'video2.mp4', original_name: 'Another Video', metadata: null },
        ];

        mockVideoRepo.findAllPaginated.mockResolvedValueOnce({ rows: mockVideos as never[], total: 2 });

        await getVideos(req, res);

        expect(res.json).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({ id: '1', title: 'Custom Title' }),
            expect.objectContaining({ id: '2', title: 'Another Video' }),
          ]),
          pagination: expect.objectContaining({
            total: 2,
            page: 1,
            totalPages: 1,
          }),
        });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        mockVideoRepo.findAllPaginated.mockRejectedValueOnce(new Error('DB Error'));

        await getVideos(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la récupération des vidéos' });
      });
    });

    describe('getVideo', () => {
      it('should return video by id', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        const mockVideo = {
          id: 'video-123',
          filename: 'video.mp4',
          original_name: 'My Video',
          metadata: { title: 'Video Title' },
        };

        mockVideoRepo.findVideoById.mockResolvedValueOnce(mockVideo as never);

        await getVideo(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          id: 'video-123',
          title: 'Video Title',
        }));
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockVideoRepo.findVideoById.mockResolvedValueOnce(null);

        await getVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        mockVideoRepo.findVideoById.mockRejectedValueOnce(new Error('DB Error'));

        await getVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('createVideo', () => {
      it('should create video with file upload', async () => {
        const mockFile = {
          originalname: 'test-video.mp4',
          buffer: Buffer.from('test'),
          size: 1024,
          mimetype: 'video/mp4',
        };

        const req = createAuthRequest({
          file: mockFile as Express.Multer.File,
          body: { title: 'My Video', category: 'sponsors' },
        });
        const res = createMockResponse();

        // Mock storage upload
        (uploadVideo as jest.Mock).mockResolvedValueOnce({
          path: 'test-video.mp4',
          url: 'https://cdn.example.com/test-video.mp4',
          verified: true,
          actualSize: 1024,
        });

        // Mock filename check + create
        mockVideoRepo.filenameExists.mockResolvedValueOnce(false);
        mockVideoRepo.create.mockResolvedValueOnce({
          id: 'video-123',
          filename: 'test-video.mp4',
          original_name: 'test-video.mp4',
          category: 'sponsors',
        } as never);

        await createVideo(req, res);

        expect(uploadVideo).toHaveBeenCalledWith(mockFile.buffer, expect.any(String), 'video/mp4');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          id: 'video-123',
          title: 'My Video',
        }));
      });

      it('should return 400 if no file provided', async () => {
        const req = createAuthRequest({ body: { title: 'No File' } });
        const res = createMockResponse();

        await createVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Aucun fichier vidéo fourni' });
      });

      it('should return 500 if upload fails', async () => {
        const mockFile = {
          originalname: 'test.mp4',
          buffer: Buffer.from('test'),
          size: 1024,
          mimetype: 'video/mp4',
        };

        const req = createAuthRequest({ file: mockFile as Express.Multer.File });
        const res = createMockResponse();

        mockVideoRepo.filenameExists.mockResolvedValueOnce(false);
        (uploadVideo as jest.Mock).mockRejectedValueOnce(new Error('FTP non configuré'));

        await createVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('should return 500 on database error', async () => {
        const mockFile = {
          originalname: 'test.mp4',
          buffer: Buffer.from('test'),
          size: 1024,
          mimetype: 'video/mp4',
        };

        const req = createAuthRequest({ file: mockFile as Express.Multer.File });
        const res = createMockResponse();

        mockVideoRepo.filenameExists.mockResolvedValueOnce(false);
        mockVideoRepo.create.mockRejectedValueOnce(new Error('DB Error'));

        (uploadVideo as jest.Mock).mockResolvedValueOnce({
          path: 'test.mp4',
          url: 'http://test',
          verified: true,
          actualSize: 1024,
        });

        await createVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('updateVideo', () => {
      it('should update video fields', async () => {
        const req = createAuthRequest({
          params: { id: 'video-123' },
          body: { category: 'jingles', subcategory: 'goals' },
        });
        const res = createMockResponse();

        const updatedVideo = { id: 'video-123', category: 'jingles', subcategory: 'goals' };
        mockVideoRepo.update.mockResolvedValueOnce(updatedVideo as never);

        await updateVideo(req, res);

        expect(res.json).toHaveBeenCalledWith(updatedVideo);
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { category: 'test' },
        });
        const res = createMockResponse();

        mockVideoRepo.update.mockResolvedValueOnce(null);

        await updateVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          params: { id: 'video-123' },
          body: { category: 'test' },
        });
        const res = createMockResponse();

        mockVideoRepo.update.mockRejectedValueOnce(new Error('DB Error'));

        await updateVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteVideo', () => {
      it('should delete video and storage file', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        mockVideoRepo.findStoragePath.mockResolvedValueOnce('videos/test.mp4');
        mockVideoRepo.deleteAndReturn.mockResolvedValueOnce(true);
        (deleteStorageVideo as jest.Mock).mockResolvedValueOnce(undefined);

        await deleteVideoController(req, res);

        expect(deleteStorageVideo).toHaveBeenCalledWith('videos/test.mp4');
        expect(res.json).toHaveBeenCalledWith({ message: 'Vidéo supprimée avec succès' });
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockVideoRepo.findStoragePath.mockResolvedValueOnce(null);
        mockVideoRepo.findVideoById.mockResolvedValueOnce(null);

        await deleteVideoController(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should delete without storage if no path', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        // findStoragePath returns null but video exists (empty storage_path)
        mockVideoRepo.findStoragePath.mockResolvedValueOnce(null);
        mockVideoRepo.findVideoById.mockResolvedValueOnce({ id: 'video-123' } as never);
        mockVideoRepo.deleteAndReturn.mockResolvedValueOnce(true);

        await deleteVideoController(req, res);

        expect(deleteStorageVideo).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: 'Vidéo supprimée avec succès' });
      });
    });

    describe('getVideoDeployments', () => {
      it('should return deployment history for a video', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        const mockDeployments = [
          { id: 'd1', video_id: 'video-123', status: 'completed', target_name: 'Site A', target_type: 'site', has_secondary_variant: true },
          { id: 'd2', video_id: 'video-123', status: 'failed', target_name: 'Site B', target_type: 'site', has_secondary_variant: false },
          { id: 'd3', video_id: 'video-123', status: 'pending', target_name: 'Group C', target_type: 'group', has_secondary_variant: false },
        ];

        mockVideoRepo.findVideoById.mockResolvedValueOnce({ id: 'video-123' } as never);
        mockDeploymentRepo.findDeploymentsForVideo.mockResolvedValueOnce(mockDeployments as never[]);

        await getVideoDeployments(req, res);

        expect(res.json).toHaveBeenCalledWith({
          video_id: 'video-123',
          stats: {
            total: 3,
            completed: 1,
            failed: 1,
            pending: 1,
            in_progress: 0,
          },
          deployments: mockDeployments,
        });
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockVideoRepo.findVideoById.mockResolvedValueOnce(null);

        await getVideoDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should return empty deployments if video has no deployments', async () => {
        const req = createAuthRequest({ params: { id: 'video-new' } });
        const res = createMockResponse();

        mockVideoRepo.findVideoById.mockResolvedValueOnce({ id: 'video-new' } as never);
        mockDeploymentRepo.findDeploymentsForVideo.mockResolvedValueOnce([]);

        await getVideoDeployments(req, res);

        expect(res.json).toHaveBeenCalledWith({
          video_id: 'video-new',
          stats: {
            total: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            in_progress: 0,
          },
          deployments: [],
        });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        mockVideoRepo.findVideoById.mockRejectedValueOnce(new Error('DB Error'));

        await getVideoDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: "Erreur lors de la récupération de l'historique des déploiements",
          details: "DB Error"
        });
      });
    });
  });

  describe('Deployments', () => {
    describe('getDeployments', () => {
      it('should return all deployments', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        const mockDeployments = [
          { id: '1', video_id: 'v1', target_type: 'site', target_name: 'Site A', metadata: { title: 'Video 1' }, has_secondary_variant: false },
          { id: '2', video_id: 'v2', target_type: 'group', target_name: 'Group B', original_name: 'video.mp4', metadata: null, has_secondary_variant: true },
        ];

        mockDeploymentRepo.findAllWithDetails.mockResolvedValueOnce(mockDeployments as never[]);

        await getDeployments(req, res);

        expect(res.json).toHaveBeenCalledWith([
          expect.objectContaining({ id: '1', video_title: 'Video 1' }),
          expect.objectContaining({ id: '2', video_title: 'video.mp4' }),
        ]);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        mockDeploymentRepo.findAllWithDetails.mockRejectedValueOnce(new Error('DB Error'));

        await getDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('getDeployment', () => {
      it('should return deployment by id', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        const mockDeployment = { id: 'deploy-123', status: 'completed' };
        mockDeploymentRepo.findWithDetails.mockResolvedValueOnce(mockDeployment as never);

        await getDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockDeploymentRepo.findWithDetails.mockResolvedValueOnce(null);

        await getDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement non trouvé' });
      });
    });

    describe('createDeployment', () => {
      it('should create deployment and start async process', async () => {
        const req = createAuthRequest({
          body: { video_id: 'video-123', target_type: 'site', target_id: 'site-456' },
        });
        const res = createMockResponse();

        const mockDeployment = {
          id: 'deploy-123',
          video_id: 'video-123',
          target_type: 'site',
          target_id: 'site-456',
          status: 'pending',
        };

        mockDeploymentRepo.createFull.mockResolvedValueOnce(mockDeployment as never);

        await createDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(mockDeployment);
        expect(deploymentService.startDeployment).toHaveBeenCalledWith('deploy-123');
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({
          body: { video_id: 'v1', target_type: 'site', target_id: 's1' },
        });
        const res = createMockResponse();

        mockDeploymentRepo.createFull.mockRejectedValueOnce(new Error('DB Error'));

        await createDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('updateDeployment', () => {
      it('should update deployment status', async () => {
        const req = createAuthRequest({
          params: { id: 'deploy-123' },
          body: { status: 'completed', progress: 100 },
        });
        const res = createMockResponse();

        const updated = { id: 'deploy-123', status: 'completed', progress: 100 };
        mockDeploymentRepo.updateFields.mockResolvedValueOnce(updated as never);

        await updateDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(updated);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        mockDeploymentRepo.updateFields.mockResolvedValueOnce(null);

        await updateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      });
    });

    describe('deleteDeployment', () => {
      it('should delete deployment', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        mockDeploymentRepo.deleteAndReturn.mockResolvedValueOnce(true);

        await deleteDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith({ message: 'Déploiement supprimé avec succès' });
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        mockDeploymentRepo.deleteAndReturn.mockResolvedValueOnce(false);

        await deleteDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement non trouvé' });
      });
    });
  });
});
