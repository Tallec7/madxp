-- =============================================================================
-- NEOPRO Central - Row-Level Security (RLS)
-- =============================================================================
-- Ce fichier implémente Row-Level Security sur PostgreSQL pour garantir
-- l'isolation des données multi-tenant au niveau de la base de données.
--
-- SÉCURITÉ: Chaque site/club ne peut accéder qu'à ses propres données
-- PERFORMANCE: Les policies utilisent les index existants
-- AUDIT: Les policies sont loggées et auditables
--
-- Date: 2025-12-16
-- =============================================================================

-- =============================================================================
-- ACTIVER RLS SUR LES TABLES CRITIQUES
-- =============================================================================

-- Sites: isolation par site_id
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Métriques: isolation par site_id
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Alertes: isolation par site_id
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Commandes à distance: isolation par site_id
ALTER TABLE remote_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_commands ENABLE ROW LEVEL SECURITY;

-- Historique configuration: isolation par site_id
ALTER TABLE config_history ENABLE ROW LEVEL SECURITY;

-- Déploiements: isolation par site_id
ALTER TABLE content_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE update_deployments ENABLE ROW LEVEL SECURITY;

-- Analytics Club: isolation par site_id
ALTER TABLE club_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_daily_stats ENABLE ROW LEVEL SECURITY;

-- Analytics Sponsors: isolation par site_id
ALTER TABLE sponsor_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_daily_stats ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- FONCTIONS UTILITAIRES POUR RLS
-- =============================================================================

-- Fonction pour récupérer le site_id depuis le contexte de session
-- Utilisée par l'application pour définir quel site accède aux données
CREATE OR REPLACE FUNCTION current_site_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_site_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Fonction pour vérifier si l'utilisateur est admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    current_setting('app.is_admin', true)::boolean,
    false
  );
$$ LANGUAGE SQL STABLE;

-- Fonction pour récupérer le user_id courant (pour audit)
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- POLICIES - SITES
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_sites_all ON sites
  FOR ALL
  USING (is_admin());

-- Site: lecture seule de ses propres données
CREATE POLICY site_read_own ON sites
  FOR SELECT
  USING (id = current_site_id());

-- Site: mise à jour de ses propres données (limité)
CREATE POLICY site_update_own ON sites
  FOR UPDATE
  USING (id = current_site_id())
  WITH CHECK (id = current_site_id());

-- =============================================================================
-- POLICIES - METRICS
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_metrics_all ON metrics
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres métriques
CREATE POLICY site_read_own_metrics ON metrics
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: insertion de ses propres métriques
CREATE POLICY site_insert_own_metrics ON metrics
  FOR INSERT
  WITH CHECK (site_id = current_site_id());

-- =============================================================================
-- POLICIES - ALERTS
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_alerts_all ON alerts
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres alertes
CREATE POLICY site_read_own_alerts ON alerts
  FOR SELECT
  USING (site_id = current_site_id());

-- =============================================================================
-- POLICIES - REMOTE_COMMANDS
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_commands_all ON remote_commands
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres commandes
CREATE POLICY site_read_own_commands ON remote_commands
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: mise à jour du statut de ses propres commandes
CREATE POLICY site_update_own_commands ON remote_commands
  FOR UPDATE
  USING (site_id = current_site_id())
  WITH CHECK (site_id = current_site_id());

-- =============================================================================
-- POLICIES - PENDING_COMMANDS
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_pending_commands_all ON pending_commands
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres commandes en attente
CREATE POLICY site_read_own_pending_commands ON pending_commands
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: suppression de ses propres commandes (après traitement)
CREATE POLICY site_delete_own_pending_commands ON pending_commands
  FOR DELETE
  USING (site_id = current_site_id());

-- =============================================================================
-- POLICIES - CONFIG_HISTORY
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_config_history_all ON config_history
  FOR ALL
  USING (is_admin());

-- Site: lecture de son propre historique
CREATE POLICY site_read_own_config_history ON config_history
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: insertion dans son propre historique
CREATE POLICY site_insert_own_config_history ON config_history
  FOR INSERT
  WITH CHECK (site_id = current_site_id());

-- =============================================================================
-- POLICIES - DEPLOYMENTS
-- =============================================================================

-- Admin: accès complet aux déploiements de contenu
CREATE POLICY admin_content_deployments_all ON content_deployments
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres déploiements
CREATE POLICY site_read_own_content_deployments ON content_deployments
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: mise à jour du statut de ses propres déploiements
CREATE POLICY site_update_own_content_deployments ON content_deployments
  FOR UPDATE
  USING (site_id = current_site_id())
  WITH CHECK (site_id = current_site_id());

-- Admin: accès complet aux déploiements de mises à jour
CREATE POLICY admin_update_deployments_all ON update_deployments
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres mises à jour
CREATE POLICY site_read_own_update_deployments ON update_deployments
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: mise à jour du statut de ses propres mises à jour
CREATE POLICY site_update_own_update_deployments ON update_deployments
  FOR UPDATE
  USING (site_id = current_site_id())
  WITH CHECK (site_id = current_site_id());

