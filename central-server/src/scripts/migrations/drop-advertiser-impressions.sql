-- =============================================================================
-- Migration: Drop advertiser_impressions table
-- =============================================================================
-- All queries have been migrated to use video_plays (category = 'sponsor').
-- The backfill script has been run to enrich video_plays with context
-- from advertiser_impressions (event_type, period, audience_estimate).
--
-- Prerequisites:
--   1. Run backfill-video-plays-from-advertiser-impressions.sql FIRST
--   2. Verify all services use video_plays (grep for advertiser_impressions in .ts files)
--   3. Deploy and validate in staging before running in production
--
-- This migration:
--   1. Drops dependent views that reference advertiser_impressions
--   2. Drops RLS policies
--   3. Drops the table
--   4. Recreates views using video_plays
-- =============================================================================

-- 1. Drop views that may reference advertiser_impressions
DROP VIEW IF EXISTS advertiser_analytics_summary CASCADE;
DROP VIEW IF EXISTS advertiser_performance_by_site CASCADE;
DROP VIEW IF EXISTS advertiser_stats_summary CASCADE;
DROP VIEW IF EXISTS top_advertiser_videos CASCADE;

-- 2. Drop RLS policies
DROP POLICY IF EXISTS site_insert_advertiser_impressions ON advertiser_impressions;
DROP POLICY IF EXISTS site_select_own_advertiser_impressions ON advertiser_impressions;

-- 3. Drop the table
DROP TABLE IF EXISTS advertiser_impressions CASCADE;

-- 4. Recreate views using video_plays
CREATE OR REPLACE VIEW advertiser_analytics_summary AS
SELECT
  a.id AS advertiser_id,
  a.name AS advertiser_name,
  COUNT(DISTINCT vp.site_id) AS sites_reached,
  COUNT(vp.id) AS total_impressions,
  COALESCE(SUM(vp.duration_played), 0) AS total_duration
FROM advertisers a
LEFT JOIN video_plays vp ON vp.sponsor_id = a.id AND vp.category = 'sponsor'
GROUP BY a.id, a.name;

CREATE OR REPLACE VIEW advertiser_performance_by_site AS
SELECT
  vp.sponsor_id AS advertiser_id,
  vp.site_id,
  s.site_name,
  s.club_name,
  COUNT(vp.id) AS impressions_count,
  COALESCE(SUM(vp.duration_played), 0) AS total_duration
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
WHERE vp.category = 'sponsor'
GROUP BY vp.sponsor_id, vp.site_id, s.site_name, s.club_name;

CREATE OR REPLACE VIEW advertiser_stats_summary AS
SELECT
  a.id AS advertiser_id,
  a.name,
  a.status,
  COUNT(DISTINCT av.video_id) AS video_count,
  COUNT(DISTINCT vp.site_id) AS sites_count,
  COUNT(vp.id) AS total_impressions
FROM advertisers a
LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
LEFT JOIN video_plays vp ON vp.sponsor_id = a.id AND vp.category = 'sponsor'
GROUP BY a.id, a.name, a.status;

CREATE OR REPLACE VIEW top_advertiser_videos AS
SELECT
  vp.sponsor_id AS advertiser_id,
  a.name AS advertiser_name,
  vp.video_filename,
  COUNT(*) AS play_count,
  SUM(vp.duration_played) AS total_duration
FROM video_plays vp
JOIN advertisers a ON a.id = vp.sponsor_id
WHERE vp.category = 'sponsor' AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY vp.sponsor_id, a.name, vp.video_filename
ORDER BY play_count DESC;

-- 5. Verification
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'advertiser_impressions') THEN
    RAISE EXCEPTION 'Table advertiser_impressions still exists!';
  END IF;

  RAISE NOTICE 'Migration OK: advertiser_impressions dropped, views recreated with video_plays';
END $$;
