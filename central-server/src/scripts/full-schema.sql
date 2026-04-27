-- =============================================================================
-- NEOPRO Central - Schéma complet de la base de données
-- =============================================================================
-- Ce fichier est généré à partir de la prod Railway via pg_dump --schema-only.
-- Il sert à bootstraper une nouvelle DB (staging, dev local, onboarding).
--
-- Régénération :
--   /opt/homebrew/opt/postgresql@18/bin/pg_dump --schema-only --no-owner --no-acl \
--     "$PROD_DATABASE_URL" | sed -E '/^\\(restrict|unrestrict) /d' \
--     > central-server/src/scripts/full-schema.sql
--
-- Après bootstrap :
--   npm run db:migrate -- --mark-all-applied  # skipper les migrations déjà dans le schéma
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: audit_sensitive_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_sensitive_access() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: calculate_advertiser_daily_stats(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_advertiser_daily_stats(p_video_id uuid, p_site_id uuid, p_date date DEFAULT (CURRENT_DATE - '1 day'::interval)) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- ADR-035 Phase 4: No-op, table removed.
  RETURN;
END;
$$;


--
-- Name: calculate_all_advertiser_daily_stats(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_all_advertiser_daily_stats(p_date date DEFAULT (CURRENT_DATE - '1 day'::interval)) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- ADR-035 Phase 4: Table removed, view queries video_plays directly.
  -- This function is kept as a no-op for backward compatibility with cron scheduler.
  RETURN 0;
END;
$$;


--
-- Name: calculate_all_daily_stats(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_all_daily_stats(p_date date) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    v_site RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_site IN SELECT id FROM sites LOOP
        PERFORM calculate_daily_stats(v_site.id, p_date);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;


--
-- Name: calculate_daily_stats(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_daily_stats(p_site_id uuid, p_date date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    v_sessions_count INTEGER;
    v_screen_time INTEGER;
    v_videos_played INTEGER;
    v_manual_triggers INTEGER;
    v_auto_plays INTEGER;
    v_sponsor_plays INTEGER;
    v_jingle_plays INTEGER;
    v_ambiance_plays INTEGER;
    v_other_plays INTEGER;
    v_avg_cpu DECIMAL(5,2);
    v_avg_memory DECIMAL(5,2);
    v_avg_temperature DECIMAL(5,2);
    v_max_temperature DECIMAL(5,2);
    v_uptime_percent DECIMAL(5,2);
    v_incidents_count INTEGER;
BEGIN
    SELECT
        COUNT(DISTINCT session_id),
        COALESCE(SUM(duration_played), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE trigger_type = 'manual'),
        COUNT(*) FILTER (WHERE trigger_type = 'auto'),
        COUNT(*) FILTER (WHERE category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')),
        COUNT(*) FILTER (WHERE category = 'jingle'),
        COUNT(*) FILTER (WHERE category = 'ambiance'),
        COUNT(*) FILTER (WHERE category NOT IN ('sponsor', 'sponsor_local', 'sponsor_neopro', 'jingle', 'ambiance') OR category IS NULL)
    INTO
        v_sessions_count,
        v_screen_time,
        v_videos_played,
        v_manual_triggers,
        v_auto_plays,
        v_sponsor_plays,
        v_jingle_plays,
        v_ambiance_plays,
        v_other_plays
    FROM video_plays
    WHERE site_id = p_site_id
      AND played_at >= p_date
      AND played_at < p_date + INTERVAL '1 day';

    SELECT
        AVG(cpu_usage),
        AVG(memory_usage),
        AVG(temperature),
        MAX(temperature)
    INTO
        v_avg_cpu,
        v_avg_memory,
        v_avg_temperature,
        v_max_temperature
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    SELECT
        LEAST(100, (COUNT(*)::float / 2880.0 * 100))
    INTO v_uptime_percent
    FROM metrics
    WHERE site_id = p_site_id
      AND recorded_at >= p_date
      AND recorded_at < p_date + INTERVAL '1 day';

    SELECT COUNT(*)
    INTO v_incidents_count
    FROM alerts
    WHERE site_id = p_site_id
      AND created_at >= p_date
      AND created_at < p_date + INTERVAL '1 day';

    INSERT INTO club_daily_stats (
        site_id, date,
        sessions_count, screen_time_seconds, videos_played,
        manual_triggers, auto_plays,
        sponsor_plays, jingle_plays, ambiance_plays, other_plays,
        avg_cpu, avg_memory, avg_temperature, max_temperature,
        uptime_percent, incidents_count,
        calculated_at
    ) VALUES (
        p_site_id, p_date,
        v_sessions_count, v_screen_time, v_videos_played,
        v_manual_triggers, v_auto_plays,
        v_sponsor_plays, v_jingle_plays, v_ambiance_plays, v_other_plays,
        v_avg_cpu, v_avg_memory, v_avg_temperature, v_max_temperature,
        COALESCE(v_uptime_percent, 0), v_incidents_count,
        NOW()
    )
    ON CONFLICT (site_id, date) DO UPDATE SET
        sessions_count = EXCLUDED.sessions_count,
        screen_time_seconds = EXCLUDED.screen_time_seconds,
        videos_played = EXCLUDED.videos_played,
        manual_triggers = EXCLUDED.manual_triggers,
        auto_plays = EXCLUDED.auto_plays,
        sponsor_plays = EXCLUDED.sponsor_plays,
        jingle_plays = EXCLUDED.jingle_plays,
        ambiance_plays = EXCLUDED.ambiance_plays,
        other_plays = EXCLUDED.other_plays,
        avg_cpu = EXCLUDED.avg_cpu,
        avg_memory = EXCLUDED.avg_memory,
        avg_temperature = EXCLUDED.avg_temperature,
        max_temperature = EXCLUDED.max_temperature,
        uptime_percent = EXCLUDED.uptime_percent,
        incidents_count = EXCLUDED.incidents_count,
        calculated_at = NOW();
END;
$$;


--
-- Name: calculate_next_run(character varying, integer, integer, integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_next_run(p_frequency character varying, p_day_of_week integer, p_day_of_month integer, p_hour integer, p_minute integer, p_timezone character varying DEFAULT 'Europe/Paris'::character varying) RETURNS timestamp with time zone
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE;
    v_next TIMESTAMP WITH TIME ZONE;
    v_target_time TIME;
BEGIN
    v_now := NOW() AT TIME ZONE p_timezone;
    v_target_time := make_time(p_hour, p_minute, 0);

    CASE p_frequency
        WHEN 'daily' THEN
            -- Prochaine occurrence quotidienne
            v_next := date_trunc('day', v_now) + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 day';
            END IF;

        WHEN 'weekly' THEN
            -- Prochaine occurrence hebdomadaire
            v_next := date_trunc('week', v_now) + (p_day_of_week || ' days')::INTERVAL + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 week';
            END IF;

        WHEN 'monthly' THEN
            -- Prochaine occurrence mensuelle
            v_next := date_trunc('month', v_now) + ((p_day_of_month - 1) || ' days')::INTERVAL + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 month';
            END IF;

        ELSE
            -- Par défaut, demain à l'heure spécifiée
            v_next := date_trunc('day', v_now) + INTERVAL '1 day' + v_target_time;
    END CASE;

    RETURN v_next AT TIME ZONE p_timezone;
END;
$$;


--
-- Name: calculate_site_sponsor_daily_stats(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_site_sponsor_daily_stats(p_date date) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER := 0;
  v_orphans INTEGER := 0;
BEGIN
  -- Log orphelins avant insertion (audit)
  SELECT COUNT(*) INTO v_orphans
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND NOT EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id);

  IF v_orphans > 0 THEN
    RAISE NOTICE 'Skipped % orphan site_sponsor_id plays for date %', v_orphans, p_date;
  END IF;

  -- Parent table: aggregate by (site_sponsor_id, site_id), filtrant les orphelins
  INSERT INTO site_sponsor_daily_stats (
    site_sponsor_id, site_id, date,
    total_impressions, total_screen_time_seconds, completed_plays,
    estimated_reach, manual_triggers, active_videos,
    impressions_match, screen_time_match, completed_match,
    impressions_training, screen_time_training, completed_training,
    impressions_tournament, screen_time_tournament, completed_tournament,
    impressions_other, screen_time_other, completed_other,
    impressions_pre_match, screen_time_pre_match, completed_pre_match,
    impressions_halftime, screen_time_halftime, completed_halftime,
    impressions_post_match, screen_time_post_match, completed_post_match,
    impressions_loop, screen_time_loop, completed_loop,
    audience_estimate_match, sponsor_id,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate), 0),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COUNT(DISTINCT vp.video_filename),
    COUNT(*) FILTER (WHERE vp.event_type = 'match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'match'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.event_type = 'training'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'training'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'training' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.event_type = 'tournament'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE vp.event_type = 'tournament'), 0),
    SUM(CASE WHEN vp.completed AND vp.event_type = 'tournament' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament')), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(vp.event_type, 'other') NOT IN ('match', 'training', 'tournament') THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'pre_match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'halftime' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'post_match' THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'),
    COALESCE(SUM(vp.duration_played) FILTER (WHERE COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop'), 0),
    SUM(CASE WHEN vp.completed AND COALESCE(NULLIF(TRIM(vp.period), ''), 'loop') = 'loop' THEN 1 ELSE 0 END),
    COALESCE(SUM(vp.audience_estimate) FILTER (WHERE vp.event_type = 'match'), 0),
    (array_agg(vp.sponsor_id) FILTER (WHERE vp.sponsor_id IS NOT NULL))[1],
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
    -- Garde FK : skip les orphelins (sponsors supprimés)
    AND EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id)
  GROUP BY vp.site_sponsor_id, vp.site_id
  ON CONFLICT (site_sponsor_id, date) DO UPDATE SET
    total_impressions = EXCLUDED.total_impressions,
    total_screen_time_seconds = EXCLUDED.total_screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    estimated_reach = EXCLUDED.estimated_reach,
    manual_triggers = EXCLUDED.manual_triggers,
    active_videos = EXCLUDED.active_videos,
    impressions_match = EXCLUDED.impressions_match,
    screen_time_match = EXCLUDED.screen_time_match,
    completed_match = EXCLUDED.completed_match,
    impressions_training = EXCLUDED.impressions_training,
    screen_time_training = EXCLUDED.screen_time_training,
    completed_training = EXCLUDED.completed_training,
    impressions_tournament = EXCLUDED.impressions_tournament,
    screen_time_tournament = EXCLUDED.screen_time_tournament,
    completed_tournament = EXCLUDED.completed_tournament,
    impressions_other = EXCLUDED.impressions_other,
    screen_time_other = EXCLUDED.screen_time_other,
    completed_other = EXCLUDED.completed_other,
    impressions_pre_match = EXCLUDED.impressions_pre_match,
    screen_time_pre_match = EXCLUDED.screen_time_pre_match,
    completed_pre_match = EXCLUDED.completed_pre_match,
    impressions_halftime = EXCLUDED.impressions_halftime,
    screen_time_halftime = EXCLUDED.screen_time_halftime,
    completed_halftime = EXCLUDED.completed_halftime,
    impressions_post_match = EXCLUDED.impressions_post_match,
    screen_time_post_match = EXCLUDED.screen_time_post_match,
    completed_post_match = EXCLUDED.completed_post_match,
    impressions_loop = EXCLUDED.impressions_loop,
    screen_time_loop = EXCLUDED.screen_time_loop,
    completed_loop = EXCLUDED.completed_loop,
    audience_estimate_match = EXCLUDED.audience_estimate_match,
    sponsor_id = EXCLUDED.sponsor_id,
    calculated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Child table: per-video stats, même garde FK
  INSERT INTO site_sponsor_daily_video_stats (
    site_sponsor_id, site_id, date, video_filename,
    impressions, screen_time_seconds, completed_plays,
    manual_triggers, total_duration_played,
    calculated_at
  )
  SELECT
    vp.site_sponsor_id, vp.site_id, p_date, vp.video_filename,
    COUNT(*),
    COALESCE(SUM(vp.duration_played), 0),
    SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END),
    COUNT(*) FILTER (WHERE vp.trigger_type = 'manual'),
    COALESCE(SUM(vp.duration_played), 0),
    NOW()
  FROM video_plays vp
  WHERE vp.site_sponsor_id IS NOT NULL
    AND vp.category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')
    AND vp.played_at >= p_date
    AND vp.played_at < p_date + INTERVAL '1 day'
    AND (vp.tv_status IN ('on', 'unknown') OR vp.tv_status IS NULL)
    AND EXISTS (SELECT 1 FROM site_sponsors ss WHERE ss.id = vp.site_sponsor_id)
  GROUP BY vp.site_sponsor_id, vp.site_id, vp.video_filename
  ON CONFLICT (site_sponsor_id, date, video_filename) DO UPDATE SET
    impressions = EXCLUDED.impressions,
    screen_time_seconds = EXCLUDED.screen_time_seconds,
    completed_plays = EXCLUDED.completed_plays,
    manual_triggers = EXCLUDED.manual_triggers,
    total_duration_played = EXCLUDED.total_duration_played,
    calculated_at = NOW();

  RETURN v_count;
END;
$$;


--
-- Name: cleanup_expired_pending_commands(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_pending_commands() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM pending_commands
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: cleanup_expired_remote_command_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_remote_command_audit() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM remote_command_audit
  WHERE emitted_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: current_site_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_site_id() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT NULLIF(current_setting('app.current_site_id', true), '')::UUID;
$$;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$;


--
-- Name: get_advertiser_active_sites(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_advertiser_active_sites(p_advertiser_id uuid, p_check_date date DEFAULT CURRENT_DATE) RETURNS TABLE(site_id uuid)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT ads.site_id
  FROM advertiser_sites ads
  WHERE ads.advertiser_id = p_advertiser_id
    AND ads.is_active = true
    AND (ads.contract_start IS NULL OR ads.contract_start <= p_check_date)
    AND (ads.contract_end IS NULL OR ads.contract_end >= p_check_date);
END;
$$;


--
-- Name: get_scheduled_deployments_due(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_scheduled_deployments_due() RETURNS TABLE(deployment_type text, deployment_id uuid, scheduled_at timestamp without time zone)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Deploiements de contenu planifies et dus
  RETURN QUERY
  SELECT
    'content'::TEXT as deployment_type,
    cd.id as deployment_id,
    cd.scheduled_at
  FROM content_deployments cd
  WHERE cd.status = 'scheduled'
    AND cd.scheduled_at IS NOT NULL
    AND cd.scheduled_at <= NOW()
  UNION ALL
  -- Deploiements de mise a jour planifies et dus
  SELECT
    'update'::TEXT as deployment_type,
    ud.id as deployment_id,
    ud.scheduled_at
  FROM update_deployments ud
  WHERE ud.status = 'scheduled'
    AND ud.scheduled_at IS NOT NULL
    AND ud.scheduled_at <= NOW()
  ORDER BY scheduled_at ASC;
END;
$$;


--
-- Name: get_site_active_advertisers(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_site_active_advertisers(p_site_id uuid, p_check_date date DEFAULT CURRENT_DATE) RETURNS TABLE(advertiser_id uuid)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT ads.advertiser_id
  FROM advertiser_sites ads
  WHERE ads.site_id = p_site_id
    AND ads.is_active = true
    AND (ads.contract_start IS NULL OR ads.contract_start <= p_check_date)
    AND (ads.contract_end IS NULL OR ads.contract_end >= p_check_date);
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    current_setting('app.is_admin', true)::boolean,
    false
  );
$$;


--
-- Name: is_advertiser_contract_active(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_advertiser_contract_active(p_advertiser_id uuid, p_site_id uuid, p_check_date date DEFAULT CURRENT_DATE) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: neopro_templates_snapshot_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.neopro_templates_snapshot_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO neopro_template_versions
      (template_id, props_schema, default_props, snapshot_reason, created_by)
    VALUES
      (NEW.id, NEW.props_schema, NEW.default_props, 'initial', NEW.created_by);
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE')
     AND (OLD.props_schema::text IS DISTINCT FROM NEW.props_schema::text
          OR OLD.default_props::text IS DISTINCT FROM NEW.default_props::text)
  THEN
    INSERT INTO neopro_template_versions
      (template_id, props_schema, default_props, snapshot_reason, created_by)
    VALUES
      (NEW.id, OLD.props_schema, OLD.default_props, 'pre-update', NULL);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: remotion_render_jobs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remotion_render_jobs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: reset_session_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_session_context() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.current_site_id', '', false);
  PERFORM set_config('app.current_user_id', '', false);
  PERFORM set_config('app.is_admin', 'false', false);
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_session_context(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_session_context(p_site_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_is_admin boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_site_id IS NOT NULL THEN
    PERFORM set_config('app.current_site_id', p_site_id::text, false);
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
  END IF;

  PERFORM set_config('app.is_admin', p_is_admin::text, false);
END;
$$;


--
-- Name: update_campaigns_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_campaigns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_config_drafts_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_config_drafts_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_config_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_config_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_recurring_schedule_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recurring_schedule_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_scheduled_reports_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_scheduled_reports_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: advertiser_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertiser_sites (
    advertiser_id uuid NOT NULL,
    site_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT now(),
    contract_start date,
    contract_end date,
    is_active boolean DEFAULT true
);

ALTER TABLE ONLY public.advertiser_sites FORCE ROW LEVEL SECURITY;


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_name character varying(255) NOT NULL,
    club_name character varying(255) NOT NULL,
    location jsonb,
    sports jsonb,
    status character varying(50) DEFAULT 'offline'::character varying,
    last_seen_at timestamp without time zone,
    software_version character varying(50),
    hardware_model character varying(100) DEFAULT 'Raspberry Pi 4'::character varying,
    api_key character varying(255) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    local_config_mirror jsonb,
    local_config_hash character varying(64),
    last_config_sync timestamp with time zone,
    last_ip character varying(45),
    local_ip character varying(45),
    is_critical boolean DEFAULT false,
    pending_config_version_id uuid,
    live_score_enabled boolean DEFAULT false,
    network_profile jsonb,
    network_profile_updated_at timestamp with time zone,
    config_update_pending_until timestamp with time zone,
    subscription_start date,
    subscription_end date,
    subscription_plan character varying(50) DEFAULT 'standard'::character varying,
    suspended boolean DEFAULT false,
    suspension_reason character varying(50),
    suspension_date timestamp with time zone,
    suspension_note text,
    remote_pin_hash character varying(64) DEFAULT NULL::character varying,
    active_profile_id uuid,
    avg_spectators integer,
    logo_url text,
    color_primary character varying(7) DEFAULT NULL::character varying,
    color_secondary character varying(7) DEFAULT NULL::character varying,
    secondary_display_enabled boolean DEFAULT false,
    secondary_display_resolution character varying(20) DEFAULT NULL::character varying,
    site_type character varying(20) DEFAULT 'pi'::character varying,
    feature_overrides jsonb DEFAULT '{}'::jsonb,
    displays jsonb,
    wifi_psk_encrypted bytea,
    wifi_psk_iv bytea,
    wifi_psk_auth_tag bytea,
    wifi_ssid character varying(32),
    psk_rotated_at timestamp with time zone,
    CONSTRAINT check_status CHECK (((status)::text = ANY (ARRAY[('online'::character varying)::text, ('offline'::character varying)::text, ('maintenance'::character varying)::text, ('error'::character varying)::text]))),
    CONSTRAINT sites_site_type_check CHECK (((site_type)::text = ANY (ARRAY[('pi'::character varying)::text, ('saas'::character varying)::text, ('demo'::character varying)::text]))),
    CONSTRAINT sites_subscription_plan_tier_check CHECK (((subscription_plan IS NULL) OR ((subscription_plan)::text = ANY (ARRAY[('trial'::character varying)::text, ('standard'::character varying)::text, ('premium'::character varying)::text, ('play'::character varying)::text, ('club'::character varying)::text, ('pro'::character varying)::text]))))
);


--
-- Name: COLUMN sites.wifi_psk_encrypted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sites.wifi_psk_encrypted IS 'ADR-074: hotspot PSK ciphertext (AES-256-GCM). NULL = Pi still on legacy local source, will bootstrap at next sync.';


--
-- Name: COLUMN sites.wifi_psk_iv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sites.wifi_psk_iv IS 'ADR-074: 12-byte IV for AES-GCM decryption.';


--
-- Name: COLUMN sites.wifi_psk_auth_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sites.wifi_psk_auth_tag IS 'ADR-074: 16-byte GCM auth tag.';


--
-- Name: COLUMN sites.wifi_ssid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sites.wifi_ssid IS 'ADR-074: hotspot SSID (NEOPRO-<CLUB>). Max 32 chars per 802.11 spec.';


--
-- Name: COLUMN sites.psk_rotated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sites.psk_rotated_at IS 'When the Pi hotspot PSK was last rotated (ADR-073). NULL = legacy shared PSK, needs migration.';


--
-- Name: advertiser_accessible_sites; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_accessible_sites WITH (security_invoker='true') AS
 SELECT ads.advertiser_id,
    s.id AS site_id,
    s.site_name,
    s.club_name,
    s.location,
    s.status,
    s.last_seen_at,
    ads.contract_start,
    ads.contract_end,
    ads.is_active,
        CASE
            WHEN (NOT ads.is_active) THEN 'inactive'::text
            WHEN ((ads.contract_start IS NOT NULL) AND (ads.contract_start > CURRENT_DATE)) THEN 'pending'::text
            WHEN ((ads.contract_end IS NOT NULL) AND (ads.contract_end < CURRENT_DATE)) THEN 'expired'::text
            ELSE 'active'::text
        END AS contract_status,
        CASE
            WHEN ((ads.contract_end IS NOT NULL) AND (ads.contract_end >= CURRENT_DATE)) THEN (ads.contract_end - CURRENT_DATE)
            ELSE NULL::integer
        END AS days_remaining
   FROM (public.advertiser_sites ads
     JOIN public.sites s ON ((s.id = ads.site_id)));


--
-- Name: advertisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertisers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    logo_url character varying(500),
    contact_email character varying(255),
    contact_name character varying(255),
    contact_phone character varying(50),
    status character varying(50) DEFAULT 'active'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_advertiser_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('paused'::character varying)::text])))
);


--
-- Name: video_plays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_plays (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    session_id uuid,
    video_filename character varying(255) NOT NULL,
    category character varying(50),
    played_at timestamp without time zone NOT NULL,
    duration_played integer,
    video_duration integer,
    completed boolean DEFAULT false,
    trigger_type character varying(20) DEFAULT 'auto'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    video_id uuid,
    sponsor_id uuid,
    tv_status character varying(20) DEFAULT 'unknown'::character varying,
    campaign_id uuid,
    event_type character varying(50),
    period character varying(50),
    audience_estimate integer,
    position_in_loop integer,
    site_sponsor_id uuid,
    source character varying(10) DEFAULT NULL::character varying,
    interruption_reason character varying(30) DEFAULT NULL::character varying,
    content_type character varying(20) DEFAULT 'video'::character varying NOT NULL,
    CONSTRAINT check_trigger_type CHECK (((trigger_type)::text = ANY (ARRAY[('auto'::character varying)::text, ('manual'::character varying)::text]))),
    CONSTRAINT video_plays_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['video'::character varying, 'web_page'::character varying, 'livestream'::character varying])::text[])))
);


--
-- Name: advertiser_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_analytics_summary WITH (security_invoker='true') AS
 SELECT a.id AS advertiser_id,
    a.name AS advertiser_name,
    count(DISTINCT vp.site_id) AS sites_reached,
    count(vp.id) AS total_impressions,
    COALESCE(sum(vp.duration_played), (0)::bigint) AS total_duration
   FROM (public.advertisers a
     LEFT JOIN public.video_plays vp ON (((vp.sponsor_id = a.id) AND ((vp.category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text])))))
  GROUP BY a.id, a.name;


--
-- Name: advertiser_daily_stats_live; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_daily_stats_live WITH (security_invoker='true') AS
 SELECT video_id,
    site_id,
    date(played_at) AS date,
    count(*) AS total_impressions,
    sum(duration_played) AS total_screen_time,
    round(avg(
        CASE
            WHEN (video_duration > 0) THEN (LEAST(((duration_played)::numeric / (video_duration)::numeric), 1.0) * (100)::numeric)
            ELSE (0)::numeric
        END), 1) AS completion_rate,
    sponsor_id AS advertiser_id
   FROM public.video_plays vp
  WHERE (((category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text])) AND (video_id IS NOT NULL))
  GROUP BY video_id, site_id, (date(played_at)), sponsor_id;


--
-- Name: advertiser_performance_by_site; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_performance_by_site WITH (security_invoker='true') AS
 SELECT vp.sponsor_id AS advertiser_id,
    vp.site_id,
    s.site_name,
    s.club_name,
    count(vp.id) AS impressions_count,
    COALESCE(sum(vp.duration_played), (0)::bigint) AS total_duration
   FROM (public.video_plays vp
     JOIN public.sites s ON ((s.id = vp.site_id)))
  WHERE ((vp.category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text]))
  GROUP BY vp.sponsor_id, vp.site_id, s.site_name, s.club_name;


--
-- Name: generated_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_type character varying(20) NOT NULL,
    site_id uuid,
    advertiser_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_label character varying(50) NOT NULL,
    storage_path character varying(500) NOT NULL,
    storage_url character varying(1000),
    file_size_bytes integer,
    checksum character varying(64),
    summary_data jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    generated_by character varying(50) DEFAULT 'cron'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    site_sponsor_id uuid,
    CONSTRAINT chk_one_entity CHECK (((((report_type)::text = 'club'::text) AND (site_id IS NOT NULL) AND (advertiser_id IS NULL) AND (site_sponsor_id IS NULL)) OR (((report_type)::text = 'advertiser'::text) AND (advertiser_id IS NOT NULL) AND (site_id IS NULL) AND (site_sponsor_id IS NULL)) OR (((report_type)::text = 'fleet'::text) AND (site_id IS NULL) AND (advertiser_id IS NULL) AND (site_sponsor_id IS NULL)) OR (((report_type)::text = 'site_sponsor'::text) AND (site_sponsor_id IS NOT NULL)))),
    CONSTRAINT generated_reports_report_type_check CHECK (((report_type)::text = ANY (ARRAY[('club'::character varying)::text, ('advertiser'::character varying)::text, ('fleet'::character varying)::text, ('site_sponsor'::character varying)::text]))),
    CONSTRAINT generated_reports_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('generating'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])))
);

