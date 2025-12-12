ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS pending_config_version_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_sites_pending_config_version'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT fk_sites_pending_config_version
      FOREIGN KEY (pending_config_version_id) REFERENCES config_history(id);
  END IF;
END $$;



