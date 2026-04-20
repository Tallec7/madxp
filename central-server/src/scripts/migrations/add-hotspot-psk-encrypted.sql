-- ADR-074 — Cloud becomes the single source of truth for hotspot PSK.
--
-- Context: before ADR-074, the PSK lived in /etc/hostapd/hostapd.conf AND
-- /home/pi/neopro/club-config.json on the Pi. These two files drifted in
-- production (audit 2026-04-19: NLF had real PSK in hostapd.conf but
-- placeholders in club-config.json). The cloud never knew the real PSK.
--
-- ADR-074 moves the canonical PSK to this table, encrypted with AES-256-GCM
-- using HOTSPOT_PSK_ENCRYPTION_KEY from Railway secrets. Sync-agent fetches
-- it at boot via GET /api/sites/:id/hotspot-config and writes hostapd.conf.
-- club-config.json is removed in Phase 5.

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS wifi_psk_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS wifi_psk_iv BYTEA,
  ADD COLUMN IF NOT EXISTS wifi_psk_auth_tag BYTEA,
  ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(32);

COMMENT ON COLUMN sites.wifi_psk_encrypted IS
  'ADR-074: hotspot PSK ciphertext (AES-256-GCM). NULL = Pi still on legacy local source, will bootstrap at next sync.';
COMMENT ON COLUMN sites.wifi_psk_iv IS
  'ADR-074: 12-byte IV for AES-GCM decryption.';
COMMENT ON COLUMN sites.wifi_psk_auth_tag IS
  'ADR-074: 16-byte GCM auth tag.';
COMMENT ON COLUMN sites.wifi_ssid IS
  'ADR-074: hotspot SSID (NEOPRO-<CLUB>). Max 32 chars per 802.11 spec.';
