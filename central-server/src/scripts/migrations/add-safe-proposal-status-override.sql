-- SAFe Proposal Status Hybrid Layer
-- Stores persisted proposal status overrides.
-- Source of truth for content remains docs/proposals/*.md,
-- but status is overridden by DB to survive container restarts.

CREATE TABLE IF NOT EXISTS safe_proposal_status_override (
  id SERIAL PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in-review', 'approved', 'implementing', 'done')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safe_proposal_override ON safe_proposal_status_override (proposal_id);
