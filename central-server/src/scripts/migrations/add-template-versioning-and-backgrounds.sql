-- Migration: Template Versioning + Backgrounds Grants — ADR-108 + ADR-109
--
-- Phase 1 du chantier templates JOUEUR (PR #757) :
--   1) Versioning des templates (semver, snapshot immutable, fork/rollback)
--   2) Slot capabilities : text_transform, auto_crop, user_offset_x, require_alpha
--   3) Backgrounds couleur (table catalogue + grants user_id)
--
-- Backward-compat : tous les templates existants restent fonctionnels.
-- Backfill : ajoute version='1.0' + status='published' + snapshot pour chaque
-- template existant, sans changer leur comportement runtime.
--
-- Refs :
--   - ADR-108 (versioning + verrouillage)
--   - ADR-109 (backgrounds + grants)
--   - SPEC famille JOUEUR : docs/templates/JOUEUR-SPEC-GLOBAL.md

-- =============================================================================
-- 1) VERSIONING — extension neopro_templates + table snapshot
-- =============================================================================

ALTER TABLE neopro_templates
  ADD COLUMN IF NOT EXISTS version            TEXT          NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS status             TEXT          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS parent_template_id UUID REFERENCES neopro_templates(id);

COMMENT ON COLUMN neopro_templates.version IS
  'ADR-108 : version semver du template (MAJOR.MINOR). Slug + version = identité unique.';
COMMENT ON COLUMN neopro_templates.status IS
  'ADR-108 : draft = mutable, published = locked immutable, archived = rollback only.';
COMMENT ON COLUMN neopro_templates.parent_template_id IS
  'ADR-108 : si fork, pointe sur la version parente (tracé d''origine).';

-- Snapshot immutable d'une version publiée
-- NOTE : table distincte de `neopro_template_versions` (ADR-054/055) qui ne
-- snapshot que props_schema + default_props pour les templates legacy v1.
-- Cette nouvelle table couvre le périmètre complet ADR-086 v2 (layers + slots
-- + variants + fonts) requis pour le verrouillage des masters.
CREATE TABLE IF NOT EXISTS template_versions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  version              TEXT NOT NULL,
  layers_snapshot      JSONB NOT NULL,
  text_fields_snapshot JSONB NOT NULL,
  image_slots_snapshot JSONB NOT NULL,
  variants_snapshot    JSONB NOT NULL DEFAULT '[]'::jsonb,
  fonts_snapshot       JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by         UUID NOT NULL REFERENCES users(id),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_tpl_ver
  ON template_versions (template_id, version);

COMMENT ON TABLE template_versions IS
  'ADR-108 : snapshots immutables des versions publiées. Source de vérité runtime.';

-- =============================================================================
-- 2) SLOT CAPABILITIES — extensions ADR-086/095 pour SPECs JOUEUR
-- =============================================================================

-- text_transform : uppercase pour les majuscules (cf. PACKSHOT_IMG SPEC)
ALTER TABLE template_text_fields
  ADD COLUMN IF NOT EXISTS text_transform TEXT
    CHECK (text_transform IN ('none', 'uppercase', 'lowercase', 'capitalize'))
    DEFAULT 'none';

COMMENT ON COLUMN template_text_fields.text_transform IS
  'ADR-108 (SPEC JOUEUR) : transformation typographique appliquée par le runtime.';

-- auto_crop + user_offset_x : cadrage auto photo joueur (SPEC packshot IMG)
-- require_alpha : refuse les PNG sans canal alpha (photo détourée obligatoire)
ALTER TABLE template_image_slots
  ADD COLUMN IF NOT EXISTS auto_crop      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_offset_x  NUMERIC NOT NULL DEFAULT 0
    CHECK (user_offset_x BETWEEN -100 AND 100),
  ADD COLUMN IF NOT EXISTS require_alpha  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN template_image_slots.auto_crop IS
  'SPEC JOUEUR : cadrage automatique à l''upload (bbox du contenu non-alpha).';
