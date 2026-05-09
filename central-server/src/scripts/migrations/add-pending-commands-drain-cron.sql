-- Migration: ajout du CRON `pending_commands_drain` (Phase 14, fix sync 2026-05-09)
--
-- Problème résolu :
--   `processPendingCommands(siteId)` n'était appelé QU'AU MOMENT de
--   l'authentication socket d'un Pi (cf. `socket.service.ts::authenticateAgent`).
--   Conséquence : toute commande queueée pour un site DÉJÀ connecté restait
--   en DB indéfiniment (incident terrain Mangin-Beaulieu : la commande
--   `receiver_assignment_updated` queueée par `npm run backfill:displays-resync`
--   n'a jamais été drainée — Pi bloqué sur la wait page Fire Stick).
--
-- Fix :
--   Un CRON dédié toutes les 30 secondes itère les sites connectés
--   (socketService.getConnectedSites()) et appelle processPendingCommands()
--   pour chacun. Les commandes queueées descendent en ≤30s sans dépendre
--   d'un reconnect du Pi.
--
-- Charge : 1 SELECT sur pending_commands toutes les 30s par site connecté
-- (~50 sites × 2/min = 100 SELECT/min, indexé sur (site_id, expires_at, attempts)).
--
-- Pattern : aligné sur ADR-097 (cron-scheduler.service) + ADR-093
-- (match_session_autoclose) + add-template-test-render-tracking.

DO $$
BEGIN
  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
  ALTER TABLE recurring_schedules
    ADD CONSTRAINT check_task_type
    CHECK (task_type IN (
      'report', 'cleanup', 'aggregation', 'backup',
      'objective_check', 'pdf_report', 'match_session_autoclose',
      'video_ftp_audit', 'connection_events_purge',
      'test_render_cleanup',
      'pending_commands_drain'
    ));
EXCEPTION WHEN undefined_table THEN
  -- recurring_schedules not yet migrated; skip.
  NULL;
END $$;

-- Seed du schedule. Cron 6-field `*/30 * * * * *` = toutes les 30 secondes
-- (node-cron v4 supporte le champ seconds quand on passe 6 fields).
INSERT INTO recurring_schedules (
  name, description, task_type, cron_expression, hour, minute,
  task_config, is_active
)
SELECT
  'Pending commands drain',
  'Drain les commandes en queue (pending_commands) vers les sites connectés toutes les 30s. Évite que les commandes queueées par un dispatcher externe (backfill, admin tool) restent bloquées si le Pi est déjà connecté quand la commande arrive.',
  'pending_commands_drain',
  '*/30 * * * * *',
  0, 0,
  '{}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules WHERE task_type = 'pending_commands_drain'
);

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: pending_commands_drain CRON seeded (Phase 14)';
END $$;
