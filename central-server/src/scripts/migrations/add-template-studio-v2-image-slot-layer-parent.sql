-- Migration: ADR-086 — Ajoute layer_id à template_image_slots
-- -----------------------------------------------------------------------------
-- Complément à `add-template-studio-v2-layer-parent-safe-zone.sql` qui avait
-- ajouté layer_id uniquement sur template_text_fields. Les types serveur et
-- dashboard (TemplateImageSlot) référencent déjà la colonne — cette migration
-- la crée réellement côté DB.
--
-- Contrairement à text_fields, layer_id reste NULLABLE sur les image slots :
-- un logo peut être top-level (pas d'héritage de durée d'un layer).
-- -----------------------------------------------------------------------------

ALTER TABLE template_image_slots
  ADD COLUMN IF NOT EXISTS layer_id UUID REFERENCES template_layers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scale_from NUMERIC(5, 3),
  ADD COLUMN IF NOT EXISTS scale_to   NUMERIC(5, 3);

CREATE INDEX IF NOT EXISTS idx_image_slots_layer_id
  ON template_image_slots (layer_id);
