-- ============================================================================
-- Remotion Render Jobs — async render queue with progress tracking
-- ============================================================================
-- Purpose: decouple HTTP response from Remotion render (~2 min) so the UI
-- can show real progress instead of a fake progress bar, and long-running
-- renders don't time out at the Railway load balancer.
--
-- Architecture (ADR-054):
--   1. POST /render → INSERT status='pending' + returns 202 { job_id }
--   2. Worker polls FOR UPDATE SKIP LOCKED → status='running'
--   3. Remotion onProgress callback updates progress (0-100)
--   4. On completion → status='completed' with video_id/url/file_size
--   5. On error → status='failed' with error_message
--   6. Frontend polls GET /render-jobs/:id every 2s
--   7. CRON cleanup deletes jobs older than 7 days
-- ============================================================================

CREATE TABLE IF NOT EXISTS remotion_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input
  template_id UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  title TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_for_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,

  -- State machine: pending → running → (completed | failed)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress SMALLINT NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),

  -- Phase hint for UI (bundling | selecting | rendering | uploading)
  phase TEXT,

  -- Output (filled on completion)
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  video_url TEXT,
  file_size BIGINT,

  -- Error details (filled on failure)
  error_message TEXT,

  -- Worker claim tracking (for multi-replica future, currently single replica)
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker claim index: fast FOR UPDATE SKIP LOCKED on pending jobs FIFO
CREATE INDEX IF NOT EXISTS idx_render_jobs_pending
  ON remotion_render_jobs (created_at)
  WHERE status = 'pending';

-- Ownership index: frontend polls GET /render-jobs/:id (we check requested_by)
CREATE INDEX IF NOT EXISTS idx_render_jobs_requester
  ON remotion_render_jobs (requested_by, created_at DESC);

-- Cleanup index: CRON deletes WHERE created_at < NOW() - INTERVAL '7 days'
CREATE INDEX IF NOT EXISTS idx_render_jobs_cleanup
  ON remotion_render_jobs (created_at)
  WHERE status IN ('completed', 'failed');

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION remotion_render_jobs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remotion_render_jobs_updated_at ON remotion_render_jobs;
CREATE TRIGGER trg_remotion_render_jobs_updated_at
  BEFORE UPDATE ON remotion_render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION remotion_render_jobs_set_updated_at();

COMMENT ON TABLE remotion_render_jobs IS
  'Async render queue for Remotion templates. Decouples HTTP from render (~2 min). ADR-054.';
