-- Migration: Monthly Report Generation System
-- Date: 2026-02-05
-- Description: Tables pour stocker les rapports PDF mensuels générés automatiquement

-- Table des rapports générés
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type de rapport
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('club', 'advertiser', 'fleet')),

  -- Entité concernée
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,

  -- Période couverte
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label VARCHAR(50) NOT NULL, -- ex: "Janvier 2026", "2026-01"

  -- Stockage du fichier
  storage_path VARCHAR(500) NOT NULL,  -- Chemin sur FTP ou Supabase
  storage_url VARCHAR(1000),           -- URL publique pour téléchargement
  file_size_bytes INTEGER,
  checksum VARCHAR(64),                -- SHA256

  -- Métriques du rapport
  summary_data JSONB DEFAULT '{}',     -- KPIs principaux pour affichage rapide

  -- Statut de génération
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,

  -- Métadonnées
  generated_by VARCHAR(50) DEFAULT 'cron', -- 'cron' ou user_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Contrainte: une seule entité à la fois
  CONSTRAINT chk_one_entity CHECK (
    (site_id IS NOT NULL AND advertiser_id IS NULL) OR
    (site_id IS NULL AND advertiser_id IS NOT NULL) OR
    (site_id IS NULL AND advertiser_id IS NULL AND report_type = 'fleet')
  ),

  -- Contrainte: unicité par entité et période
  CONSTRAINT uq_report_entity_period UNIQUE (report_type, site_id, advertiser_id, period_start, period_end)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_reports_site_id ON generated_reports(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX idx_reports_advertiser_id ON generated_reports(advertiser_id) WHERE advertiser_id IS NOT NULL;
CREATE INDEX idx_reports_period ON generated_reports(period_start DESC, period_end DESC);
CREATE INDEX idx_reports_status ON generated_reports(status) WHERE status != 'completed';
CREATE INDEX idx_reports_created ON generated_reports(created_at DESC);

-- Vue pour les rapports clubs avec infos du site
CREATE OR REPLACE VIEW club_reports_view AS
SELECT
  r.*,
  s.site_name,
  s.club_name
FROM generated_reports r
JOIN sites s ON r.site_id = s.id
WHERE r.report_type = 'club';

-- Vue pour les rapports annonceurs avec infos
CREATE OR REPLACE VIEW advertiser_reports_view AS
SELECT
  r.*,
  a.name as advertiser_name
FROM generated_reports r
JOIN advertisers a ON r.advertiser_id = a.id
WHERE r.report_type = 'advertiser';

-- Table de configuration des rapports automatiques
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Configuration
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('club', 'advertiser', 'fleet')),
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'quarterly')),

  -- Entité (null = tous les sites/annonceurs)
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,

  -- Options
  enabled BOOLEAN DEFAULT true,
  include_certificate BOOLEAN DEFAULT true,
  send_email BOOLEAN DEFAULT false,
  email_recipients TEXT[], -- Liste d'emails

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,

  -- Contrainte: une seule entité ou tous
  CONSTRAINT chk_schedule_entity CHECK (
    (site_id IS NOT NULL AND advertiser_id IS NULL) OR
    (site_id IS NULL AND advertiser_id IS NOT NULL) OR
    (site_id IS NULL AND advertiser_id IS NULL)
  )
);

-- Créer le schedule par défaut: rapports mensuels pour tous les clubs
INSERT INTO report_schedules (report_type, frequency, enabled, include_certificate)
VALUES
  ('club', 'monthly', true, true),
  ('advertiser', 'monthly', true, true)
ON CONFLICT DO NOTHING;

-- Commentaires
COMMENT ON TABLE generated_reports IS 'Rapports PDF générés automatiquement ou manuellement';
COMMENT ON TABLE report_schedules IS 'Configuration des rapports automatiques';
COMMENT ON COLUMN generated_reports.summary_data IS 'KPIs extraits pour affichage liste sans ouvrir le PDF';
