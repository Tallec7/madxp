-- Migration: Add feature_overrides JSONB column to sites
-- Allows super_admin to enable specific features per-site regardless of subscription tier
-- Example: {"weighted_rotation": true, "analytics_advanced": true}

ALTER TABLE sites ADD COLUMN IF NOT EXISTS feature_overrides JSONB DEFAULT '{}';

COMMENT ON COLUMN sites.feature_overrides IS 'Per-site feature overrides set by super_admin. Keys are FeatureKey strings, values are booleans. Checked before subscription tier.';
