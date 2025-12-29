-- =============================================================================
-- Migration: Renommage Sponsor → Advertiser (Annonceur)
-- =============================================================================
-- Date: 2025-12-29
-- Description: Renomme toutes les références "sponsor" en "advertiser" pour
--              une meilleure cohérence sémantique du projet.
-- =============================================================================

-- =============================================================================
-- IMPORTANT: Cette migration doit être exécutée en une seule transaction
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SUPPRESSION DES VUES DÉPENDANTES (pour éviter les erreurs de FK)
-- =============================================================================

DROP VIEW IF EXISTS sponsor_analytics_summary CASCADE;
DROP VIEW IF EXISTS top_sponsor_videos CASCADE;
DROP VIEW IF EXISTS sponsor_performance_by_site CASCADE;
DROP VIEW IF EXISTS sponsor_accessible_sites CASCADE;
DROP VIEW IF EXISTS sponsor_stats_summary CASCADE;

-- =============================================================================
-- 2. SUPPRESSION DES FONCTIONS DÉPENDANTES
-- =============================================================================

DROP FUNCTION IF EXISTS calculate_sponsor_daily_stats(UUID, UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS calculate_all_sponsor_daily_stats(DATE) CASCADE;
DROP FUNCTION IF EXISTS is_sponsor_contract_active(UUID, UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_sponsor_active_sites(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_site_active_sponsors(UUID, DATE) CASCADE;

-- =============================================================================
-- 3. RENOMMAGE DES TABLES PRINCIPALES
-- =============================================================================

-- sponsors → advertisers
ALTER TABLE IF EXISTS sponsors RENAME TO advertisers;

-- sponsor_videos → advertiser_videos
ALTER TABLE IF EXISTS sponsor_videos RENAME TO advertiser_videos;
ALTER TABLE IF EXISTS advertiser_videos RENAME COLUMN sponsor_id TO advertiser_id;

-- sponsor_impressions → advertiser_impressions
ALTER TABLE IF EXISTS sponsor_impressions RENAME TO advertiser_impressions;

-- sponsor_daily_stats → advertiser_daily_stats
ALTER TABLE IF EXISTS sponsor_daily_stats RENAME TO advertiser_daily_stats;

-- sponsor_sites → advertiser_sites
ALTER TABLE IF EXISTS sponsor_sites RENAME TO advertiser_sites;
ALTER TABLE IF EXISTS advertiser_sites RENAME COLUMN sponsor_id TO advertiser_id;

-- =============================================================================
-- 4. RENOMMAGE DES COLONNES DANS LA TABLE USERS
-- =============================================================================

ALTER TABLE users RENAME COLUMN sponsor_id TO advertiser_id;

-- =============================================================================
-- 5. MISE À JOUR DES RÔLES UTILISATEURS ET CONTRAINTE
-- =============================================================================

-- IMPORTANT: Ordre correct pour éviter les violations de contrainte:
-- 1. Supprimer l'ancienne contrainte (qui n'accepte pas 'advertiser')
-- 2. Migrer les utilisateurs
-- 3. Recréer la contrainte avec les nouveaux rôles

-- Étape 1: Supprimer la contrainte existante
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role;

-- Étape 2: Migrer les utilisateurs existants avec le rôle 'sponsor' vers 'advertiser'
UPDATE users SET role = 'advertiser' WHERE role = 'sponsor';

-- Étape 3: Recréer la contrainte avec les nouveaux rôles
-- Note: 'advertiser' remplace 'sponsor', mais on garde 'sponsor' temporairement pour rétrocompatibilité
ALTER TABLE users ADD CONSTRAINT check_role
  CHECK (role IN ('super_admin', 'superadmin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency'));

-- =============================================================================
-- 6. RENOMMAGE DES CONTRAINTES
-- =============================================================================

-- Constraint sur advertisers (ex sponsors)
ALTER TABLE advertisers DROP CONSTRAINT IF EXISTS check_sponsor_status;
ALTER TABLE advertisers ADD CONSTRAINT check_advertiser_status
  CHECK (status IN ('active', 'inactive', 'paused'));

-- =============================================================================
-- 7. RENOMMAGE DES INDEX
-- =============================================================================

-- Index sur advertiser_videos
ALTER INDEX IF EXISTS sponsor_videos_pkey RENAME TO advertiser_videos_pkey;

-- Index sur advertiser_sites
ALTER INDEX IF EXISTS sponsor_sites_pkey RENAME TO advertiser_sites_pkey;
ALTER INDEX IF EXISTS idx_sponsor_sites_sponsor RENAME TO idx_advertiser_sites_advertiser;
ALTER INDEX IF EXISTS idx_sponsor_sites_site RENAME TO idx_advertiser_sites_site;
ALTER INDEX IF EXISTS idx_sponsor_sites_contract_active RENAME TO idx_advertiser_sites_contract_active;
ALTER INDEX IF EXISTS idx_sponsor_sites_contract_dates RENAME TO idx_advertiser_sites_contract_dates;

-- Index sur users
ALTER INDEX IF EXISTS idx_users_sponsor RENAME TO idx_users_advertiser;
ALTER INDEX IF EXISTS idx_users_sponsor_id RENAME TO idx_users_advertiser_id;

-- Index sur advertiser_impressions (ex sponsor_impressions)
ALTER INDEX IF EXISTS idx_impressions_video_date RENAME TO idx_advertiser_impressions_video_date;
ALTER INDEX IF EXISTS idx_impressions_site_date RENAME TO idx_advertiser_impressions_site_date;
ALTER INDEX IF EXISTS idx_impressions_played_at RENAME TO idx_advertiser_impressions_played_at;
ALTER INDEX IF EXISTS idx_impressions_video_site RENAME TO idx_advertiser_impressions_video_site;

-- Index sur advertiser_daily_stats (ex sponsor_daily_stats)
ALTER INDEX IF EXISTS idx_daily_stats_date RENAME TO idx_advertiser_daily_stats_date;
ALTER INDEX IF EXISTS idx_daily_stats_video_date RENAME TO idx_advertiser_daily_stats_video_date;
ALTER INDEX IF EXISTS idx_daily_stats_site_date RENAME TO idx_advertiser_daily_stats_site_date;

-- =============================================================================
-- 8. RENOMMAGE DES TRIGGERS
-- =============================================================================

-- Trigger sur advertisers
DROP TRIGGER IF EXISTS update_sponsors_updated_at ON advertisers;
CREATE TRIGGER update_advertisers_updated_at
  BEFORE UPDATE ON advertisers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9. RECRÉATION DES VUES AVEC NOUVEAU NOMMAGE
-- =============================================================================

-- Vue des sites accessibles par annonceur avec statut du contrat
CREATE OR REPLACE VIEW advertiser_accessible_sites AS
SELECT
  ads.advertiser_id,
  s.id as site_id,
  s.site_name,
  s.club_name,
  s.location,
  s.status,
  s.last_seen_at,
  ads.contract_start,
  ads.contract_end,
  ads.is_active,
  CASE
    WHEN NOT ads.is_active THEN 'inactive'
    WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
    WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
    ELSE 'active'
  END as contract_status,
  CASE
    WHEN ads.contract_end IS NOT NULL AND ads.contract_end >= CURRENT_DATE
    THEN ads.contract_end - CURRENT_DATE
    ELSE NULL
  END as days_remaining
FROM advertiser_sites ads
JOIN sites s ON s.id = ads.site_id;

-- Vue statistiques résumées par annonceur
CREATE OR REPLACE VIEW advertiser_stats_summary AS
SELECT
  a.id as advertiser_id,
  a.name as advertiser_name,
  COUNT(DISTINCT ads.site_id) as total_sites,
  COUNT(DISTINCT av.video_id) as total_videos,
  COALESCE(SUM(adst.total_impressions), 0) as total_impressions_30d,
  COALESCE(SUM(adst.total_duration_seconds), 0) as total_screen_time_30d,
  ROUND(AVG(adst.completion_rate)::numeric, 2) as avg_completion_rate_30d
FROM advertisers a
LEFT JOIN advertiser_sites ads ON ads.advertiser_id = a.id AND ads.is_active = true
LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
LEFT JOIN advertiser_daily_stats adst ON adst.video_id = av.video_id
  AND adst.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.id, a.name;

-- Vue récapitulative analytics par annonceur
CREATE OR REPLACE VIEW advertiser_analytics_summary AS
SELECT
  a.id as advertiser_id,
  a.name as advertiser_name,
  v.id as video_id,
  v.filename as video_name,
  COUNT(ai.*) as total_impressions,
  SUM(ai.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN ai.completed THEN 100
        ELSE (ai.duration_played::float / NULLIF(ai.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  SUM(CASE WHEN ai.completed THEN 1 ELSE 0 END) as completed_views,
  COUNT(DISTINCT ai.site_id) as unique_sites,
  COUNT(DISTINCT DATE(ai.played_at)) as active_days,
  SUM(ai.audience_estimate) as estimated_total_reach,
  MIN(ai.played_at) as first_impression,
  MAX(ai.played_at) as last_impression
FROM advertisers a
JOIN advertiser_videos av ON av.advertiser_id = a.id
JOIN videos v ON v.id = av.video_id
LEFT JOIN advertiser_impressions ai ON ai.video_id = v.id
GROUP BY a.id, a.name, v.id, v.filename;

-- Vue top vidéos annonceurs
CREATE OR REPLACE VIEW top_advertiser_videos AS
SELECT
  v.id as video_id,
  v.filename as video_name,
  a.id as advertiser_id,
  a.name as advertiser_name,
  COUNT(ai.*) as total_impressions,
  SUM(ai.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN ai.completed THEN 100
        ELSE (ai.duration_played::float / NULLIF(ai.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  COUNT(DISTINCT ai.site_id) as unique_sites
FROM videos v
JOIN advertiser_videos av ON av.video_id = v.id
JOIN advertisers a ON a.id = av.advertiser_id
LEFT JOIN advertiser_impressions ai ON ai.video_id = v.id
WHERE ai.played_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY v.id, v.filename, a.id, a.name
ORDER BY total_impressions DESC
LIMIT 50;

-- Vue performance par site pour un annonceur
CREATE OR REPLACE VIEW advertiser_performance_by_site AS
SELECT
  a.id as advertiser_id,
  a.name as advertiser_name,
  st.id as site_id,
  st.site_name,
  st.club_name,
  COUNT(ai.*) as total_impressions,
  SUM(ai.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN ai.completed THEN 100
        ELSE (ai.duration_played::float / NULLIF(ai.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  COUNT(DISTINCT DATE(ai.played_at)) as active_days
FROM advertisers a
JOIN advertiser_videos av ON av.advertiser_id = a.id
JOIN advertiser_impressions ai ON ai.video_id = av.video_id
JOIN sites st ON st.id = ai.site_id
GROUP BY a.id, a.name, st.id, st.site_name, st.club_name;

-- =============================================================================
-- 10. RECRÉATION DES FONCTIONS AVEC NOUVEAU NOMMAGE
-- =============================================================================

-- Fonction de vérification de contrat actif
CREATE OR REPLACE FUNCTION is_advertiser_contract_active(
  p_advertiser_id UUID,
  p_site_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM advertiser_sites
    WHERE advertiser_id = p_advertiser_id
      AND site_id = p_site_id
      AND is_active = true
      AND (contract_start IS NULL OR contract_start <= p_check_date)
      AND (contract_end IS NULL OR contract_end >= p_check_date)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour obtenir les sites avec contrat actif
CREATE OR REPLACE FUNCTION get_advertiser_active_sites(
  p_advertiser_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(site_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT ads.site_id
  FROM advertiser_sites ads
  WHERE ads.advertiser_id = p_advertiser_id
    AND ads.is_active = true
    AND (ads.contract_start IS NULL OR ads.contract_start <= p_check_date)
    AND (ads.contract_end IS NULL OR ads.contract_end >= p_check_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour obtenir les annonceurs actifs d'un site
CREATE OR REPLACE FUNCTION get_site_active_advertisers(
  p_site_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(advertiser_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT ads.advertiser_id
  FROM advertiser_sites ads
  WHERE ads.site_id = p_site_id
    AND ads.is_active = true
    AND (ads.contract_start IS NULL OR ads.contract_start <= p_check_date)
    AND (ads.contract_end IS NULL OR ads.contract_end >= p_check_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour calculer les stats quotidiennes d'une vidéo pour un site
CREATE OR REPLACE FUNCTION calculate_advertiser_daily_stats(
  p_video_id UUID,
  p_site_id UUID,
  p_date DATE
) RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  SELECT
    COUNT(*) as total_impressions,
    SUM(duration_played) as total_duration,
    SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed,
    ROUND(
      (SUM(CASE WHEN completed THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100)::numeric,
      2
    ) as completion_pct,
    COUNT(DISTINCT event_type) as unique_events,
    SUM(CASE WHEN period = 'pre_match' THEN 1 ELSE 0 END) as pre_match,
    SUM(CASE WHEN period = 'halftime' THEN 1 ELSE 0 END) as match,
    SUM(CASE WHEN period = 'post_match' THEN 1 ELSE 0 END) as post_match,
    SUM(CASE WHEN period = 'loop' OR period IS NULL THEN 1 ELSE 0 END) as loop,
    SUM(CASE WHEN event_type = 'match' THEN 1 ELSE 0 END) as match_events,
    SUM(CASE WHEN event_type = 'training' THEN 1 ELSE 0 END) as training_events,
    SUM(CASE WHEN event_type = 'tournament' THEN 1 ELSE 0 END) as tournament_events,
    SUM(CASE WHEN event_type = 'other' OR event_type IS NULL THEN 1 ELSE 0 END) as other_events,
    SUM(CASE WHEN trigger_type = 'auto' THEN 1 ELSE 0 END) as auto,
    SUM(CASE WHEN trigger_type = 'manual' THEN 1 ELSE 0 END) as manual,
    SUM(audience_estimate) as total_audience,
    ROUND(AVG(audience_estimate)::numeric, 2) as avg_audience
  INTO v_stats
  FROM advertiser_impressions
  WHERE video_id = p_video_id
    AND site_id = p_site_id
    AND DATE(played_at) = p_date;

  INSERT INTO advertiser_daily_stats (
    video_id, site_id, date,
    total_impressions, total_duration_seconds, completed_plays, completion_rate, unique_events,
    pre_match_plays, match_plays, post_match_plays, loop_plays,
    match_events, training_events, tournament_events, other_events,
    auto_plays, manual_plays,
    total_audience_estimate, avg_audience_per_play
  ) VALUES (
    p_video_id, p_site_id, p_date,
    v_stats.total_impressions, v_stats.total_duration, v_stats.completed, v_stats.completion_pct, v_stats.unique_events,
    v_stats.pre_match, v_stats.match, v_stats.post_match, v_stats.loop,
    v_stats.match_events, v_stats.training_events, v_stats.tournament_events, v_stats.other_events,
    v_stats.auto, v_stats.manual,
    v_stats.total_audience, v_stats.avg_audience
  )
  ON CONFLICT (video_id, site_id, date) DO UPDATE SET
    total_impressions = EXCLUDED.total_impressions,
    total_duration_seconds = EXCLUDED.total_duration_seconds,
    completed_plays = EXCLUDED.completed_plays,
    completion_rate = EXCLUDED.completion_rate,
    unique_events = EXCLUDED.unique_events,
    pre_match_plays = EXCLUDED.pre_match_plays,
    match_plays = EXCLUDED.match_plays,
    post_match_plays = EXCLUDED.post_match_plays,
    loop_plays = EXCLUDED.loop_plays,
    match_events = EXCLUDED.match_events,
    training_events = EXCLUDED.training_events,
    tournament_events = EXCLUDED.tournament_events,
    other_events = EXCLUDED.other_events,
    auto_plays = EXCLUDED.auto_plays,
    manual_plays = EXCLUDED.manual_plays,
    total_audience_estimate = EXCLUDED.total_audience_estimate,
    avg_audience_per_play = EXCLUDED.avg_audience_per_play,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer toutes les stats quotidiennes
CREATE OR REPLACE FUNCTION calculate_all_advertiser_daily_stats(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT DISTINCT video_id, site_id
    FROM advertiser_impressions
    WHERE DATE(played_at) = p_date
  LOOP
    PERFORM calculate_advertiser_daily_stats(v_record.video_id, v_record.site_id, p_date);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 11. MISE À JOUR DES COMMENTAIRES
-- =============================================================================

COMMENT ON TABLE advertisers IS 'Annonceurs partenaires';
COMMENT ON TABLE advertiser_videos IS 'Association entre annonceurs et leurs vidéos';
COMMENT ON TABLE advertiser_impressions IS 'Tracking granulaire de chaque diffusion vidéo annonceur';
COMMENT ON TABLE advertiser_daily_stats IS 'Statistiques quotidiennes agrégées par vidéo et site';
COMMENT ON TABLE advertiser_sites IS 'Association annonceurs <-> sites de diffusion';

COMMENT ON COLUMN users.advertiser_id IS 'Lien vers l''annonceur si role=advertiser';

COMMENT ON VIEW advertiser_accessible_sites IS 'Sites accessibles pour un annonceur avec statut du contrat';
COMMENT ON VIEW advertiser_stats_summary IS 'Statistiques résumées par annonceur';
COMMENT ON VIEW advertiser_analytics_summary IS 'Vue récapitulative des analytics par annonceur et vidéo';
COMMENT ON VIEW top_advertiser_videos IS 'Top 50 vidéos annonceurs des 30 derniers jours';
COMMENT ON VIEW advertiser_performance_by_site IS 'Performance des annonceurs par site/club';

COMMENT ON FUNCTION is_advertiser_contract_active IS 'Vérifie si un contrat annonceur-site est actif à une date donnée';
COMMENT ON FUNCTION get_advertiser_active_sites IS 'Retourne les sites ayant un contrat actif avec un annonceur';
COMMENT ON FUNCTION get_site_active_advertisers IS 'Retourne les annonceurs ayant un contrat actif avec un site';

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration sponsor → advertiser terminée!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables renommées:';
  RAISE NOTICE '  sponsors → advertisers';
  RAISE NOTICE '  sponsor_videos → advertiser_videos';
  RAISE NOTICE '  sponsor_impressions → advertiser_impressions';
  RAISE NOTICE '  sponsor_daily_stats → advertiser_daily_stats';
  RAISE NOTICE '  sponsor_sites → advertiser_sites';
  RAISE NOTICE '';
  RAISE NOTICE 'Colonnes renommées:';
  RAISE NOTICE '  users.sponsor_id → users.advertiser_id';
  RAISE NOTICE '  *.sponsor_id → *.advertiser_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Rôle utilisateur:';
  RAISE NOTICE '  sponsor → advertiser';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Mettre à jour le code backend et frontend!';
END $$;
