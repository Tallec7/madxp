-- Migration : CRON purge connection_events (ADR-099 follow-up)
-- Date : 2026-04-27
-- Description :
--   Étend `recurring_schedules.check_task_type` pour autoriser le nouveau task
--   type `connection_events_purge` et seed une exécution quotidienne (03:30 UTC)
--   avec rétention 90 jours.
--
-- Pourquoi :
--   La table `connection_events` (ADR-099) accumule 1 row par connect/disconnect
--   réel. Sans purge, en régime stationnaire ~9k rows pour 50 Pi sur 90j (peanuts),
--   mais sans cap, un Pi qui flap pendant des semaines pourrait gonfler la table
--   indéfiniment. Le CRON est tunable via `task_config.retentionDays`.

DO $$
BEGIN
  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
  ALTER TABLE recurring_schedules
    ADD CONSTRAINT check_task_type
    CHECK (task_type IN (
      'report', 'cleanup', 'aggregation', 'backup',
      'objective_check', 'pdf_report', 'match_session_autoclose',
      'video_ftp_audit', 'connection_events_purge'
    ));
EXCEPTION WHEN undefined_table THEN
  -- recurring_schedules pas encore créée (premier bootstrap) → ignore.
  NULL;
END $$;

-- Seed : purge quotidienne à 03:30 UTC, 90j de rétention.
-- Décalé de 30 min par rapport au CRON `video_ftp_audit` (03:00) pour ne pas
-- saturer la base le matin.
INSERT INTO recurring_schedules (
  name, description, task_type, cron_expression, hour, minute,
  task_config, is_active
)
SELECT
  'Connection events retention purge',
  'Purge quotidienne des rows connection_events plus vieilles que retentionDays (défaut 90j). Empêche la table de gonfler indéfiniment et garantit un horizon fini de post-mortems.',
  'connection_events_purge',
  '30 3 * * *',
  3, 30,
  '{"retentionDays": 90}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules WHERE task_type = 'connection_events_purge'
);

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: CRON connection_events_purge (ADR-099 follow-up)';
END $$;
