-- Script de création de la table config_history
-- Permet de stocker l'historique des configurations des sites pour rollback

-- Table pour l'historique des configurations
CREATE TABLE IF NOT EXISTS config_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL,
  deployed_by UUID REFERENCES users(id),
  deployed_at TIMESTAMP DEFAULT NOW(),
  comment TEXT,
  -- Informations pour le diff
  previous_version_id UUID REFERENCES config_history(id),
  changes_summary JSONB -- Résumé des changements par rapport à la version précédente
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_config_history_site ON config_history(site_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_history_deployed_by ON config_history(deployed_by);

-- Commentaires
COMMENT ON TABLE config_history IS 'Historique des configurations déployées sur les sites';
COMMENT ON COLUMN config_history.configuration IS 'Configuration complète en JSONB';
COMMENT ON COLUMN config_history.previous_version_id IS 'Référence vers la version précédente pour le diff';
COMMENT ON COLUMN config_history.changes_summary IS 'Résumé des changements: [{field, type, oldValue, newValue}]';

-- Message de fin
DO $$
BEGIN
    RAISE NOTICE 'Table config_history créée avec succès!';
END $$;
