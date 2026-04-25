/**
 * Types partagés des tâches CRON (ADR-097).
 *
 * Extrait de `services/cron-scheduler.service.ts` pour permettre l'isolation
 * des executors dans `cron-tasks/*.task.ts`. L'orchestrateur conserve la
 * responsabilité du dispatch + lifecycle d'exécution.
 */

export type CronTaskType =
  | 'report'
  | 'cleanup'
  | 'aggregation'
  | 'backup'
  | 'objective_check'
  | 'pdf_report'
  | 'match_session_autoclose';

export interface RecurringSchedule {
  [key: string]: unknown; // Index signature for QueryResultRow compatibility
  id: string;
  name: string;
  description: string | null;
  task_type: CronTaskType;
  cron_expression: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | null;
  day_of_week: number | null;
  day_of_month: number | null;
  hour: number;
  minute: number;
  timezone: string;
  task_config: Record<string, unknown>;
  is_active: boolean;
  last_run_at: Date | null;
  next_run_at: Date | null;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}
