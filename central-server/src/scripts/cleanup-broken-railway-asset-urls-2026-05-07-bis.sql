-- Cleanup — Récidive incident URLs Railway cassées (2026-05-07 bis)
--
-- Résultat du run initial (2026-05-07) : 0 row dans template_layers /
-- template_variants. Les seules occurrences restantes sont dans
-- `template_versions.{layers,variants}_snapshot` (5 rows / 3 templates),
-- mais ces 3 templates sont DÉJÀ en status='archived' depuis l'incident
-- matin (BUT Img Joueur, Joueur détaillé, BUT Simple). Les snapshots
-- versioning sont volontairement conservés (historique rollback). Le
-- runtime guard étendu (cette PR) intercepte les URLs au moment où le
-- dashboard ouvre un template archivé en preview.
--
-- → Garde ce script pour un futur run au cas où le pattern réapparaîtrait
--   dans des rows actives.
--
-- Symptôme :
--   Console Studio + render worker spammée par 404 sur
--   `neopro-central-production.up.railway.app/BUT_simple_{A,B,C}.webm`.
--   Ces assets n'existent ni sur Railway ni sur FTP Hostinger → cascade
--   OffthreadVideo retry → tab unresponsive (même symptôme que 2026-05-07).
--
-- Différence vs incident original :
--   Le 1er lot pointait vers /remotion-preview/public/, attrapé par le guard
--   runtime initial. Ce 2e lot est servi à la racine du domaine Railway
--   (`/BUT_simple_*.webm`) → guard 1er pattern ne match pas → cascade.
--
-- Fix runtime déjà déployé (cette PR) :
--   `BROKEN_URL_PATTERNS` étendu à `up.railway.app/[^?#]+\.(webm|mp4)`.
--   Cela suffit à STOPPER la cascade — le runtime ignore l'asset.
--
-- Cette migration finit le ménage côté DB :
--   1. Identifier les rows concernées (audit, dry-run).
--   2. Archiver les templates qui en contiennent (status='archived'),
--      même politique que 2026-05-07 → invisibles dans la bibliothèque
--      Studio mais conservés pour audit/rollback.
--
-- Usage (depuis main worktree, après ./scripts/use-prod-db.sh) :
--   psql "$DATABASE_URL" -f central-server/src/scripts/cleanup-broken-railway-asset-urls-2026-05-07-bis.sql
--
-- Le script ouvre une transaction, montre les changements et les ROLLBACK
-- par défaut. Pour committer : changer le ROLLBACK final en COMMIT.

\set ON_ERROR_STOP on

BEGIN;

-- ── Audit ─────────────────────────────────────────────────────────────────

\echo '── Audit : layers cassés ──'
SELECT
  t.id AS template_id,
  t.name,
  t.status,
  l.id AS layer_id,
  l.name AS layer_name,
  l.video_url
FROM madxp_templates t
JOIN template_layers l ON l.template_id = t.id
WHERE l.video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
ORDER BY t.name, l.z_index;

\echo ''
\echo '── Audit : variants cassés ──'
SELECT
  t.id AS template_id,
  t.name,
  t.status,
  v.id AS variant_id,
  v.name AS variant_name,
  v.background_video_url
FROM madxp_templates t
JOIN template_variants v ON v.template_id = t.id
WHERE v.background_video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
ORDER BY t.name, v.sort_order;

\echo ''
\echo '── Audit : templates impactés (à archiver) ──'
SELECT DISTINCT t.id, t.name, t.status, t.created_at
FROM madxp_templates t
WHERE EXISTS (
  SELECT 1 FROM template_layers l
  WHERE l.template_id = t.id
    AND l.video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
)
   OR EXISTS (
  SELECT 1 FROM template_variants v
  WHERE v.template_id = t.id
    AND v.background_video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
)
ORDER BY t.name;

-- ── Action : archive ──────────────────────────────────────────────────────

\echo ''
\echo '── Archivage des templates impactés ──'
UPDATE madxp_templates
SET status = 'archived'
WHERE status IS DISTINCT FROM 'archived'
  AND (
    EXISTS (
      SELECT 1 FROM template_layers l
      WHERE l.template_id = madxp_templates.id
        AND l.video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
    )
    OR EXISTS (
      SELECT 1 FROM template_variants v
      WHERE v.template_id = madxp_templates.id
        AND v.background_video_url ~* 'up\.railway\.app/[^?#]+\.(webm|mp4)'
    )
  )
RETURNING id, name, status;

-- ── Décision finale ───────────────────────────────────────────────────────
-- Par défaut : ROLLBACK pour valider l'audit avant de committer.
-- Pour appliquer : remplacer la ligne ci-dessous par COMMIT;
ROLLBACK;
