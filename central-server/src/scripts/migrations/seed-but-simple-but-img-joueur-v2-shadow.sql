-- Migration: ADR-075 Sprint 4 — Seed V2 shadow data pour ButSimple / ButImgJoueur
-- -----------------------------------------------------------------------------
-- Objectif : préparer la migration future des templates legacy vers le runtime
-- data-driven V2 en peuplant d'ores et déjà `template_variants`,
-- `template_text_fields` et `template_image_slots` pour les deux templates
-- historiques. Le champ `schema_version` reste intentionnellement à 1 — la
-- route `GET /:id/studio` continue de retourner 404 et le worker Remotion
-- continue d'utiliser la composition codée. Aucun impact production.
--
-- Pour activer le mode V2 sur un template donné après validation QA :
--   UPDATE madxp_templates SET schema_version=2 WHERE composition_id='ButSimple';
-- (à exécuter manuellement, voir docs/adr/ADR-075-remotion-template-studio-v2.md).
--
-- Idempotence : toutes les insertions utilisent ON CONFLICT DO NOTHING ou
-- NOT EXISTS pour pouvoir rejouer la migration sans effet de bord.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  but_simple_id   UUID;
  but_joueur_id   UUID;
BEGIN
  SELECT id INTO but_simple_id FROM madxp_templates WHERE composition_id = 'ButSimple' LIMIT 1;
  SELECT id INTO but_joueur_id FROM madxp_templates WHERE composition_id = 'ButImgJoueur' LIMIT 1;

  -- ── ButSimple ────────────────────────────────────────────────────────────
  IF but_simple_id IS NOT NULL THEN
    -- 1 variant par défaut (placeholder — l'URL réelle sera remplie au flip V2)
    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    SELECT but_simple_id, 'Classique', '', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM template_variants WHERE template_id = but_simple_id
    );

    -- Champs texte (prenom / nom / club)
    INSERT INTO template_text_fields
      (template_id, slot_key, label, position_x, position_y, font_size, appear_at, default_value, required, sort_order)
    VALUES
      (but_simple_id, 'prenom', 'Prénom', 0.5, 0.45, 96, 1.0, '', true, 0),
      (but_simple_id, 'nom',    'Nom',    0.5, 0.55, 120, 1.0, '', true, 1),
      (but_simple_id, 'club',   'Club',   0.5, 0.75, 64, 1.5, '', true, 2)
    ON CONFLICT (template_id, slot_key) DO NOTHING;

    -- Slot image (logo club)
    INSERT INTO template_image_slots
      (template_id, slot_key, label, position_x, position_y, width, height, appear_at, appear_duration, animation, aspect_ratio, required, sort_order)
    VALUES
      (but_simple_id, 'logoSrc', 'Logo club', 0.8, 0.1, 0.15, 0.15, 0.5, 0.3, 'fade', '1:1', false, 0)
    ON CONFLICT (template_id, slot_key) DO NOTHING;
  END IF;

  -- ── ButImgJoueur ─────────────────────────────────────────────────────────
  IF but_joueur_id IS NOT NULL THEN
    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    SELECT but_joueur_id, 'Classique', '', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM template_variants WHERE template_id = but_joueur_id
    );

    INSERT INTO template_text_fields
      (template_id, slot_key, label, position_x, position_y, font_size, appear_at, default_value, required, sort_order)
    VALUES
      (but_joueur_id, 'prenom',     'Prénom',    0.5, 0.40, 96, 1.0, '', true, 0),
      (but_joueur_id, 'nom',        'Nom',       0.5, 0.50, 120, 1.0, '', true, 1),
      (but_joueur_id, 'club',       'Club',      0.5, 0.70, 64, 1.5, '', true, 2),
      (but_joueur_id, 'scoreLabel', 'Score',     0.85, 0.20, 80, 2.0, '+1', false, 3)
    ON CONFLICT (template_id, slot_key) DO NOTHING;

    INSERT INTO template_image_slots
      (template_id, slot_key, label, position_x, position_y, width, height, appear_at, appear_duration, animation, aspect_ratio, required, sort_order)
    VALUES
      (but_joueur_id, 'logoSrc',      'Logo club',   0.85, 0.10, 0.12, 0.12, 0.5, 0.3, 'fade',     '1:1', false, 0),
      (but_joueur_id, 'playerImgSrc', 'Photo joueur', 0.5, 0.35, 0.35, 0.45, 1.2, 0.3, 'scale-in', '3:4', false, 1)
    ON CONFLICT (template_id, slot_key) DO NOTHING;
  END IF;
END$$;

COMMENT ON COLUMN madxp_templates.schema_version IS
  'ADR-075 : 1 = legacy (composition codée), 2 = data-driven (couches+slots). Migration ButSimple/ButImgJoueur : shadow data seedée Sprint 4, flip vers 2 manuel après QA.';
