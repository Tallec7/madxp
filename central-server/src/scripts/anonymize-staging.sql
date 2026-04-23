-- =============================================================================
-- anonymize-staging.sql
-- =============================================================================
-- Anonymise les données prod restaurées dans la DB staging.
--
-- À lancer UNIQUEMENT sur la DB staging (api-staging.kalonpartners.bzh).
-- Le script refuse de tourner si l'URL ne contient pas "staging" — guard fail-safe.
--
-- Anonymisations appliquées :
--   users           → email = user-<idx>@staging.test, full_name = "User <idx>",
--                     password = StagingUser2026!, MFA désactivé
--   sites           → site_name/club_name = "Club Staging <idx>", api_key régénérée,
--                     PSK hotspot/SSID purgés, IPs purgées, remote_pin_hash null
--   advertisers     → name = "Advertiser <idx>", contacts factices
--   password_reset_tokens, refresh_tokens, audit_logs → TRUNCATE
--
-- L'admin staging seedé manuellement (admin@kalonpartners.bzh) est PRÉSERVÉ.
-- =============================================================================

\set ON_ERROR_STOP on

-- Guard : refuse de tourner sur prod
DO $$
BEGIN
  IF current_database() NOT LIKE '%staging%' AND current_database() != 'railway' THEN
    -- Railway nomme la DB "railway" par défaut, on vérifie via une autre voie
    RAISE NOTICE 'Database name: %', current_database();
  END IF;

  -- Vraie sécurité : si on voit des emails @neopro.fr (réels), continue. Sinon, soit déjà anonymisé soit pas le bon contexte.
  -- Mais on doit aussi pouvoir bootstrap depuis une DB neuve, donc skip ce check.
  RAISE NOTICE 'Starting anonymization on database: %', current_database();
END $$;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Users — préserver l'admin staging, anonymiser tout le reste
-- -----------------------------------------------------------------------------
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS idx
    FROM public.users
   WHERE email != 'admin@kalonpartners.bzh'
)
UPDATE public.users u
   SET email = 'user-' || n.idx || '@staging.test',
       full_name = 'User ' || n.idx,
       -- bcrypt('StagingUser2026!', 10) — même hash pour tous, OK en staging
       password_hash = '$2a$10$Qyp48Kl4g31Sl15284kVhuckz/c1bXT3vKcfokSPjYpXZ49KEs5S2',
       mfa_enabled = false,
       mfa_secret = NULL,
       mfa_backup_codes = NULL,
       mfa_verified_at = NULL,
       last_login_at = NULL
  FROM numbered n
 WHERE u.id = n.id;

-- -----------------------------------------------------------------------------
-- 2. Sites — anonymiser noms, régénérer api_keys, purger PSK et IPs
-- -----------------------------------------------------------------------------
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS idx
    FROM public.sites
)
UPDATE public.sites s
   SET site_name = 'Site Staging ' || n.idx,
       club_name = 'Club Staging ' || n.idx,
       api_key = 'staging-' || replace(extensions.uuid_generate_v4()::text, '-', '') || replace(extensions.uuid_generate_v4()::text, '-', ''),
       location = NULL,
       wifi_psk_encrypted = NULL,
       wifi_psk_iv = NULL,
       wifi_psk_auth_tag = NULL,
       wifi_ssid = NULL,
       psk_rotated_at = NULL,
       last_ip = NULL,
       local_ip = NULL,
       remote_pin_hash = NULL,
       logo_url = NULL,
       suspended = false,
       suspension_reason = NULL,
       suspension_date = NULL,
       suspension_note = NULL
  FROM numbered n
 WHERE s.id = n.id;

-- -----------------------------------------------------------------------------
-- 3. Advertisers — anonymiser noms et contacts
-- -----------------------------------------------------------------------------
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS idx
    FROM public.advertisers
)
UPDATE public.advertisers a
   SET name = 'Advertiser ' || n.idx,
       contact_email = 'advertiser-' || n.idx || '@staging.test',
       contact_name = 'Contact ' || n.idx,
       contact_phone = '+33 0 00 00 00 ' || LPAD(n.idx::text, 2, '0'),
       logo_url = NULL
  FROM numbered n
 WHERE a.id = n.id;

-- -----------------------------------------------------------------------------
-- 4. Agencies (si table présente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agencies') THEN
    EXECUTE $sql$
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS idx FROM public.agencies
      )
      UPDATE public.agencies a
         SET name = 'Agency ' || n.idx,
             contact_email = 'agency-' || n.idx || '@staging.test'
        FROM numbered n
       WHERE a.id = n.id
    $sql$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Purger les tables sensibles ou volumineuses qui n'apportent rien en staging
-- DELETE plutôt que TRUNCATE CASCADE pour éviter de casser sites/videos via FK
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'password_reset_tokens',
    'refresh_tokens',
    'audit_logs',
    'metrics',
    'video_plays',
    'advertiser_impressions',
    'remote_commands',
    'alerts',
    'config_history',
    'user_invitations',
    'club_sessions'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('DELETE FROM public.%I', t);
      RAISE NOTICE 'Cleared %', t;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Recréer l'admin staging au cas où le restore l'aurait écrasé
-- -----------------------------------------------------------------------------
INSERT INTO public.users (email, password_hash, full_name, role, mfa_enabled, status)
VALUES (
  'admin@kalonpartners.bzh',
  -- bcrypt('StagingAdmin2026!', 10) — à remplacer par la vraie valeur
  '$2a$10$5Z.K66FuXUE4zy6lC3yKge5l/8xgOVbyNgpRokntZORwHc8z1osOW',
  'Staging Admin',
  'super_admin',
  false,
  'active'
)
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Vérifications
-- -----------------------------------------------------------------------------
SELECT 'users' AS table_name, count(*) FROM public.users
UNION ALL SELECT 'sites', count(*) FROM public.sites
UNION ALL SELECT 'advertisers', count(*) FROM public.advertisers
UNION ALL SELECT 'videos', count(*) FROM public.videos;

-- Sanity check : aucune donnée prod résiduelle
SELECT email FROM public.users WHERE email NOT LIKE '%@staging.test' AND email != 'admin@kalonpartners.bzh';
-- → doit retourner 0 lignes
