-- =============================================================================
-- ADR-035 Phase 4: Cleanup migration
-- Removes the neopro→site_sponsors bridge (replaced by campaigns system)
-- =============================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Backfill sponsor_id on historical video_plays
--    site_sponsors with source='neopro' have advertiser_id set.
--    Copy that advertiser_id into video_plays.sponsor_id where missing.
-- -------------------------------------------------------------------------
UPDATE video_plays vp
SET sponsor_id = ss.advertiser_id
FROM site_sponsors ss
WHERE vp.site_sponsor_id = ss.id
  AND ss.source = 'neopro'
  AND ss.advertiser_id IS NOT NULL
  AND vp.sponsor_id IS NULL;

-- -------------------------------------------------------------------------
-- 2. Delete site_sponsors rows with source='neopro'
--    These shadow records are no longer needed — campaigns handle
--    advertiser→site deployment directly.
-- -------------------------------------------------------------------------
DELETE FROM site_sponsors WHERE source = 'neopro';

-- -------------------------------------------------------------------------
-- 3. Remove source column from site_sponsors
--    All remaining rows are source='local' (the only valid value now)
-- -------------------------------------------------------------------------
ALTER TABLE site_sponsors DROP CONSTRAINT IF EXISTS chk_site_sponsor_source;
ALTER TABLE site_sponsors DROP COLUMN IF EXISTS source;

-- -------------------------------------------------------------------------
-- 4. Remove advertiser_id column from site_sponsors
--    No longer needed — advertisers use campaigns, not site_sponsors
-- -------------------------------------------------------------------------
-- Drop the partial unique index first
DROP INDEX IF EXISTS idx_site_sponsors_advertiser_site;
ALTER TABLE site_sponsors DROP COLUMN IF EXISTS advertiser_id;

-- -------------------------------------------------------------------------
-- 5. Replace advertiser_daily_stats_live view
--    Remove dependency on advertiser_daily_stats table.
--    The new view queries video_plays directly for all dates.
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW advertiser_daily_stats_live AS
SELECT
  vp.video_id,
  vp.site_id,
  DATE(vp.played_at) AS date,
  COUNT(*) AS total_impressions,
  SUM(vp.duration_played) AS total_screen_time,
  ROUND(AVG(
    CASE WHEN vp.video_duration > 0
      THEN LEAST(vp.duration_played::numeric / vp.video_duration, 1.0) * 100
      ELSE 0
    END
  ), 1) AS completion_rate,
  vp.sponsor_id AS advertiser_id
FROM video_plays vp
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
  AND vp.video_id IS NOT NULL
GROUP BY vp.video_id, vp.site_id, DATE(vp.played_at), vp.sponsor_id;

COMMENT ON VIEW advertiser_daily_stats_live IS 'Stats annonceur agrégées par vidéo/site/jour depuis video_plays. Remplace l''ancienne table advertiser_daily_stats (ADR-035 Phase 4).';

-- -------------------------------------------------------------------------
-- 6. Drop advertiser_daily_stats table
-- -------------------------------------------------------------------------
DROP TABLE IF EXISTS advertiser_daily_stats CASCADE;

-- -------------------------------------------------------------------------
-- 7. Replace calculate_all_advertiser_daily_stats() with no-op
--    Keeps cron scheduler compatible but does nothing.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_all_advertiser_daily_stats(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER AS $$
BEGIN
  -- ADR-035 Phase 4: Table removed, view queries video_plays directly.
  -- This function is kept as a no-op for backward compatibility with cron scheduler.
  RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Also replace per-video function if it exists
CREATE OR REPLACE FUNCTION calculate_advertiser_daily_stats(p_video_id UUID, p_site_id UUID, p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS VOID AS $$
BEGIN
  -- ADR-035 Phase 4: No-op, table removed.
  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMIT;