COMMENT ON COLUMN template_image_slots.user_offset_x IS
  'SPEC JOUEUR : offset horizontal éditable par user (-100 → +100 % de la safe zone).';
COMMENT ON COLUMN template_image_slots.require_alpha IS
  'SPEC JOUEUR : refuse les PNG sans canal alpha (détourage obligatoire).';

-- =============================================================================
-- 3) BACKGROUNDS — catalogue + grants user_id (ADR-109)
-- =============================================================================

CREATE TABLE IF NOT EXISTS template_backgrounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  hex_color    TEXT NOT NULL CHECK (hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  webm_url     TEXT NOT NULL,
  duration_ms  INTEGER,
  is_public    BOOLEAN NOT NULL DEFAULT true,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_template_backgrounds_public
  ON template_backgrounds (is_public)
  WHERE archived_at IS NULL;

COMMENT ON TABLE template_backgrounds IS
  'ADR-109 : catalogue des fonds couleur WebM alpha. Upload super_admin.';

-- Grants user-level (pattern ADR-082 Video Club Grants)
CREATE TABLE IF NOT EXISTS template_backgrounds_grants (
  background_id UUID NOT NULL REFERENCES template_backgrounds(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by    UUID NOT NULL REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (background_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tbg_user
  ON template_backgrounds_grants (user_id);

COMMENT ON TABLE template_backgrounds_grants IS
  'ADR-109 : grants user_id pour visibilité restreinte des backgrounds.';

-- =============================================================================
-- 4) BACKFILL — templates existants
-- =============================================================================
--
-- Tous les templates en prod (NLF + démos) deviennent v1.0 published.
-- Un snapshot est créé pour chaque, garantissant que les sites consommateurs
-- continuent à servir la même config (template_versions = source de vérité runtime).
--
-- Le backfill est idempotent (ON CONFLICT DO NOTHING sur template_versions).

UPDATE neopro_templates
SET status = 'published',
    published_at = COALESCE(published_at, created_at, NOW())
WHERE status = 'draft' AND created_at IS NOT NULL;

-- Snapshot des templates existants (1 row par template).
-- Le published_by fallback : premier super_admin trouvé (id le plus ancien).
INSERT INTO template_versions (
  template_id, version,
  layers_snapshot, text_fields_snapshot, image_slots_snapshot,
  variants_snapshot, fonts_snapshot,
  published_at, published_by
)
SELECT
  t.id,
  COALESCE(t.version, '1.0'),
  COALESCE(
    (SELECT jsonb_agg(row_to_json(l)::jsonb) FROM template_layers l WHERE l.template_id = t.id),
    '[]'::jsonb
  ),
  COALESCE(
    (SELECT jsonb_agg(row_to_json(tf)::jsonb) FROM template_text_fields tf WHERE tf.template_id = t.id),
    '[]'::jsonb
  ),
  COALESCE(
    (SELECT jsonb_agg(row_to_json(s)::jsonb) FROM template_image_slots s WHERE s.template_id = t.id),
    '[]'::jsonb
  ),
  COALESCE(
    (SELECT jsonb_agg(row_to_json(v)::jsonb) FROM template_variants v WHERE v.template_id = t.id),
    '[]'::jsonb
  ),
  '[]'::jsonb,
  COALESCE(t.published_at, t.created_at, NOW()),
  COALESCE(
    t.published_by,
    (SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1)
  )
FROM neopro_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM template_versions tv
  WHERE tv.template_id = t.id AND tv.version = COALESCE(t.version, '1.0')
);

-- =============================================================================
-- 5) GRANTS DEFAULT — backfill is_public sur backgrounds (aucun à ce stade)
-- =============================================================================
-- Aucun background existant en DB → table vide après cette migration.
-- Les premiers backgrounds seront uploadés en phase 2 du chantier JOUEUR.
