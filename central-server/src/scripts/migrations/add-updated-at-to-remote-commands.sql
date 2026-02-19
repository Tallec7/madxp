-- =============================================================================
-- Migration: Add updated_at column to remote_commands
-- =============================================================================
-- The repository uses `updated_at = NOW()` in updateStatus() and updateResult()
-- but the column was never added to the table schema.
-- =============================================================================

ALTER TABLE remote_commands
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Backfill existing rows: set updated_at to created_at where it's NULL
UPDATE remote_commands
SET updated_at = COALESCE(completed_at, executed_at, created_at)
WHERE updated_at IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration add-updated-at-to-remote-commands applied successfully!';
  RAISE NOTICE 'Column added: remote_commands.updated_at';
END $$;
