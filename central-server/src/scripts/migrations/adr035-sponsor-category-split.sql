-- ADR-035 Phase 2: Séparation analytics_category sponsor_local / sponsor_neopro
--
-- Ajoute les valeurs 'sponsor_local' et 'sponsor_neopro' pour distinguer :
--   - sponsor_local  → sponsors club (site_sponsor source=local)
--   - sponsor_neopro → annonceurs Neopro (advertiser_id)
--   - sponsor        → valeur legacy (rétrocompat Pi non mis à jour)
--
-- Les index partiels et vues agrégées sont mis à jour pour matcher les 3 valeurs.

BEGIN;

-- =============================================================================
-- 1. Index partiel — inclure les nouvelles catégories
-- =============================================================================

DROP INDEX IF EXISTS idx_video_plays_sponsor_analytics;
CREATE INDEX idx_video_plays_sponsor_analytics
  ON video_plays(site_id, category, played_at DESC)
  WHERE category IN ('sponsor', 'sponsor_local', 'sponsor_neopro');

-- =============================================================================
-- 2. Vue sponsor_impressions_bridge
-- =============================================================================

CREATE OR REPLACE VIEW sponsor_impressions_bridge AS
SELECT vp.id, vp.site_id, vp.sponsor_id AS advertiser_id, vp.video_id,
       vp.video_filename, vp.played_at, vp.duration_played, vp.video_duration,
       vp.completed, vp.event_type, vp.period, vp.trigger_type,
       vp.position_in_loop, vp.audience_estimate, vp.site_sponsor_id, vp.tv_status,
       vp.interruption_reason
FROM video_plays vp
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
  AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL);

-- =============================================================================
-- 3. Vue advertiser_analytics_summary
-- =============================================================================

CREATE OR REPLACE VIEW advertiser_analytics_summary AS
SELECT
  a.id AS advertiser_id,
  a.name AS advertiser_name,
  COUNT(DISTINCT vp.site_id) AS sites_reached,
  COUNT(vp.id) AS total_impressions,
  COALESCE(SUM(vp.duration_played), 0) AS total_duration
FROM advertisers a
LEFT JOIN video_plays vp ON vp.sponsor_id = a.id AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
GROUP BY a.id, a.name;

-- =============================================================================
-- 4. Vue advertiser_performance_by_site
-- =============================================================================

CREATE OR REPLACE VIEW advertiser_performance_by_site AS
SELECT
  vp.sponsor_id AS advertiser_id,
  vp.site_id,
  s.site_name,
  s.club_name,
  COUNT(vp.id) AS impressions_count,
  COALESCE(SUM(vp.duration_played), 0) AS total_duration
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
GROUP BY vp.sponsor_id, vp.site_id, s.site_name, s.club_name;

-- =============================================================================
-- 5. Vue advertiser_stats_summary
-- =============================================================================

CREATE OR REPLACE VIEW advertiser_stats_summary AS
SELECT
  a.id AS advertiser_id,
  a.name,
  a.status,
  COUNT(DISTINCT av.video_id) AS video_count,
  COUNT(DISTINCT vp.site_id) AS sites_count,
  COUNT(vp.id) AS total_impressions
FROM advertisers a
LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
LEFT JOIN video_plays vp ON vp.sponsor_id = a.id AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
GROUP BY a.id, a.name, a.status;

-- =============================================================================
-- 6. Vue top_advertiser_videos
-- =============================================================================

CREATE OR REPLACE VIEW top_advertiser_videos AS
SELECT
  vp.sponsor_id AS advertiser_id,
  a.name AS advertiser_name,
  vp.video_filename,
  COUNT(*) AS play_count,
  SUM(vp.duration_played) AS total_duration
FROM video_plays vp
JOIN advertisers a ON a.id = vp.sponsor_id
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
  AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY vp.sponsor_id, a.name, vp.video_filename
ORDER BY play_count DESC;

-- =============================================================================
-- 7. Vue club_daily_stats_live — sponsor_plays inclut les 3 catégories
-- =============================================================================

