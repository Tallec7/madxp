-- Migration: Add sponsor context columns to video_plays (Pipeline consolidation)
-- Date: 2026-02-21
-- Description: Enrich video_plays with event_type, period, audience_estimate,
--   position_in_loop, site_sponsor_id to consolidate the two analytics pipelines
--   (video_plays + advertiser_impressions) into a single source of truth.
--
-- Context:
-- - Pipeline A (video_plays) works reliably, has tv_status (HDMI-CEC)
-- - Pipeline B (advertiser_impressions) was broken (401 auth), had business fields
-- - This migration adds Pipeline B's business fields to Pipeline A
-- - A bridge view allows the advertiser dashboard to read from video_plays

-- =============================================================================
-- NEW COLUMNS
-- =============================================================================

-- Event type: match, training, tournament, other
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS event_type VARCHAR(50);

-- Period within a match: pre_match, halftime, post_match, loop
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS period VARCHAR(50);

-- Estimated audience count (set from remote control during match)
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS audience_estimate INTEGER;

-- Position in the video rotation loop (0-based index)
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS position_in_loop INTEGER;

-- Direct FK to site_sponsors for per-club sponsor association
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS site_sponsor_id UUID;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for sponsor-specific queries (advertiser dashboard)
CREATE INDEX IF NOT EXISTS idx_video_plays_event_type ON video_plays(event_type);
CREATE INDEX IF NOT EXISTS idx_video_plays_site_sponsor ON video_plays(site_sponsor_id);

-- Composite index for sponsor analytics queries (site + category + date range)
CREATE INDEX IF NOT EXISTS idx_video_plays_sponsor_analytics
  ON video_plays(site_id, category, played_at DESC)
  WHERE category = 'sponsor';

-- =============================================================================
-- BRIDGE VIEW: advertiser dashboard reads from video_plays instead of advertiser_impressions
-- =============================================================================

CREATE OR REPLACE VIEW sponsor_impressions_bridge AS
SELECT
  vp.id,
  vp.site_id,
  vp.sponsor_id AS advertiser_id,
  vp.video_id,
  vp.video_filename,
  vp.played_at,
  vp.duration_played,
  vp.video_duration,
  vp.completed,
  vp.event_type,
  vp.period,
  vp.trigger_type,
  vp.position_in_loop,
  vp.audience_estimate,
  vp.site_sponsor_id,
  vp.tv_status
FROM video_plays vp
WHERE vp.category = 'sponsor'
  AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN video_plays.event_type IS
  'Type of sporting event when video played: match, training, tournament, other. Set from remote control.';
COMMENT ON COLUMN video_plays.period IS
  'Period within a match: pre_match, halftime, post_match, loop. Set from remote control.';
COMMENT ON COLUMN video_plays.audience_estimate IS
  'Estimated audience count, set from remote control during match setup.';
COMMENT ON COLUMN video_plays.position_in_loop IS
  'Zero-based position of the video in the rotation loop at time of play.';
COMMENT ON COLUMN video_plays.site_sponsor_id IS
  'UUID of the site_sponsors entry for per-club sponsor association.';

COMMENT ON VIEW sponsor_impressions_bridge IS
  'Bridge view for advertiser dashboard: reads sponsor plays from video_plays (consolidated pipeline). Filters to category=sponsor and tv_status in (on, unknown).';

-- =============================================================================
-- LOG
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration complete: Added sponsor context columns to video_plays';
    RAISE NOTICE 'Columns added: event_type, period, audience_estimate, position_in_loop, site_sponsor_id';
    RAISE NOTICE 'Created view sponsor_impressions_bridge for advertiser dashboard';
END $$;
