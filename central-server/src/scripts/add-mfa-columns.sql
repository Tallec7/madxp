-- Migration: Add MFA (Multi-Factor Authentication) columns to users table
-- Run this script to enable TOTP-based MFA for admin users

-- Add MFA columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB;

-- Create index for faster MFA lookups
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = TRUE;

-- Comment on columns
COMMENT ON COLUMN users.mfa_enabled IS 'Whether MFA (TOTP) is enabled for this user';
COMMENT ON COLUMN users.mfa_secret IS 'TOTP secret key (encrypted in production)';
COMMENT ON COLUMN users.mfa_backup_codes IS 'JSON array of backup codes for MFA recovery';

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('mfa_enabled', 'mfa_secret', 'mfa_backup_codes');
