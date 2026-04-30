-- Migration : table pour tracker les vidéos dont le storage_path FTP est mort
-- (fichier supprimé hors API, ou upload qui n'a jamais réussi côté FTP malgré
-- la création de la row videos en DB).
--
-- Contexte : incident PR #613 où la vidéo acff5e34-...-f813.mp4 (JOUEUR_85)
-- existait en DB mais le fichier FTP avait disparu. Aucun audit_log ne
-- mentionnait de suppression API → cause = manipulation directe du FTP. La
-- cascade DELETE+cascade de PR2 ne couvre PAS ce cas. Le CRON nocturne audit
-- vérifie l'existence de chaque storage_path et persiste les anomalies ici.
--
-- Cycle de vie d'une row :
--   1. CRON détecte un 404 sur l'URL upstream → INSERT (status='missing')
--   2. CRON suivant retrouve un 200 → DELETE (auto-resolve)
--   3. Sinon → UPDATE last_checked_at (la row reste pour alimenter le widget)

CREATE TABLE IF NOT EXISTS video_ftp_audit_warnings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  expected_path TEXT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('missing', 'unreachable')),
  http_status INTEGER,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  UNIQUE (video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_ftp_audit_status
  ON video_ftp_audit_warnings (status, last_checked_at DESC);

-- Étendre check_task_type pour autoriser le nouveau task type CRON.
-- Dynamically rebuild the constraint from existing distinct values + the new type,
-- so we never reject rows with task_type values added by other migrations.
DO $body$
DECLARE
  _vals TEXT;
BEGIN
  -- Collect all distinct task_type values already in the table + the new one
  SELECT string_agg(DISTINCT quote_literal(t), ', ' ORDER BY quote_literal(t))
    INTO _vals
    FROM (
      SELECT task_type AS t FROM recurring_schedules
      UNION
      SELECT 'video_ftp_audit'
    ) sub;

  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;

  IF _vals IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE recurring_schedules ADD CONSTRAINT check_task_type CHECK (task_type IN (%s))',
      _vals
    );
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $body$;

-- Seed le schedule (quotidien à 3h du matin).
INSERT INTO recurring_schedules (
  name, description, task_type, cron_expression, hour, minute,
  task_config, is_active
)
SELECT
  'Video FTP orphan audit',
  'Vérifie quotidiennement que chaque videos.storage_path existe sur le FTP. Détecte les fichiers supprimés hors API (FileZilla, SSH) avant que les clubs ne tombent dessus en match.',
  'video_ftp_audit',
  '0 3 * * *',
  3, 0,
  '{"batchSize": 50, "concurrency": 5}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_schedules WHERE task_type = 'video_ftp_audit'
);

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: video_ftp_audit_warnings + CRON video_ftp_audit (PR2.2)';
END $$;
