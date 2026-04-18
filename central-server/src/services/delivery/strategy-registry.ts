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
 * `deployment.service.ts` délègue toujours au registry depuis la suppression
 * du chemin legacy (étape 7 de l'ADR). Le flag `DELIVERY_STRATEGY_ENABLED`
 * n'existe plus.
 */

const DEFAULT_STRATEGIES: DeliveryStrategy[] = [
  saasDirectStrategy,
  piSocketStrategy,
];

class DeliveryStrategyRegistry {
  private strategies: DeliveryStrategy[] = [...DEFAULT_STRATEGIES];

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
