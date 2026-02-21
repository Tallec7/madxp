-- =============================================================================
-- Backfill: Enrichir video_plays avec le contexte de advertiser_impressions
-- =============================================================================
-- Before dropping advertiser_impressions, we need to backfill any sponsor context
-- (event_type, period, audience_estimate) that exists in advertiser_impressions
-- but is missing from video_plays.
--
-- Strategy: Match on (site_id, video_filename, played_at within 5s window)
-- since both tables tracked the same play events.
--
-- Idempotent:
--   - Skips entirely if advertiser_impressions doesn't exist (Pipeline B was
--     never functional — returned 401, table may not exist in some environments)
--   - Uses WHERE ... IS NULL to avoid overwriting existing data
-- =============================================================================

DO $$
DECLARE
  table_exists BOOLEAN;
  backfilled_count INTEGER;
  total_ai_count INTEGER;
  total_vp_sponsor INTEGER;
BEGIN
  -- Check if advertiser_impressions exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'advertiser_impressions'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'SKIP: advertiser_impressions table does not exist';
    RAISE NOTICE 'Pipeline B (sponsor_impressions) was never functional.';
    RAISE NOTICE 'No data to backfill — this is expected.';
    RAISE NOTICE '===========================================';

    -- Report video_plays sponsor stats anyway
    SELECT COUNT(*) INTO total_vp_sponsor FROM video_plays WHERE category = 'sponsor';
    RAISE NOTICE 'video_plays (sponsor) rows: %', total_vp_sponsor;
    RETURN;
  END IF;

  -- 1. Backfill event_type, period, audience_estimate from advertiser_impressions
  EXECUTE '
    UPDATE video_plays vp
    SET
      event_type = COALESCE(vp.event_type, ai.event_type),
      period = COALESCE(vp.period, ai.period),
      audience_estimate = COALESCE(vp.audience_estimate, ai.audience_estimate),
      site_sponsor_id = COALESCE(vp.site_sponsor_id, ai.site_sponsor_id)
    FROM advertiser_impressions ai
    WHERE vp.site_id = ai.site_id
      AND vp.video_filename = ai.video_filename
      AND vp.played_at BETWEEN ai.played_at - INTERVAL ''5 seconds'' AND ai.played_at + INTERVAL ''5 seconds''
      AND vp.category = ''sponsor''
      AND (vp.event_type IS NULL OR vp.period IS NULL OR vp.audience_estimate IS NULL OR vp.site_sponsor_id IS NULL)
  ';

  -- 2. Backfill sponsor_id where missing (from advertiser_impressions.advertiser_id)
  EXECUTE '
    UPDATE video_plays vp
    SET sponsor_id = ai.advertiser_id
    FROM advertiser_impressions ai
    WHERE vp.site_id = ai.site_id
      AND vp.video_filename = ai.video_filename
      AND vp.played_at BETWEEN ai.played_at - INTERVAL ''5 seconds'' AND ai.played_at + INTERVAL ''5 seconds''
      AND vp.category = ''sponsor''
      AND vp.sponsor_id IS NULL
      AND ai.advertiser_id IS NOT NULL
  ';

  -- 3. Report results
  EXECUTE 'SELECT COUNT(*) FROM advertiser_impressions' INTO total_ai_count;
  SELECT COUNT(*) INTO total_vp_sponsor FROM video_plays WHERE category = 'sponsor';
  SELECT COUNT(*) INTO backfilled_count FROM video_plays WHERE category = 'sponsor' AND event_type IS NOT NULL;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  advertiser_impressions rows: %', total_ai_count;
  RAISE NOTICE '  video_plays (sponsor) rows: %', total_vp_sponsor;
  RAISE NOTICE '  video_plays with event_type filled: %', backfilled_count;
  RAISE NOTICE '===========================================';
END $$;
