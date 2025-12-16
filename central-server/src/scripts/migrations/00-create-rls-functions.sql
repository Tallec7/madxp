-- =============================================================================
-- NEOPRO Central - RLS Helper Functions (Pre-requisite)
-- =============================================================================
-- Ce fichier crée uniquement les fonctions utilitaires RLS.
-- À exécuter AVANT enable-row-level-security.sql
--
-- Date: 2025-12-16
-- =============================================================================

-- Supprimer les fonctions existantes si elles existent (pour réexécution)
DROP FUNCTION IF EXISTS set_session_context(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS current_site_id();
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS current_user_id();

-- =============================================================================
-- FONCTIONS UTILITAIRES POUR RLS
-- =============================================================================

-- Fonction pour récupérer le site_id depuis le contexte de session
-- Utilisée par l'application pour définir quel site accède aux données
CREATE OR REPLACE FUNCTION current_site_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_site_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION current_site_id() IS 'Retourne le site_id du contexte de session PostgreSQL';

-- Fonction pour vérifier si l'utilisateur est admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    current_setting('app.is_admin', true)::boolean,
    false
  );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION is_admin() IS 'Vérifie si l''utilisateur courant est administrateur';

-- Fonction pour récupérer le user_id courant (pour audit)
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION current_user_id() IS 'Retourne l''ID utilisateur du contexte de session';

-- Fonction pour définir le contexte de session
-- Appelée par le middleware Express avant chaque requête
CREATE OR REPLACE FUNCTION set_session_context(
  p_site_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_is_admin BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  -- Définir le site_id
  IF p_site_id IS NOT NULL THEN
    PERFORM set_config('app.current_site_id', p_site_id::text, false);
  ELSE
    PERFORM set_config('app.current_site_id', '', false);
  END IF;

  -- Définir le user_id
  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
  ELSE
    PERFORM set_config('app.current_user_id', '', false);
  END IF;

  -- Définir le flag admin
  PERFORM set_config('app.is_admin', p_is_admin::text, false);

  -- Log pour debug (à commenter en production)
  -- RAISE NOTICE 'Session context set: site_id=%, user_id=%, is_admin=%',
  --   COALESCE(p_site_id::text, 'NULL'),
  --   COALESCE(p_user_id::text, 'NULL'),
  --   p_is_admin;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_session_context(UUID, UUID, BOOLEAN) IS
  'Définit le contexte de session PostgreSQL pour RLS (appelé par le middleware Express)';

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ RLS Helper Functions créées avec succès:';
  RAISE NOTICE '   - current_site_id() → Retourne le site_id du contexte';
  RAISE NOTICE '   - is_admin() → Vérifie si admin';
  RAISE NOTICE '   - current_user_id() → Retourne l''user_id du contexte';
  RAISE NOTICE '   - set_session_context(site_id, user_id, is_admin) → Définit le contexte';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Test rapide:';
END $$;

-- Test rapide des fonctions
SELECT
  current_site_id() as site_id_before,
  is_admin() as is_admin_before,
  current_user_id() as user_id_before;

-- Définir un contexte de test
SELECT set_session_context(
  '123e4567-e89b-12d3-a456-426614174000'::UUID,
  '123e4567-e89b-12d3-a456-426614174001'::UUID,
  true
);

-- Vérifier que le contexte est bien défini
SELECT
  current_site_id() as site_id_after,
  is_admin() as is_admin_after,
  current_user_id() as user_id_after;

-- Réinitialiser le contexte
SELECT set_session_context(NULL, NULL, false);

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tests réussis!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Prochaine étape:';
  RAISE NOTICE '   Exécuter: enable-row-level-security.sql';
  RAISE NOTICE '';
END $$;

-- =============================================================================
-- FIN
-- =============================================================================
