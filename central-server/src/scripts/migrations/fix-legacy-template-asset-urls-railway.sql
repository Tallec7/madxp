-- Migration: fix URLs des assets templates legacy (ButSimple / ButImgJoueur)
-- -----------------------------------------------------------------------------
-- Contexte : backfill-legacy-templates-v2-urls.sql avait stocké des URLs FTP
-- (kalonpartners.bzh/neopro-video/template-assets/studio/legacy/) qui n'ont
-- jamais été uploadées sur Hostinger. Les .webm sont bundlés dans le Docker de
-- production sous templates-remotion/public/ et servis directement par le
-- central-server sous /remotion-preview/public/ avec CORS + CORP.
--
-- Ce correctif remplace les URLs FTP inexistantes par des URLs Railway qui
-- pointent vers les assets bundlés (toujours disponibles, pas de dépendance FTP).
--
-- /remotion-preview/public/ sert désormais avec :
--   Access-Control-Allow-Origin: *
--   Cross-Origin-Resource-Policy: cross-origin
-- → le dashboard Angular (kalonpartners.bzh) peut charger via <video> cross-origin.
--
-- Idempotence : UPDATE filtre uniquement les lignes qui contiennent encore
-- l'ancienne URL FTP (ne touche pas les variants/layers avec URL custom).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  old_base TEXT := 'https://kalonpartners.bzh/neopro-video/template-assets/studio/legacy';
  new_base TEXT := 'https://neopro-central-production.up.railway.app/remotion-preview/public';
  but_simple_id   UUID;
  but_joueur_id   UUID;
BEGIN
  SELECT id INTO but_simple_id FROM madxp_templates WHERE composition_id = 'ButSimple' LIMIT 1;
  SELECT id INTO but_joueur_id FROM madxp_templates WHERE composition_id = 'ButImgJoueur' LIMIT 1;

  -- ── template_variants ────────────────────────────────────────────────────────
  UPDATE template_variants
     SET background_video_url = replace(background_video_url, old_base, new_base)
   WHERE template_id IN (but_simple_id, but_joueur_id)
     AND background_video_url LIKE old_base || '%';

  -- ── template_layers ──────────────────────────────────────────────────────────
  UPDATE template_layers
     SET video_url = replace(video_url, old_base, new_base)
   WHERE template_id IN (but_simple_id, but_joueur_id)
     AND video_url LIKE old_base || '%';

END $$;
