-- Fix — Nettoyage des video_url Railway cassées dans les templates utilisateur
-- -----------------------------------------------------------------------------
-- Contexte (2026-05-07 bis) :
--   Pendant la session de correction du bug schema_version, l'utilisateur a créé
--   des templates dans le wizard en pickant des assets BUT_simple depuis la
--   bibliothèque AVANT que PR #890 (filtre des archivés) soit déployé.
--   Ces templates ont reçu des video_url pointant vers
--   `neopro-central-production.up.railway.app/BUT_simple_{A,B,C}.webm`
--   (pattern ROOT domain — pas sur Railway, pas sur FTP Hostinger → 404 spam).
--
-- Différence avec cleanup-broken-railway-asset-urls-2026-05-07-bis.sql :
--   Ce script cible les templates NON-archivés créés par le user (pas les
--   templates seed BUT Simple / ButImgJoueur déjà archivés lors de l'incident
--   matin). Le bis script trouvait 0 row car ces templates avaient été archivés
--   AVANT le run. Ce script NULL-ise les video_url cassées pour ne pas archiver
--   les templates utilisateur (on garde la structure, on vide juste le src cassé).
--
-- Effet :
--   - `template_layers.video_url` → NULL pour les layers Railway cassés
--   - TemplateRuntime.tsx `isValidSrc()` retourne '' pour NULL → layer sauté
--     silencieusement, pas de 404 spam, pas de tab freeze
--   - Le layer reste dans le template pour que le user puisse ré-assigner un
--     asset valide depuis la bibliothèque (qui filtre les archivés depuis PR #890)
--
-- Usage (depuis main worktree, après source scripts/use-prod-db.sh) :
--   psql "$DATABASE_URL" -f central-server/src/scripts/fix-user-templates-broken-railway-urls.sql
--
-- Sécurité : ROLLBACK par défaut. Vérifier l'audit avant de remplacer par COMMIT.

\set ON_ERROR_STOP on

BEGIN;

-- ── Audit : layers cassés dans templates NON-archivés ─────────────────────

\echo '── Audit : layers Railway cassés (templates actifs) ──'
SELECT
  t.id         AS template_id,
  t.name       AS template_name,
  t.status,
  t.composition_id,
  l.id         AS layer_id,
  l.name       AS layer_name,
  l.video_url
FROM neopro_templates t
JOIN template_layers l ON l.template_id = t.id
WHERE l.video_url ~* 'up\.railway\.app'
  AND t.status IS DISTINCT FROM 'archived'
ORDER BY t.name, l.z_index;

\echo ''
\echo '── Audit : variants Railway cassés (templates actifs) ──'
SELECT
  t.id         AS template_id,
  t.name       AS template_name,
  t.status,
  v.id         AS variant_id,
  v.name       AS variant_name,
  v.background_video_url
FROM neopro_templates t
JOIN template_variants v ON v.template_id = t.id
WHERE v.background_video_url ~* 'up\.railway\.app'
  AND t.status IS DISTINCT FROM 'archived'
ORDER BY t.name, v.sort_order;

\echo ''
\echo '── Fix : NULL-isation des video_url Railway cassées (layers) ──'
UPDATE template_layers
   SET video_url = NULL
  FROM neopro_templates t
 WHERE template_layers.template_id = t.id
   AND template_layers.video_url ~* 'up\.railway\.app'
   AND t.status IS DISTINCT FROM 'archived'
RETURNING template_layers.id, template_layers.name, template_layers.video_url;

\echo ''
\echo '── Fix : NULL-isation des background_video_url Railway cassées (variants) ──'
UPDATE template_variants
   SET background_video_url = NULL
  FROM neopro_templates t
 WHERE template_variants.template_id = t.id
   AND template_variants.background_video_url ~* 'up\.railway\.app'
   AND t.status IS DISTINCT FROM 'archived'
RETURNING template_variants.id, template_variants.name, template_variants.background_video_url;

-- ── Décision finale ───────────────────────────────────────────────────────
-- Par défaut : ROLLBACK (dry run pour valider l'audit).
-- Pour appliquer : remplacer ROLLBACK par COMMIT.
ROLLBACK;
