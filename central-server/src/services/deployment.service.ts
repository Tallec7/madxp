import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import socketService from './socket.service';
import logger from '../config/logger';
import { deleteFile, getPublicUrl } from '../config/supabase';

interface DeploymentTarget {
  siteId: string;
  siteName: string;
}

interface DeploymentRow {
  id: string;
  video_id: string;
  target_type: string;
  target_id: string;
  filename: string;
  storage_path: string;
  metadata: { title?: string } | null;
}

class DeploymentService {
  /**
   * Tente de démarrer un déploiement vers les sites connectés.
   * Les sites non connectés recevront le déploiement quand ils se connecteront.
   */
  async startDeployment(deploymentId: string): Promise<void> {
    try {
      // Récupérer les infos du déploiement
      const deploymentResult = await query(
        `SELECT cd.*, v.filename, v.storage_path, v.metadata
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         WHERE cd.id = $1`,
        [deploymentId]
      );

      if (deploymentResult.rows.length === 0) {
        throw new Error(`Déploiement non trouvé: ${deploymentId}`);
      }

      const deployment = deploymentResult.rows[0] as unknown as DeploymentRow;

      // Récupérer les sites cibles
      const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);

      if (targets.length === 0) {
        await this.failDeployment(deploymentId, 'Aucun site cible trouvé');
        return;
      }

      // Construire l'URL de la vidéo depuis Supabase Storage
      const videoUrl = getPublicUrl(deployment.storage_path);
      const videoTitle = deployment.metadata?.title || deployment.filename;

      // Tenter d'envoyer aux sites connectés
      let connectedCount = 0;

      for (const target of targets) {
        if (socketService.isConnected(target.siteId)) {
          const success = await this.deployToSite(
            deploymentId,
            target.siteId,
            deployment.video_id,
            videoUrl,
            videoTitle
          );
          if (success) {
            connectedCount++;
          }
        }
      }

      // Si au moins un site est connecté, passer en in_progress
      if (connectedCount > 0) {
        await query(
          `UPDATE content_deployments
           SET status = 'in_progress', started_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );
      }
      // Sinon, le déploiement reste en "pending" et sera traité quand les sites se connecteront

      logger.info('Deployment initiated', {
        deploymentId,
        totalSites: targets.length,
        connectedSites: connectedCount,
        pendingSites: targets.length - connectedCount
      });

    } catch (error) {
      logger.error('Error starting deployment:', error);
      await this.failDeployment(deploymentId, error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  /**
   * Traite les déploiements en attente pour un site qui vient de se connecter
   */
  async processPendingDeploymentsForSite(siteId: string): Promise<void> {
    try {
      // Récupérer les déploiements pending qui ciblent ce site (directement ou via un groupe)
      const result = await query(
        `SELECT cd.id, cd.video_id, v.filename, v.storage_path, v.metadata
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         WHERE cd.status IN ('pending', 'in_progress')
           AND (
             (cd.target_type = 'site' AND cd.target_id = $1)
             OR (cd.target_type = 'group' AND cd.target_id IN (
               SELECT group_id FROM site_groups WHERE site_id = $1
             ))
           )`,
        [siteId]
      );

      if (result.rows.length === 0) {
        return;
      }

      logger.info('Processing pending deployments for site', {
        siteId,
        count: result.rows.length
      });

      for (const row of result.rows) {
        const deployment = row as unknown as DeploymentRow;
        const videoUrl = getPublicUrl(deployment.storage_path);
        const videoTitle = deployment.metadata?.title || deployment.filename;

        const success = await this.deployToSite(
          deployment.id,
          siteId,
          deployment.video_id,
          videoUrl,
          videoTitle
        );

        if (success) {
          // Passer en in_progress si c'était pending
          await query(
            `UPDATE content_deployments
             SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
             WHERE id = $1 AND status = 'pending'`,
            [deployment.id]
          );
        }
      }
    } catch (error) {
      logger.error('Error processing pending deployments for site:', { siteId, error });
    }
  }

  /**
   * Récupère les sites cibles d'un déploiement
   */
  private async getTargetSites(targetType: string, targetId: string): Promise<DeploymentTarget[]> {
    if (targetType === 'site') {
      const result = await query(
        'SELECT id as "siteId", site_name as "siteName" FROM sites WHERE id = $1',
        [targetId]
      );
      return result.rows as unknown as DeploymentTarget[];
    }

    if (targetType === 'group') {
      const result = await query(
        `SELECT s.id as "siteId", s.site_name as "siteName"
         FROM sites s
         JOIN site_groups sg ON s.id = sg.site_id
         WHERE sg.group_id = $1`,
        [targetId]
      );
      return result.rows as unknown as DeploymentTarget[];
    }

    return [];
  }

  /**
   * Envoie la commande de déploiement à un site spécifique
   */
  private async deployToSite(
    deploymentId: string,
    siteId: string,
    videoId: string,
    videoUrl: string,
    videoTitle: string
  ): Promise<boolean> {
    if (!socketService.isConnected(siteId)) {
      logger.warn('Site not connected for deployment', { siteId, deploymentId });
      return false;
    }

    const command = {
      id: uuidv4(),
      type: 'deploy_video',
      data: {
        deploymentId,
        videoId,
        videoUrl,
        videoTitle,
        action: 'download'
      }
    };

    return socketService.sendCommand(siteId, command);
  }

  /**
   * Met à jour le progress d'un déploiement
   */
  async updateProgress(deploymentId: string, siteId: string, progress: number, completed: boolean): Promise<void> {
    try {
      // Récupérer le déploiement et calculer le progress global
      const deploymentResult = await query(
        `SELECT cd.target_type, cd.target_id
         FROM content_deployments cd
         WHERE cd.id = $1`,
        [deploymentId]
      );

      if (deploymentResult.rows.length === 0) return;

      const deployment = deploymentResult.rows[0] as { target_type: string; target_id: string };
      const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);

      // Pour simplifier, on met à jour le progress basé sur le dernier site qui répond
      // Dans une implémentation plus complète, on suivrait le progress de chaque site
      await query(
        `UPDATE content_deployments
         SET progress = $1
         WHERE id = $2`,
        [progress, deploymentId]
      );

      // Si tous les sites ont terminé, marquer comme complété
      if (completed && progress >= 100) {
        // Récupérer le video_id avant de marquer comme complété
        const videoResult = await query(
          `SELECT video_id FROM content_deployments WHERE id = $1`,
          [deploymentId]
        );
        const videoId = videoResult.rows[0]?.video_id;

        await query(
          `UPDATE content_deployments
           SET status = 'completed', progress = 100, completed_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );

        logger.info('Deployment completed', { deploymentId });

        // Vérifier si tous les déploiements de cette vidéo sont terminés
        if (videoId && typeof videoId === 'string') {
          await this.cleanupVideoIfAllDeploymentsComplete(videoId);
        }
      }
    } catch (error) {
      logger.error('Error updating deployment progress:', error);
    }
  }

  /**
   * Vérifie si tous les déploiements d'une vidéo sont terminés et supprime la vidéo du stockage
   */
  private async cleanupVideoIfAllDeploymentsComplete(videoId: string): Promise<void> {
    try {
      // Vérifier s'il reste des déploiements non terminés pour cette vidéo
      const pendingResult = await query(
        `SELECT COUNT(*) as count
         FROM content_deployments
         WHERE video_id = $1 AND status NOT IN ('completed', 'failed', 'cancelled')`,
        [videoId]
      );

      const pendingCount = parseInt(String(pendingResult.rows[0].count), 10);

      if (pendingCount > 0) {
        logger.info('Video still has pending deployments, not cleaning up', { videoId, pendingCount });
        return;
      }

      // Récupérer le storage_path de la vidéo
      const videoResult = await query(
        `SELECT storage_path FROM videos WHERE id = $1`,
        [videoId]
      );

      if (videoResult.rows.length === 0) {
        return;
      }

      const storagePath = videoResult.rows[0].storage_path as string | null;

      // Supprimer le fichier du stockage Supabase
      if (storagePath) {
        const deleted = await deleteFile(storagePath);
        if (deleted) {
          logger.info('Video file cleaned up from storage after all deployments completed', { videoId, storagePath });
        }
      }
    } catch (error) {
      logger.error('Error cleaning up video after deployments:', { videoId, error });
    }
  }

  /**
   * Marque un déploiement comme échoué
   */
  private async failDeployment(deploymentId: string, errorMessage: string): Promise<void> {
    await query(
      `UPDATE content_deployments
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [errorMessage, deploymentId]
    );

    logger.error('Deployment failed', { deploymentId, errorMessage });
  }

  /**
   * Annule un déploiement en cours
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    await query(
      `UPDATE content_deployments
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'in_progress')`,
      [deploymentId]
    );

    logger.info('Deployment cancelled', { deploymentId });
  }
}

export default new DeploymentService();
