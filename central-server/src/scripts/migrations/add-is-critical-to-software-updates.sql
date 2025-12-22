-- Migration: Ajouter la colonne is_critical à software_updates
-- Date: 2024-12-22
-- Description: Ajoute le champ is_critical manquant dans la table software_updates

-- Ajouter la colonne is_critical si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'software_updates' AND column_name = 'is_critical'
  ) THEN
    ALTER TABLE software_updates ADD COLUMN is_critical BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Colonne is_critical ajoutée à software_updates';
  ELSE
    RAISE NOTICE 'Colonne is_critical existe déjà dans software_updates';
  END IF;
END $$;
