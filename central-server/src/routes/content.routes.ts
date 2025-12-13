import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadVideo } from '../middleware/upload';
import { paginationMiddleware } from '../middleware/pagination';

const router = Router();

// Video routes
router.get('/videos', authenticate, paginationMiddleware, contentController.getVideos);
router.get('/videos/:id', authenticate, contentController.getVideo);
router.get('/videos/:id/deployments', authenticate, contentController.getVideoDeployments);
router.post('/videos', authenticate, requireRole('admin', 'operator'), uploadVideo.single('video'), contentController.createVideo);
router.post('/videos/bulk', authenticate, requireRole('admin', 'operator'), uploadVideo.array('videos', 20), contentController.createVideos);
router.put('/videos/:id', authenticate, requireRole('admin', 'operator'), contentController.updateVideo);
router.delete('/videos/:id', authenticate, requireRole('admin'), contentController.deleteVideo);

// Deployment routes
router.get('/deployments', authenticate, contentController.getDeployments);
router.get('/deployments/:id', authenticate, contentController.getDeployment);
router.post('/deployments', authenticate, requireRole('admin', 'operator'), contentController.createDeployment);
router.put('/deployments/:id', authenticate, requireRole('admin', 'operator'), contentController.updateDeployment);
router.delete('/deployments/:id', authenticate, requireRole('admin'), contentController.deleteDeployment);

export default router;
