-- Migration: Template Studio v2 — textes enfants de layer + safe-zones image + animations réversibles
-- ADR-086
-- Date: 2026-04-22
--
-- Backward-compat: toutes les nouvelles colonnes ont des défauts safe.
-- Les templates existants (BUT Simple, BUT Img Joueur V2) continuent de rendre
-- identiquement après le backfill (textes rattachés au layer z_index=1).

BEGIN;

-- =============================================================================
-- 1. Text fields deviennent enfants d'un layer
-- =============================================================================
ALTER TABLE template_text_fields
  ADD COLUMN IF NOT EXISTS layer_id UUID REFERENCES template_layers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS respect_alpha BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS animation_direction VARCHAR(4) NOT NULL DEFAULT 'in'
    CHECK (animation_direction IN ('in', 'out'));

-- Backfill : attacher chaque text field au premier layer (z_index ASC) de son template.
-- Utilise DISTINCT ON pour garantir un seul layer par template.
UPDATE template_text_fields tf
SET layer_id = sub.layer_id
FROM (
  SELECT DISTINCT ON (template_id) template_id, id AS layer_id
  FROM template_layers
  ORDER BY template_id, z_index ASC, id ASC
) sub
WHERE tf.template_id = sub.template_id
  AND tf.layer_id IS NULL;

-- Après backfill, verrouiller la colonne NOT NULL (source de vérité ADR-086).
ALTER TABLE template_text_fields
  ALTER COLUMN layer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_text_fields_layer_id
  ON template_text_fields (layer_id);

-- =============================================================================
-- 2. Safe-zones sur image slots
-- =============================================================================
ALTER TABLE template_image_slots
  ADD COLUMN IF NOT EXISTS anchor VARCHAR(16) NOT NULL DEFAULT 'center'
    CHECK (anchor IN (
      'top-left', 'top-center', 'top-right',
      'center-left', 'center', 'center-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    )),
  ADD COLUMN IF NOT EXISTS fit_mode VARCHAR(32) NOT NULL DEFAULT 'contain'
    CHECK (fit_mode IN ('contain', 'cover', 'fill-width-anchor-top', 'fill-height-anchor-left')),
  ADD COLUMN IF NOT EXISTS safe_top_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS safe_left_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS safe_width_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS safe_height_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS overflow VARCHAR(16) NOT NULL DEFAULT 'hidden'
    CHECK (overflow IN ('hidden', 'visible', 'top', 'bottom', 'left', 'right')),
  ADD COLUMN IF NOT EXISTS animation_direction VARCHAR(4) NOT NULL DEFAULT 'in'
    CHECK (animation_direction IN ('in', 'out'));

-- =============================================================================
-- 3. Fonts — URL dynamique pour chargement DB-driven
-- =============================================================================
-- template_fonts existe déjà (ADR-084). On ajoute woff2_url pour permettre
-- le chargement dynamique côté runtime et dashboard, fallback sur chargement
-- statique si NULL.
ALTER TABLE template_fonts
  ADD COLUMN IF NOT EXISTS woff2_url VARCHAR(512);

-- =============================================================================
-- Note : pas de table `animation_presets` — les presets sont des string literals
-- (enum côté types + whitelist Joi). Les nouvelles valeurs 'zoom' et 'logo-pop'
-- sont ajoutées en Wave 2 (middleware/validation.ts) + types côté serveur et
-- dashboard, sans changement de schéma DB ici.
-- =============================================================================

COMMIT;
