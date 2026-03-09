-- =============================================================================
-- Migration: Activer l'agrégation CRON + VIEWs live pour données du jour
-- =============================================================================
-- Problème: Les tables agrégées (club_daily_stats, advertiser_daily_stats)
-- ne contiennent que les données de la veille (CRON J-1). Les pages dashboard
-- qui les utilisent (comparaison multi-sites, portail annonceur) n'affichent
-- pas les données d'aujourd'hui.
--
-- Solution:
-- 1. Ajouter des schedules CRON d'agrégation activés par défaut
-- 2. Créer des VIEWs "live" qui combinent données agrégées + données raw du jour
-- =============================================================================

-- =============================================================================
-- 1. SCHEDULES CRON D'AGRÉGATION (activés par défaut)
-- =============================================================================

-- Agrégation quotidienne club_daily_stats à 2h00
INSERT INTO recurring_schedules (name, description, task_type, frequency, day_of_week, hour, minute, task_config, is_active)
VALUES
    ('Agrégation stats clubs', 'Agrégation quotidienne des stats clubs (video_plays → club_daily_stats)', 'aggregation', 'daily', NULL, 2, 0,
     '{"aggregation_type": "club_daily_stats", "target_date": "yesterday"}', true),
    ('Agrégation stats annonceurs', 'Agrégation quotidienne des stats annonceurs (video_plays → advertiser_daily_stats)', 'aggregation', 'daily', NULL, 2, 30,
     '{"aggregation_type": "advertiser_daily_stats", "target_date": "yesterday"}', true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 2. VIEW club_daily_stats_live
-- =============================================================================
-- Combine club_daily_stats (historique) + agrégation live de video_plays (aujourd'hui)
-- Utilisé par la comparaison multi-sites pour inclure les données du jour.

CREATE OR REPLACE VIEW club_daily_stats_live AS
  -- Données agrégées historiques (tout sauf aujourd'hui)
  SELECT
    id, site_id, date,
    sessions_count, screen_time_seconds, videos_played,
    manual_triggers, auto_plays,
    sponsor_plays, jingle_plays, ambiance_plays, other_plays,
    avg_cpu, avg_memory, avg_temperature, max_temperature,
    uptime_percent, incidents_count, calculated_at
  FROM club_daily_stats
  WHERE date < CURRENT_DATE

  UNION ALL

  -- Données live du jour (agrégation temps réel depuis video_plays)
  SELECT
    NULL::uuid as id,
    vp.site_id,
    CURRENT_DATE as date,
    COUNT(DISTINCT vp.session_id)::integer as sessions_count,
    COALESCE(SUM(vp.duration_played), 0)::integer as screen_time_seconds,
    COUNT(*)::integer as videos_played,
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual')::integer as manual_triggers,
    COUNT(*) FILTER (WHERE vp.trigger_type = 'auto')::integer as auto_plays,
    COUNT(*) FILTER (WHERE vp.category = 'sponsor')::integer as sponsor_plays,
    COUNT(*) FILTER (WHERE vp.category = 'jingle')::integer as jingle_plays,
    COUNT(*) FILTER (WHERE vp.category = 'ambiance')::integer as ambiance_plays,
    COUNT(*) FILTER (WHERE vp.category NOT IN ('sponsor', 'jingle', 'ambiance') OR vp.category IS NULL)::integer as other_plays,
    NULL::numeric(5,2) as avg_cpu,
    NULL::numeric(5,2) as avg_memory,
    NULL::numeric(5,2) as avg_temperature,
    NULL::numeric(5,2) as max_temperature,
    NULL::numeric(5,2) as uptime_percent,
    0::integer as incidents_count,
    NOW() as calculated_at
  FROM video_plays vp
  WHERE vp.played_at >= CURRENT_DATE
    AND vp.played_at < CURRENT_DATE + INTERVAL '1 day'
  GROUP BY vp.site_id
  HAVING COUNT(*) > 0;

-- =============================================================================
-- 3. VIEW advertiser_daily_stats_live
-- =============================================================================
-- Combine advertiser_daily_stats (historique) + agrégation live de video_plays sponsor (aujourd'hui)
-- Utilisé par le portail annonceur pour inclure les données du jour.

CREATE OR REPLACE VIEW advertiser_daily_stats_live AS
  -- Données agrégées historiques (tout sauf aujourd'hui)
  SELECT
    id, video_id, site_id, date,
    total_impressions, total_duration_seconds, completed_plays, completion_rate,
    unique_events,
    pre_match_plays, match_plays, post_match_plays, loop_plays,
    match_events, training_events, tournament_events, other_events,
    auto_plays, manual_plays,
    total_audience_estimate, avg_audience_per_play,
    calculated_at
  FROM advertiser_daily_stats
  WHERE date < CURRENT_DATE

  UNION ALL

  -- Données live du jour (agrégation temps réel depuis video_plays sponsor)
  SELECT
    NULL::uuid as id,
    vp.video_id,
    vp.site_id,
    CURRENT_DATE as date,
    COUNT(*)::integer as total_impressions,
    COALESCE(SUM(vp.duration_played), 0)::integer as total_duration_seconds,
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END)::integer as completed_plays,
    ROUND(
      (SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100)::numeric,
      2
    ) as completion_rate,
    COUNT(DISTINCT vp.event_type)::integer as unique_events,
    SUM(CASE WHEN vp.period = 'pre_match' THEN 1 ELSE 0 END)::integer as pre_match_plays,
    SUM(CASE WHEN vp.period = 'halftime' THEN 1 ELSE 0 END)::integer as match_plays,
    SUM(CASE WHEN vp.period = 'post_match' THEN 1 ELSE 0 END)::integer as post_match_plays,
    SUM(CASE WHEN vp.period = 'loop' OR vp.period IS NULL THEN 1 ELSE 0 END)::integer as loop_plays,
    SUM(CASE WHEN vp.event_type = 'match' THEN 1 ELSE 0 END)::integer as match_events,
    SUM(CASE WHEN vp.event_type = 'training' THEN 1 ELSE 0 END)::integer as training_events,
    SUM(CASE WHEN vp.event_type = 'tournament' THEN 1 ELSE 0 END)::integer as tournament_events,
    SUM(CASE WHEN vp.event_type = 'other' OR vp.event_type IS NULL THEN 1 ELSE 0 END)::integer as other_events,
    SUM(CASE WHEN vp.trigger_type = 'auto' THEN 1 ELSE 0 END)::integer as auto_plays,
    SUM(CASE WHEN vp.trigger_type = 'manual' THEN 1 ELSE 0 END)::integer as manual_plays,
    COALESCE(SUM(vp.audience_estimate), 0)::integer as total_audience_estimate,
    ROUND(AVG(vp.audience_estimate)::numeric, 2) as avg_audience_per_play,
    NOW() as calculated_at
  FROM video_plays vp
  WHERE vp.category = 'sponsor'
    AND vp.video_id IS NOT NULL
    AND vp.played_at >= CURRENT_DATE
    AND vp.played_at < CURRENT_DATE + INTERVAL '1 day'
  GROUP BY vp.video_id, vp.site_id
  HAVING COUNT(*) > 0;

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================
COMMENT ON VIEW club_daily_stats_live IS 'club_daily_stats + données live du jour depuis video_plays. Remplace club_daily_stats pour les queries dashboard.';
COMMENT ON VIEW advertiser_daily_stats_live IS 'advertiser_daily_stats + données live du jour depuis video_plays (sponsor). Remplace advertiser_daily_stats pour les queries portail annonceur.';
