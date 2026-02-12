-- =============================================================================
-- TABLE PROFILS DE CONFIGURATION
-- Permet N configurations par site (multi-config / tournois / profils)
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

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_config_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_config_profiles_updated_at ON config_profiles;
CREATE TRIGGER trigger_update_config_profiles_updated_at
  BEFORE UPDATE ON config_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_config_profiles_updated_at();

-- Ajouter profile_id a config_history pour traçabilite
ALTER TABLE config_history ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES config_profiles(id) ON DELETE SET NULL;

-- Ajouter active_profile_id a sites pour tracker le profil actif du Pi
ALTER TABLE sites ADD COLUMN IF NOT EXISTS active_profile_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sites_active_profile'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT fk_sites_active_profile
      FOREIGN KEY (active_profile_id) REFERENCES config_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
