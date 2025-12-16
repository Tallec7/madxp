-- =============================================================================
-- Migration: Command Queue pour sites offline
-- =============================================================================
-- Permet de stocker des commandes en attente lorsqu'un site est déconnecté.
-- Les commandes seront automatiquement envoyées à la reconnexion du site.
-- =============================================================================

-- Table des commandes en file d'attente
CREATE TABLE IF NOT EXISTS pending_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  command_type VARCHAR(100) NOT NULL,
  command_data JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5,  -- 1 = urgent, 5 = normal, 10 = basse priorité
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,  -- NULL = pas d'expiration

  -- Tracking
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  max_attempts INTEGER DEFAULT 3,

  -- Metadata pour le dashboard
  description TEXT,

  CONSTRAINT check_priority CHECK (priority >= 1 AND priority <= 10)
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_pending_commands_site ON pending_commands(site_id);
CREATE INDEX IF NOT EXISTS idx_pending_commands_priority ON pending_commands(site_id, priority ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pending_commands_expires ON pending_commands(expires_at) WHERE expires_at IS NOT NULL;

-- Ajouter une colonne à remote_commands pour tracer l'origine
ALTER TABLE remote_commands
ADD COLUMN IF NOT EXISTS pending_command_id UUID REFERENCES pending_commands(id) ON DELETE SET NULL;

-- Fonction pour nettoyer les commandes expirées (à appeler via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_pending_commands()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM pending_commands
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Vue pour voir l'état de la queue par site
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

-- Commentaires
COMMENT ON TABLE pending_commands IS 'File d''attente des commandes pour sites offline';
COMMENT ON COLUMN pending_commands.priority IS '1=urgent, 5=normal, 10=basse priorité';
COMMENT ON COLUMN pending_commands.expires_at IS 'Date d''expiration (NULL=pas d''expiration)';
COMMENT ON COLUMN pending_commands.attempts IS 'Nombre de tentatives d''envoi';
COMMENT ON COLUMN pending_commands.max_attempts IS 'Nombre max de tentatives avant abandon';

DO $$
BEGIN
  RAISE NOTICE 'Migration command-queue appliquée avec succès!';
  RAISE NOTICE 'Table créée: pending_commands';
  RAISE NOTICE 'Vue créée: pending_commands_summary';
  RAISE NOTICE 'Fonction créée: cleanup_expired_pending_commands()';
END $$;
