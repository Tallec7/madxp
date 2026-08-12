import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import * as webContentController from '../controllers/web-content.controller';
import * as videoClubGrantsController from '../controllers/video-club-grants.controller';
import { authenticate, requireRole, requireClubPermission } from '../middleware/auth';
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
router.post('/videos/web-content', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), sensitiveRateLimit, validate(schemas.createWebContent), webContentController.createWebContent);
router.get('/videos/:id', authenticate, requireClubPermission('view_content'), adminRateLimit, contentController.getVideo);
router.get('/videos/:id/deployments', authenticate, requireClubPermission('view_status'), adminRateLimit, contentController.getVideoDeployments);
router.get('/videos/:id/usage', authenticate, requireClubPermission('view_analytics'), adminRateLimit, validateParams(paramSchemas.id), contentController.getVideoUsage);
router.post('/videos', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideo);
router.post('/videos/bulk', authenticate, requireRole('admin', 'operator'), uploadRateLimit, uploadVideo.array('videos', 20), contentController.createVideos);
router.put('/videos/:id', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), sensitiveRateLimit, contentController.updateVideo);
router.delete('/videos/:id', authenticate, requireRole('admin', 'club'), requireClubPermission('upload_video'), sensitiveRateLimit, contentController.deleteVideo);
router.delete('/videos/:id/sites/:siteId', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.unlinkVideoFromSite);

// Video variant routes (E-22: LED variants, Phase 5H: multi-display)
router.get('/videos/:id/variants', authenticate, requireClubPermission('view_content'), adminRateLimit, contentController.getVideoVariants);
router.post('/videos/variant-counts', authenticate, adminRateLimit, contentController.getVariantCounts);
router.post('/videos/:id/variants', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), uploadRateLimit, uploadVideo.single('video'), contentController.createVideoVariant);

// Replace video binary (chantier vidéos manquantes — auto-resolve FTP orphan).
// Garde id/filename/storage_path inchangés, overwrite le binaire FTP, met à
// jour file_size + checksum + thumbnail, push les sites pour bust le cache.
router.post('/videos/:id/replace', authenticate, requireRole('admin', 'operator'), uploadRateLimit, validateParams(paramSchemas.id), uploadVideo.single('video'), contentController.replaceVideo);
// `club` autorisé avec garde-fou d'ownership dans le controller (ne peut créer
// une variante que sur SA propre vidéo, source limitée à ce qu'il a le droit d'utiliser).
// Crée en une passe la variante led-perimeter manquante sur toutes les vidéos du club.
// Réservé admin/operator : c'est une écriture de masse, pas un geste de club.
// Vue d'ensemble des canvas LED d'un club : format source vs attendu + état.
router.get('/sites/:siteId/led-canvases', authenticate, requireRole('admin', 'operator'), adminRateLimit, validateParams(paramSchemas.siteId), contentController.getLedCanvasOverview);
router.post('/sites/:siteId/led-variants/bulk', authenticate, requireRole('admin', 'operator'), adminRateLimit, validateParams(paramSchemas.siteId), contentController.bulkCreateLedVariants);
router.post('/videos/:id/variants/from-video', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), adminRateLimit, contentController.createVideoVariantFromVideo);
// PROP-014 §8 / ADR-134 : mise en page de la variante LED (métadonnée, pas de re-upload).
// `club` autorisé — garde-fou d'ownership dans chaque handler (variante de sa propre vidéo).
router.patch('/videos/:id/variants/:displayType/layout', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), adminRateLimit, contentController.updateVideoVariantLayout);
// PROP-014 §6 / étape 6 : export plié async (enqueue + polling statut).
router.post('/videos/:id/variants/:displayType/export', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), adminRateLimit, contentController.enqueueLedExport);
// PROP-015 — détourage des marges : on ANALYSE (aucune écriture) puis un second
// geste, explicite, ENREGISTRE le rectangle validé. Jamais l'un sans l'autre.
// `sensitiveRateLimit` (30/min) et non `adminRateLimit` (400/min) sur l'analyse :
// elle télécharge le MP4 et lance ffmpeg dans le cycle HTTP. Assez large pour
// passer en revue la dizaine de vidéos d'un club, assez serré pour qu'une boucle
// ne sature pas les décodeurs (cf. la garde `ticking` du worker d'export).
router.post('/videos/:id/variants/:displayType/crop/detect', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), sensitiveRateLimit, validateParams(paramSchemas.id), validate(schemas.ledVariantCropDetect), contentController.detectLedVariantCrop);
router.put('/videos/:id/variants/:displayType/crop', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), adminRateLimit, validateParams(paramSchemas.id), validate(schemas.ledVariantCrop), contentController.setLedVariantCrop);
// ADR-135 (révision) : contenu LED « par côté » — upload/suppression d'un fichier par côté.
router.post('/videos/:id/variants/:displayType/sides/:sideIndex', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), uploadRateLimit, uploadVideo.single('video'), contentController.uploadVideoVariantSide);
router.post('/videos/:id/variants/:displayType/sides/:sideIndex/from-video', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), adminRateLimit, contentController.setVideoVariantSideFromVideo);
router.delete('/videos/:id/variants/:displayType/sides/:sideIndex', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), sensitiveRateLimit, contentController.deleteVideoVariantSide);
// PROP-014 §6 / ADR-134 : banc d'essai — plie une vidéo au choix pour le profil
// LED du club. Hors namespace /sites pour éviter toute collision avec sitesRoutes.
router.post('/led-test-export/:siteId', authenticate, requireRole('admin', 'operator'), adminRateLimit, validateParams(paramSchemas.siteId), validate(schemas.ledTestExport), contentController.enqueueLedTestExport);
router.get('/led-export-jobs/:jobId', authenticate, adminRateLimit, contentController.getLedExportJob);
router.delete('/videos/:videoId/variants/:displayType', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteVideoVariant);

// Image to video conversion
router.post('/image-to-video', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('upload_video'), uploadRateLimit, uploadImage.single('image'), contentController.convertImageToVideo);

// Deployment routes - GET use adminRateLimit, mutations use sensitiveRateLimit
router.get('/deployments', authenticate, adminRateLimit, contentController.getDeployments);
router.get('/deployments/:id', authenticate, adminRateLimit, contentController.getDeployment);
router.post('/deployments', authenticate, requireRole('admin', 'operator', 'club'), requireClubPermission('edit_loop'), sensitiveRateLimit, contentController.createDeployment);
router.put('/deployments/:id', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, contentController.updateDeployment);
router.delete('/deployments/:id', authenticate, requireRole('admin'), sensitiveRateLimit, contentController.deleteDeployment);

// Video club grants (ADR-082) — super_admin only for mutations, authenticated for reads
router.get('/videos/grants-for-site/:siteId', authenticate, adminRateLimit, validateParams(paramSchemas.siteId), videoClubGrantsController.getGrantedVideoIdsForSite);
router.get('/videos/:id/club-grants', authenticate, requireRole('super_admin'), adminRateLimit, validateParams(paramSchemas.id), videoClubGrantsController.listGrants);
router.post('/videos/:id/club-grants', authenticate, requireRole('super_admin'), sensitiveRateLimit, validateParams(paramSchemas.id), validate(schemas.addVideoClubGrant), videoClubGrantsController.addGrant);
router.delete('/videos/:id/club-grants/:siteId', authenticate, requireRole('super_admin'), sensitiveRateLimit, validateParams(paramSchemas.idAndSiteId), videoClubGrantsController.removeGrant);

export default router;
