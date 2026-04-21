-- Migration: Template Studio v2 — canvas dimensions (ADR-075)
-- Ajoute canvas_width / canvas_height au template pour supporter 16:9, 9:16, 1:1.
-- Defaults = 1920×1080 pour rester cohérent avec les templates existants (TV club).

ALTER TABLE neopro_templates
  ADD COLUMN IF NOT EXISTS canvas_width  INT NOT NULL DEFAULT 1920,
  ADD COLUMN IF NOT EXISTS canvas_height INT NOT NULL DEFAULT 1080;

COMMENT ON COLUMN neopro_templates.canvas_width  IS 'ADR-075 : largeur canvas Remotion (px). Défaut 1920 (16:9 TV).';
COMMENT ON COLUMN neopro_templates.canvas_height IS 'ADR-075 : hauteur canvas Remotion (px). Défaut 1080 (16:9 TV).';
