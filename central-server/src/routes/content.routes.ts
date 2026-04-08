import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadVideo, uploadImage } from '../middleware/upload';
import { paginationMiddleware, createPaginationMiddleware } from '../middleware/pagination';

const router = Router();

// Video routes
router.get('/videos', authenticate, createPaginationMiddleware(20, 500), contentController.getVideos);
router.get('/videos/names', authenticate, contentController.getVideoNames);  // Liste légère id+titre pour dropdowns
router.get('/videos/for-site/:siteId', authenticate, paginationMiddleware, contentController.getVideosForSite);  // Vidéos priorisées pour un site
router.get('/videos/:id', authenticate, contentController.getVideo);
router.get('/videos/:id/deployments', authenticate, contentController.getVideoDeployments);
router.post('/videos', authenticate, requireRole('admin', 'operator', 'club'), uploadVideo.single('video'), contentController.createVideo);
router.post('/videos/bulk', authenticate, requireRole('admin', 'operator'), uploadVideo.array('videos', 20), contentController.createVideos);
router.put('/videos/:id', authenticate, requireRole('admin', 'operator', 'club'), contentController.updateVideo);
router.delete('/videos/:id', authenticate, requireRole('admin', 'club'), contentController.deleteVideo);

// Video variant routes (E-22: LED variants)
router.get('/videos/:id/variants', authenticate, contentController.getVideoVariants);
router.post('/videos/:id/variants', authenticate, requireRole('admin', 'operator'), uploadVideo.single('video'), contentController.createVideoVariant);
router.delete('/videos/:videoId/variants/:displayType', authenticate, requireRole('admin'), contentController.deleteVideoVariant);

// Image to video conversion
router.post('/image-to-video', authenticate, requireRole('admin', 'operator', 'club'), uploadImage.single('image'), contentController.convertImageToVideo);

// Template rendering (overlay animation on existing MP4)
router.post('/render-template', authenticate, requireRole('admin', 'operator'), uploadVideo.single('video'), contentController.renderTemplate);
router.get('/templates/available', authenticate, contentController.getAvailableTemplates);

// Deployment routes
router.get('/deployments', authenticate, contentController.getDeployments);
router.get('/deployments/:id', authenticate, contentController.getDeployment);
router.post('/deployments', authenticate, requireRole('admin', 'operator', 'club'), contentController.createDeployment);
router.put('/deployments/:id', authenticate, requireRole('admin', 'operator'), contentController.updateDeployment);
router.delete('/deployments/:id', authenticate, requireRole('admin'), contentController.deleteDeployment);

export default router;
