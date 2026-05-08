-- ADR-115 : Backfill auth (clubName, password) dans config_profiles depuis
-- sites.local_config_mirror.
--
-- Contexte : avant ADR-115, le bouton "Déployer Authentification Club" du
-- dashboard mode Pi pushait `update_config` au Pi sans mettre à jour le profil
-- cloud par défaut. Résultat : le profil restait à `auth: { password: "" }` et
-- écrasait le Pi à chaque sync_profiles (notamment au reboot via applyProfile).
--
-- Ce script remplit le profil cloud par défaut depuis la dernière config Pi
-- remontée au cloud (`sites.local_config_mirror`, alimenté par
-- config-sync.handler quand le Pi se synchronise).
--
-- Idempotent : ne touche que les profils dont auth.password est null/vide ET
-- où le Pi a remonté un auth non vide. Ne casse jamais un profil déjà setupé.
--
-- Run :
--   source central-server/.env && psql "$DATABASE_URL" -f central-server/src/scripts/backfill-config-profiles-auth.sql

\echo '== ADR-115 backfill config_profiles.auth =='

-- Snapshot avant pour audit
SELECT
  COUNT(*) FILTER (WHERE cp.configuration->'auth'->>'password' IS NULL OR cp.configuration->'auth'->>'password' = '') AS profiles_auth_empty,
  COUNT(*) FILTER (WHERE s.local_config_mirror->'auth'->>'password' IS NOT NULL AND s.local_config_mirror->'auth'->>'password' != '') AS sites_with_pi_auth
FROM config_profiles cp
JOIN sites s ON s.id = cp.site_id
WHERE cp.is_default = TRUE;

-- Backfill : copie auth Pi → profil cloud par défaut quand le profil est vide.
WITH updated AS (
  UPDATE config_profiles cp
  SET configuration = jsonb_set(
    COALESCE(cp.configuration, '{}'::jsonb),
    '{auth}',
    COALESCE(cp.configuration->'auth', '{}'::jsonb) || jsonb_build_object(
      'clubName', s.local_config_mirror->'auth'->>'clubName',
      'password', s.local_config_mirror->'auth'->>'password',
      'sessionDuration', COALESCE((s.local_config_mirror->'auth'->>'sessionDuration')::bigint, 86400000)
    )
  ),
  updated_at = NOW()
  FROM sites s
  WHERE cp.site_id = s.id
    AND cp.is_default = TRUE
    AND s.local_config_mirror IS NOT NULL
    AND s.local_config_mirror->'auth'->>'password' IS NOT NULL
    AND s.local_config_mirror->'auth'->>'password' != ''
    AND (
      cp.configuration->'auth'->>'password' IS NULL
      OR cp.configuration->'auth'->>'password' = ''
    )
  RETURNING cp.id, cp.site_id, s.site_name
)
SELECT COUNT(*) AS profiles_backfilled, array_agg(site_name ORDER BY site_name) AS sites
FROM updated;

\echo '== Done =='