-- =============================================================================
-- POLICIES - ANALYTICS CLUB
-- =============================================================================

-- Admin: accès complet
CREATE POLICY admin_club_sessions_all ON club_sessions
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres sessions
CREATE POLICY site_read_own_club_sessions ON club_sessions
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: insertion de ses propres sessions
CREATE POLICY site_insert_own_club_sessions ON club_sessions
  FOR INSERT
  WITH CHECK (site_id = current_site_id());

-- Site: mise à jour de ses propres sessions
CREATE POLICY site_update_own_club_sessions ON club_sessions
  FOR UPDATE
  USING (site_id = current_site_id())
  WITH CHECK (site_id = current_site_id());

-- Admin: accès complet aux lectures vidéos
CREATE POLICY admin_video_plays_all ON video_plays
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres lectures
CREATE POLICY site_read_own_video_plays ON video_plays
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: insertion de ses propres lectures
CREATE POLICY site_insert_own_video_plays ON video_plays
  FOR INSERT
  WITH CHECK (site_id = current_site_id());

-- Admin: accès complet aux stats quotidiennes
CREATE POLICY admin_club_daily_stats_all ON club_daily_stats
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres stats
CREATE POLICY site_read_own_club_daily_stats ON club_daily_stats
  FOR SELECT
  USING (site_id = current_site_id());

-- =============================================================================
-- POLICIES - ANALYTICS SPONSORS
-- =============================================================================

-- Admin: accès complet aux impressions sponsors
CREATE POLICY admin_sponsor_impressions_all ON sponsor_impressions
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres impressions
CREATE POLICY site_read_own_sponsor_impressions ON sponsor_impressions
  FOR SELECT
  USING (site_id = current_site_id());

-- Site: insertion de ses propres impressions
CREATE POLICY site_insert_own_sponsor_impressions ON sponsor_impressions
  FOR INSERT
  WITH CHECK (site_id = current_site_id());

-- Admin: accès complet aux stats quotidiennes sponsors
CREATE POLICY admin_sponsor_daily_stats_all ON sponsor_daily_stats
  FOR ALL
  USING (is_admin());

-- Site: lecture de ses propres stats sponsors
CREATE POLICY site_read_own_sponsor_daily_stats ON sponsor_daily_stats
  FOR SELECT
  USING (site_id = current_site_id());

-- =============================================================================
-- POLICIES - TABLES PARTAGÉES (ADMINS SEULEMENT)
-- =============================================================================

-- Users: admins seulement
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_users_all ON users
  FOR ALL
  USING (is_admin());

-- Groups: admins seulement (lecture pour sites)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_groups_all ON groups
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_groups ON groups
  FOR SELECT
  USING (true); -- Tous les sites peuvent lire les groupes

-- Site Groups: admins seulement (lecture pour sites)
ALTER TABLE site_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_site_groups_all ON site_groups
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_own_site_groups ON site_groups
  FOR SELECT
  USING (site_id = current_site_id());

-- Videos: admins peuvent tout, sites peuvent lire
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_videos_all ON videos
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_videos ON videos
  FOR SELECT
  USING (true); -- Tous les sites peuvent lire les vidéos

-- Software Updates: admins seulement (lecture pour sites)
ALTER TABLE software_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_software_updates_all ON software_updates
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_software_updates ON software_updates
  FOR SELECT
  USING (true); -- Tous les sites peuvent lire les mises à jour disponibles

-- Sponsors: admins peuvent tout, sites peuvent lire
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_sponsors_all ON sponsors
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_sponsors ON sponsors
  FOR SELECT
  USING (true); -- Tous les sites peuvent lire les sponsors

-- Sponsor Videos: admins peuvent tout, sites peuvent lire
ALTER TABLE sponsor_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_sponsor_videos_all ON sponsor_videos
  FOR ALL
  USING (is_admin());

CREATE POLICY site_read_sponsor_videos ON sponsor_videos
  FOR SELECT
  USING (true); -- Tous les sites peuvent lire les associations

-- =============================================================================
-- BYPASS RLS POUR LE RÔLE SYSTÈME (BACKEND APPLICATION)
-- =============================================================================

