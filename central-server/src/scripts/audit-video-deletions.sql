-- Diagnostic one-shot — investigation incident "vidéo manquante sur SaaS".
--
-- Contexte : le 25/04/2026, le site SaaS 3c62b930-0061-4526-b8ac-6206394c0052
-- a 404 sur la vidéo acff5e34-173b-4d10-912f-617f7833f813.mp4 (fichier absent
-- du FTP, mais la config déployée la référence encore). Voir incident PR #613.
--
-- Objectifs :
--   1) Identifier QUI / QUAND / VIA QUEL endpoint la vidéo a été supprimée.
--   2) Estimer combien d'autres orphelines existent dans la flotte.
--   3) Calibrer l'urgence du chantier "cleanup cascade des configs déployées"
--      (PR2 du plan).
--
-- Usage :
--   source central-server/.env && psql "$DATABASE_URL" -f \
--     central-server/src/scripts/audit-video-deletions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Trace de la suppression de acff5e34
-- ---------------------------------------------------------------------------

\echo '--- 1a. Audit log de la vidéo acff5e34 ---'
SELECT
  created_at,
  action,
  user_id,
  target_type,
  target_id,
  details
FROM audit_logs
WHERE
  target_id = 'acff5e34-173b-4d10-912f-617f7833f813'
  OR details::text ILIKE '%acff5e34%'
  OR details::text ILIKE '%617f7833f813%'
ORDER BY created_at DESC
LIMIT 20;

\echo '--- 1b. La vidéo existe-t-elle encore en DB ? ---'
SELECT id, filename, storage_path, category, created_at
FROM videos
WHERE id = 'acff5e34-173b-4d10-912f-617f7833f813';

\echo '--- 1c. Toutes les suppressions de vidéo des 30 derniers jours ---'
SELECT
  DATE_TRUNC('day', created_at) AS day,
  action,
  COUNT(*) AS deletions,
  COUNT(DISTINCT user_id) AS distinct_users
FROM audit_logs
WHERE
  action IN ('VIDEO_DELETED', 'VIDEO_DELETED_CASCADE')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY day, action
ORDER BY day DESC;

-- ---------------------------------------------------------------------------
-- 2) Comptage des orphelines actuelles dans la flotte
-- ---------------------------------------------------------------------------
-- "Orpheline" = vidéo référencée par site_videos mais qui n'existe plus dans
-- la table videos (cascade DB devrait empêcher ce cas, mais on vérifie).
-- ATTENTION : ne détecte PAS les orphelines FTP (fichier absent du stockage
-- mais ligne videos toujours là). Pour celles-là, il faut un audit FTP
-- (out of scope SQL — voir PR2c CRON).

\echo '--- 2a. Lignes site_videos pointant vers une videos.id inexistante ---'
SELECT
  sv.site_id,
  s.name AS site_name,
  sv.video_id,
  sv.added_at
FROM site_videos sv
LEFT JOIN videos v ON v.id = sv.video_id
LEFT JOIN sites s ON s.id = sv.site_id
WHERE v.id IS NULL
ORDER BY sv.added_at DESC
LIMIT 50;

\echo '--- 2b. Comptage agrégé des orphelines DB (par site) ---'
SELECT
  sv.site_id,
  s.name AS site_name,
  s.site_type,
  COUNT(*) AS orphan_video_refs
FROM site_videos sv
LEFT JOIN videos v ON v.id = sv.video_id
LEFT JOIN sites s ON s.id = sv.site_id
WHERE v.id IS NULL
GROUP BY sv.site_id, s.name, s.site_type
ORDER BY orphan_video_refs DESC;

\echo '--- 2c. Vidéos dont le storage_path peut pointer vers un fichier mort (heuristique) ---'
-- On ne peut pas vérifier l'existence FTP depuis psql.
-- Heuristique : vidéos jamais lues dans video_plays depuis 30j = candidates suspectes.
SELECT
  v.id,
  v.filename,
  v.storage_path,
  v.created_at,
  COUNT(vp.id) AS plays_30d
FROM videos v
LEFT JOIN video_plays vp ON vp.video_id = v.id AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY v.id
HAVING COUNT(vp.id) = 0
ORDER BY v.created_at DESC
LIMIT 50;

-- ---------------------------------------------------------------------------
-- 3) Vérification de la config du site impacté (3c62b930)
-- ---------------------------------------------------------------------------

\echo '--- 3a. Vidéos actuellement référencées pour le site 3c62b930 ---'
SELECT
  v.id,
  v.filename,
  v.category,
  v.storage_path,
  sv.added_at
FROM site_videos sv
JOIN videos v ON v.id = sv.video_id
WHERE sv.site_id = '3c62b930-0061-4526-b8ac-6206394c0052'
ORDER BY v.category, v.filename;

\echo '--- 3b. Profils config du site (champ "configuration" JSONB) ---'
-- Cherche des références à acff5e34 dans les configurations stockées.
SELECT
  cp.id,
  cp.name,
  cp.is_active,
  cp.updated_at
FROM config_profiles cp
WHERE
  cp.site_id = '3c62b930-0061-4526-b8ac-6206394c0052'
  AND cp.configuration::text ILIKE '%acff5e34%'
ORDER BY cp.updated_at DESC;

-- ============================================================================
-- Interprétation attendue
-- ============================================================================
-- - Si 1a renvoie 0 ligne ⇒ la vidéo a été supprimée HORS audit (suppression
--   directe SQL, ou ancien code sans audit log). Loguer cette gap dans la
--   prochaine PR audit.
-- - Si 2b renvoie >0 sites ⇒ la cascade DB a un trou ; vérifier la migration
--   site_videos pour `ON DELETE CASCADE`.
-- - Si 3b renvoie ≥1 ligne ⇒ la vidéo morte est encore dans un config_profile
--   actif ; PR2 doit aussi nettoyer les JSONB des profils.