ALTER TABLE ONLY public.generated_reports FORCE ROW LEVEL SECURITY;


--
-- Name: advertiser_reports_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_reports_view WITH (security_invoker='true') AS
 SELECT r.id,
    r.report_type,
    r.site_id,
    r.advertiser_id,
    r.period_start,
    r.period_end,
    r.period_label,
    r.storage_path,
    r.storage_url,
    r.file_size_bytes,
    r.checksum,
    r.summary_data,
    r.status,
    r.error_message,
    r.generated_by,
    r.created_at,
    r.completed_at,
    a.name AS advertiser_name
   FROM (public.generated_reports r
     JOIN public.advertisers a ON ((r.advertiser_id = a.id)))
  WHERE ((r.report_type)::text = 'advertiser'::text);


--
-- Name: advertiser_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advertiser_videos (
    advertiser_id uuid NOT NULL,
    video_id uuid NOT NULL,
    is_primary boolean DEFAULT true,
    added_at timestamp without time zone DEFAULT now()
);


--
-- Name: advertiser_stats_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_stats_summary WITH (security_invoker='true') AS
 SELECT a.id AS advertiser_id,
    a.name,
    a.status,
    count(DISTINCT av.video_id) AS video_count,
    count(DISTINCT vp.site_id) AS sites_count,
    count(vp.id) AS total_impressions
   FROM ((public.advertisers a
     LEFT JOIN public.advertiser_videos av ON ((av.advertiser_id = a.id)))
     LEFT JOIN public.video_plays vp ON (((vp.sponsor_id = a.id) AND ((vp.category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text])))))
  GROUP BY a.id, a.name, a.status;


--
-- Name: agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agencies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    logo_url character varying(500),
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    address jsonb,
    status character varying(50) DEFAULT 'active'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_agency_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text])))
);

ALTER TABLE ONLY public.agencies FORCE ROW LEVEL SECURITY;


--
-- Name: agency_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_sites (
    agency_id uuid NOT NULL,
    site_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT now(),
    added_by uuid
);

ALTER TABLE ONLY public.agency_sites FORCE ROW LEVEL SECURITY;


--
-- Name: agency_accessible_sites; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.agency_accessible_sites WITH (security_invoker='true') AS
 SELECT as2.agency_id,
    s.id AS site_id,
    s.site_name,
    s.club_name,
    s.location,
    s.status,
    s.last_seen_at,
    s.software_version
   FROM (public.agency_sites as2
     JOIN public.sites s ON ((s.id = as2.site_id)));


--
-- Name: club_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_daily_stats (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    date date NOT NULL,
    sessions_count integer DEFAULT 0,
    screen_time_seconds integer DEFAULT 0,
    videos_played integer DEFAULT 0,
    manual_triggers integer DEFAULT 0,
    auto_plays integer DEFAULT 0,
    sponsor_plays integer DEFAULT 0,
    jingle_plays integer DEFAULT 0,
    ambiance_plays integer DEFAULT 0,
    other_plays integer DEFAULT 0,
    avg_cpu numeric(5,2),
    avg_memory numeric(5,2),
    avg_temperature numeric(5,2),
    max_temperature numeric(5,2),
    uptime_percent numeric(5,2),
    incidents_count integer DEFAULT 0,
    calculated_at timestamp without time zone DEFAULT now()
);


--
-- Name: agency_stats_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.agency_stats_summary WITH (security_invoker='true') AS
 SELECT a.id AS agency_id,
    a.name AS agency_name,
    count(DISTINCT as2.site_id) AS total_sites,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'online'::text) THEN s.id
            ELSE NULL::uuid
        END) AS online_sites,
    count(DISTINCT
        CASE
            WHEN ((s.status)::text = 'offline'::text) THEN s.id
            ELSE NULL::uuid
        END) AS offline_sites,
    COALESCE(sum(cds.videos_played), (0)::bigint) AS total_videos_played_30d,
    COALESCE(sum(cds.screen_time_seconds), (0)::bigint) AS total_screen_time_30d
   FROM (((public.agencies a
     LEFT JOIN public.agency_sites as2 ON ((as2.agency_id = a.id)))
     LEFT JOIN public.sites s ON ((s.id = as2.site_id)))
     LEFT JOIN public.club_daily_stats cds ON (((cds.site_id = s.id) AND (cds.date >= (CURRENT_DATE - '30 days'::interval)))))
  GROUP BY a.id, a.name;


--
-- Name: alert_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    metric character varying(50) NOT NULL,
    condition character varying(10) NOT NULL,
    warning_value numeric NOT NULL,
    critical_value numeric NOT NULL,
    duration integer DEFAULT 0,
    enabled boolean DEFAULT true,
    cooldown_minutes integer DEFAULT 15,
    escalate_after_minutes integer DEFAULT 60,
    notify_channels jsonb DEFAULT '["email"]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    resolved_at timestamp without time zone,
    CONSTRAINT check_severity CHECK (((severity)::text = ANY (ARRAY[('info'::character varying)::text, ('warning'::character varying)::text, ('critical'::character varying)::text]))),
    CONSTRAINT check_status_alert CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('acknowledged'::character varying)::text, ('resolved'::character varying)::text])))
);


--
-- Name: analytics_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_categories (
    id character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    color character varying(7),
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action character varying(100) NOT NULL,
    user_id uuid,
    target_type character varying(50),
    target_id character varying(100),
    details jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_sites (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    site_id uuid NOT NULL,
    deployment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    deployed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_deployment_status CHECK (((deployment_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('deployed'::character varying)::text, ('failed'::character varying)::text, ('removed'::character varying)::text])))
);

ALTER TABLE ONLY public.campaign_sites FORCE ROW LEVEL SECURITY;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    advertiser_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    target_impressions integer,
    target_sites uuid[],
    campaign_type character varying(50) DEFAULT 'standard'::character varying NOT NULL,
    variant_config jsonb,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    target_criteria jsonb,
    budget_cents integer,
    target_cpm_cents integer,
    CONSTRAINT check_campaign_dates CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT check_campaign_status CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('active'::character varying)::text, ('paused'::character varying)::text, ('completed'::character varying)::text, ('archived'::character varying)::text]))),
    CONSTRAINT check_campaign_type CHECK (((campaign_type)::text = ANY (ARRAY[('standard'::character varying)::text, ('regional'::character varying)::text, ('ab_test'::character varying)::text]))),
    CONSTRAINT check_target_impressions_positive CHECK (((target_impressions IS NULL) OR (target_impressions > 0)))
);

ALTER TABLE ONLY public.campaigns FORCE ROW LEVEL SECURITY;


--
-- Name: campaign_stats_live; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_stats_live WITH (security_invoker='true') AS
 SELECT c.id AS campaign_id,
    c.advertiser_id,
    c.name AS campaign_name,
    c.status,
    c.target_impressions,
    c.budget_cents,
    c.target_cpm_cents,
    c.start_date,
    c.end_date,
    COALESCE(stats.total_impressions, (0)::bigint) AS total_impressions,
    COALESCE(stats.total_screen_time_seconds, (0)::bigint) AS total_screen_time_seconds,
    COALESCE(stats.avg_completion_rate, (0)::numeric) AS avg_completion_rate,
    COALESCE(stats.active_sites, (0)::bigint) AS active_sites,
    COALESCE(stats.unique_videos, (0)::bigint) AS unique_videos,
        CASE
            WHEN ((c.target_impressions IS NOT NULL) AND (c.target_impressions > 0)) THEN round((((COALESCE(stats.total_impressions, (0)::bigint))::numeric / (c.target_impressions)::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS progress_percent,
        CASE
            WHEN ((COALESCE(stats.total_impressions, (0)::bigint) > 0) AND (c.budget_cents IS NOT NULL)) THEN round(((c.budget_cents)::numeric / ((COALESCE(stats.total_impressions, (0)::bigint))::numeric / 1000.0)), 2)
            ELSE NULL::numeric
        END AS effective_cpm_cents
   FROM (public.campaigns c
     LEFT JOIN LATERAL ( SELECT count(*) AS total_impressions,
            COALESCE(sum(vp.duration_played), (0)::bigint) AS total_screen_time_seconds,
            round((avg(
                CASE
                    WHEN (vp.video_duration > 0) THEN LEAST(((vp.duration_played)::numeric / (vp.video_duration)::numeric), (1)::numeric)
                    ELSE (0)::numeric
                END) * (100)::numeric), 1) AS avg_completion_rate,
            count(DISTINCT vp.site_id) AS active_sites,
            count(DISTINCT vp.video_id) AS unique_videos
           FROM public.video_plays vp
          WHERE (vp.campaign_id = c.id)) stats ON (true));


--
-- Name: campaign_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_videos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    campaign_id uuid NOT NULL,
    video_id uuid NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_campaign_video_weight CHECK ((weight > 0))
);

ALTER TABLE ONLY public.campaign_videos FORCE ROW LEVEL SECURITY;


--
-- Name: club_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.club_analytics_summary WITH (security_invoker='true') AS
 SELECT s.id AS site_id,
    s.site_name,
    s.club_name,
    s.status,
    s.last_seen_at,
    COALESCE(sum(cds.sessions_count) FILTER (WHERE (cds.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))), (0)::bigint) AS sessions_this_month,
    COALESCE(sum(cds.screen_time_seconds) FILTER (WHERE (cds.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))), (0)::bigint) AS screen_time_this_month,
    COALESCE(sum(cds.videos_played) FILTER (WHERE (cds.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))), (0)::bigint) AS videos_this_month,
    count(DISTINCT cds.date) FILTER (WHERE (cds.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))) AS active_days_this_month,
    COALESCE(sum(cds.sessions_count) FILTER (WHERE ((cds.date >= (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval)) AND (cds.date < date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))), (0)::bigint) AS sessions_last_month,
    COALESCE(sum(cds.screen_time_seconds) FILTER (WHERE ((cds.date >= (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval)) AND (cds.date < date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))), (0)::bigint) AS screen_time_last_month,
    COALESCE(sum(cds.videos_played) FILTER (WHERE ((cds.date >= (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval)) AND (cds.date < date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))), (0)::bigint) AS videos_last_month,
    COALESCE(sum(cds.sessions_count), (0)::bigint) AS total_sessions,
    COALESCE(sum(cds.videos_played), (0)::bigint) AS total_videos_played,
    count(DISTINCT cds.date) AS total_active_days
   FROM (public.sites s
     LEFT JOIN public.club_daily_stats cds ON ((cds.site_id = s.id)))
  GROUP BY s.id, s.site_name, s.club_name, s.status, s.last_seen_at;


