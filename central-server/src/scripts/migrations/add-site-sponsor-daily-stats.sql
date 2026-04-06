-- Migration: Add site_sponsor_daily_stats table
-- Date: 2026-04-06
-- Context: video_plays retention reduced to 15 days — sponsor impressions lost after purge.
-- This table preserves daily aggregated stats per sponsor indefinitely,
-- following the club_daily_stats pattern.

-- =============================================================================
-- 1. Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_sponsor_daily_stats (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id             UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    site_id                     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date                        DATE NOT NULL,

    -- Core metrics
    total_impressions           INTEGER DEFAULT 0,
    total_screen_time_seconds   INTEGER DEFAULT 0,
    completed_plays             INTEGER DEFAULT 0,
    estimated_reach             INTEGER DEFAULT 0,
    manual_triggers             INTEGER DEFAULT 0,
    active_videos               INTEGER DEFAULT 0,

    calculated_at               TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(site_sponsor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ssds_sponsor ON site_sponsor_daily_stats(site_sponsor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssds_site ON site_sponsor_daily_stats(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssds_date ON site_sponsor_daily_stats(date);

-- =============================================================================
-- 2. Aggregation function
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_site_sponsor_daily_stats(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO site_sponsor_daily_stats (
    site_sponsor_id, site_id, date,
    total_impressions, total_screen_time_seconds, completed_plays,
    estimated_reach, manual_triggers, active_videos,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id,
    vp.site_id,
    p_date,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate), 0),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COUNT(DISTINCT vp.video_filename),
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
    calculated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 3. Cron schedule (runs at 01:50, before cleanup at 03:15)
-- =============================================================================

INSERT INTO recurring_schedules (name, description, task_type, frequency, hour, minute, task_config, is_active)
VALUES (
    'Agrégation stats sponsors site',
    'Agrégation quotidienne des stats sponsors de site (video_plays → site_sponsor_daily_stats)',
    'aggregation',
    'daily',
    1,
    50,
    '{"aggregation_type": "site_sponsor_daily_stats", "target_date": "yesterday"}'::jsonb,
    true
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4. Backfill from existing video_plays (last 15 days)
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
