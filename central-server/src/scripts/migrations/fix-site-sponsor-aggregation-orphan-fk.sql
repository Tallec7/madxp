-- Migration: Fix FK violation in calculate_site_sponsor_daily_stats()
-- Date: 2026-04-16
-- Context: L'agrégation sponsor quotidienne échoue depuis 2026-04-09 avec
--   `site_sponsor_daily_stats_site_sponsor_id_fkey` violation.
--   video_plays contient des site_sponsor_id orphelins (sponsors supprimés
--   mais plays préservés — 15j de rétention). L'INSERT avec FK cascade
--   rejette alors tout le batch → zéro stats agrégées → checkAggregationStaleness()
--   alerte 137h+ sans données, et risque de perte définitive après cleanup.
--
-- Fix: Filtrer les plays orphelins via NOT EXISTS / EXISTS pour ne jamais
--   insérer un site_sponsor_id qui n'existe plus dans site_sponsors.
--   Les orphelins sont loggés (RAISE NOTICE) pour audit.

-- =============================================================================
-- 1. Patch calculate_site_sponsor_daily_stats avec garde EXISTS
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_site_sponsor_daily_stats(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_orphans INTEGER := 0;
BEGIN
  -- Log orphelins avant insertion (audit)
  SELECT COUNT(*) INTO v_orphans
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND NOT EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id);

  IF v_orphans > 0 THEN
    RAISE NOTICE 'Skipped % orphan site_sponsor_id plays for date %', v_orphans, p_date;
  END IF;

  -- Parent table: aggregate by (site_sponsor_id, site_id), filtrant les orphelins
  INSERT INTO site_sponsor_daily_stats (
    site_sponsor_id, site_id, date,
    total_impressions, total_screen_time_seconds, completed_plays,
    estimated_reach, manual_triggers, active_videos,
    impressions_match, screen_time_match, completed_match,
    impressions_training, screen_time_training, completed_training,
    impressions_tournament, screen_time_tournament, completed_tournament,
    impressions_other, screen_time_other, completed_other,
    impressions_pre_match, screen_time_pre_match, completed_pre_match,
    impressions_halftime, screen_time_halftime, completed_halftime,
    impressions_post_match, screen_time_post_match, completed_post_match,
    impressions_loop, screen_time_loop, completed_loop,
    audience_estimate_match, sponsor_id,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate), 0),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COUNT(DISTINCT vp.video_filename),
    COUNT(*) FILTER (WHERE vp.event_type = 'match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'match'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.event_type = 'training'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'training'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'training' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.event_type = 'tournament'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'tournament'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'tournament' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament') THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop' THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate) FILTER (WHERE vp.event_type = 'match'), 0),
    (array_agg(vp.sponsor_id) FILTER (WHERE vp.sponsor_id IS NOT NULL))[1],
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
    -- Garde FK : skip les orphelins (sponsors supprimés)
    AND EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id)
  GROUP BY vp.site_sponsor_id, vp.site_id
  ON CONFLICT (site_sponsor_id, date) DO UPDATE SET
    total_impressions = EXCLUDED.total_impressions,
    total_screen_time_seconds = EXCLUDED.total_screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    estimated_reach = EXCLUDED.estimated_reach,
    manual_triggers = EXCLUDED.manual_triggers,
    active_videos = EXCLUDED.active_videos,
    impressions_match = EXCLUDED.impressions_match,
    screen_time_match = EXCLUDED.screen_time_match,
    completed_match = EXCLUDED.completed_match,
    impressions_training = EXCLUDED.impressions_training,
    screen_time_training = EXCLUDED.screen_time_training,
    completed_training = EXCLUDED.completed_training,
    impressions_tournament = EXCLUDED.impressions_tournament,
    screen_time_tournament = EXCLUDED.screen_time_tournament,
    completed_tournament = EXCLUDED.completed_tournament,
    impressions_other = EXCLUDED.impressions_other,
    screen_time_other = EXCLUDED.screen_time_other,
    completed_other = EXCLUDED.completed_other,
    impressions_pre_match = EXCLUDED.impressions_pre_match,
    screen_time_pre_match = EXCLUDED.screen_time_pre_match,
    completed_pre_match = EXCLUDED.completed_pre_match,
    impressions_halftime = EXCLUDED.impressions_halftime,
    screen_time_halftime = EXCLUDED.screen_time_halftime,
    completed_halftime = EXCLUDED.completed_halftime,
    impressions_post_match = EXCLUDED.impressions_post_match,
    screen_time_post_match = EXCLUDED.screen_time_post_match,
    completed_post_match = EXCLUDED.completed_post_match,
    impressions_loop = EXCLUDED.impressions_loop,
    screen_time_loop = EXCLUDED.screen_time_loop,
    completed_loop = EXCLUDED.completed_loop,
    audience_estimate_match = EXCLUDED.audience_estimate_match,
    sponsor_id = EXCLUDED.sponsor_id,
    calculated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Child table: per-video stats, même garde FK
  INSERT INTO site_sponsor_daily_video_stats (
    site_sponsor_id, site_id, date, video_filename,
    impressions, screen_time_seconds, completed_plays,
    manual_triggers, total_duration_played,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date, vp.video_filename,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COALESCE(SUM(vp.duration_played), 0),
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
    AND EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id)
  GROUP BY vp.site_sponsor_id, vp.site_id, vp.video_filename
  ON CONFLICT (site_sponsor_id, date, video_filename) DO UPDATE SET
    impressions = EXCLUDED.impressions,
    screen_time_seconds = EXCLUDED.screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    manual_triggers = EXCLUDED.manual_triggers,
    total_duration_played = EXCLUDED.total_duration_played,
    calculated_at = NOW();

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. Désactiver le schedule doublon "Agrégation stats quotidiennes" 04:00
--    (task_config = '{}' → aggregation_type = 'all' → overlap avec les 3
--    schedules spécifiques à 01:50 / 02:00 / 02:30 et hérite de la même FK
--    violation — donc 32 failures sur 51 runs avant ce fix).
-- =============================================================================

UPDATE recurring_schedules
SET is_active = false,
    description = description || ' [DÉSACTIVÉ 2026-04-16: doublon des 3 schedules spécifiques]'
WHERE task_type = 'aggregation'
  AND task_config::text = '{}'
  AND name = 'Agrégation stats quotidiennes';

-- =============================================================================
-- 3. Backfill rattrapage 2026-04-10 → CURRENT_DATE
--    (dernière agrégation réussie = 2026-04-09, avant le bug)
-- =============================================================================

DO $$
DECLARE
  d DATE;
  v_rows INTEGER;
BEGIN
  FOR d IN SELECT generate_series(
    DATE '2026-04-10',
    CURRENT_DATE,
    '1 day'::interval
  )::date
  LOOP
    v_rows := calculate_site_sponsor_daily_stats(d);
    RAISE NOTICE 'Backfill date=% rows=%', d, v_rows;
  END LOOP;
END;
$$;
