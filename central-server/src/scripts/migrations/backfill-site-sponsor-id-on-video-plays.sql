-- =============================================================================
-- Backfill: Résoudre site_sponsor_id sur video_plays via video_filename
-- =============================================================================
-- Les video_plays antérieures à l'auto-résolution (déploiement) ont
-- site_sponsor_id = NULL. Ce script les résout via site_sponsor_videos
-- en matchant (video_filename, site_id).
--
-- Idempotent : ne touche que les lignes avec site_sponsor_id IS NULL.
-- Safe : UPDATE avec JOIN, pas de suppression.
-- =============================================================================

DO $$
DECLARE
  before_null   INTEGER;
  before_filled INTEGER;
  updated_count INTEGER;
  after_null    INTEGER;
  after_filled  INTEGER;
BEGIN
  -- 1. État avant backfill
  SELECT
    COUNT(*) FILTER (WHERE site_sponsor_id IS NULL),
    COUNT(*) FILTER (WHERE site_sponsor_id IS NOT NULL)
  INTO before_null, before_filled
  FROM video_plays
  WHERE category = 'sponsor';

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Backfill site_sponsor_id on video_plays';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Before: % with site_sponsor_id, % without', before_filled, before_null;

  IF before_null = 0 THEN
    RAISE NOTICE 'Nothing to backfill — all sponsor plays already have site_sponsor_id.';
    RETURN;
  END IF;

  -- 2. Backfill via video_filename → site_sponsor_videos → site_sponsors
  UPDATE video_plays vp
  SET site_sponsor_id = ssv.site_sponsor_id
  FROM site_sponsor_videos ssv
  JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id AND ss.site_id = vp.site_id
  WHERE vp.video_filename = ssv.video_filename
    AND vp.category = 'sponsor'
    AND vp.site_sponsor_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- 3. État après backfill
  SELECT
    COUNT(*) FILTER (WHERE site_sponsor_id IS NULL),
    COUNT(*) FILTER (WHERE site_sponsor_id IS NOT NULL)
  INTO after_null, after_filled
  FROM video_plays
  WHERE category = 'sponsor';

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'Updated: % rows', updated_count;
  RAISE NOTICE 'After:  % with site_sponsor_id, % still without', after_filled, after_null;

  IF after_null > 0 THEN
    RAISE NOTICE 'NOTE: % plays still unresolved (video_filename not in site_sponsor_videos)', after_null;
  END IF;

  RAISE NOTICE '===========================================';
END $$;
