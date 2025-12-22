/**
 * Service de déploiement de mises à jour logicielles
 * Gère l'envoi des commandes update_software aux Raspberry Pi
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import socketService from './socket.service';
import logger from '../config/logger';
import { getPublicUrl } from '../config/supabase';

interface UpdateDeploymentRow {
  id: string;
  update_id: string;
  target_type: string;
  target_id: string;
  status: string;
  [key: string]: unknown;
}

interface SoftwareUpdateRow {
  id: string;
  version: string;
  description: string | null;
  is_critical: boolean;
  changelog: string | null;
  package_url: string;
  package_size: number | null;
  checksum: string | null;
  [key: string]: unknown;
}

interface DeploymentTarget {
  siteId: string;
  siteName: string;
}

class UpdateDeploymentService {
  /**
   * Démarre un déploiement de mise à jour vers les sites connectés
   */
  async startDeployment(deploymentId: string): Promise<void> {
    try {
      // Récupérer les infos du déploiement
      const deploymentResult = await query<UpdateDeploymentRow>(
        `SELECT ud.*, su.version, su.description, su.is_critical, su.changelog,
                su.package_url, su.package_size, su.checksum
         FROM update_deployments ud
         JOIN software_updates su ON ud.update_id = su.id
         WHERE ud.id = $1`,
        [deploymentId]
      );

      if (deploymentResult.rows.length === 0) {
        throw new Error(`Déploiement de mise à jour non trouvé: ${deploymentId}`);
      }

      const deployment = deploymentResult.rows[0] as UpdateDeploymentRow & SoftwareUpdateRow;

      // Récupérer les sites cibles
      const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);

      if (targets.length === 0) {
        await this.failDeployment(deploymentId, 'Aucun site cible trouvé');
        return;
      }

      // Vérifier que le package existe
      if (!deployment.package_url) {
        await this.failDeployment(deploymentId, 'URL du package non définie');
        return;
      }

      // Tenter d'envoyer aux sites connectés
      let connectedCount = 0;

      for (const target of targets) {
        if (socketService.isConnected(target.siteId)) {
          const success = await this.deployToSite(deploymentId, target.siteId, deployment);
          if (success) {
            connectedCount++;
          }
        }
      }

      // Si au moins un site est connecté, passer en in_progress
      if (connectedCount > 0) {
        await query(
          `UPDATE update_deployments
           SET status = 'in_progress', started_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );
      }
      // Sinon, le déploiement reste en "pending" et sera traité quand les sites se connecteront

      logger.info('Update deployment initiated', {
        deploymentId,
        version: deployment.version,
        totalSites: targets.length,
        connectedSites: connectedCount,
        pendingSites: targets.length - connectedCount,
      });
    } catch (error) {
      logger.error('Error starting update deployment:', error);
      await this.failDeployment(deploymentId, error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  /**
   * Traite les déploiements de mises à jour en attente pour un site qui vient de se connecter
   */
  async processPendingDeploymentsForSite(siteId: string): Promise<void> {
    try {
      // Récupérer les déploiements pending qui ciblent ce site (directement ou via un groupe)
      const result = await query<UpdateDeploymentRow & SoftwareUpdateRow>(
        `SELECT ud.*, su.version, su.description, su.is_critical, su.changelog,
                su.package_url, su.package_size, su.checksum
         FROM update_deployments ud
         JOIN software_updates su ON ud.update_id = su.id
         WHERE ud.status IN ('pending', 'in_progress')
           AND (
             (ud.target_type = 'site' AND ud.target_id = $1)
             OR (ud.target_type = 'group' AND ud.target_id IN (
               SELECT group_id FROM site_groups WHERE site_id = $1
             ))
           )`,
        [siteId]
      );

      if (result.rows.length === 0) {
        return;
      }

      logger.info('Processing pending update deployments for site', {
        siteId,
        count: result.rows.length,
      });

      for (const deployment of result.rows) {
        const success = await this.deployToSite(deployment.id, siteId, deployment);

        if (success) {
          // Passer en in_progress si c'était pending
          await query(
            `UPDATE update_deployments
             SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
             WHERE id = $1 AND status = 'pending'`,
            [deployment.id]
          );
        }
      }
    } catch (error) {
      logger.error('Error processing pending update deployments for site:', { siteId, error });
    }
  }

  /**
   * Récupère les sites cibles d'un déploiement
   */
  private async getTargetSites(targetType: string, targetId: string): Promise<DeploymentTarget[]> {
    if (targetType === 'site') {
      const result = await query<{ siteId: string; siteName: string }>(
        'SELECT id as "siteId", site_name as "siteName" FROM sites WHERE id = $1',
        [targetId]
      );
      return result.rows;
    }

    if (targetType === 'group') {
      const result = await query<{ siteId: string; siteName: string }>(
        `SELECT s.id as "siteId", s.site_name as "siteName"
         FROM sites s
         JOIN site_groups sg ON s.id = sg.site_id
         WHERE sg.group_id = $1`,
        [targetId]
      );
      return result.rows;
    }

    return [];
  }

  /**
   * Envoie la commande de mise à jour à un site spécifique
   */
  private async deployToSite(
    deploymentId: string,
    siteId: string,
    update: SoftwareUpdateRow
  ): Promise<boolean> {
    if (!socketService.isConnected(siteId)) {
      logger.warn('Site not connected for update deployment', { siteId, deploymentId });
      return false;
    }

    const command = {
      id: uuidv4(),
      type: 'update_software',
      data: {
        deploymentId,
        updateId: update.id,
        version: update.version,
        packageUrl: update.package_url,
        packageSize: update.package_size,
        checksum: update.checksum,
        isCritical: update.is_critical,
        description: update.description,
        changelog: update.changelog,
      },
    };

    logger.info('Sending update_software command', {
      siteId,
      deploymentId,
      version: update.version,
      packageUrl: update.package_url,
    });

    // Créer une commande dans remote_commands pour le suivi
    await query(
      `INSERT INTO remote_commands (id, site_id, command_type, command_data, status, executed_at)
       VALUES ($1, $2, 'update_software', $3, 'executing', NOW())`,
      [command.id, siteId, JSON.stringify(command.data)]
    );

    return socketService.sendCommand(siteId, command);
  }

  /**
   * Met à jour le statut d'un déploiement en fonction du résultat
   */
  async handleDeploymentResult(
    deploymentId: string,
    siteId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      if (success) {
        // Vérifier si tous les sites ont terminé
        const deployment = await query<{ target_type: string; target_id: string }>(
          `SELECT target_type, target_id FROM update_deployments WHERE id = $1`,
          [deploymentId]
        );

        if (deployment.rows.length === 0) return;

        // Pour simplifier, on marque comme complété dès qu'un site réussit
        // Une implémentation plus complète suivrait chaque site individuellement
        await query(
          `UPDATE update_deployments
           SET status = 'completed', progress = 100, completed_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );

        logger.info('Update deployment completed', { deploymentId, siteId });
      } else {
        await query(
          `UPDATE update_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [errorMessage || 'Erreur inconnue', deploymentId]
        );

        logger.error('Update deployment failed', { deploymentId, siteId, errorMessage });
      }
    } catch (error) {
      logger.error('Error handling deployment result:', { deploymentId, error });
    }
  }

  /**
   * Met à jour le progress d'un déploiement
   */
  async updateProgress(deploymentId: string, progress: number): Promise<void> {
    try {
      await query(
        `UPDATE update_deployments
         SET progress = $1, status = 'in_progress'
         WHERE id = $2`,
        [progress, deploymentId]
      );
    } catch (error) {
      logger.error('Error updating deployment progress:', { deploymentId, error });
    }
  }

  /**
   * Marque un déploiement comme échoué
   */
  private async failDeployment(deploymentId: string, errorMessage: string): Promise<void> {
    await query(
      `UPDATE update_deployments
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [errorMessage, deploymentId]
    );

    logger.error('Update deployment failed', { deploymentId, errorMessage });
  }

  /**
   * Annule un déploiement en cours
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    await query(
      `UPDATE update_deployments
       SET status = 'failed', error_message = 'Annulé', completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'in_progress')`,
      [deploymentId]
    );

    logger.info('Update deployment cancelled', { deploymentId });
  }

  /**
   * Retente un déploiement échoué
   */
  async retryDeployment(deploymentId: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT id FROM update_deployments WHERE id = $1 AND status = 'failed'`,
        [deploymentId]
      );

      if (result.rows.length === 0) {
        logger.warn('Update deployment not found or not in failed state', { deploymentId });
        return false;
      }

      // Remettre en pending pour retry
      await query(
        `UPDATE update_deployments
         SET status = 'pending', error_message = NULL, progress = 0, completed_at = NULL
         WHERE id = $1`,
        [deploymentId]
      );

      // Démarrer le déploiement
      await this.startDeployment(deploymentId);

      logger.info('Update deployment manually retried', { deploymentId });
      return true;
    } catch (error) {
      logger.error('Error manually retrying update deployment:', { deploymentId, error });
      return false;
    }
  }
}

export const updateDeploymentService = new UpdateDeploymentService();
export default updateDeploymentService;
