-- Migration: Add network_profile column to sites
-- Date: 2026-01-18
-- Purpose: Store detected network environment profile for each site

-- Add network_profile column to sites table
-- This stores the detected network environment (simple, mesh, mesh_isolated, enterprise)
-- along with detailed detection data for debugging and analytics

DO $$
BEGIN
    -- Add network_profile column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'network_profile'
    ) THEN
        ALTER TABLE sites ADD COLUMN network_profile JSONB DEFAULT NULL;
        COMMENT ON COLUMN sites.network_profile IS 'Detected network environment profile: {type, apCount, bssidLocked, meshInfo, isolationInfo, stabilityInfo, detectedAt}';
    END IF;

    -- Add network_profile_updated_at column for tracking last detection
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'network_profile_updated_at'
    ) THEN
        ALTER TABLE sites ADD COLUMN network_profile_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        COMMENT ON COLUMN sites.network_profile_updated_at IS 'Last time the network profile was updated by the Pi';
    END IF;
END $$;

-- Create index for querying sites by network profile type
CREATE INDEX IF NOT EXISTS idx_sites_network_profile_type
ON sites ((network_profile->>'type'))
WHERE network_profile IS NOT NULL;

-- Create index for finding mesh sites
CREATE INDEX IF NOT EXISTS idx_sites_network_profile_mesh
ON sites ((network_profile->>'apCount'))
WHERE network_profile IS NOT NULL AND (network_profile->>'apCount')::int > 1;

-- Create a view for network profile analytics
CREATE OR REPLACE VIEW network_profile_summary AS
SELECT
    COALESCE(network_profile->>'type', 'unknown') as profile_type,
    COUNT(*) as site_count,
    AVG((network_profile->>'apCount')::int) as avg_ap_count,
    SUM(CASE WHEN (network_profile->>'bssidLocked')::boolean = true THEN 1 ELSE 0 END) as bssid_locked_count
FROM sites
WHERE status != 'deleted'
GROUP BY COALESCE(network_profile->>'type', 'unknown')
ORDER BY site_count DESC;

-- Add comment on the view
COMMENT ON VIEW network_profile_summary IS 'Summary statistics of network profiles across all sites';

-- Grant permissions (adjust based on your RLS setup)
-- GRANT SELECT ON network_profile_summary TO authenticated;
