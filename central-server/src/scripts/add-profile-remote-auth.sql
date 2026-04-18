-- ADR-058 Phase 1: Remote auth per profile
-- Add PIN columns to config_profiles (bcrypt hash) + device token table.

ALTER TABLE config_profiles
  ADD COLUMN IF NOT EXISTS remote_pin_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remote_pin_hash VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS remote_pin_updated_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN config_profiles.remote_pin_hash IS
  'bcrypt hash (rounds=12) of optional PIN for cloud remote access per profile. NULL = no PIN.';

CREATE TABLE IF NOT EXISTS profile_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES config_profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id VARCHAR(128) NOT NULL,
  label VARCHAR(128) DEFAULT NULL,
  token_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  revoked_reason VARCHAR(64) DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_device_tokens_profile
  ON profile_device_tokens(profile_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profile_device_tokens_site
  ON profile_device_tokens(site_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profile_device_tokens_device
  ON profile_device_tokens(profile_id, device_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE profile_device_tokens IS
  'ADR-058: per-device session tokens for profile-scoped cloud remote access (30d TTL).';
