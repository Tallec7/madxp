-- Migration ADR-058 : Remote PIN par profil de configuration
-- Ajoute les colonnes PIN sur config_profiles et crée profile_device_tokens

-- Colonnes PIN sur config_profiles
ALTER TABLE config_profiles
  ADD COLUMN IF NOT EXISTS remote_pin_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_pin_hash VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS remote_pin_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Table profile_device_tokens (tokens JWT 30j par appareil, révocables)
CREATE TABLE IF NOT EXISTS profile_device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES config_profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  label VARCHAR(255) DEFAULT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  revoked_reason VARCHAR(255) DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdt_profile ON profile_device_tokens(profile_id);
CREATE INDEX IF NOT EXISTS idx_pdt_site ON profile_device_tokens(site_id);
CREATE INDEX IF NOT EXISTS idx_pdt_token_hash ON profile_device_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pdt_expires ON profile_device_tokens(expires_at) WHERE revoked_at IS NULL;