--
-- Name: club_daily_stats_live; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.club_daily_stats_live WITH (security_invoker='true') AS
 SELECT club_daily_stats.id,
    club_daily_stats.site_id,
    club_daily_stats.date,
    club_daily_stats.sessions_count,
    club_daily_stats.screen_time_seconds,
    club_daily_stats.videos_played,
    club_daily_stats.manual_triggers,
    club_daily_stats.auto_plays,
    club_daily_stats.sponsor_plays,
    club_daily_stats.jingle_plays,
    club_daily_stats.ambiance_plays,
    club_daily_stats.other_plays,
    club_daily_stats.avg_cpu,
    club_daily_stats.avg_memory,
    club_daily_stats.avg_temperature,
    club_daily_stats.max_temperature,
    club_daily_stats.uptime_percent,
    club_daily_stats.incidents_count,
    club_daily_stats.calculated_at
   FROM public.club_daily_stats
  WHERE (club_daily_stats.date < CURRENT_DATE)
UNION ALL
 SELECT NULL::uuid AS id,
    vp.site_id,
    CURRENT_DATE AS date,
    (count(DISTINCT vp.session_id))::integer AS sessions_count,
    (COALESCE(sum(vp.duration_played), (0)::bigint))::integer AS screen_time_seconds,
    (count(*))::integer AS videos_played,
    (count(*) FILTER (WHERE ((vp.trigger_type)::text = 'manual'::text)))::integer AS manual_triggers,
    (count(*) FILTER (WHERE ((vp.trigger_type)::text = 'auto'::text)))::integer AS auto_plays,
    (count(*) FILTER (WHERE ((vp.category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text]))))::integer AS sponsor_plays,
    (count(*) FILTER (WHERE ((vp.category)::text = 'jingle'::text)))::integer AS jingle_plays,
    (count(*) FILTER (WHERE ((vp.category)::text = 'ambiance'::text)))::integer AS ambiance_plays,
    (count(*) FILTER (WHERE (((vp.category)::text <> ALL (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text, ('jingle'::character varying)::text, ('ambiance'::character varying)::text])) OR (vp.category IS NULL))))::integer AS other_plays,
    NULL::numeric(5,2) AS avg_cpu,
    NULL::numeric(5,2) AS avg_memory,
    NULL::numeric(5,2) AS avg_temperature,
    NULL::numeric(5,2) AS max_temperature,
    NULL::numeric(5,2) AS uptime_percent,
    0 AS incidents_count,
    now() AS calculated_at
   FROM public.video_plays vp
  WHERE ((vp.played_at >= CURRENT_DATE) AND (vp.played_at < (CURRENT_DATE + '1 day'::interval)))
  GROUP BY vp.site_id
 HAVING (count(*) > 0);


--
-- Name: club_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_permissions (
    site_id uuid NOT NULL,
    permission text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: club_reports_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.club_reports_view WITH (security_invoker='true') AS
 SELECT r.id,
    r.report_type,
    r.site_id,
    r.advertiser_id,
    r.period_start,
    r.period_end,
    r.period_label,
    r.storage_path,
    r.storage_url,
    r.file_size_bytes,
    r.checksum,
    r.summary_data,
    r.status,
    r.error_message,
    r.generated_by,
    r.created_at,
    r.completed_at,
    s.site_name,
    s.club_name
   FROM (public.generated_reports r
     JOIN public.sites s ON ((r.site_id = s.id)))
  WHERE ((r.report_type)::text = 'club'::text);


--
-- Name: club_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    started_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone,
    duration_seconds integer,
    videos_played integer DEFAULT 0,
    manual_triggers integer DEFAULT 0,
    auto_plays integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    match_date date,
    match_name character varying(255),
    audience_estimate integer,
    home_team character varying(100),
    away_team character varying(100),
    home_score integer,
    away_score integer,
    profile_id uuid,
    event_type character varying(50) DEFAULT 'match'::character varying,
    ended_by character varying(50)
);


--
-- Name: config_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_drafts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    name character varying(255) DEFAULT 'Brouillon'::character varying NOT NULL,
    configuration jsonb NOT NULL,
    referenced_video_ids uuid[] DEFAULT '{}'::uuid[],
    status character varying(50) DEFAULT 'draft'::character varying,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_draft_status CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('deploying'::character varying)::text, ('deployed'::character varying)::text, ('failed'::character varying)::text])))
);

ALTER TABLE ONLY public.config_drafts FORCE ROW LEVEL SECURITY;


--
-- Name: config_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    configuration jsonb NOT NULL,
    deployed_by uuid,
    deployed_at timestamp without time zone DEFAULT now(),
    comment text,
    previous_version_id uuid,
    changes_summary jsonb,
    profile_id uuid
);


--
-- Name: config_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    display_name character varying(255),
    city character varying(255),
    sport character varying(100),
    sort_order integer DEFAULT 0,
    is_default boolean DEFAULT false,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    remote_pin_required boolean DEFAULT false NOT NULL,
    remote_pin_hash character varying(255) DEFAULT NULL::character varying,
    remote_pin_updated_at timestamp with time zone
);


--
-- Name: content_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_deployments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    video_id uuid,
    target_type character varying(50) NOT NULL,
    target_id uuid NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    error_message text,
    deployed_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    scheduled_at timestamp without time zone,
    scheduled_by uuid,
    orchestrated_deployment_id uuid,
    has_secondary_variant boolean DEFAULT false,
    deployed_path character varying(500),
    deployed_filename character varying(255),
    CONSTRAINT check_progress CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT check_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('scheduled'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT check_target_type CHECK (((target_type)::text = ANY (ARRAY[('site'::character varying)::text, ('group'::character varying)::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(50),
    filters jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_type CHECK (((type)::text = ANY (ARRAY[('sport'::character varying)::text, ('geography'::character varying)::text, ('version'::character varying)::text, ('custom'::character varying)::text])))
);


--
-- Name: hostapd_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostapd_events (
    id bigint NOT NULL,
    site_id uuid NOT NULL,
    event_type text NOT NULL,
    client_mac text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE hostapd_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hostapd_events IS 'ADR-072 OTA-2: hostapd_cli event stream (AP-STA-CONNECTED/DISCONNECTED/PSK-MISMATCH). Retention 30j.';


--
-- Name: hostapd_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hostapd_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hostapd_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hostapd_events_id_seq OWNED BY public.hostapd_events.id;


--
-- Name: metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metrics (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    cpu_usage double precision,
    memory_usage double precision,
    temperature double precision,
    disk_usage double precision,
    uptime bigint,
    network_status jsonb,
    recorded_at timestamp without time zone DEFAULT now(),
    fan_status jsonb
);


--
-- Name: connection_events; Type: TABLE; Schema: public; Owner: -
-- ADR-099: source de vérité de l'uptime, distincte de metrics (samples 5 min).
--

CREATE TABLE public.connection_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    event_type character varying(20) NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    reason character varying(100),
    socket_id character varying(64),
    client_ip character varying(45),
    CONSTRAINT connection_events_event_type_check
      CHECK (event_type IN ('connected', 'disconnected'))
);


--
-- Name: neopro_template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neopro_template_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    props_schema jsonb NOT NULL,
    default_props jsonb NOT NULL,
    snapshot_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: neopro_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neopro_templates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    composition_id character varying(100) NOT NULL,
    description text,
    props_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_props jsonb DEFAULT '{}'::jsonb NOT NULL,
    thumbnail_url character varying(500),
    published boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    schema_version integer DEFAULT 1 NOT NULL,
    duration_seconds numeric(6,2) DEFAULT 5.0 NOT NULL,
    fps integer DEFAULT 30 NOT NULL,
    site_id uuid,
    canvas_width integer DEFAULT 1920 NOT NULL,
    canvas_height integer DEFAULT 1080 NOT NULL
);


--
-- Name: COLUMN neopro_templates.schema_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.neopro_templates.schema_version IS 'ADR-075/086 : 1 = legacy (composition codée), 2 = data-driven (runtime générique). Joueur détaillé = premier template 100 % data-driven.';


--
-- Name: COLUMN neopro_templates.site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.neopro_templates.site_id IS 'ADR-075 V2 : NULL = template global (catalogue Neopro), UUID = template club perso (white-glove). Feature gate template_studio_club_scoped (Premium).';


--
-- Name: COLUMN neopro_templates.canvas_width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.neopro_templates.canvas_width IS 'ADR-075 : largeur canvas Remotion (px). Défaut 1920 (16:9 TV).';


--
-- Name: COLUMN neopro_templates.canvas_height; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.neopro_templates.canvas_height IS 'ADR-075 : hauteur canvas Remotion (px). Défaut 1080 (16:9 TV).';


--
-- Name: network_profile_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.network_profile_summary WITH (security_invoker='true') AS
 SELECT COALESCE((network_profile ->> 'type'::text), 'unknown'::text) AS profile_type,
    count(*) AS site_count,
    avg(((network_profile ->> 'apCount'::text))::integer) AS avg_ap_count,
    sum(
        CASE
            WHEN (((network_profile ->> 'bssidLocked'::text))::boolean = true) THEN 1
            ELSE 0
        END) AS bssid_locked_count
   FROM public.sites
  WHERE ((status)::text <> 'deleted'::text)
  GROUP BY COALESCE((network_profile ->> 'type'::text), 'unknown'::text)
  ORDER BY (count(*)) DESC;


--
-- Name: orchestrated_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestrated_deployments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    draft_id uuid,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_videos integer DEFAULT 0,
    videos_completed integer DEFAULT 0,
    videos_failed integer DEFAULT 0,
    config_deployed boolean DEFAULT false,
    error_message text,
    failed_video_ids uuid[] DEFAULT '{}'::uuid[],
    started_by uuid,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    configuration_snapshot jsonb,
    CONSTRAINT check_orch_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('deploying_videos'::character varying)::text, ('deploying_config'::character varying)::text, ('completed'::character varying)::text, ('partial_failure'::character varying)::text, ('failed'::character varying)::text])))
);

ALTER TABLE ONLY public.orchestrated_deployments FORCE ROW LEVEL SECURITY;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.password_reset_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: pending_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_commands (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    command_type character varying(100) NOT NULL,
    command_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority integer DEFAULT 5,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    attempts integer DEFAULT 0,
    last_attempt_at timestamp without time zone,
    max_attempts integer DEFAULT 3,
    description text,
    CONSTRAINT check_priority CHECK (((priority >= 1) AND (priority <= 10)))
);


--
-- Name: pending_commands_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pending_commands_summary WITH (security_invoker='true') AS
 SELECT s.id AS site_id,
    s.club_name,
    s.status AS site_status,
    count(pc.id) AS pending_count,
    min(pc.priority) AS highest_priority,
    min(pc.created_at) AS oldest_command,
    max(pc.created_at) AS newest_command,
    array_agg(DISTINCT pc.command_type) AS command_types
   FROM (public.sites s
     LEFT JOIN public.pending_commands pc ON ((pc.site_id = s.id)))
  GROUP BY s.id, s.club_name, s.status;


--
-- Name: profile_device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_device_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    site_id uuid NOT NULL,
    device_id character varying(255) NOT NULL,
    label character varying(255) DEFAULT NULL::character varying,
    token_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason character varying(255) DEFAULT NULL::character varying
);


--
-- Name: proof_of_broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proof_of_broadcasts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid NOT NULL,
    screenshot_url character varying(500) NOT NULL,
    storage_path character varying(500) NOT NULL,
    checksum character varying(64) NOT NULL,
    timestamp_captured timestamp with time zone NOT NULL,
    triggered_by character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_triggered_by CHECK (((triggered_by)::text = ANY (ARRAY[('manual'::character varying)::text, ('scheduled'::character varying)::text, ('command'::character varying)::text])))
);

ALTER TABLE ONLY public.proof_of_broadcasts FORCE ROW LEVEL SECURITY;


--
-- Name: proof_stats_by_site; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.proof_stats_by_site WITH (security_invoker='true') AS
 SELECT s.id AS site_id,
    s.site_name,
    s.club_name,
    count(p.id) AS total_proofs,
    max(p.timestamp_captured) AS last_proof_at,
    count(
        CASE
            WHEN (p.timestamp_captured >= (now() - '7 days'::interval)) THEN 1
            ELSE NULL::integer
        END) AS proofs_last_7_days,
    count(
        CASE
            WHEN (p.timestamp_captured >= (now() - '30 days'::interval)) THEN 1
            ELSE NULL::integer
        END) AS proofs_last_30_days
   FROM (public.sites s
     LEFT JOIN public.proof_of_broadcasts p ON ((s.id = p.site_id)))
  GROUP BY s.id, s.site_name, s.club_name;


--
-- Name: recurring_schedule_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_schedule_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    duration_ms integer,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    error_message text,
    result_summary jsonb,
    CONSTRAINT check_execution_status CHECK (((status)::text = ANY (ARRAY[('running'::character varying)::text, ('success'::character varying)::text, ('failed'::character varying)::text, ('skipped'::character varying)::text])))
);

ALTER TABLE ONLY public.recurring_schedule_executions FORCE ROW LEVEL SECURITY;


--
-- Name: recurring_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    task_type character varying(50) NOT NULL,
    cron_expression character varying(100),
    frequency character varying(20),
    day_of_week integer,
    day_of_month integer,
    hour integer DEFAULT 9,
    minute integer DEFAULT 0,
    timezone character varying(50) DEFAULT 'Europe/Paris'::character varying,
    task_config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    last_run_at timestamp with time zone,
    last_run_status character varying(20),
    last_run_error text,
    next_run_at timestamp with time zone,
    run_count integer DEFAULT 0,
    failure_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_day_of_month CHECK (((day_of_month IS NULL) OR ((day_of_month >= 1) AND (day_of_month <= 31)))),
    CONSTRAINT check_day_of_week CHECK (((day_of_week IS NULL) OR ((day_of_week >= 0) AND (day_of_week <= 6)))),
    CONSTRAINT check_frequency CHECK (((frequency IS NULL) OR ((frequency)::text = ANY (ARRAY[('daily'::character varying)::text, ('weekly'::character varying)::text, ('monthly'::character varying)::text])))),
    CONSTRAINT check_hour CHECK (((hour >= 0) AND (hour <= 23))),
    CONSTRAINT check_minute CHECK (((minute >= 0) AND (minute <= 59))),
    CONSTRAINT check_task_type CHECK (((task_type)::text = ANY (ARRAY[('report'::character varying)::text, ('cleanup'::character varying)::text, ('aggregation'::character varying)::text, ('backup'::character varying)::text, ('objective_check'::character varying)::text, ('pdf_report'::character varying)::text, ('match_session_autoclose'::character varying)::text])))
);

ALTER TABLE ONLY public.recurring_schedules FORCE ROW LEVEL SECURITY;


--
-- Name: remote_auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remote_auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id text NOT NULL,
    event_type text NOT NULL,
    client_version text NOT NULL,
    profile_id uuid,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT remote_auth_events_client_version_check CHECK ((client_version = ANY (ARRAY['v1'::text, 'v2'::text]))),
    CONSTRAINT remote_auth_events_event_type_check CHECK ((event_type = ANY (ARRAY['pin_verify'::text, 'token_use'::text, 'state_load'::text])))
);


--
-- Name: remote_command_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remote_command_audit (
    command_id uuid NOT NULL,
    site_id uuid NOT NULL,
    command_type character varying(50) NOT NULL,
    emitted_at timestamp without time zone DEFAULT now() NOT NULL,
    acked_at timestamp without time zone,
    status character varying(20) DEFAULT 'emitted'::character varying NOT NULL,
    latency_ms integer,
    room_size integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT check_status CHECK (((status)::text = ANY ((ARRAY['emitted'::character varying, 'acked'::character varying, 'dropped'::character varying, 'debounced'::character varying, 'unreachable'::character varying])::text[])))
);


--
-- Name: TABLE remote_command_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.remote_command_audit IS 'ADR-081 P0: Audit des commandes télécommande relayées (TTL 7j)';


