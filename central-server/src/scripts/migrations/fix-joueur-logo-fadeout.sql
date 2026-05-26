-- Migration: Fix logo/numéro intro — fade-out après l'intro
-- -----------------------------------------------------------------------------
-- Bug observé : le logo (ou numéro) reste visible sur le packshot final car le
-- WebM PACKSHOT_GENERIQUE.webm a un trou alpha central qui laisse passer les
-- éléments des layers du dessous.
--
-- Solution conforme spec PDF : Option A = designer rebouche le trou alpha.
-- Workaround data (cette migration) : Option B = fade-out le logo/numéro
-- après l'intro. Trade-off : perte du zoom-in synchronisé avec l'hexagone
-- (logo apparaît à taille finale dès t=0 au lieu de zoomer).
--
-- Timing :
--   - JOUEUR SIMPLE : intro hexagone freeze à 1.7s → fade out 1.7-2.2s
--   - JOUEUR BUT    : intro logo freeze à 2.12s → fade out 2.12-2.62s
--
-- direction='out' : élément visible avant appear_at, fade vers invisible
-- pendant la fenêtre, invisible après.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  simple_generique_id UUID;
  simple_image_id UUID;
  but_generique_id UUID;
BEGIN
  SELECT id INTO simple_generique_id FROM madxp_templates WHERE composition_id = 'JoueurSimpleGenerique';
  SELECT id INTO simple_image_id FROM madxp_templates WHERE composition_id = 'JoueurSimpleImage';
  SELECT id INTO but_generique_id FROM madxp_templates WHERE composition_id = 'JoueurButGenerique';

  -- ── JOUEUR SIMPLE GÉNÉRIQUE : logo + numero fade-out à 1.7s ──
  IF simple_generique_id IS NOT NULL THEN
    UPDATE template_image_slots
    SET animation = 'fade',
        animation_direction = 'out',
        appear_at = 1.7,
        appear_duration = 0.5,
        scale_from = 1.0,
        scale_to = 1.0
    WHERE template_id = simple_generique_id AND slot_key = 'logoSrc';

    UPDATE template_text_fields
    SET animation = 'fade',
        animation_direction = 'out',
        appear_at = 1.7,
        appear_duration = 0.5,
        scale_from = 1.0,
        scale_to = 1.0
    WHERE template_id = simple_generique_id AND slot_key = 'numeroIntro';

    RAISE NOTICE 'Updated SIMPLE Générique logo/numero fade-out';
  END IF;

  -- ── JOUEUR SIMPLE IMAGE : logo + numero fade-out à 1.7s ──
  IF simple_image_id IS NOT NULL THEN
    UPDATE template_image_slots
    SET animation = 'fade',
        animation_direction = 'out',
        appear_at = 1.7,
        appear_duration = 0.5,
        scale_from = 1.0,
        scale_to = 1.0
    WHERE template_id = simple_image_id AND slot_key = 'logoSrc';

    UPDATE template_text_fields
    SET animation = 'fade',
        animation_direction = 'out',
        appear_at = 1.7,
        appear_duration = 0.5,
        scale_from = 1.0,
        scale_to = 1.0
    WHERE template_id = simple_image_id AND slot_key = 'numeroIntro';

    RAISE NOTICE 'Updated SIMPLE Image logo/numero fade-out';
  END IF;

  -- ── JOUEUR BUT GÉNÉRIQUE : logo fade-out à 2.12s (intro plus longue) ──
  IF but_generique_id IS NOT NULL THEN
    UPDATE template_image_slots
    SET animation = 'fade',
        animation_direction = 'out',
        appear_at = 2.12,
        appear_duration = 0.5,
        scale_from = 1.0,
        scale_to = 1.0
    WHERE template_id = but_generique_id AND slot_key = 'logoSrc';

    RAISE NOTICE 'Updated BUT Générique logo fade-out';
  END IF;

END$$;
