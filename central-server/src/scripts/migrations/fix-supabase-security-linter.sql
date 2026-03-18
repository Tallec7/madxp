-- =============================================================================
-- Fix Supabase Security Linter Alerts
-- =============================================================================
-- Resolves two categories of Supabase database linter errors:
--
-- 1. SECURITY DEFINER views (20 views)
--    Views default to SECURITY DEFINER in PostgreSQL, meaning they run with
--    the view owner's permissions and bypass RLS. Setting security_invoker = true
--    makes them respect the calling user's permissions instead.
--
-- 2. RLS disabled on public tables (25 tables)
--    Tables added after the initial RLS migration that were never protected.
--    Since the app connects as the DB owner (who bypasses RLS by default),
--    enabling RLS does not break existing functionality.
--
-- Date: 2026-03-18
-- =============================================================================

-- =============================================================================
-- PART 1: Fix SECURITY DEFINER views → SECURITY INVOKER
-- =============================================================================

ALTER VIEW IF EXISTS agency_stats_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_accessible_sites SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_performance_by_site SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_daily_stats_live SET (security_invoker = true);
ALTER VIEW IF EXISTS club_daily_stats_live SET (security_invoker = true);
ALTER VIEW IF EXISTS pending_commands_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS sponsor_impressions_bridge SET (security_invoker = true);
ALTER VIEW IF EXISTS video_plays_visible SET (security_invoker = true);
ALTER VIEW IF EXISTS proof_stats_by_site SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_analytics_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS subscription_status_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS network_profile_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_stats_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS top_videos_by_site SET (security_invoker = true);
ALTER VIEW IF EXISTS advertiser_reports_view SET (security_invoker = true);
ALTER VIEW IF EXISTS club_reports_view SET (security_invoker = true);
ALTER VIEW IF EXISTS subscription_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS agency_accessible_sites SET (security_invoker = true);
ALTER VIEW IF EXISTS club_analytics_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS top_advertiser_videos SET (security_invoker = true);
ALTER VIEW IF EXISTS campaign_stats_live SET (security_invoker = true);

-- =============================================================================
-- PART 2: Enable RLS on unprotected tables
-- =============================================================================
-- The app connects as DB owner who bypasses RLS by default (PostgreSQL behavior).
-- These statements make the tables compliant with Supabase linter without
-- affecting existing application queries.
-- =============================================================================

ALTER TABLE IF EXISTS video_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS config_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orchestrated_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS analytics_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rls_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sponsor_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agency_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS advertiser_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recurring_schedule_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_suspension_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proof_of_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS config_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS safe_sprint_velocity ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS safe_story_status_override ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 3: Admin-bypass policies for newly protected tables
-- =============================================================================
-- Same pattern as enable-row-level-security.sql: admin gets full access,
-- and since these tables are backend-managed (no direct site/Pi access),
-- an admin-only policy is sufficient.
-- =============================================================================

-- Use DO block to create policies only if they don't already exist
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'video_variants', 'config_drafts', 'password_reset_tokens',
    'orchestrated_deployments', 'analytics_categories', 'schema_migrations',
    'campaigns', 'audit_logs', 'rls_audit_log', 'sponsor_access_tokens',
    'agencies', 'agency_sites', 'advertiser_sites', 'scheduled_reports',
    'recurring_schedules', 'recurring_schedule_executions', 'alert_thresholds',
    'subscription_suspension_reasons', 'subscription_history', 'generated_reports',
    'report_schedules', 'proof_of_broadcasts', 'config_profiles',
    'safe_sprint_velocity', 'safe_story_status_override'
  ];
  t TEXT;
  policy_name TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    policy_name := 'admin_' || t || '_all';

    -- Only create if the table exists and the policy doesn't
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = policy_name)
    THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (is_admin())',
        policy_name, t
      );
      RAISE NOTICE 'Created policy % on %', policy_name, t;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_rls_count INTEGER;
  v_invoker_count INTEGER;
BEGIN
  -- Count tables with RLS enabled
  SELECT COUNT(*) INTO v_rls_count
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;

  -- Count views with security_invoker
  SELECT COUNT(*) INTO v_invoker_count
  FROM pg_views v
  JOIN pg_class c ON c.relname = v.viewname AND c.relnamespace = 'public'::regnamespace
  WHERE v.schemaname = 'public'
    AND EXISTS (
      SELECT 1 FROM pg_options_to_table(c.reloptions)
      WHERE option_name = 'security_invoker' AND option_value = 'true'
    );

  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Supabase Security Linter Fix - Complete';
  RAISE NOTICE '  Tables with RLS enabled: %', v_rls_count;
  RAISE NOTICE '  Views with security_invoker: %', v_invoker_count;
  RAISE NOTICE '=============================================================================';
END $$;
