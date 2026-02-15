/**
 * Alerts Controller
 *
 * Gère les endpoints pour les alertes système et prédictives
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { alertRepository } from '../repositories/alert.repository';
import alertService from '../services/alert.service';
import logger from '../config/logger';

/**
 * Liste les alertes avec filtres
 */
export const listAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      active,
      severity,
      siteId,
      limit = 50,
      offset = 0,
    } = req.query;

    const { rows, total } = await alertRepository.findWithFilters(
      {
        type: type as string | undefined,
        active: active === 'true' ? true : active === 'false' ? false : undefined,
        severity: severity as 'warning' | 'critical' | undefined,
        siteId: siteId as string | undefined,
      },
      { limit: Number(limit), offset: Number(offset) }
    );

    return res.json({
      success: true,
      alerts: rows.map(row => ({
        id: row.id,
        site_id: row.site_id,
        site_name: row.site_name || row.club_name,
        type: row.alert_type,
        severity: row.severity,
        message: row.message,
        metadata: row.metadata,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        is_active: row.status === 'active',
      })),
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Error listing alerts:', error);
    return res.status(500).json({ error: 'Failed to list alerts' });
  }
};

/**
 * Récupère les statistiques des alertes
 */
export const getAlertStats = async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await alertRepository.getStats();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting alert stats:', error);
    return res.status(500).json({ error: 'Failed to get alert stats' });
  }
};

/**
 * Résout une alerte
 */
export const resolveAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const alert = await alertRepository.resolve(id);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    logger.info('[Alerts] Alert resolved', {
      alertId: id,
      resolvedBy: req.user?.email,
    });

    return res.json({
      success: true,
      alert,
    });
  } catch (error) {
    logger.error('Error resolving alert:', error);
    return res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

/**
 * Envoie une alerte Slack de test pour vérifier la configuration webhook.
 * Réservé aux super_admin.
 */
export const testSlack = async (req: AuthRequest, res: Response) => {
  try {
    const success = await alertService.info(
      '🔔 Test Slack — Neopro',
      `Test envoyé par *${req.user?.email || 'unknown'}* depuis le dashboard.\nSi vous voyez ce message, les alertes Slack fonctionnent !`
    );

    logger.info('[Alerts] Test Slack alert sent', {
      success,
      sentBy: req.user?.email,
    });

    return res.json({
      success,
      message: success
        ? 'Notification Slack envoyée avec succès'
        : 'Échec — vérifiez SLACK_WEBHOOK_URL et SLACK_ALERTS_ENABLED',
    });
  } catch (error) {
    logger.error('Error sending test Slack alert:', error);
    return res.status(500).json({ error: 'Failed to send test Slack alert' });
  }
};

/**
 * Résout toutes les alertes d'un site
 */
export const resolveSiteAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const resolvedCount = await alertRepository.resolveAllForSite(siteId);

    logger.info('[Alerts] Site alerts resolved', {
      siteId,
      count: resolvedCount,
      resolvedBy: req.user?.email,
    });

    return res.json({
      success: true,
      resolvedCount,
    });
  } catch (error) {
    logger.error('Error resolving site alerts:', error);
    return res.status(500).json({ error: 'Failed to resolve site alerts' });
  }
};
