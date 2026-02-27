-- E-23 US-23.7.4: Add source column to distinguish kiosk (Pi) vs pc (browser) analytics
-- Values: 'kiosk' (Raspberry Pi Chromium), 'pc' (browser on PC/phone)

ALTER TABLE video_plays
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT NULL;

COMMENT ON COLUMN video_plays.source IS 'Playback source: kiosk (Raspberry Pi) or pc (browser)';

-- Index for filtering/grouping analytics by source
CREATE INDEX IF NOT EXISTS idx_video_plays_source ON video_plays (source) WHERE source IS NOT NULL;
