-- =============================================================================
-- Migration: Campaigns + Scheduled Reports (PI-2 Data Model Preparation)
-- =============================================================================
-- Prépare le modèle de données pour:
--   - E-11 Régie Publicitaire (gestion de campagnes)
--   - E-17 A/B Testing (variant_config)
--   - E-16 Rapports Automatiques (scheduled_reports)
--
-- Idempotent: peut être rejoué sans risque.
-- =============================================================================

-- =============================================================================
-- 1. Table campaigns
-- =============================================================================
-- Une campagne lie un annonceur à un ensemble de sites cibles,
-- avec des objectifs d'impressions et des dates de diffusion.

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertiser_id UUID NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_impressions INTEGER,
  target_sites UUID[],
  campaign_type VARCHAR(50) NOT NULL DEFAULT 'standard',
  variant_config JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_campaign_type CHECK (campaign_type IN ('standard', 'regional', 'ab_test')),
  CONSTRAINT check_campaign_status CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  CONSTRAINT check_campaign_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT check_target_impressions_positive CHECK (target_impressions IS NULL OR target_impressions > 0)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser ON campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_campaigns_updated_at ON campaigns;
CREATE TRIGGER trigger_update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();

-- =============================================================================
-- 2. Colonne campaign_id sur video_plays
-- =============================================================================
-- Permet de rattacher chaque lecture vidéo à une campagne spécifique.

ALTER TABLE video_plays ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_video_plays_campaign ON video_plays(campaign_id) WHERE campaign_id IS NOT NULL;

-- =============================================================================
-- 3. Table scheduled_reports
-- =============================================================================
-- Permet de planifier l'envoi automatique de rapports PDF par email.

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertiser_id UUID REFERENCES advertisers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'advertiser',
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  next_send_at TIMESTAMP,
  last_sent_at TIMESTAMP,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT check_report_type CHECK (report_type IN ('advertiser', 'campaign', 'club')),
  CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
  CONSTRAINT check_recipients_not_empty CHECK (array_length(recipients, 1) IS NOT NULL OR enabled = false)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_advertiser ON scheduled_reports(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_send ON scheduled_reports(next_send_at) WHERE enabled = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_scheduled_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_scheduled_reports_updated_at ON scheduled_reports;
CREATE TRIGGER trigger_update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_reports_updated_at();

-- =============================================================================
-- Vérification
-- =============================================================================
DO $$
BEGIN
  -- Vérifier que les tables ont été créées
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaigns') THEN
    RAISE EXCEPTION 'Table campaigns not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scheduled_reports') THEN
    RAISE EXCEPTION 'Table scheduled_reports not created';
  END IF;

  -- Vérifier que campaign_id a été ajouté à video_plays
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'video_plays' AND column_name = 'campaign_id'
  ) THEN
    RAISE EXCEPTION 'Column campaign_id not added to video_plays';
  END IF;

  RAISE NOTICE 'Migration OK: campaigns, scheduled_reports created, campaign_id added to video_plays';
END $$;
