import { Router, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validateParams, paramSchemas } from '../middleware/validation';
import { apiRateLimit } from '../middleware/user-rate-limit';
import { clubPermissionRepository, ALL_CLUB_PERMISSIONS } from '../repositories';
import { AuthRequest } from '../types';
import logger from '../config/logger';

const router = Router();

/**
 * GET /api/sites/:siteId/club-permissions
 * List all club permissions for a site.
 * Admin/operator only.
 */
router.get(
  '/:siteId/club-permissions',
  apiRateLimit,
  authenticate,
  requireRole('admin', 'operator'),
  validateParams(paramSchemas.siteId),
  async (req: AuthRequest, res: Response) => {
    try {
      const { siteId } = req.params;
      const permissions = await clubPermissionRepository.listBySite(siteId);
      const grantedKeys = permissions.map(p => p.permission);

      res.json({
        site_id: siteId,
        permissions: ALL_CLUB_PERMISSIONS.map(key => ({
          key,
          granted: grantedKeys.includes(key),
          granted_at: permissions.find(p => p.permission === key)?.granted_at ?? null,
        })),
      });
    } catch (error) {
      logger.error('List club permissions error:', { error, siteId: req.params.siteId });
      res.status(500).json({ error: 'Erreur serveur interne' });
    }
  }
);

/**
 * PUT /api/sites/:siteId/club-permissions
 * Set all permissions for a site (replace mode).
 * Body: { permissions: string[] }
 * Admin/operator only.
 */
router.put(
  '/:siteId/club-permissions',
  apiRateLimit,
  authenticate,
  requireRole('admin', 'operator'),
  validateParams(paramSchemas.siteId),
  async (req: AuthRequest, res: Response) => {
    try {
      const { siteId } = req.params;
      const { permissions } = req.body as { permissions: string[] };

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'permissions doit être un tableau' });
      }

      // Validate all permission keys
      const invalid = permissions.filter(p => !ALL_CLUB_PERMISSIONS.includes(p as typeof ALL_CLUB_PERMISSIONS[number]));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: 'Permissions invalides',
          invalid,
          valid: ALL_CLUB_PERMISSIONS,
        });
      }

      await clubPermissionRepository.setPermissions(siteId, permissions, req.user!.id);

      logger.info('Club permissions updated', {
        siteId,
        permissions,
        updatedBy: req.user!.email,
      });

      return res.json({ success: true, permissions });
    } catch (error) {
      logger.error('Update club permissions error:', { error, siteId: req.params.siteId });
      return res.status(500).json({ error: 'Erreur serveur interne' });
    }
  }
);

export default router;
