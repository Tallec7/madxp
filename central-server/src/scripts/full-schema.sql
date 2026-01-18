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
--   - Analytics: club_sessions, video_plays, club_daily_stats
--   - Auth: password_reset_tokens, audit_logs
--   - Scheduling: recurring_schedules, recurring_schedule_executions
--   - Advertisers: advertisers, agencies, advertiser_impressions, advertiser_daily_stats
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

-- Table advertiser_impressions (tracking des affichages pubs)
CREATE TABLE IF NOT EXISTS advertiser_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE SET NULL,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  video_filename VARCHAR(255),
  played_at TIMESTAMP NOT NULL,
  duration_played INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advertiser_impressions_site ON advertiser_impressions(site_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_advertiser_impressions_advertiser ON advertiser_impressions(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_advertiser_impressions_played_at ON advertiser_impressions(played_at);

-- Table advertiser_daily_stats (agrégation quotidienne des impressions)
CREATE TABLE IF NOT EXISTS advertiser_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  impressions_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  unique_videos INTEGER DEFAULT 0,
  calculated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, advertiser_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_advertiser_daily_stats_date ON advertiser_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_advertiser_daily_stats_advertiser ON advertiser_daily_stats(advertiser_id);

-- Ajouter video_id et sponsor_id aux tables analytics
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE SET NULL;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES advertisers(id) ON DELETE SET NULL;
ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS analytics_category VARCHAR(50);

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
  COUNT(DISTINCT ai.site_id) AS sites_reached,
  COUNT(ai.id) AS total_impressions,
  COALESCE(SUM(ai.duration_played), 0) AS total_duration
FROM advertisers a
LEFT JOIN advertiser_impressions ai ON ai.advertiser_id = a.id
GROUP BY a.id, a.name;

-- Vue advertiser_performance_by_site (performance par site pour un annonceur)
CREATE OR REPLACE VIEW advertiser_performance_by_site AS
SELECT
  ai.advertiser_id,
  ai.site_id,
  s.site_name,
  s.club_name,
  COUNT(ai.id) AS impressions_count,
  COALESCE(SUM(ai.duration_played), 0) AS total_duration
FROM advertiser_impressions ai
JOIN sites s ON s.id = ai.site_id
GROUP BY ai.advertiser_id, ai.site_id, s.site_name, s.club_name;

-- Vue advertiser_stats_summary (résumé stats annonceurs)
CREATE OR REPLACE VIEW advertiser_stats_summary AS
SELECT
  a.id AS advertiser_id,
  a.name,
  a.status,
  COUNT(DISTINCT av.video_id) AS video_count,
  COUNT(DISTINCT ai.site_id) AS sites_count,
  COUNT(ai.id) AS total_impressions
FROM advertisers a
LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
LEFT JOIN advertiser_impressions ai ON ai.advertiser_id = a.id
GROUP BY a.id, a.name, a.status;

-- Vue top_advertiser_videos (vidéos sponsors les plus jouées)
CREATE OR REPLACE VIEW top_advertiser_videos AS
SELECT
  ai.advertiser_id,
  a.name AS advertiser_name,
  ai.video_filename,
  COUNT(*) AS play_count,
  SUM(ai.duration_played) AS total_duration
FROM advertiser_impressions ai
JOIN advertisers a ON a.id = ai.advertiser_id
WHERE ai.played_at > NOW() - INTERVAL '30 days'
GROUP BY ai.advertiser_id, a.name, ai.video_filename
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
-- COMMENTAIRES
-- =============================================================================

-- Commentaires pour les tables principales
COMMENT ON TABLE pending_commands IS 'File d''attente des commandes pour sites offline';
COMMENT ON TABLE config_drafts IS 'Brouillons de configuration (1 par site)';
COMMENT ON TABLE orchestrated_deployments IS 'Déploiements orchestrés (vidéos puis config)';
COMMENT ON TABLE audit_logs IS 'Logs d''audit des actions admin';
COMMENT ON TABLE advertisers IS 'Annonceurs (sponsors) avec contrats publicitaires';
COMMENT ON TABLE agencies IS 'Agences gérant plusieurs annonceurs';
COMMENT ON TABLE advertiser_impressions IS 'Tracking des impressions publicitaires';
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
    RAISE NOTICE '';
    RAISE NOTICE 'Vues: club_analytics_summary, top_videos_by_site';
    RAISE NOTICE 'Fonctions: calculate_daily_stats(), calculate_all_daily_stats()';
    RAISE NOTICE '';
    RAISE NOTICE 'Créez un utilisateur admin avec: npm run create-admin';
END $$;
