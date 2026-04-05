import { QueryResultRow } from 'pg';
import { query } from '../config/database';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ClubPermissionKey =
  | 'view_status'
  | 'view_content'
  | 'upload_video'
  | 'edit_loop'
  | 'manage_sponsors'
  | 'view_analytics';

export const ALL_CLUB_PERMISSIONS: ClubPermissionKey[] = [
  'view_status',
  'view_content',
  'upload_video',
  'edit_loop',
  'manage_sponsors',
  'view_analytics',
];

export interface ClubPermissionRow extends QueryResultRow {
  site_id: string;
  permission: ClubPermissionKey;
  granted_by: string | null;
  granted_at: Date;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ClubPermissionRepositoryImpl {
  /**
   * List all permissions for a site.
   */
  async listBySite(siteId: string): Promise<ClubPermissionRow[]> {
    const result = await query<ClubPermissionRow>(
      'SELECT site_id, permission, granted_by, granted_at FROM club_permissions WHERE site_id = $1 ORDER BY permission',
      [siteId]
    );
    return result.rows;
  }

  /**
   * Check if a site has a specific permission.
   */
  async hasPermission(siteId: string, permission: string): Promise<boolean> {
    const result = await query(
      'SELECT 1 FROM club_permissions WHERE site_id = $1 AND permission = $2 LIMIT 1',
      [siteId, permission]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Grant a permission to a site. Idempotent (ON CONFLICT DO NOTHING).
   */
  async grant(siteId: string, permission: string, grantedBy: string): Promise<void> {
    await query(
      `INSERT INTO club_permissions (site_id, permission, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, permission) DO NOTHING`,
      [siteId, permission, grantedBy]
    );
  }

  /**
   * Revoke a permission from a site.
   */
  async revoke(siteId: string, permission: string): Promise<void> {
    await query(
      'DELETE FROM club_permissions WHERE site_id = $1 AND permission = $2',
      [siteId, permission]
    );
  }

  /**
   * Set all permissions for a site at once (replace).
   * Removes permissions not in the list, adds missing ones.
   */
  async setPermissions(siteId: string, permissions: string[], grantedBy: string): Promise<void> {
    // Remove permissions not in the new list
    await query(
      `DELETE FROM club_permissions WHERE site_id = $1 AND permission != ALL($2::text[])`,
      [siteId, permissions]
    );

    // Add missing permissions
    if (permissions.length > 0) {
      const values = permissions
        .map((_, i) => `($1, $${i + 2}, $${permissions.length + 2})`)
        .join(', ');
      await query(
        `INSERT INTO club_permissions (site_id, permission, granted_by)
         VALUES ${values}
         ON CONFLICT (site_id, permission) DO NOTHING`,
        [siteId, ...permissions, grantedBy]
      );
    }
  }
}

export const clubPermissionRepository = new ClubPermissionRepositoryImpl();
