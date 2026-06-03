-- PROP-014 étape 6 / ADR-134 : file de jobs d'export LED (vidéo club → canvas plié).
-- L'export ffmpeg (scale→pad→fold) prend plusieurs secondes → async, hors cycle HTTP
-- (même raison qu'ADR-054 pour le render Remotion : éviter les 502 Railway).
-- Le worker in-process `led-export-worker.service.ts` poll cette table.

CREATE TABLE IF NOT EXISTS led_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  video_id uuid NOT NULL,
  display_type varchar(50) NOT NULL,
  fit varchar(16) NOT NULL DEFAULT 'contain',
  status varchar(16) NOT NULL DEFAULT 'queued',  -- queued | processing | ready | failed
  output_url text,
  error_msg text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index partiel pour le claim O(log N) du worker (uniquement les jobs en attente).
CREATE INDEX IF NOT EXISTS idx_led_export_jobs_queued
  ON led_export_jobs (status, created_at)
  WHERE status = 'queued';
