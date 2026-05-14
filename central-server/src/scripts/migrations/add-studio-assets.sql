-- Migration: Templates Studio — Asset library + template bindings (Phase 1.5)
-- Date: 2026-05-14
-- ADR: ADR-125
-- Description:
--   Pool global d'assets uploadés (textures, vidéos, watermarks, logos) +
--   bindings par template. Permet aux compositions Remotion de consommer des
--   URLs FTP résolues à la volée par le worker (`__assets` injecté dans les
--   inputProps), sans hardcoder de `staticFile()`.
--
--   Decisions :
--     - `studio_assets`     : pool partagé cross-templates, dédupliqué par
--                             `checksum_sha256` (re-upload du même contenu = 0
--                             doublon, l'INSERT retourne la row existante via
--                             ON CONFLICT (checksum_sha256) DO NOTHING).
--     - `studio_template_asset_bindings` : 1 row = 1 slot du manifest lié à
--                             1 asset. PK composite `(template_slug, asset_key)`.
--                             ON DELETE RESTRICT côté `asset_id` : on refuse
--                             la suppression d'un asset utilisé (le controller
--                             rend l'erreur 409 + liste les bindings).
--
--   Tenant : aucune notion de site_id (asset library = catalogue admin
--   technique, partagé sur toute la flotte). Restreint super_admin / admin /
--   operator côté routes.

CREATE TABLE IF NOT EXISTS studio_assets (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  filename        TEXT NOT NULL,
  ftp_path        TEXT NOT NULL UNIQUE,
  mime_type       TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  checksum_sha256 TEXT NOT NULL UNIQUE,
  width           INT,
  height          INT,
  duration_ms     INT,
  tags            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE studio_assets IS
  'Pool global d''assets Templates Studio (textures, watermarks, vidéos lensflare, etc.). Dédupliqué par checksum_sha256 — un re-upload du même contenu retourne la row existante.';
COMMENT ON COLUMN studio_assets.ftp_path IS
  'Path relatif dans le bucket FTP Hostinger (ex: studio-assets/textures/metal-<hash>.png). URL publique = getFtpPublicUrl(ftp_path).';
COMMENT ON COLUMN studio_assets.checksum_sha256 IS
  'Hash content-addressable. UNIQUE = clé de dédup côté upsert.';

CREATE INDEX IF NOT EXISTS idx_studio_assets_checksum
  ON studio_assets(checksum_sha256);

CREATE INDEX IF NOT EXISTS idx_studio_assets_tags
  ON studio_assets USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_studio_assets_mime
  ON studio_assets(mime_type);

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_template_asset_bindings (
  template_slug   TEXT NOT NULL,
  asset_key       TEXT NOT NULL,
  asset_id        UUID NOT NULL REFERENCES studio_assets(id) ON DELETE RESTRICT,
  bound_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  bound_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (template_slug, asset_key)
);

COMMENT ON TABLE studio_template_asset_bindings IS
  'Liaison template_slug × manifest.requiredAssets[].key vers studio_assets. Lue par le worker render pour résoudre __assets dans les inputProps.';
COMMENT ON COLUMN studio_template_asset_bindings.asset_id IS
  'ON DELETE RESTRICT : la suppression d''un asset utilisé est refusée par la DB (le controller rend 409 avec la liste des bindings concernés).';

CREATE INDEX IF NOT EXISTS idx_studio_bindings_asset
  ON studio_template_asset_bindings(asset_id);

-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Templates Studio asset library — 2 tables créées (studio_assets, studio_template_asset_bindings)';
END $$;
