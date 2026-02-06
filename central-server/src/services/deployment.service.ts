import { query } from '../config/database';
import socketService from './socket.service';
import { commandQueueService } from './command-queue.service';
import logger from '../config/logger';
import { deleteFile, getPublicUrl } from '../config/supabase';
import { isFtpConfigured, getFtpPublicUrl } from '../config/ftp-storage';
import { uploadVerificationService } from './upload-verification.service';

/**
 * Génère l'URL publique pour télécharger une vidéo.
 * Détecte automatiquement si le fichier est sur FTP ou Supabase
 * en fonction du format du storage_path.
 */
function getVideoDownloadUrl(storagePath: string): string {
  // Si le path est juste un filename (pas de /) → c'est un fichier FTP
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
  }

  // Sinon c'est un chemin Supabase (ex: uploads/filename.mp4)
  return getPublicUrl(storagePath);
}

// Configuration du retry
const RETRY_CONFIG = {
  maxRetries: 3,                    // Nombre max de tentatives
  retryDelayMs: 5 * 60 * 1000,      // Délai minimum entre retries (5 minutes)
  retryableErrors: [                 // Erreurs qui peuvent être retryées
    'timeout',
    'connection',
    'network',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'Command timeout',
  ],
};

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
  original_name: string;
  category: string | null;
  subcategory: string | null;
  duration: number | null;
  storage_path: string;
  checksum: string | null;
  metadata: { title?: string; analytics_category?: string } | null;
  advertiser_id: string | null;
  analytics_category: string | null;
}

