-- Migration: Template Studio v2 — extension presets animation (zoom, logo-pop)
-- ADR-086
-- Date: 2026-04-22
--
-- Étend le CHECK constraint sur `animation` pour accepter les nouveaux presets
-- `zoom` (reversible via direction in|out → remplace scale-in et ancien zoom-out)
-- et `logo-pop` (spring bounce pour apparitions logo).
--
-- Backward-compat: aucune modification des rows existants, seuls de nouveaux
-- presets sont autorisés. Les templates existants continuent de rendre
-- identiquement.

BEGIN;

-- =============================================================================
-- 1. template_text_fields.animation
-- =============================================================================
ALTER TABLE template_text_fields
  DROP CONSTRAINT IF EXISTS template_text_fields_animation_check;

ALTER TABLE template_text_fields
  ADD CONSTRAINT template_text_fields_animation_check
  CHECK (animation IN (
    'none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in',
    'zoom', 'logo-pop'
  ));

-- =============================================================================
-- 2. template_image_slots.animation
-- =============================================================================
ALTER TABLE template_image_slots
  DROP CONSTRAINT IF EXISTS template_image_slots_animation_check;

ALTER TABLE template_image_slots
  ADD CONSTRAINT template_image_slots_animation_check
  CHECK (animation IN (
    'none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in',
    'zoom', 'logo-pop'
  ));

COMMIT;
