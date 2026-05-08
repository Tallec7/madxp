-- One-shot reclass historique — incident Bottière 2026-05-08
--
-- Contexte : avant le fix tolérant filename/original_name dans
-- `config-analytics-metadata.ts`, les plays de sponsors dont le filename
-- contenait des espaces, apostrophes ou '&' arrivaient avec
-- `video_plays.category = 'other'` malgré un `site_sponsor_id` valide.
-- Conséquence : le CRON `calculate_site_sponsor_daily_stats` filtrait ces
-- rows (`WHERE category IN ('sponsor', 'sponsor_local', 'sponsor_neopro')`)
-- → rapports sponsor sous-comptés.
--
-- Ce script reclasse rétroactivement les rows orphelines :
-- "play avec site_sponsor_id résolu mais category='other'" → 'sponsor_neopro'
-- si la row a aussi un `sponsor_id` (= advertiser_id NEOPRO) ; sinon
-- 'sponsor_local'. Aligne le comportement avec `config-analytics-metadata.ts`
-- (advertiser_id présent → sponsor_neopro ; sinon site_sponsor_id → sponsor_local).
--
-- Usage :
--   railway ssh --service neopro-central 'node -e "
--     const { Pool } = require(\"pg\");
--     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
--     pool.query(require(\"fs\").readFileSync(\"src/scripts/reclassify-misclassified-sponsor-plays.sql\", \"utf8\"))
--       .then(r => console.log(r.rows)).finally(() => pool.end());
--   "'
--
-- Ou via psql avec DATABASE_URL pointant sur la prod :
--   psql "$DATABASE_URL" -f central-server/src/scripts/reclassify-misclassified-sponsor-plays.sql
--
-- Idempotent : un second run ne touche aucune row (filtre `category = 'other'`).

-- Dry-run d'abord — vérifier le périmètre avant UPDATE
SELECT
  s.site_name,
  COUNT(*) AS plays_to_reclassify,
  MIN(vp.played_at) AS oldest,
  MAX(vp.played_at) AS most_recent
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
WHERE vp.site_sponsor_id IS NOT NULL
  AND vp.category = 'other'
GROUP BY s.site_name
ORDER BY plays_to_reclassify DESC;

-- Reclass effectif
UPDATE video_plays
SET category = CASE
  WHEN sponsor_id IS NOT NULL THEN 'sponsor_neopro'
  ELSE 'sponsor_local'
END
WHERE site_sponsor_id IS NOT NULL
  AND category = 'other';

-- Confirmer le résultat
SELECT
  COUNT(*) AS total_reclassified
FROM video_plays
WHERE category = 'sponsor_local'
  AND site_sponsor_id IS NOT NULL
  AND played_at > NOW() - INTERVAL '7 days';
