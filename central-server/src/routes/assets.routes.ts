import { Router } from 'express';
import multer from 'multer';
import * as assetsController from '../controllers/assets.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Configuration multer pour les images (en mémoire)
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Formats acceptés: PNG, JPEG, GIF, WebP, SVG'));
    }
  },
});

// Watermark routes
// GET /api/assets/watermarks - Liste les watermarks disponibles sur le FTP
router.get(
  '/watermarks',
  authenticate,
  requireRole('admin', 'operator'),
  assetsController.listWatermarks
);

// POST /api/assets/watermark/:siteId - Upload et déploie un watermark
router.post(
  '/watermark/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  uploadImage.single('image'),
  assetsController.uploadWatermark
);

// POST /api/assets/watermark/validate - Valide une configuration watermark
router.post(
  '/watermark/validate',
  authenticate,
  assetsController.validateWatermarkConfig
);

// Generic asset deployment
// POST /api/assets/deploy/:siteId - Déploie un asset existant vers un site
router.post(
  '/deploy/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  assetsController.deployAsset
);

export default router;
