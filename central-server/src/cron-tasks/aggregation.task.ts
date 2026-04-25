/**
 * CRON task — Agrégation des stats quotidiennes (ADR-097).
 *
 * Calcule club_daily_stats / advertiser_daily_stats / site_sponsor_daily_stats
 * pour la veille (CURRENT_DATE - 1). Critique pour la rétention vidéo (15j) :
 * une fonction PG manquante = data loss silencieux si on retourne `success`.
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executeAggregationTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as { aggregation_type?: string };
  const aggregationType = config.aggregation_type || 'all';

  try {
    const results: string[] = [];

    if (aggregationType === 'club_daily_stats' || aggregationType === 'all') {
      await query(`SELECT calculate_all_daily_stats(CURRENT_DATE - 1)`, []);
      results.push('club_daily_stats');
    }

    if (aggregationType === 'advertiser_daily_stats' || aggregationType === 'all') {
      await query(`SELECT calculate_all_advertiser_daily_stats(CURRENT_DATE - 1)`, []);
      results.push('advertiser_daily_stats');
    }

    if (aggregationType === 'site_sponsor_daily_stats' || aggregationType === 'all') {
      await query(`SELECT calculate_site_sponsor_daily_stats(CURRENT_DATE - 1)`, []);
      results.push('site_sponsor_daily_stats');
    }

    return {
      success: true,
      message: `Aggregation completed: ${results.join(', ')}`,
    };
  } catch (error) {
    // Ne PAS silent-swallow les "function does not exist" — un missing
    // PG function = critical data loss risk (15j de rétention sur video_plays).
    // `checkAggregationStaleness()` alerte à >36h, mais si on retourne
    // success: true ici, l'execution est loggée OK et la staleness est
    // masquée jusqu'au prochain alert cycle (incident 137h).
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isMissingFunction = error instanceof Error && error.message.includes('does not exist') && (
      error.message.includes('calculate_all_daily_stats') ||
      error.message.includes('calculate_all_advertiser_daily_stats') ||
      error.message.includes('calculate_site_sponsor_daily_stats')
    );

    if (isMissingFunction) {
      logger.error('[CronScheduler] Aggregation function missing in DB — critical data loss risk', {
        error: errorMessage,
        aggregationType,
      });
      return {
        success: false,
        message: `Aggregation function missing: ${errorMessage}`,
      };
    }

    logger.error('[CronScheduler] Aggregation failed', {
      error: errorMessage,
      aggregationType,
    });
    return {
      success: false,
      message: `Aggregation failed: ${errorMessage}`,
    };
  }
}
