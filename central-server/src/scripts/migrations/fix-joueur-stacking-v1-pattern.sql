-- Migration: Fix stacking JOUEUR templates (pattern BUT Simple V1)
-- -----------------------------------------------------------------------------
-- Bug : le packshot ne couvre pas le logo pendant la phase finale de la vidéo.
-- Cause : mauvais ordre des z_index des layers dans la migration originale.
--
-- Pattern correct (BUT Simple V1, qui marche depuis longtemps) :
--
--   z=0 : Layer A           (fond intro hexagone)
--   z=0.5 : Logo slot       (enfant de A) — couvert par P quand P opaque
--   z=1 : Layer P (packshot) — couvre A+logo quand opaque
--   z=1.5 : Textes packshot (enfant de P, respect_alpha=FALSE)
--   z=2 : Layer B (transition wipe) — TOP, par-dessus tout pendant la transition
--
-- Avec ce stacking :
--   - intro (P et B transparents) : logo + A visibles
--   - transition (B opaque) : tout caché par B
--   - packshot (P opaque, B transparent) : logo caché par P, textes visibles
--
-- Pour JOUEUR But (5 layers : A, B, C, D, P) :
--   z=0 : A     (intro logo)
--   z=1 : C     (titre)
--   z=2 : P     (packshot)
--   z=3 : B     (transition 1, wipe par-dessus A+C)
--   z=4 : D     (transition 2, wipe par-dessus C+P)
--
-- Avec respect_alpha=FALSE sur les slots, ils restent au-dessus de leur parent
-- (z=parent.z + 0.5) et sont masqués par les transitions B/D quand opaques.
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

  -- ── JOUEUR SIMPLE GÉNÉRIQUE : swap z_index B↔P + respect_alpha OFF ──
  IF simple_generique_id IS NOT NULL THEN
    -- Layer P (packshot) z=2 → z=1
    UPDATE template_layers SET z_index = 1
     WHERE template_id = simple_generique_id AND name = 'P — packshot générique';
    -- Layer B (transition) z=1 → z=2 (TOP)
    UPDATE template_layers SET z_index = 2
     WHERE template_id = simple_generique_id AND name = 'B — transition';
    -- Slots packshot : respect_alpha OFF
    UPDATE template_text_fields SET respect_alpha = FALSE
     WHERE template_id = simple_generique_id
       AND slot_key IN ('nomClubHaut', 'nomClubBas', 'prenomNom');
    RAISE NOTICE 'Updated SIMPLE Générique stacking (P=1, B=2, respect_alpha=FALSE)';
  END IF;

  -- ── JOUEUR SIMPLE IMAGE : swap z_index B↔P + respect_alpha OFF ──
  IF simple_image_id IS NOT NULL THEN
    UPDATE template_layers SET z_index = 1
     WHERE template_id = simple_image_id AND name = 'P — packshot image';
    UPDATE template_layers SET z_index = 2
     WHERE template_id = simple_image_id AND name = 'B — transition';
    UPDATE template_text_fields SET respect_alpha = FALSE
     WHERE template_id = simple_image_id
       AND slot_key IN ('clubTopLeft', 'clubBottomLeft', 'clubBottomRight', 'prenomNom', 'numero');
    RAISE NOTICE 'Updated SIMPLE Image stacking';
  END IF;

  -- ── JOUEUR BUT GÉNÉRIQUE : réordonner 5 layers ──
  -- Original : A=0, B=1, C=2, D=3, P=4
  -- Cible    : A=0, C=1, P=2, B=3, D=4
  IF but_generique_id IS NOT NULL THEN
    -- A reste z=0
    UPDATE template_layers SET z_index = 1
     WHERE template_id = but_generique_id AND name = 'C — titre + pattern';
    UPDATE template_layers SET z_index = 2
     WHERE template_id = but_generique_id AND name = 'P — packshot générique';
    UPDATE template_layers SET z_index = 3
     WHERE template_id = but_generique_id AND name = 'B — transition 1';
    UPDATE template_layers SET z_index = 4
     WHERE template_id = but_generique_id AND name = 'D — transition 2';
    -- Slots packshot : respect_alpha OFF
    UPDATE template_text_fields SET respect_alpha = FALSE
     WHERE template_id = but_generique_id
       AND slot_key IN ('nomClubHaut', 'nomClubBas', 'prenomNom');
    -- Slot Titre (sur layer C) : respect_alpha OFF aussi (sinon caché sous C)
    UPDATE template_text_fields SET respect_alpha = FALSE
     WHERE template_id = but_generique_id AND slot_key = 'titre';
    RAISE NOTICE 'Updated BUT Générique stacking (A=0, C=1, P=2, B=3, D=4)';
  END IF;

END$$;
