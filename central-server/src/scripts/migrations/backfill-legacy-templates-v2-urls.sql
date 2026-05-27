-- Migration: ADR-075 — Backfill URLs V2 pour les templates legacy ButSimple / ButImgJoueur
-- -----------------------------------------------------------------------------
-- Contexte : `seed-but-simple-but-img-joueur-v2-shadow.sql` a créé les variants/
-- text_fields/image_slots mais laissé `background_video_url = ''` et zéro layer.
-- En v1 le runtime Remotion fallback sur `staticFile()` pour lire les .webm
-- bundlés (`templates-remotion/public/BUT_*.webm`). En v2 data-driven, le guard
-- `isValidSrc` du `TemplateRuntime` n'accepte QUE http/blob/data → preview noir.
--
-- Cette migration seed les URLs publiques des .webm (uploadés manuellement via
-- FileZilla sous `template-assets/studio/legacy/` sur Hostinger FTP) :
--   - `template_variants.background_video_url` ← fragment A
--   - `template_layers[]` ← fragments B..E (z-index incrémental)
--
-- Prérequis : les 8 fichiers .webm doivent être présents à
--   https://kalonpartners.bzh/neopro-video/template-assets/studio/legacy/
-- avant d'appliquer cette migration (upload manuel one-shot).
--
-- Idempotence :
--   - UPDATE ne touche que les variants à `background_video_url` vide/NULL
--   - INSERT layers uniquement si AUCUN layer n'existe déjà pour ce template
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  but_simple_id   UUID;
  but_joueur_id   UUID;
  base_url        TEXT := 'https://kalonpartners.bzh/neopro-video/template-assets/studio/legacy';
BEGIN
  SELECT id INTO but_simple_id FROM neopro_templates WHERE composition_id = 'ButSimple' LIMIT 1;
  SELECT id INTO but_joueur_id FROM neopro_templates WHERE composition_id = 'ButImgJoueur' LIMIT 1;

  -- ── ButSimple (3 fragments : A=background, B+C=layers) ───────────────────
  IF but_simple_id IS NOT NULL THEN
    UPDATE template_variants
       SET background_video_url = base_url || '/BUT_simple_A.webm'
     WHERE template_id = but_simple_id
       AND (background_video_url IS NULL OR background_video_url = '');

    IF NOT EXISTS (SELECT 1 FROM template_layers WHERE template_id = but_simple_id) THEN
      INSERT INTO template_layers (template_id, name, video_url, z_index, mask_top, mask_bottom, mask_left, mask_right)
      VALUES
        (but_simple_id, 'BUT_simple_B', base_url || '/BUT_simple_B.webm', 1, 0, 0, 0, 0),
        (but_simple_id, 'BUT_simple_C', base_url || '/BUT_simple_C.webm', 2, 0, 0, 0, 0);
    END IF;
  END IF;

  -- ── ButImgJoueur (5 fragments : A=background, B..E=layers) ───────────────
  IF but_joueur_id IS NOT NULL THEN
    UPDATE template_variants
       SET background_video_url = base_url || '/BUT_img_joueur_A.webm'
     WHERE template_id = but_joueur_id
       AND (background_video_url IS NULL OR background_video_url = '');

    IF NOT EXISTS (SELECT 1 FROM template_layers WHERE template_id = but_joueur_id) THEN
      INSERT INTO template_layers (template_id, name, video_url, z_index, mask_top, mask_bottom, mask_left, mask_right)
      VALUES
        (but_joueur_id, 'BUT_img_joueur_B', base_url || '/BUT_img_joueur_B.webm', 1, 0, 0, 0, 0),
        (but_joueur_id, 'BUT_img_joueur_C', base_url || '/BUT_img_joueur_C.webm', 2, 0, 0, 0, 0),
        (but_joueur_id, 'BUT_img_joueur_D', base_url || '/BUT_img_joueur_D.webm', 3, 0, 0, 0, 0),
        (but_joueur_id, 'BUT_img_joueur_E', base_url || '/BUT_img_joueur_E.webm', 4, 0, 0, 0, 0);
    END IF;
  END IF;
END $$;
