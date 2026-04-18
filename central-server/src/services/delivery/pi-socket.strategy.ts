import logger from '../../config/logger';
import socketService from '../socket.service';
import { commandQueueService } from '../command-queue.service';
import { getVideoUrl } from '../storage.service';
import { siteSponsorRepository } from '../../repositories/site-sponsor.repository';
import { videoVariantRepository } from '../../repositories/video-variant.repository';
import { query } from '../../config/database';
import {
  DeliveryContext,
  DeliveryResult,
  DeliverySite,
  DeliveryStrategy,
} from './delivery-strategy.interface';

/**
 * ADR-069 — Livraison vers un Raspberry Pi via Socket.IO + commandQueue.
 *
 * Extrait de `deployment.service.ts#deployToSite`. La logique transverse
 * (retry policy, DB state machine, progress tracking) reste dans le service.
 */
class PiSocketStrategy implements DeliveryStrategy {
  readonly name = 'pi-socket';

  canHandle(site: DeliverySite): boolean {
    return site.siteType !== 'saas';
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { deploymentId, site, deployment, videoUrl } = context;
    const videoTitle = deployment.metadata?.title || deployment.original_name;

    if (!deployment.checksum) {
      logger.error('Cannot deploy video without checksum', {
        videoId: deployment.video_id,
        deploymentId,
      });
      throw new Error(
        `La vidéo "${videoTitle}" est incomplète (fichier absent ou upload échoué). Supprimez-la et re-uploadez.`
      );
    }

    let siteSponsorId: string | null = null;
    try {
      siteSponsorId = await siteSponsorRepository.resolveSiteSponsorId(
        deployment.video_id,
        site.siteId
      );
    } catch {
      // Non-bloquant
    }

    let secondaryVariant: {
      filename: string;
      storagePath: string;
      checksum: string | null;
      videoUrl: string;
      width: number | null;
      height: number | null;
      duration: number | null;
    } | null = null;

    try {
      const variant = await videoVariantRepository.findByVideoAndDisplay(
        deployment.video_id,
        'secondary'
      );
      if (variant) {
        secondaryVariant = {
          filename: variant.filename,
          storagePath: variant.storage_path,
          checksum: variant.checksum,
          videoUrl: getVideoUrl(variant.storage_path),
          width: variant.width,
          height: variant.height,
          duration: variant.duration ? parseFloat(String(variant.duration)) : null,
        };
      }
    } catch (secondaryError) {
      logger.debug('Secondary variant lookup failed (non-blocking)', {
        videoId: deployment.video_id,
        siteId: site.siteId,
        error: secondaryError,
      });
    }

    const commandData = {
      deploymentId,
      videoId: deployment.video_id,
      videoUrl,
      filename: deployment.filename,
      originalName: videoTitle,
      category: deployment.category || 'default',
      subcategory: deployment.subcategory || null,
      duration: deployment.duration || 0,
      checksum: deployment.checksum,
      sponsorId: deployment.advertiser_id || null,
      analyticsCategory: deployment.analytics_category || null,
      siteSponsorId,
      secondaryVariant,
    };

    const isConnected = socketService.isConnected(site.siteId);
    logger.info('PiSocketStrategy: sending deploy_video via sendOrQueue', {
      siteId: site.siteId,
      deploymentId,
      videoUrl,
      storagePath: deployment.storage_path,
      checksum: deployment.checksum,
      isConnected,
    });

    const result = await commandQueueService.sendOrQueue(
      site.siteId,
      'deploy_video',
      commandData,
      {
        priority: 3,
        description: `Déploiement vidéo: ${deployment.filename}`,
        expiresIn: 7 * 24 * 60 * 60 * 1000,
      }
    );

    logger.info('PiSocketStrategy: sendOrQueue result', {
      deploymentId,
      siteId: site.siteId,
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
      message: result.message,
    });

    if (secondaryVariant && (result.sent || result.queued)) {
      try {
        await query(
          `UPDATE content_deployments
           SET has_secondary_variant = true
           WHERE id = $1 AND has_secondary_variant = false`,
          [deploymentId]
        );
      } catch (flagError) {
        logger.debug('Failed to set has_secondary_variant flag', {
          deploymentId,
          error: flagError instanceof Error ? flagError.message : String(flagError),
        });
      }
    }

    if (result.sent) {
      return { success: true, outcome: 'sent', message: result.message };
    }
    if (result.queued) {
      return { success: true, outcome: 'queued', message: result.message };
    }
    return { success: false, outcome: 'failed', message: result.message };
  }
}

export const piSocketStrategy = new PiSocketStrategy();
export default piSocketStrategy;
