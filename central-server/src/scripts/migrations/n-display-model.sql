-- PROP-002 Phase 5B: N-display model
-- Opens the video_variants.display_type CHECK constraint to accept any slug (not just tv/secondary)
-- Adds displays JSONB column on sites for N-display configuration

-- 1. Replace closed CHECK constraint with open slug pattern
ALTER TABLE video_variants DROP CONSTRAINT IF EXISTS video_variants_display_type_check;
ALTER TABLE video_variants ADD CONSTRAINT video_variants_display_type_check
  CHECK (display_type ~ '^[a-z0-9-]+$' AND length(display_type) BETWEEN 1 AND 20);

-- 2. Add displays JSONB column to sites (nullable = legacy dual-display)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS displays JSONB DEFAULT NULL;
COMMENT ON COLUMN sites.displays IS 'N-display config: [{index, name, type, resolution}]. NULL = legacy dual (tv + secondary).';
