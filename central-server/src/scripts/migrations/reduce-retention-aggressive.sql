-- Migration: Reduce data retention aggressively for Supabase Free Plan
-- Date: 2026-04-01
-- Context: Egress/storage exceeded on Free Plan (500MB / 5GB egress)
--
-- New Retention Policy:
-- - video_plays: 15 days (was 90, daily_stats preserve long-term)
-- - advertiser_impressions: 15 days (was 90, daily_stats preserve long-term)
-- - metrics: 3 days (was 7)
-- - alerts: 30 days (was 90)
-- - audit_logs: 30 days (was 90)
-- - remote_commands: 7 days (was 30)
-- - config_history: 5 versions/site (was 20)

-- 1. video_plays: 90j → 15j
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{older_than_days}', '15')
WHERE name = 'Cleanup video_plays';

-- 2. advertiser_impressions: 90j → 15j
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{older_than_days}', '15')
WHERE name LIKE 'Cleanup%impressions%';

-- 3. metrics: 7j → 3j
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{older_than_days}', '3')
WHERE name = 'Cleanup metrics';

-- 4. alerts: 90j → 30j
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{older_than_days}', '30')
WHERE name = 'Cleanup alerts';

-- 5. audit_logs + executions: 90j → 30j
UPDATE recurring_schedules
SET task_config = '{"older_than_days": 30, "tables": ["recurring_schedule_executions", "audit_logs"]}'::jsonb
WHERE name = 'Nettoyage logs';

-- 6. remote_commands: 30j → 7j
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{older_than_days}', '7')
WHERE name = 'Cleanup remote_commands';

-- 7. config_history: 20 versions → 5
UPDATE recurring_schedules
SET task_config = jsonb_set(task_config, '{keep_versions}', '5')
WHERE name = 'Cleanup config_history';
