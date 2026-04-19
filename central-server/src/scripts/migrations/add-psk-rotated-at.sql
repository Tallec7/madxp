-- ADR-073 — Track when each Pi's hotspot PSK was last rotated
--
-- Context: before ADR-073, every Pi shared the PSK "NeoProWiFi2025".
-- ADR-073 introduced unique per-club PSKs generated at install time.
-- This column lets support ops track which legacy Pi still run the old
-- shared PSK and need migration (see docs/modops/MIGRATION_PSK_LEGACY.md).

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS psk_rotated_at TIMESTAMPTZ;

COMMENT ON COLUMN sites.psk_rotated_at IS
  'When the Pi hotspot PSK was last rotated (ADR-073). NULL = legacy shared PSK, needs migration.';
