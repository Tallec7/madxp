/**
 * CRON task — Drain les commandes en queue pour tous les sites connectés.
 *
 * Phase 14 (incident 2026-05-09) — Bug racine :
 *   `commandQueueService.processPendingCommands(siteId)` n'est appelé que
 *   UNE FOIS, au moment de l'authentication socket (`authenticateAgent`).
 *   Toute commande queueée APRÈS l'authentication (ex: backfill local,
 *   admin tool en prod, INSERT manuel) reste en DB tant que le Pi ne se
 *   reconnecte pas. Vu en prod sur Mangin-Beaulieu : commande
 *   `receiver_assignment_updated` queueée à 14:47, attempts=0, jamais
 *   tentée → Fire Stick coincé sur la wait page.
 *
 * Approche :
 *   Toutes les 30s, itère `socketService.getConnectedSites()` et appelle
 *   `processPendingCommands(siteId)` pour chaque. Pour les sites sans
 *   queue, c'est un SELECT vide (~ms). Pour ceux avec, ça envoie via
 *   socket.
 *
 * Smoke-test enforced (`smoke-pending-commands-drain`) :
 * - task_type 'pending_commands_drain' dans `check_task_type`
 * - executor enregistré dans le dispatch table de cron-scheduler
 * - métrique `neopro_pending_commands_drain_total` exposée
 * - schedule seed dans la migration
 */

import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';
import socketService from '../services/socket.service';
import { getCommandQueueService } from '../services/command-queue.service';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executePendingCommandsDrainTask(
  _schedule: RecurringSchedule
): Promise<ExecutionResult> {
  const siteIds = socketService.getConnectedSites();

  if (siteIds.length === 0) {
    return {
      success: true,
      message: 'No connected sites — nothing to drain',
      details: { sitesChecked: 0, drained: 0 },
    };
  }

  const queueService = await getCommandQueueService();

  let totalProcessed = 0;
  let totalFailed = 0;
  let sitesWithQueue = 0;
  let sitesErrored = 0;

  for (const siteId of siteIds) {
    try {
      const result = await queueService.processPendingCommands(siteId);
      if (result.processed > 0 || result.failed > 0) {
        sitesWithQueue += 1;
        totalProcessed += result.processed;
        totalFailed += result.failed;
        metricsService.recordPendingCommandsDrain({
          siteId,
          processed: result.processed,
          failed: result.failed,
        });
      }
    } catch (err) {
      sitesErrored += 1;
      logger.error('pending_commands_drain: error processing site', {
        siteId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sitesWithQueue > 0 || sitesErrored > 0) {
    logger.info('pending_commands_drain: completed', {
      sitesChecked: siteIds.length,
      sitesWithQueue,
      sitesErrored,
      totalProcessed,
      totalFailed,
    });
  }

  return {
    success: sitesErrored === 0,
    message:
      sitesErrored === 0
        ? `Drained ${totalProcessed} commands across ${sitesWithQueue}/${siteIds.length} sites`
        : `Drained ${totalProcessed} commands; ${sitesErrored} sites errored`,
    details: {
      sitesChecked: siteIds.length,
      sitesWithQueue,
      sitesErrored,
      processed: totalProcessed,
      failed: totalFailed,
    },
  };
}
