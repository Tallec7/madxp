-- Migration: Ajouter les colonnes pour le miroir de configuration locale
-- Date: 2025-12-09
-- Description: Permet au serveur central de stocker une copie de la configuration
--              de chaque Pi pour visualisation dans le dashboard.

-- Ajouter les colonnes à la table sites
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS local_config_mirror JSONB,
ADD COLUMN IF NOT EXISTS local_config_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS last_config_sync TIMESTAMPTZ;

-- Index pour les recherches par hash (détection de changements)
CREATE INDEX IF NOT EXISTS idx_sites_local_config_hash ON sites(local_config_hash);

-- Commentaires
COMMENT ON COLUMN sites.local_config_mirror IS 'Miroir de la configuration.json locale du Pi';
COMMENT ON COLUMN sites.local_config_hash IS 'Hash SHA256 (16 premiers caractères) de la configuration locale';
COMMENT ON COLUMN sites.last_config_sync IS 'Date de dernière synchronisation de la configuration locale';
