import logger from '../../config/logger';
import {
  DeliveryContext,
  DeliveryResult,
  DeliverySite,
  DeliveryStrategy,
} from './delivery-strategy.interface';

/**
 * ADR-069 — Livraison SaaS : pas de Pi, vidéo servie directement via URL FTP.
 *
 * Marque le site comme livré avec succès immédiatement. L'orchestrateur
 * (`deployment.service.ts`) se charge de passer le déploiement en `completed`
 * quand TOUS les sites cibles sont SaaS.
 */
class SaasDirectStrategy implements DeliveryStrategy {
  readonly name = 'saas-direct';

  canHandle(site: DeliverySite): boolean {
    return site.siteType === 'saas';
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { deploymentId, site } = context;

    logger.info('SaasDirectStrategy: video deployment completed immediately (no Pi)', {
      deploymentId,
      siteId: site.siteId,
      siteName: site.siteName,
    });

    return {
      success: true,
      outcome: 'completed',
      message: 'SaaS short-circuit',
    };
  }
}

export const saasDirectStrategy = new SaasDirectStrategy();
export default saasDirectStrategy;
