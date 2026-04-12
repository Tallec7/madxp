import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  siteRepository,
  timelineRepository,
} from '../repositories';

/**
 * Récupère la timeline des événements récents pour un site
 * Agrège: déploiements, commandes, alertes, changements de config
 * Utile pour le debugging et le suivi d'activité
 */
export const getSiteTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    const maxLimit = Math.min(parseInt(limit as string, 10), 50);

    // Vérifier que le site existe
    const siteInfo = await siteRepository.findBasicInfo(id);

    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Récupérer les événements de plusieurs sources via le timeline repository
    const timelineData = await timelineRepository.getForSite(id, maxLimit);
    const deploymentsResult = { rows: timelineData.deployments, rowCount: timelineData.deployments.length };
    const commandsResult = { rows: timelineData.commands, rowCount: timelineData.commands.length };
    const configHistoryResult = { rows: timelineData.configs, rowCount: timelineData.configs.length };
    const alertsResult = { rows: timelineData.alerts, rowCount: timelineData.alerts.length };

    // Types pour les résultats de requêtes
    interface DeploymentRow {
      id: string;
      timestamp: string;
      status: string;
      video_name: string | null;
      category: string | null;
      progress: number | null;
      error_message: string | null;
      user_email: string | null;
    }
    interface CommandRow {
      id: string;
      timestamp: string;
      command_type: string;
      status: string;
      result: unknown;
      user_email: string | null;
    }
    interface ConfigRow {
      id: string;
      timestamp: string;
      comment: string | null;
      changes_summary: unknown[];
      user_email: string | null;
    }
    interface AlertRow {
      id: string;
      timestamp: string;
      alert_type: string;
      severity: string;
      message: string | null;
      resolved: boolean;
      resolved_at: string | null;
    }

    // Transformer les résultats en événements uniformes
    const events: Array<{
      id: string;
      type: string;
      timestamp: string;
      title: string;
      details: Record<string, unknown>;
      status?: string;
      user?: string;
    }> = [];

    // Déploiements
    for (const row of deploymentsResult.rows as unknown as DeploymentRow[]) {
      events.push({
        id: row.id,
        type: 'deployment',
        timestamp: row.timestamp,
        title: `Déploiement: ${row.video_name || 'Vidéo'}`,
        details: {
          category: row.category,
          progress: row.progress,
          error: row.error_message,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Commandes
    for (const row of commandsResult.rows as unknown as CommandRow[]) {
      events.push({
        id: row.id,
        type: 'command',
        timestamp: row.timestamp,
        title: `Commande: ${row.command_type}`,
        details: {
          result: row.result,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Configs
    for (const row of configHistoryResult.rows as unknown as ConfigRow[]) {
      const changesCount = Array.isArray(row.changes_summary)
        ? row.changes_summary.length
        : 0;
      events.push({
        id: row.id,
        type: 'config',
        timestamp: row.timestamp,
        title: row.comment || 'Mise à jour configuration',
        details: {
          changesCount,
        },
        status: 'completed',
        user: row.user_email || undefined,
      });
    }

    // Alertes
    for (const row of alertsResult.rows as unknown as AlertRow[]) {
      events.push({
        id: row.id,
        type: 'alert',
        timestamp: row.timestamp,
        title: row.message || `Alerte: ${row.alert_type}`,
        details: {
          alertType: row.alert_type,
          severity: row.severity,
          resolved: row.resolved,
          resolvedAt: row.resolved_at,
        },
        status: row.resolved ? 'resolved' : 'active',
      });
    }

    // Trier par timestamp décroissant et limiter
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedEvents = events.slice(0, maxLimit);

    res.json({
      siteId: id,
      siteName: siteInfo.site_name,
      events: limitedEvents,
      counts: {
        deployments: deploymentsResult.rowCount,
        commands: commandsResult.rowCount,
        configs: configHistoryResult.rowCount,
        alerts: alertsResult.rowCount,
      },
    });
  } catch (error) {
    logger.error('Get site timeline error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la timeline' });
  }
};
