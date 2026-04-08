import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types — Software Updates
// --------------------------------------------------------------------------

export interface SoftwareUpdateRow {
  [key: string]: unknown;
  id: string;
  version: string;
  description: string | null;
  is_critical: boolean;
  release_notes: string | null;
  file_url: string | null;
  file_size: number | null;
  checksum: string | null;
  upload_status: string;
  created_at: Date;
}

export interface CreateSoftwareUpdateInput {
  version: string;
  description: string | null;
  is_critical: boolean;
  changelog: string | null;
  package_url: string;
  package_size: number;
  checksum: string;
  uploaded_by: string | null;
  upload_status: string;
  upload_verified_at: Date | null;
  upload_verified_size: number | null;
}

export interface UpdateSoftwareUpdateInput {
  version?: string;
  description?: string;
  is_critical?: boolean;
  changelog?: string;
  package_url?: string;
  package_size?: number;
  checksum?: string;
}

export interface PackageCheckRow {
  [key: string]: unknown;
  id: string;
  version: string;
  package_url: string | null;
  package_size: number | null;
  checksum: string | null;
}

// --------------------------------------------------------------------------
// Types — Update Deployments
// --------------------------------------------------------------------------

export interface OtaStep {
  name: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  durationMs: number;
  detail?: string;
}

export interface UpdateDeploymentRow {
  [key: string]: unknown;
  id: string;
  update_id: string;
  target_type: string;
  target_id: string;
  status: string;
  progress: number;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  backup_path: string | null;
  update_version: string;
  target_name: string;
  deployment_details: OtaStep[] | null;
}

export interface CreateUpdateDeploymentInput {
  update_id: string;
  target_type: string;
  target_id: string;
  deployed_by: string | null;
  schedule_reboot: boolean;
  auto_rollback: boolean;
}

