import logger from '../../config/logger';
import {
  DeliverySite,
  DeliveryStrategy,
} from './delivery-strategy.interface';
import { piSocketStrategy } from './pi-socket.strategy';
import { saasDirectStrategy } from './saas-direct.strategy';

/**
 * ADR-069 — Registry des stratégies de livraison.
 *
 * Feature flag `DELIVERY_STRATEGY_ENABLED` :
 *  - `false` (défaut) : `deployment.service.ts` conserve son chemin historique
 *    (smoke test SaaS short-circuit inchangé).
 *  - `true` : `startDeployment` délègue au registry. Rollout staging → 1 site
 *    prod → tous, puis suppression du chemin legacy (étape 7 de l'ADR).
 */

const DEFAULT_STRATEGIES: DeliveryStrategy[] = [
  saasDirectStrategy,
  piSocketStrategy,
];

class DeliveryStrategyRegistry {
  private strategies: DeliveryStrategy[] = [...DEFAULT_STRATEGIES];

  isEnabled(): boolean {
    return process.env.DELIVERY_STRATEGY_ENABLED === 'true';
  }

  register(strategy: DeliveryStrategy): void {
    this.strategies.push(strategy);
  }

  resolve(site: DeliverySite): DeliveryStrategy {
    const match = this.strategies.find(s => s.canHandle(site));
    if (!match) {
      logger.error('No delivery strategy matches site', {
        siteId: site.siteId,
        siteType: site.siteType,
      });
      throw new Error(
        `Aucune stratégie de livraison pour siteType="${site.siteType}"`
      );
    }
    return match;
  }

  list(): ReadonlyArray<DeliveryStrategy> {
    return this.strategies;
  }

  /** Test helper — restaure les stratégies par défaut. */
  reset(): void {
    this.strategies = [...DEFAULT_STRATEGIES];
  }
}

export const deliveryStrategyRegistry = new DeliveryStrategyRegistry();
export default deliveryStrategyRegistry;
