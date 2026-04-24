-- Migration: Extend club_sessions with structured match fields (ADR-092)
-- Date: 2026-04-24
-- Description:
--   Adds split home/away team names, final scores, profile_id, event_type
--   and ended_by marker to club_sessions. Enables match history dashboard
--   and period-filtered avg audience for sponsor reports.
--
-- Backward compat:
-- - match_name (legacy concatenated string) is kept; reads must COALESCE.
-- - All new columns are NULL-able with safe defaults; existing rows unaffected.

ALTER TABLE club_sessions
  ADD COLUMN IF NOT EXISTS home_team VARCHAR(100),
  ADD COLUMN IF NOT EXISTS away_team VARCHAR(100),
  ADD COLUMN IF NOT EXISTS home_score INTEGER,
  ADD COLUMN IF NOT EXISTS away_score INTEGER,
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'match',
  ADD COLUMN IF NOT EXISTS ended_by VARCHAR(50);

-- FK on profile_id (config_profiles) — kept separate to tolerate schema drift.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'config_profiles') THEN
    BEGIN
      ALTER TABLE club_sessions
        ADD CONSTRAINT club_sessions_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES config_profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      -- Already added
      NULL;
    END;
  END IF;
END $$;

-- Index for match-history listing (DESC by match_date, site-scoped)
CREATE INDEX IF NOT EXISTS idx_club_sessions_match_date
  ON club_sessions(site_id, match_date DESC NULLS LAST);

-- Index for auto-close CRON: sessions not yet ended, older than N hours
CREATE INDEX IF NOT EXISTS idx_club_sessions_open
  ON club_sessions(started_at)
  WHERE ended_at IS NULL;

COMMENT ON COLUMN club_sessions.home_team IS
  'Home team name (split from legacy match_name). ADR-092.';
COMMENT ON COLUMN club_sessions.away_team IS
  'Away team name (split from legacy match_name). ADR-092.';
COMMENT ON COLUMN club_sessions.home_score IS
  'Final home score at session close (frozen by auto-close CRON or match-end event).';
COMMENT ON COLUMN club_sessions.away_score IS
  'Final away score at session close.';
COMMENT ON COLUMN club_sessions.profile_id IS
  'config_profiles.id active during the match (ADR-058). NULL for pre-migration rows.';
COMMENT ON COLUMN club_sessions.event_type IS
  'Event category: match, training, tournament, other. Default match.';
COMMENT ON COLUMN club_sessions.ended_by IS
  'How the session was closed: remote, timeout, manual. NULL while open.';

-- Extend check_task_type to allow 'pdf_report' (legacy) and 'match_session_autoclose' (ADR-092).
DO $$
BEGIN
  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
  ALTER TABLE recurring_schedules
    ADD CONSTRAINT check_task_type
    CHECK (task_type IN (
      'report', 'cleanup', 'aggregation', 'backup',
      'objective_check', 'pdf_report', 'match_session_autoclose'
    ));
EXCEPTION WHEN undefined_table THEN
  -- recurring_schedules not yet migrated; skip.
  NULL;
END $$;

-- Seed the match auto-close schedule (hourly, inactive-safe re-run via ON CONFLICT).
INSERT INTO recurring_schedules (
  name, description, task_type, cron_expression, hour, minute,
  task_config, is_active
)
SELECT
  'Match session auto-close',
  'Clôture automatique des sessions match inactives (4h sans video_plays) ou ouvertes depuis >24h. ADR-092.',
  'match_session_autoclose',
  '15 * * * *',
  0, 15,
  '{"idleHours": 4, "absoluteTimeoutHours": 24}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules WHERE task_type = 'match_session_autoclose'
);

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: club_sessions extended with match fields + auto-close schedule (ADR-092)';
END $$;
