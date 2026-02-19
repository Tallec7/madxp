-- Migration: Fix calculate_daily_stats function column name
-- Date: 2026-02-19
-- Description: Fix screen_time_minutes → screen_time_seconds in calculate_daily_stats
-- The add-tv-status-analytics migration incorrectly used screen_time_minutes
-- but the club_daily_stats table column is screen_time_seconds

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
    v_avg_cpu FLOAT;
    v_avg_memory FLOAT;
    v_avg_temp FLOAT;
    v_max_temp FLOAT;
    v_online_minutes INTEGER;
    v_uptime_percent FLOAT;
    v_incidents_count INTEGER;
BEGIN
    -- Video stats for the day (ONLY COUNT VISIBLE PLAYS - tv_status = 'on' or 'unknown')
    SELECT
        COUNT(DISTINCT session_id),
        COALESCE(SUM(duration_played), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE category = 'sponsor'),
        COUNT(*) FILTER (WHERE category = 'jingle'),
        COUNT(*) FILTER (WHERE category = 'ambiance'),
        COUNT(*) FILTER (WHERE category NOT IN ('sponsor', 'jingle', 'ambiance'))
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
      AND played_at < p_date + INTERVAL '1 day'
      AND (tv_status = 'on' OR tv_status = 'unknown' OR tv_status IS NULL);

    -- Metrics averages for the day
    SELECT
        AVG(cpu_usage),
        AVG(memory_usage),
        AVG(temperature),
        MAX(temperature)
    INTO
        v_avg_cpu,
        v_avg_memory,
        v_avg_temp,
        v_max_temp
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    -- Availability (online minutes)
    WITH intervals AS (
        SELECT
            recorded_at,
            LEAD(recorded_at) OVER (ORDER BY recorded_at) as next_recorded
        FROM metrics
        WHERE site_id = p_site_id
          AND recorded_at >= p_date
          AND recorded_at < p_date + INTERVAL '1 day'
    )
    SELECT COALESCE(SUM(
        LEAST(
            EXTRACT(EPOCH FROM (next_recorded - recorded_at)) / 60,
            5
        )
    ), 0)::INTEGER
    INTO v_online_minutes
    FROM intervals
    WHERE next_recorded IS NOT NULL;

    -- Uptime percent
    v_uptime_percent := LEAST(v_online_minutes * 100.0 / GREATEST(1440, 1), 100);

    -- Incidents count
    SELECT COUNT(*)
    INTO v_incidents_count
    FROM alerts
    WHERE site_id = p_site_id
      AND created_at >= p_date
      AND created_at < p_date + INTERVAL '1 day';

    -- Upsert daily stats (FIX: use screen_time_seconds, not screen_time_minutes)
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
        v_avg_cpu, v_avg_memory, v_avg_temp, v_max_temp,
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
        calculated_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE 'Migration complete: Fixed screen_time_minutes → screen_time_seconds in calculate_daily_stats';
END $$;
