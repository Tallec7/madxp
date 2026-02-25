-- =============================================================================
-- Migration: Add has_secondary_variant to content_deployments
-- =============================================================================
-- Tracks whether a secondary display variant was included in a deployment.
-- Set at deployment time by deployToSite() when secondaryVariant !== null.
-- Existing rows default to false (historically accurate — feature didn't exist).
-- =============================================================================

ALTER TABLE content_deployments
ADD COLUMN IF NOT EXISTS has_secondary_variant BOOLEAN DEFAULT false;

COMMENT ON COLUMN content_deployments.has_secondary_variant IS
  'Whether a secondary display variant was included in this deployment (set at deployment time).';

DO $$
BEGIN
  RAISE NOTICE 'Migration add-has-secondary-variant-to-deployments applied successfully.';
END $$;