class DeploymentService {
  /**
   * Tente de démarrer un déploiement vers les sites.
   * Utilise commandQueueService.sendOrQueue() pour gérer les sites offline
   * (même comportement que update_config et update_software).
   */
  async startDeployment(deploymentId: string): Promise<void> {
    try {
      // Récupérer les infos du déploiement avec le sponsor associé (si existant)
      const deploymentResult = await query(
        `SELECT cd.*,
                v.filename, v.original_name, v.category, v.subcategory, v.duration, v.storage_path, v.checksum, v.metadata,
                v.upload_status,
                av.advertiser_id,
                COALESCE(v.metadata->>'analytics_category',
                  CASE
                    WHEN av.advertiser_id IS NOT NULL THEN 'sponsor'
                    ELSE NULL
                  END
                ) as analytics_category
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         LEFT JOIN advertiser_videos av ON av.video_id = v.id AND av.is_primary = true
         WHERE cd.id = $1`,
        [deploymentId]
      );

      if (deploymentResult.rows.length === 0) {
        throw new Error(`Déploiement non trouvé: ${deploymentId}`);
      }

      const deployment = deploymentResult.rows[0] as unknown as DeploymentRow & { upload_status: string };

      // === DOUBLE-CHECK: Vérifier que l'upload est prêt avant de continuer ===
      // Cette vérification est une sécurité supplémentaire au cas où le contrôleur
      // n'aurait pas fait la vérification (ex: déploiement planifié, retry automatique)
      if (deployment.upload_status !== 'ready') {
        const errorMessage = uploadVerificationService.getDeploymentBlockedMessage(
          deployment.upload_status as 'uploading' | 'verifying' | 'ready' | 'failed' | null
        );
        logger.error('Deployment blocked in service: video upload not ready', {
          deploymentId,
          videoId: deployment.video_id,
          uploadStatus: deployment.upload_status,
        });
        await this.failDeployment(deploymentId, `Upload non vérifié: ${errorMessage}`);
        return;
      }

      // Récupérer les sites cibles
      const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);

      if (targets.length === 0) {
        await this.failDeployment(deploymentId, 'Aucun site cible trouvé');
        return;
      }

      // Construire l'URL de la vidéo depuis Supabase Storage
      const videoUrl = getVideoDownloadUrl(deployment.storage_path);

      // Tenter d'envoyer aux sites (ou mettre en queue si offline)
      let successCount = 0;
      const commandSentSites: string[] = [];
      const commandQueuedSites: string[] = [];
      const commandFailedSites: string[] = [];

      for (const target of targets) {
        const isConnected = socketService.isConnected(target.siteId);
        logger.info('Processing site for video deployment', {
          deploymentId,
          siteId: target.siteId,
          siteName: target.siteName,
          isConnected,
        });

        // deployToSite utilise maintenant sendOrQueue, donc fonctionne même si offline
        const success = await this.deployToSite(
          deploymentId,
          target.siteId,
          deployment.video_id,
          videoUrl,
          deployment
        );

        if (success) {
          successCount++;
          if (isConnected) {
            commandSentSites.push(target.siteName);
          } else {
            commandQueuedSites.push(target.siteName);
          }
        } else {
          commandFailedSites.push(target.siteName);
        }
      }

      // Mettre à jour le statut avec des informations détaillées
      if (successCount > 0) {
        // Au moins une commande envoyée ou mise en queue
        const statusMessage = [];
        if (commandSentSites.length > 0) {
          statusMessage.push(`Envoyé: ${commandSentSites.join(', ')}`);
        }
        if (commandQueuedSites.length > 0) {
          statusMessage.push(`En attente de reconnexion: ${commandQueuedSites.join(', ')}`);
        }

        await query(
          `UPDATE content_deployments
           SET status = 'in_progress', started_at = NOW(), error_message = $1
           WHERE id = $2`,
          [statusMessage.join(' | ') || null, deploymentId]
        );

        logger.info('Video deployment in progress', {
          deploymentId,
          commandSentSites,
          commandQueuedSites,
          commandFailedSites,
        });
      } else {
        // Aucune commande n'a pu être envoyée ou mise en queue
        await query(
          `UPDATE content_deployments
           SET error_message = $1
           WHERE id = $2 AND status = 'pending'`,
          ['Échec de l\'envoi à tous les sites cibles', deploymentId]
        );

        logger.error('Video deployment failed for all sites', {
          deploymentId,
          commandFailedSites,
        });
      }

      logger.info('Deployment initiated', {
        deploymentId,
        videoFilename: deployment.filename,
        totalSites: targets.length,
        successCount,
        commandSentSites,
        commandQueuedSites,
        commandFailedSites,
      });

    } catch (error) {
      logger.error('Error starting deployment:', error);
      await this.failDeployment(deploymentId, error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  /**
   * Traite les déploiements en attente pour un site qui vient de se connecter.
   * Note: Avec commandQueueService, les commandes en queue sont automatiquement
   * envoyées à la reconnexion. Cette méthode gère les cas où le déploiement
   * DB est en 'pending' mais n'a pas été mis en queue (anciens déploiements).
   */
  async processPendingDeploymentsForSite(siteId: string): Promise<void> {
    try {
      // Récupérer les déploiements pending qui ciblent ce site (directement ou via un groupe)
      const result = await query(
        `SELECT cd.id, cd.video_id,
                v.filename, v.original_name, v.category, v.subcategory, v.duration, v.storage_path, v.checksum, v.metadata,
                av.advertiser_id,
                COALESCE(v.metadata->>'analytics_category',
                  CASE
                    WHEN av.advertiser_id IS NOT NULL THEN 'sponsor'
                    ELSE NULL
                  END
                ) as analytics_category
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         LEFT JOIN advertiser_videos av ON av.video_id = v.id AND av.is_primary = true
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
        const videoUrl = getVideoDownloadUrl(deployment.storage_path);

        // deployToSite utilise sendOrQueue, donc si le site est maintenant connecté,
        // la commande sera envoyée immédiatement
        const success = await this.deployToSite(
          deployment.id,
          siteId,
          deployment.video_id,
          videoUrl,
          deployment
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
   * Utilise commandQueueService.sendOrQueue() pour gérer les sites offline
   * (même comportement que update_config et update_software)
   */
  private async deployToSite(
    deploymentId: string,
    siteId: string,
    videoId: string,
    videoUrl: string,
    deployment: DeploymentRow
  ): Promise<boolean> {
    // Utiliser le titre depuis metadata, sinon le nom original du fichier
    const videoTitle = deployment.metadata?.title || deployment.original_name;

    // Vérifier que le checksum est présent (OBLIGATOIRE pour l'intégrité)
    if (!deployment.checksum) {
      logger.error('Cannot deploy video without checksum', { videoId, deploymentId });
      throw new Error('Video checksum is required for deployment');
    }

    const commandData = {
      deploymentId,
      videoId,
      videoUrl,
      filename: deployment.filename,
      originalName: videoTitle,
      category: deployment.category || 'default',
      subcategory: deployment.subcategory || null,
      duration: deployment.duration || 0,
      checksum: deployment.checksum, // Checksum SHA256 OBLIGATOIRE
      // Métadonnées pour le tracking analytics
      sponsorId: deployment.advertiser_id || null,
      analyticsCategory: deployment.analytics_category || null,
    };

    logger.info('Sending deploy_video command via sendOrQueue', {
      siteId,
      deploymentId,
      videoUrl,
      storagePath: deployment.storage_path,
      checksum: deployment.checksum,
    });

    // Utiliser sendOrQueue comme pour update_config et update_software
    // Si le site est connecté, envoie immédiatement
    // Sinon, met en queue pour envoi à la reconnexion
    const result = await commandQueueService.sendOrQueue(
      siteId,
      'deploy_video',
      commandData,
      {
        priority: 3, // Priorité normale pour les vidéos
        description: `Déploiement vidéo: ${deployment.filename}`,
        expiresIn: 7 * 24 * 60 * 60 * 1000, // Expire après 7 jours
      }
    );

    logger.info('Command sendOrQueue result', {
      deploymentId,
      siteId,
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
      message: result.message,
    });

    // Retourne true si envoyé OU mis en queue (sera traité à la reconnexion)
    return result.sent || result.queued;
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
        [Math.round(progress), deploymentId]
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

  /**
   * Vérifie si une erreur peut être retryée
   */
  private isRetryableError(errorMessage: string | null): boolean {
    if (!errorMessage) return false;
    const lowerError = errorMessage.toLowerCase();
    return RETRY_CONFIG.retryableErrors.some(e => lowerError.includes(e.toLowerCase()));
  }

  /**
   * Extrait le compteur de retry depuis le message d'erreur
   * Format: "[retry X/Y] message d'erreur"
   */
  private getRetryCount(errorMessage: string | null): number {
    if (!errorMessage) return 0;
    const match = errorMessage.match(/\[retry (\d+)\/\d+\]/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Marque un déploiement comme échoué avec possibilité de retry
   * @param deploymentId ID du déploiement
   * @param errorMessage Message d'erreur
   * @param allowRetry Si true et que l'erreur est retryable, le déploiement sera retenté
   */
  async markDeploymentFailed(deploymentId: string, errorMessage: string, allowRetry = true): Promise<void> {
    try {
      // Récupérer l'info du déploiement actuel
      const result = await query(
        `SELECT error_message, status FROM content_deployments WHERE id = $1`,
        [deploymentId]
      );

      if (result.rows.length === 0) return;

      const currentError = result.rows[0].error_message as string | null;
      const retryCount = this.getRetryCount(currentError);
      const canRetry = allowRetry && this.isRetryableError(errorMessage) && retryCount < RETRY_CONFIG.maxRetries;

      if (canRetry) {
        // Incrémenter le compteur et garder en pending pour retry
        const newRetryCount = retryCount + 1;
        const newErrorMessage = `[retry ${newRetryCount}/${RETRY_CONFIG.maxRetries}] ${errorMessage}`;

        await query(
          `UPDATE content_deployments
           SET status = 'pending', error_message = $1, progress = 0
           WHERE id = $2`,
          [newErrorMessage, deploymentId]
        );

        logger.warn('Deployment failed, will retry', {
          deploymentId,
          retryCount: newRetryCount,
          maxRetries: RETRY_CONFIG.maxRetries,
          errorMessage,
        });
      } else {
        // Échec définitif
        const finalError = retryCount > 0
          ? `[exhausted ${retryCount}/${RETRY_CONFIG.maxRetries} retries] ${errorMessage}`
          : errorMessage;

        await query(
          `UPDATE content_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [finalError, deploymentId]
        );

        logger.error('Deployment failed permanently', {
          deploymentId,
          retriesExhausted: retryCount >= RETRY_CONFIG.maxRetries,
          errorMessage,
        });
      }
    } catch (error) {
      logger.error('Error marking deployment as failed:', { deploymentId, error });
      // Fallback: marquer comme failed directement
      await this.failDeployment(deploymentId, errorMessage);
    }
  }

  /**
   * Retente les déploiements en échec qui peuvent être retryés.
   * Avec sendOrQueue, les commandes sont mises en queue même si le site est offline.
   */
  async retryFailedDeployments(): Promise<{ retried: number; skipped: number }> {
    try {
      // Récupérer les déploiements en pending qui ont des erreurs (en attente de retry)
      const result = await query(
        `SELECT cd.id, cd.video_id, cd.error_message, cd.target_type, cd.target_id,
                v.filename, v.original_name, v.category, v.subcategory, v.duration, v.storage_path, v.checksum, v.metadata
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         WHERE cd.status = 'pending'
           AND cd.error_message IS NOT NULL
           AND cd.error_message LIKE '[retry%'`,
        []
      );

      let retried = 0;
      let skipped = 0;

      for (const row of result.rows) {
        const deployment = row as unknown as DeploymentRow & { error_message: string };
        const retryCount = this.getRetryCount(deployment.error_message);

        if (retryCount >= RETRY_CONFIG.maxRetries) {
          skipped++;
          continue;
        }

        // Obtenir les sites cibles
        const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);
        const videoUrl = getVideoDownloadUrl(deployment.storage_path);

        for (const target of targets) {
          // sendOrQueue fonctionne que le site soit connecté ou non
          const success = await this.deployToSite(
            deployment.id,
            target.siteId,
            deployment.video_id,
            videoUrl,
            deployment
          );

          if (success) {
            // Passer en in_progress et nettoyer le message d'erreur de retry
            await query(
              `UPDATE content_deployments
               SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
               WHERE id = $1`,
              [deployment.id]
            );
            retried++;
            break;
          }
        }
      }

      if (retried > 0 || skipped > 0) {
        logger.info('Retry failed deployments completed', { retried, skipped });
      }

      return { retried, skipped };
    } catch (error) {
      logger.error('Error retrying failed deployments:', error);
      return { retried: 0, skipped: 0 };
    }
  }

  /**
   * Retente un déploiement spécifique manuellement
   */
  async retryDeployment(deploymentId: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT cd.*, v.filename, v.original_name, v.category, v.subcategory, v.duration, v.storage_path, v.metadata
         FROM content_deployments cd
         JOIN videos v ON cd.video_id = v.id
         WHERE cd.id = $1 AND cd.status = 'failed'`,
        [deploymentId]
      );

      if (result.rows.length === 0) {
        logger.warn('Deployment not found or not in failed state', { deploymentId });
        return false;
      }

      // Remettre en pending pour retry
      await query(
        `UPDATE content_deployments
         SET status = 'pending', error_message = NULL, progress = 0, completed_at = NULL
         WHERE id = $1`,
        [deploymentId]
      );

      // Démarrer le déploiement
      await this.startDeployment(deploymentId);

      logger.info('Deployment manually retried', { deploymentId });
      return true;
    } catch (error) {
      logger.error('Error manually retrying deployment:', { deploymentId, error });
      return false;
    }
  }
}

export default new DeploymentService();
