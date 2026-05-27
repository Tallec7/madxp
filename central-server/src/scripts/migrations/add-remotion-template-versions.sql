-- ============================================================================
-- Remotion template versions — schema/default-props snapshots with restore
-- ============================================================================
-- Purpose: record a snapshot of (props_schema, default_props) every time a
-- template is updated, so admins can review history and restore any prior
-- version without the fear of losing a working configuration.
--
-- Architecture (ADR-055):
--   1. Every UPDATE of neopro_templates that changes props_schema or
--      default_props triggers a snapshot row in neopro_template_versions.
--   2. Admin endpoints list versions and restore a chosen version
--      (restore = UPDATE of the live row → triggers a new snapshot, so the
--      pre-restore state is never lost).
-- ============================================================================

CREATE TABLE IF NOT EXISTS neopro_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,

  -- Snapshotted fields (subset — composition_id and name are rarely changed)
  props_schema JSONB NOT NULL,
  default_props JSONB NOT NULL,

  -- Metadata
  snapshot_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template
  ON neopro_template_versions (template_id, created_at DESC);

-- Trigger: snapshot on INSERT (initial version) and on UPDATE whenever
-- props_schema or default_props change.
CREATE OR REPLACE FUNCTION neopro_templates_snapshot_version()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO neopro_template_versions
      (template_id, props_schema, default_props, snapshot_reason, created_by)
    VALUES
      (NEW.id, NEW.props_schema, NEW.default_props, 'initial', NEW.created_by);
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE')
     AND (OLD.props_schema::text IS DISTINCT FROM NEW.props_schema::text
          OR OLD.default_props::text IS DISTINCT FROM NEW.default_props::text)
  THEN
    INSERT INTO neopro_template_versions
      (template_id, props_schema, default_props, snapshot_reason, created_by)
    VALUES
      (NEW.id, OLD.props_schema, OLD.default_props, 'pre-update', NULL);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_neopro_templates_snapshot ON neopro_templates;
CREATE TRIGGER trg_neopro_templates_snapshot
  AFTER INSERT OR UPDATE ON neopro_templates
  FOR EACH ROW
  EXECUTE FUNCTION neopro_templates_snapshot_version();

-- Backfill: create one initial snapshot for each existing template that has
-- no version yet (idempotent via NOT EXISTS).
INSERT INTO neopro_template_versions (template_id, props_schema, default_props, snapshot_reason, created_by)
SELECT t.id, t.props_schema, t.default_props, 'backfill', t.created_by
FROM neopro_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM neopro_template_versions v WHERE v.template_id = t.id
);

COMMENT ON TABLE neopro_template_versions IS
  'Snapshots of neopro_templates (props_schema + default_props) for audit/restore. ADR-055.';