--
-- Name: COLUMN remote_command_audit.command_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.remote_command_audit.command_id IS 'UUID généré par le remote avant émission';


--
-- Name: COLUMN remote_command_audit.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.remote_command_audit.status IS 'emitted, acked, dropped, debounced, unreachable';


--
-- Name: COLUMN remote_command_audit.latency_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.remote_command_audit.latency_ms IS 'Latence emit→ack (rempli en Phase 1+)';


--
-- Name: COLUMN remote_command_audit.room_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.remote_command_audit.room_size IS 'Nombre de sockets TV dans la room au moment du relay (0 = drop apparent)';


--
-- Name: remote_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remote_commands (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_id uuid,
    command_type character varying(100) NOT NULL,
    command_data jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    result jsonb,
    error_message text,
    executed_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    executed_at timestamp without time zone,
    completed_at timestamp without time zone,
    pending_command_id uuid,
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_status_command CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('executing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('timeout'::character varying)::text])))
);


--
-- Name: remotion_render_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remotion_render_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    props jsonb DEFAULT '{}'::jsonb NOT NULL,
    title text NOT NULL,
    requested_by uuid,
    requested_for_site_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    progress smallint DEFAULT 0 NOT NULL,
    phase text,
    video_id uuid,
    video_url text,
    file_size bigint,
    error_message text,
    claimed_by text,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT remotion_render_jobs_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT remotion_render_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: report_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_type character varying(20) NOT NULL,
    frequency character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    site_id uuid,
    advertiser_id uuid,
    enabled boolean DEFAULT true,
    include_certificate boolean DEFAULT true,
    send_email boolean DEFAULT false,
    email_recipients text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    CONSTRAINT chk_schedule_entity CHECK ((((site_id IS NOT NULL) AND (advertiser_id IS NULL)) OR ((site_id IS NULL) AND (advertiser_id IS NOT NULL)) OR ((site_id IS NULL) AND (advertiser_id IS NULL)))),
    CONSTRAINT report_schedules_frequency_check CHECK (((frequency)::text = ANY (ARRAY[('weekly'::character varying)::text, ('monthly'::character varying)::text, ('quarterly'::character varying)::text]))),
    CONSTRAINT report_schedules_report_type_check CHECK (((report_type)::text = ANY (ARRAY[('club'::character varying)::text, ('advertiser'::character varying)::text, ('fleet'::character varying)::text])))
);

ALTER TABLE ONLY public.report_schedules FORCE ROW LEVEL SECURITY;


--
-- Name: rls_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rls_audit_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    accessed_at timestamp without time zone DEFAULT now(),
    user_id uuid,
    site_id uuid,
    is_admin boolean,
    table_name character varying(100),
    operation character varying(20),
    row_id uuid,
    ip_address character varying(45)
);

ALTER TABLE ONLY public.rls_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: safe_proposal_status_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safe_proposal_status_override (
    id integer NOT NULL,
    proposal_id text NOT NULL,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT safe_proposal_status_override_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in-review'::text, 'approved'::text, 'implementing'::text, 'done'::text])))
);


--
-- Name: safe_proposal_status_override_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.safe_proposal_status_override_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: safe_proposal_status_override_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.safe_proposal_status_override_id_seq OWNED BY public.safe_proposal_status_override.id;


--
-- Name: safe_sprint_velocity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safe_sprint_velocity (
    id integer NOT NULL,
    sprint_id text NOT NULL,
    velocity numeric DEFAULT 0 NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.safe_sprint_velocity FORCE ROW LEVEL SECURITY;


--
-- Name: safe_sprint_velocity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.safe_sprint_velocity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: safe_sprint_velocity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.safe_sprint_velocity_id_seq OWNED BY public.safe_sprint_velocity.id;


--
-- Name: safe_story_status_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safe_story_status_override (
    id integer NOT NULL,
    story_id text NOT NULL,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT safe_story_status_override_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in-progress'::text, 'done'::text, 'removed'::text])))
);

ALTER TABLE ONLY public.safe_story_status_override FORCE ROW LEVEL SECURITY;


--
-- Name: safe_story_status_override_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.safe_story_status_override_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: safe_story_status_override_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.safe_story_status_override_id_seq OWNED BY public.safe_story_status_override.id;


--
-- Name: scheduled_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    advertiser_id uuid,
    campaign_id uuid,
    report_type character varying(50) DEFAULT 'advertiser'::character varying NOT NULL,
    frequency character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    next_send_at timestamp without time zone,
    last_sent_at timestamp without time zone,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_frequency CHECK (((frequency)::text = ANY (ARRAY[('weekly'::character varying)::text, ('biweekly'::character varying)::text, ('monthly'::character varying)::text, ('quarterly'::character varying)::text]))),
    CONSTRAINT check_recipients_not_empty CHECK (((array_length(recipients, 1) IS NOT NULL) OR (enabled = false))),
    CONSTRAINT check_report_type CHECK (((report_type)::text = ANY (ARRAY[('advertiser'::character varying)::text, ('campaign'::character varying)::text, ('club'::character varying)::text])))
);

ALTER TABLE ONLY public.scheduled_reports FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT now()
);


--
-- Name: site_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_groups (
    site_id uuid NOT NULL,
    group_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT now()
);


--
-- Name: site_sponsor_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_sponsor_daily_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_sponsor_id uuid NOT NULL,
    site_id uuid NOT NULL,
    date date NOT NULL,
    total_impressions integer DEFAULT 0,
    total_screen_time_seconds integer DEFAULT 0,
    completed_plays integer DEFAULT 0,
    estimated_reach integer DEFAULT 0,
    manual_triggers integer DEFAULT 0,
    active_videos integer DEFAULT 0,
    calculated_at timestamp with time zone DEFAULT now(),
    impressions_match integer DEFAULT 0,
    screen_time_match integer DEFAULT 0,
    completed_match integer DEFAULT 0,
    impressions_training integer DEFAULT 0,
    screen_time_training integer DEFAULT 0,
    completed_training integer DEFAULT 0,
    impressions_tournament integer DEFAULT 0,
    screen_time_tournament integer DEFAULT 0,
    completed_tournament integer DEFAULT 0,
    impressions_other integer DEFAULT 0,
    screen_time_other integer DEFAULT 0,
    completed_other integer DEFAULT 0,
    impressions_pre_match integer DEFAULT 0,
    screen_time_pre_match integer DEFAULT 0,
    completed_pre_match integer DEFAULT 0,
    impressions_halftime integer DEFAULT 0,
    screen_time_halftime integer DEFAULT 0,
    completed_halftime integer DEFAULT 0,
    impressions_post_match integer DEFAULT 0,
    screen_time_post_match integer DEFAULT 0,
    completed_post_match integer DEFAULT 0,
    impressions_loop integer DEFAULT 0,
    screen_time_loop integer DEFAULT 0,
    completed_loop integer DEFAULT 0,
    audience_estimate_match integer DEFAULT 0,
    sponsor_id uuid
);


--
-- Name: site_sponsor_daily_video_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_sponsor_daily_video_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_sponsor_id uuid NOT NULL,
    site_id uuid NOT NULL,
    date date NOT NULL,
    video_filename character varying(255) NOT NULL,
    impressions integer DEFAULT 0,
    screen_time_seconds integer DEFAULT 0,
    completed_plays integer DEFAULT 0,
    manual_triggers integer DEFAULT 0,
    total_duration_played integer DEFAULT 0,
    calculated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_sponsor_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_sponsor_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_sponsor_id uuid NOT NULL,
    video_id uuid,
    video_filename character varying(255) NOT NULL,
    is_primary boolean DEFAULT false,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_sponsors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_sponsors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    logo_url text,
    contract_amount numeric(10,2),
    contract_start date,
    contract_end date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_site_sponsor_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('expired'::character varying)::text, ('paused'::character varying)::text])))
);


--
-- Name: site_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_videos (
    site_id uuid NOT NULL,
    video_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    added_by uuid
);


--
-- Name: software_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.software_updates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    version character varying(50) NOT NULL,
    changelog text,
    package_url character varying(500),
    package_size bigint,
    checksum character varying(64),
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    description text,
    is_critical boolean DEFAULT false,
    upload_status character varying(20) DEFAULT 'ready'::character varying,
    upload_verified_at timestamp without time zone,
    upload_verified_size bigint,
    upload_error_message text,
    upload_retry_count integer DEFAULT 0,
    storage_backend character varying(20) DEFAULT 'ftp'::character varying,
    CONSTRAINT check_updates_storage_backend CHECK (((storage_backend)::text = ANY (ARRAY[('ftp'::character varying)::text, ('supabase'::character varying)::text, ('local'::character varying)::text]))),
    CONSTRAINT check_updates_upload_status CHECK (((upload_status)::text = ANY (ARRAY[('uploading'::character varying)::text, ('verifying'::character varying)::text, ('ready'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: sponsor_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsor_access_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_sponsor_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.sponsor_access_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: sponsor_impressions_bridge; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sponsor_impressions_bridge WITH (security_invoker='true') AS
 SELECT id,
    site_id,
    sponsor_id AS advertiser_id,
    video_id,
    video_filename,
    played_at,
    duration_played,
    video_duration,
    completed,
    event_type,
    period,
    trigger_type,
    position_in_loop,
    audience_estimate,
    site_sponsor_id,
    tv_status,
    interruption_reason
   FROM public.video_plays vp
  WHERE (((category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text])) AND (((tv_status)::text = ANY (ARRAY[('on'::character varying)::text, ('unknown'::character varying)::text])) OR (tv_status IS NULL)));


--
-- Name: subscription_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    reason character varying(50),
    previous_end_date date,
    new_end_date date,
    previous_plan character varying(50),
    new_plan character varying(50),
    note text,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.subscription_history FORCE ROW LEVEL SECURITY;


--
-- Name: subscription_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.subscription_stats WITH (security_invoker='true') AS
 SELECT count(*) FILTER (WHERE ((subscription_end > CURRENT_DATE) AND (suspended = false))) AS active_count,
    count(*) FILTER (WHERE ((subscription_end > CURRENT_DATE) AND (subscription_end < (CURRENT_DATE + '30 days'::interval)) AND (suspended = false))) AS expiring_soon_count,
    count(*) FILTER (WHERE ((subscription_end < CURRENT_DATE) AND (subscription_end >= (CURRENT_DATE - '7 days'::interval)) AND (suspended = false))) AS grace_period_count,
    count(*) FILTER (WHERE ((subscription_end < (CURRENT_DATE - '7 days'::interval)) OR (suspended = true))) AS blocked_count,
    count(*) FILTER (WHERE (suspended = true)) AS suspended_count,
    count(*) FILTER (WHERE ((subscription_plan)::text = 'trial'::text)) AS trial_count,
    count(*) FILTER (WHERE ((subscription_plan)::text = 'standard'::text)) AS standard_count,
    count(*) FILTER (WHERE ((subscription_plan)::text = 'premium'::text)) AS premium_count,
    count(*) AS total_count
   FROM public.sites;


--
-- Name: subscription_suspension_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_suspension_reasons (
    code character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description text,
    auto_unblock boolean DEFAULT false,
    message_remote text,
    message_tv text,
    severity character varying(20) DEFAULT 'error'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.subscription_suspension_reasons FORCE ROW LEVEL SECURITY;


--
-- Name: subscription_status_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.subscription_status_summary WITH (security_invoker='true') AS
 SELECT s.id,
    s.site_name,
    s.club_name,
    s.subscription_plan,
    s.subscription_start,
    s.subscription_end,
    s.suspended,
    s.suspension_reason,
    s.suspension_date,
    ssr.label AS suspension_label,
        CASE
            WHEN (s.suspended = true) THEN 'suspended'::text
            WHEN (s.subscription_end IS NULL) THEN 'no_subscription'::text
            WHEN (s.subscription_end < (CURRENT_DATE - '7 days'::interval)) THEN 'blocked'::text
            WHEN (s.subscription_end < CURRENT_DATE) THEN 'grace_period'::text
            WHEN (s.subscription_end < (CURRENT_DATE + '7 days'::interval)) THEN 'expiring_urgent'::text
            WHEN (s.subscription_end < (CURRENT_DATE + '30 days'::interval)) THEN 'expiring_soon'::text
            ELSE 'active'::text
        END AS subscription_status,
        CASE
            WHEN (s.subscription_end IS NOT NULL) THEN (s.subscription_end - CURRENT_DATE)
            ELSE NULL::integer
        END AS days_until_expiry
   FROM (public.sites s
     LEFT JOIN public.subscription_suspension_reasons ssr ON (((s.suspension_reason)::text = (ssr.code)::text)));


--
-- Name: template_image_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_image_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    slot_key character varying(64) NOT NULL,
    label character varying(200) NOT NULL,
    position_x numeric(5,4) NOT NULL,
    position_y numeric(5,4) NOT NULL,
    width numeric(5,4) NOT NULL,
    height numeric(5,4) NOT NULL,
    appear_at numeric(5,2) NOT NULL,
    appear_duration numeric(4,2) DEFAULT 0.4 NOT NULL,
    animation character varying(20) DEFAULT 'fade'::character varying NOT NULL,
    aspect_ratio character varying(16),
    required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    anchor character varying(16) DEFAULT 'center'::character varying NOT NULL,
    fit_mode character varying(32) DEFAULT 'contain'::character varying NOT NULL,
    safe_top_pct numeric(5,2),
    safe_left_pct numeric(5,2),
    safe_width_pct numeric(5,2),
    safe_height_pct numeric(5,2),
    overflow character varying(16) DEFAULT 'hidden'::character varying NOT NULL,
    animation_direction character varying(4) DEFAULT 'in'::character varying NOT NULL,
    layer_id uuid,
    scale_from numeric(5,3),
    scale_to numeric(5,3),
    CONSTRAINT template_image_slots_anchor_check CHECK (((anchor)::text = ANY ((ARRAY['top-left'::character varying, 'top-center'::character varying, 'top-right'::character varying, 'center-left'::character varying, 'center'::character varying, 'center-right'::character varying, 'bottom-left'::character varying, 'bottom-center'::character varying, 'bottom-right'::character varying])::text[]))),
    CONSTRAINT template_image_slots_animation_check CHECK (((animation)::text = ANY ((ARRAY['none'::character varying, 'fade'::character varying, 'slide-up'::character varying, 'slide-down'::character varying, 'scale-in'::character varying, 'blur-in'::character varying, 'zoom'::character varying, 'logo-pop'::character varying])::text[]))),
    CONSTRAINT template_image_slots_animation_direction_check CHECK (((animation_direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying])::text[]))),
    CONSTRAINT template_image_slots_fit_mode_check CHECK (((fit_mode)::text = ANY ((ARRAY['contain'::character varying, 'cover'::character varying, 'fill-width-anchor-top'::character varying, 'fill-height-anchor-left'::character varying])::text[]))),
    CONSTRAINT template_image_slots_height_check CHECK (((height >= (0)::numeric) AND (height <= (1)::numeric))),
    CONSTRAINT template_image_slots_overflow_check CHECK (((overflow)::text = ANY ((ARRAY['hidden'::character varying, 'visible'::character varying, 'top'::character varying, 'bottom'::character varying, 'left'::character varying, 'right'::character varying])::text[]))),
    CONSTRAINT template_image_slots_position_x_check CHECK (((position_x >= (0)::numeric) AND (position_x <= (1)::numeric))),
    CONSTRAINT template_image_slots_position_y_check CHECK (((position_y >= (0)::numeric) AND (position_y <= (1)::numeric))),
    CONSTRAINT template_image_slots_width_check CHECK (((width >= (0)::numeric) AND (width <= (1)::numeric)))
);


--
-- Name: TABLE template_image_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_image_slots IS 'ADR-075 : slots image éditables (position + dimensions + timing)';


--
-- Name: template_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    video_url text NOT NULL,
    z_index integer NOT NULL,
    mask_top numeric(4,3) DEFAULT 0 NOT NULL,
    mask_bottom numeric(4,3) DEFAULT 0 NOT NULL,
    mask_left numeric(4,3) DEFAULT 0 NOT NULL,
    mask_right numeric(4,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer DEFAULT 5000 NOT NULL,
    CONSTRAINT template_layers_duration_ms_check CHECK (((duration_ms >= 0) AND (duration_ms <= 600000))),
    CONSTRAINT template_layers_mask_bottom_check CHECK (((mask_bottom >= (0)::numeric) AND (mask_bottom <= (1)::numeric))),
    CONSTRAINT template_layers_mask_left_check CHECK (((mask_left >= (0)::numeric) AND (mask_left <= (1)::numeric))),
    CONSTRAINT template_layers_mask_right_check CHECK (((mask_right >= (0)::numeric) AND (mask_right <= (1)::numeric))),
    CONSTRAINT template_layers_mask_top_check CHECK (((mask_top >= (0)::numeric) AND (mask_top <= (1)::numeric)))
);


--
-- Name: TABLE template_layers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_layers IS 'ADR-075 : couches alpha empilées en Z (Gabin AE → MOV)';


--
-- Name: COLUMN template_layers.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_layers.duration_ms IS 'ADR-086 : durée du layer en ms. Source de vérité pour les slots enfants.';


--
-- Name: template_text_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_text_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    slot_key character varying(64) NOT NULL,
    label character varying(200) NOT NULL,
    position_x numeric(5,4) NOT NULL,
    position_y numeric(5,4) NOT NULL,
    max_width numeric(5,4) DEFAULT 0.8 NOT NULL,
    font_family character varying(80) DEFAULT 'Anton'::character varying NOT NULL,
    font_size integer NOT NULL,
    color character varying(16) DEFAULT '#FFFFFF'::character varying NOT NULL,
    align character varying(10) DEFAULT 'center'::character varying NOT NULL,
    appear_at numeric(5,2) NOT NULL,
    appear_duration numeric(4,2) DEFAULT 0.4 NOT NULL,
    animation character varying(20) DEFAULT 'fade'::character varying NOT NULL,
    default_value text DEFAULT ''::text NOT NULL,
    max_chars integer,
    multiline boolean DEFAULT false NOT NULL,
    required boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    always_visible boolean DEFAULT false NOT NULL,
    scale_from numeric(4,2) DEFAULT 0.70 NOT NULL,
    scale_to numeric(4,2) DEFAULT 1.00 NOT NULL,
    layer_id uuid NOT NULL,
    respect_alpha boolean DEFAULT false NOT NULL,
    animation_direction character varying(4) DEFAULT 'in'::character varying NOT NULL,
    CONSTRAINT template_text_fields_align_check CHECK (((align)::text = ANY ((ARRAY['left'::character varying, 'center'::character varying, 'right'::character varying])::text[]))),
    CONSTRAINT template_text_fields_animation_check CHECK (((animation)::text = ANY ((ARRAY['none'::character varying, 'fade'::character varying, 'slide-up'::character varying, 'slide-down'::character varying, 'scale-in'::character varying, 'blur-in'::character varying, 'zoom'::character varying, 'logo-pop'::character varying])::text[]))),
    CONSTRAINT template_text_fields_animation_direction_check CHECK (((animation_direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying])::text[]))),
    CONSTRAINT template_text_fields_max_width_check CHECK (((max_width >= (0)::numeric) AND (max_width <= (1)::numeric))),
    CONSTRAINT template_text_fields_position_x_check CHECK (((position_x >= (0)::numeric) AND (position_x <= (1)::numeric))),
    CONSTRAINT template_text_fields_position_y_check CHECK (((position_y >= (0)::numeric) AND (position_y <= (1)::numeric)))
);


