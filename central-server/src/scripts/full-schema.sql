-- =============================================================================
-- NEOPRO Central - Schéma complet de la base de données
-- =============================================================================
-- Ce fichier consolide tous les scripts SQL pour initialiser une nouvelle BDD
-- Généré le: 2025-12-10
--
-- Ordre d'origine des scripts:
--   1. init-db.sql
--   2. analytics-tables.sql
--   3. config-history-table.sql
--   4. add-local-config-mirror.sql
-- =============================================================================

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES PRINCIPALES
-- =============================================================================

-- Table des utilisateurs (équipe NEOPRO)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  CONSTRAINT check_role CHECK (role IN ('admin', 'operator', 'viewer'))
);

-- Table des sites (Boîtiers Raspberry Pi)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name VARCHAR(255) NOT NULL,
  club_name VARCHAR(255) NOT NULL,
  location JSONB,
  sports JSONB,
  status VARCHAR(50) DEFAULT 'offline',
  last_seen_at TIMESTAMP,
  last_ip VARCHAR(45),
  local_ip VARCHAR(45),
  software_version VARCHAR(50),
  hardware_model VARCHAR(100) DEFAULT 'Raspberry Pi 4',
  api_key VARCHAR(255) UNIQUE NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Colonnes pour le miroir de configuration locale
  local_config_mirror JSONB,
  local_config_hash VARCHAR(64),
  last_config_sync TIMESTAMPTZ,
  pending_config_version_id UUID,
  CONSTRAINT check_status CHECK (status IN ('online', 'offline', 'maintenance', 'error'))
);

-- Table des groupes
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50),
  filters JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_type CHECK (type IN ('sport', 'geography', 'version', 'custom'))
);

-- Table d'association sites <-> groupes (many-to-many)
CREATE TABLE IF NOT EXISTS site_groups (
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (site_id, group_id)
);

-- Table des vidéos centralisées
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  file_size BIGINT,
  duration INT,
  mime_type VARCHAR(100),
  storage_path VARCHAR(500),
  thumbnail_url VARCHAR(500),
  checksum VARCHAR(64),
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table des déploiements de contenu
CREATE TABLE IF NOT EXISTS content_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress INT DEFAULT 0,
  error_message TEXT,
  deployed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  CONSTRAINT check_target_type CHECK (target_type IN ('site', 'group')),
  CONSTRAINT check_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  CONSTRAINT check_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Table des mises à jour logicielles
CREATE TABLE IF NOT EXISTS software_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  changelog TEXT,
  package_url VARCHAR(500),
  package_size BIGINT,
  checksum VARCHAR(64),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table des déploiements de MAJ
CREATE TABLE IF NOT EXISTS update_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  update_id UUID REFERENCES software_updates(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress INT DEFAULT 0,
  error_message TEXT,
  backup_path VARCHAR(500),
  deployed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  CONSTRAINT check_target_type_update CHECK (target_type IN ('site', 'group')),
  CONSTRAINT check_status_update CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
  CONSTRAINT check_progress_update CHECK (progress >= 0 AND progress <= 100)
);

-- Table des commandes à distance
CREATE TABLE IF NOT EXISTS remote_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  command_type VARCHAR(100) NOT NULL,
  command_data JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  executed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP,
  completed_at TIMESTAMP,
  CONSTRAINT check_status_command CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'timeout'))
);

-- Table des métriques de monitoring (historique)
CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  cpu_usage FLOAT,
  memory_usage FLOAT,
  temperature FLOAT,
  disk_usage FLOAT,
  uptime BIGINT,
  network_status JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Table des alertes
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  CONSTRAINT check_severity CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT check_status_alert CHECK (status IN ('active', 'acknowledged', 'resolved'))
);

-- =============================================================================
-- TABLE HISTORIQUE DES CONFIGURATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS config_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL,
  deployed_by UUID REFERENCES users(id),
  deployed_at TIMESTAMP DEFAULT NOW(),
  comment TEXT,
  previous_version_id UUID REFERENCES config_history(id),
  changes_summary JSONB
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sites_pending_config_version'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT fk_sites_pending_config_version
      FOREIGN KEY (pending_config_version_id) REFERENCES config_history(id);
  END IF;
END $$;

-- =============================================================================
-- TABLES ANALYTICS CLUB
-- =============================================================================

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

-- Lectures vidéo individuelles
CREATE TABLE IF NOT EXISTS video_plays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    session_id UUID REFERENCES club_sessions(id) ON DELETE SET NULL,
    video_filename VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    played_at TIMESTAMP NOT NULL,
    duration_played INTEGER,
    video_duration INTEGER,
    completed BOOLEAN DEFAULT false,
    trigger_type VARCHAR(20) DEFAULT 'auto',
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT check_trigger_type CHECK (trigger_type IN ('auto', 'manual'))
);

