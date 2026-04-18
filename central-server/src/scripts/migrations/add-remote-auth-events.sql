-- ADR-061 — remote_auth_events
-- Trace les accès télécommande avec client_version (v1/v2) pour piloter le sunset legacy.

CREATE TABLE IF NOT EXISTS remote_auth_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT        NOT NULL,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('pin_verify', 'token_use', 'state_load')),
  client_version  TEXT        NOT NULL CHECK (client_version IN ('v1', 'v2')),
  profile_id      UUID        REFERENCES config_profiles(id) ON DELETE SET NULL,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_auth_events_site_id     ON remote_auth_events (site_id);
CREATE INDEX IF NOT EXISTS idx_remote_auth_events_created_at  ON remote_auth_events (created_at);
CREATE INDEX IF NOT EXISTS idx_remote_auth_events_version     ON remote_auth_events (client_version);
