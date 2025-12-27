-- Migration: Initial users table schema for NEOPRO Central Server
-- This migration ensures all required columns exist in the public.users table
-- Run this on a fresh Supabase/PostgreSQL database

-- Create users table if not exists (Supabase may already have auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Add columns that may be missing (safe to run multiple times)
-- MFA columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITH TIME ZONE;

-- Sponsor/Agency columns (for multi-tenant support)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sponsor_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agency_id UUID;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON public.users(mfa_enabled) WHERE mfa_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_sponsor_id ON public.users(sponsor_id) WHERE sponsor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_agency_id ON public.users(agency_id) WHERE agency_id IS NOT NULL;

-- Comments
COMMENT ON TABLE public.users IS 'NEOPRO user accounts';
COMMENT ON COLUMN public.users.role IS 'User role: admin, sponsor, agency, user';
COMMENT ON COLUMN public.users.mfa_enabled IS 'Whether MFA (TOTP) is enabled for this user';
COMMENT ON COLUMN public.users.mfa_secret IS 'TOTP secret key for MFA';
COMMENT ON COLUMN public.users.mfa_backup_codes IS 'JSON array of backup codes for MFA recovery';
COMMENT ON COLUMN public.users.sponsor_id IS 'Reference to sponsor user (for agency/user hierarchy)';
COMMENT ON COLUMN public.users.agency_id IS 'Reference to agency (for multi-tenant isolation)';

-- Verification query
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;
