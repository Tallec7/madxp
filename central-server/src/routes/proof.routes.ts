import { Router } from 'express';
import * as proofController from '../controllers/proof.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { sensitiveRateLimit, monitoringRateLimit } from '../middleware/user-rate-limit';
import multer from 'multer';

const router = Router();

// Configuration multer pour les screenshots
const uploadScreenshot = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Format non supporté: ${file.mimetype}. Utilisez JPEG, PNG ou WebP.`));
    }
  },
});

// Routes publiques pour upload depuis le Pi (authentification par API key)
// Le Pi envoie son x-api-key et x-site-id dans les headers
router.post(
  '/:siteId/upload',
  authenticate,
  sensitiveRateLimit,
  uploadScreenshot.single('screenshot'),
  proofController.uploadProof
);

// Routes pour le dashboard (authentification JWT)
router.get(
  '/stats',
  authenticate,
  requireRole('super_admin', 'admin'),
  monitoringRateLimit,
  proofController.getProofStats
);

router.get(
  '/:siteId',
  authenticate,
  monitoringRateLimit,
  proofController.getProofsForSite
);

router.get(
  '/detail/:proofId',
  authenticate,
  monitoringRateLimit,
  proofController.getProofById
);

router.post(
  '/:siteId/capture',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  proofController.triggerCapture
);

export default router;
