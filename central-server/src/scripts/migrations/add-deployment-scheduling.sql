-- Migration: Add Deployment Scheduling
-- Cette migration ajoute le support pour la planification des deployements

-- 1. Ajouter la colonne scheduled_at aux tables de deploiement
ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
ALTER TABLE update_deployments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

-- 2. Modifier les contraintes de status pour inclure 'scheduled'
-- D'abord supprimer les contraintes existantes
ALTER TABLE content_deployments DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE update_deployments DROP CONSTRAINT IF EXISTS check_status_update;

-- Puis recreer avec le nouveau status
ALTER TABLE content_deployments ADD CONSTRAINT check_status
  CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled'));

ALTER TABLE update_deployments ADD CONSTRAINT check_status_update
  CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'rolled_back'));

-- 3. Creer des index pour les requetes de scheduling
CREATE INDEX IF NOT EXISTS idx_content_deployments_scheduled
  ON content_deployments(scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_update_deployments_scheduled
  ON update_deployments(scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- 4. Ajouter une colonne pour noter qui a programme le deploiement
ALTER TABLE content_deployments ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES users(id);
ALTER TABLE update_deployments ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES users(id);

-- 5. Fonction pour recuperer les deploiements a executer
CREATE OR REPLACE FUNCTION get_scheduled_deployments_due()
RETURNS TABLE (
  deployment_type TEXT,
  deployment_id UUID,
  scheduled_at TIMESTAMP
) AS $$
BEGIN
  -- Deploiements de contenu planifies et dus
  RETURN QUERY
  SELECT
    'content'::TEXT as deployment_type,
    cd.id as deployment_id,
    cd.scheduled_at
  FROM content_deployments cd
  WHERE cd.status = 'scheduled'
    AND cd.scheduled_at IS NOT NULL
    AND cd.scheduled_at <= NOW()
  UNION ALL
  -- Deploiements de mise a jour planifies et dus
  SELECT
    'update'::TEXT as deployment_type,
    ud.id as deployment_id,
    ud.scheduled_at
  FROM update_deployments ud
  WHERE ud.status = 'scheduled'
    AND ud.scheduled_at IS NOT NULL
    AND ud.scheduled_at <= NOW()
  ORDER BY scheduled_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Log de migration
DO $$
BEGIN
  RAISE NOTICE 'Migration: add-deployment-scheduling completed';
  RAISE NOTICE 'Added columns: scheduled_at, scheduled_by';
  RAISE NOTICE 'Updated status constraint to include "scheduled"';
  RAISE NOTICE 'Created indexes for scheduled deployments';
  RAISE NOTICE 'Created function: get_scheduled_deployments_due()';
END
$$;
