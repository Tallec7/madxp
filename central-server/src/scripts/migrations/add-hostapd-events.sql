-- ADR-072 OTA-2 : télémetrie hostapd pour diagnostiquer à distance
-- les problèmes d'association client (iOS rejeté, PSK mismatch, deauth).

CREATE TABLE IF NOT EXISTS hostapd_events (
  id            BIGSERIAL PRIMARY KEY,
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  client_mac    TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hostapd_events_site_time
  ON hostapd_events (site_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_hostapd_events_type
  ON hostapd_events (event_type, occurred_at DESC);

-- Rétention 30j : purge automatique via cron existant
-- (cron-scheduler.service.ts ajoutera la passe de cleanup séparément).
COMMENT ON TABLE hostapd_events IS
  'ADR-072 OTA-2: hostapd_cli event stream (AP-STA-CONNECTED/DISCONNECTED/PSK-MISMATCH). Retention 30j.';
