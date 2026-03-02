-- SAFe Sprint Hybrid Layer
-- Stores persisted velocity and story status overrides.
-- Source of truth remains docs/safe/*.md, these tables provide
-- durable overrides for dynamic data.

CREATE TABLE IF NOT EXISTS safe_sprint_velocity (
  id SERIAL PRIMARY KEY,
  sprint_id TEXT NOT NULL UNIQUE,
  velocity NUMERIC NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safe_story_status_override (
  id SERIAL PRIMARY KEY,
  story_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'done', 'removed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safe_velocity_sprint ON safe_sprint_velocity (sprint_id);
CREATE INDEX IF NOT EXISTS idx_safe_story_override ON safe_story_status_override (story_id);
