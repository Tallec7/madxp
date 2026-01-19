-- Migration: Add upload verification tracking
-- Date: 2026-01-19
-- Description: Adds upload_status column to videos and software_updates tables
--              to prevent race conditions between upload and deployment

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================

-- Add upload status column with default 'ready' for backward compatibility
ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'ready';

-- Add timestamp for when upload was verified
ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_verified_at TIMESTAMP;

-- Add verified file size (to compare with expected)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_verified_size BIGINT;

-- Add error message for failed uploads
ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_error_message TEXT;

-- Add retry counter
ALTER TABLE videos ADD COLUMN IF NOT EXISTS upload_retry_count INT DEFAULT 0;

-- Add constraint for upload_status values
DO $$
BEGIN
  ALTER TABLE videos ADD CONSTRAINT check_videos_upload_status
    CHECK (upload_status IN ('uploading', 'verifying', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, ignore
  NULL;
END $$;

-- Create index for filtering by upload status
CREATE INDEX IF NOT EXISTS idx_videos_upload_status ON videos(upload_status);

-- Create partial index for ready videos (most common query)
CREATE INDEX IF NOT EXISTS idx_videos_ready_for_deploy
  ON videos(upload_status, created_at)
  WHERE upload_status = 'ready';

-- Backfill existing videos as 'ready' (they were uploaded before this system)
UPDATE videos
SET upload_status = 'ready',
    upload_verified_at = COALESCE(updated_at, created_at)
WHERE upload_status IS NULL;

-- ============================================================================
-- SOFTWARE_UPDATES TABLE
-- ============================================================================

-- Add upload status column with default 'ready' for backward compatibility
ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'ready';

-- Add timestamp for when upload was verified
ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS upload_verified_at TIMESTAMP;

-- Add verified file size
ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS upload_verified_size BIGINT;

-- Add error message for failed uploads
ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS upload_error_message TEXT;

-- Add retry counter
ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS upload_retry_count INT DEFAULT 0;

-- Add constraint for upload_status values
DO $$
BEGIN
  ALTER TABLE software_updates ADD CONSTRAINT check_updates_upload_status
    CHECK (upload_status IN ('uploading', 'verifying', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, ignore
  NULL;
END $$;

-- Create index for filtering by upload status
CREATE INDEX IF NOT EXISTS idx_software_updates_upload_status ON software_updates(upload_status);

-- Backfill existing updates as 'ready'
UPDATE software_updates
SET upload_status = 'ready',
    upload_verified_at = COALESCE(created_at, NOW())
WHERE upload_status IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN videos.upload_status IS
  'Upload state machine: uploading -> verifying -> ready/failed. Deployment blocked until ready.';

COMMENT ON COLUMN videos.upload_verified_at IS
  'Timestamp when upload was verified (file exists and size matches)';

COMMENT ON COLUMN videos.upload_verified_size IS
  'Actual file size on storage after verification';

COMMENT ON COLUMN videos.upload_error_message IS
  'Error message if upload failed (for debugging)';

COMMENT ON COLUMN videos.upload_retry_count IS
  'Number of upload retry attempts';

COMMENT ON COLUMN software_updates.upload_status IS
  'Upload state machine: uploading -> verifying -> ready/failed. Deployment blocked until ready.';

-- ============================================================================
-- VERIFICATION QUERY (for testing)
-- ============================================================================
-- SELECT
--   'videos' as table_name,
--   upload_status,
--   COUNT(*) as count
-- FROM videos
-- GROUP BY upload_status
-- UNION ALL
-- SELECT
--   'software_updates' as table_name,
--   upload_status,
--   COUNT(*) as count
-- FROM software_updates
-- GROUP BY upload_status;
