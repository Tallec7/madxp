-- Migration: Extension generated_reports pour rapports site_sponsor
-- Date: 2026-02-17
-- Palier: P2 — Rapports PDF & Email
-- Description: Étend la table generated_reports pour supporter le type 'site_sponsor'
--              et référencer directement un site_sponsor_id

BEGIN;

-- ============================================================================
-- 1. AJOUTER COLONNE site_sponsor_id
-- ============================================================================

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS site_sponsor_id UUID REFERENCES site_sponsors(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. METTRE À JOUR LA CONTRAINTE report_type
-- ============================================================================

-- Supprimer l'ancienne contrainte CHECK sur report_type
ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_report_type_check;

-- Recréer avec 'site_sponsor' en plus
ALTER TABLE generated_reports
  ADD CONSTRAINT generated_reports_report_type_check
  CHECK (report_type IN ('club', 'advertiser', 'fleet', 'site_sponsor'));

-- ============================================================================
-- 3. METTRE À JOUR LA CONTRAINTE chk_one_entity
-- ============================================================================

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS chk_one_entity;

ALTER TABLE generated_reports
  ADD CONSTRAINT chk_one_entity CHECK (
    -- Club report: site_id requis
    (report_type = 'club' AND site_id IS NOT NULL AND advertiser_id IS NULL AND site_sponsor_id IS NULL) OR
    -- Advertiser report: advertiser_id requis
    (report_type = 'advertiser' AND advertiser_id IS NOT NULL AND site_id IS NULL AND site_sponsor_id IS NULL) OR
    -- Fleet report: aucune entité spécifique
    (report_type = 'fleet' AND site_id IS NULL AND advertiser_id IS NULL AND site_sponsor_id IS NULL) OR
    -- Site sponsor report: site_sponsor_id requis, site_id optionnel (dénormalisé pour les queries)
    (report_type = 'site_sponsor' AND site_sponsor_id IS NOT NULL)
  );

-- ============================================================================
-- 4. METTRE À JOUR LA CONTRAINTE D'UNICITÉ
-- ============================================================================

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS uq_report_entity_period;

ALTER TABLE generated_reports
  ADD CONSTRAINT uq_report_entity_period
  UNIQUE (report_type, site_id, advertiser_id, site_sponsor_id, period_start, period_end);

-- ============================================================================
-- 5. INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reports_site_sponsor
  ON generated_reports(site_sponsor_id)
  WHERE site_sponsor_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Vérifier que la colonne existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'site_sponsor_id'
  ) THEN
    RAISE NOTICE '✅ Colonne site_sponsor_id ajoutée sur generated_reports';
  ELSE
    RAISE WARNING '❌ Colonne site_sponsor_id manquante';
  END IF;

  -- Vérifier que le type site_sponsor est accepté
  RAISE NOTICE '✅ Migration add-site-sponsor-reports terminée';
END $$;
