-- Migration: Ajouter video_id et sponsor_id à la table video_plays
-- Permet de lier les lectures vidéo aux vidéos sources et aux sponsors
-- Date: 2025-01-XX

-- Ajouter la colonne video_id (référence vers la table videos)
ALTER TABLE video_plays
ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE SET NULL;

-- Ajouter la colonne sponsor_id (référence vers la table sponsors)
ALTER TABLE video_plays
ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES sponsors(id) ON DELETE SET NULL;

-- Créer des index pour les jointures fréquentes
CREATE INDEX IF NOT EXISTS idx_video_plays_video_id ON video_plays(video_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_sponsor_id ON video_plays(sponsor_id);

-- Commentaires
COMMENT ON COLUMN video_plays.video_id IS 'UUID de la vidéo source (pour jointure avec la table videos)';
COMMENT ON COLUMN video_plays.sponsor_id IS 'UUID du sponsor associé (si applicable)';

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE 'Migration appliquée: video_id et sponsor_id ajoutés à video_plays';
END $$;
