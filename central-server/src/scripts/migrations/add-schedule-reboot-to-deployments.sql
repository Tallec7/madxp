-- Migration: Ajouter les colonnes schedule_reboot et auto_rollback à update_deployments
-- Date: 2026-02-14
-- Description: Permet de demander un reboot du Pi après une mise à jour OTA
--              et de contrôler le rollback automatique en cas d'échec

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'update_deployments' AND column_name = 'schedule_reboot'
  ) THEN
    ALTER TABLE update_deployments ADD COLUMN schedule_reboot BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Colonne schedule_reboot ajoutée à update_deployments';
  ELSE
    RAISE NOTICE 'Colonne schedule_reboot existe déjà dans update_deployments';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'update_deployments' AND column_name = 'auto_rollback'
  ) THEN
    ALTER TABLE update_deployments ADD COLUMN auto_rollback BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Colonne auto_rollback ajoutée à update_deployments';
  ELSE
    RAISE NOTICE 'Colonne auto_rollback existe déjà dans update_deployments';
  END IF;
END $$;
