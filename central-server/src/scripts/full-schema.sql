-- =============================================================================
-- NEOPRO Central - Schéma complet de la base de données
-- =============================================================================
-- Ce fichier consolide tous les scripts SQL pour initialiser une nouvelle BDD
-- Mis à jour le: 2026-01-18
--
-- Tables incluses:
--   - Core: users, sites, groups, site_groups
--   - Content: videos, content_deployments
--   - Updates: software_updates, update_deployments
--   - Operations: remote_commands, metrics, alerts, pending_commands
--   - Config: config_history, config_drafts, orchestrated_deployments
--   - Analytics: club_sessions, video_plays, club_daily_stats, club_daily_stats_live (VIEW)
--   - Auth: password_reset_tokens, audit_logs
--   - Scheduling: recurring_schedules, recurring_schedule_executions
--   - Advertisers: advertisers, agencies, advertiser_daily_stats_live (VIEW), campaigns, scheduled_reports
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
  -- Blocage temporaire des sync_local_state après déploiement config
  config_update_pending_until TIMESTAMPTZ DEFAULT NULL,
  -- PIN optionnel pour la télécommande cloud
  remote_pin_hash VARCHAR(64) DEFAULT NULL,
  -- Hostname mDNS dérivé du club_name (ex: neopro-usap)
  hostname_slug VARCHAR(63) DEFAULT NULL,
  -- DEPRECATED: Le Pi détecte le dual-display par hardware (DRM/sysfs + xrandr).
  -- Colonnes conservées pour rétrocompat API (anciens dashboards). Ne plus utiliser.
  secondary_display_enabled BOOLEAN DEFAULT false,
  secondary_display_resolution VARCHAR(20) DEFAULT NULL,
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
  storage_backend VARCHAR(20) DEFAULT 'ftp',
  thumbnail_url VARCHAR(500),
  checksum VARCHAR(64),
  upload_status VARCHAR(20) DEFAULT 'ready',
  upload_verified_at TIMESTAMP,
  upload_verified_size BIGINT,
  upload_error_message TEXT,
  upload_retry_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table des variantes vidéo par type d'écran (E-22: TV + Secondary)
CREATE TABLE IF NOT EXISTS video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_type VARCHAR(20) NOT NULL CHECK (display_type IN ('tv', 'secondary')),
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  checksum VARCHAR(128),
  mime_type VARCHAR(100) DEFAULT 'video/mp4',
  width INTEGER,
  height INTEGER,
  duration NUMERIC(10, 2),
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, display_type)
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
  has_secondary_variant BOOLEAN DEFAULT false,
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
  schedule_reboot BOOLEAN DEFAULT FALSE,
  auto_rollback BOOLEAN DEFAULT TRUE,
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
  updated_at TIMESTAMP DEFAULT NOW(),
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
  fan_status JSONB,
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
  changes_summary JSONB,
  profile_id UUID
);

-- =============================================================================
-- TABLE PROFILS DE CONFIGURATION (multi-config par site)
-- =============================================================================

CREATE TABLE IF NOT EXISTS config_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  city VARCHAR(255),
  sport VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  configuration JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, name)
);

CREATE INDEX IF NOT EXISTS idx_config_profiles_site ON config_profiles(site_id);
CREATE INDEX IF NOT EXISTS idx_config_profiles_default ON config_profiles(site_id, is_default) WHERE is_default = true;

-- FK config_history.profile_id -> config_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_config_history_profile'
  ) THEN
    ALTER TABLE config_history
      ADD CONSTRAINT fk_config_history_profile
      FOREIGN KEY (profile_id) REFERENCES config_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- FK sites.active_profile_id -> config_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sites_active_profile'
  ) THEN
    ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS active_profile_id UUID,
      ADD CONSTRAINT fk_sites_active_profile
      FOREIGN KEY (active_profile_id) REFERENCES config_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

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

-- Index video_variants (E-22)
CREATE INDEX IF NOT EXISTS idx_video_variants_video_id ON video_variants(video_id);
CREATE INDEX IF NOT EXISTS idx_video_variants_display_type ON video_variants(display_type);
CREATE INDEX IF NOT EXISTS idx_sites_secondary_display_enabled ON sites(secondary_display_enabled) WHERE secondary_display_enabled = true;

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_plays_dedup ON video_plays(site_id, played_at, video_filename);
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

