/**
 * Heartbeat SaaS — rafraîchit `last_seen_at` pendant qu'un site diffuse.
 *
 * ## Le problème
 *
 * Un site `site_type='saas'` n'a pas d'agent Pi : son `last_seen_at` n'était posé
 * qu'une fois, au `saas-register` (connexion du navigateur), et n'était **jamais**
 * rafraîchi ensuite. Aucun heartbeat n'existait côté central — la TV émet bien
 * `player-state` toutes les 5 s, mais c'est un event LAN sans listener central.
 *
 * Conséquence : tout ce qui juge la présence sur des seuils temporels
 * (`ONLINE_THRESHOLD_SECONDS = 90`) voyait un club **hors ligne** trois minutes
 * après l'allumage de son écran, et l'historique de présence était faux.
 *
 * ## Le choix : battre côté SERVEUR, pas côté client
 *
 * Le serveur sait déjà qui est connecté (`getConnectedSaasSiteIds`, alimenté par
 * les sockets `saas-tv`). Faire battre le serveur plutôt que demander au
 * navigateur de ré-émettre `saas-register` a trois avantages :
 *
 *  - **aucun déploiement client** : les navigateurs déjà ouverts en bénéficient
 *    immédiatement, sans attendre qu'un club recharge sa page ;
 *  - **une seule requête batchée** par tick, quel que soit le nombre de sites,
 *    au lieu d'un UPDATE par client ;
 *  - **pas de rediffusion parasite** : `saas-register` ré-émet `displays-changed`
 *    à toute la room, ce qui en ferait une tempête de broadcast à chaque battement.
 *
 * ## Cadence
 *
 * 30 s, alignée sur le Pi — le seuil `online` de 90 s vaut « 3 battements manqués
 * max ». Un tick raté laisse donc le site en ligne.
 *
 * Le heartbeat ne CRÉE jamais de présence : il ne touche que les sites qui ont un
 * écran connecté à l'instant du tick. Un site éteint n'est jamais rafraîchi, et le
 * `status='offline'` posé au disconnect n'est pas contredit.
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { dbCircuitBreaker } from './db-circuit-breaker.service';

/** Cadence du battement (ms). Alignée sur le Pi : seuil online = 3 battements. */
export const SAAS_HEARTBEAT_INTERVAL_MS = 30_000;

/** Source des sites SaaS présents — injectée pour rester testable sans socket.io. */
export type ConnectedSaasSiteIdsProvider = () => string[];

class SaasHeartbeatService {
  private timer: NodeJS.Timeout | null = null;
  private provider: ConnectedSaasSiteIdsProvider | null = null;
  private running = false;

  /**
   * Démarre le battement. `provider` fournit les sites ayant un écran connecté
   * (en production : `socketService.getConnectedSaasSiteIds`).
   */
  start(provider: ConnectedSaasSiteIdsProvider, intervalMs = SAAS_HEARTBEAT_INTERVAL_MS): void {
    if (this.timer) return;
    this.provider = provider;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Ne pas retenir le process au shutdown (même contrat que les autres timers).
    this.timer.unref?.();
    logger.info('SaaS heartbeat started', { intervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.provider = null;
    logger.info('SaaS heartbeat stopped');
  }

  /**
   * Un battement : rafraîchit `last_seen_at` des sites SaaS actuellement à l'écran.
   * Ne lève jamais — un heartbeat qui casse ne doit pas faire tomber le process.
   *
   * @returns le nombre de sites rafraîchis (0 si rien à faire ou DB indisponible).
   */
  async tick(): Promise<number> {
    if (!this.provider || this.running) return 0;
    this.running = true;

    try {
      const siteIds = this.provider();
      if (siteIds.length === 0) return 0;

      if (!dbCircuitBreaker.isAvailable()) {
        logger.debug('SaaS heartbeat skipped — DB circuit breaker open');
        return 0;
      }

      // Un seul UPDATE batché. Le filtre `site_type = 'saas'` est une ceinture :
      // le provider ne remonte que des sockets `saas-tv`, mais on ne veut sous
      // aucun prétexte réanimer un site Pi depuis ce chemin.
      const result = await query(
        `UPDATE sites
         SET last_seen_at = NOW(), status = 'online'
         WHERE id = ANY($1::uuid[]) AND site_type = 'saas'`,
        [siteIds]
      );
      dbCircuitBreaker.recordSuccess();

      const updated = result.rowCount ?? 0;
      if (updated > 0) {
        logger.debug('SaaS heartbeat', { sites: updated });
      }
      return updated;
    } catch (error) {
      dbCircuitBreaker.recordFailure(error instanceof Error ? error : undefined);
      logger.error('SaaS heartbeat failed', { error });
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Exposé pour les tests / le diagnostic. */
  isRunning(): boolean {
    return this.timer !== null;
  }
}

export const saasHeartbeatService = new SaasHeartbeatService();
export default saasHeartbeatService;
