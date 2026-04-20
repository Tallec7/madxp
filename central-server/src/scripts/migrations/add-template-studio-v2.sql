-- Migration: Template Studio v2 — ADR-075
-- Extension du modèle neopro_templates pour supporter le compositeur multi-couches
-- data-driven : variantes bg + couches alpha + slots texte + slots image.
--
-- Retro-compat : les templates existants (ButSimple, ButImgJoueur) restent en
-- schema_version=1 et continuent d'utiliser leur composition codée. Les
-- nouveaux templates créés via le studio utilisent schema_version=2 et la
-- meta-composition runtime (TemplateRuntime.tsx).

-- 1) Extension de la table existante
ALTER TABLE neopro_templates
  ADD COLUMN IF NOT EXISTS schema_version   INT          NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2) NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS fps              INT          NOT NULL DEFAULT 30;

COMMENT ON COLUMN neopro_templates.schema_version IS
  'ADR-075 : 1 = legacy (composition codée), 2 = data-driven (couches+slots)';

-- 2) Variantes (vidéos bg opaques, même structure, couleurs différentes)
CREATE TABLE IF NOT EXISTS template_variants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id            UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  name                   VARCHAR(100) NOT NULL,
  background_video_url   TEXT NOT NULL,
  thumbnail_url          TEXT,
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE template_variants IS 'ADR-075 : variantes couleur/ton d''un template (ex: rouge/bleu/vert)';

-- 3) Couches alpha (MOV empilés en Z)
CREATE TABLE IF NOT EXISTS template_layers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  video_url   TEXT NOT NULL,
  z_index     INT  NOT NULL,
  mask_top    NUMERIC(4,3) NOT NULL DEFAULT 0,
  mask_bottom NUMERIC(4,3) NOT NULL DEFAULT 0,
  mask_left   NUMERIC(4,3) NOT NULL DEFAULT 0,
  mask_right  NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (mask_top    BETWEEN 0 AND 1),
  CHECK (mask_bottom BETWEEN 0 AND 1),
  CHECK (mask_left   BETWEEN 0 AND 1),
  CHECK (mask_right  BETWEEN 0 AND 1)
);

COMMENT ON TABLE template_layers IS 'ADR-075 : couches alpha empilées en Z (Gabin AE → MOV)';

-- 4) Champs texte (slots éditables par l'user)
CREATE TABLE IF NOT EXISTS template_text_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  slot_key        VARCHAR(64) NOT NULL,
  label           VARCHAR(200) NOT NULL,
  position_x      NUMERIC(5,4) NOT NULL,
  position_y      NUMERIC(5,4) NOT NULL,
  max_width       NUMERIC(5,4) NOT NULL DEFAULT 0.8,
  font_family     VARCHAR(80)  NOT NULL DEFAULT 'Anton',
  font_size       INT          NOT NULL,
  color           VARCHAR(16)  NOT NULL DEFAULT '#FFFFFF',
  align           VARCHAR(10)  NOT NULL DEFAULT 'center',
  appear_at       NUMERIC(5,2) NOT NULL,
  appear_duration NUMERIC(4,2) NOT NULL DEFAULT 0.4,
  animation       VARCHAR(20)  NOT NULL DEFAULT 'fade',
  default_value   TEXT         NOT NULL DEFAULT '',
  max_chars       INT,
  multiline       BOOLEAN      NOT NULL DEFAULT FALSE,
  required        BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order      INT          NOT NULL DEFAULT 0,
  UNIQUE (template_id, slot_key),
  CHECK (align IN ('left', 'center', 'right')),
  CHECK (animation IN ('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in')),
  CHECK (position_x BETWEEN 0 AND 1),
  CHECK (position_y BETWEEN 0 AND 1),
  CHECK (max_width  BETWEEN 0 AND 1)
);

COMMENT ON TABLE template_text_fields IS 'ADR-075 : champs texte éditables par l''user (position + timing + animation)';

-- 5) Slots image (logos, photos joueur...)
CREATE TABLE IF NOT EXISTS template_image_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  slot_key        VARCHAR(64) NOT NULL,
  label           VARCHAR(200) NOT NULL,
  position_x      NUMERIC(5,4) NOT NULL,
  position_y      NUMERIC(5,4) NOT NULL,
  width           NUMERIC(5,4) NOT NULL,
  height          NUMERIC(5,4) NOT NULL,
  appear_at       NUMERIC(5,2) NOT NULL,
  appear_duration NUMERIC(4,2) NOT NULL DEFAULT 0.4,
  animation       VARCHAR(20)  NOT NULL DEFAULT 'fade',
  aspect_ratio    VARCHAR(16),
  required        BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order      INT          NOT NULL DEFAULT 0,
  UNIQUE (template_id, slot_key),
  CHECK (animation IN ('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in')),
  CHECK (position_x BETWEEN 0 AND 1),
  CHECK (position_y BETWEEN 0 AND 1),
  CHECK (width  BETWEEN 0 AND 1),
  CHECK (height BETWEEN 0 AND 1)
);

COMMENT ON TABLE template_image_slots IS 'ADR-075 : slots image éditables (position + dimensions + timing)';

-- 6) Indexes
CREATE INDEX IF NOT EXISTS idx_variants_template ON template_variants(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_layers_template   ON template_layers(template_id, z_index);
CREATE INDEX IF NOT EXISTS idx_text_template     ON template_text_fields(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_image_template    ON template_image_slots(template_id, sort_order);
