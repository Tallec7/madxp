/**
 * License Handler — Sends subscription/license status to connected Pi.
 *
 * Called after each sync_local_state to ensure the Pi always has
 * a fresh license status. Handles auto-unblock for sites that
 * reconnect after suspension.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';
import { SocketContext } from './socket-context';

// Lazy import to avoid circular dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let subscriptionService: any = null;

const getSubscriptionService = async () => {
  if (!subscriptionService) {
    const module = await import('../services/subscription.service');
    subscriptionService = module.subscriptionService;
  }
  return subscriptionService;
};

/**
 * Send license status to a connected Raspberry Pi.
 * Computes the subscription status and handles auto-unblock.
 */
export async function sendLicenseStatus(
  ctx: SocketContext,
  siteId: string
): Promise<void> {
  try {
    const socket = ctx.connectedSites.get(siteId);
    if (!socket || !socket.connected) {
      return; // Pas de connexion active
    }

    // Récupérer les données du site pour calculer le statut
    const siteResult = await query<{
      id: string;
      subscription_start: Date | null;
      subscription_end: Date | null;
      subscription_plan: string;
      suspended: boolean;
      suspension_reason: string | null;
      suspension_date: Date | null;
      last_seen_at: Date | null;
    }>(
      `SELECT id, subscription_start, subscription_end, subscription_plan,
              suspended, suspension_reason, suspension_date, last_seen_at
       FROM sites WHERE id = $1`,
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return;
    }

    const site = siteResult.rows[0];

    // Calculer le statut de licence via le service subscription
    const subService = await getSubscriptionService();
    const licenseStatus = await subService.computeLicenseStatus({
      id: site.id,
      subscription_start: site.subscription_start?.toISOString() || null,
      subscription_end: site.subscription_end?.toISOString() || null,
      subscription_plan: site.subscription_plan,
      suspended: site.suspended,
      suspension_reason: site.suspension_reason,
      suspension_date: site.suspension_date?.toISOString() || null,
      suspension_note: null,
      last_seen_at: site.last_seen_at?.toISOString() || null,
    });

    // Envoyer au Pi
    socket.emit('license_status', licenseStatus);
    metricsService.recordLicenseStatusPush('success');

    logger.info('License status sent to site', {
      siteId,
      status: (licenseStatus as Record<string, unknown>).status,
      reason: (licenseStatus as Record<string, unknown>).reason,
      daysLeft: (licenseStatus as Record<string, unknown>).days_left,
    });

    // Vérifier si le site peut être auto-débloqué
    if (site.suspended && (licenseStatus as Record<string, unknown>).can_auto_unblock) {
      const autoUnblocked = await subService.checkAutoUnblock({
        id: site.id,
        subscription_start: site.subscription_start?.toISOString() || null,
        subscription_end: site.subscription_end?.toISOString() || null,
        subscription_plan: site.subscription_plan,
        suspended: site.suspended,
        suspension_reason: site.suspension_reason,
        suspension_date: site.suspension_date?.toISOString() || null,
        suspension_note: null,
        last_seen_at: site.last_seen_at?.toISOString() || null,
      });

      if (autoUnblocked) {
        logger.info('Site auto-unblocked after connection', { siteId, reason: site.suspension_reason });
        // Renvoyer le statut mis à jour
        const newStatus = await subService.computeLicenseStatus({
          id: site.id,
          subscription_start: site.subscription_start?.toISOString() || null,
          subscription_end: site.subscription_end?.toISOString() || null,
          subscription_plan: site.subscription_plan,
          suspended: false,
          suspension_reason: null,
          suspension_date: null,
          suspension_note: null,
          last_seen_at: new Date().toISOString(),
        });
        socket.emit('license_status', newStatus);
      }
    }
  } catch (error) {
    metricsService.recordLicenseStatusPush('failed');
    logger.error('Error sending license status:', { siteId, error });
  }
}
