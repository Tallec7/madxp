-- P5: Magic link pour acces sponsor autonome
-- Permet a un sponsor local de consulter ses stats sans compte utilisateur
-- Pattern calque sur password_reset_tokens

CREATE TABLE IF NOT EXISTS sponsor_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_sponsor_id UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sat_token_hash ON sponsor_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_sat_site_sponsor_id ON sponsor_access_tokens(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sat_expires_at ON sponsor_access_tokens(expires_at);
