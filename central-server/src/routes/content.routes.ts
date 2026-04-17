import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadVideo, uploadImage, uploadTemplate } from '../middleware/upload';
import { paginationMiddleware, createPaginationMiddleware } from '../middleware/pagination';
import { adminRateLimit, sensitiveRateLimit, uploadRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// Video routes - GET use adminRateLimit (400/min), mutations use sensitiveRateLimit or uploadRateLimit
router.get('/videos', authenticate, adminRateLimit, createPaginationMiddleware(20, 500), contentController.getVideos);
router.get('/videos/names', authenticate, adminRateLimit, contentController.getVideoNames);  // Liste légère id+titre pour dropdowns
router.get('/videos/for-site/:siteId', authenticate, adminRateLimit, paginationMiddleware, contentController.getVideosForSite);  // Vidéos priorisées pour un site
router.get('/videos/:id', authenticate, adminRateLimit, contentController.getVideo);
router.get('/videos/:id/deployments', authenticate, adminRateLimit, contentController.getVideoDeployments);
router.post('/videos', authenticate, requireRole('admin', 'operator', 'club'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideo);
router.post('/videos/bulk', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadVideo.array('videos', 20), contentController.createVideos);
router.put('/videos/:id', authenticate, requireRole('admin', 'operator', 'club'), sensitiveRateLimit, contentController.updateVideo);
router.delete('/videos/:id', authenticate, requireRole('admin', 'club'), sensitiveRateLimit, contentController.deleteVideo);
router.delete('/videos/:id/sites/:siteId', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.unlinkVideoFromSite);

// Video variant routes (E-22: LED variants, Phase 5H: multi-display)
router.get('/videos/:id/variants', authenticate, adminRateLimit, contentController.getVideoVariants);
router.post('/videos/variant-counts', authenticate, adminRateLimit, contentController.getVariantCounts);
router.post('/videos/:id/variants', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideoVariant);
router.post('/videos/:id/variants/from-video', authenticate, requireRole('admin', 'operator'), adminRateLimit, contentController.createVideoVariantFromVideo);
router.delete('/videos/:videoId/variants/:displayType', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteVideoVariant);

// Image to video conversion
router.post('/image-to-video', authenticate, requireRole('admin', 'operator', 'club'), uploadRateLimit, uploadImage.single('image'), contentController.convertImageToVideo);

// Template rendering (overlay animation on existing MP4)
router.post('/render-template', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadTemplate.fields([
  { name: 'video', maxCount: 1 },
  { name: 'image_photo', maxCount: 1 },
  { name: 'image_logo', maxCount: 1 },
]), contentController.renderTemplate);
router.get('/templates/available', authenticate, adminRateLimit, contentController.getAvailableTemplates);
// Template assets: no auth (static files), relaxed CSP for iframe embedding
router.get(
  '/template-assets/:template/:file',
  adminRateLimit,
  (_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; media-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com https: data:;"
    );
    next();
  },
  contentController.getTemplateAsset,
);

// Deployment routes - GET use adminRateLimit, mutations use sensitiveRateLimit
router.get('/deployments', authenticate, adminRateLimit, contentController.getDeployments);
router.get('/deployments/:id', authenticate, adminRateLimit, contentController.getDeployment);
router.post('/deployments', authenticate, requireRole('admin', 'operator', 'club'), sensitiveRateLimit, contentController.createDeployment);
router.put('/deployments/:id', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, contentController.updateDeployment);
router.delete('/deployments/:id', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteDeployment);

export default router;
