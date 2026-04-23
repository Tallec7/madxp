-- ADR-089 Phase 1 — Extend videos table to support web_page / livestream content
-- Backward-compatible: existing rows default to 'video', storage_path unchanged.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS external_url VARCHAR(2048);

ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_content_type_check;

ALTER TABLE videos
  ADD CONSTRAINT videos_content_type_check
  CHECK (content_type IN ('video', 'web_page', 'livestream'));

-- For web_page / livestream: external_url must be present, storage_path/filename may be placeholders.
ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_web_external_url_required;

ALTER TABLE videos
  ADD CONSTRAINT videos_web_external_url_required
  CHECK (
    content_type = 'video'
    OR (external_url IS NOT NULL AND external_url ~ '^https?://')
  );

CREATE INDEX IF NOT EXISTS idx_videos_content_type ON videos(content_type);

-- video_plays: track which content type was played (for analytics segmentation)
ALTER TABLE video_plays
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'video';

ALTER TABLE video_plays
  DROP CONSTRAINT IF EXISTS video_plays_content_type_check;

ALTER TABLE video_plays
  ADD CONSTRAINT video_plays_content_type_check
  CHECK (content_type IN ('video', 'web_page', 'livestream'));
