-- =============================================================================
-- Migration: Ajout des rôles Sponsor et Agence
-- =============================================================================
-- Date: 2025-12-25
-- Description: Ajoute les rôles 'sponsor' et 'agency' pour permettre un accès
--              limité aux sponsors et agences partenaires.
-- =============================================================================

-- =============================================================================
-- 1. MISE À JOUR DU CHECK CONSTRAINT SUR LA TABLE USERS
-- =============================================================================

-- Supprimer l'ancien constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role;

-- Ajouter le nouveau constraint avec les nouveaux rôles
ALTER TABLE users ADD CONSTRAINT check_role
  CHECK (role IN ('super_admin', 'admin', 'operator', 'viewer', 'sponsor', 'agency'));

-- Migrer les anciens 'admin' en 'super_admin' (optionnel, selon politique)
-- UPDATE users SET role = 'super_admin' WHERE role = 'admin' AND email LIKE '%@neopro.%';

-- =============================================================================
-- 2. TABLE DES AGENCES
-- =============================================================================

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),

  -- Contact principal
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),

  -- Adresse (optionnel)
  address JSONB,

  -- Status et metadata
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_agency_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS update_agencies_updated_at ON agencies;
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. ASSOCIATION USERS <-> SPONSORS (un user sponsor peut représenter un sponsor)
-- =============================================================================

-- Ajouter colonne sponsor_id à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES sponsors(id) ON DELETE SET NULL;

-- Index pour recherche par sponsor
CREATE INDEX IF NOT EXISTS idx_users_sponsor ON users(sponsor_id) WHERE sponsor_id IS NOT NULL;

-- =============================================================================
-- 4. ASSOCIATION USERS <-> AGENCIES (un user agency peut représenter une agence)
-- =============================================================================

-- Ajouter colonne agency_id à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Index pour recherche par agence
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id) WHERE agency_id IS NOT NULL;

-- =============================================================================
-- 5. ASSOCIATION AGENCIES <-> SITES (une agence gère plusieurs sites)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agency_sites (
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by UUID REFERENCES users(id),
  PRIMARY KEY (agency_id, site_id)
);

-- Index pour recherche sites par agence
CREATE INDEX IF NOT EXISTS idx_agency_sites_agency ON agency_sites(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_sites_site ON agency_sites(site_id);

-- =============================================================================
-- 6. ASSOCIATION SPONSORS <-> SITES (sites où le sponsor est diffusé)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sponsor_sites (
  sponsor_id UUID REFERENCES sponsors(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  contract_start DATE,
  contract_end DATE,
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (sponsor_id, site_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_sponsor_sites_sponsor ON sponsor_sites(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_sites_site ON sponsor_sites(site_id);

-- =============================================================================
-- 7. VUES POUR LES RÔLES SPONSOR ET AGENCY
-- =============================================================================

-- Vue des sites pour un sponsor (basée sur sponsor_sites)
CREATE OR REPLACE VIEW sponsor_accessible_sites AS
SELECT
  ss.sponsor_id,
  s.id as site_id,
  s.site_name,
  s.club_name,
  s.location,
  s.status,
  s.last_seen_at,
  ss.contract_start,
  ss.contract_end,
  ss.is_active
FROM sponsor_sites ss
JOIN sites s ON s.id = ss.site_id
WHERE ss.is_active = true;

-- Vue des sites pour une agence
CREATE OR REPLACE VIEW agency_accessible_sites AS
SELECT
  as2.agency_id,
  s.id as site_id,
  s.site_name,
  s.club_name,
  s.location,
  s.status,
  s.last_seen_at,
  s.software_version
FROM agency_sites as2
JOIN sites s ON s.id = as2.site_id;

-- Vue statistiques agrégées pour sponsors
CREATE OR REPLACE VIEW sponsor_stats_summary AS
SELECT
  sp.id as sponsor_id,
  sp.name as sponsor_name,
  COUNT(DISTINCT ss.site_id) as total_sites,
  COUNT(DISTINCT sv.video_id) as total_videos,
  COALESCE(SUM(sds.total_impressions), 0) as total_impressions_30d,
  COALESCE(SUM(sds.total_duration_seconds), 0) as total_screen_time_30d,
  ROUND(AVG(sds.completion_rate)::numeric, 2) as avg_completion_rate_30d
FROM sponsors sp
LEFT JOIN sponsor_sites ss ON ss.sponsor_id = sp.id AND ss.is_active = true
LEFT JOIN sponsor_videos sv ON sv.sponsor_id = sp.id
LEFT JOIN sponsor_daily_stats sds ON sds.video_id = sv.video_id
  AND sds.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY sp.id, sp.name;

-- Vue statistiques agrégées pour agences
CREATE OR REPLACE VIEW agency_stats_summary AS
SELECT
  a.id as agency_id,
  a.name as agency_name,
  COUNT(DISTINCT as2.site_id) as total_sites,
  COUNT(DISTINCT CASE WHEN s.status = 'online' THEN s.id END) as online_sites,
  COUNT(DISTINCT CASE WHEN s.status = 'offline' THEN s.id END) as offline_sites,
  COALESCE(SUM(cds.videos_played), 0) as total_videos_played_30d,
  COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time_30d
FROM agencies a
LEFT JOIN agency_sites as2 ON as2.agency_id = a.id
LEFT JOIN sites s ON s.id = as2.site_id
LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
  AND cds.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.id, a.name;

-- =============================================================================
-- 8. COMMENTAIRES
-- =============================================================================

COMMENT ON TABLE agencies IS 'Agences partenaires qui gèrent plusieurs clubs';
COMMENT ON TABLE agency_sites IS 'Association agences <-> sites gérés';
COMMENT ON TABLE sponsor_sites IS 'Association sponsors <-> sites de diffusion';
COMMENT ON COLUMN users.sponsor_id IS 'Lien vers le sponsor si role=sponsor';
COMMENT ON COLUMN users.agency_id IS 'Lien vers l''agence si role=agency';

COMMENT ON VIEW sponsor_accessible_sites IS 'Sites accessibles pour un sponsor';
COMMENT ON VIEW agency_accessible_sites IS 'Sites accessibles pour une agence';
COMMENT ON VIEW sponsor_stats_summary IS 'Statistiques résumées par sponsor';
COMMENT ON VIEW agency_stats_summary IS 'Statistiques résumées par agence';

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration sponsor-agency-roles terminée!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Nouveaux rôles: sponsor, agency';
  RAISE NOTICE 'Nouvelles tables: agencies, agency_sites, sponsor_sites';
  RAISE NOTICE 'Nouvelles colonnes: users.sponsor_id, users.agency_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Créer un utilisateur sponsor:';
  RAISE NOTICE '  INSERT INTO users (email, password_hash, full_name, role, sponsor_id)';
  RAISE NOTICE '  VALUES (''sponsor@example.com'', ''...'', ''Nom'', ''sponsor'', ''uuid-sponsor'');';
END $$;
