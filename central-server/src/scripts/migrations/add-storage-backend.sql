-- Migration: Add storage_backend column to videos and software_updates
-- Date: 2026-02-09
-- Description: Explicit storage backend tracking instead of heuristic detection via storage_path format
--              In production, all files use 'ftp'. The 'supabase' value exists only for dev/fallback.

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================

-- Add storage_backend column (default 'ftp' since that's the only backend in production)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(20) DEFAULT 'ftp';

-- Add constraint for valid values
DO $$
BEGIN
  ALTER TABLE videos ADD CONSTRAINT check_videos_storage_backend
    CHECK (storage_backend IN ('ftp', 'supabase', 'local'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Backfill existing videos based on storage_path heuristic
-- Files with '/' in storage_path were uploaded to Supabase, others to FTP
UPDATE videos
SET storage_backend = CASE
  WHEN storage_path LIKE '%/%' THEN 'supabase'
  ELSE 'ftp'
END
WHERE storage_backend IS NULL OR storage_backend = 'ftp';

-- Create index for filtering by backend
CREATE INDEX IF NOT EXISTS idx_videos_storage_backend ON videos(storage_backend);

-- ============================================================================
-- SOFTWARE_UPDATES TABLE
-- ============================================================================

ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(20) DEFAULT 'ftp';

DO $$
BEGIN
  ALTER TABLE software_updates ADD CONSTRAINT check_updates_storage_backend
    CHECK (storage_backend IN ('ftp', 'supabase', 'local'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- software_updates has no storage_path column; default all existing rows to 'ftp'
UPDATE software_updates
SET storage_backend = 'ftp'
WHERE storage_backend IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN videos.storage_backend IS
  'Storage backend used for this file: ftp (production), supabase (fallback), local (dev only)';

COMMENT ON COLUMN software_updates.storage_backend IS
  'Storage backend used for this file: ftp (production), supabase (fallback), local (dev only)';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- SELECT storage_backend, COUNT(*) FROM videos GROUP BY storage_backend;
-- Expected: all 'ftp' in production
