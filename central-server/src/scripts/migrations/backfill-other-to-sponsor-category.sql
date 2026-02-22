-- =============================================================================
-- Backfill: Reclasser les video_plays 'other' qui sont en réalité des sponsors
-- =============================================================================
-- Bug v3.69.4 : les vidéos ajoutées à la boucle par l'admin Pi n'avaient pas
-- analytics_category: 'sponsor'. Le detectCategory() sur le Pi catégorisait en
-- 'other' au lieu de 'sponsor'. Ces plays sont invisibles dans listBySite.
--
-- Ce script :
-- 1. Reclasse category 'other' → 'sponsor' pour les plays dont le filename
--    matche un sponsor via site_sponsor_videos
-- 2. Résout aussi le site_sponsor_id manquant sur ces plays reclassés
--
-- Idempotent : ne touche que category='other' avec un match sponsor.
-- Safe : UPDATE avec JOIN, pas de suppression. Réversible si besoin.
-- =============================================================================

DO $$
DECLARE
  other_total     INTEGER;
  reclassified    INTEGER;
  resolved_id     INTEGER;
  remaining_other INTEGER;
BEGIN
  -- 1. Combien de plays 'other' avec trigger_type='auto' (boucle) ?
  SELECT COUNT(*) INTO other_total
  FROM video_plays
  WHERE category = 'other' AND trigger_type = 'auto';

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Backfill: other → sponsor category';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Total auto plays with category=other: %', other_total;

  IF other_total = 0 THEN
    RAISE NOTICE 'Nothing to backfill — no auto plays with category=other.';
    RETURN;
  END IF;

  -- 2. Reclasser category 'other' → 'sponsor' pour les plays dont le filename
  --    matche une vidéo sponsor (via site_sponsor_videos)
  UPDATE video_plays vp
  SET category = 'sponsor'
  FROM site_sponsor_videos ssv
  JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id
  WHERE vp.video_filename = ssv.video_filename
    AND ss.site_id = vp.site_id
    AND vp.category = 'other'
    AND vp.trigger_type = 'auto';

  GET DIAGNOSTICS reclassified = ROW_COUNT;
  RAISE NOTICE 'Reclassified: % plays (other → sponsor)', reclassified;

  -- 3. Résoudre site_sponsor_id sur les plays fraîchement reclassés
  --    (ceux qui ont maintenant category='sponsor' mais site_sponsor_id IS NULL)
  UPDATE video_plays vp
  SET site_sponsor_id = ssv.site_sponsor_id
  FROM site_sponsor_videos ssv
  JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id
  WHERE vp.video_filename = ssv.video_filename
    AND ss.site_id = vp.site_id
    AND vp.category = 'sponsor'
    AND vp.site_sponsor_id IS NULL;

  GET DIAGNOSTICS resolved_id = ROW_COUNT;
  RAISE NOTICE 'Resolved site_sponsor_id: % plays', resolved_id;

  -- 4. Vérification finale
  SELECT COUNT(*) INTO remaining_other
  FROM video_plays
  WHERE category = 'other' AND trigger_type = 'auto';

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'Remaining auto plays with category=other: %', remaining_other;
  RAISE NOTICE '(ceux-ci n''ont pas de match dans site_sponsor_videos)';
  RAISE NOTICE '===========================================';
END $$;
