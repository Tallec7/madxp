-- Migration: Add proof_of_broadcasts table for screenshot proofs
-- Date: 2026-02-05

-- Table pour stocker les captures d'écran "preuve de diffusion"
CREATE TABLE IF NOT EXISTS proof_of_broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  screenshot_url VARCHAR(500) NOT NULL,        -- URL cloud (FTP ou Supabase)
  storage_path VARCHAR(500) NOT NULL,          -- Chemin relatif (screenshots/xxx.jpg)
  checksum VARCHAR(64) NOT NULL,               -- SHA256 pour intégrité
  timestamp_captured TIMESTAMPTZ NOT NULL,     -- Quand capturé sur le Pi
  triggered_by VARCHAR(50) NOT NULL DEFAULT 'manual',  -- 'manual', 'scheduled', 'command'
  metadata JSONB DEFAULT '{}',                 -- { resolution, format, fileSize, ... }
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index pour requêtes fréquentes
  CONSTRAINT valid_triggered_by CHECK (triggered_by IN ('manual', 'scheduled', 'command'))
);

-- Index pour recherche par site et date
CREATE INDEX IF NOT EXISTS idx_proof_of_broadcasts_site_id ON proof_of_broadcasts(site_id);
CREATE INDEX IF NOT EXISTS idx_proof_of_broadcasts_timestamp ON proof_of_broadcasts(timestamp_captured DESC);
CREATE INDEX IF NOT EXISTS idx_proof_of_broadcasts_site_timestamp ON proof_of_broadcasts(site_id, timestamp_captured DESC);

-- Vue pour les stats de preuves par site
CREATE OR REPLACE VIEW proof_stats_by_site AS
SELECT
  s.id as site_id,
  s.site_name,
  s.club_name,
  COUNT(p.id) as total_proofs,
  MAX(p.timestamp_captured) as last_proof_at,
  COUNT(CASE WHEN p.timestamp_captured >= NOW() - INTERVAL '7 days' THEN 1 END) as proofs_last_7_days,
  COUNT(CASE WHEN p.timestamp_captured >= NOW() - INTERVAL '30 days' THEN 1 END) as proofs_last_30_days
FROM sites s
LEFT JOIN proof_of_broadcasts p ON s.id = p.site_id
GROUP BY s.id, s.site_name, s.club_name;

-- Commentaires
COMMENT ON TABLE proof_of_broadcasts IS 'Captures d''écran automatiques pour preuves de diffusion';
COMMENT ON COLUMN proof_of_broadcasts.triggered_by IS 'Source du déclenchement: manual (dashboard), scheduled (cron), command (Socket.IO)';
COMMENT ON COLUMN proof_of_broadcasts.metadata IS 'Métadonnées: resolution, format, fileSize, etc.';
