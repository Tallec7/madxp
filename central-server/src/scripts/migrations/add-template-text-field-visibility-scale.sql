-- Migration: Template text fields — always_visible + scale_from + scale_to
-- Permet à un champ texte d'être toujours visible (sans timecode) et de
-- paramétrer les valeurs de départ/arrivée pour l'animation scale-in.

ALTER TABLE template_text_fields
  ADD COLUMN IF NOT EXISTS always_visible BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scale_from     NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS scale_to       NUMERIC(4,2) NOT NULL DEFAULT 1.00;

COMMENT ON COLUMN template_text_fields.always_visible IS
  'Si TRUE, le texte est visible sur toute la durée sans timecode (ignore appear_at / appear_duration)';
COMMENT ON COLUMN template_text_fields.scale_from IS
  'Valeur de départ de scale pour l''animation scale-in (défaut 0.70)';
COMMENT ON COLUMN template_text_fields.scale_to IS
  'Valeur d''arrivée de scale pour l''animation scale-in (défaut 1.00)';