-- Fonction d'agrégation des stats sponsors de site (video_plays → site_sponsor_daily_stats + child table)
CREATE OR REPLACE FUNCTION calculate_site_sponsor_daily_stats(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Parent table: aggregate by (site_sponsor_id, site_id)
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
    audience_estimate_match, sponsor_id, calculated_at
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
    MAX(vp.sponsor_id),
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
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

  -- Child table: per-video stats
  INSERT INTO site_sponsor_daily_video_stats (
    site_sponsor_id, site_id, date, video_filename,
    impressions, screen_time_seconds, completed_plays,
    manual_triggers, total_duration_played, calculated_at
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
-- TABLES ADDITIONNELLES (ajoutées post-v2.20)
-- =============================================================================

-- Colonne uploaded_for_site_id pour upload contextuel
ALTER TABLE videos ADD COLUMN IF NOT EXISTS uploaded_for_site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_for_site ON videos(uploaded_for_site_id) WHERE uploaded_for_site_id IS NOT NULL;

-- Colonne orchestrated_deployment_id pour content_deployments
ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS orchestrated_deployment_id UUID;

-- Table pending_commands (file d'attente pour sites offline)
CREATE TABLE IF NOT EXISTS pending_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  command_type VARCHAR(100) NOT NULL,
  command_data JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  max_attempts INTEGER DEFAULT 3,
  description TEXT,
  CONSTRAINT check_priority CHECK (priority >= 1 AND priority <= 10)
);

CREATE INDEX IF NOT EXISTS idx_pending_commands_site ON pending_commands(site_id);
CREATE INDEX IF NOT EXISTS idx_pending_commands_priority ON pending_commands(site_id, priority ASC, created_at ASC);

-- Ajouter pending_command_id à remote_commands
ALTER TABLE remote_commands ADD COLUMN IF NOT EXISTS pending_command_id UUID REFERENCES pending_commands(id) ON DELETE SET NULL;

-- Table config_drafts (brouillons de configuration)
CREATE TABLE IF NOT EXISTS config_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Brouillon',
  configuration JSONB NOT NULL,
  referenced_video_ids UUID[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_draft_status CHECK (status IN ('draft', 'deploying', 'deployed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_config_drafts_site ON config_drafts(site_id);
CREATE INDEX IF NOT EXISTS idx_config_drafts_status ON config_drafts(status);

-- Table orchestrated_deployments (déploiements vidéos + config orchestrés)
CREATE TABLE IF NOT EXISTS orchestrated_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES config_drafts(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending',
  total_videos INTEGER DEFAULT 0,
  videos_completed INTEGER DEFAULT 0,
  videos_failed INTEGER DEFAULT 0,
  config_deployed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  failed_video_ids UUID[] DEFAULT '{}',
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  configuration_snapshot JSONB,
  CONSTRAINT check_orch_status CHECK (status IN ('pending', 'deploying_videos', 'deploying_config', 'completed', 'partial_failure', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_orch_deployments_site ON orchestrated_deployments(site_id);
CREATE INDEX IF NOT EXISTS idx_orch_deployments_status ON orchestrated_deployments(status);

-- Ajouter la FK orchestrated_deployment_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_deployments_orchestrated'
  ) THEN
    ALTER TABLE content_deployments
      ADD CONSTRAINT fk_content_deployments_orchestrated
      FOREIGN KEY (orchestrated_deployment_id) REFERENCES orchestrated_deployments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Table password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Table audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Table recurring_schedules (tâches planifiées)
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  task_type VARCHAR(100) NOT NULL,
  frequency VARCHAR(50) NOT NULL,
  hour INTEGER DEFAULT 0,
  minute INTEGER DEFAULT 0,
  day_of_week INTEGER,
  day_of_month INTEGER,
  task_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_frequency CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly'))
);

-- Table recurring_schedule_executions
CREATE TABLE IF NOT EXISTS recurring_schedule_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'running',
  result JSONB,
  error_message TEXT,
  CONSTRAINT check_exec_status CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule ON recurring_schedule_executions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_executions_started ON recurring_schedule_executions(started_at DESC);

-- Table advertisers (anciennement sponsors)
CREATE TABLE IF NOT EXISTS advertisers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  company_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_advertiser_status CHECK (status IN ('active', 'inactive', 'pending'))
);

-- Table agencies (agences gérant plusieurs annonceurs)
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  company_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_agency_status CHECK (status IN ('active', 'inactive', 'pending'))
);

-- Ajouter agency_id aux advertisers (une agence peut gérer plusieurs annonceurs)
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Ajouter advertiser_id et agency_id aux users pour les comptes annonceurs/agences
ALTER TABLE users ADD COLUMN IF NOT EXISTS advertiser_id UUID REFERENCES advertisers(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Mettre à jour la contrainte de rôle pour inclure les nouveaux rôles
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role;
ALTER TABLE users ADD CONSTRAINT check_role CHECK (role IN ('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'agency'));

-- Table advertiser_videos (liaison advertisers <-> videos)
CREATE TABLE IF NOT EXISTS advertiser_videos (
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (advertiser_id, video_id)
);

-- Table advertiser_sites (liaison advertisers <-> sites)
CREATE TABLE IF NOT EXISTS advertiser_sites (
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (advertiser_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_advertiser_sites_advertiser ON advertiser_sites(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_advertiser_sites_site ON advertiser_sites(site_id);

-- Table agency_sites (liaison agencies <-> sites)
CREATE TABLE IF NOT EXISTS agency_sites (
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (agency_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_sites_agency ON agency_sites(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_sites_site ON agency_sites(site_id);

-- NOTE: advertiser_impressions table removed — consolidated into video_plays (category = 'sponsor')
-- NOTE: advertiser_daily_stats table removed — replaced by advertiser_daily_stats_live view (ADR-035 Phase 4)

-- Table site_sponsors (sponsors locaux de club)
CREATE TABLE IF NOT EXISTS site_sponsors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    logo_url        TEXT,
    contract_amount DECIMAL(10,2),
    contract_start  DATE,
    contract_end    DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_site_sponsor_status CHECK (status IN ('active', 'expired', 'paused'))
);

CREATE INDEX IF NOT EXISTS idx_site_sponsors_site ON site_sponsors(site_id);
CREATE INDEX IF NOT EXISTS idx_site_sponsors_active ON site_sponsors(site_id, status) WHERE status = 'active';

-- Table site_sponsor_videos (vidéos par sponsor de site)
CREATE TABLE IF NOT EXISTS site_sponsor_videos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id     UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    video_id            UUID REFERENCES videos(id) ON DELETE SET NULL,
    video_filename      VARCHAR(255) NOT NULL,
    is_primary          BOOLEAN DEFAULT false,
    added_at            TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_site_sponsor_video UNIQUE (site_sponsor_id, video_filename)
);

CREATE INDEX IF NOT EXISTS idx_site_sponsor_videos_sponsor ON site_sponsor_videos(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_site_sponsor_videos_filename ON site_sponsor_videos(video_filename);

-- Table site_sponsor_daily_stats (stats agrégées par sponsor par jour, préservées indéfiniment)
CREATE TABLE IF NOT EXISTS site_sponsor_daily_stats (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id             UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    site_id                     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date                        DATE NOT NULL,
    -- Core metrics
    total_impressions           INTEGER DEFAULT 0,
    total_screen_time_seconds   INTEGER DEFAULT 0,
    completed_plays             INTEGER DEFAULT 0,
    estimated_reach             INTEGER DEFAULT 0,
    manual_triggers             INTEGER DEFAULT 0,
    active_videos               INTEGER DEFAULT 0,
    -- Event type breakdown
    impressions_match           INTEGER DEFAULT 0,
    screen_time_match           INTEGER DEFAULT 0,
    completed_match             INTEGER DEFAULT 0,
    impressions_training        INTEGER DEFAULT 0,
    screen_time_training        INTEGER DEFAULT 0,
    completed_training          INTEGER DEFAULT 0,
    impressions_tournament      INTEGER DEFAULT 0,
    screen_time_tournament      INTEGER DEFAULT 0,
    completed_tournament        INTEGER DEFAULT 0,
    impressions_other           INTEGER DEFAULT 0,
    screen_time_other           INTEGER DEFAULT 0,
    completed_other             INTEGER DEFAULT 0,
    -- Period breakdown
    impressions_pre_match       INTEGER DEFAULT 0,
    screen_time_pre_match       INTEGER DEFAULT 0,
    completed_pre_match         INTEGER DEFAULT 0,
    impressions_halftime        INTEGER DEFAULT 0,
    screen_time_halftime        INTEGER DEFAULT 0,
    completed_halftime          INTEGER DEFAULT 0,
    impressions_post_match      INTEGER DEFAULT 0,
    screen_time_post_match      INTEGER DEFAULT 0,
    completed_post_match        INTEGER DEFAULT 0,
    impressions_loop            INTEGER DEFAULT 0,
    screen_time_loop            INTEGER DEFAULT 0,
    completed_loop              INTEGER DEFAULT 0,
    -- Match-day audience
    audience_estimate_match     INTEGER DEFAULT 0,
    -- Network advertiser linkage
    sponsor_id                  UUID,
    calculated_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_sponsor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ssds_sponsor ON site_sponsor_daily_stats(site_sponsor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssds_site ON site_sponsor_daily_stats(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssds_date ON site_sponsor_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_ssds_sponsor_id ON site_sponsor_daily_stats(sponsor_id, date DESC) WHERE sponsor_id IS NOT NULL;

-- Table site_sponsor_daily_video_stats (stats per-vidéo par jour)
CREATE TABLE IF NOT EXISTS site_sponsor_daily_video_stats (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id         UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date                    DATE NOT NULL,
    video_filename          VARCHAR(255) NOT NULL,
    impressions             INTEGER DEFAULT 0,
    screen_time_seconds     INTEGER DEFAULT 0,
    completed_plays         INTEGER DEFAULT 0,
    manual_triggers         INTEGER DEFAULT 0,
    total_duration_played   INTEGER DEFAULT 0,
    calculated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_sponsor_id, date, video_filename)
);

CREATE INDEX IF NOT EXISTS idx_ssdvs_sponsor ON site_sponsor_daily_video_stats(site_sponsor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ssdvs_site ON site_sponsor_daily_video_stats(site_id, date DESC);

-- P5: Branding club pour les rapports PDF
ALTER TABLE sites ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS color_primary VARCHAR(7) DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS color_secondary VARCHAR(7) DEFAULT NULL;

-- P5: Magic link pour acces sponsor autonome
CREATE TABLE IF NOT EXISTS sponsor_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_sponsor_id UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sat_token_hash ON sponsor_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_sat_site_sponsor_id ON sponsor_access_tokens(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sat_expires_at ON sponsor_access_tokens(expires_at);

-- Ajouter video_id et sponsor_id aux tables analytics
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE SET NULL;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES advertisers(id) ON DELETE SET NULL;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS analytics_category VARCHAR(50);
-- tv_status: HDMI-CEC status - 'on' (visible), 'standby' (TV off), 'disconnected', 'unknown'
-- Only 'on' and 'unknown' should be counted in stats (videos actually visible)
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS tv_status VARCHAR(20) DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS idx_video_plays_tv_status ON video_plays(tv_status);

-- Sponsor context columns (consolidated pipeline — event_type, period, audience, etc.)
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS event_type VARCHAR(50);
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS period VARCHAR(50);
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS audience_estimate INTEGER;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS position_in_loop INTEGER;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS site_sponsor_id UUID;
CREATE INDEX IF NOT EXISTS idx_video_plays_event_type ON video_plays(event_type);
CREATE INDEX IF NOT EXISTS idx_video_plays_site_sponsor ON video_plays(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_sponsor_analytics ON video_plays(site_id, category, played_at DESC) WHERE category IN ('sponsor', 'sponsor_local', 'sponsor_neopro');

-- =============================================================================
-- CAMPAIGNS (PI-2 : E-11 Régie, E-17 A/B Testing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertiser_id UUID NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_impressions INTEGER,
  target_sites UUID[],
  campaign_type VARCHAR(50) NOT NULL DEFAULT 'standard',
  variant_config JSONB,
  target_criteria JSONB DEFAULT NULL,
  budget_cents INTEGER DEFAULT NULL,
  target_cpm_cents INTEGER DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_campaign_type CHECK (campaign_type IN ('standard', 'regional', 'ab_test')),
  CONSTRAINT check_campaign_status CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  CONSTRAINT check_campaign_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT check_target_impressions_positive CHECK (target_impressions IS NULL OR target_impressions > 0)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser ON campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

-- =============================================================================
-- CAMPAIGN_VIDEOS — Which videos are in a campaign
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_video UNIQUE (campaign_id, video_id),
  CONSTRAINT check_campaign_video_weight CHECK (weight > 0)
);

CREATE INDEX IF NOT EXISTS idx_campaign_videos_campaign ON campaign_videos(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_videos_video ON campaign_videos(video_id);

-- =============================================================================
-- CAMPAIGN_SITES — Resolved sites for a campaign (replaces target_sites UUID[])
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  deployment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  deployed_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_site UNIQUE (campaign_id, site_id),
  CONSTRAINT check_deployment_status CHECK (deployment_status IN ('pending', 'deployed', 'failed', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_sites_campaign ON campaign_sites(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sites_site ON campaign_sites(site_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sites_status ON campaign_sites(deployment_status) WHERE deployment_status = 'pending';

-- =============================================================================
-- VIEW: campaign_stats_live — real-time campaign performance
-- =============================================================================

CREATE OR REPLACE VIEW campaign_stats_live AS
SELECT
  c.id AS campaign_id,
  c.advertiser_id,
  c.name AS campaign_name,
  c.status,
  c.target_impressions,
  c.budget_cents,
  c.target_cpm_cents,
  c.start_date,
  c.end_date,
  COALESCE(stats.total_impressions, 0) AS total_impressions,
  COALESCE(stats.total_screen_time_seconds, 0) AS total_screen_time_seconds,
  COALESCE(stats.avg_completion_rate, 0) AS avg_completion_rate,
  COALESCE(stats.active_sites, 0) AS active_sites,
  COALESCE(stats.unique_videos, 0) AS unique_videos,
  CASE
    WHEN c.target_impressions IS NOT NULL AND c.target_impressions > 0
    THEN ROUND((COALESCE(stats.total_impressions, 0)::numeric / c.target_impressions) * 100, 1)
    ELSE NULL
  END AS progress_percent,
  CASE
    WHEN COALESCE(stats.total_impressions, 0) > 0 AND c.budget_cents IS NOT NULL
    THEN ROUND((c.budget_cents::numeric / (COALESCE(stats.total_impressions, 0) / 1000.0)), 2)
    ELSE NULL
  END AS effective_cpm_cents
FROM campaigns c
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_impressions,
    COALESCE(SUM(vp.duration_played), 0) AS total_screen_time_seconds,
    ROUND(AVG(CASE WHEN vp.video_duration > 0 THEN LEAST(vp.duration_played::numeric / vp.video_duration, 1) ELSE 0 END) * 100, 1) AS avg_completion_rate,
    COUNT(DISTINCT vp.site_id) AS active_sites,
    COUNT(DISTINCT vp.video_id) AS unique_videos
  FROM video_plays vp
  WHERE vp.campaign_id = c.id
) stats ON true;

-- Campaign tracking sur video_plays
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_video_plays_campaign ON video_plays(campaign_id) WHERE campaign_id IS NOT NULL;

-- E-23 US-23.7.4: Playback source (kiosk=Pi, pc=browser)
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_video_plays_source ON video_plays (source) WHERE source IS NOT NULL;

-- Interruption reason: why a video stopped before completion
-- Values: manual_action, profile_switch, video_error, hdmi_lost, loop_advance, browser_close
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS interruption_reason VARCHAR(30) DEFAULT NULL;

-- =============================================================================
-- SCHEDULED REPORTS (PI-2 : E-16 Rapports Automatiques)
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'advertiser',
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  next_send_at TIMESTAMP,
  last_sent_at TIMESTAMP,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_report_type CHECK (report_type IN ('advertiser', 'campaign', 'club')),
  CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_advertiser ON scheduled_reports(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_send ON scheduled_reports(next_send_at) WHERE enabled = true;

-- Bridge view for advertiser dashboard (reads from video_plays instead of advertiser_impressions)
CREATE OR REPLACE VIEW sponsor_impressions_bridge AS
SELECT vp.id, vp.site_id, vp.sponsor_id AS advertiser_id, vp.video_id,
       vp.video_filename, vp.played_at, vp.duration_played, vp.video_duration,
       vp.completed, vp.event_type, vp.period, vp.trigger_type,
       vp.position_in_loop, vp.audience_estimate, vp.site_sponsor_id, vp.tv_status,
       vp.interruption_reason
FROM video_plays vp
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
  AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL);

-- Vue pending_commands_summary
CREATE OR REPLACE VIEW pending_commands_summary AS
SELECT
  s.id AS site_id,
  s.club_name,
  s.status AS site_status,
  COUNT(pc.id) AS pending_count,
  MIN(pc.priority) AS highest_priority,
  MIN(pc.created_at) AS oldest_command,
  MAX(pc.created_at) AS newest_command,
  ARRAY_AGG(DISTINCT pc.command_type) AS command_types
FROM sites s
LEFT JOIN pending_commands pc ON pc.site_id = s.id
GROUP BY s.id, s.club_name, s.status;

-- Trigger pour updated_at sur config_drafts
CREATE OR REPLACE FUNCTION update_config_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_config_drafts_updated_at ON config_drafts;
CREATE TRIGGER trigger_update_config_drafts_updated_at
  BEFORE UPDATE ON config_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_config_drafts_updated_at();

-- =============================================================================
-- VUES ANALYTICS (créées séparément pour le reporting)
-- =============================================================================

-- Vue club_analytics_summary (stats agrégées par site)
CREATE OR REPLACE VIEW club_analytics_summary AS
SELECT
  s.id AS site_id,
  s.site_name,
  s.club_name,
  s.status,
  COUNT(DISTINCT cs.id) AS total_sessions,
  COALESCE(SUM(vp.id IS NOT NULL::int), 0) AS total_video_plays,
  MAX(cs.start_time) AS last_session
FROM sites s
LEFT JOIN club_sessions cs ON cs.site_id = s.id
LEFT JOIN video_plays vp ON vp.site_id = s.id
GROUP BY s.id, s.site_name, s.club_name, s.status;

-- Vue top_videos_by_site (vidéos les plus jouées par site)
CREATE OR REPLACE VIEW top_videos_by_site AS
SELECT
  site_id,
  video_filename,
  COUNT(*) AS play_count,
  SUM(duration_watched) AS total_duration
FROM video_plays
WHERE played_at > NOW() - INTERVAL '30 days'
GROUP BY site_id, video_filename
ORDER BY play_count DESC;

-- Vue advertiser_analytics_summary (stats agrégées par annonceur)
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

-- Vue advertiser_performance_by_site (performance par site pour un annonceur)
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

-- Vue advertiser_stats_summary (résumé stats annonceurs)
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

-- Vue top_advertiser_videos (vidéos sponsors les plus jouées)
CREATE OR REPLACE VIEW top_advertiser_videos AS
SELECT
  vp.sponsor_id AS advertiser_id,
  a.name AS advertiser_name,
  vp.video_filename,
  COUNT(*) AS play_count,
  SUM(vp.duration_played) AS total_duration
FROM video_plays vp
JOIN advertisers a ON a.id = vp.sponsor_id
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro') AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY vp.sponsor_id, a.name, vp.video_filename
ORDER BY play_count DESC;

-- Vue advertiser_accessible_sites (sites accessibles par annonceur)
CREATE OR REPLACE VIEW advertiser_accessible_sites AS
SELECT
  a.id AS advertiser_id,
  a.name AS advertiser_name,
  s.id AS site_id,
  s.site_name,
  s.club_name,
  s.status
FROM advertisers a
JOIN advertiser_sites asites ON asites.advertiser_id = a.id
JOIN sites s ON s.id = asites.site_id;

-- Vue agency_accessible_sites (sites accessibles par agence)
CREATE OR REPLACE VIEW agency_accessible_sites AS
SELECT
  ag.id AS agency_id,
  ag.name AS agency_name,
  s.id AS site_id,
  s.site_name,
  s.club_name,
  s.status
FROM agencies ag
JOIN agency_sites agsites ON agsites.agency_id = ag.id
JOIN sites s ON s.id = agsites.site_id;

-- Vue agency_stats_summary (résumé stats agences)
CREATE OR REPLACE VIEW agency_stats_summary AS
SELECT
  ag.id AS agency_id,
  ag.name,
  ag.status,
  COUNT(DISTINCT a.id) AS advertiser_count,
  COUNT(DISTINCT agsites.site_id) AS sites_count
FROM agencies ag
LEFT JOIN advertisers a ON a.agency_id = ag.id
LEFT JOIN agency_sites agsites ON agsites.agency_id = ag.id
GROUP BY ag.id, ag.name, ag.status;

-- =============================================================================
-- VUES LIVE (données agrégées + temps réel du jour)
-- =============================================================================
-- Les VIEWs _live remplacent l'accès direct aux tables agrégées dans tous
-- les repositories et services. Elles combinent l'historique CRON (J-1)
-- avec une agrégation temps réel de video_plays pour la journée en cours.

-- club_daily_stats_live : club_daily_stats + données du jour
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

-- advertiser_daily_stats_live : stats annonceur agrégées depuis video_plays (ADR-035 Phase 4)
CREATE OR REPLACE VIEW advertiser_daily_stats_live AS
SELECT
  vp.video_id,
  vp.site_id,
  DATE(vp.played_at) AS date,
  COUNT(*) AS total_impressions,
  SUM(vp.duration_played) AS total_screen_time,
  ROUND(AVG(
    CASE WHEN vp.video_duration > 0
      THEN LEAST(vp.duration_played::numeric / vp.video_duration, 1.0) * 100
      ELSE 0
    END
  ), 1) AS completion_rate,
  vp.sponsor_id AS advertiser_id
FROM video_plays vp
WHERE vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
  AND vp.video_id IS NOT NULL
GROUP BY vp.video_id, vp.site_id, DATE(vp.played_at), vp.sponsor_id;

COMMENT ON VIEW club_daily_stats_live IS 'club_daily_stats + données live du jour depuis video_plays. Remplace club_daily_stats pour les queries dashboard.';
COMMENT ON VIEW advertiser_daily_stats_live IS 'Stats annonceur agrégées par vidéo/site/jour depuis video_plays. Remplace l''ancienne table advertiser_daily_stats (ADR-035 Phase 4).';

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

-- Commentaires pour les tables principales
COMMENT ON TABLE pending_commands IS 'File d''attente des commandes pour sites offline';
COMMENT ON TABLE config_drafts IS 'Brouillons de configuration (1 par site)';
COMMENT ON TABLE orchestrated_deployments IS 'Déploiements orchestrés (vidéos puis config)';
COMMENT ON TABLE audit_logs IS 'Logs d''audit des actions admin';
COMMENT ON TABLE advertisers IS 'Annonceurs (sponsors) avec contrats publicitaires';
COMMENT ON TABLE agencies IS 'Agences gérant plusieurs annonceurs';
COMMENT ON TABLE advertiser_sites IS 'Liaison annonceurs <-> sites autorisés';
COMMENT ON TABLE agency_sites IS 'Liaison agences <-> sites autorisés';

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
    RAISE NOTICE '  - campaigns, scheduled_reports';
    RAISE NOTICE '';
    RAISE NOTICE 'Vues: club_analytics_summary, top_videos_by_site, club_daily_stats_live, advertiser_daily_stats_live';
    RAISE NOTICE 'Fonctions: calculate_daily_stats(), calculate_all_daily_stats()';
    RAISE NOTICE '';
    RAISE NOTICE 'Créez un utilisateur admin avec: npm run create-admin';
END $$;
