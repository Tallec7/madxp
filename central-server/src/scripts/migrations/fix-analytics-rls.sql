-- =============================================================================
-- NEOPRO Central - Fix Analytics RLS for Unauthenticated Raspberry Pi Requests
-- =============================================================================
-- Ce fichier corrige le problème d'insertion d'analytics depuis les Raspberry Pi
-- qui ne sont pas authentifiés.
--
-- PROBLÈME:
-- Les Raspberry Pi envoient des analytics via POST /api/analytics/video-plays
-- sans authentification. La policy RLS existante bloque ces insertions car
-- current_site_id() retourne NULL pour les requêtes non-authentifiées.
--
-- SOLUTION:
-- Créer une policy permettant l'insertion d'analytics sans authentification
-- en vérifiant que le site_id existe dans la table sites.
--
-- Date: 2025-12-16
-- =============================================================================

-- Supprimer l'ancienne policy restrictive
DROP POLICY IF EXISTS site_insert_own_video_plays ON video_plays;

-- Créer une nouvelle policy permettant l'insertion d'analytics
-- pour les requêtes authentifiées (site_id = current_site_id())
-- ET pour les requêtes non-authentifiées (current_site_id() IS NULL)
-- Dans le cas non-authentifié, on vérifie juste que le site existe
CREATE POLICY site_insert_video_plays ON video_plays
  FOR INSERT
  WITH CHECK (
    -- Cas 1: Requête authentifiée (middleware RLS actif)
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    -- Cas 2: Requête non-authentifiée (Raspberry Pi sync-agent)
    -- On vérifie juste que le site_id existe dans la table sites
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );

COMMENT ON POLICY site_insert_video_plays ON video_plays IS
  'Permet l''insertion d''analytics pour les sites authentifiés et les Raspberry Pi non-authentifiés';

-- De même pour club_sessions
DROP POLICY IF EXISTS site_insert_own_club_sessions ON club_sessions;

CREATE POLICY site_insert_club_sessions ON club_sessions
  FOR INSERT
  WITH CHECK (
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );

COMMENT ON POLICY site_insert_club_sessions ON club_sessions IS
  'Permet l''insertion de sessions pour les sites authentifiés et les Raspberry Pi non-authentifiés';

-- De même pour sponsor_impressions
DROP POLICY IF EXISTS site_insert_own_sponsor_impressions ON sponsor_impressions;

CREATE POLICY site_insert_sponsor_impressions ON sponsor_impressions
  FOR INSERT
  WITH CHECK (
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );

COMMENT ON POLICY site_insert_sponsor_impressions ON sponsor_impressions IS
  'Permet l''insertion d''impressions sponsors pour les sites authentifiés et les Raspberry Pi non-authentifiés';

-- Pour les updates de club_sessions (end session)
DROP POLICY IF EXISTS site_update_own_club_sessions ON club_sessions;

CREATE POLICY site_update_club_sessions ON club_sessions
  FOR UPDATE
  USING (
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  )
  WITH CHECK (
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );

COMMENT ON POLICY site_update_club_sessions ON club_sessions IS
  'Permet la mise à jour de sessions pour les sites authentifiés et les Raspberry Pi non-authentifiés';

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Policies RLS corrigées pour analytics non-authentifiées:';
  RAISE NOTICE '   - video_plays: insertion autorisée pour Raspberry Pi';
  RAISE NOTICE '   - club_sessions: insertion/update autorisées pour Raspberry Pi';
  RAISE NOTICE '   - sponsor_impressions: insertion autorisée pour Raspberry Pi';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Sécurité maintenue:';
  RAISE NOTICE '   - Les requêtes authentifiées sont toujours limitées à leur site';
  RAISE NOTICE '   - Les requêtes non-auth vérifient que le site existe';
  RAISE NOTICE '';
END $$;

-- =============================================================================
-- FIN
-- =============================================================================
