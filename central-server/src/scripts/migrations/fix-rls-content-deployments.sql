-- ============================================================================
-- Migration: Fix RLS Policies for content_deployments and update_deployments
-- ============================================================================
-- Date: 2025-12-16
-- Description: Corriger les policies RLS pour gérer la structure polymorphe
--              (target_type/target_id) au lieu de site_id direct
-- ============================================================================

-- Supprimer les policies incorrectes existantes
DROP POLICY IF EXISTS admin_content_deployments_all ON content_deployments;
DROP POLICY IF EXISTS site_read_own_content_deployments ON content_deployments;
DROP POLICY IF EXISTS site_update_own_content_deployments ON content_deployments;

DROP POLICY IF EXISTS admin_update_deployments_all ON update_deployments;
DROP POLICY IF EXISTS site_read_own_update_deployments ON update_deployments;
DROP POLICY IF EXISTS site_update_own_update_deployments ON update_deployments;

-- ============================================================================
-- Content Deployments: Policies avec support polymorphe
-- ============================================================================

-- Admin: accès complet
CREATE POLICY admin_content_deployments_all ON content_deployments
  FOR ALL
  USING (is_admin());

-- Site: voir les déploiements qui le ciblent directement
CREATE POLICY site_read_own_content_deployments ON content_deployments
  FOR SELECT
  USING (
    target_type = 'site'
    AND target_id = current_site_id()
  );

-- Site: voir les déploiements qui ciblent un groupe dont il fait partie
CREATE POLICY site_read_group_content_deployments ON content_deployments
  FOR SELECT
  USING (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  );

-- Site: mettre à jour le statut de ses propres déploiements
CREATE POLICY site_update_own_content_deployments ON content_deployments
  FOR UPDATE
  USING (
    target_type = 'site'
    AND target_id = current_site_id()
  )
  WITH CHECK (
    target_type = 'site'
    AND target_id = current_site_id()
  );

-- Site: mettre à jour le statut des déploiements de groupe
CREATE POLICY site_update_group_content_deployments ON content_deployments
  FOR UPDATE
  USING (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  )
  WITH CHECK (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  );

-- ============================================================================
-- Update Deployments: Policies avec support polymorphe
-- ============================================================================

-- Admin: accès complet
CREATE POLICY admin_update_deployments_all ON update_deployments
  FOR ALL
  USING (is_admin());

-- Site: voir les déploiements de mises à jour qui le ciblent directement
CREATE POLICY site_read_own_update_deployments ON update_deployments
  FOR SELECT
  USING (
    target_type = 'site'
    AND target_id = current_site_id()
  );

-- Site: voir les déploiements qui ciblent un groupe dont il fait partie
CREATE POLICY site_read_group_update_deployments ON update_deployments
  FOR SELECT
  USING (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  );

-- Site: mettre à jour le statut de ses propres déploiements
CREATE POLICY site_update_own_update_deployments ON update_deployments
  FOR UPDATE
  USING (
    target_type = 'site'
    AND target_id = current_site_id()
  )
  WITH CHECK (
    target_type = 'site'
    AND target_id = current_site_id()
  );

-- Site: mettre à jour le statut des déploiements de groupe
CREATE POLICY site_update_group_update_deployments ON update_deployments
  FOR UPDATE
  USING (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  )
  WITH CHECK (
    target_type = 'group'
    AND target_id IN (
      SELECT group_id
      FROM group_sites
      WHERE site_id = current_site_id()
    )
  );

-- ============================================================================
-- Vérification
-- ============================================================================

-- Liste toutes les policies créées pour content_deployments
DO $$
BEGIN
  RAISE NOTICE 'Policies for content_deployments:';
  RAISE NOTICE '  - admin_content_deployments_all';
  RAISE NOTICE '  - site_read_own_content_deployments';
  RAISE NOTICE '  - site_read_group_content_deployments';
  RAISE NOTICE '  - site_update_own_content_deployments';
  RAISE NOTICE '  - site_update_group_content_deployments';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies for update_deployments:';
  RAISE NOTICE '  - admin_update_deployments_all';
  RAISE NOTICE '  - site_read_own_update_deployments';
  RAISE NOTICE '  - site_read_group_update_deployments';
  RAISE NOTICE '  - site_update_own_update_deployments';
  RAISE NOTICE '  - site_update_group_update_deployments';
END $$;

-- ============================================================================
-- Fin de la migration
-- ============================================================================
