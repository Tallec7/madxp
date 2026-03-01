/**
 * Orchestrated Deployment Service
 *
 * Gère les déploiements orchestrés : vidéos d'abord, puis configuration.
 * Utilise le système de priorité de pending_commands pour garantir l'ordre.
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import logger from '../config/logger';
import { commandQueueService } from './command-queue.service';
import { draftService } from './draft.service';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import metricsService from './metrics.service';
import { autoResolveSponsorIds } from './sponsor-auto-resolution.service';
import { enrichConfigWithSecondaryVariants } from '../utils/config-secondary-variants';
import {
  OrchestratedDeployment,
  OrchestratedDeploymentStatus,
  SiteConfiguration,
  SiteSponsorDeployment,
  Video,
} from '../types';

// Priorités pour garantir l'ordre d'exécution
const VIDEO_DEPLOYMENT_PRIORITY = 3;  // Vidéos d'abord
const CONFIG_UPDATE_PRIORITY = 5;     // Config ensuite

interface OrchestratedProgress {
  id: string;
  status: OrchestratedDeploymentStatus;
  totalVideos: number;
  videosCompleted: number;
  videosFailed: number;
  configDeployed: boolean;
  overallProgress: number;
  errorMessage: string | null;
  failedVideos: Array<{ id: string; filename: string; error?: string }>;
}

// Interface pour les rows de la DB (typage explicite)
interface OrchestratedDeploymentRow {
  id: string;
  site_id: string;
  draft_id: string | null;
  status: OrchestratedDeploymentStatus;
  total_videos: number;
  videos_completed: number;
  videos_failed: number;
  config_deployed: boolean;
  error_message: string | null;
  failed_video_ids: string[] | null;
  started_by: string | null;
  started_at: Date;
  completed_at: Date | null;
  configuration_snapshot: string | SiteConfiguration;
  // Pour la requête avec JOIN
  failed_filenames?: string[] | null;
}

class OrchestratedDeploymentService {
  /**
   * Lance un déploiement orchestré pour un brouillon
   */
  async startDeployment(
    siteId: string,
    userId: string
  ): Promise<OrchestratedDeployment> {
    // 1. Récupérer et valider le brouillon
    const draft = await draftService.getDraft(siteId);
    if (!draft) {
      throw new Error('Aucun brouillon trouvé pour ce site');
    }

    await draftService.validateDraft(siteId);

    // 2. Récupérer les vidéos à déployer
    const videosToDepoly = await draftService.getVideosToDeployForDraft(siteId);

    // 3. Créer l'entrée orchestrated_deployments
    const orchestratedId = uuidv4();
    const result = await query(
      `INSERT INTO orchestrated_deployments
       (id, site_id, draft_id, status, total_videos, configuration_snapshot, started_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        orchestratedId,
        siteId,
        draft.id,
        videosToDepoly.length > 0 ? 'deploying_videos' : 'deploying_config',
        videosToDepoly.length,
        JSON.stringify(draft.configuration),
        userId,
      ]
    );

    // 4. Mettre à jour le statut du brouillon
    await draftService.updateDraftStatus(siteId, 'deploying');

    logger.info('Orchestrated deployment started', {
      orchestratedId,
      siteId,
      totalVideos: videosToDepoly.length,
    });

    // 5. Queue les déploiements de vidéos (priorité 3)
    if (videosToDepoly.length > 0) {
      await this.queueVideoDeployments(
        orchestratedId,
        siteId,
        videosToDepoly,
        userId
      );
    }

    // 6. Queue la mise à jour de config (priorité 5 = s'exécute après les vidéos)
    await this.queueConfigUpdate(
      orchestratedId,
      siteId,
      draft.configuration,
      userId
    );

    return this.mapRowToDeployment(result.rows[0] as unknown as OrchestratedDeploymentRow);
  }

  /**
   * Queue les déploiements de vidéos
   */
  private async queueVideoDeployments(
    orchestratedId: string,
    siteId: string,
    videos: Video[],
    userId: string
  ): Promise<void> {
    for (const video of videos) {
      // Créer une entrée dans content_deployments liée à l'orchestration
      const deploymentId = uuidv4();
      await query(
        `INSERT INTO content_deployments
         (id, video_id, target_type, target_id, status, deployed_by, orchestrated_deployment_id)
         VALUES ($1, $2, 'site', $3, 'pending', $4, $5)`,
        [deploymentId, video.id, siteId, userId, orchestratedId]
      );

      // Queue la commande deploy_video avec priorité 3
      await commandQueueService.queueCommand(
        siteId,
        'deploy_video',
        {
          deploymentId,
          videoId: video.id,
          filename: video.filename,
          storagePath: video.storage_path,
          category: video.category,
          subcategory: video.subcategory,
          orchestratedDeploymentId: orchestratedId,
        },
        {
          priority: VIDEO_DEPLOYMENT_PRIORITY,
          description: `Déploiement vidéo: ${video.filename}`,
          createdBy: userId,
          expiresIn: 7 * 24 * 60 * 60 * 1000,  // 7 jours
        }
      );

      logger.info('Video deployment queued', {
        orchestratedId,
        videoId: video.id,
        filename: video.filename,
      });
    }
  }

  /**
   * Récupère les sponsors du site formatés pour le déploiement Pi
   */
  private async getSiteSponsorsForDeployment(siteId: string): Promise<SiteSponsorDeployment[]> {
    const rows = await siteSponsorRepository.getSponsorsForDeployment(siteId);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      display_name: row.name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      logoUrl: row.logo_url,
      source: row.source as 'local' | 'neopro',
      videoFilenames: row.video_filenames || [],
      isActive: true,
    }));
  }

  /**
   * Extrait les associations sponsor-vidéo depuis le config JSON (sponsors[] + timeCategories[].loopVideos[])
   * et les synchronise dans la table site_sponsor_videos pour maintenir la cohérence.
   */
  private async syncSponsorVideoAssociations(siteId: string, configuration: SiteConfiguration): Promise<void> {
    const associations = new Map<string, Set<string>>(); // site_sponsor_id → Set<video_path>

    // Extraire depuis sponsors[] (boucle par défaut)
    for (const video of (configuration.sponsors || [])) {
      if (video.site_sponsor_id && video.path) {
        if (!associations.has(video.site_sponsor_id)) {
          associations.set(video.site_sponsor_id, new Set());
        }
        const filename = video.path.split('/').pop() || video.path;
        associations.get(video.site_sponsor_id)!.add(filename);
      }
    }

    // Extraire depuis timeCategories[].loopVideos[] (boucles par phase)
    for (const tc of (configuration.timeCategories || [])) {
      for (const video of (tc.loopVideos || [])) {
        if (video.site_sponsor_id && video.path) {
          if (!associations.has(video.site_sponsor_id)) {
            associations.set(video.site_sponsor_id, new Set());
          }
          const filename = video.path.split('/').pop() || video.path;
          associations.get(video.site_sponsor_id)!.add(filename);
        }
      }
    }

    if (associations.size === 0) return;

    let synced = 0;
    for (const [sponsorId, filenames] of associations) {
      for (const filename of filenames) {
        try {
          await siteSponsorRepository.addVideo(sponsorId, null, filename);
          synced++;
        } catch {
          // Non-fatal : le sponsor_id peut ne pas exister en DB (UUID invalide dans le config)
          metricsService.recordSponsorResolutionFailure('sync_videos');
        }
      }
    }

    if (synced > 0) {
      logger.info('Synced sponsor-video associations from config', { siteId, synced });
    }
  }

  /**
   * Queue la mise à jour de configuration
   */
  private async queueConfigUpdate(
    orchestratedId: string,
    siteId: string,
    configuration: SiteConfiguration,
    userId: string
  ): Promise<void> {
    // Récupérer les sponsors du site pour les envoyer au Pi
    const siteSponsors = await this.getSiteSponsorsForDeployment(siteId);

    // Auto-résolution : injecter site_sponsor_id dans toutes les vidéos de la config
    const { configuration: enrichedConfig, resolved, unresolved } =
      await autoResolveSponsorIds(siteId, configuration);

    if (resolved > 0 || unresolved > 0) {
      logger.info('Sponsor auto-resolution in deployment', {
        siteId, orchestratedId, resolved, unresolved,
      });
    }

    // Enrichir avec les variants secondaires depuis la base de données
    try {
      const { enrichedCount } = await enrichConfigWithSecondaryVariants(enrichedConfig);
      if (enrichedCount > 0) {
        logger.info('Secondary variants enriched in deployment config', {
          siteId, orchestratedId, enrichedCount,
        });
        metricsService.recordSecondaryVariantEnrichment('success', 'deployment', enrichedCount);
      } else {
        metricsService.recordSecondaryVariantEnrichment('empty', 'deployment');
      }
    } catch (variantError) {
      logger.warn('Secondary variant enrichment failed (non-fatal)', {
        siteId, orchestratedId, error: (variantError as Error).message,
      });
      metricsService.recordSecondaryVariantEnrichment('failed', 'deployment');
    }

    // Préparer le payload pour update_config (utilise la config enrichie)
    const neoProContent = {
      sponsors: enrichedConfig.sponsors,
      categories: enrichedConfig.categories,
      timeCategories: enrichedConfig.timeCategories,
      categoryMappings: enrichedConfig.categoryMappings,
      liveScoreEnabled: enrichedConfig.liveScoreEnabled,
      scoreOverlay: enrichedConfig.scoreOverlay,
      siteSponsors,
    };

    logger.info('Including site sponsors in deployment', {
      siteId,
      sponsorCount: siteSponsors.length,
    });

    metricsService.recordSponsorSync('included', siteSponsors.length);

    // Synchroniser les associations sponsor-vidéo depuis la config enrichie vers site_sponsor_videos
    // (utilise enrichedConfig car l'auto-résolution vient d'y injecter les site_sponsor_id)
    await this.syncSponsorVideoAssociations(siteId, enrichedConfig);

    await commandQueueService.queueCommand(
      siteId,
      'update_config',
      {
        neoProContent,
        mode: 'merge',
        orchestratedDeploymentId: orchestratedId,
      },
      {
        priority: CONFIG_UPDATE_PRIORITY,
        description: 'Mise à jour configuration (après vidéos)',
        createdBy: userId,
        expiresIn: 7 * 24 * 60 * 60 * 1000,  // 7 jours
      }
    );

    logger.info('Config update queued', {
      orchestratedId,
      siteId,
    });
  }

  /**
   * Callback quand un déploiement vidéo est terminé
   */
  async onVideoDeploymentComplete(
    orchestratedId: string,
    videoId: string,
    success: boolean,
    _errorMessage?: string
  ): Promise<void> {
    // Mettre à jour le compteur
    if (success) {
      await query(
        `UPDATE orchestrated_deployments
         SET videos_completed = videos_completed + 1
         WHERE id = $1`,
        [orchestratedId]
      );
    } else {
      await query(
        `UPDATE orchestrated_deployments
         SET videos_failed = videos_failed + 1,
             failed_video_ids = array_append(failed_video_ids, $2::uuid)
         WHERE id = $1`,
        [orchestratedId, videoId]
      );
    }

    logger.info('Video deployment completed', {
      orchestratedId,
      videoId,
      success,
    });

    // Vérifier si tous les déploiements vidéo sont terminés
    await this.checkVideoDeploymentsComplete(orchestratedId);
  }

  /**
   * Vérifie si tous les déploiements vidéo sont terminés
   */
  private async checkVideoDeploymentsComplete(orchestratedId: string): Promise<void> {
    const result = await query(
      `SELECT * FROM orchestrated_deployments WHERE id = $1`,
      [orchestratedId]
    );

    if (result.rows.length === 0) return;

    const deployment = result.rows[0] as unknown as OrchestratedDeploymentRow;
    const totalProcessed = deployment.videos_completed + deployment.videos_failed;

    if (totalProcessed >= deployment.total_videos) {
      // Tous les déploiements vidéo sont terminés
      if (deployment.videos_failed > 0 && deployment.videos_completed === 0) {
        // Tous les déploiements ont échoué
        await this.markDeploymentFailed(
          orchestratedId,
          'Tous les déploiements vidéo ont échoué'
        );
      } else {
        // Au moins quelques vidéos ont réussi, passer à deploying_config
        await query(
          `UPDATE orchestrated_deployments SET status = 'deploying_config' WHERE id = $1`,
          [orchestratedId]
        );

        logger.info('All video deployments complete, waiting for config update', {
          orchestratedId,
          videosCompleted: deployment.videos_completed,
          videosFailed: deployment.videos_failed,
        });
      }
    }
  }

  /**
   * Callback quand la configuration est déployée
   */
  async onConfigDeploymentComplete(
    orchestratedId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const result = await query(
      `SELECT * FROM orchestrated_deployments WHERE id = $1`,
      [orchestratedId]
    );

    if (result.rows.length === 0) return;

    const deployment = result.rows[0] as unknown as OrchestratedDeploymentRow;

    if (success) {
      // Déterminer le statut final
      const finalStatus: OrchestratedDeploymentStatus =
        deployment.videos_failed > 0 ? 'partial_failure' : 'completed';

      await query(
        `UPDATE orchestrated_deployments
         SET status = $1, config_deployed = true, completed_at = NOW()
         WHERE id = $2`,
        [finalStatus, orchestratedId]
      );

      // Mettre à jour le brouillon
      await query(
        `UPDATE config_drafts SET status = 'deployed' WHERE id = $1`,
        [deployment.draft_id]
      );

      logger.info('Orchestrated deployment completed', {
        orchestratedId,
        status: finalStatus,
      });
    } else {
      await this.markDeploymentFailed(orchestratedId, errorMessage || 'Échec du déploiement de la configuration');
    }
  }

  /**
   * Marque un déploiement comme échoué
   */
  private async markDeploymentFailed(
    orchestratedId: string,
    errorMessage: string
  ): Promise<void> {
    await query(
      `UPDATE orchestrated_deployments
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [errorMessage, orchestratedId]
    );

    // Récupérer le draft_id pour mettre à jour son statut
    const result = await query(
      `SELECT draft_id FROM orchestrated_deployments WHERE id = $1`,
      [orchestratedId]
    );

    if (result.rows[0]?.draft_id) {
      await query(
        `UPDATE config_drafts SET status = 'failed' WHERE id = $1`,
        [result.rows[0].draft_id]
      );
    }

    logger.error('Orchestrated deployment failed', {
      orchestratedId,
      errorMessage,
    });
  }

  /**
   * Récupère la progression d'un déploiement
   */
  async getDeploymentProgress(orchestratedId: string): Promise<OrchestratedProgress | null> {
    const result = await query(
      `SELECT od.*, array_agg(v.filename) FILTER (WHERE v.id IS NOT NULL) as failed_filenames
       FROM orchestrated_deployments od
       LEFT JOIN videos v ON v.id = ANY(od.failed_video_ids)
       WHERE od.id = $1
       GROUP BY od.id`,
      [orchestratedId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as unknown as OrchestratedDeploymentRow;

    // Calculer la progression globale
    let overallProgress = 0;
    if (row.total_videos > 0) {
      const videoProgress = ((row.videos_completed + row.videos_failed) / row.total_videos) * 80;
      const configProgress = row.config_deployed ? 20 : 0;
      overallProgress = Math.round(videoProgress + configProgress);
    } else {
      overallProgress = row.config_deployed ? 100 : (row.status === 'deploying_config' ? 50 : 0);
    }

    const failedVideos: Array<{ id: string; filename: string }> = [];
    const failedIds = row.failed_video_ids || [];
    const failedNames = row.failed_filenames || [];
    if (failedIds.length > 0) {
      for (let i = 0; i < failedIds.length; i++) {
        failedVideos.push({
          id: failedIds[i],
          filename: failedNames[i] || 'Unknown',
        });
      }
    }

    return {
      id: row.id,
      status: row.status,
      totalVideos: row.total_videos,
      videosCompleted: row.videos_completed,
      videosFailed: row.videos_failed,
      configDeployed: row.config_deployed,
      overallProgress,
      errorMessage: row.error_message,
      failedVideos,
    };
  }

  /**
   * Récupère un déploiement par ID
   */
  async getDeployment(orchestratedId: string): Promise<OrchestratedDeployment | null> {
    const result = await query(
      `SELECT * FROM orchestrated_deployments WHERE id = $1`,
      [orchestratedId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDeployment(result.rows[0] as unknown as OrchestratedDeploymentRow);
  }

  /**
   * Récupère les déploiements actifs pour un site
   */
  async getActiveDeployments(siteId: string): Promise<OrchestratedDeployment[]> {
    const result = await query(
      `SELECT * FROM orchestrated_deployments
       WHERE site_id = $1 AND status NOT IN ('completed', 'failed', 'partial_failure')
       ORDER BY started_at DESC`,
      [siteId]
    );

    return result.rows.map(row => this.mapRowToDeployment(row as unknown as OrchestratedDeploymentRow));
  }

  /**
   * Convertit une row de base de données en OrchestratedDeployment
   */
  private mapRowToDeployment(row: OrchestratedDeploymentRow): OrchestratedDeployment {
    return {
      id: row.id,
      site_id: row.site_id,
      draft_id: row.draft_id,
      status: row.status,
      total_videos: row.total_videos,
      videos_completed: row.videos_completed,
      videos_failed: row.videos_failed,
      config_deployed: row.config_deployed,
      error_message: row.error_message,
      failed_video_ids: row.failed_video_ids || [],
      started_by: row.started_by,
      started_at: row.started_at,
      completed_at: row.completed_at,
      configuration_snapshot: typeof row.configuration_snapshot === 'string'
        ? JSON.parse(row.configuration_snapshot)
        : row.configuration_snapshot,
    };
  }
}

export const orchestratedDeploymentService = new OrchestratedDeploymentService();
export default orchestratedDeploymentService;
