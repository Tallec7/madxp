-- Migration: Add data retention cleanup schedules
-- Date: 2026-01-09
-- Description: Configure automatic cleanup of historical data to manage database growth
--
-- Retention Policy:
-- - video_plays: 90 days (daily stats preserve long-term)
-- - sponsor_impressions: 90 days (daily stats preserve long-term)
-- - metrics: 7 days (short-term diagnostics only)
-- - config_history: 20 versions per site (keep recent for rollback)
-- - remote_commands: 30 days (debug history)
-- - alerts: 90 days (incident pattern analysis)
-- - audit_logs: 90 days (compliance/audit)

-- ============================================================
-- 1. ACTIVER LE CLEANUP EXISTANT (audit_logs, executions)
-- ============================================================

-- Activer et mettre à jour le cleanup des logs existant
UPDATE recurring_schedules
SET
    is_active = true,
    task_config = '{"older_than_days": 90, "tables": ["recurring_schedule_executions", "audit_logs"]}'::jsonb,
    description = 'Suppression des logs de plus de 90 jours (audit_logs, recurring_schedule_executions)'
WHERE name = 'Nettoyage logs';

-- ============================================================
-- 2. NOUVEAUX SCHEDULES DE CLEANUP
-- ============================================================

-- Cleanup video_plays (90 jours) - quotidien à 3h15
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup video_plays',
    'Suppression des lectures vidéo de plus de 90 jours (les daily_stats conservent l''historique)',
    'cleanup',
    'daily',
    3,
    15,
    '{"older_than_days": 90, "tables": ["video_plays"]}',
    true
)
ON CONFLICT DO NOTHING;

-- Cleanup sponsor_impressions (90 jours) - quotidien à 3h30
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup sponsor_impressions',
    'Suppression des impressions sponsors de plus de 90 jours (les daily_stats conservent l''historique)',
    'cleanup',
    'daily',
    3,
    30,
    '{"older_than_days": 90, "tables": ["sponsor_impressions"]}',
    true
)
ON CONFLICT DO NOTHING;

-- Cleanup metrics (7 jours) - quotidien à 3h45
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup metrics',
    'Suppression des métriques système de plus de 7 jours (CPU, RAM, température)',
    'cleanup',
    'daily',
    3,
    45,
    '{"older_than_days": 7, "tables": ["metrics"]}',
    true
)
ON CONFLICT DO NOTHING;

-- Cleanup remote_commands (30 jours) - quotidien à 4h00
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup remote_commands',
    'Suppression des commandes à distance de plus de 30 jours',
    'cleanup',
    'daily',
    4,
    0,
    '{"older_than_days": 30, "tables": ["remote_commands"]}',
    true
)
ON CONFLICT DO NOTHING;

-- Cleanup alerts (90 jours) - quotidien à 4h15
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup alerts',
    'Suppression des alertes de plus de 90 jours',
    'cleanup',
    'daily',
    4,
    15,
    '{"older_than_days": 90, "tables": ["alerts"]}',
    true
)
ON CONFLICT DO NOTHING;

-- Cleanup config_history (20 versions par site) - quotidien à 4h30
-- Ce cleanup est spécial: on garde les N dernières versions, pas les X derniers jours
INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Cleanup config_history',
    'Conservation des 20 dernières versions de configuration par site',
    'cleanup',
    'daily',
    4,
    30,
    '{"keep_versions": 20, "tables": ["config_history"]}',
    true
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. INDEX POUR OPTIMISER LES CLEANUPS
-- ============================================================

-- Index sur video_plays.played_at (si pas déjà présent)
CREATE INDEX IF NOT EXISTS idx_video_plays_played_at ON video_plays(played_at);

-- Index sur sponsor_impressions.played_at (si pas déjà présent)
CREATE INDEX IF NOT EXISTS idx_sponsor_impressions_played_at ON sponsor_impressions(played_at);

-- Index sur metrics.recorded_at (si pas déjà présent)
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);

-- Index sur remote_commands.created_at (si pas déjà présent)
CREATE INDEX IF NOT EXISTS idx_remote_commands_created_at ON remote_commands(created_at);

-- Index sur alerts.created_at (si pas déjà présent)
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);

-- Index composite sur config_history pour le cleanup par versions
CREATE INDEX IF NOT EXISTS idx_config_history_site_deployed
ON config_history(site_id, deployed_at DESC);

-- ============================================================
-- 4. COMMENTAIRES DOCUMENTATION
-- ============================================================

COMMENT ON TABLE video_plays IS 'Lectures vidéo individuelles - rétention 90 jours, agrégées dans club_daily_stats';
COMMENT ON TABLE sponsor_impressions IS 'Impressions sponsors individuelles - rétention 90 jours, agrégées dans sponsor_daily_stats';
COMMENT ON TABLE metrics IS 'Métriques système Pi (CPU, RAM, temp) - rétention 7 jours';
COMMENT ON TABLE remote_commands IS 'Historique des commandes à distance - rétention 30 jours';
COMMENT ON TABLE alerts IS 'Alertes système - rétention 90 jours';
COMMENT ON TABLE config_history IS 'Historique des configurations - rétention 20 versions par site';
COMMENT ON TABLE audit_logs IS 'Logs d''audit des actions admin - rétention 90 jours';
