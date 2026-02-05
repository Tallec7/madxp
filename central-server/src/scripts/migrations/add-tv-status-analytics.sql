-- Migration: Add tv_status column to video_plays
-- Date: 2026-02-05
-- Description: Track TV HDMI-CEC status to filter out plays when TV is off/standby
--
-- This allows us to:
-- 1. Know if the video was actually visible on the TV
-- 2. Filter analytics to only count "real" views (TV on)
-- 3. Still keep the data for debugging (we just filter in queries)

-- Add tv_status column
-- Values: 'on', 'standby', 'disconnected', 'unknown'
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS tv_status VARCHAR(20) DEFAULT 'unknown';

-- Create index for filtering by tv_status
CREATE INDEX IF NOT EXISTS idx_video_plays_tv_status ON video_plays(tv_status);

-- Create a view that only shows "real" video plays (TV was on or status unknown)
-- This is what the analytics should use by default
CREATE OR REPLACE VIEW video_plays_visible AS
SELECT * FROM video_plays
WHERE tv_status = 'on' OR tv_status = 'unknown' OR tv_status IS NULL;

-- Update calculate_daily_stats to only count visible plays
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
      -- FILTER: Only count plays where TV was on or status unknown (CEC not available)
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
            5  -- Max 5 minutes per interval (heartbeat is ~30s)
        )
    ), 0)::INTEGER
    INTO v_online_minutes
    FROM intervals
    WHERE next_recorded IS NOT NULL;

    -- Upsert daily stats
    INSERT INTO club_daily_stats (
        site_id, date, sessions_count, screen_time_minutes,
        videos_played, manual_triggers, auto_plays,
        sponsor_plays, jingle_plays, ambiance_plays, other_plays,
        avg_cpu, avg_memory, avg_temperature, max_temperature,
        online_minutes
    ) VALUES (
        p_site_id, p_date, v_sessions_count, v_screen_time / 60,
        v_videos_played, v_manual_triggers, v_auto_plays,
        v_sponsor_plays, v_jingle_plays, v_ambiance_plays, v_other_plays,
        v_avg_cpu, v_avg_memory, v_avg_temp, v_max_temp,
        v_online_minutes
    )
    ON CONFLICT (site_id, date) DO UPDATE SET
        sessions_count = EXCLUDED.sessions_count,
        screen_time_minutes = EXCLUDED.screen_time_minutes,
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
        online_minutes = EXCLUDED.online_minutes,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN video_plays.tv_status IS
  'HDMI-CEC status of TV when video started playing: on (visible), standby (not visible), disconnected (not visible), unknown (CEC not available). Only count on/unknown for stats.';

-- Log migration
DO $$
BEGIN
    RAISE NOTICE 'Migration complete: Added tv_status column to video_plays';
    RAISE NOTICE 'Created view video_plays_visible for filtered analytics';
    RAISE NOTICE 'Updated calculate_daily_stats to only count visible plays';
END $$;