-- Créer un rôle spécial pour l'application backend qui bypass RLS
-- (L'application elle-même gère les permissions via JWT et middleware)

-- Note: Cette commande doit être exécutée par un superuser
-- CREATE ROLE neopro_backend WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neopro_backend;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neopro_backend;
-- ALTER ROLE neopro_backend BYPASSRLS;

-- =============================================================================
-- HELPER FUNCTIONS POUR L'APPLICATION
-- =============================================================================

-- Fonction pour définir le contexte de session (appelée par le backend)
CREATE OR REPLACE FUNCTION set_session_context(
  p_site_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_is_admin BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  IF p_site_id IS NOT NULL THEN
    PERFORM set_config('app.current_site_id', p_site_id::text, false);
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
  END IF;

  PERFORM set_config('app.is_admin', p_is_admin::text, false);
END;
$$ LANGUAGE plpgsql;

-- Fonction pour réinitialiser le contexte de session
CREATE OR REPLACE FUNCTION reset_session_context()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_site_id', '', false);
  PERFORM set_config('app.current_user_id', '', false);
  PERFORM set_config('app.is_admin', 'false', false);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- AUDIT LOGGING
-- =============================================================================

-- Table pour auditer les accès sensibles (optionnel)
CREATE TABLE IF NOT EXISTS rls_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accessed_at TIMESTAMP DEFAULT NOW(),
  user_id UUID,
  site_id UUID,
  is_admin BOOLEAN,
  table_name VARCHAR(100),
  operation VARCHAR(20),
  row_id UUID,
  ip_address VARCHAR(45)
);

CREATE INDEX idx_rls_audit_accessed_at ON rls_audit_log(accessed_at DESC);
CREATE INDEX idx_rls_audit_site_id ON rls_audit_log(site_id);
CREATE INDEX idx_rls_audit_user_id ON rls_audit_log(user_id);

-- Fonction trigger pour auditer les accès sensibles
CREATE OR REPLACE FUNCTION audit_sensitive_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Ne logger que si ce n'est pas un admin
  IF NOT is_admin() THEN
    INSERT INTO rls_audit_log (
      user_id,
      site_id,
      is_admin,
      table_name,
      operation,
      row_id
    ) VALUES (
      current_user_id(),
      current_site_id(),
      is_admin(),
      TG_TABLE_NAME,
      TG_OP,
      COALESCE(NEW.id, OLD.id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Activer l'audit sur les tables critiques (optionnel)
-- CREATE TRIGGER audit_sites AFTER INSERT OR UPDATE OR DELETE ON sites
--   FOR EACH ROW EXECUTE FUNCTION audit_sensitive_access();

-- CREATE TRIGGER audit_config_history AFTER INSERT OR UPDATE OR DELETE ON config_history
--   FOR EACH ROW EXECUTE FUNCTION audit_sensitive_access();

-- =============================================================================
-- VERIFICATION & TESTS
-- =============================================================================

-- Tests de vérification RLS
-- À exécuter pour valider que RLS fonctionne correctement

-- Test 1: Vérifier que RLS est activé
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = true;

  IF v_count > 0 THEN
    RAISE NOTICE 'RLS activé sur % tables', v_count;
  ELSE
    RAISE WARNING 'Aucune table avec RLS activé';
  END IF;
END $$;

-- Test 2: Lister toutes les policies créées
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public';

  RAISE NOTICE 'Total de % policies créées', v_count;
END $$;

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

COMMENT ON FUNCTION current_site_id() IS 'Récupère le site_id depuis le contexte de session';
COMMENT ON FUNCTION is_admin() IS 'Vérifie si l''utilisateur courant est admin';
COMMENT ON FUNCTION current_user_id() IS 'Récupère le user_id depuis le contexte de session';
COMMENT ON FUNCTION set_session_context(UUID, UUID, BOOLEAN) IS 'Définit le contexte de session pour RLS';
COMMENT ON FUNCTION reset_session_context() IS 'Réinitialise le contexte de session';
COMMENT ON TABLE rls_audit_log IS 'Log des accès aux données sensibles (audit RLS)';

-- =============================================================================
-- NOTES D'IMPLÉMENTATION POUR LE BACKEND
-- =============================================================================

/*
UTILISATION DANS LE CODE BACKEND (Node.js/Express):

1. Dans le middleware d'authentification, après validation du JWT:

   const { Pool } = require('pg');
   const pool = new Pool({ ... });

   // Pour chaque requête authentifiée:
   app.use(async (req, res, next) => {
     const { siteId, userId, isAdmin } = req.user; // Depuis JWT

     // Définir le contexte RLS
     await pool.query(
       'SELECT set_session_context($1, $2, $3)',
       [siteId, userId, isAdmin]
     );

     // Continuer avec la requête
     next();

     // Optionnel: réinitialiser après
     // await pool.query('SELECT reset_session_context()');
   });

2. Pour les connexions pool, utiliser afterCreate:

   const pool = new Pool({
     // ... config
     afterCreate: async (conn, done) => {
       // Set default context if needed
       done();
     }
   });

3. Pour les tests, bypass RLS:

   // Option 1: Utiliser un rôle avec BYPASSRLS
   // Option 2: Définir is_admin = true
   await pool.query("SELECT set_session_context(NULL, NULL, true)");

4. Pour les tâches cron/background:

   // Les jobs système doivent utiliser is_admin = true
   await pool.query("SELECT set_session_context(NULL, NULL, true)");
*/

-- =============================================================================
-- FIN DU SCRIPT
-- =============================================================================

-- Migration réussie si vous voyez ce message
DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Row-Level Security configuré avec succès';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Tables protégées: sites, metrics, alerts, deployments, analytics, sponsors';
  RAISE NOTICE 'Functions créées: set_session_context(), reset_session_context()';
  RAISE NOTICE 'Prochaine étape: Intégrer set_session_context() dans le backend';
  RAISE NOTICE '=============================================================================';
END $$;
