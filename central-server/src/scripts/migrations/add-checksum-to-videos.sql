-- Migration: Add checksum column to videos table
-- Date: 2025-12-18
-- Purpose: Add SHA256 checksum for video file integrity verification

-- Add checksum column to videos table
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);

-- Add comment for documentation
COMMENT ON COLUMN videos.checksum IS 'SHA256 checksum of the video file for integrity verification';

-- Create index for faster checksum lookups (useful for detecting duplicates)
CREATE INDEX IF NOT EXISTS idx_videos_checksum ON videos(checksum);
