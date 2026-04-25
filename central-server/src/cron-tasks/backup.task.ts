/**
 * CRON task — Backup (placeholder, ADR-097).
 *
 * NON IMPLÉMENTÉ : retourne explicitement un échec pour éviter le faux positif
 * (un placeholder qui retournait `success: true` laisserait croire qu'un backup
 * a tourné — risque de perte de données si une `recurring_schedule` de type
 * `backup` est planifiée en prod sans qu'aucune sauvegarde ne soit faite).
 * Toute implémentation doit (1) écrire les artifacts de backup, (2) vérifier
 * leur intégrité, (3) retourner `success: true` uniquement après vérification.
 */

import logger from '../config/logger';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executeBackupTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  logger.warn(
    '[CronScheduler] Backup task triggered but not implemented — schedule should be disabled or implementation provided',
    {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
    }
  );
  return {
    success: false,
    message: 'Backup task not implemented — disable this schedule or implement executeBackupTask()',
  };
}