--
-- Name: TABLE template_text_fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_text_fields IS 'ADR-075 : champs texte éditables par l''user (position + timing + animation)';


--
-- Name: COLUMN template_text_fields.always_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_text_fields.always_visible IS 'Si TRUE, le texte est visible sur toute la durée sans timecode (ignore appear_at / appear_duration)';


--
-- Name: COLUMN template_text_fields.scale_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_text_fields.scale_from IS 'Valeur de départ de scale pour l''animation scale-in (défaut 0.70)';


--
-- Name: COLUMN template_text_fields.scale_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_text_fields.scale_to IS 'Valeur d''arrivée de scale pour l''animation scale-in (défaut 1.00)';


--
-- Name: template_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    background_video_url text NOT NULL,
    thumbnail_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE template_variants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_variants IS 'ADR-075 : variantes couleur/ton d''un template (ex: rouge/bleu/vert)';


--
-- Name: top_advertiser_videos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.top_advertiser_videos WITH (security_invoker='true') AS
 SELECT vp.sponsor_id AS advertiser_id,
    a.name AS advertiser_name,
    vp.video_filename,
    count(*) AS play_count,
    sum(vp.duration_played) AS total_duration
   FROM (public.video_plays vp
     JOIN public.advertisers a ON ((a.id = vp.sponsor_id)))
  WHERE (((vp.category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text])) AND (vp.played_at > (now() - '30 days'::interval)))
  GROUP BY vp.sponsor_id, a.name, vp.video_filename
  ORDER BY (count(*)) DESC;


--
-- Name: top_videos_by_site; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.top_videos_by_site WITH (security_invoker='true') AS
 SELECT site_id,
    video_filename,
    category,
    count(*) AS play_count,
    sum(duration_played) AS total_duration_played,
    avg(
        CASE
            WHEN (video_duration > 0) THEN (((duration_played)::double precision / (video_duration)::double precision) * (100)::double precision)
            ELSE (100)::double precision
        END) AS avg_completion_percent,
    count(*) FILTER (WHERE (completed = true)) AS completed_count,
    count(*) FILTER (WHERE ((trigger_type)::text = 'manual'::text)) AS manual_count,
    count(*) FILTER (WHERE ((trigger_type)::text = 'auto'::text)) AS auto_count,
    max(played_at) AS last_played_at
   FROM public.video_plays
  GROUP BY site_id, video_filename, category;


--
-- Name: update_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.update_deployments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    update_id uuid,
    target_type character varying(50) NOT NULL,
    target_id uuid NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    error_message text,
    backup_path character varying(500),
    deployed_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    scheduled_at timestamp without time zone,
    scheduled_by uuid,
    schedule_reboot boolean DEFAULT false,
    auto_rollback boolean DEFAULT true,
    deployment_details jsonb,
    CONSTRAINT check_progress_update CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT check_status_update CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('scheduled'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('rolled_back'::character varying)::text]))),
    CONSTRAINT check_target_type_update CHECK (((target_type)::text = ANY (ARRAY[('site'::character varying)::text, ('group'::character varying)::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255),
    role character varying(50) DEFAULT 'viewer'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_login_at timestamp without time zone,
    mfa_enabled boolean DEFAULT false,
    mfa_secret character varying(255),
    mfa_backup_codes jsonb,
    mfa_verified_at timestamp with time zone,
    advertiser_id uuid,
    agency_id uuid,
    status character varying(20) DEFAULT 'active'::character varying,
    site_id uuid,
    CONSTRAINT check_role CHECK (((role)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('superadmin'::character varying)::text, ('admin'::character varying)::text, ('operator'::character varying)::text, ('viewer'::character varying)::text, ('advertiser'::character varying)::text, ('sponsor'::character varying)::text, ('agency'::character varying)::text, ('club'::character varying)::text]))),
    CONSTRAINT check_user_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: video_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'action'::character varying NOT NULL,
    icon character varying(50),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_categories_type_check CHECK (((type)::text = ANY ((ARRAY['action'::character varying, 'loop'::character varying, 'match'::character varying])::text[])))
);


--
-- Name: video_club_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_club_grants (
    video_id uuid NOT NULL,
    site_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: video_plays_visible; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.video_plays_visible WITH (security_invoker='true') AS
 SELECT id,
    site_id,
    session_id,
    video_filename,
    category,
    played_at,
    duration_played,
    video_duration,
    completed,
    trigger_type,
    created_at,
    video_id,
    sponsor_id,
    tv_status
   FROM public.video_plays
  WHERE (((tv_status)::text = 'on'::text) OR ((tv_status)::text = 'unknown'::text) OR (tv_status IS NULL));


--
-- Name: video_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    display_type character varying(20) NOT NULL,
    filename character varying(500) NOT NULL,
    original_name character varying(500),
    storage_path character varying(1000) NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    checksum character varying(128),
    mime_type character varying(100) DEFAULT 'video/mp4'::character varying,
    width integer,
    height integer,
    duration numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT video_variants_display_type_check CHECK ((((display_type)::text ~ '^[a-z0-9-]+$'::text) AND ((length((display_type)::text) >= 1) AND (length((display_type)::text) <= 20))))
);

ALTER TABLE ONLY public.video_variants FORCE ROW LEVEL SECURITY;


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    category character varying(100),
    subcategory character varying(100),
    file_size bigint,
    duration integer,
    mime_type character varying(100),
    storage_path character varying(500),
    thumbnail_url character varying(500),
    metadata jsonb DEFAULT '{}'::jsonb,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    checksum character varying(64),
    uploaded_for_site_id uuid,
    upload_status character varying(20) DEFAULT 'ready'::character varying,
    upload_verified_at timestamp without time zone,
    upload_verified_size bigint,
    upload_error_message text,
    upload_retry_count integer DEFAULT 0,
    storage_backend character varying(20) DEFAULT 'ftp'::character varying,
    content_type character varying(20) DEFAULT 'video'::character varying NOT NULL,
    external_url character varying(2048),
    CONSTRAINT check_videos_storage_backend CHECK (((storage_backend)::text = ANY (ARRAY[('ftp'::character varying)::text, ('supabase'::character varying)::text, ('local'::character varying)::text]))),
    CONSTRAINT check_videos_upload_status CHECK (((upload_status)::text = ANY (ARRAY[('uploading'::character varying)::text, ('verifying'::character varying)::text, ('ready'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT videos_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['video'::character varying, 'web_page'::character varying, 'livestream'::character varying])::text[]))),
    CONSTRAINT videos_web_external_url_required CHECK ((((content_type)::text = 'video'::text) OR ((external_url IS NOT NULL) AND ((external_url)::text ~ '^https?://'::text))))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


--
-- Name: hostapd_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostapd_events ALTER COLUMN id SET DEFAULT nextval('public.hostapd_events_id_seq'::regclass);


--
-- Name: safe_proposal_status_override id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_proposal_status_override ALTER COLUMN id SET DEFAULT nextval('public.safe_proposal_status_override_id_seq'::regclass);


--
-- Name: safe_sprint_velocity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_sprint_velocity ALTER COLUMN id SET DEFAULT nextval('public.safe_sprint_velocity_id_seq'::regclass);


--
-- Name: safe_story_status_override id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_story_status_override ALTER COLUMN id SET DEFAULT nextval('public.safe_story_status_override_id_seq'::regclass);


--
-- Name: advertiser_sites advertiser_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_sites
    ADD CONSTRAINT advertiser_sites_pkey PRIMARY KEY (advertiser_id, site_id);


--
-- Name: advertiser_videos advertiser_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_videos
    ADD CONSTRAINT advertiser_videos_pkey PRIMARY KEY (advertiser_id, video_id);


--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);


--
-- Name: agency_sites agency_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_sites
    ADD CONSTRAINT agency_sites_pkey PRIMARY KEY (agency_id, site_id);


--
-- Name: alert_thresholds alert_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_thresholds
    ADD CONSTRAINT alert_thresholds_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: analytics_categories analytics_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_categories
    ADD CONSTRAINT analytics_categories_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: campaign_sites campaign_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sites
    ADD CONSTRAINT campaign_sites_pkey PRIMARY KEY (id);


--
-- Name: campaign_videos campaign_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_videos
    ADD CONSTRAINT campaign_videos_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: club_daily_stats club_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats
    ADD CONSTRAINT club_daily_stats_pkey PRIMARY KEY (id);


--
-- Name: club_daily_stats club_daily_stats_site_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats
    ADD CONSTRAINT club_daily_stats_site_id_date_key UNIQUE (site_id, date);


--
-- Name: club_permissions club_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_permissions
    ADD CONSTRAINT club_permissions_pkey PRIMARY KEY (site_id, permission);


--
-- Name: club_sessions club_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_pkey PRIMARY KEY (id);


--
-- Name: config_drafts config_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_drafts
    ADD CONSTRAINT config_drafts_pkey PRIMARY KEY (id);


--
-- Name: config_drafts config_drafts_site_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_drafts
    ADD CONSTRAINT config_drafts_site_id_key UNIQUE (site_id);


--
-- Name: config_history config_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_history
    ADD CONSTRAINT config_history_pkey PRIMARY KEY (id);


--
-- Name: config_profiles config_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_profiles
    ADD CONSTRAINT config_profiles_pkey PRIMARY KEY (id);


--
-- Name: config_profiles config_profiles_site_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_profiles
    ADD CONSTRAINT config_profiles_site_id_name_key UNIQUE (site_id, name);


--
-- Name: content_deployments content_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_deployments
    ADD CONSTRAINT content_deployments_pkey PRIMARY KEY (id);


--
-- Name: generated_reports generated_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: hostapd_events hostapd_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostapd_events
    ADD CONSTRAINT hostapd_events_pkey PRIMARY KEY (id);


--
-- Name: metrics metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_pkey PRIMARY KEY (id);


--
-- Name: connection_events connection_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_events
    ADD CONSTRAINT connection_events_pkey PRIMARY KEY (id);


--
-- Name: connection_events connection_events_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_events
    ADD CONSTRAINT connection_events_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: idx_connection_events_site_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connection_events_site_time
  ON public.connection_events USING btree (site_id, occurred_at DESC);


--
-- Name: idx_connection_events_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connection_events_occurred_at
  ON public.connection_events USING btree (occurred_at);


--
-- Name: neopro_template_versions neopro_template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_template_versions
    ADD CONSTRAINT neopro_template_versions_pkey PRIMARY KEY (id);


--
-- Name: neopro_templates neopro_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_templates
    ADD CONSTRAINT neopro_templates_pkey PRIMARY KEY (id);


--
-- Name: orchestrated_deployments orchestrated_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrated_deployments
    ADD CONSTRAINT orchestrated_deployments_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pending_commands pending_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_commands
    ADD CONSTRAINT pending_commands_pkey PRIMARY KEY (id);


--
-- Name: profile_device_tokens profile_device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_device_tokens
    ADD CONSTRAINT profile_device_tokens_pkey PRIMARY KEY (id);


--
-- Name: profile_device_tokens profile_device_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_device_tokens
    ADD CONSTRAINT profile_device_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: proof_of_broadcasts proof_of_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_broadcasts
    ADD CONSTRAINT proof_of_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: recurring_schedule_executions recurring_schedule_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_schedule_executions
    ADD CONSTRAINT recurring_schedule_executions_pkey PRIMARY KEY (id);


--
-- Name: recurring_schedules recurring_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_schedules
    ADD CONSTRAINT recurring_schedules_pkey PRIMARY KEY (id);


--
-- Name: remote_auth_events remote_auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_auth_events
    ADD CONSTRAINT remote_auth_events_pkey PRIMARY KEY (id);


--
-- Name: remote_command_audit remote_command_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_command_audit
    ADD CONSTRAINT remote_command_audit_pkey PRIMARY KEY (command_id);


--
-- Name: remote_commands remote_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_pkey PRIMARY KEY (id);


--
-- Name: remotion_render_jobs remotion_render_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remotion_render_jobs
    ADD CONSTRAINT remotion_render_jobs_pkey PRIMARY KEY (id);


--
-- Name: report_schedules report_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);


--
-- Name: rls_audit_log rls_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rls_audit_log
    ADD CONSTRAINT rls_audit_log_pkey PRIMARY KEY (id);


--
-- Name: safe_proposal_status_override safe_proposal_status_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_proposal_status_override
    ADD CONSTRAINT safe_proposal_status_override_pkey PRIMARY KEY (id);


--
-- Name: safe_proposal_status_override safe_proposal_status_override_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_proposal_status_override
    ADD CONSTRAINT safe_proposal_status_override_proposal_id_key UNIQUE (proposal_id);


--
-- Name: safe_sprint_velocity safe_sprint_velocity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_sprint_velocity
    ADD CONSTRAINT safe_sprint_velocity_pkey PRIMARY KEY (id);


--
-- Name: safe_sprint_velocity safe_sprint_velocity_sprint_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_sprint_velocity
    ADD CONSTRAINT safe_sprint_velocity_sprint_id_key UNIQUE (sprint_id);


--
-- Name: safe_story_status_override safe_story_status_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_story_status_override
    ADD CONSTRAINT safe_story_status_override_pkey PRIMARY KEY (id);


--
-- Name: safe_story_status_override safe_story_status_override_story_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safe_story_status_override
    ADD CONSTRAINT safe_story_status_override_story_id_key UNIQUE (story_id);


--
-- Name: scheduled_reports scheduled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: site_groups site_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_groups
    ADD CONSTRAINT site_groups_pkey PRIMARY KEY (site_id, group_id);


--
-- Name: site_sponsor_daily_stats site_sponsor_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_stats
    ADD CONSTRAINT site_sponsor_daily_stats_pkey PRIMARY KEY (id);


--
-- Name: site_sponsor_daily_stats site_sponsor_daily_stats_site_sponsor_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_stats
    ADD CONSTRAINT site_sponsor_daily_stats_site_sponsor_id_date_key UNIQUE (site_sponsor_id, date);


--
-- Name: site_sponsor_daily_video_stats site_sponsor_daily_video_stat_site_sponsor_id_date_video_fi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_video_stats
    ADD CONSTRAINT site_sponsor_daily_video_stat_site_sponsor_id_date_video_fi_key UNIQUE (site_sponsor_id, date, video_filename);


--
-- Name: site_sponsor_daily_video_stats site_sponsor_daily_video_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_video_stats
    ADD CONSTRAINT site_sponsor_daily_video_stats_pkey PRIMARY KEY (id);


--
-- Name: site_sponsor_videos site_sponsor_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_videos
    ADD CONSTRAINT site_sponsor_videos_pkey PRIMARY KEY (id);


--
-- Name: site_sponsors site_sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsors
    ADD CONSTRAINT site_sponsors_pkey PRIMARY KEY (id);


--
-- Name: site_videos site_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_videos
    ADD CONSTRAINT site_videos_pkey PRIMARY KEY (site_id, video_id);


--
-- Name: sites sites_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_api_key_key UNIQUE (api_key);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: software_updates software_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.software_updates
    ADD CONSTRAINT software_updates_pkey PRIMARY KEY (id);


--
-- Name: software_updates software_updates_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.software_updates
    ADD CONSTRAINT software_updates_version_key UNIQUE (version);


--
-- Name: sponsor_access_tokens sponsor_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsor_access_tokens
    ADD CONSTRAINT sponsor_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: advertisers sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertisers
    ADD CONSTRAINT sponsors_pkey PRIMARY KEY (id);


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (id);


--
-- Name: subscription_suspension_reasons subscription_suspension_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_suspension_reasons
    ADD CONSTRAINT subscription_suspension_reasons_pkey PRIMARY KEY (code);


--
-- Name: template_image_slots template_image_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_image_slots
    ADD CONSTRAINT template_image_slots_pkey PRIMARY KEY (id);


