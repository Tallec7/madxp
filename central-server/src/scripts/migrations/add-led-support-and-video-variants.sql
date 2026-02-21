-- =============================================================================
-- Migration: Add LED support to sites + video_variants table
-- =============================================================================
-- E-22: TV + LED Dual Output (ADR-029, PROP-002)
-- F-22.1: Dual Kiosk HDMI — adds led_enabled and led_resolution to sites
-- F-22.3: Video Variants — creates video_variants table for display-specific files
-- =============================================================================

-- 1. Add LED columns to sites
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS led_enabled BOOLEAN DEFAULT false;

ALTER TABLE sites
ADD COLUMN IF NOT EXISTS led_resolution VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN sites.led_enabled IS 'Enable LED panel output on HDMI 1. When true, the Pi launches a second Chromium kiosk on /led.';
COMMENT ON COLUMN sites.led_resolution IS 'LED panel resolution in WxH format (e.g., 1920x384). Used to configure HDMI 1 output.';

-- 2. Create video_variants table
CREATE TABLE IF NOT EXISTS video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_type VARCHAR(20) NOT NULL CHECK (display_type IN ('tv', 'led')),
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  checksum VARCHAR(128),
  mime_type VARCHAR(100) DEFAULT 'video/mp4',
  width INTEGER,
  height INTEGER,
  duration NUMERIC(10, 2),
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, display_type)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_video_variants_video_id
ON video_variants (video_id);

CREATE INDEX IF NOT EXISTS idx_video_variants_display_type
ON video_variants (display_type);

CREATE INDEX IF NOT EXISTS idx_sites_led_enabled
ON sites (led_enabled) WHERE led_enabled = true;

-- 4. Confirmation
DO $$
BEGIN
  RAISE NOTICE 'Migration add-led-support-and-video-variants applied successfully.';
END $$;
