-- Script d'initialisation de la base de données NEOPRO Central
-- À exécuter sur PostgreSQL

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- TABLES DES SPONSORS ET ANALYTICS
-- =============================================================================

-- Table pour gérer les sponsors (partenaires)
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(500),
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_sponsor_status CHECK (status IN ('active', 'inactive', 'paused'))
);

-- Association sponsors <-> vidéos (many-to-many)
CREATE TABLE IF NOT EXISTS sponsor_videos (
  sponsor_id UUID REFERENCES sponsors(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (sponsor_id, video_id)
);

-- Table des impressions sponsors (chaque diffusion vidéo)
CREATE TABLE IF NOT EXISTS sponsor_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  played_at TIMESTAMP NOT NULL,
  duration_played INTEGER NOT NULL,
  video_duration INTEGER NOT NULL,
  completed BOOLEAN DEFAULT false,
  interrupted_at INTEGER,
  event_type VARCHAR(50),
  period VARCHAR(50),
  trigger_type VARCHAR(20) DEFAULT 'auto',
  position_in_loop INTEGER,
  audience_estimate INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_event_type CHECK (event_type IN ('match', 'training', 'tournament', 'other', NULL)),
  CONSTRAINT check_period CHECK (period IN ('pre_match', 'halftime', 'post_match', 'loop', NULL)),
  CONSTRAINT check_trigger_type CHECK (trigger_type IN ('auto', 'manual'))
);

-- Table agrégée (calculée quotidiennement via cron job)
CREATE TABLE IF NOT EXISTS sponsor_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_impressions INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  completed_plays INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2),
  unique_events INTEGER DEFAULT 0,
  pre_match_plays INTEGER DEFAULT 0,
  match_plays INTEGER DEFAULT 0,
  post_match_plays INTEGER DEFAULT 0,
  loop_plays INTEGER DEFAULT 0,
  match_events INTEGER DEFAULT 0,
  training_events INTEGER DEFAULT 0,
  tournament_events INTEGER DEFAULT 0,
  other_events INTEGER DEFAULT 0,
  auto_plays INTEGER DEFAULT 0,
  manual_plays INTEGER DEFAULT 0,
  total_audience_estimate INTEGER DEFAULT 0,
  avg_audience_per_play DECIMAL(10,2),
  calculated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(video_id, site_id, date)
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_last_seen ON sites(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_site_time ON metrics(site_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON content_deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_created ON content_deployments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_deployments_status ON update_deployments(status);
CREATE INDEX IF NOT EXISTS idx_commands_site ON remote_commands(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_status ON remote_commands(status);
CREATE INDEX IF NOT EXISTS idx_alerts_site ON alerts(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, severity);

-- Index pour sponsor impressions
CREATE INDEX IF NOT EXISTS idx_impressions_video_date
  ON sponsor_impressions(video_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_site_date
  ON sponsor_impressions(site_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_played_at
  ON sponsor_impressions(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_video_site
  ON sponsor_impressions(video_id, site_id);

-- Index pour sponsor daily stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_date
  ON sponsor_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_video_date
  ON sponsor_daily_stats(video_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_site_date
  ON sponsor_daily_stats(site_id, date DESC);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sponsors_updated_at BEFORE UPDATE ON sponsors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: L'utilisateur admin doit être créé via le script de setup avec un mot de passe sécurisé
-- Exécuter: npm run create-admin après l'initialisation de la base

-- Message de fin
DO $$
BEGIN
    RAISE NOTICE 'Base de données initialisée avec succès!';
    RAISE NOTICE '⚠️  Créez un utilisateur admin avec: npm run create-admin';
END $$;