--
-- Name: template_image_slots template_image_slots_template_id_slot_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_image_slots
    ADD CONSTRAINT template_image_slots_template_id_slot_key_key UNIQUE (template_id, slot_key);


--
-- Name: template_layers template_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_layers
    ADD CONSTRAINT template_layers_pkey PRIMARY KEY (id);


--
-- Name: template_text_fields template_text_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_text_fields
    ADD CONSTRAINT template_text_fields_pkey PRIMARY KEY (id);


--
-- Name: template_text_fields template_text_fields_template_id_slot_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_text_fields
    ADD CONSTRAINT template_text_fields_template_id_slot_key_key UNIQUE (template_id, slot_key);


--
-- Name: template_variants template_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_variants
    ADD CONSTRAINT template_variants_pkey PRIMARY KEY (id);


--
-- Name: update_deployments update_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_deployments
    ADD CONSTRAINT update_deployments_pkey PRIMARY KEY (id);


--
-- Name: campaign_sites uq_campaign_site; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sites
    ADD CONSTRAINT uq_campaign_site UNIQUE (campaign_id, site_id);


--
-- Name: campaign_videos uq_campaign_video; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_videos
    ADD CONSTRAINT uq_campaign_video UNIQUE (campaign_id, video_id);


--
-- Name: generated_reports uq_report_entity_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT uq_report_entity_period UNIQUE (report_type, site_id, advertiser_id, site_sponsor_id, period_start, period_end);


--
-- Name: site_sponsor_videos uq_site_sponsor_video; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_videos
    ADD CONSTRAINT uq_site_sponsor_video UNIQUE (site_sponsor_id, video_filename);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_categories video_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_categories
    ADD CONSTRAINT video_categories_pkey PRIMARY KEY (id);


--
-- Name: video_club_grants video_club_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_club_grants
    ADD CONSTRAINT video_club_grants_pkey PRIMARY KEY (video_id, site_id);


--
-- Name: video_plays video_plays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_pkey PRIMARY KEY (id);


--
-- Name: video_variants video_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_variants
    ADD CONSTRAINT video_variants_pkey PRIMARY KEY (id);


--
-- Name: video_variants video_variants_video_id_display_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_variants
    ADD CONSTRAINT video_variants_video_id_display_type_key UNIQUE (video_id, display_type);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_idempotency_key_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_advertiser_sites_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advertiser_sites_advertiser ON public.advertiser_sites USING btree (advertiser_id);


--
-- Name: idx_advertiser_sites_contract_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advertiser_sites_contract_active ON public.advertiser_sites USING btree (advertiser_id, site_id) WHERE (is_active = true);


--
-- Name: idx_advertiser_sites_contract_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advertiser_sites_contract_dates ON public.advertiser_sites USING btree (contract_start, contract_end) WHERE (is_active = true);


--
-- Name: idx_advertiser_sites_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advertiser_sites_site ON public.advertiser_sites USING btree (site_id);


--
-- Name: idx_agency_sites_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agency_sites_agency ON public.agency_sites USING btree (agency_id);


--
-- Name: idx_agency_sites_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agency_sites_site ON public.agency_sites USING btree (site_id);


--
-- Name: idx_alerts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_created_at ON public.alerts USING btree (created_at);


--
-- Name: idx_alerts_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_site ON public.alerts USING btree (site_id, created_at DESC);


--
-- Name: idx_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_status ON public.alerts USING btree (status, severity);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_date ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_target ON public.audit_logs USING btree (target_type, target_id);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_campaign_sites_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_sites_campaign ON public.campaign_sites USING btree (campaign_id);


--
-- Name: idx_campaign_sites_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_sites_site ON public.campaign_sites USING btree (site_id);


--
-- Name: idx_campaign_sites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_sites_status ON public.campaign_sites USING btree (deployment_status) WHERE ((deployment_status)::text = 'pending'::text);


--
-- Name: idx_campaign_videos_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_videos_campaign ON public.campaign_videos USING btree (campaign_id);


--
-- Name: idx_campaign_videos_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_videos_video ON public.campaign_videos USING btree (video_id);


--
-- Name: idx_campaigns_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_advertiser ON public.campaigns USING btree (advertiser_id);


--
-- Name: idx_campaigns_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_dates ON public.campaigns USING btree (start_date, end_date);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_club_daily_stats_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_club_daily_stats_date ON public.club_daily_stats USING btree (date);


--
-- Name: idx_club_daily_stats_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_club_daily_stats_site ON public.club_daily_stats USING btree (site_id, date DESC);


--
-- Name: idx_club_permissions_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_club_permissions_site_id ON public.club_permissions USING btree (site_id);


--
-- Name: idx_club_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_club_sessions_date ON public.club_sessions USING btree (started_at);


--
-- Name: idx_club_sessions_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_club_sessions_site ON public.club_sessions USING btree (site_id, started_at DESC);


--
-- Name: idx_commands_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commands_site ON public.remote_commands USING btree (site_id, created_at DESC);


--
-- Name: idx_commands_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commands_status ON public.remote_commands USING btree (status);


--
-- Name: idx_config_drafts_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_drafts_site ON public.config_drafts USING btree (site_id);


--
-- Name: idx_config_drafts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_drafts_status ON public.config_drafts USING btree (status);


--
-- Name: idx_config_history_deployed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_history_deployed_by ON public.config_history USING btree (deployed_by);


--
-- Name: idx_config_history_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_history_site ON public.config_history USING btree (site_id, deployed_at DESC);


--
-- Name: idx_config_profiles_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_profiles_default ON public.config_profiles USING btree (site_id, is_default) WHERE (is_default = true);


--
-- Name: idx_config_profiles_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_profiles_site ON public.config_profiles USING btree (site_id);


--
-- Name: idx_content_deployments_orchestrated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_deployments_orchestrated ON public.content_deployments USING btree (orchestrated_deployment_id) WHERE (orchestrated_deployment_id IS NOT NULL);


--
-- Name: idx_content_deployments_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_deployments_scheduled ON public.content_deployments USING btree (scheduled_at) WHERE (((status)::text = 'scheduled'::text) AND (scheduled_at IS NOT NULL));


--
-- Name: idx_deployments_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployments_created ON public.content_deployments USING btree (created_at DESC);


--
-- Name: idx_deployments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployments_status ON public.content_deployments USING btree (status);


--
-- Name: idx_hostapd_events_site_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostapd_events_site_time ON public.hostapd_events USING btree (site_id, occurred_at DESC);


--
-- Name: idx_hostapd_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostapd_events_type ON public.hostapd_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_image_slots_layer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_slots_layer_id ON public.template_image_slots USING btree (layer_id);


--
-- Name: idx_image_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_template ON public.template_image_slots USING btree (template_id, sort_order);


--
-- Name: idx_layers_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_layers_template ON public.template_layers USING btree (template_id, z_index);


--
-- Name: idx_metrics_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metrics_recorded_at ON public.metrics USING btree (recorded_at);


--
-- Name: idx_metrics_site_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metrics_site_time ON public.metrics USING btree (site_id, recorded_at DESC);


--
-- Name: idx_neopro_templates_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neopro_templates_site_id ON public.neopro_templates USING btree (site_id) WHERE (site_id IS NOT NULL);


--
-- Name: idx_orch_deployments_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orch_deployments_draft ON public.orchestrated_deployments USING btree (draft_id);


--
-- Name: idx_orch_deployments_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orch_deployments_site ON public.orchestrated_deployments USING btree (site_id);


--
-- Name: idx_orch_deployments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orch_deployments_status ON public.orchestrated_deployments USING btree (status);


--
-- Name: idx_pdt_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdt_expires ON public.profile_device_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_pdt_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdt_profile ON public.profile_device_tokens USING btree (profile_id);


--
-- Name: idx_pdt_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdt_site ON public.profile_device_tokens USING btree (site_id);


--
-- Name: idx_pdt_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdt_token_hash ON public.profile_device_tokens USING btree (token_hash);


--
-- Name: idx_pending_commands_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_commands_expires ON public.pending_commands USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_pending_commands_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_commands_priority ON public.pending_commands USING btree (site_id, priority, created_at);


--
-- Name: idx_pending_commands_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_commands_site ON public.pending_commands USING btree (site_id);


--
-- Name: idx_proof_of_broadcasts_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proof_of_broadcasts_site_id ON public.proof_of_broadcasts USING btree (site_id);


--
-- Name: idx_proof_of_broadcasts_site_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proof_of_broadcasts_site_timestamp ON public.proof_of_broadcasts USING btree (site_id, timestamp_captured DESC);


--
-- Name: idx_proof_of_broadcasts_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proof_of_broadcasts_timestamp ON public.proof_of_broadcasts USING btree (timestamp_captured DESC);


--
-- Name: idx_prt_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_expires_at ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_prt_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_token_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: idx_prt_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_recurring_schedules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_schedules_active ON public.recurring_schedules USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_recurring_schedules_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_schedules_next_run ON public.recurring_schedules USING btree (next_run_at) WHERE (is_active = true);


--
-- Name: idx_recurring_schedules_task_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_schedules_task_type ON public.recurring_schedules USING btree (task_type);


--
-- Name: idx_remote_auth_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_auth_events_created_at ON public.remote_auth_events USING btree (created_at);


--
-- Name: idx_remote_auth_events_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_auth_events_site_id ON public.remote_auth_events USING btree (site_id);


--
-- Name: idx_remote_auth_events_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_auth_events_version ON public.remote_auth_events USING btree (client_version);


--
-- Name: idx_remote_command_audit_emitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_command_audit_emitted ON public.remote_command_audit USING btree (emitted_at);


--
-- Name: idx_remote_command_audit_site_emitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_command_audit_site_emitted ON public.remote_command_audit USING btree (site_id, emitted_at DESC);


--
-- Name: idx_remote_command_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_command_audit_status ON public.remote_command_audit USING btree (status) WHERE ((status)::text <> 'acked'::text);


--
-- Name: idx_remote_commands_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remote_commands_created_at ON public.remote_commands USING btree (created_at);


--
-- Name: idx_render_jobs_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_render_jobs_cleanup ON public.remotion_render_jobs USING btree (created_at) WHERE (status = ANY (ARRAY['completed'::text, 'failed'::text]));


--
-- Name: idx_render_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_render_jobs_pending ON public.remotion_render_jobs USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_render_jobs_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_render_jobs_requester ON public.remotion_render_jobs USING btree (requested_by, created_at DESC);


--
-- Name: idx_reports_advertiser_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_advertiser_id ON public.generated_reports USING btree (advertiser_id) WHERE (advertiser_id IS NOT NULL);


--
-- Name: idx_reports_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_created ON public.generated_reports USING btree (created_at DESC);


--
-- Name: idx_reports_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_period ON public.generated_reports USING btree (period_start DESC, period_end DESC);


--
-- Name: idx_reports_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_site_id ON public.generated_reports USING btree (site_id) WHERE (site_id IS NOT NULL);


--
-- Name: idx_reports_site_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_site_sponsor ON public.generated_reports USING btree (site_sponsor_id) WHERE (site_sponsor_id IS NOT NULL);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.generated_reports USING btree (status) WHERE ((status)::text <> 'completed'::text);


--
-- Name: idx_rls_audit_accessed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rls_audit_accessed_at ON public.rls_audit_log USING btree (accessed_at DESC);


--
-- Name: idx_rls_audit_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rls_audit_site_id ON public.rls_audit_log USING btree (site_id);


--
-- Name: idx_rls_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rls_audit_user_id ON public.rls_audit_log USING btree (user_id);


--
-- Name: idx_safe_proposal_override; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_safe_proposal_override ON public.safe_proposal_status_override USING btree (proposal_id);


--
-- Name: idx_safe_story_override; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_safe_story_override ON public.safe_story_status_override USING btree (story_id);


--
-- Name: idx_safe_velocity_sprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_safe_velocity_sprint ON public.safe_sprint_velocity USING btree (sprint_id);


--
-- Name: idx_sat_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_expires_at ON public.sponsor_access_tokens USING btree (expires_at);


--
-- Name: idx_sat_site_sponsor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_site_sponsor_id ON public.sponsor_access_tokens USING btree (site_sponsor_id);


--
-- Name: idx_sat_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_token_hash ON public.sponsor_access_tokens USING btree (token_hash);


--
-- Name: idx_schedule_executions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_executions_date ON public.recurring_schedule_executions USING btree (started_at DESC);


--
-- Name: idx_schedule_executions_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_executions_schedule ON public.recurring_schedule_executions USING btree (schedule_id);


--
-- Name: idx_scheduled_reports_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_reports_advertiser ON public.scheduled_reports USING btree (advertiser_id);


--
-- Name: idx_scheduled_reports_next_send; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_reports_next_send ON public.scheduled_reports USING btree (next_send_at) WHERE (enabled = true);


--
-- Name: idx_site_sponsor_videos_filename; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_sponsor_videos_filename ON public.site_sponsor_videos USING btree (video_filename);


--
-- Name: idx_site_sponsor_videos_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_sponsor_videos_sponsor ON public.site_sponsor_videos USING btree (site_sponsor_id);


--
-- Name: idx_site_sponsors_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_sponsors_active ON public.site_sponsors USING btree (site_id, status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_site_sponsors_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_sponsors_site ON public.site_sponsors USING btree (site_id);


--
-- Name: idx_site_videos_site_added; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_videos_site_added ON public.site_videos USING btree (site_id, added_at DESC);


--
-- Name: idx_site_videos_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_videos_video_id ON public.site_videos USING btree (video_id);


--
-- Name: idx_sites_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_last_seen ON public.sites USING btree (last_seen_at DESC);


--
-- Name: idx_sites_local_config_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_local_config_hash ON public.sites USING btree (local_config_hash);


--
-- Name: idx_sites_network_profile_mesh; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_network_profile_mesh ON public.sites USING btree (((network_profile ->> 'apCount'::text))) WHERE ((network_profile IS NOT NULL) AND (((network_profile ->> 'apCount'::text))::integer > 1));


--
-- Name: idx_sites_network_profile_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_network_profile_type ON public.sites USING btree (((network_profile ->> 'type'::text))) WHERE (network_profile IS NOT NULL);


--
-- Name: idx_sites_secondary_display_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_secondary_display_enabled ON public.sites USING btree (secondary_display_enabled) WHERE (secondary_display_enabled = true);


--
-- Name: idx_sites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_status ON public.sites USING btree (status);


--
-- Name: idx_sites_subscription_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_subscription_end ON public.sites USING btree (subscription_end) WHERE (subscription_end IS NOT NULL);


--
-- Name: idx_sites_subscription_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_subscription_plan ON public.sites USING btree (subscription_plan) WHERE (subscription_plan IS NOT NULL);


--
-- Name: idx_sites_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sites_suspended ON public.sites USING btree (suspended) WHERE (suspended = true);


--
-- Name: idx_software_updates_upload_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_software_updates_upload_status ON public.software_updates USING btree (upload_status);


--
-- Name: idx_ssds_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssds_date ON public.site_sponsor_daily_stats USING btree (date);


--
-- Name: idx_ssds_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssds_site ON public.site_sponsor_daily_stats USING btree (site_id, date DESC);


--
-- Name: idx_ssds_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssds_sponsor ON public.site_sponsor_daily_stats USING btree (site_sponsor_id, date DESC);


--
-- Name: idx_ssds_sponsor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssds_sponsor_id ON public.site_sponsor_daily_stats USING btree (sponsor_id, date DESC) WHERE (sponsor_id IS NOT NULL);


--
-- Name: idx_ssdvs_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssdvs_site ON public.site_sponsor_daily_video_stats USING btree (site_id, date DESC);


--
-- Name: idx_ssdvs_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ssdvs_sponsor ON public.site_sponsor_daily_video_stats USING btree (site_sponsor_id, date DESC);


--
-- Name: idx_subscription_history_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_history_created ON public.subscription_history USING btree (created_at DESC);


--
-- Name: idx_subscription_history_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_history_site ON public.subscription_history USING btree (site_id);


--
-- Name: idx_template_versions_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_versions_template ON public.neopro_template_versions USING btree (template_id, created_at DESC);


--
-- Name: idx_text_fields_layer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_text_fields_layer_id ON public.template_text_fields USING btree (layer_id);


--
-- Name: idx_text_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_text_template ON public.template_text_fields USING btree (template_id, sort_order);


--
-- Name: idx_thresholds_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_thresholds_metric ON public.alert_thresholds USING btree (metric);


--
-- Name: idx_update_deployments_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_update_deployments_scheduled ON public.update_deployments USING btree (scheduled_at) WHERE (((status)::text = 'scheduled'::text) AND (scheduled_at IS NOT NULL));


--
-- Name: idx_update_deployments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_update_deployments_status ON public.update_deployments USING btree (status);


--
-- Name: idx_users_advertiser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_advertiser ON public.users USING btree (advertiser_id) WHERE (advertiser_id IS NOT NULL);


--
-- Name: idx_users_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_agency ON public.users USING btree (agency_id) WHERE (agency_id IS NOT NULL);


--
-- Name: idx_users_mfa_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_mfa_enabled ON public.users USING btree (mfa_enabled) WHERE (mfa_enabled = true);


--
-- Name: idx_users_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_site_id ON public.users USING btree (site_id) WHERE (site_id IS NOT NULL);


--
-- Name: idx_variants_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_template ON public.template_variants USING btree (template_id, sort_order);


--
-- Name: idx_vcg_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vcg_site_id ON public.video_club_grants USING btree (site_id);


--
-- Name: idx_vcg_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vcg_video_id ON public.video_club_grants USING btree (video_id);


--
-- Name: idx_video_categories_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_categories_site_id ON public.video_categories USING btree (site_id, sort_order);


--
-- Name: idx_video_plays_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_campaign ON public.video_plays USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);


