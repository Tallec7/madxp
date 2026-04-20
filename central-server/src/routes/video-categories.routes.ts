import { Router } from 'express';
import * as videoCategoryController from '../controllers/video-category.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validateParams, paramSchemas } from '../middleware/validation';
import { apiRateLimit } from '../middleware/user-rate-limit';

const router = Router();

router.get(
  '/:siteId/video-categories',
  authenticate,
  requireRole('admin', 'operator', 'super_admin', 'club'),
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  videoCategoryController.listCategories
);

router.post(
  '/:siteId/video-categories',
  authenticate,
  requireRole('admin', 'operator', 'super_admin'),
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  videoCategoryController.createCategory
);

router.put(
  '/:siteId/video-categories/:id',
  authenticate,
  requireRole('admin', 'operator', 'super_admin'),
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  videoCategoryController.updateCategory
);

router.delete(
  '/:siteId/video-categories/:id',
  authenticate,
  requireRole('admin', 'operator', 'super_admin'),
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  videoCategoryController.deleteCategory
);

export default router;
