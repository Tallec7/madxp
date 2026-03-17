-- =============================================================================
-- Migration: ADR-035 Phase 3 — Campaigns Operational
-- =============================================================================
-- Adds campaign_videos and campaign_sites junction tables, and target_criteria
-- JSONB column to campaigns. Migrates legacy target_sites UUID[] data.
--
-- Idempotent: can be replayed safely.
-- =============================================================================

-- =============================================================================
-- 1. Add target_criteria JSONB to campaigns
-- =============================================================================
-- Target criteria for automatic site resolution:
-- { sports: string[], regions: string[], min_audience: number, group_ids: string[] }

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_criteria JSONB DEFAULT NULL;

-- Budget / CPM tracking
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS budget_cents INTEGER DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_cpm_cents INTEGER DEFAULT NULL;

COMMENT ON COLUMN campaigns.target_criteria IS 'Auto-targeting: { sports: [], regions: [], min_audience: N, group_ids: [] }';
COMMENT ON COLUMN campaigns.budget_cents IS 'Campaign budget in cents (e.g. 50000 = 500€)';
COMMENT ON COLUMN campaigns.target_cpm_cents IS 'Target CPM in cents (e.g. 500 = 5€)';

-- =============================================================================
-- 2. Table campaign_videos — which videos are in a campaign
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_video UNIQUE (campaign_id, video_id),
  CONSTRAINT check_campaign_video_weight CHECK (weight > 0)
);

CREATE INDEX IF NOT EXISTS idx_campaign_videos_campaign ON campaign_videos(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_videos_video ON campaign_videos(video_id);

-- =============================================================================
-- 3. Table campaign_sites — resolved sites for a campaign
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  deployment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  deployed_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_site UNIQUE (campaign_id, site_id),
  CONSTRAINT check_deployment_status CHECK (deployment_status IN ('pending', 'deployed', 'failed', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_sites_campaign ON campaign_sites(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sites_site ON campaign_sites(site_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sites_status ON campaign_sites(deployment_status) WHERE deployment_status = 'pending';

-- =============================================================================
-- 4. Migrate legacy target_sites UUID[] → campaign_sites
-- =============================================================================
-- One-shot: for campaigns that have target_sites but no campaign_sites yet.

INSERT INTO campaign_sites (campaign_id, site_id, deployment_status)
SELECT c.id, unnest(c.target_sites), 'deployed'
FROM campaigns c
WHERE c.target_sites IS NOT NULL
  AND array_length(c.target_sites, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM campaign_sites cs WHERE cs.campaign_id = c.id
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. View: campaign performance summary
-- =============================================================================

CREATE OR REPLACE VIEW campaign_stats_live AS
SELECT
  c.id AS campaign_id,
  c.advertiser_id,
  c.name AS campaign_name,
  c.status,
  c.target_impressions,
  c.budget_cents,
  c.target_cpm_cents,
  c.start_date,
  c.end_date,
  COALESCE(stats.total_impressions, 0) AS total_impressions,
  COALESCE(stats.total_screen_time_seconds, 0) AS total_screen_time_seconds,
  COALESCE(stats.avg_completion_rate, 0) AS avg_completion_rate,
  COALESCE(stats.active_sites, 0) AS active_sites,
  COALESCE(stats.unique_videos, 0) AS unique_videos,
  CASE
    WHEN c.target_impressions IS NOT NULL AND c.target_impressions > 0
    THEN ROUND((COALESCE(stats.total_impressions, 0)::numeric / c.target_impressions) * 100, 1)
    ELSE NULL
  END AS progress_percent,
  CASE
    WHEN COALESCE(stats.total_impressions, 0) > 0 AND c.budget_cents IS NOT NULL
    THEN ROUND((c.budget_cents::numeric / (COALESCE(stats.total_impressions, 0) / 1000.0)), 2)
    ELSE NULL
  END AS effective_cpm_cents
FROM campaigns c
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_impressions,
    COALESCE(SUM(vp.duration_played), 0) AS total_screen_time_seconds,
    ROUND(AVG(CASE WHEN vp.video_duration > 0 THEN LEAST(vp.duration_played::numeric / vp.video_duration, 1) ELSE 0 END) * 100, 1) AS avg_completion_rate,
    COUNT(DISTINCT vp.site_id) AS active_sites,
    COUNT(DISTINCT vp.video_id) AS unique_videos
  FROM video_plays vp
  WHERE vp.campaign_id = c.id
) stats ON true;

-- =============================================================================
-- 6. Verification
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_videos') THEN
    RAISE EXCEPTION 'Table campaign_videos not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_sites') THEN
    RAISE EXCEPTION 'Table campaign_sites not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'target_criteria'
  ) THEN
    RAISE EXCEPTION 'Column target_criteria not added to campaigns';
  END IF;

  RAISE NOTICE 'Migration OK: campaign_videos, campaign_sites created, target_criteria added';
END $$;