--
-- Name: idx_video_plays_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_video_plays_dedup ON public.video_plays USING btree (site_id, played_at, video_filename);


--
-- Name: idx_video_plays_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_event_type ON public.video_plays USING btree (event_type);


--
-- Name: idx_video_plays_filename; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_filename ON public.video_plays USING btree (video_filename);


--
-- Name: idx_video_plays_played_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_played_at ON public.video_plays USING btree (played_at);


--
-- Name: idx_video_plays_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_session ON public.video_plays USING btree (session_id);


--
-- Name: idx_video_plays_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_site ON public.video_plays USING btree (site_id, played_at DESC);


--
-- Name: idx_video_plays_site_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_site_sponsor ON public.video_plays USING btree (site_sponsor_id);


--
-- Name: idx_video_plays_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_source ON public.video_plays USING btree (source) WHERE (source IS NOT NULL);


--
-- Name: idx_video_plays_sponsor_analytics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_sponsor_analytics ON public.video_plays USING btree (site_id, category, played_at DESC) WHERE ((category)::text = ANY (ARRAY[('sponsor'::character varying)::text, ('sponsor_local'::character varying)::text, ('sponsor_neopro'::character varying)::text]));


--
-- Name: idx_video_plays_sponsor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_sponsor_id ON public.video_plays USING btree (sponsor_id);


--
-- Name: idx_video_plays_tv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_tv_status ON public.video_plays USING btree (tv_status);


--
-- Name: idx_video_plays_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_plays_video_id ON public.video_plays USING btree (video_id);


--
-- Name: idx_video_variants_display_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_variants_display_type ON public.video_variants USING btree (display_type);


--
-- Name: idx_video_variants_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_variants_video_id ON public.video_variants USING btree (video_id);


--
-- Name: idx_videos_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_checksum ON public.videos USING btree (checksum);


--
-- Name: idx_videos_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_content_type ON public.videos USING btree (content_type);


--
-- Name: idx_videos_ready_for_deploy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_ready_for_deploy ON public.videos USING btree (upload_status, created_at) WHERE ((upload_status)::text = 'ready'::text);


--
-- Name: idx_videos_storage_backend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_storage_backend ON public.videos USING btree (storage_backend);


--
-- Name: idx_videos_upload_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_upload_status ON public.videos USING btree (upload_status);


--
-- Name: idx_videos_uploaded_for_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_uploaded_for_site ON public.videos USING btree (uploaded_for_site_id) WHERE (uploaded_for_site_id IS NOT NULL);


--
-- Name: neopro_templates trg_neopro_templates_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_neopro_templates_snapshot AFTER INSERT OR UPDATE ON public.neopro_templates FOR EACH ROW EXECUTE FUNCTION public.neopro_templates_snapshot_version();


--
-- Name: remotion_render_jobs trg_remotion_render_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remotion_render_jobs_updated_at BEFORE UPDATE ON public.remotion_render_jobs FOR EACH ROW EXECUTE FUNCTION public.remotion_render_jobs_set_updated_at();


--
-- Name: campaigns trigger_update_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_campaigns_updated_at();


--
-- Name: config_drafts trigger_update_config_drafts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_config_drafts_updated_at BEFORE UPDATE ON public.config_drafts FOR EACH ROW EXECUTE FUNCTION public.update_config_drafts_updated_at();


--
-- Name: config_profiles trigger_update_config_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_config_profiles_updated_at BEFORE UPDATE ON public.config_profiles FOR EACH ROW EXECUTE FUNCTION public.update_config_profiles_updated_at();


--
-- Name: recurring_schedules trigger_update_recurring_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_recurring_schedule BEFORE UPDATE ON public.recurring_schedules FOR EACH ROW EXECUTE FUNCTION public.update_recurring_schedule_timestamp();


--
-- Name: scheduled_reports trigger_update_scheduled_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_scheduled_reports_updated_at BEFORE UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION public.update_scheduled_reports_updated_at();


--
-- Name: advertisers update_advertisers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_advertisers_updated_at BEFORE UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agencies update_agencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: groups update_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sites update_sites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: videos update_videos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agency_sites agency_sites_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_sites
    ADD CONSTRAINT agency_sites_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: agency_sites agency_sites_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_sites
    ADD CONSTRAINT agency_sites_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;


--
-- Name: agency_sites agency_sites_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_sites
    ADD CONSTRAINT agency_sites_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_sites campaign_sites_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sites
    ADD CONSTRAINT campaign_sites_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_sites campaign_sites_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sites
    ADD CONSTRAINT campaign_sites_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: campaign_videos campaign_videos_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_videos
    ADD CONSTRAINT campaign_videos_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_videos campaign_videos_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_videos
    ADD CONSTRAINT campaign_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: club_daily_stats club_daily_stats_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats
    ADD CONSTRAINT club_daily_stats_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: club_permissions club_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_permissions
    ADD CONSTRAINT club_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: club_permissions club_permissions_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_permissions
    ADD CONSTRAINT club_permissions_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: club_sessions club_sessions_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: config_drafts config_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_drafts
    ADD CONSTRAINT config_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: config_drafts config_drafts_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_drafts
    ADD CONSTRAINT config_drafts_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: config_drafts config_drafts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_drafts
    ADD CONSTRAINT config_drafts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: config_history config_history_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_history
    ADD CONSTRAINT config_history_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.users(id);


--
-- Name: config_history config_history_previous_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_history
    ADD CONSTRAINT config_history_previous_version_id_fkey FOREIGN KEY (previous_version_id) REFERENCES public.config_history(id);


--
-- Name: config_history config_history_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_history
    ADD CONSTRAINT config_history_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.config_profiles(id) ON DELETE SET NULL;


--
-- Name: config_history config_history_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_history
    ADD CONSTRAINT config_history_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: config_profiles config_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_profiles
    ADD CONSTRAINT config_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: config_profiles config_profiles_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_profiles
    ADD CONSTRAINT config_profiles_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: config_profiles config_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_profiles
    ADD CONSTRAINT config_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: content_deployments content_deployments_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_deployments
    ADD CONSTRAINT content_deployments_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.users(id);


--
-- Name: content_deployments content_deployments_orchestrated_deployment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_deployments
    ADD CONSTRAINT content_deployments_orchestrated_deployment_id_fkey FOREIGN KEY (orchestrated_deployment_id) REFERENCES public.orchestrated_deployments(id) ON DELETE SET NULL;


--
-- Name: content_deployments content_deployments_scheduled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_deployments
    ADD CONSTRAINT content_deployments_scheduled_by_fkey FOREIGN KEY (scheduled_by) REFERENCES public.users(id);


--
-- Name: content_deployments content_deployments_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_deployments
    ADD CONSTRAINT content_deployments_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: sites fk_sites_active_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT fk_sites_active_profile FOREIGN KEY (active_profile_id) REFERENCES public.config_profiles(id) ON DELETE SET NULL;


--
-- Name: sites fk_sites_pending_config_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT fk_sites_pending_config_version FOREIGN KEY (pending_config_version_id) REFERENCES public.config_history(id);


--
-- Name: generated_reports generated_reports_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: generated_reports generated_reports_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: generated_reports generated_reports_site_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_reports
    ADD CONSTRAINT generated_reports_site_sponsor_id_fkey FOREIGN KEY (site_sponsor_id) REFERENCES public.site_sponsors(id) ON DELETE SET NULL;


--
-- Name: hostapd_events hostapd_events_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostapd_events
    ADD CONSTRAINT hostapd_events_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: metrics metrics_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: neopro_template_versions neopro_template_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_template_versions
    ADD CONSTRAINT neopro_template_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: neopro_template_versions neopro_template_versions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_template_versions
    ADD CONSTRAINT neopro_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: neopro_templates neopro_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_templates
    ADD CONSTRAINT neopro_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: neopro_templates neopro_templates_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neopro_templates
    ADD CONSTRAINT neopro_templates_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: orchestrated_deployments orchestrated_deployments_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrated_deployments
    ADD CONSTRAINT orchestrated_deployments_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.config_drafts(id) ON DELETE SET NULL;


--
-- Name: orchestrated_deployments orchestrated_deployments_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrated_deployments
    ADD CONSTRAINT orchestrated_deployments_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: orchestrated_deployments orchestrated_deployments_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrated_deployments
    ADD CONSTRAINT orchestrated_deployments_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pending_commands pending_commands_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_commands
    ADD CONSTRAINT pending_commands_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: pending_commands pending_commands_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_commands
    ADD CONSTRAINT pending_commands_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: profile_device_tokens profile_device_tokens_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_device_tokens
    ADD CONSTRAINT profile_device_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.config_profiles(id) ON DELETE CASCADE;


--
-- Name: profile_device_tokens profile_device_tokens_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_device_tokens
    ADD CONSTRAINT profile_device_tokens_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: proof_of_broadcasts proof_of_broadcasts_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proof_of_broadcasts
    ADD CONSTRAINT proof_of_broadcasts_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: recurring_schedule_executions recurring_schedule_executions_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_schedule_executions
    ADD CONSTRAINT recurring_schedule_executions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.recurring_schedules(id) ON DELETE CASCADE;


--
-- Name: recurring_schedules recurring_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_schedules
    ADD CONSTRAINT recurring_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: remote_auth_events remote_auth_events_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_auth_events
    ADD CONSTRAINT remote_auth_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.config_profiles(id) ON DELETE SET NULL;


--
-- Name: remote_command_audit remote_command_audit_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_command_audit
    ADD CONSTRAINT remote_command_audit_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: remote_commands remote_commands_executed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES public.users(id);


--
-- Name: remote_commands remote_commands_pending_command_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_pending_command_id_fkey FOREIGN KEY (pending_command_id) REFERENCES public.pending_commands(id) ON DELETE SET NULL;


--
-- Name: remote_commands remote_commands_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_commands
    ADD CONSTRAINT remote_commands_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: remotion_render_jobs remotion_render_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remotion_render_jobs
    ADD CONSTRAINT remotion_render_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: remotion_render_jobs remotion_render_jobs_requested_for_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remotion_render_jobs
    ADD CONSTRAINT remotion_render_jobs_requested_for_site_id_fkey FOREIGN KEY (requested_for_site_id) REFERENCES public.sites(id) ON DELETE SET NULL;


--
-- Name: remotion_render_jobs remotion_render_jobs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remotion_render_jobs
    ADD CONSTRAINT remotion_render_jobs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: remotion_render_jobs remotion_render_jobs_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remotion_render_jobs
    ADD CONSTRAINT remotion_render_jobs_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: report_schedules report_schedules_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: report_schedules report_schedules_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: scheduled_reports scheduled_reports_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: scheduled_reports scheduled_reports_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: site_groups site_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_groups
    ADD CONSTRAINT site_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: site_groups site_groups_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_groups
    ADD CONSTRAINT site_groups_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_daily_stats site_sponsor_daily_stats_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_stats
    ADD CONSTRAINT site_sponsor_daily_stats_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_daily_stats site_sponsor_daily_stats_site_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_stats
    ADD CONSTRAINT site_sponsor_daily_stats_site_sponsor_id_fkey FOREIGN KEY (site_sponsor_id) REFERENCES public.site_sponsors(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_daily_video_stats site_sponsor_daily_video_stats_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_video_stats
    ADD CONSTRAINT site_sponsor_daily_video_stats_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_daily_video_stats site_sponsor_daily_video_stats_site_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_daily_video_stats
    ADD CONSTRAINT site_sponsor_daily_video_stats_site_sponsor_id_fkey FOREIGN KEY (site_sponsor_id) REFERENCES public.site_sponsors(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_videos site_sponsor_videos_site_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_videos
    ADD CONSTRAINT site_sponsor_videos_site_sponsor_id_fkey FOREIGN KEY (site_sponsor_id) REFERENCES public.site_sponsors(id) ON DELETE CASCADE;


--
-- Name: site_sponsor_videos site_sponsor_videos_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsor_videos
    ADD CONSTRAINT site_sponsor_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: site_sponsors site_sponsors_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_sponsors
    ADD CONSTRAINT site_sponsors_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_videos site_videos_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_videos
    ADD CONSTRAINT site_videos_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: site_videos site_videos_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_videos
    ADD CONSTRAINT site_videos_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: site_videos site_videos_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_videos
    ADD CONSTRAINT site_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: software_updates software_updates_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.software_updates
    ADD CONSTRAINT software_updates_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: sponsor_access_tokens sponsor_access_tokens_site_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsor_access_tokens
    ADD CONSTRAINT sponsor_access_tokens_site_sponsor_id_fkey FOREIGN KEY (site_sponsor_id) REFERENCES public.site_sponsors(id) ON DELETE CASCADE;


--
-- Name: advertiser_sites sponsor_sites_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_sites
    ADD CONSTRAINT sponsor_sites_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: advertiser_sites sponsor_sites_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_sites
    ADD CONSTRAINT sponsor_sites_sponsor_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: advertiser_videos sponsor_videos_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_videos
    ADD CONSTRAINT sponsor_videos_sponsor_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertisers(id) ON DELETE CASCADE;


--
-- Name: advertiser_videos sponsor_videos_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advertiser_videos
    ADD CONSTRAINT sponsor_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: subscription_history subscription_history_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: subscription_history subscription_history_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: template_image_slots template_image_slots_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_image_slots
    ADD CONSTRAINT template_image_slots_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.template_layers(id) ON DELETE CASCADE;


--
-- Name: template_image_slots template_image_slots_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_image_slots
    ADD CONSTRAINT template_image_slots_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: template_layers template_layers_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_layers
    ADD CONSTRAINT template_layers_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: template_text_fields template_text_fields_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_text_fields
    ADD CONSTRAINT template_text_fields_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.template_layers(id) ON DELETE CASCADE;


--
-- Name: template_text_fields template_text_fields_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_text_fields
    ADD CONSTRAINT template_text_fields_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: template_variants template_variants_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_variants
    ADD CONSTRAINT template_variants_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.neopro_templates(id) ON DELETE CASCADE;


--
-- Name: update_deployments update_deployments_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_deployments
    ADD CONSTRAINT update_deployments_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.users(id);


--
-- Name: update_deployments update_deployments_scheduled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_deployments
    ADD CONSTRAINT update_deployments_scheduled_by_fkey FOREIGN KEY (scheduled_by) REFERENCES public.users(id);


--
-- Name: update_deployments update_deployments_update_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.update_deployments
    ADD CONSTRAINT update_deployments_update_id_fkey FOREIGN KEY (update_id) REFERENCES public.software_updates(id) ON DELETE CASCADE;


--
-- Name: users users_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;


--
-- Name: video_categories video_categories_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_categories
    ADD CONSTRAINT video_categories_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: video_club_grants video_club_grants_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_club_grants
    ADD CONSTRAINT video_club_grants_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: video_club_grants video_club_grants_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_club_grants
    ADD CONSTRAINT video_club_grants_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_plays video_plays_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: video_plays video_plays_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.club_sessions(id) ON DELETE SET NULL;


--
-- Name: video_plays video_plays_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: video_plays video_plays_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_sponsor_id_fkey FOREIGN KEY (sponsor_id) REFERENCES public.advertisers(id) ON DELETE SET NULL;


--
-- Name: video_plays video_plays_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_plays
    ADD CONSTRAINT video_plays_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: video_variants video_variants_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_variants
    ADD CONSTRAINT video_variants_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: videos videos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: videos videos_uploaded_for_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_uploaded_for_site_id_fkey FOREIGN KEY (uploaded_for_site_id) REFERENCES public.sites(id) ON DELETE SET NULL;


--
-- Name: advertiser_sites admin_advertiser_sites_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_advertiser_sites_all ON public.advertiser_sites USING (public.is_admin());


--
-- Name: agencies admin_agencies_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_agencies_all ON public.agencies USING (public.is_admin());


--
-- Name: agency_sites admin_agency_sites_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_agency_sites_all ON public.agency_sites USING (public.is_admin());


--
-- Name: alert_thresholds admin_alert_thresholds_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_alert_thresholds_all ON public.alert_thresholds USING (public.is_admin());


--
-- Name: alerts admin_alerts_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_alerts_all ON public.alerts USING (public.is_admin());


--
-- Name: analytics_categories admin_analytics_categories_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_analytics_categories_all ON public.analytics_categories USING (public.is_admin());


--
-- Name: audit_logs admin_audit_logs_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_audit_logs_all ON public.audit_logs USING (public.is_admin());


--
-- Name: campaign_sites admin_campaign_sites_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_campaign_sites_all ON public.campaign_sites USING (public.is_admin());


--
-- Name: campaign_videos admin_campaign_videos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_campaign_videos_all ON public.campaign_videos USING (public.is_admin());


--
-- Name: campaigns admin_campaigns_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_campaigns_all ON public.campaigns USING (public.is_admin());


--
-- Name: club_daily_stats admin_club_daily_stats_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_club_daily_stats_all ON public.club_daily_stats USING (public.is_admin());


--
-- Name: club_sessions admin_club_sessions_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_club_sessions_all ON public.club_sessions USING (public.is_admin());


--
-- Name: remote_commands admin_commands_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_commands_all ON public.remote_commands USING (public.is_admin());


--
-- Name: config_drafts admin_config_drafts_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_config_drafts_all ON public.config_drafts USING (public.is_admin());


--
-- Name: config_history admin_config_history_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_config_history_all ON public.config_history USING (public.is_admin());


--
-- Name: config_profiles admin_config_profiles_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_config_profiles_all ON public.config_profiles USING (public.is_admin());


--
-- Name: content_deployments admin_content_deployments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_content_deployments_all ON public.content_deployments USING (public.is_admin());


--
-- Name: site_sponsors admin_delete_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_delete_sponsors ON public.site_sponsors FOR DELETE USING ((public.current_site_id() IS NULL));


--
-- Name: generated_reports admin_generated_reports_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_generated_reports_all ON public.generated_reports USING (public.is_admin());


--
-- Name: groups admin_groups_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_groups_all ON public.groups USING (public.is_admin());


--
-- Name: metrics admin_metrics_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_metrics_all ON public.metrics USING (public.is_admin());


--
-- Name: orchestrated_deployments admin_orchestrated_deployments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_orchestrated_deployments_all ON public.orchestrated_deployments USING (public.is_admin());


--
-- Name: password_reset_tokens admin_password_reset_tokens_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_password_reset_tokens_all ON public.password_reset_tokens USING (public.is_admin());


--
-- Name: pending_commands admin_pending_commands_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_pending_commands_all ON public.pending_commands USING (public.is_admin());


--
-- Name: proof_of_broadcasts admin_proof_of_broadcasts_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_proof_of_broadcasts_all ON public.proof_of_broadcasts USING (public.is_admin());


--
-- Name: recurring_schedule_executions admin_recurring_schedule_executions_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_recurring_schedule_executions_all ON public.recurring_schedule_executions USING (public.is_admin());


--
-- Name: recurring_schedules admin_recurring_schedules_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_recurring_schedules_all ON public.recurring_schedules USING (public.is_admin());


--
-- Name: report_schedules admin_report_schedules_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_report_schedules_all ON public.report_schedules USING (public.is_admin());


--
-- Name: rls_audit_log admin_rls_audit_log_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_rls_audit_log_all ON public.rls_audit_log USING (public.is_admin());


--
-- Name: safe_sprint_velocity admin_safe_sprint_velocity_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_safe_sprint_velocity_all ON public.safe_sprint_velocity USING (public.is_admin());


--
-- Name: safe_story_status_override admin_safe_story_status_override_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_safe_story_status_override_all ON public.safe_story_status_override USING (public.is_admin());


--
-- Name: scheduled_reports admin_scheduled_reports_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_scheduled_reports_all ON public.scheduled_reports USING (public.is_admin());


--
-- Name: schema_migrations admin_schema_migrations_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_schema_migrations_all ON public.schema_migrations USING (public.is_admin());


--
-- Name: site_groups admin_site_groups_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_site_groups_all ON public.site_groups USING (public.is_admin());


--
-- Name: sites admin_sites_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sites_all ON public.sites USING (public.is_admin());


--
-- Name: software_updates admin_software_updates_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_software_updates_all ON public.software_updates USING (public.is_admin());


--
-- Name: sponsor_access_tokens admin_sponsor_access_tokens_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sponsor_access_tokens_all ON public.sponsor_access_tokens USING (public.is_admin());


--
-- Name: advertiser_videos admin_sponsor_videos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sponsor_videos_all ON public.advertiser_videos USING (public.is_admin());


--
-- Name: advertisers admin_sponsors_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sponsors_all ON public.advertisers USING (public.is_admin());


--
-- Name: subscription_history admin_subscription_history_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_subscription_history_all ON public.subscription_history USING (public.is_admin());


--
-- Name: subscription_suspension_reasons admin_subscription_suspension_reasons_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_subscription_suspension_reasons_all ON public.subscription_suspension_reasons USING (public.is_admin());


--
-- Name: update_deployments admin_update_deployments_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_update_deployments_all ON public.update_deployments USING (public.is_admin());


--
-- Name: site_sponsors admin_update_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_update_sponsors ON public.site_sponsors FOR UPDATE USING ((public.current_site_id() IS NULL));


--
-- Name: users admin_users_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_users_all ON public.users USING (public.is_admin());


--
-- Name: video_plays admin_video_plays_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_video_plays_all ON public.video_plays USING (public.is_admin());


--
-- Name: video_variants admin_video_variants_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_video_variants_all ON public.video_variants USING (public.is_admin());


--
-- Name: videos admin_videos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_videos_all ON public.videos USING (public.is_admin());


--
-- Name: campaign_videos advertiser_delete_own_campaign_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_delete_own_campaign_videos ON public.campaign_videos FOR DELETE USING ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaign_sites advertiser_insert_own_campaign_sites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_insert_own_campaign_sites ON public.campaign_sites FOR INSERT WITH CHECK ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaign_videos advertiser_insert_own_campaign_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_insert_own_campaign_videos ON public.campaign_videos FOR INSERT WITH CHECK ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaigns advertiser_insert_own_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_insert_own_campaigns ON public.campaigns FOR INSERT WITH CHECK ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: scheduled_reports advertiser_insert_own_scheduled_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_insert_own_scheduled_reports ON public.scheduled_reports FOR INSERT WITH CHECK ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: generated_reports advertiser_read_own_generated_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_read_own_generated_reports ON public.generated_reports FOR SELECT USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: report_schedules advertiser_read_own_report_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_read_own_report_schedules ON public.report_schedules FOR SELECT USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: scheduled_reports advertiser_read_own_scheduled_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_read_own_scheduled_reports ON public.scheduled_reports FOR SELECT USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: campaign_sites advertiser_select_own_campaign_sites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_select_own_campaign_sites ON public.campaign_sites FOR SELECT USING ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaign_videos advertiser_select_own_campaign_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_select_own_campaign_videos ON public.campaign_videos FOR SELECT USING ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaigns advertiser_select_own_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_select_own_campaigns ON public.campaigns FOR SELECT USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: advertiser_sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advertiser_sites ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_videos advertiser_update_own_campaign_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_update_own_campaign_videos ON public.campaign_videos FOR UPDATE USING ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id())))) WITH CHECK ((campaign_id IN ( SELECT c.id
   FROM (public.campaigns c
     JOIN public.users u ON ((u.advertiser_id = c.advertiser_id)))
  WHERE (u.id = public.current_user_id()))));


