-- ADR-132 — Rotation OTA du mot de passe système `pi` sur la flotte
--
-- Ajoute trois colonnes de chiffrement (AES-256-GCM, même pattern que
-- wifi_psk_encrypted / ADR-074) + un flag de pendance par site.
--
-- Flow :
--   1. super_admin POST /api/fleet/rotate-pi-password { password }
--      → hash SHA-512 généré côté serveur, chiffré, stocké dans ces colonnes
--      → pi_system_password_pending = true sur tous les sites pi
--   2. Pi reconnecte → syncPiPasswordFromCloud() → GET /api/sites/:id/pi-system-password
--      → hash déchiffré, retourné (TLS)
--      → echo "pi:$HASH" | sudo chpasswd -e
--      → POST /api/sites/:id/pi-password-applied
--   3. pi_system_password_pending = false pour ce site

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS pi_password_ciphertext  BYTEA,
  ADD COLUMN IF NOT EXISTS pi_password_iv          BYTEA,
  ADD COLUMN IF NOT EXISTS pi_password_auth_tag    BYTEA,
  ADD COLUMN IF NOT EXISTS pi_system_password_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pi_password_rotated_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.sites.pi_password_ciphertext IS
  'ADR-132: Hash SHA-512-crypt du mot de passe système pi, chiffré AES-256-GCM (clé PI_PASSWORD_ENCRYPTION_KEY). NULL = pas de rotation cloud déclenchée.';

COMMENT ON COLUMN public.sites.pi_system_password_pending IS
  'ADR-132: TRUE si le Pi doit appliquer une nouvelle rotation de mot de passe au prochain reconnect sync-agent. FALSE après acquittement.';

COMMENT ON COLUMN public.sites.pi_password_rotated_at IS
  'ADR-132: Horodatage de la dernière rotation enregistrée en cloud (déclencher → acquittement peuvent décaler). Mis à jour au trigger, pas à l''acquittement.';
