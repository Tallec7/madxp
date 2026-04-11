-- Migration: Add site_videos pivot table for N:N video-site relationship
-- ADR-048: Restructuration FTP + thumbnails + pivot site_videos
-- Date: 2026-04-11
--
-- This replaces the 1:1 relationship via videos.uploaded_for_site_id
-- with an N:N relationship allowing video sharing across sites.

BEGIN;

-- 1. Create site_videos pivot table
CREATE TABLE IF NOT EXISTS site_videos (
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (site_id, video_id)
);

-- Index for reverse lookups (find all sites for a video)
CREATE INDEX IF NOT EXISTS idx_site_videos_video_id ON site_videos(video_id);

-- Index for listing videos per site ordered by addition date
CREATE INDEX IF NOT EXISTS idx_site_videos_site_added ON site_videos(site_id, added_at DESC);

-- 2. Backfill from uploaded_for_site_id
INSERT INTO site_videos (site_id, video_id, added_at, added_by)
SELECT
  v.uploaded_for_site_id,
  v.id,
  v.created_at,
  v.uploaded_by
FROM videos v
WHERE v.uploaded_for_site_id IS NOT NULL
ON CONFLICT (site_id, video_id) DO NOTHING;

-- 3. Add comment marking uploaded_for_site_id as deprecated
COMMENT ON COLUMN videos.uploaded_for_site_id IS 'DEPRECATED (ADR-048): Use site_videos pivot table instead. Kept for backward compatibility.';

COMMIT;
