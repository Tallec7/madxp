/**
 * Routes pour les logs d'audit
 */

import { Router, Response } from 'express';
import { auditService, AuditAction } from '../services/audit.service';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/audit
 * Récupère les logs d'audit avec pagination et filtres
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé. Réservé aux administrateurs.' });
    }

    const {
      page = '1',
      limit = '50',
      action,
      userId,
      targetType,
      startDate,
      endDate,
    } = req.query;

    const result = await auditService.getLogs({
      page: parseInt(page as string, 10),
      limit: Math.min(parseInt(limit as string, 10), 100),
      action: action as AuditAction | undefined,
      userId: userId as string | undefined,
      targetType: targetType as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des logs d\'audit' });
  }
});

/**
 * GET /api/audit/actions
 * Liste les types d'actions disponibles
 */
router.get('/actions', authenticate, (_req: AuthRequest, res: Response) => {
  const actions: AuditAction[] = [
    'USER_LOGIN',
    'USER_LOGOUT',
    'USER_CREATED',
    'USER_UPDATED',
    'USER_DELETED',
    'SITE_CREATED',
    'SITE_UPDATED',
    'SITE_DELETED',
    'API_KEY_REGENERATED',
    'VIDEO_UPLOADED',
    'VIDEO_DELETED',
    'VIDEO_DEPLOYED',
    'CONFIG_PUSHED',
    'COMMAND_SENT',
    'GROUP_CREATED',
    'GROUP_UPDATED',
    'GROUP_DELETED',
    'SETTINGS_UPDATED',
  ];

  res.json({ actions });
});

export default router;
