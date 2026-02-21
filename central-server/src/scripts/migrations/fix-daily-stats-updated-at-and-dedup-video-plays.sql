-- Migration: Fix daily stats updated_at + Deduplicate video_plays
-- Date: 2026-02-21
-- Description:
--   1. Fix calculate_daily_stats: remove updated_at reference (column doesn't exist)
--   2. Add unique index on video_plays to prevent future duplicates
--   3. Clean existing duplicates (~8700 rows)
--   4. Backfill daily stats for Feb 5-20 (17 missing days)

-- ============================================================================
-- Part 1: Fix calculate_daily_stats function
-- The previous migration (fix-daily-stats-column-name.sql) fixed
-- screen_time_minutes → screen_time_seconds but introduced updated_at = NOW()
-- on line 136. club_daily_stats has no updated_at column — calculated_at suffices.
-- ============================================================================

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

    -- Availability (online minutes based on heartbeat intervals)
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

    -- Upsert daily stats (FIX: removed updated_at — column does not exist)
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
        calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Part 2: Deduplicate existing video_plays
-- Pattern: same (site_id, played_at, video_filename) inserted twice ~0.7s apart
-- Keep the row with the earliest created_at (first successful insert)
-- ============================================================================

DELETE FROM video_plays
WHERE id IN (
    SELECT id FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY site_id, played_at, video_filename
                ORDER BY created_at ASC
            ) as rn
        FROM video_plays
    ) ranked
    WHERE rn > 1
);

-- ============================================================================
-- Part 3: Prevent future duplicates
-- Unique index on (site_id, played_at, video_filename)
-- This makes INSERT idempotent — the sync-agent can safely retry without duplication
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_plays_dedup
ON video_plays (site_id, played_at, video_filename);

-- ============================================================================
-- Part 4: Backfill daily stats for the 17 missing days (Feb 5 → Feb 20)
-- ============================================================================

DO $$
DECLARE
    v_date DATE;
    v_count INTEGER := 0;
BEGIN
    FOR v_date IN SELECT generate_series('2026-02-05'::date, '2026-02-20'::date, '1 day'::interval)::date
    LOOP
        PERFORM calculate_all_daily_stats(v_date);
        v_count := v_count + 1;
    END LOOP;

    -- Also calculate today (partial)
    PERFORM calculate_all_daily_stats(CURRENT_DATE);
    v_count := v_count + 1;

    RAISE NOTICE 'Backfilled daily stats for % days', v_count;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'Migration complete: fixed updated_at, deduped video_plays, added unique index, backfilled daily stats';
END $$;