-- Agrégats quotidiens (calculés par cron job)
CREATE TABLE IF NOT EXISTS club_daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    sessions_count INTEGER DEFAULT 0,
    screen_time_seconds INTEGER DEFAULT 0,
    videos_played INTEGER DEFAULT 0,
    manual_triggers INTEGER DEFAULT 0,
    auto_plays INTEGER DEFAULT 0,
    sponsor_plays INTEGER DEFAULT 0,
    jingle_plays INTEGER DEFAULT 0,
    ambiance_plays INTEGER DEFAULT 0,
    other_plays INTEGER DEFAULT 0,
    avg_cpu DECIMAL(5,2),
    avg_memory DECIMAL(5,2),
    avg_temperature DECIMAL(5,2),
    max_temperature DECIMAL(5,2),
    uptime_percent DECIMAL(5,2),
    incidents_count INTEGER DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(site_id, date)
);

-- =============================================================================
-- INDEX
-- =============================================================================

-- Index tables principales
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_last_seen ON sites(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sites_local_config_hash ON sites(local_config_hash);
CREATE INDEX IF NOT EXISTS idx_metrics_site_time ON metrics(site_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON content_deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_created ON content_deployments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_deployments_status ON update_deployments(status);
CREATE INDEX IF NOT EXISTS idx_commands_site ON remote_commands(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_status ON remote_commands(status);
CREATE INDEX IF NOT EXISTS idx_alerts_site ON alerts(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, severity);

-- Index config_history
CREATE INDEX IF NOT EXISTS idx_config_history_site ON config_history(site_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_history_deployed_by ON config_history(deployed_by);

-- Index analytics
CREATE INDEX IF NOT EXISTS idx_club_sessions_site ON club_sessions(site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_sessions_date ON club_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_video_plays_site ON video_plays(site_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_plays_session ON video_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_date ON video_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_video_plays_filename ON video_plays(video_filename);
CREATE INDEX IF NOT EXISTS idx_club_daily_stats_site ON club_daily_stats(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_club_daily_stats_date ON club_daily_stats(date);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VUES ANALYTICS
-- =============================================================================

-- Vue récapitulative par site
CREATE OR REPLACE VIEW club_analytics_summary AS
SELECT
    s.id as site_id,
    s.site_name,
    s.club_name,
    s.status,
    s.last_seen_at,
    COALESCE(SUM(cds.sessions_count) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as sessions_this_month,
    COALESCE(SUM(cds.screen_time_seconds) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as screen_time_this_month,
    COALESCE(SUM(cds.videos_played) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as videos_this_month,
    COUNT(DISTINCT cds.date) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE)) as active_days_this_month,
    COALESCE(SUM(cds.sessions_count) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as sessions_last_month,
    COALESCE(SUM(cds.screen_time_seconds) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as screen_time_last_month,
    COALESCE(SUM(cds.videos_played) FILTER (WHERE cds.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND cds.date < DATE_TRUNC('month', CURRENT_DATE)), 0) as videos_last_month,
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

-- =============================================================================
-- FONCTIONS ANALYTICS
-- =============================================================================

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

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

COMMENT ON TABLE config_history IS 'Historique des configurations déployées sur les sites';
COMMENT ON COLUMN config_history.configuration IS 'Configuration complète en JSONB';
COMMENT ON COLUMN config_history.previous_version_id IS 'Référence vers la version précédente pour le diff';
COMMENT ON COLUMN config_history.changes_summary IS 'Résumé des changements: [{field, type, oldValue, newValue}]';
COMMENT ON COLUMN sites.local_config_mirror IS 'Miroir de la configuration.json locale du Pi';
COMMENT ON COLUMN sites.local_config_hash IS 'Hash SHA256 (16 premiers caractères) de la configuration locale';
COMMENT ON COLUMN sites.last_config_sync IS 'Date de dernière synchronisation de la configuration locale';

-- =============================================================================
-- FIN
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Base de données NEOPRO initialisée!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Tables créées:';
    RAISE NOTICE '  - users, sites, groups, site_groups';
    RAISE NOTICE '  - videos, content_deployments';
    RAISE NOTICE '  - software_updates, update_deployments';
    RAISE NOTICE '  - remote_commands, metrics, alerts';
    RAISE NOTICE '  - config_history';
    RAISE NOTICE '  - club_sessions, video_plays, club_daily_stats';
    RAISE NOTICE '';
    RAISE NOTICE 'Vues: club_analytics_summary, top_videos_by_site';
    RAISE NOTICE 'Fonctions: calculate_daily_stats(), calculate_all_daily_stats()';
    RAISE NOTICE '';
    RAISE NOTICE 'Créez un utilisateur admin avec: npm run create-admin';
END $$;
