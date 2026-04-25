/**
 * CRON task — Génération des rapports PDF mensuels (ADR-097).
 */

import logger from '../config/logger';
import { generateMonthlyReports } from '../services/monthly-reports.service';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executePdfReportTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    report_types?: ('club' | 'advertiser')[];
  };

  logger.info('[CronScheduler] Starting PDF report generation');

  try {
    const result = await generateMonthlyReports();

    return {
      success: result.failed === 0,
      message: `Generated ${result.success}/${result.total} PDF reports (${result.failed} failed)`,
      details: {
        total: result.total,
        success: result.success,
        failed: result.failed,
        reportTypes: config.report_types || ['club', 'advertiser'],
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CronScheduler] PDF report generation failed', { error: errorMessage });

    return {
      success: false,
      message: `PDF report generation failed: ${errorMessage}`,
    };
  }
}
