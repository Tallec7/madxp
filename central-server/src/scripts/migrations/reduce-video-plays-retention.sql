-- Migration: Reduce video_plays retention from 90 days to 30 days
-- Date: 2026-02-20
-- Description:
--   video_plays was consuming 619 MB (83% of the 0.5 GB Supabase quota).
--   Since data is already aggregated into club_daily_stats, 30 days of
--   granular play data is sufficient for debugging and detailed analytics.
--   Also removes the duplicate index idx_video_plays_date (identical to idx_video_plays_played_at).

-- ============================================================
-- 1. REDUCE RETENTION: 90 days → 30 days
-- ============================================================

UPDATE recurring_schedules
SET
    task_config = '{"older_than_days": 30, "tables": ["video_plays"]}'::jsonb,
    description = 'Suppression des lectures vidéo de plus de 30 jours (les daily_stats conservent l''historique)'
WHERE name = 'Cleanup video_plays';

-- ============================================================
-- 2. REMOVE DUPLICATE INDEX
-- ============================================================

-- idx_video_plays_date and idx_video_plays_played_at are identical (both btree on played_at).
-- Keep idx_video_plays_played_at (created by data-retention migration), drop the duplicate.
DROP INDEX IF EXISTS idx_video_plays_date;

-- ============================================================
-- 3. UPDATE TABLE COMMENT
-- ============================================================

COMMENT ON TABLE video_plays IS 'Lectures vidéo individuelles - rétention 30 jours, agrégées dans club_daily_stats';
