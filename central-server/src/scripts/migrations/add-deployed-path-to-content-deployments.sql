-- Migration: Add deployed_path and deployed_filename to content_deployments
-- Purpose: Store the actual file path used by the Raspberry Pi after deployment.
-- The dashboard was constructing speculative paths that could mismatch with the Pi's
-- actual filesystem (due to sanitization, deduplication, originalName preference).

ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS deployed_path VARCHAR(500);
ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS deployed_filename VARCHAR(255);
