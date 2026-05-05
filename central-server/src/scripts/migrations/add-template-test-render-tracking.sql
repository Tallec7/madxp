-- Migration: Test render tracking columns + cleanup CRON (Phase 3 / ADR-110 / PUB-02)
-- Date: 2026-05-05
-- Description:
--   Adds test_render_at, test_render_status, test_render_url to neopro_templates
--   for the async test render pipeline (ADR-054/055 reused). Also extends
--   recurring_schedules check_task_type with 'test_render_cleanup' and seeds the
--   weekly cleanup schedule that purges /test-renders/* > 7 days from FTP.
--
-- Backward compat:
--   - All ADD COLUMN are NULL-able with no default → existing rows unaffected.
--   - DROP CONSTRAINT IF EXISTS + WHERE NOT EXISTS = idempotent.

ALTER TABLE neopro_templates ADD COLUMN IF NOT EXISTS test_render_at TIMESTAMP NULL;
ALTER TABLE neopro_templates ADD COLUMN IF NOT EXISTS test_render_status TEXT NULL
  CHECK (test_render_status IN ('queued','rendering','success','failed'));
ALTER TABLE neopro_templates ADD COLUMN IF NOT EXISTS test_render_url TEXT NULL;

COMMENT ON COLUMN neopro_templates.test_render_at IS
  'Phase 3 (PUB-02): timestamp of last test render request. NULL if never test-rendered.';
COMMENT ON COLUMN neopro_templates.test_render_status IS
  'Phase 3 (PUB-02): queued | rendering | success | failed. NULL if never test-rendered.';
COMMENT ON COLUMN neopro_templates.test_render_url IS
  'Phase 3 (PUB-02): FTP URL of last test render at /test-renders/{templateId}/{timestamp}.mp4. Cleaned weekly by test_render_cleanup CRON.';

-- Extend check_task_type to accept 'test_render_cleanup' (Phase 3 PUB-02).
-- Pattern aligned on ADR-093 / ADR-099 / video_ftp_audit migrations.
DO $$
BEGIN
  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
  ALTER TABLE recurring_schedules
    ADD CONSTRAINT check_task_type
    CHECK (task_type IN (
      'report', 'cleanup', 'aggregation', 'backup',
      'objective_check', 'pdf_report', 'match_session_autoclose',
      'video_ftp_audit', 'connection_events_purge',
      'test_render_cleanup'
    ));
EXCEPTION WHEN undefined_table THEN
  -- recurring_schedules not yet migrated; skip.
  NULL;
END $$;

-- Seed the weekly test render cleanup schedule (Sunday 03:00).
INSERT INTO recurring_schedules (
  name, description, task_type, cron_expression, hour, minute,
  task_config, is_active
)
SELECT
  'Test render cleanup',
  'Suppression FTP des test renders /test-renders/* > 7 jours (ADR-110 Phase 3 PUB-02).',
  'test_render_cleanup',
  '0 3 * * 0',
  3, 0,
  '{"ttlDays": 7}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules WHERE task_type = 'test_render_cleanup'
);

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: neopro_templates extended with test_render_* columns + test_render_cleanup CRON seeded (PUB-02)';
END $$;
