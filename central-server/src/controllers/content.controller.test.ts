import { Response } from 'express';

// Explicitly mock the database module for deterministic tests
jest.mock('../config/database', () => {
  const pool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return {
    __esModule: true,
    default: pool,
    pool,
  };
});

// Mock supabase
jest.mock('../config/supabase');

// Mock deployment service
jest.mock('../services/deployment.service');

import {
  getVideos,
  getVideo,
  getVideoDeployments,
  createVideo,
  updateVideo,
  deleteVideo,
  getDeployments,
  getDeployment,
  createDeployment,
  updateDeployment,
  deleteDeployment,
} from './content.controller';
import pool from '../config/database';
import { uploadFile, deleteFile } from '../config/supabase';
import deploymentService from '../services/deployment.service';
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

        // Mock both data query and count query
        (pool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockVideos })
          .mockResolvedValueOnce({ rows: [{ count: '2' }] });

        await getVideos(req, res);

        expect(res.json).toHaveBeenCalledWith({
          data: [
            { ...mockVideos[0], title: 'Custom Title' },
            { ...mockVideos[1], title: 'Another Video' },
          ],
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

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

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

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockVideo] });

        await getVideo(req, res);

        expect(res.json).toHaveBeenCalledWith({ ...mockVideo, title: 'Video Title' });
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await getVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

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

        (uploadFile as jest.Mock).mockResolvedValueOnce({
          path: 'videos/uuid.mp4',
          url: 'https://storage.example.com/videos/uuid.mp4',
        });

        (pool.query as jest.Mock).mockResolvedValueOnce({
          rows: [{
            id: 'video-123',
            name: 'uuid.mp4',
            original_name: 'test-video.mp4',
            category: 'sponsors',
            size: 1024,
          }],
        });

        await createVideo(req, res);

        expect(uploadFile).toHaveBeenCalledWith(mockFile.buffer, expect.any(String), 'video/mp4');
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

        (uploadFile as jest.Mock).mockResolvedValueOnce(null);

        await createVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Erreur lors de l'upload vers le stockage" });
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

        (uploadFile as jest.Mock).mockResolvedValueOnce({ path: 'test', url: 'http://test' });
        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

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

        const updatedVideo = {
          id: 'video-123',
          category: 'jingles',
          subcategory: 'goals',
        };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [updatedVideo] });

        await updateVideo(req, res);

        expect(res.json).toHaveBeenCalledWith(updatedVideo);
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { category: 'test' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

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

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await updateVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('deleteVideo', () => {
      it('should delete video and storage file', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ storage_path: 'videos/test.mp4' }] })
          .mockResolvedValueOnce({ rows: [{ id: 'video-123' }] });
        (deleteFile as jest.Mock).mockResolvedValueOnce(undefined);

        await deleteVideo(req, res);

        expect(deleteFile).toHaveBeenCalledWith('videos/test.mp4');
        expect(res.json).toHaveBeenCalledWith({ message: 'Vidéo supprimée avec succès' });
      });

      it('should return 404 if video not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await deleteVideo(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should delete without storage if no path', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ storage_path: null }] })
          .mockResolvedValueOnce({ rows: [{ id: 'video-123' }] });

        await deleteVideo(req, res);

        expect(deleteFile).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: 'Vidéo supprimée avec succès' });
      });
    });

    describe('getVideoDeployments', () => {
      it('should return deployment history for a video', async () => {
        const req = createAuthRequest({ params: { id: 'video-123' } });
        const res = createMockResponse();

        const mockDeployments = [
          { id: 'd1', video_id: 'video-123', status: 'completed', target_name: 'Site A', target_type: 'site' },
          { id: 'd2', video_id: 'video-123', status: 'failed', target_name: 'Site B', target_type: 'site' },
          { id: 'd3', video_id: 'video-123', status: 'pending', target_name: 'Group C', target_type: 'group' },
        ];

        (pool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ id: 'video-123' }] }) // video exists
          .mockResolvedValueOnce({ rows: mockDeployments });

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

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await getVideoDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo non trouvée' });
      });

      it('should return empty deployments if video has no deployments', async () => {
        const req = createAuthRequest({ params: { id: 'video-new' } });
        const res = createMockResponse();

        (pool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [{ id: 'video-new' }] }) // video exists
          .mockResolvedValueOnce({ rows: [] }); // no deployments

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

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getVideoDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Erreur lors de la récupération de l'historique des déploiements" });
      });
    });
  });

  describe('Deployments', () => {
    describe('getDeployments', () => {
      it('should return all deployments', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        const mockDeployments = [
          { id: '1', video_id: 'v1', target_type: 'site', target_name: 'Site A', metadata: { title: 'Video 1' } },
          { id: '2', video_id: 'v2', target_type: 'group', target_name: 'Group B', original_name: 'video.mp4', metadata: null },
        ];

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockDeployments });

        await getDeployments(req, res);

        expect(res.json).toHaveBeenCalledWith([
          { ...mockDeployments[0], video_title: 'Video 1' },
          { ...mockDeployments[1], video_title: 'video.mp4' },
        ]);
      });

      it('should return 500 on database error', async () => {
        const req = createAuthRequest();
        const res = createMockResponse();

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

        await getDeployments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('getDeployment', () => {
      it('should return deployment by id', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        const mockDeployment = { id: 'deploy-123', status: 'completed' };
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockDeployment] });

        await getDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(mockDeployment);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

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

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockDeployment] });

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

        (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

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
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [updated] });

        await updateDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith(updated);
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({
          params: { id: 'nonexistent' },
          body: { status: 'failed' },
        });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await updateDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      });
    });

    describe('deleteDeployment', () => {
      it('should delete deployment', async () => {
        const req = createAuthRequest({ params: { id: 'deploy-123' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'deploy-123' }] });

        await deleteDeployment(req, res);

        expect(res.json).toHaveBeenCalledWith({ message: 'Déploiement supprimé avec succès' });
      });

      it('should return 404 if deployment not found', async () => {
        const req = createAuthRequest({ params: { id: 'nonexistent' } });
        const res = createMockResponse();

        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

        await deleteDeployment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Déploiement non trouvé' });
      });
    });
  });
});
