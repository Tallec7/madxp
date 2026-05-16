import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import * as webContentController from '../controllers/web-content.controller';
import * as videoClubGrantsController from '../controllers/video-club-grants.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadVideo, uploadImage } from '../middleware/upload';
import { paginationMiddleware, createPaginationMiddleware } from '../middleware/pagination';
import { adminRateLimit, sensitiveRateLimit, uploadRateLimit } from '../middleware/user-rate-limit';
import { validate, validateParams, schemas, paramSchemas } from '../middleware/validation';

const router = Router();

// Video routes - GET use adminRateLimit (400/min), mutations use sensitiveRateLimit or uploadRateLimit
router.get('/videos', authenticate, adminRateLimit, createPaginationMiddleware(20, 500), contentController.getVideos);
router.get('/videos/names', authenticate, adminRateLimit, contentController.getVideoNames);  // Liste légère id+titre pour dropdowns
router.get('/videos/for-site/:siteId', authenticate, adminRateLimit, paginationMiddleware, contentController.getVideosForSite);  // Vidéos priorisées pour un site
// ADR-088 — Web page / livestream content (must be BEFORE /videos/:id to avoid 'web-content' matching as id)
router.post('/videos/web-content', authenticate, requireRole('admin', 'operator', 'club'), sensitiveRateLimit, validate(schemas.createWebContent), webContentController.createWebContent);
router.get('/videos/:id', authenticate, adminRateLimit, contentController.getVideo);
router.get('/videos/:id/deployments', authenticate, adminRateLimit, contentController.getVideoDeployments);
router.get('/videos/:id/usage', authenticate, adminRateLimit, validateParams(paramSchemas.id), contentController.getVideoUsage);
router.post('/videos', authenticate, requireRole('admin', 'operator', 'club'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideo);
router.post('/videos/bulk', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadVideo.array('videos', 20), contentController.createVideos);
router.put('/videos/:id', authenticate, requireRole('admin', 'operator', 'club'), sensitiveRateLimit, contentController.updateVideo);
router.delete('/videos/:id', authenticate, requireRole('admin', 'club'), sensitiveRateLimit, contentController.deleteVideo);
router.delete('/videos/:id/sites/:siteId', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.unlinkVideoFromSite);

// Video variant routes (E-22: LED variants, Phase 5H: multi-display)
router.get('/videos/:id/variants', authenticate, adminRateLimit, contentController.getVideoVariants);
router.post('/videos/variant-counts', authenticate, adminRateLimit, contentController.getVariantCounts);
router.post('/videos/:id/variants', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideoVariant);

// Replace video binary (chantier vidéos manquantes — auto-resolve FTP orphan).
// Garde id/filename/storage_path inchangés, overwrite le binaire FTP, met à
// jour file_size + checksum + thumbnail, push les sites pour bust le cache.
router.post('/videos/:id/replace', authenticate, requireRole('admin', 'operator'), uploadRateLimit, validateParams(paramSchemas.id), uploadVideo.single('video'), contentController.replaceVideo);
router.post('/videos/:id/variants/from-video', authenticate, requireRole('admin', 'operator'), adminRateLimit, contentController.createVideoVariantFromVideo);
router.delete('/videos/:videoId/variants/:displayType', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteVideoVariant);

// Image to video conversion
router.post('/image-to-video', authenticate, requireRole('admin', 'operator', 'club'), uploadRateLimit, uploadImage.single('image'), contentController.convertImageToVideo);

// Deployment routes - GET use adminRateLimit, mutations use sensitiveRateLimit
router.get('/deployments', authenticate, adminRateLimit, contentController.getDeployments);
router.get('/deployments/:id', authenticate, adminRateLimit, contentController.getDeployment);
router.post('/deployments', authenticate, requireRole('admin', 'operator', 'club'), sensitiveRateLimit, contentController.createDeployment);
router.put('/deployments/:id', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, contentController.updateDeployment);
router.delete('/deployments/:id', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteDeployment);

// Video club grants (ADR-082) — super_admin only for mutations, authenticated for reads
router.get('/videos/grants-for-site/:siteId', authenticate, adminRateLimit, validateParams(paramSchemas.siteId), videoClubGrantsController.getGrantedVideoIdsForSite);
router.get('/videos/:id/club-grants', authenticate, requireRole('super_admin'), adminRateLimit, validateParams(paramSchemas.id), videoClubGrantsController.listGrants);
router.post('/videos/:id/club-grants', authenticate, requireRole('super_admin'), sensitiveRateLimit, validateParams(paramSchemas.id), validate(schemas.addVideoClubGrant), videoClubGrantsController.addGrant);
router.delete('/videos/:id/club-grants/:siteId', authenticate, requireRole('super_admin'), sensitiveRateLimit, validateParams(paramSchemas.idAndSiteId), videoClubGrantsController.removeGrant);

export default router;
