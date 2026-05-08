/**
 * Backfill `receiver_assignment_updated` pour resync `configuration.json.displays`
 * sur la flotte Pi — ADR-114.
 *
 * Contexte : avant la PR #903, la commande `receiver_assignment_updated` n'écrivait
 * que dans `.receivers-cache.json` côté Pi, sans propager `displays` à
 * `configuration.json` (la source lue par `captive.js` whoami). Les sites avec
 * une assignation MAC déjà saisie dans le dashboard avant le déploiement de la
 * write-through ont une DB cloud à jour mais un Pi avec `configuration.json.displays`
 * désync.
 *
 * Ce script itère tous les sites avec ≥ 1 display assigné (i.e. au moins une entry
 * `displays[i].receiver.mac`) et émet `receiver_assignment_updated` avec le payload
 * actuel via `commandQueueService.sendOrQueue`. Si le Pi est connecté, la commande
 * part immédiatement ; sinon elle est queuée et délivrée à la prochaine reconnexion.
 *
 * Idempotent : la commande peut être émise N fois sans effet de bord (write-through
 * = replace, identique à chaque fois).
 *
 * Usage : `cd central-server && npm run backfill:displays-resync`
 *         `cd central-server && npm run backfill:displays-resync -- --dry-run`
 *         `cd central-server && npm run backfill:displays-resync -- --site-id <uuid>`
 */

import logger from '../config/logger';
import pool, { query } from '../config/database';
import commandQueueService from '../services/command-queue.service';

interface SiteRow {
  id: string;
  site_name: string;
  displays: Array<{ index?: number; receiver?: { mac?: string } | null }> | null;
  [key: string]: unknown;
}

interface BackfillStats {
  total: number;
  emitted: number;
  sent: number;
  queued: number;
  skippedNoAssignment: number;
  failed: number;
}

async function findSitesWithAssignedDisplays(siteIdFilter?: string): Promise<SiteRow[]> {
  const params: unknown[] = [];
  let where = `displays IS NOT NULL AND jsonb_array_length(displays) > 0`;
  if (siteIdFilter) {
    where += ` AND id = $1`;
    params.push(siteIdFilter);
  }
  const result = await query<SiteRow>(
    `SELECT id, site_name, displays FROM sites WHERE ${where} ORDER BY site_name ASC`,
    params
  );
  return result.rows;
}

function hasAssignedReceiver(displays: SiteRow['displays']): boolean {
  if (!Array.isArray(displays)) return false;
  return displays.some(
    (d) => d && d.receiver && typeof d.receiver.mac === 'string' && d.receiver.mac.length > 0
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const siteIdIdx = args.indexOf('--site-id');
  const siteIdFilter = siteIdIdx !== -1 ? args[siteIdIdx + 1] : undefined;

  logger.info('Backfill displays-resync started', { dryRun, siteIdFilter });

  const sites = await findSitesWithAssignedDisplays(siteIdFilter);

  const stats: BackfillStats = {
    total: sites.length,
    emitted: 0,
    sent: 0,
    queued: 0,
    skippedNoAssignment: 0,
    failed: 0,
  };

  for (const site of sites) {
    if (!hasAssignedReceiver(site.displays)) {
      stats.skippedNoAssignment++;
      logger.debug('Skip site without assigned receiver', { siteId: site.id, name: site.site_name });
      continue;
    }

    if (dryRun) {
      logger.info('Would emit receiver_assignment_updated', {
        siteId: site.id,
        name: site.site_name,
        displayCount: site.displays?.length ?? 0,
      });
      stats.emitted++;
      continue;
    }

    try {
      const result = await commandQueueService.sendOrQueue(
        site.id,
        'receiver_assignment_updated',
        { displays: site.displays }
      );
      stats.emitted++;
      if (result.sent) stats.sent++;
      else if (result.queued) stats.queued++;
      logger.info('receiver_assignment_updated dispatched', {
        siteId: site.id,
        name: site.site_name,
        sent: result.sent,
        queued: result.queued,
        commandId: result.commandId,
      });
    } catch (err) {
      stats.failed++;
      logger.error('receiver_assignment_updated dispatch failed', {
        siteId: site.id,
        name: site.site_name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Backfill displays-resync done', stats);

  console.log(JSON.stringify(stats, null, 2));
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Backfill displays-resync crashed', {
      err: err instanceof Error ? err.message : String(err),
    });
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
