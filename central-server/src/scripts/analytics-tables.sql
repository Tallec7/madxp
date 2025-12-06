-- Script de création des tables Analytics Club
-- À exécuter sur PostgreSQL après init-db.sql

-- ============================================================================
-- TABLES ANALYTICS CLUB
-- ============================================================================

-- Sessions d'utilisation (quand la TV est active)
CREATE TABLE IF NOT EXISTS club_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    videos_played INTEGER DEFAULT 0,
    manual_triggers INTEGER DEFAULT 0,
    auto_plays INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_sessions_site ON club_sessions(site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_sessions_date ON club_sessions(started_at);

-- Lectures vidéo individuelles
CREATE TABLE IF NOT EXISTS video_plays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    session_id UUID REFERENCES club_sessions(id) ON DELETE SET NULL,
    video_filename VARCHAR(255) NOT NULL,
    category VARCHAR(50),           -- sponsor, jingle, ambiance, other
    played_at TIMESTAMP NOT NULL,
    duration_played INTEGER,        -- secondes effectivement jouées
    video_duration INTEGER,         -- durée totale de la vidéo
    completed BOOLEAN DEFAULT false,
    trigger_type VARCHAR(20) DEFAULT 'auto',  -- auto, manual
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT check_trigger_type CHECK (trigger_type IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_video_plays_site ON video_plays(site_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_plays_session ON video_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_date ON video_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_video_plays_filename ON video_plays(video_filename);

-- Agrégats quotidiens (calculés par cron job)
CREATE TABLE IF NOT EXISTS club_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Activité
    sessions_count INTEGER DEFAULT 0,
    screen_time_seconds INTEGER DEFAULT 0,
    videos_played INTEGER DEFAULT 0,
    manual_triggers INTEGER DEFAULT 0,
    auto_plays INTEGER DEFAULT 0,

    -- Par catégorie
    sponsor_plays INTEGER DEFAULT 0,
    jingle_plays INTEGER DEFAULT 0,
    ambiance_plays INTEGER DEFAULT 0,
    other_plays INTEGER DEFAULT 0,

    -- Technique (agrégé depuis metrics)
    avg_cpu DECIMAL(5,2),
    avg_memory DECIMAL(5,2),
    avg_temperature DECIMAL(5,2),
    max_temperature DECIMAL(5,2),
    uptime_percent DECIMAL(5,2),
    incidents_count INTEGER DEFAULT 0,

    -- Métadonnées
    calculated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(site_id, date)
);

CREATE INDEX IF NOT EXISTS idx_club_daily_stats_site ON club_daily_stats(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_club_daily_stats_date ON club_daily_stats(date);

-- ============================================================================
-- VUES POUR ANALYTICS
-- ============================================================================

-- Vue récapitulative par site
CREATE OR REPLACE VIEW club_analytics_summary AS
SELECT
    s.id as site_id,
    s.site_name,
    s.club_name,
    s.status,
    s.last_seen_at,

    -- Stats du mois en cours
    COALESCE(SUM(cds.sessions_count) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as sessions_this_month,
    COALESCE(SUM(cds.screen_time_seconds) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as screen_time_this_month,
    COALESCE(SUM(cds.videos_played) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as videos_this_month,
    COUNT(DISTINCT cds.date) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)) as active_days_this_month,

    -- Stats du mois précédent (pour comparaison)
    COALESCE(SUM(cds.sessions_count) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as sessions_last_month,
    COALESCE(SUM(cds.screen_time_seconds) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as screen_time_last_month,
    COALESCE(SUM(cds.videos_played) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as videos_last_month,

    -- Stats totales
    COALESCE(SUM(cds.sessions_count), 0) as total_sessions,
    COALESCE(SUM(cds.videos_played), 0) as total_videos_played,
    COUNT(DISTINCT cds.date) as total_active_days

FROM sites s
LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
GROUP BY s.id, s.site_name, s.club_name, s.status, s.last_seen_at;

-- Vue des top vidéos par site
CREATE OR REPLACE VIEW top_videos_by_site AS
SELECT
    site_id,
    video_filename,
    category,
    COUNT(*) as play_count,
    SUM(duration_played) as total_duration_played,
    AVG(CASE WHEN video_duration > 0 THEN (duration_played::float / video_duration * 100) ELSE 100 END) as avg_completion_percent,
    COUNT(*) FILTER (WHERE completed = true) as completed_count,
    COUNT(*) FILTER (WHERE trigger_type = 'manual') as manual_count,
    COUNT(*) FILTER (WHERE trigger_type = 'auto') as auto_count,
    MAX(played_at) as last_played_at
FROM video_plays
GROUP BY site_id, video_filename, category;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction pour calculer les stats quotidiennes d'un site
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
    -- Calculer les stats depuis video_plays
    SELECT
        COUNT(DISTINCT session_id),
        COALESCE(SUM(duration_played), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE category = 'sponsor'),
        COUNT(*) FILTER (WHERE category = 'jingle'),
        COUNT(*) FILTER (WHERE category = 'ambiance'),
        COUNT(*) FILTER (WHERE category NOT IN ('sponsor', 'jingle', 'ambiance') OR category IS NULL)
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

    -- Calculer les stats depuis metrics
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

    -- Calculer l'uptime (basé sur le nombre de heartbeats reçus vs attendus)
    -- Assuming heartbeat every 30 seconds = 2880 heartbeats/day max
    SELECT
        LEAST(100, (COUNT(*)::float / 2880.0 * 100))
    INTO v_uptime_percent
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    -- Compter les incidents
    SELECT COUNT(*)
    INTO v_incidents_count
    FROM alerts
    WHERE site_id = p_site_id
      AND created_at >= p_date
      AND created_at < p_date + INTERVAL '1 day';

    -- Insérer ou mettre à jour les stats
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

-- Fonction pour calculer les stats de tous les sites pour une date
CREATE OR REPLACE FUNCTION calculate_all_daily_stats(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
    v_site RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_site IN SELECT id FROM sites LOOP
        PERFORM calculate_daily_stats(v_site.id, p_date);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MESSAGE DE FIN
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Tables Analytics Club créées avec succès!';
    RAISE NOTICE 'Tables: club_sessions, video_plays, club_daily_stats';
    RAISE NOTICE 'Vues: club_analytics_summary, top_videos_by_site';
    RAISE NOTICE 'Fonctions: calculate_daily_stats(), calculate_all_daily_stats()';
END $$;
