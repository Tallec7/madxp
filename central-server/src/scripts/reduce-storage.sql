-- =============================================================
-- DIAGNOSTIC + NETTOYAGE STOCKAGE SUPABASE
-- Date: 2026-04-01
-- Contexte: Free plan 500MB, services restreints
-- =============================================================

-- ============================================================
-- ÉTAPE 1 : DIAGNOSTIC — Taille des tables
-- ============================================================

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  pg_total_relation_size(schemaname || '.' || tablename) AS total_bytes,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) AS index_size,
  (SELECT reltuples::bigint FROM pg_class WHERE oid = (schemaname || '.' || tablename)::regclass) AS estimated_rows
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 30;

-- ============================================================
-- ÉTAPE 2 : NETTOYAGE AGRESSIF — Réduire la rétention
-- ============================================================

-- video_plays : 90j → 15j (les daily_stats conservent l'historique long terme)
DELETE FROM video_plays WHERE played_at < NOW() - INTERVAL '15 days';

-- advertiser_impressions : 90j → 15j (les daily_stats conservent l'historique)
DELETE FROM advertiser_impressions WHERE played_at < NOW() - INTERVAL '15 days';

-- metrics : 7j → 3j (diagnostics courts uniquement)
DELETE FROM metrics WHERE recorded_at < NOW() - INTERVAL '3 days';

-- alerts : 90j → 30j
DELETE FROM alerts WHERE created_at < NOW() - INTERVAL '30 days';

-- audit_logs : 90j → 30j
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '30 days';

-- remote_commands : 30j → 7j
DELETE FROM remote_commands WHERE created_at < NOW() - INTERVAL '7 days';

-- config_history : garder 5 versions au lieu de 20
WITH ranked AS (
  SELECT id, site_id,
         ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY deployed_at DESC) AS rn
  FROM config_history
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 5
)
UPDATE config_history
SET previous_version_id = NULL
WHERE previous_version_id IN (SELECT id FROM to_delete);

WITH ranked AS (
  SELECT id, site_id,
         ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY deployed_at DESC) AS rn
  FROM config_history
)
DELETE FROM config_history
WHERE id IN (SELECT id FROM ranked WHERE rn > 5);

-- recurring_schedule_executions : 30j → 7j
DELETE FROM recurring_schedule_executions WHERE started_at < NOW() - INTERVAL '7 days';

-- sponsor_access_tokens expirés
DELETE FROM sponsor_access_tokens WHERE expires_at < NOW();

-- ============================================================
-- ÉTAPE 3 : NETTOYAGE TABLES SYSTÈME (si présentes)
-- ============================================================

-- content_deployments terminés depuis longtemps
DELETE FROM content_deployments
WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '15 days';

-- update_deployments terminés depuis longtemps
DELETE FROM update_deployments
WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '15 days';

-- ============================================================
-- ÉTAPE 4 : RÉCUPÉRER L'ESPACE DISQUE
-- ============================================================

-- VACUUM libère l'espace pour PostgreSQL (sans FULL pour éviter le lock)
VACUUM ANALYZE video_plays;
VACUUM ANALYZE advertiser_impressions;
VACUUM ANALYZE metrics;
VACUUM ANALYZE alerts;
VACUUM ANALYZE audit_logs;
VACUUM ANALYZE remote_commands;
VACUUM ANALYZE config_history;
VACUUM ANALYZE recurring_schedule_executions;
VACUUM ANALYZE content_deployments;
VACUUM ANALYZE update_deployments;

-- ============================================================
-- ÉTAPE 5 : VÉRIFICATION — Taille après nettoyage
-- ============================================================

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  (SELECT reltuples::bigint FROM pg_class WHERE oid = (schemaname || '.' || tablename)::regclass) AS estimated_rows
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 15;
