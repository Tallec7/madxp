-- Migration: Ajout des champs pour estimation d'audience et score en live
-- Date: 15 Décembre 2025
-- Auteur: Claude Code
-- Référence: BACKLOG.md - Estimation audience + Score en live Phase 1

-- ============================================================================
-- 1. ESTIMATION D'AUDIENCE - Ajout champs club_sessions
-- ============================================================================

-- Ajouter les champs pour l'information de match
ALTER TABLE club_sessions
ADD COLUMN IF NOT EXISTS match_date DATE,
ADD COLUMN IF NOT EXISTS match_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS audience_estimate INTEGER;

-- Commentaires
COMMENT ON COLUMN club_sessions.match_date IS 'Date du match (peut différer de started_at pour les préparations)';
COMMENT ON COLUMN club_sessions.match_name IS 'Nom du match (ex: CESSON vs NANTES)';
COMMENT ON COLUMN club_sessions.audience_estimate IS 'Estimation du nombre de spectateurs';

-- ============================================================================
-- 2. SCORE EN LIVE - Ajout champ sites.live_score_enabled
-- ============================================================================

-- Ajouter le champ pour activer/désactiver le score en live (option payante)
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS live_score_enabled BOOLEAN DEFAULT false;

-- Commentaire
COMMENT ON COLUMN sites.live_score_enabled IS 'Active l''affichage du score en live (feature premium)';

-- ============================================================================
-- 3. SCORE EN LIVE - Ajout champs sponsor_impressions pour contexte match
-- ============================================================================

-- Ajouter les champs de score pour contextualiser les impressions sponsors
ALTER TABLE sponsor_impressions
ADD COLUMN IF NOT EXISTS home_score INTEGER,
ADD COLUMN IF NOT EXISTS away_score INTEGER;

-- Commentaires
COMMENT ON COLUMN sponsor_impressions.home_score IS 'Score équipe domicile au moment de l''impression';
COMMENT ON COLUMN sponsor_impressions.away_score IS 'Score équipe extérieure au moment de l''impression';

-- Index pour analyses (optionnel, à créer si nécessaire)
-- CREATE INDEX IF NOT EXISTS idx_sponsor_impressions_score ON sponsor_impressions(home_score, away_score)
-- WHERE home_score IS NOT NULL;

-- ============================================================================
-- Vérifications post-migration
-- ============================================================================

-- Vérifier que les colonnes ont été ajoutées
DO $$
BEGIN
    -- Vérifier club_sessions
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'club_sessions'
        AND column_name IN ('match_date', 'match_name', 'audience_estimate')
    ) THEN
        RAISE NOTICE 'club_sessions: Champs audience ajoutés avec succès';
    END IF;

    -- Vérifier sites
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites'
        AND column_name = 'live_score_enabled'
    ) THEN
        RAISE NOTICE 'sites: Champ live_score_enabled ajouté avec succès';
    END IF;

    -- Vérifier sponsor_impressions
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sponsor_impressions'
        AND column_name IN ('home_score', 'away_score')
    ) THEN
        RAISE NOTICE 'sponsor_impressions: Champs score ajoutés avec succès';
    END IF;
END $$;

-- ============================================================================
-- Rollback (si nécessaire)
-- ============================================================================

-- Pour annuler cette migration :
/*
ALTER TABLE club_sessions
DROP COLUMN IF EXISTS match_date,
DROP COLUMN IF EXISTS match_name,
DROP COLUMN IF EXISTS audience_estimate;

ALTER TABLE sites
DROP COLUMN IF EXISTS live_score_enabled;

ALTER TABLE sponsor_impressions
DROP COLUMN IF EXISTS home_score,
DROP COLUMN IF EXISTS away_score;
*/
