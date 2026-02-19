-- Add optional PIN hash for cloud remote access
-- NULL = no PIN required (default, backward compatible)
-- SHA-256 hash = PIN required for cloud remote access
ALTER TABLE sites ADD COLUMN IF NOT EXISTS remote_pin_hash VARCHAR(64) DEFAULT NULL;
COMMENT ON COLUMN sites.remote_pin_hash IS 'SHA-256 hash of optional PIN for cloud remote access. NULL = no PIN required.';
