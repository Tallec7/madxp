-- Live sponsor stats aggregation — incident Bottière 2026-05-08
--
-- Contexte : la PR #912 a corrigé la classification des plays sponsor mais
-- `site_sponsor_daily_stats` n'est rafraîchi qu'à 01:50 (CRON quotidien pour
-- la veille). Conséquence : un Pi activé en cours de journée n'apparaît dans
-- le dashboard sponsor que le lendemain matin.
--
-- Ce que cette migration ajoute : une nouvelle recurring_schedule horaire qui
-- agrège CURRENT_DATE via le nouveau code `aggregation.task.ts` qui honore
-- `task_config.target_date='today'`.
--
-- Idempotent via WHERE NOT EXISTS (la table n'a pas de contrainte UNIQUE sur
-- `name` et l'introduire ici impacterait toutes les autres rows existantes).
-- Aucune modification de fonction PG ni schema — le scheduler service lit
-- `cron_expression` en priorité, donc pas besoin d'étendre `calculate_next_run`.

INSERT INTO recurring_schedules (
  name,
  description,
  task_type,
  cron_expression,
  hour,
  minute,
  task_config,
  is_active,
  timezone
)
SELECT
  'Agrégation stats sponsors site (live today)',
  'Refresh intra-journée de site_sponsor_daily_stats pour CURRENT_DATE — complète le CRON quotidien qui ne couvre que la veille. Permet aux nouveaux Pi activés en cours de journée d''apparaître dans le dashboard sponsor sans attendre minuit (incident Bottière 2026-05-08).',
  'aggregation',
  '10 * * * *',
  0,
  10,
  '{"target_date": "today", "aggregation_type": "site_sponsor_daily_stats"}'::jsonb,
  true,
  'Europe/Paris'
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules
  WHERE name = 'Agrégation stats sponsors site (live today)'
);
