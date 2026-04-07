-- =============================================================================
-- Migration: Enable RLS on tables without security policies
-- =============================================================================
-- Defensive: skips tables that don't exist yet (created by later migrations).
-- No BEGIN/COMMIT — the migrate runner wraps each migration in a transaction.
-- =============================================================================

-- Helper: enable RLS + create policies only if table exists
-- Uses dynamic SQL via EXECUTE to avoid parse-time errors on missing tables.

-- Helper function: idempotent policy creation (drop if exists, then create)
CREATE OR REPLACE FUNCTION _rls_policy(_policy_name TEXT, _table_name TEXT, _sql TEXT)
RETURNS VOID AS $$
BEGIN
  -- Drop existing policy if any (idempotent)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = _policy_name AND tablename = _table_name) THEN
    EXECUTE format('DROP POLICY %I ON %I', _policy_name, _table_name);
  END IF;
  EXECUTE _sql;
END;
$$ LANGUAGE plpgsql;

DO $rls$
DECLARE
  _tbl TEXT;
BEGIN

  -- =========================================================================
  -- ENABLE RLS on each table (skip if not exists)
  -- =========================================================================
  FOREACH _tbl IN ARRAY ARRAY[
    'agencies', 'agency_sites', 'campaigns', 'campaign_videos', 'campaign_sites',
    'club_objectives', 'club_objectives_progress', 'club_objective_alerts',
    'config_drafts', 'custom_playlists', 'generated_reports',
    'orchestrated_deployments', 'password_reset_tokens',
    'playlist_schedules', 'playlist_schedule_events', 'proof_of_broadcasts',
    'recurring_schedules', 'recurring_schedule_executions',
    'report_schedules', 'rls_audit_log', 'safe_sprint_velocity',
    'safe_story_status_override', 'scheduled_reports',
    'sponsor_access_tokens', 'subscription_history',
    'subscription_suspension_reasons', 'video_variants'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = _tbl AND schemaname = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', _tbl);
    ELSE
      RAISE NOTICE 'Skipping % (table does not exist)', _tbl;
    END IF;
  END LOOP;

  -- Handle sponsor_sites / advertiser_sites rename
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sponsor_sites' AND schemaname = 'public') THEN
    EXECUTE 'ALTER TABLE sponsor_sites ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE sponsor_sites FORCE ROW LEVEL SECURITY';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'advertiser_sites' AND schemaname = 'public') THEN
    EXECUTE 'ALTER TABLE advertiser_sites ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE advertiser_sites FORCE ROW LEVEL SECURITY';
  END IF;

  -- =========================================================================
  -- AGENCIES (top-level entity, no site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'agencies' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_agencies_all', 'agencies', 'CREATE POLICY admin_agencies_all ON agencies FOR ALL USING (is_admin())');
    PERFORM _rls_policy('user_read_own_agency', 'agencies', 'CREATE POLICY user_read_own_agency ON agencies FOR SELECT USING (id IN (SELECT agency_id FROM users WHERE id = current_user_id() AND agency_id IS NOT NULL))');
  END IF;

  -- =========================================================================
  -- AGENCY_SITES (junction: agency_id + site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'agency_sites' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_agency_sites_all', 'agency_sites', 'CREATE POLICY admin_agency_sites_all ON agency_sites FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_agency_sites', 'agency_sites', 'CREATE POLICY site_read_own_agency_sites ON agency_sites FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('agency_read_own_agency_sites', 'agency_sites', 'CREATE POLICY agency_read_own_agency_sites ON agency_sites FOR SELECT USING (agency_id IN (SELECT agency_id FROM users WHERE id = current_user_id() AND agency_id IS NOT NULL))');
  END IF;

  -- =========================================================================
  -- CAMPAIGNS (owned by advertiser_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'campaigns' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_campaigns_all', 'campaigns', 'CREATE POLICY admin_campaigns_all ON campaigns FOR ALL USING (is_admin())');
    PERFORM _rls_policy('advertiser_select_own_campaigns', 'campaigns', 'CREATE POLICY advertiser_select_own_campaigns ON campaigns FOR SELECT USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    PERFORM _rls_policy('advertiser_insert_own_campaigns', 'campaigns', 'CREATE POLICY advertiser_insert_own_campaigns ON campaigns FOR INSERT WITH CHECK (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    PERFORM _rls_policy('advertiser_update_own_campaigns', 'campaigns', 'CREATE POLICY advertiser_update_own_campaigns ON campaigns FOR UPDATE USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL)) WITH CHECK (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    -- Agency read campaigns: only if advertisers.agency_id column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisers' AND column_name = 'agency_id') THEN
      PERFORM _rls_policy('agency_read_campaigns', 'campaigns', 'CREATE POLICY agency_read_campaigns ON campaigns FOR SELECT USING (advertiser_id IN (SELECT a.id FROM advertisers a JOIN users u ON u.agency_id = a.agency_id WHERE u.id = current_user_id() AND a.agency_id IS NOT NULL))');
    END IF;
  END IF;

  -- =========================================================================
  -- CAMPAIGN_VIDEOS (owned via campaign_id → campaigns.advertiser_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'campaign_videos' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_campaign_videos_all', 'campaign_videos', 'CREATE POLICY admin_campaign_videos_all ON campaign_videos FOR ALL USING (is_admin())');
    PERFORM _rls_policy('advertiser_select_own_campaign_videos', 'campaign_videos', 'CREATE POLICY advertiser_select_own_campaign_videos ON campaign_videos FOR SELECT USING (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
    PERFORM _rls_policy('advertiser_insert_own_campaign_videos', 'campaign_videos', 'CREATE POLICY advertiser_insert_own_campaign_videos ON campaign_videos FOR INSERT WITH CHECK (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
    PERFORM _rls_policy('advertiser_update_own_campaign_videos', 'campaign_videos', 'CREATE POLICY advertiser_update_own_campaign_videos ON campaign_videos FOR UPDATE USING (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id())) WITH CHECK (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
    PERFORM _rls_policy('advertiser_delete_own_campaign_videos', 'campaign_videos', 'CREATE POLICY advertiser_delete_own_campaign_videos ON campaign_videos FOR DELETE USING (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
  END IF;

  -- =========================================================================
  -- CAMPAIGN_SITES (campaign_id + site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'campaign_sites' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_campaign_sites_all', 'campaign_sites', 'CREATE POLICY admin_campaign_sites_all ON campaign_sites FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_campaign_sites', 'campaign_sites', 'CREATE POLICY site_read_own_campaign_sites ON campaign_sites FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('advertiser_select_own_campaign_sites', 'campaign_sites', 'CREATE POLICY advertiser_select_own_campaign_sites ON campaign_sites FOR SELECT USING (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
    PERFORM _rls_policy('advertiser_insert_own_campaign_sites', 'campaign_sites', 'CREATE POLICY advertiser_insert_own_campaign_sites ON campaign_sites FOR INSERT WITH CHECK (campaign_id IN (SELECT c.id FROM campaigns c JOIN users u ON u.advertiser_id = c.advertiser_id WHERE u.id = current_user_id()))');
  END IF;

  -- =========================================================================
  -- CLUB_OBJECTIVES (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'club_objectives' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_club_objectives_all', 'club_objectives', 'CREATE POLICY admin_club_objectives_all ON club_objectives FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_club_objectives', 'club_objectives', 'CREATE POLICY site_read_own_club_objectives ON club_objectives FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_insert_own_club_objectives', 'club_objectives', 'CREATE POLICY site_insert_own_club_objectives ON club_objectives FOR INSERT WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_update_own_club_objectives', 'club_objectives', 'CREATE POLICY site_update_own_club_objectives ON club_objectives FOR UPDATE USING (site_id = current_site_id()) WITH CHECK (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- CLUB_OBJECTIVES_PROGRESS (via objective_id → club_objectives.site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'club_objectives_progress' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_club_objectives_progress_all', 'club_objectives_progress', 'CREATE POLICY admin_club_objectives_progress_all ON club_objectives_progress FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_objectives_progress', 'club_objectives_progress', 'CREATE POLICY site_read_own_objectives_progress ON club_objectives_progress FOR SELECT USING (objective_id IN (SELECT id FROM club_objectives WHERE site_id = current_site_id()))');
    PERFORM _rls_policy('site_insert_own_objectives_progress', 'club_objectives_progress', 'CREATE POLICY site_insert_own_objectives_progress ON club_objectives_progress FOR INSERT WITH CHECK (objective_id IN (SELECT id FROM club_objectives WHERE site_id = current_site_id()))');
  END IF;

  -- =========================================================================
  -- CLUB_OBJECTIVE_ALERTS (via objective_id → club_objectives.site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'club_objective_alerts' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_club_objective_alerts_all', 'club_objective_alerts', 'CREATE POLICY admin_club_objective_alerts_all ON club_objective_alerts FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_objective_alerts', 'club_objective_alerts', 'CREATE POLICY site_read_own_objective_alerts ON club_objective_alerts FOR SELECT USING (objective_id IN (SELECT id FROM club_objectives WHERE site_id = current_site_id()))');
  END IF;

  -- =========================================================================
  -- CONFIG_DRAFTS (site_id, UNIQUE per site)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'config_drafts' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_config_drafts_all', 'config_drafts', 'CREATE POLICY admin_config_drafts_all ON config_drafts FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_config_drafts', 'config_drafts', 'CREATE POLICY site_read_own_config_drafts ON config_drafts FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_insert_own_config_drafts', 'config_drafts', 'CREATE POLICY site_insert_own_config_drafts ON config_drafts FOR INSERT WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_update_own_config_drafts', 'config_drafts', 'CREATE POLICY site_update_own_config_drafts ON config_drafts FOR UPDATE USING (site_id = current_site_id()) WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_delete_own_config_drafts', 'config_drafts', 'CREATE POLICY site_delete_own_config_drafts ON config_drafts FOR DELETE USING (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- CUSTOM_PLAYLISTS (site_id nullable — NULL = global/public)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'custom_playlists' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_custom_playlists_all', 'custom_playlists', 'CREATE POLICY admin_custom_playlists_all ON custom_playlists FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_custom_playlists', 'custom_playlists', 'CREATE POLICY site_read_own_custom_playlists ON custom_playlists FOR SELECT USING (site_id = current_site_id() OR (site_id IS NULL AND is_public = true))');
    PERFORM _rls_policy('site_insert_own_custom_playlists', 'custom_playlists', 'CREATE POLICY site_insert_own_custom_playlists ON custom_playlists FOR INSERT WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_update_own_custom_playlists', 'custom_playlists', 'CREATE POLICY site_update_own_custom_playlists ON custom_playlists FOR UPDATE USING (site_id = current_site_id()) WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_delete_own_custom_playlists', 'custom_playlists', 'CREATE POLICY site_delete_own_custom_playlists ON custom_playlists FOR DELETE USING (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- GENERATED_REPORTS (site_id OR advertiser_id, polymorphic)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'generated_reports' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_generated_reports_all', 'generated_reports', 'CREATE POLICY admin_generated_reports_all ON generated_reports FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_generated_reports', 'generated_reports', 'CREATE POLICY site_read_own_generated_reports ON generated_reports FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('advertiser_read_own_generated_reports', 'generated_reports', 'CREATE POLICY advertiser_read_own_generated_reports ON generated_reports FOR SELECT USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
  END IF;

  -- =========================================================================
  -- ORCHESTRATED_DEPLOYMENTS (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'orchestrated_deployments' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_orchestrated_deployments_all', 'orchestrated_deployments', 'CREATE POLICY admin_orchestrated_deployments_all ON orchestrated_deployments FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_orchestrated_deployments', 'orchestrated_deployments', 'CREATE POLICY site_read_own_orchestrated_deployments ON orchestrated_deployments FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_update_own_orchestrated_deployments', 'orchestrated_deployments', 'CREATE POLICY site_update_own_orchestrated_deployments ON orchestrated_deployments FOR UPDATE USING (site_id = current_site_id()) WITH CHECK (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- PASSWORD_RESET_TOKENS (user_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'password_reset_tokens' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_password_reset_tokens_all', 'password_reset_tokens', 'CREATE POLICY admin_password_reset_tokens_all ON password_reset_tokens FOR ALL USING (is_admin())');
    PERFORM _rls_policy('user_read_own_password_reset_tokens', 'password_reset_tokens', 'CREATE POLICY user_read_own_password_reset_tokens ON password_reset_tokens FOR SELECT USING (user_id = current_user_id())');
    PERFORM _rls_policy('user_delete_own_password_reset_tokens', 'password_reset_tokens', 'CREATE POLICY user_delete_own_password_reset_tokens ON password_reset_tokens FOR DELETE USING (user_id = current_user_id())');
  END IF;

  -- =========================================================================
  -- PLAYLIST_SCHEDULES (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'playlist_schedules' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_playlist_schedules_all', 'playlist_schedules', 'CREATE POLICY admin_playlist_schedules_all ON playlist_schedules FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_playlist_schedules', 'playlist_schedules', 'CREATE POLICY site_read_own_playlist_schedules ON playlist_schedules FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_insert_own_playlist_schedules', 'playlist_schedules', 'CREATE POLICY site_insert_own_playlist_schedules ON playlist_schedules FOR INSERT WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_update_own_playlist_schedules', 'playlist_schedules', 'CREATE POLICY site_update_own_playlist_schedules ON playlist_schedules FOR UPDATE USING (site_id = current_site_id()) WITH CHECK (site_id = current_site_id())');
    PERFORM _rls_policy('site_delete_own_playlist_schedules', 'playlist_schedules', 'CREATE POLICY site_delete_own_playlist_schedules ON playlist_schedules FOR DELETE USING (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- PLAYLIST_SCHEDULE_EVENTS (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'playlist_schedule_events' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_playlist_schedule_events_all', 'playlist_schedule_events', 'CREATE POLICY admin_playlist_schedule_events_all ON playlist_schedule_events FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_playlist_schedule_events', 'playlist_schedule_events', 'CREATE POLICY site_read_own_playlist_schedule_events ON playlist_schedule_events FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_insert_own_playlist_schedule_events', 'playlist_schedule_events', 'CREATE POLICY site_insert_own_playlist_schedule_events ON playlist_schedule_events FOR INSERT WITH CHECK (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- PROOF_OF_BROADCASTS (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'proof_of_broadcasts' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_proof_of_broadcasts_all', 'proof_of_broadcasts', 'CREATE POLICY admin_proof_of_broadcasts_all ON proof_of_broadcasts FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_proof_of_broadcasts', 'proof_of_broadcasts', 'CREATE POLICY site_read_own_proof_of_broadcasts ON proof_of_broadcasts FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('site_insert_own_proof_of_broadcasts', 'proof_of_broadcasts', 'CREATE POLICY site_insert_own_proof_of_broadcasts ON proof_of_broadcasts FOR INSERT WITH CHECK (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- RECURRING_SCHEDULES (system-level — admin write, public read)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'recurring_schedules' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_recurring_schedules_all', 'recurring_schedules', 'CREATE POLICY admin_recurring_schedules_all ON recurring_schedules FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_recurring_schedules', 'recurring_schedules', 'CREATE POLICY read_recurring_schedules ON recurring_schedules FOR SELECT USING (true)');
  END IF;

  -- =========================================================================
  -- RECURRING_SCHEDULE_EXECUTIONS (system-level)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'recurring_schedule_executions' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_recurring_schedule_executions_all', 'recurring_schedule_executions', 'CREATE POLICY admin_recurring_schedule_executions_all ON recurring_schedule_executions FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_recurring_schedule_executions', 'recurring_schedule_executions', 'CREATE POLICY read_recurring_schedule_executions ON recurring_schedule_executions FOR SELECT USING (true)');
  END IF;

  -- =========================================================================
  -- REPORT_SCHEDULES (site_id OR advertiser_id, polymorphic)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'report_schedules' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_report_schedules_all', 'report_schedules', 'CREATE POLICY admin_report_schedules_all ON report_schedules FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_report_schedules', 'report_schedules', 'CREATE POLICY site_read_own_report_schedules ON report_schedules FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('advertiser_read_own_report_schedules', 'report_schedules', 'CREATE POLICY advertiser_read_own_report_schedules ON report_schedules FOR SELECT USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
  END IF;

  -- =========================================================================
  -- RLS_AUDIT_LOG (admin-only)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'rls_audit_log' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_rls_audit_log_all', 'rls_audit_log', 'CREATE POLICY admin_rls_audit_log_all ON rls_audit_log FOR ALL USING (is_admin())');
  END IF;

  -- =========================================================================
  -- SAFE_SPRINT_VELOCITY (internal SAFe — admin write, public read)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'safe_sprint_velocity' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_safe_sprint_velocity_all', 'safe_sprint_velocity', 'CREATE POLICY admin_safe_sprint_velocity_all ON safe_sprint_velocity FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_safe_sprint_velocity', 'safe_sprint_velocity', 'CREATE POLICY read_safe_sprint_velocity ON safe_sprint_velocity FOR SELECT USING (true)');
  END IF;

  -- =========================================================================
  -- SAFE_STORY_STATUS_OVERRIDE (internal SAFe — admin write, public read)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'safe_story_status_override' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_safe_story_status_override_all', 'safe_story_status_override', 'CREATE POLICY admin_safe_story_status_override_all ON safe_story_status_override FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_safe_story_status_override', 'safe_story_status_override', 'CREATE POLICY read_safe_story_status_override ON safe_story_status_override FOR SELECT USING (true)');
  END IF;

  -- =========================================================================
  -- SCHEDULED_REPORTS (advertiser_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scheduled_reports' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_scheduled_reports_all', 'scheduled_reports', 'CREATE POLICY admin_scheduled_reports_all ON scheduled_reports FOR ALL USING (is_admin())');
    PERFORM _rls_policy('advertiser_read_own_scheduled_reports', 'scheduled_reports', 'CREATE POLICY advertiser_read_own_scheduled_reports ON scheduled_reports FOR SELECT USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    PERFORM _rls_policy('advertiser_insert_own_scheduled_reports', 'scheduled_reports', 'CREATE POLICY advertiser_insert_own_scheduled_reports ON scheduled_reports FOR INSERT WITH CHECK (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    PERFORM _rls_policy('advertiser_update_own_scheduled_reports', 'scheduled_reports', 'CREATE POLICY advertiser_update_own_scheduled_reports ON scheduled_reports FOR UPDATE USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL)) WITH CHECK (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
  END IF;

  -- =========================================================================
  -- SPONSOR_ACCESS_TOKENS (via site_sponsor_id → site_sponsors.site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sponsor_access_tokens' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_sponsor_access_tokens_all', 'sponsor_access_tokens', 'CREATE POLICY admin_sponsor_access_tokens_all ON sponsor_access_tokens FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_sponsor_access_tokens', 'sponsor_access_tokens', 'CREATE POLICY site_read_own_sponsor_access_tokens ON sponsor_access_tokens FOR SELECT USING (site_sponsor_id IN (SELECT id FROM site_sponsors WHERE site_id = current_site_id()))');
    PERFORM _rls_policy('site_insert_own_sponsor_access_tokens', 'sponsor_access_tokens', 'CREATE POLICY site_insert_own_sponsor_access_tokens ON sponsor_access_tokens FOR INSERT WITH CHECK (site_sponsor_id IN (SELECT id FROM site_sponsors WHERE site_id = current_site_id()))');
    PERFORM _rls_policy('site_delete_own_sponsor_access_tokens', 'sponsor_access_tokens', 'CREATE POLICY site_delete_own_sponsor_access_tokens ON sponsor_access_tokens FOR DELETE USING (site_sponsor_id IN (SELECT id FROM site_sponsors WHERE site_id = current_site_id()))');
  END IF;

  -- =========================================================================
  -- SPONSOR_SITES / ADVERTISER_SITES (renamed)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sponsor_sites' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_sponsor_sites_all', 'sponsor_sites', 'CREATE POLICY admin_sponsor_sites_all ON sponsor_sites FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_sponsor_sites', 'sponsor_sites', 'CREATE POLICY site_read_own_sponsor_sites ON sponsor_sites FOR SELECT USING (site_id = current_site_id())');
    PERFORM _rls_policy('advertiser_read_own_sponsor_sites', 'sponsor_sites', 'CREATE POLICY advertiser_read_own_sponsor_sites ON sponsor_sites FOR SELECT USING (sponsor_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'advertiser_sites' AND schemaname = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advertiser_sites') THEN
      PERFORM _rls_policy('admin_advertiser_sites_all', 'advertiser_sites', 'CREATE POLICY admin_advertiser_sites_all ON advertiser_sites FOR ALL USING (is_admin())');
      PERFORM _rls_policy('site_read_own_advertiser_sites', 'advertiser_sites', 'CREATE POLICY site_read_own_advertiser_sites ON advertiser_sites FOR SELECT USING (site_id = current_site_id())');
      PERFORM _rls_policy('advertiser_read_own_advertiser_sites', 'advertiser_sites', 'CREATE POLICY advertiser_read_own_advertiser_sites ON advertiser_sites FOR SELECT USING (advertiser_id IN (SELECT advertiser_id FROM users WHERE id = current_user_id() AND advertiser_id IS NOT NULL))');
    END IF;
  END IF;

  -- =========================================================================
  -- SUBSCRIPTION_HISTORY (site_id)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'subscription_history' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_subscription_history_all', 'subscription_history', 'CREATE POLICY admin_subscription_history_all ON subscription_history FOR ALL USING (is_admin())');
    PERFORM _rls_policy('site_read_own_subscription_history', 'subscription_history', 'CREATE POLICY site_read_own_subscription_history ON subscription_history FOR SELECT USING (site_id = current_site_id())');
  END IF;

  -- =========================================================================
  -- SUBSCRIPTION_SUSPENSION_REASONS (reference data — public read)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'subscription_suspension_reasons' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_subscription_suspension_reasons_all', 'subscription_suspension_reasons', 'CREATE POLICY admin_subscription_suspension_reasons_all ON subscription_suspension_reasons FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_subscription_suspension_reasons', 'subscription_suspension_reasons', 'CREATE POLICY read_subscription_suspension_reasons ON subscription_suspension_reasons FOR SELECT USING (true)');
  END IF;

  -- =========================================================================
  -- VIDEO_VARIANTS (shared content — public read, admin write)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'video_variants' AND schemaname = 'public') THEN
    PERFORM _rls_policy('admin_video_variants_all', 'video_variants', 'CREATE POLICY admin_video_variants_all ON video_variants FOR ALL USING (is_admin())');
    PERFORM _rls_policy('read_video_variants', 'video_variants', 'CREATE POLICY read_video_variants ON video_variants FOR SELECT USING (true)');
  END IF;

END $rls$;

-- Cleanup helper function
DROP FUNCTION IF EXISTS _rls_policy(TEXT, TEXT, TEXT);