--
-- Name: campaigns advertiser_update_own_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_update_own_campaigns ON public.campaigns FOR UPDATE USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL))))) WITH CHECK ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: scheduled_reports advertiser_update_own_scheduled_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advertiser_update_own_scheduled_reports ON public.scheduled_reports FOR UPDATE USING ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL))))) WITH CHECK ((advertiser_id IN ( SELECT users.advertiser_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.advertiser_id IS NOT NULL)))));


--
-- Name: advertiser_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advertiser_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: advertisers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;

--
-- Name: agencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_sites agency_read_own_agency_sites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_read_own_agency_sites ON public.agency_sites FOR SELECT USING ((agency_id IN ( SELECT users.agency_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.agency_id IS NOT NULL)))));


--
-- Name: agency_sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_sites ENABLE ROW LEVEL SECURITY;

--
-- Name: alert_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_sites ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: club_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: club_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: club_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: config_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: config_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_history ENABLE ROW LEVEL SECURITY;

--
-- Name: config_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: content_deployments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_deployments ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: hostapd_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostapd_events ENABLE ROW LEVEL SECURITY;

--
-- Name: metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: neopro_template_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.neopro_template_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: neopro_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.neopro_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: orchestrated_deployments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orchestrated_deployments ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_commands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_commands ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: proof_of_broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proof_of_broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_schedule_executions read_recurring_schedule_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_recurring_schedule_executions ON public.recurring_schedule_executions FOR SELECT USING (true);


--
-- Name: recurring_schedules read_recurring_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_recurring_schedules ON public.recurring_schedules FOR SELECT USING (true);


--
-- Name: safe_sprint_velocity read_safe_sprint_velocity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_safe_sprint_velocity ON public.safe_sprint_velocity FOR SELECT USING (true);


--
-- Name: safe_story_status_override read_safe_story_status_override; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_safe_story_status_override ON public.safe_story_status_override FOR SELECT USING (true);


--
-- Name: subscription_suspension_reasons read_subscription_suspension_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_subscription_suspension_reasons ON public.subscription_suspension_reasons FOR SELECT USING (true);


--
-- Name: video_variants read_video_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_video_variants ON public.video_variants FOR SELECT USING (true);


--
-- Name: recurring_schedule_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_schedule_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: remote_auth_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remote_auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: remote_command_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remote_command_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: remote_commands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remote_commands ENABLE ROW LEVEL SECURITY;

--
-- Name: remotion_render_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remotion_render_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: report_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: rls_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rls_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: safe_proposal_status_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.safe_proposal_status_override ENABLE ROW LEVEL SECURITY;

--
-- Name: safe_sprint_velocity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.safe_sprint_velocity ENABLE ROW LEVEL SECURITY;

--
-- Name: safe_story_status_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.safe_story_status_override ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: config_drafts site_delete_own_config_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_delete_own_config_drafts ON public.config_drafts FOR DELETE USING ((site_id = public.current_site_id()));


--
-- Name: pending_commands site_delete_own_pending_commands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_delete_own_pending_commands ON public.pending_commands FOR DELETE USING ((site_id = public.current_site_id()));


--
-- Name: sponsor_access_tokens site_delete_own_sponsor_access_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_delete_own_sponsor_access_tokens ON public.sponsor_access_tokens FOR DELETE USING ((site_sponsor_id IN ( SELECT site_sponsors.id
   FROM public.site_sponsors
  WHERE (site_sponsors.site_id = public.current_site_id()))));


--
-- Name: site_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: club_sessions site_insert_club_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_club_sessions ON public.club_sessions FOR INSERT WITH CHECK ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR ((public.current_site_id() IS NULL) AND (site_id IN ( SELECT sites.id
   FROM public.sites)))));


--
-- Name: config_drafts site_insert_own_config_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_config_drafts ON public.config_drafts FOR INSERT WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: config_history site_insert_own_config_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_config_history ON public.config_history FOR INSERT WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: metrics site_insert_own_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_metrics ON public.metrics FOR INSERT WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: proof_of_broadcasts site_insert_own_proof_of_broadcasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_proof_of_broadcasts ON public.proof_of_broadcasts FOR INSERT WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: sponsor_access_tokens site_insert_own_sponsor_access_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_sponsor_access_tokens ON public.sponsor_access_tokens FOR INSERT WITH CHECK ((site_sponsor_id IN ( SELECT site_sponsors.id
   FROM public.site_sponsors
  WHERE (site_sponsors.site_id = public.current_site_id()))));


--
-- Name: site_sponsors site_insert_own_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_own_sponsors ON public.site_sponsors FOR INSERT WITH CHECK ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR (public.current_site_id() IS NULL)));


--
-- Name: video_plays site_insert_video_plays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_insert_video_plays ON public.video_plays FOR INSERT WITH CHECK ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR ((public.current_site_id() IS NULL) AND (site_id IN ( SELECT sites.id
   FROM public.sites)))));


--
-- Name: site_sponsor_videos site_manage_sponsor_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_manage_sponsor_videos ON public.site_sponsor_videos USING ((site_sponsor_id IN ( SELECT site_sponsors.id
   FROM public.site_sponsors
  WHERE (((public.current_site_id() IS NOT NULL) AND (site_sponsors.site_id = public.current_site_id())) OR (public.current_site_id() IS NULL)))));


--
-- Name: content_deployments site_read_group_content_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_group_content_deployments ON public.content_deployments FOR SELECT USING ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id())))));


--
-- Name: update_deployments site_read_group_update_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_group_update_deployments ON public.update_deployments FOR SELECT USING ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id())))));


--
-- Name: groups site_read_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_groups ON public.groups FOR SELECT USING (true);


--
-- Name: sites site_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own ON public.sites FOR SELECT USING ((id = public.current_site_id()));


--
-- Name: agency_sites site_read_own_agency_sites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_agency_sites ON public.agency_sites FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: alerts site_read_own_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_alerts ON public.alerts FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: campaign_sites site_read_own_campaign_sites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_campaign_sites ON public.campaign_sites FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: club_daily_stats site_read_own_club_daily_stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_club_daily_stats ON public.club_daily_stats FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: club_sessions site_read_own_club_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_club_sessions ON public.club_sessions FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: remote_commands site_read_own_commands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_commands ON public.remote_commands FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: config_drafts site_read_own_config_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_config_drafts ON public.config_drafts FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: config_history site_read_own_config_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_config_history ON public.config_history FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: content_deployments site_read_own_content_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_content_deployments ON public.content_deployments FOR SELECT USING ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id())));


--
-- Name: generated_reports site_read_own_generated_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_generated_reports ON public.generated_reports FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: metrics site_read_own_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_metrics ON public.metrics FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: orchestrated_deployments site_read_own_orchestrated_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_orchestrated_deployments ON public.orchestrated_deployments FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: pending_commands site_read_own_pending_commands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_pending_commands ON public.pending_commands FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: proof_of_broadcasts site_read_own_proof_of_broadcasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_proof_of_broadcasts ON public.proof_of_broadcasts FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: report_schedules site_read_own_report_schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_report_schedules ON public.report_schedules FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: site_groups site_read_own_site_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_site_groups ON public.site_groups FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: sponsor_access_tokens site_read_own_sponsor_access_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_sponsor_access_tokens ON public.sponsor_access_tokens FOR SELECT USING ((site_sponsor_id IN ( SELECT site_sponsors.id
   FROM public.site_sponsors
  WHERE (site_sponsors.site_id = public.current_site_id()))));


--
-- Name: subscription_history site_read_own_subscription_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_subscription_history ON public.subscription_history FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: update_deployments site_read_own_update_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_update_deployments ON public.update_deployments FOR SELECT USING ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id())));


--
-- Name: video_plays site_read_own_video_plays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_own_video_plays ON public.video_plays FOR SELECT USING ((site_id = public.current_site_id()));


--
-- Name: software_updates site_read_software_updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_software_updates ON public.software_updates FOR SELECT USING (true);


--
-- Name: advertiser_videos site_read_sponsor_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_sponsor_videos ON public.advertiser_videos FOR SELECT USING (true);


--
-- Name: advertisers site_read_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_sponsors ON public.advertisers FOR SELECT USING (true);


--
-- Name: videos site_read_videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_read_videos ON public.videos FOR SELECT USING (true);


--
-- Name: site_sponsors site_select_own_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_select_own_sponsors ON public.site_sponsors FOR SELECT USING ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR (public.current_site_id() IS NULL)));


--
-- Name: site_sponsor_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_sponsor_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: site_sponsor_daily_video_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_sponsor_daily_video_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: site_sponsor_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_sponsor_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: site_sponsors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_sponsors ENABLE ROW LEVEL SECURITY;

--
-- Name: club_sessions site_update_club_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_club_sessions ON public.club_sessions FOR UPDATE USING ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR ((public.current_site_id() IS NULL) AND (site_id IN ( SELECT sites.id
   FROM public.sites))))) WITH CHECK ((((public.current_site_id() IS NOT NULL) AND (site_id = public.current_site_id())) OR ((public.current_site_id() IS NULL) AND (site_id IN ( SELECT sites.id
   FROM public.sites)))));


--
-- Name: content_deployments site_update_group_content_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_group_content_deployments ON public.content_deployments FOR UPDATE USING ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id()))))) WITH CHECK ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id())))));


--
-- Name: update_deployments site_update_group_update_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_group_update_deployments ON public.update_deployments FOR UPDATE USING ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id()))))) WITH CHECK ((((target_type)::text = 'group'::text) AND (target_id IN ( SELECT site_groups.group_id
   FROM public.site_groups
  WHERE (site_groups.site_id = public.current_site_id())))));


--
-- Name: sites site_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own ON public.sites FOR UPDATE USING ((id = public.current_site_id())) WITH CHECK ((id = public.current_site_id()));


--
-- Name: remote_commands site_update_own_commands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own_commands ON public.remote_commands FOR UPDATE USING ((site_id = public.current_site_id())) WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: config_drafts site_update_own_config_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own_config_drafts ON public.config_drafts FOR UPDATE USING ((site_id = public.current_site_id())) WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: content_deployments site_update_own_content_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own_content_deployments ON public.content_deployments FOR UPDATE USING ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id()))) WITH CHECK ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id())));


--
-- Name: orchestrated_deployments site_update_own_orchestrated_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own_orchestrated_deployments ON public.orchestrated_deployments FOR UPDATE USING ((site_id = public.current_site_id())) WITH CHECK ((site_id = public.current_site_id()));


--
-- Name: update_deployments site_update_own_update_deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_update_own_update_deployments ON public.update_deployments FOR UPDATE USING ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id()))) WITH CHECK ((((target_type)::text = 'site'::text) AND (target_id = public.current_site_id())));


--
-- Name: site_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

--
-- Name: software_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.software_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsor_access_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsor_access_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_suspension_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_suspension_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: template_image_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_image_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: template_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: template_text_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_text_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: template_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: update_deployments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.update_deployments ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_tokens user_delete_own_password_reset_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_delete_own_password_reset_tokens ON public.password_reset_tokens FOR DELETE USING ((user_id = public.current_user_id()));


--
-- Name: agencies user_read_own_agency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_read_own_agency ON public.agencies FOR SELECT USING ((id IN ( SELECT users.agency_id
   FROM public.users
  WHERE ((users.id = public.current_user_id()) AND (users.agency_id IS NOT NULL)))));


--
-- Name: password_reset_tokens user_read_own_password_reset_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_read_own_password_reset_tokens ON public.password_reset_tokens FOR SELECT USING ((user_id = public.current_user_id()));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: video_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: video_club_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_club_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: video_plays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_plays ENABLE ROW LEVEL SECURITY;

--
-- Name: video_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

--
-- Name: ensure_rls; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
         WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
   EXECUTE FUNCTION public.rls_auto_enable();


--
-- PostgreSQL database dump complete
--


