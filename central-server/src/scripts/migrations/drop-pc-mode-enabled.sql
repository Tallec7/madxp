-- Remove unused pc_mode_enabled column (E-23 US-23.2.2 — never implemented beyond the toggle)
ALTER TABLE sites DROP COLUMN IF EXISTS pc_mode_enabled;
