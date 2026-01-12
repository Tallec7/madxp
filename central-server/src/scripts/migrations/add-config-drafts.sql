-- Migration: Add Config Drafts System
-- Date: 2026-01-12
-- Description: Ajoute le support des brouillons de configuration et du déploiement orchestré

-- ============================================================================
-- 1. Table config_drafts (un seul brouillon actif par site)
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,  -- UNIQUE = 1 brouillon par site
  name VARCHAR(255) NOT NULL DEFAULT 'Brouillon',
  configuration JSONB NOT NULL,
  referenced_video_ids UUID[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'draft',  -- draft, deploying, deployed, failed
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_draft_status CHECK (status IN ('draft', 'deploying', 'deployed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_config_drafts_site ON config_drafts(site_id);
CREATE INDEX IF NOT EXISTS idx_config_drafts_status ON config_drafts(status);

COMMENT ON TABLE config_drafts IS 'Brouillons de configuration pour préparation avant déploiement (1 par site)';
COMMENT ON COLUMN config_drafts.referenced_video_ids IS 'IDs des vidéos cloud référencées dans la config';
COMMENT ON COLUMN config_drafts.status IS 'draft=en édition, deploying=en cours, deployed=terminé, failed=échec';

-- ============================================================================
-- 2. Table orchestrated_deployments (suivi déploiement vidéos + config)
-- ============================================================================
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
CREATE INDEX IF NOT EXISTS idx_orch_deployments_draft ON orchestrated_deployments(draft_id);

COMMENT ON TABLE orchestrated_deployments IS 'Suivi des déploiements orchestrés (vidéos puis config)';
COMMENT ON COLUMN orchestrated_deployments.status IS 'pending, deploying_videos, deploying_config, completed, partial_failure, failed';
COMMENT ON COLUMN orchestrated_deployments.configuration_snapshot IS 'Snapshot de la config au moment du déploiement';

-- ============================================================================
-- 3. Colonne uploaded_for_site_id sur videos (upload contextuel)
-- ============================================================================
ALTER TABLE videos ADD COLUMN IF NOT EXISTS uploaded_for_site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_uploaded_for_site ON videos(uploaded_for_site_id)
WHERE uploaded_for_site_id IS NOT NULL;

COMMENT ON COLUMN videos.uploaded_for_site_id IS 'Site pour lequel cette vidéo a été uploadée (contextual upload)';

-- ============================================================================
-- 4. Lien content_deployments → orchestrated_deployments
-- ============================================================================
ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS orchestrated_deployment_id UUID REFERENCES orchestrated_deployments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_deployments_orchestrated ON content_deployments(orchestrated_deployment_id)
WHERE orchestrated_deployment_id IS NOT NULL;

-- ============================================================================
-- 5. Trigger pour mettre à jour updated_at sur config_drafts
-- ============================================================================
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
