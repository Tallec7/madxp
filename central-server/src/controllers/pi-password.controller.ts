import { Response } from 'express';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import { piPasswordRepository } from '../repositories/pi-password.repository';
import { piPasswordService } from '../services/pi-password.service';
import { commandQueueService } from '../services/command-queue.service';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * ADR-132 — Contrôleur pour la rotation OTA du mot de passe système `pi`.
 *
 * Trois endpoints :
 *   POST /api/fleet/rotate-pi-password          → super_admin déclenche la rotation
 *   GET  /api/sites/:id/pi-system-password      → Pi pull le hash (authenticateSiteApiKey)
 *   POST /api/sites/:id/pi-password-applied     → Pi acquitte (authenticateSiteApiKey)
 */

/**
 * POST /api/fleet/rotate-pi-password (super_admin uniquement)
 *
 * Body: { password: string }
 * - Génère le hash SHA-512-crypt
 * - Le chiffre AES-256-GCM et le stocke dans toutes les lignes sites (site_type = 'pi')
 * - Set pi_system_password_pending = true sur toute la flotte Pi
 * - Notifie via sendOrQueue('change_pi_password') les Pi actuellement connectés
 */
export const rotateFleetPiPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body as { password: string };

    let hash: string;
    try {
      hash = piPasswordService.generateHash(password);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid password' });
      return;
    }

    const updatedCount = await piPasswordRepository.setFleetPendingAndStore(hash);

    logger.info('pi-password: fleet rotation triggered (ADR-132)', {
      userId: req.user?.id,
      sitesPending: updatedCount,
    });

    // Notifie les Pi connectés pour appliquer immédiatement.
    // Les Pi offline appliqueront à la prochaine reconnexion via syncPiPasswordFromCloud().
    // sendOrQueue est best-effort : un échec ne bloque pas la rotation (le flag pending persiste).
    let dispatchErrors = 0;
    const { rows: piSites } = await query<{ id: string }>(
      `SELECT id FROM sites WHERE site_type = 'pi' AND pi_system_password_pending = TRUE`
    );
    for (const site of piSites) {
      try {
        await commandQueueService.sendOrQueue(site.id, 'change_pi_password', {});
      } catch {
        dispatchErrors++;
      }
    }

    if (dispatchErrors > 0) {
      logger.warn('pi-password: some sendOrQueue calls failed (Pi will sync at next reconnect)', {
        dispatchErrors,
      });
    }

    res.json({
      success: true,
      sitesPending: updatedCount,
      dispatchErrors,
    });
  } catch (error) {
    logger.error('rotateFleetPiPassword error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/sites/:id/pi-system-password (authenticateSiteApiKey)
 *
 * Retourne le hash SHA-512-crypt si pi_system_password_pending = true.
 * 204 No Content si aucune rotation en attente (Pi ne fait rien).
 */
export const getPiSystemPassword = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.siteId !== id) {
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }

    const hash = await piPasswordRepository.getPendingHashForSite(id);
    if (!hash) {
      // 204 = "pas de rotation en attente", le Pi ignore et continue
      res.status(204).end();
      return;
    }

    res.json({ hash, pending: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/PI_PASSWORD_ENCRYPTION_KEY.*missing/i.test(msg)) {
      logger.error('getPiSystemPassword: PI_PASSWORD_ENCRYPTION_KEY not configured', { siteId: req.params.id });
      res.status(503).json({ error: 'Password rotation not configured on server (ADR-132)' });
      return;
    }
    logger.error('getPiSystemPassword error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/sites/:id/pi-password-applied (authenticateSiteApiKey)
 *
 * Acquittement Pi → le Pi a appliqué le nouveau mot de passe avec succès.
 * Set pi_system_password_pending = false pour ce site.
 */
export const markPiPasswordApplied = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.siteId !== id) {
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }

    await piPasswordRepository.markApplied(id);
    logger.info('pi-password: Pi acknowledged password rotation (ADR-132)', { siteId: id });
    res.json({ success: true });
  } catch (error) {
    logger.error('markPiPasswordApplied error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};
