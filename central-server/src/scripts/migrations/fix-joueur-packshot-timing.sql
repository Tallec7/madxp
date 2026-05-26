-- Migration: Fix timing apparition textes packshot
-- -----------------------------------------------------------------------------
-- Bug observé : les textes du packshot (NOM DU CLUB haut/bas, PRÉNOM NOM)
-- apparaissent dès t=0 au lieu d'attendre la fin de la transition.
--
-- Cause : respect_alpha=TRUE ne masque les textes que sous le layer parent
-- (packshot, z=2). Les layers d'intro (z=0, z=1) sont SOUS les textes (z=1.5),
-- donc les textes sont visibles dès t=0.
--
-- Fix : utiliser appear_at pour différer l'apparition à la fin de la transition.
--
-- Spec PDF :
--   - JOUEUR SIMPLE : transition visible 1'10 → 2'19 (1700ms → 2760ms)
--     → Textes packshot apparaissent à t=2.76s
--   - JOUEUR BUT    : transition 2 visible 2'04 → 3'12 (2080ms → 3480ms)
--     → Textes packshot apparaissent à t=3.48s
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

  -- ── JOUEUR SIMPLE GÉNÉRIQUE : packshot textes apparaissent à 2.76s ──
  IF simple_generique_id IS NOT NULL THEN
    UPDATE template_text_fields
    SET appear_at = 2.76, appear_duration = 0.5
    WHERE template_id = simple_generique_id
      AND slot_key IN ('nomClubHaut', 'nomClubBas', 'prenomNom');
    RAISE NOTICE 'Updated SIMPLE Générique packshot text timing';
  END IF;

  -- ── JOUEUR SIMPLE IMAGE : packshot textes + photo apparaissent à 2.76s ──
  IF simple_image_id IS NOT NULL THEN
    UPDATE template_text_fields
    SET appear_at = 2.76, appear_duration = 0.5
    WHERE template_id = simple_image_id
      AND slot_key IN ('clubTopLeft', 'clubBottomLeft', 'clubBottomRight', 'prenomNom', 'numero');
    UPDATE template_image_slots
    SET appear_at = 2.76, appear_duration = 0.5
    WHERE template_id = simple_image_id
      AND slot_key = 'photoJoueur';
    RAISE NOTICE 'Updated SIMPLE Image packshot text+image timing';
  END IF;

  -- ── JOUEUR BUT GÉNÉRIQUE : packshot textes apparaissent à 3.48s ──
  IF but_generique_id IS NOT NULL THEN
    UPDATE template_text_fields
    SET appear_at = 3.48, appear_duration = 0.5
    WHERE template_id = but_generique_id
      AND slot_key IN ('nomClubHaut', 'nomClubBas', 'prenomNom');
    RAISE NOTICE 'Updated BUT Générique packshot text timing';
  END IF;

END$$;
