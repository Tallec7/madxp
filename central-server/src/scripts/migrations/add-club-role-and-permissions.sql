-- Migration: Add club role support
-- Adds site_id to users table for club-scoped access
-- Creates club_permissions table for granular permission management
--
-- Run: psql $DATABASE_URL -f central-server/src/scripts/migrations/add-club-role-and-permissions.sql

BEGIN;

-- 1. Add site_id column to users (nullable — only used for role='club')
ALTER TABLE users ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

-- 2. Create club_permissions table
CREATE TABLE IF NOT EXISTS club_permissions (
  site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL,
  granted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, permission)
);

-- 3. Index for fast lookup by site_id
CREATE INDEX IF NOT EXISTS idx_users_site_id ON users(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_permissions_site_id ON club_permissions(site_id);

-- 4. Add comment for documentation
COMMENT ON COLUMN users.site_id IS 'For club role users: the site they have access to (1 user = 1 site)';
COMMENT ON TABLE club_permissions IS 'Granular permissions for club-scoped users. Managed by super_admin/operator.';
COMMENT ON COLUMN club_permissions.permission IS 'Permission key: view_status, view_content, upload_video, edit_loop, manage_sponsors, view_analytics';

-- 5. Insert default permissions for all existing sites (all enabled by default)
-- This ensures existing sites are ready when club users are created
INSERT INTO club_permissions (site_id, permission)
SELECT s.id, p.permission
FROM sites s
CROSS JOIN (
  VALUES ('view_status'), ('view_content'), ('upload_video'), ('edit_loop'), ('manage_sponsors'), ('view_analytics')
) AS p(permission)
ON CONFLICT DO NOTHING;

COMMIT;
