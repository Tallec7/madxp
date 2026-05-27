-- Migration: fix URLs des assets du template "Joueur détaillé" (ADR-086)
-- -----------------------------------------------------------------------------
-- Contexte : le seed initial (`seed-joueur-detaille-template.sql`) avait créé
-- les layers avec une base FTP inexistante :
--   https://kalonpartners.bzh/neopro-video/template-assets/studio/joueur-detaille/
--     {A,B,C,D,E}.webm
-- Résultat : 404 HTML relayés par /api/remotion-templates/asset-proxy, le
-- <video> du dashboard boucle sur l'erreur et cascade en NotSameOrigin.
--
-- Le commit `502f81b1f` a repointé le seed sur le bundle Railway mais il est
-- idempotent (`IF NOT EXISTS`) : les layers déjà présents en prod n'ont pas
-- été mis à jour. Cette migration force le repoint via UPDATE ciblé.
--
-- OLD : {old_base}/{A..E}.webm
-- NEW : {new_base}/BUT_img_joueur_{A..E}.webm
--
-- `replace()` gère la transformation en un seul coup : il matche le préfixe
-- complet (incluant `/joueur-detaille/`) et le substitue par `/BUT_img_joueur_`.
-- Le suffixe `A.webm`..`E.webm` est préservé tel quel.
--
-- Idempotence : le WHERE filtre uniquement les lignes contenant encore
-- l'ancien préfixe. Re-run = no-op.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  old_prefix TEXT := 'https://kalonpartners.bzh/neopro-video/template-assets/studio/joueur-detaille/';
  new_prefix TEXT := 'https://neopro-central-production.up.railway.app/remotion-preview/public/BUT_img_joueur_';
  tpl_id     UUID;
BEGIN
  SELECT id INTO tpl_id FROM neopro_templates WHERE composition_id = 'JoueurDetaille' LIMIT 1;

  IF tpl_id IS NULL THEN
    RAISE NOTICE 'Template JoueurDetaille absent — seed non appliqué, migration skippée.';
    RETURN;
  END IF;

  -- Layers : source de vérité pour les assets vidéo du template
  UPDATE template_layers
     SET video_url = replace(video_url, old_prefix, new_prefix)
   WHERE template_id = tpl_id
     AND video_url LIKE old_prefix || '%';

  -- Variants : defensive (le seed crée background_video_url = '' mais un
  -- éventuel row custom pourrait pointer vers l'ancien FTP)
  UPDATE template_variants
     SET background_video_url = replace(background_video_url, old_prefix, new_prefix)
   WHERE template_id = tpl_id
     AND background_video_url LIKE old_prefix || '%';
END $$;
