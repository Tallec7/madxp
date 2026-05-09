-- Diagnostic vidéos secondaires (incident 2026-05-09)
--
-- Contexte : 3 sites montrent "écran noir" sur display secondaire (LED-banner,
-- SaaS browser). Hypothèse principale : configuration.displays[idx].type absent
-- ou incorrect → displayType résoud à 'secondary' → variant 'led-banner' non trouvé
-- → fallback sur primary path (404 FTP) → écran noir.
--
-- Hypothèse secondaire : 217 vidéos legacy flat-path, certaines 404 sur FTP.
--
-- Usage :
--   source central-server/.env && psql "$DATABASE_URL" -f \
--     central-server/src/scripts/diagnose-secondary-displays.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Sites avec des displays configurés (ADR-114 write-through)
-- ---------------------------------------------------------------------------

\echo '=== 1. Sites avec displays configurés ==='
SELECT
  s.id,
  s.site_name,
  s.club_name,
  s.site_type,
  s.status,
  s.last_seen_at,
  jsonb_array_length(COALESCE(s.displays, '[]'::jsonb)) AS display_count,
  s.displays
FROM sites s
WHERE s.displays IS NOT NULL
  AND jsonb_array_length(s.displays) > 0
ORDER BY s.last_seen_at DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 2) Cohérence displays cloud ↔ Pi (local_config_mirror)
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 2. Cohérence displays cloud ↔ configuration.json Pi ==='
SELECT
  s.id,
  s.site_name,
  s.site_type,
  s.displays AS cloud_displays,
  s.local_config_mirror->'displays' AS pi_config_displays,
  CASE
    WHEN s.displays IS NULL THEN 'no cloud displays'
    WHEN s.local_config_mirror->'displays' IS NULL THEN '⚠️ PI MISSING DISPLAYS (need backfill)'
    WHEN s.displays = (s.local_config_mirror->'displays')::jsonb THEN '✅ in sync'
    ELSE '⚠️ DRIFT (cloud ≠ pi)'
  END AS sync_status
FROM sites s
WHERE s.displays IS NOT NULL
  AND jsonb_array_length(s.displays) > 0
ORDER BY sync_status, s.site_name;

-- ---------------------------------------------------------------------------
-- 3) Variants par display_type (état actuel)
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 3. Comptage variants par display_type ==='
SELECT
  display_type,
  COUNT(*) AS variant_count,
  COUNT(DISTINCT video_id) AS distinct_videos
FROM video_variants
GROUP BY display_type
ORDER BY variant_count DESC;

-- ---------------------------------------------------------------------------
-- 4) Vidéos avec variants 'led-banner' mais SANS variant pour RACC
--    (heuristique : site avec un display de type led-banner)
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 4. Couverture variants led-banner par site (sites avec display led-banner) ==='
WITH led_sites AS (
  SELECT s.id AS site_id, s.site_name
  FROM sites s
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(s.displays, '[]'::jsonb)) d
    WHERE d->>'type' = 'led-banner'
  )
),
site_video_stats AS (
  SELECT
    sv.site_id,
    COUNT(DISTINCT sv.video_id) AS total_videos,
    COUNT(DISTINCT vv.video_id) FILTER (WHERE vv.display_type = 'led-banner') AS videos_with_led_banner
  FROM site_videos sv
  LEFT JOIN video_variants vv ON vv.video_id = sv.video_id AND vv.display_type = 'led-banner'
  GROUP BY sv.site_id
)
SELECT
  ls.site_name,
  ls.site_id,
  svs.total_videos,
  svs.videos_with_led_banner,
  svs.total_videos - svs.videos_with_led_banner AS videos_WITHOUT_led_banner,
  ROUND(100.0 * svs.videos_with_led_banner / NULLIF(svs.total_videos, 0), 1) AS coverage_pct
FROM led_sites ls
JOIN site_video_stats svs ON svs.site_id = ls.site_id
ORDER BY coverage_pct ASC;

-- ---------------------------------------------------------------------------
-- 5) Vidéos legacy flat-path (storage_path ≠ 'videos/*') par site
--    → candidates à 404 FTP
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 5. Vidéos legacy flat-path exposées sur des sites actifs ==='
SELECT
  s.site_name,
  s.site_type,
  s.status,
  COUNT(DISTINCT sv.video_id) AS legacy_videos_exposed,
  STRING_AGG(DISTINCT v.filename, ', ' ORDER BY v.filename) FILTER (WHERE v.storage_path NOT LIKE 'videos/%') AS sample_filenames
FROM site_videos sv
JOIN videos v ON v.id = sv.video_id
JOIN sites s ON s.id = sv.site_id
WHERE v.storage_path IS NOT NULL
  AND v.storage_path NOT LIKE 'videos/%'
  AND s.status = 'active'
GROUP BY s.id, s.site_name, s.site_type, s.status
ORDER BY legacy_videos_exposed DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 6) Commandes backfill en attente pour receiver_assignment_updated
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 6. Commandes receiver_assignment_updated en queue (non délivrées) ==='
SELECT
  cq.id,
  cq.site_id,
  s.site_name,
  cq.command_type,
  cq.status,
  cq.created_at,
  cq.executed_at
FROM command_queue cq
JOIN sites s ON s.id = cq.site_id
WHERE cq.command_type = 'receiver_assignment_updated'
  AND cq.status IN ('pending', 'failed')
ORDER BY cq.created_at DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 7) Sites actifs avec display secondaire mais SANS variants led-banner
--    (écran noir attendu si displayType résout vers 'led-banner')
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== 7. Sites avec led-banner display mais 0 variant led-banner dans pool vidéo ==='
WITH led_sites AS (
  SELECT s.id AS site_id, s.site_name, s.site_type, s.status
  FROM sites s
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(s.displays, '[]'::jsonb)) d
    WHERE d->>'type' = 'led-banner'
  )
    AND s.status = 'active'
)
SELECT
  ls.site_name,
  ls.site_id,
  ls.site_type,
  COUNT(DISTINCT sv.video_id) AS total_assigned_videos,
  COUNT(DISTINCT vv.video_id) FILTER (WHERE vv.display_type = 'led-banner') AS videos_with_led_banner
FROM led_sites ls
JOIN site_videos sv ON sv.site_id = ls.site_id
LEFT JOIN video_variants vv ON vv.video_id = sv.video_id AND vv.display_type = 'led-banner'
GROUP BY ls.site_id, ls.site_name, ls.site_type
HAVING COUNT(DISTINCT vv.video_id) FILTER (WHERE vv.display_type = 'led-banner') = 0;
