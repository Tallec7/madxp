-- =============================================================================
-- Migration: Fix advertiser_impressions idempotence + RLS + data-retention
-- =============================================================================
-- Date: 2026-02-17
-- Description:
--   1. Ajouter colonne event_id (UUID) pour idempotence des impressions
--   2. Fixer la politique RLS qui référence l'ancien nom sponsor_impressions
--   3. Fixer le schedule de data-retention qui référence l'ancien nom
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AJOUTER event_id POUR IDEMPOTENCE
-- =============================================================================

-- Ajouter la colonne event_id si elle n'existe pas
ALTER TABLE advertiser_impressions
  ADD COLUMN IF NOT EXISTS event_id UUID;

-- Index unique pour l'idempotence (ON CONFLICT event_id DO NOTHING)
-- Partial index: seuls les event_id non-NULL sont vérifiés
CREATE UNIQUE INDEX IF NOT EXISTS idx_advertiser_impressions_event_id
  ON advertiser_impressions (event_id)
  WHERE event_id IS NOT NULL;

-- =============================================================================
-- 2. FIX RLS POLICY (ancien nom sponsor_impressions → advertiser_impressions)
-- =============================================================================

-- La migration fix-analytics-rls.sql a créé une policy sur sponsor_impressions
-- qui n'existe plus après le renommage. On recrée la policy sur advertiser_impressions.

-- Supprimer l'ancienne policy si elle existe
DROP POLICY IF EXISTS site_insert_sponsor_impressions ON advertiser_impressions;
DROP POLICY IF EXISTS site_insert_advertiser_impressions ON advertiser_impressions;

-- Activer RLS si pas encore fait
ALTER TABLE advertiser_impressions ENABLE ROW LEVEL SECURITY;

-- Recréer la policy correctement
CREATE POLICY site_insert_advertiser_impressions ON advertiser_impressions
  FOR INSERT
  WITH CHECK (
    -- Cas 1: Requête authentifiée (middleware RLS actif)
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    -- Cas 2: Requête non-authentifiée (Raspberry Pi sync-agent)
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );

COMMENT ON POLICY site_insert_advertiser_impressions ON advertiser_impressions IS
  'Permet l''insertion d''impressions annonceurs pour les sites authentifiés et les Raspberry Pi';

-- Policy SELECT pour les admins et le site propriétaire
DROP POLICY IF EXISTS site_select_own_advertiser_impressions ON advertiser_impressions;
CREATE POLICY site_select_own_advertiser_impressions ON advertiser_impressions
  FOR SELECT
  USING (
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    (current_site_id() IS NULL) -- Admin access
  );

-- =============================================================================
-- 3. FIX DATA RETENTION SCHEDULE (ancien nom sponsor_impressions)
-- =============================================================================

-- Mettre à jour le schedule qui référence l'ancien nom de table
UPDATE recurring_schedules
SET
  task_config = '{"older_than_days": 90, "tables": ["advertiser_impressions"]}'::jsonb,
  description = 'Suppression des impressions annonceurs de plus de 90 jours (les daily_stats conservent l''historique)',
  name = 'Cleanup advertiser_impressions'
WHERE name = 'Cleanup sponsor_impressions';

-- =============================================================================
-- FIN
-- =============================================================================

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration advertiser_impressions fixes terminée!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Ajout colonne event_id (UUID) pour idempotence';
  RAISE NOTICE '✅ Index unique partiel sur event_id (WHERE NOT NULL)';
  RAISE NOTICE '✅ Fix RLS policy (sponsor_impressions → advertiser_impressions)';
  RAISE NOTICE '✅ Fix data-retention schedule (ancien nom de table)';
END $$;
