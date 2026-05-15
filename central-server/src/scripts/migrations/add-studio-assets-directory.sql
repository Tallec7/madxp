-- Migration: Templates Studio — extension `studio_assets` pour assets type
--             'directory' (séquences PNG frames pour masques alpha).
-- Date: 2026-05-15
-- ADR: ADR-128
-- Description:
--   Le portage des designs originaux V2 (`but_generique`, `entree_joueur`)
--   nécessite des séquences PNG frames comme masques alpha (175 PNG par
--   template, 1 par frame de la vidéo 25fps×7s). Plutôt que de convertir en
--   WebM alpha (perte qualité + ffmpeg lourd) ou de gérer des wildcards FTP
--   (pas atomique), on étend `studio_assets` avec un type `directory` :
--
--     - `asset_kind = 'directory'` : `ftp_path` pointe vers un préfixe de
--       dossier sur FTP (avec trailing slash). `frame_count` + `frame_pattern`
--       décrivent comment interpoler chaque frame URL côté composition
--       (ex: `frame_pattern = "frame_{i:03d}.png"`).
--     - `asset_kind = 'file'` (défaut) : comportement legacy (1 fichier).
--
--   Upload : ZIP multipart côté API → décompressé côté serveur → push frame
--   par frame sur FTP → INSERT 1 row `studio_assets` avec `asset_kind`.
--
--   Worker render : retourne `__assets[key]` = string (file) OU object
--   `{ kind: 'directory', baseUrl, framePattern, frameCount }` (directory).
--   Les compositions Remotion qui consomment un slot directory savent
--   interpoler la frame courante via `useCurrentFrame()`.

ALTER TABLE studio_assets
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'file'
    CHECK (asset_kind IN ('file', 'directory'));

ALTER TABLE studio_assets
  ADD COLUMN IF NOT EXISTS frame_count INT;

ALTER TABLE studio_assets
  ADD COLUMN IF NOT EXISTS frame_pattern TEXT;

COMMENT ON COLUMN studio_assets.asset_kind IS
  'file = 1 fichier (image/video/font). directory = séquence de N frames PNG (masques alpha, ADR-128).';
COMMENT ON COLUMN studio_assets.frame_count IS
  'Nombre de frames pour asset_kind=directory. NULL pour asset_kind=file.';
COMMENT ON COLUMN studio_assets.frame_pattern IS
  'Pattern d''interpolation pour asset_kind=directory, ex: "frame_{i:03d}.png" → frame_001.png, frame_002.png... Indices 1-based.';

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: studio_assets — asset_kind/frame_count/frame_pattern (ADR-128 directory assets)';
END $$;
