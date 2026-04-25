/**
 * CRON task — Vérification des objectifs club + alerte Slack si à risque (ADR-097).
 *
 * Pour chaque objectif `active` (start_date OK, end_date NULL ou future) :
 * - Lit le `progress_percent` de `club_objectives_progress` pour CURRENT_DATE
 * - Sépare atRisk (<50%) / achieved (>=100%)
 * - Si `config.send_alerts` et atRisk > 0 → Slack groupé par site (1 alerte
 *   par site listant les N objectifs à risque, évite le spam)
 *
 * Tolérant : si la table `club_objectives` n'existe pas encore, retourne
 * `success: true` avec un message de skip (utile pour les setups en cours).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { alertNotifier } from '../services/alerting-notifier.service';
import { ExecutionResult, RecurringSchedule } from './types';

interface ObjectiveRow {
  [key: string]: unknown; // Index signature for QueryResultRow compatibility
  id: string;
  site_id: string;
  site_name: string;
  name: string;
  metric_type: string;
  target_value: number;
  current_value: number;
  progress_percent: number;
}

export async function executeObjectiveCheckTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    check_type?: string;
    send_alerts?: boolean;
  };

  try {
    const objectivesResult = await query<ObjectiveRow>(
      `SELECT
        co.id,
        co.site_id,
        s.site_name as site_name,
        co.name,
        co.metric_type,
        co.target_value,
        COALESCE(cop.current_value, 0) as current_value,
        COALESCE(cop.progress_percent, 0) as progress_percent
       FROM club_objectives co
       JOIN sites s ON s.id = co.site_id
       LEFT JOIN club_objectives_progress cop ON cop.objective_id = co.id
         AND cop.period_date = CURRENT_DATE
       WHERE co.status = 'active'
         AND co.start_date <= CURRENT_DATE
         AND (co.end_date IS NULL OR co.end_date >= CURRENT_DATE)`,
      []
    );

    const atRiskObjectives = objectivesResult.rows.filter((o) => o.progress_percent < 50);
    const achievedObjectives = objectivesResult.rows.filter((o) => o.progress_percent >= 100);

    // Notifier Slack si configuré (groupé par site pour éviter le spam :
    // un site avec N objectifs à risque ne déclenche qu'UNE seule alerte).
    if (config.send_alerts && atRiskObjectives.length > 0) {
      logger.info(`${atRiskObjectives.length} objectives at risk`);

      const bySite = new Map<string, { siteName: string; objectives: ObjectiveRow[] }>();
      for (const obj of atRiskObjectives) {
        const entry = bySite.get(obj.site_id);
        if (entry) {
          entry.objectives.push(obj);
        } else {
          bySite.set(obj.site_id, { siteName: obj.site_name, objectives: [obj] });
        }
      }

      const now = new Date();
      for (const [siteId, { siteName, objectives }] of bySite) {
        const lines = objectives
          .map((o) => `• *${o.name}* — ${o.progress_percent}% (${o.current_value}/${o.target_value} ${o.metric_type})`)
          .join('\n');
        const message = `${objectives.length} objectif(s) à risque (< 50% de progression) :\n${lines}`;

        try {
          await alertNotifier.sendSlackNotification({
            siteName,
            siteId,
            alertType: 'Objectifs club à risque',
            severity: 'warning',
            message,
            timestamp: now,
          });
        } catch (err) {
          logger.error('Failed to notify at-risk objectives for site', {
            siteId,
            error: err instanceof Error ? err.message : err,
          });
        }
      }
    }

    return {
      success: true,
      message: `Checked ${objectivesResult.rows.length} objectives`,
      details: {
        total: objectivesResult.rows.length,
        atRisk: atRiskObjectives.length,
        achieved: achievedObjectives.length,
      },
    };
  } catch (error) {
    // Table n'existe peut-être pas encore
    if (error instanceof Error && error.message.includes('club_objectives')) {
      return { success: true, message: 'Objectives table not yet created, skipping' };
    }
    throw error;
  }
}
