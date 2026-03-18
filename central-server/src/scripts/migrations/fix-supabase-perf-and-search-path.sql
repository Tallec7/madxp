-- =============================================================================
-- Fix Supabase WARN-level Advisors: search_path + duplicate index
-- =============================================================================
-- Resolves:
--   1. function_search_path_mutable (22 functions) — SECURITY WARN
--      Functions without explicit search_path are vulnerable to schema hijacking.
--      Fix: SET search_path = public on each function.
--
--   2. duplicate_index (1 index) — PERFORMANCE WARN
--      config_history has two identical indexes on (site_id, deployed_at DESC).
--      Fix: drop the duplicate.
--
-- NOT addressed (by design):
--   - multiple_permissive_policies (112 warnings): inherent to the multi-tenant
--     RLS pattern (admin + site policies). The backend bypasses RLS as DB owner,
--     so these policies have zero runtime cost for the application.
--   - auth_leaked_password_protection: Supabase Auth setting, not a SQL fix.
--
-- Date: 2026-03-18
-- =============================================================================

-- =============================================================================
-- PART 1: Fix mutable search_path on all 22 functions
-- =============================================================================

-- ALTER FUNCTION doesn't support IF EXISTS, so we use a DO block
-- to safely alter each function only if it exists.
DO $$
DECLARE
  funcs TEXT[][] := ARRAY[
    -- [function_name, argument_types]
    ARRAY['current_site_id', ''],
    ARRAY['is_admin', ''],
    ARRAY['current_user_id', ''],
    ARRAY['set_session_context', 'uuid, uuid, boolean'],
    ARRAY['reset_session_context', ''],
    ARRAY['audit_sensitive_access', ''],
    ARRAY['update_updated_at_column', ''],
    ARRAY['update_config_drafts_updated_at', ''],
    ARRAY['update_config_profiles_updated_at', ''],
    ARRAY['update_campaigns_updated_at', ''],
    ARRAY['update_scheduled_reports_updated_at', ''],
    ARRAY['update_recurring_schedule_timestamp', ''],
    ARRAY['get_scheduled_deployments_due', ''],
    ARRAY['cleanup_expired_pending_commands', ''],
    ARRAY['calculate_next_run', 'character varying, integer, integer, integer, integer, character varying'],
    ARRAY['calculate_daily_stats', 'uuid, date'],
    ARRAY['calculate_all_daily_stats', 'date'],
    ARRAY['calculate_advertiser_daily_stats', 'uuid, uuid, date'],
    ARRAY['calculate_all_advertiser_daily_stats', 'date'],
    ARRAY['is_advertiser_contract_active', 'uuid, uuid, date'],
    ARRAY['get_advertiser_active_sites', 'uuid, date'],
    ARRAY['get_site_active_advertisers', 'uuid, date']
  ];
  f TEXT[];
  func_oid OID;
BEGIN
  FOREACH f SLICE 1 IN ARRAY funcs LOOP
    -- Look up the function OID
    SELECT p.oid INTO func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = f[1]
    LIMIT 1;

    IF func_oid IS NOT NULL THEN
      IF f[2] = '' THEN
        EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public', f[1]);
      ELSE
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', f[1], f[2]);
      END IF;
      RAISE NOTICE 'Set search_path on %(%)', f[1], f[2];
    ELSE
      RAISE NOTICE 'Function % not found, skipping', f[1];
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- PART 2: Drop duplicate index on config_history
-- =============================================================================
-- idx_config_history_site and idx_config_history_site_deployed are identical:
-- both are btree (site_id, deployed_at DESC)

DROP INDEX IF EXISTS idx_config_history_site_deployed;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_mutable_count INTEGER;
BEGIN
  -- Count functions still missing search_path in public schema
  SELECT COUNT(*) INTO v_mutable_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS c
      WHERE c LIKE 'search_path=%'
    )
    AND p.prokind = 'f';

  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Search Path & Duplicate Index Fix - Complete';
  RAISE NOTICE '  Functions still without search_path in public schema: %', v_mutable_count;
  RAISE NOTICE '=============================================================================';
END $$;
