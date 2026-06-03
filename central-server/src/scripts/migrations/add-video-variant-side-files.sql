-- =============================================================================
-- Migration: contenu LED « par côté » sur la variante (ADR-135, révision)
-- =============================================================================
-- Une variante led-perimeter peut être soit UNIFORME (1 fichier, `storage_path`),
-- soit PAR CÔTÉ (un fichier uploadé par côté, dans `side_files`). Mode dérivé :
-- `side_files` non vide → par côté ; sinon → uniforme.
--
-- `side_files` : JSONB = tableau d'éléments
--   { side_index, filename, original_name, storage_path, file_size, checksum,
--     mime_type, width, height }
-- un par côté renseigné, classés par `side_index`.
--
-- `storage_path` / `filename` deviennent NULLABLE : une variante PAR CÔTÉ PURE
-- (sans fichier uniforme) a `storage_path = NULL`. Rétro-compatible : toutes les
-- rows existantes ont déjà ces colonnes renseignées.
--
-- Aucune modification de la contrainte d'unicité (video_id, display_type) — on
-- reste à UNE row par (vidéo × écran), `side_files` porte le détail par côté.
-- =============================================================================

ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS side_files JSONB;

ALTER TABLE video_variants
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE video_variants
  ALTER COLUMN filename DROP NOT NULL;

COMMENT ON COLUMN video_variants.side_files IS
  'LED périmétrique « par côté » (ADR-135) : tableau JSONB [{side_index, storage_path, ...}], un fichier par côté. Vide/NULL = variante uniforme (storage_path).';

DO $$
BEGIN
  RAISE NOTICE 'Migration add-video-variant-side-files applied successfully.';
END $$;