CREATE OR REPLACE VIEW club_daily_stats_live AS
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
  SELECT
    NULL::uuid as id,
    vp.site_id,
    CURRENT_DATE as date,
    COUNT(DISTINCT vp.session_id)::integer as sessions_count,
    COALESCE(SUM(vp.duration_played), 0)::integer as screen_time_seconds,
    COUNT(*)::integer as videos_played,
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual')::integer as manual_triggers,
    COUNT(*) FILTER (WHERE vp.trigger_type = 'auto')::integer as auto_plays,
    COUNT(*) FILTER (WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro'))::integer as sponsor_plays,
    COUNT(*) FILTER (WHERE vp.category = 'jingle')::integer as jingle_plays,
    COUNT(*) FILTER (WHERE vp.category = 'ambiance')::integer as ambiance_plays,
    COUNT(*) FILTER (WHERE vp.category NOT IN ('sponsor', 'sponsor_local', 'sponsor_neopro', 'jingle', 'ambiance') OR vp.category IS NULL)::integer as other_plays,
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
-- 8. Vue advertiser_daily_stats_live — inclure les 3 catégories
-- =============================================================================

CREATE OR REPLACE VIEW advertiser_daily_stats_live AS
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
  WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.video_id IS NOT NULL
    AND vp.played_at >= CURRENT_DATE
    AND vp.played_at < CURRENT_DATE + INTERVAL '1 day'
  GROUP BY vp.video_id, vp.site_id
  HAVING COUNT(*) > 0;

-- =============================================================================
-- 9. Fonction calculate_daily_stats — sponsor_plays inclut les 3 catégories
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_daily_stats(p_site_id UUID, p_date DATE)
RETURNS void AS $$
DECLARE
    v_sessions_count INTEGER;
    v_screen_time INTEGER;
    v_videos_played INTEGER;
    v_manual_triggers INTEGER;
    v_auto_plays INTEGER;
    v_sponsor_plays INTEGER;
    v_jingle_plays INTEGER;
    v_ambiance_plays INTEGER;
    v_other_plays INTEGER;
    v_avg_cpu DECIMAL(5,2);
    v_avg_memory DECIMAL(5,2);
    v_avg_temperature DECIMAL(5,2);
    v_max_temperature DECIMAL(5,2);
    v_uptime_percent DECIMAL(5,2);
    v_incidents_count INTEGER;
BEGIN
    SELECT
        COUNT(DISTINCT session_id),
        COALESCE(SUM(duration_played), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')),
        COUNT(*) FILTER (WHERE category = 'jingle'),
        COUNT(*) FILTER (WHERE category = 'ambiance'),
        COUNT(*) FILTER (WHERE category NOT IN ('sponsor', 'sponsor_local', 'sponsor_neopro', 'jingle', 'ambiance') OR category IS NULL)
    INTO
        v_sessions_count,
        v_screen_time,
        v_videos_played,
        v_manual_triggers,
        v_auto_plays,
        v_sponsor_plays,
        v_jingle_plays,
        v_ambiance_plays,
        v_other_plays
    FROM video_plays
    WHERE site_id = p_site_id
      AND played_at >= p_date
      AND played_at < p_date + INTERVAL '1 day';

    SELECT
        AVG(cpu_usage),
        AVG(memory_usage),
        AVG(temperature),
        MAX(temperature)
    INTO
        v_avg_cpu,
        v_avg_memory,
        v_avg_temperature,
        v_max_temperature
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    SELECT
        LEAST(100, (COUNT(*)::float / 2880.0 * 100))
    INTO v_uptime_percent
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    SELECT COUNT(*)
    INTO v_incidents_count
    FROM alerts
    WHERE site_id = p_site_id
      AND created_at >= p_date
      AND created_at < p_date + INTERVAL '1 day';

    INSERT INTO club_daily_stats (
        site_id, date,
        sessions_count, screen_time_seconds, videos_played,
        manual_triggers, auto_plays,
        sponsor_plays, jingle_plays, ambiance_plays, other_plays,
        avg_cpu, avg_memory, avg_temperature, max_temperature,
        uptime_percent, incidents_count,
        calculated_at
    ) VALUES (
        p_site_id, p_date,
        v_sessions_count, v_screen_time, v_videos_played,
        v_manual_triggers, v_auto_plays,
        v_sponsor_plays, v_jingle_plays, v_ambiance_plays, v_other_plays,
        v_avg_cpu, v_avg_memory, v_avg_temperature, v_max_temperature,
        COALESCE(v_uptime_percent, 0), v_incidents_count,
        NOW()
    )
    ON CONFLICT (site_id, date) DO UPDATE SET
        sessions_count = EXCLUDED.sessions_count,
        screen_time_seconds = EXCLUDED.screen_time_seconds,
        videos_played = EXCLUDED.videos_played,
        manual_triggers = EXCLUDED.manual_triggers,
        auto_plays = EXCLUDED.auto_plays,
        sponsor_plays = EXCLUDED.sponsor_plays,
        jingle_plays = EXCLUDED.jingle_plays,
        ambiance_plays = EXCLUDED.ambiance_plays,
        other_plays = EXCLUDED.other_plays,
        avg_cpu = EXCLUDED.avg_cpu,
        avg_memory = EXCLUDED.avg_memory,
        avg_temperature = EXCLUDED.avg_temperature,
        max_temperature = EXCLUDED.max_temperature,
        uptime_percent = EXCLUDED.uptime_percent,
        incidents_count = EXCLUDED.incidents_count,
        calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;
