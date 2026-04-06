-- Migration: Extend site_sponsor_daily_stats with full breakdown columns
-- Date: 2026-04-06
-- Context: video_plays retention = 15 days, but Proof of Play needs full season data.
-- Add event_type, period, and match-day breakdown columns to preserve all analytics
-- dimensions. Add child table for per-video stats.

-- =============================================================================
-- 1. Add breakdown columns to site_sponsor_daily_stats
-- =============================================================================

-- Event type breakdown
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_match INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_training INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_training INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_training INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_tournament INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_tournament INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_tournament INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_other INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_other INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_other INTEGER DEFAULT 0;

-- Period breakdown
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_pre_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_pre_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_pre_match INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_halftime INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_halftime INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_halftime INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_post_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_post_match INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_post_match INTEGER DEFAULT 0;

ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS impressions_loop INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS screen_time_loop INTEGER DEFAULT 0;
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS completed_loop INTEGER DEFAULT 0;

-- Match-day audience
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS audience_estimate_match INTEGER DEFAULT 0;

-- Network advertiser linkage
ALTER TABLE site_sponsor_daily_stats ADD COLUMN IF NOT EXISTS sponsor_id UUID;

CREATE INDEX IF NOT EXISTS idx_ssds_sponsor_id ON site_sponsor_daily_stats(sponsor_id, date DESC) WHERE sponsor_id IS NOT NULL;

-- =============================================================================
-- 2. Child table: per-video daily stats
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_sponsor_daily_video_stats (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id         UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date                    DATE NOT NULL,
    video_filename          VARCHAR(255) NOT NULL,

    impressions             INTEGER DEFAULT 0,
    screen_time_seconds     INTEGER DEFAULT 0,
    completed_plays         INTEGER DEFAULT 0,
    manual_triggers         INTEGER DEFAULT 0,
    total_duration_played   INTEGER DEFAULT 0,

    calculated_at           TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(site_sponsor_id, date, video_filename)
);

CREATE INDEX IF NOT EXISTS idx_ssdvs_sponsor ON site_sponsor_daily_video_stats(site_sponsor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssdvs_site ON site_sponsor_daily_video_stats(site_id, date DESC);

-- =============================================================================
-- 3. Updated aggregation function
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_site_sponsor_daily_stats(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Parent table: aggregate by (site_sponsor_id, site_id)
  INSERT INTO site_sponsor_daily_stats (
    site_sponsor_id, site_id, date,
    total_impressions, total_screen_time_seconds, completed_plays,
    estimated_reach, manual_triggers, active_videos,
    -- Event type breakdown
    impressions_match, screen_time_match, completed_match,
    impressions_training, screen_time_training, completed_training,
    impressions_tournament, screen_time_tournament, completed_tournament,
    impressions_other, screen_time_other, completed_other,
    -- Period breakdown
    impressions_pre_match, screen_time_pre_match, completed_pre_match,
    impressions_halftime, screen_time_halftime, completed_halftime,
    impressions_post_match, screen_time_post_match, completed_post_match,
    impressions_loop, screen_time_loop, completed_loop,
    -- Match-day audience + network linkage
    audience_estimate_match, sponsor_id,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date,
    -- Core
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate), 0),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COUNT(DISTINCT vp.video_filename),
    -- Event type: match
    COUNT(*) FILTER (WHERE vp.event_type = 'match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'match'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'match' THEN 1 ELSE 0 END),
    -- Event type: training
    COUNT(*) FILTER (WHERE vp.event_type = 'training'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'training'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'training' THEN 1 ELSE 0 END),
    -- Event type: tournament
    COUNT(*) FILTER (WHERE vp.event_type = 'tournament'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'tournament'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'tournament' THEN 1 ELSE 0 END),
    -- Event type: other (default)
    COUNT(*) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament') THEN 1 ELSE 0 END),
    -- Period: pre_match
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match' THEN 1 ELSE 0 END),
    -- Period: halftime
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime' THEN 1 ELSE 0 END),
    -- Period: post_match
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match' THEN 1 ELSE 0 END),
    -- Period: loop (default)
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop' THEN 1 ELSE 0 END),
    -- Match-day audience + network linkage
    COALESCE(SUM(vp.audience_estimate) FILTER (WHERE vp.event_type = 'match'), 0),
    (array_agg(vp.sponsor_id) FILTER (WHERE vp.sponsor_id IS NOT NULL))[1],
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
  GROUP BY vp.site_sponsor_id, vp.site_id
  ON CONFLICT (site_sponsor_id, date) DO UPDATE SET
    total_impressions = EXCLUDED.total_impressions,
    total_screen_time_seconds = EXCLUDED.total_screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    estimated_reach = EXCLUDED.estimated_reach,
    manual_triggers = EXCLUDED.manual_triggers,
    active_videos = EXCLUDED.active_videos,
    impressions_match = EXCLUDED.impressions_match,
    screen_time_match = EXCLUDED.screen_time_match,
    completed_match = EXCLUDED.completed_match,
    impressions_training = EXCLUDED.impressions_training,
    screen_time_training = EXCLUDED.screen_time_training,
    completed_training = EXCLUDED.completed_training,
    impressions_tournament = EXCLUDED.impressions_tournament,
    screen_time_tournament = EXCLUDED.screen_time_tournament,
    completed_tournament = EXCLUDED.completed_tournament,
    impressions_other = EXCLUDED.impressions_other,
    screen_time_other = EXCLUDED.screen_time_other,
    completed_other = EXCLUDED.completed_other,
    impressions_pre_match = EXCLUDED.impressions_pre_match,
    screen_time_pre_match = EXCLUDED.screen_time_pre_match,
    completed_pre_match = EXCLUDED.completed_pre_match,
    impressions_halftime = EXCLUDED.impressions_halftime,
    screen_time_halftime = EXCLUDED.screen_time_halftime,
    completed_halftime = EXCLUDED.completed_halftime,
    impressions_post_match = EXCLUDED.impressions_post_match,
    screen_time_post_match = EXCLUDED.screen_time_post_match,
    completed_post_match = EXCLUDED.completed_post_match,
    impressions_loop = EXCLUDED.impressions_loop,
    screen_time_loop = EXCLUDED.screen_time_loop,
    completed_loop = EXCLUDED.completed_loop,
    audience_estimate_match = EXCLUDED.audience_estimate_match,
    sponsor_id = EXCLUDED.sponsor_id,
    calculated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Child table: per-video stats
  INSERT INTO site_sponsor_daily_video_stats (
    site_sponsor_id, site_id, date, video_filename,
    impressions, screen_time_seconds, completed_plays,
    manual_triggers, total_duration_played,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date, vp.video_filename,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COALESCE(SUM(vp.duration_played), 0),
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
  GROUP BY vp.site_sponsor_id, vp.site_id, vp.video_filename
  ON CONFLICT (site_sponsor_id, date, video_filename) DO UPDATE SET
    impressions = EXCLUDED.impressions,
    screen_time_seconds = EXCLUDED.screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    manual_triggers = EXCLUDED.manual_triggers,
    total_duration_played = EXCLUDED.total_duration_played,
    calculated_at = NOW();

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. Re-backfill last 15 days with new columns
-- =============================================================================

DO $$
DECLARE
  d DATE;
  v_rows INTEGER;
BEGIN
  FOR d IN SELECT generate_series(
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE,
    '1 day'::interval
  )::date
  LOOP
    v_rows := calculate_site_sponsor_daily_stats(d);
    IF v_rows > 0 THEN
      RAISE NOTICE 'Backfilled % for date %', v_rows, d;
    END IF;
  END LOOP;
END;
$$;