export interface UpdateUpdateDeploymentFields {
  status?: string;
  progress?: number;
  error_message?: string;
  backup_path?: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class SoftwareUpdateRepositoryImpl extends BaseRepository<SoftwareUpdateRow> {
  constructor() {
    super('software_updates');
  }

  // ---- Software Updates ----

  /**
   * Liste toutes les mises a jour avec aliases pour le frontend.
   */
  async findAllUpdates(): Promise<SoftwareUpdateRow[]> {
    const result = await query<SoftwareUpdateRow>(
      `SELECT id, version, description, is_critical,
              changelog as release_notes, package_url as file_url,
              package_size as file_size, checksum, created_at
       FROM software_updates
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  /**
   * Recupere une mise a jour par ID.
   */
  async findUpdateById(id: string): Promise<SoftwareUpdateRow | null> {
    const result = await query<SoftwareUpdateRow>(
      `SELECT id, version, description, is_critical,
              changelog as release_notes, package_url as file_url,
              package_size as file_size, checksum, created_at
       FROM software_updates
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree une nouvelle mise a jour logicielle.
   */
  async createUpdate(input: CreateSoftwareUpdateInput): Promise<SoftwareUpdateRow> {
    const result = await query<SoftwareUpdateRow>(
      `INSERT INTO software_updates (version, description, is_critical, changelog, package_url, package_size, checksum, uploaded_by, upload_status, upload_verified_at, upload_verified_size)
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, version, description, is_critical, changelog as release_notes, package_url as file_url, package_size as file_size, checksum, upload_status, created_at`,
      [
        input.version,
        input.description,
        input.is_critical,
        input.changelog,
        input.package_url,
        input.package_size,
        input.checksum,
        input.uploaded_by,
        input.upload_status,
        input.upload_verified_at,
        input.upload_verified_size,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une mise a jour logicielle (COALESCE).
   */
  async updateUpdate(id: string, input: UpdateSoftwareUpdateInput): Promise<SoftwareUpdateRow | null> {
    const result = await query<SoftwareUpdateRow>(
      `UPDATE software_updates
       SET version = COALESCE($1, version),
           description = COALESCE($2, description),
           is_critical = COALESCE($3, is_critical),
           changelog = COALESCE($4, changelog),
           package_url = COALESCE($5, package_url),
           package_size = COALESCE($6, package_size),
           checksum = COALESCE($7, checksum)
       WHERE id = $8
       RETURNING *`,
      [
        input.version, input.description, input.is_critical,
        input.changelog, input.package_url, input.package_size,
        input.checksum, id,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime une mise a jour et retourne true si supprimee.
   */
  async deleteUpdate(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM software_updates WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Recupere les details du package pour verification d'URL.
   */
  async findPackageDetails(id: string): Promise<PackageCheckRow | null> {
    const result = await query<PackageCheckRow>(
      `SELECT id, version, package_url, package_size, checksum
       FROM software_updates
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ---- Update Deployments ----

  /**
   * Liste tous les deploiements de mise a jour avec details.
   */
  async findAllDeployments(): Promise<UpdateDeploymentRow[]> {
    const result = await query<UpdateDeploymentRow>(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path, ud.deployed_by, ud.deployment_details,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                WHEN ud.target_type = 'group' THEN g.name
                ELSE 'Inconnu'
              END as target_name,
              CASE
                WHEN ud.target_type = 'site' THEN 1
                WHEN ud.target_type = 'group' THEN COALESCE(gc.site_count, 0)
                ELSE 0
              END as total_count,
              CASE
                WHEN ud.status = 'completed' THEN
                  CASE WHEN ud.target_type = 'site' THEN 1 ELSE COALESCE(gc.site_count, 0) END
                ELSE 0
              END as deployed_count
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       LEFT JOIN groups g ON ud.target_type = 'group' AND ud.target_id = g.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int as site_count FROM site_groups WHERE group_id = ud.target_id
       ) gc ON ud.target_type = 'group'
       ORDER BY ud.created_at DESC`
    );
    return result.rows;
  }

  /**
   * Recupere un deploiement de mise a jour par ID avec details.
   */
  async findDeploymentById(id: string): Promise<UpdateDeploymentRow | null> {
    const result = await query<UpdateDeploymentRow>(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path, ud.deployed_by, ud.deployment_details,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                WHEN ud.target_type = 'group' THEN g.name
                ELSE 'Inconnu'
              END as target_name,
              CASE
                WHEN ud.target_type = 'site' THEN 1
                WHEN ud.target_type = 'group' THEN COALESCE(gc.site_count, 0)
                ELSE 0
              END as total_count,
              CASE
                WHEN ud.status = 'completed' THEN
                  CASE WHEN ud.target_type = 'site' THEN 1 ELSE COALESCE(gc.site_count, 0) END
                ELSE 0
              END as deployed_count
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       LEFT JOIN groups g ON ud.target_type = 'group' AND ud.target_id = g.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int as site_count FROM site_groups WHERE group_id = ud.target_id
       ) gc ON ud.target_type = 'group'
       WHERE ud.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Retourne le dernier deploiement OTA connu pour un site donne
   * (target direct `site` ou ciblage indirect via un `group`).
   */
  async findLastForSite(
    siteId: string
  ): Promise<{ version: string; status: string; completed_at: Date | null; created_at: Date } | null> {
    const result = await query<{
      version: string;
      status: string;
      completed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT su.version, ud.status, ud.completed_at, ud.created_at
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       WHERE (
         (ud.target_type = 'site' AND ud.target_id = $1)
         OR (ud.target_type = 'group'
             AND ud.target_id IN (SELECT group_id FROM site_groups WHERE site_id = $1))
       )
       ORDER BY ud.created_at DESC
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree un deploiement de mise a jour.
   */
  async createDeployment(input: CreateUpdateDeploymentInput): Promise<UpdateDeploymentRow> {
    const result = await query<UpdateDeploymentRow>(
      `INSERT INTO update_deployments (update_id, target_type, target_id, status, progress, deployed_by, schedule_reboot, auto_rollback)
       VALUES ($1, $2, $3, 'pending', 0, $4, $5, $6)
       RETURNING *`,
      [input.update_id, input.target_type || 'site', input.target_id, input.deployed_by, input.schedule_reboot ?? false, input.auto_rollback ?? true]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un deploiement de mise a jour (COALESCE + transitions temporelles).
   */
  async updateDeployment(id: string, input: UpdateUpdateDeploymentFields): Promise<UpdateDeploymentRow | null> {
    const result = await query<UpdateDeploymentRow>(
      `UPDATE update_deployments
       SET status = COALESCE($1, status),
           progress = COALESCE($2, progress),
           error_message = COALESCE($3, error_message),
           backup_path = COALESCE($4, backup_path),
           started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed', 'rolled_back') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $5
       RETURNING *`,
      [input.status, input.progress, input.error_message, input.backup_path, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un deploiement de mise a jour et retourne true si supprime.
   */
  async deleteDeployment(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM update_deployments WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows.length > 0;
  }
}

export const softwareUpdateRepository = new SoftwareUpdateRepositoryImpl();
