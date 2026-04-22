-- Migration: Template Studio v2 — duration_ms par layer (ADR-086)
-- Date: 2026-04-22
--
-- Le layer est le conteneur de vérité de la durée (ADR-086). Les slots texte
-- et image rattachés à un layer héritent de sa durée. Sans cette colonne, le
-- runtime retombe sur la durée autonome du slot (backward-compat safe).
--
-- Défaut 5000 ms (= duration_seconds par défaut du template) pour préserver
-- le rendu des layers existants (BUT Simple, BUT Img Joueur V2).

BEGIN;

ALTER TABLE template_layers
  ADD COLUMN IF NOT EXISTS duration_ms INT NOT NULL DEFAULT 5000
    CHECK (duration_ms BETWEEN 0 AND 600000);

COMMENT ON COLUMN template_layers.duration_ms IS
  'ADR-086 : durée du layer en ms. Source de vérité pour les slots enfants.';

COMMIT;
