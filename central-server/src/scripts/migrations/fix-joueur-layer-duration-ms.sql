-- Migration: Fix duration_ms layers JOUEUR — libère l'override sur les slots
-- -----------------------------------------------------------------------------
-- Bug root cause : tous les layers des templates JOUEUR ont duration_ms = 5960
-- (ou 6960 pour BUT).
--
-- Dans TemplateRuntime.tsx, `appearDurationSeconds()` retourne TOUJOURS
-- `parent.durationMs / 1000` quand le slot a un layerId et que durationMs > 0.
-- Cela override le `appear_duration` propre du slot.
--
-- Conséquence :
--   - Logo fade-out : fenêtre de 5.96s au lieu de 0.5s → logo à ~28% opacité
--     à la fin de la vidéo (jamais invisible avant fin de composition)
--   - Textes packshot : fade-in sur 5.96s au lieu de 0.5s → opacité partielle
--
-- Fix : duration_ms = 0 sur tous les layers des 3 templates JOUEUR.
-- La check constraint autorise 0 (duration_ms >= 0).
-- `appearDurationSeconds` retourne alors `slotAppearDuration` (slot propre).
--
-- Impact sur le rendu z-index : aucun (duration_ms n'est pas utilisé pour le
-- stacking, seulement pour le timing des animations de slot).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  simple_generique_id UUID;
  simple_image_id UUID;
  but_generique_id UUID;
BEGIN
  SELECT id INTO simple_generique_id FROM neopro_templates WHERE composition_id = 'JoueurSimpleGenerique';
  SELECT id INTO simple_image_id FROM neopro_templates WHERE composition_id = 'JoueurSimpleImage';
  SELECT id INTO but_generique_id FROM neopro_templates WHERE composition_id = 'JoueurButGenerique';

  -- ── JOUEUR SIMPLE GÉNÉRIQUE ──
  IF simple_generique_id IS NOT NULL THEN
    UPDATE template_layers SET duration_ms = 0
     WHERE template_id = simple_generique_id;
    RAISE NOTICE 'Fixed SIMPLE Générique layer duration_ms → 0 (% rows)',
      (SELECT COUNT(*) FROM template_layers WHERE template_id = simple_generique_id);
  END IF;

  -- ── JOUEUR SIMPLE IMAGE ──
  IF simple_image_id IS NOT NULL THEN
    UPDATE template_layers SET duration_ms = 0
     WHERE template_id = simple_image_id;
    RAISE NOTICE 'Fixed SIMPLE Image layer duration_ms → 0 (% rows)',
      (SELECT COUNT(*) FROM template_layers WHERE template_id = simple_image_id);
  END IF;

  -- ── JOUEUR BUT GÉNÉRIQUE ──
  IF but_generique_id IS NOT NULL THEN
    UPDATE template_layers SET duration_ms = 0
     WHERE template_id = but_generique_id;
    RAISE NOTICE 'Fixed BUT Générique layer duration_ms → 0 (% rows)',
      (SELECT COUNT(*) FROM template_layers WHERE template_id = but_generique_id);
  END IF;

END$$;
