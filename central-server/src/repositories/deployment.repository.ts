import { query } from '../config/database';
import { ContentDeployment, OrchestratedDeployment, OrchestratedDeploymentStatus } from '../types';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface DeploymentWithVideo extends ContentDeployment {
  filename: string;
  storage_path: string;
  original_name: string;
  advertiser_id: string | null;
}

export interface CreateDeploymentInput {
  video_id: string;
  target_type: 'site' | 'group';
  target_id: string;
  deployed_by: string;
}

export interface VideoDeploymentRow {
  [key: string]: unknown;
  id: string;
  video_id: string;
  target_type: string;
  target_id: string;
  status: string;
  progress: number;
  error: string | null;
  completed_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  target_name: string;
  club_name: string | null;
  deployed_by_name: string;
  has_secondary_variant: boolean;
}

export interface DeploymentDetailRow {
  [key: string]: unknown;
  id: string;
  video_id: string;
  target_type: string;
  target_id: string;
  status: string;
  progress: number;
  error: string | null;
  deployed_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  filename: string;
  original_name: string;
  metadata: Record<string, unknown>;
  target_name: string;
  club_name: string | null;
  deployed_by_name: string;
  video_name?: string;
  video_title?: string;
  has_secondary_variant: boolean;
}

export interface CreateFullDeploymentInput {
  video_id: string;
  target_type: string;
  target_id: string;
  status: string;
  deployed_by: string | null;
  scheduled_at: Date | null;
  scheduled_by: string | null;
}

export interface UpdateDeploymentFields {
  status?: string;
  progress?: number;
  error_message?: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class DeploymentRepositoryImpl extends BaseRepository<ContentDeployment> {
  constructor() {
    super('content_deployments');
  }

  /**
   * Recupere un deploiement avec les infos de la video.
   */
  async findWithVideo(id: string): Promise<DeploymentWithVideo | null> {
    const result = await query<DeploymentWithVideo>(
      `SELECT cd.*, v.filename, v.storage_path, v.original_name,
              av.advertiser_id
       FROM content_deployments cd
       JOIN videos v ON cd.video_id = v.id
       LEFT JOIN advertiser_videos av ON av.video_id = v.id
       WHERE cd.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree un nouveau deploiement.
   */
  async create(input: CreateDeploymentInput): Promise<ContentDeployment> {
    const result = await query<ContentDeployment>(
      `INSERT INTO content_deployments (video_id, target_type, target_id, deployed_by, status, progress)
       VALUES ($1, $2, $3, $4, 'pending', 0)
       RETURNING *`,
      [input.video_id, input.target_type, input.target_id, input.deployed_by]
    );
    return result.rows[0];
  }

  /**
   * Met a jour le statut et la progression.
   */
  async updateStatus(
    id: string,
    status: ContentDeployment['status'],
    progress?: number
  ): Promise<void> {
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    const params: unknown[] = [status];
    let paramIndex = 2;

    if (progress !== undefined) {
      setClauses.push(`progress = $${paramIndex}`);
      params.push(progress);
      paramIndex++;
    }

    if (status === 'in_progress' && progress === undefined) {
      setClauses.push('started_at = COALESCE(started_at, NOW())');
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      setClauses.push('completed_at = NOW()');
      if (status === 'completed') {
        setClauses.push('progress = 100');
      }
    }

    params.push(id);
    await query(
      `UPDATE content_deployments SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }

  /**
   * Marque un deploiement comme echoue.
   */
  async fail(id: string, errorMessage: string): Promise<void> {
    await query(
      `UPDATE content_deployments
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [errorMessage, id]
    );
  }

  /**
   * Deploiements en attente pour un site.
   */
  async getPendingForSite(siteId: string): Promise<ContentDeployment[]> {
    const result = await query<ContentDeployment>(
      `SELECT * FROM content_deployments
       WHERE target_id = $1
         AND target_type = 'site'
         AND status IN ('pending', 'in_progress')
       ORDER BY created_at ASC`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * Deploiements recents (pour historique).
   */
  async getRecent(limit = 50): Promise<DeploymentWithVideo[]> {
    const result = await query<DeploymentWithVideo>(
      `SELECT cd.*, v.filename, v.storage_path, v.original_name,
              av.advertiser_id
       FROM content_deployments cd
       JOIN videos v ON cd.video_id = v.id
       LEFT JOIN advertiser_videos av ON av.video_id = v.id
       ORDER BY cd.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // View methods (for content controller)
  // --------------------------------------------------------------------------

  /**
   * Deploiements pour une video specifique avec details site/user.
   */
  async findDeploymentsForVideo(videoId: string): Promise<VideoDeploymentRow[]> {
    const result = await query<VideoDeploymentRow>(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at, cd.created_at, cd.started_at,
              cd.has_secondary_variant,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name,
              CASE
                WHEN cd.target_type = 'site' THEN s.club_name
                ELSE NULL
              END as club_name,
              COALESCE(u.full_name, 'Système') as deployed_by_name
       FROM content_deployments cd
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       LEFT JOIN users u ON cd.deployed_by = u.id
       WHERE cd.video_id = $1
       ORDER BY cd.created_at DESC`,
      [videoId]
    );
    return result.rows;
  }

  /**
   * Tous les deploiements avec details video et site.
   */
  async findAllWithDetails(limit = 200): Promise<DeploymentDetailRow[]> {
    const result = await query<DeploymentDetailRow>(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at as deployed_at,
              cd.created_at, cd.started_at, cd.has_secondary_variant,
              v.filename, v.original_name, v.metadata,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name,
              s.club_name,
              COALESCE(u.full_name, 'Système') as deployed_by_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       LEFT JOIN users u ON cd.deployed_by = u.id
       ORDER BY cd.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Un deploiement par ID avec details video et site.
   */
  async findWithDetails(id: string): Promise<DeploymentDetailRow | null> {
    const result = await query<DeploymentDetailRow>(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at as deployed_at,
              cd.created_at, cd.started_at, cd.has_secondary_variant,
              v.filename as video_name,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       WHERE cd.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree un deploiement complet (avec scheduling optionnel).
   */
  async createFull(input: CreateFullDeploymentInput): Promise<ContentDeployment> {
    const result = await query<ContentDeployment>(
      `INSERT INTO content_deployments (video_id, target_type, target_id, status, progress, deployed_by, scheduled_at, scheduled_by)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
       RETURNING *`,
      [
        input.video_id,
        input.target_type || 'site',
        input.target_id,
        input.status,
        input.deployed_by,
        input.scheduled_at,
        input.scheduled_by,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour les champs d'un deploiement (COALESCE).
   */
  async updateFields(id: string, input: UpdateDeploymentFields): Promise<ContentDeployment | null> {
    const result = await query<ContentDeployment>(
      `UPDATE content_deployments
       SET status = COALESCE($1, status),
           progress = COALESCE($2, progress),
           error_message = COALESCE($3, error_message),
           started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $4
       RETURNING *`,
      [input.status, input.progress, input.error_message, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un deploiement et retourne true si supprime.
   */
  async deleteAndReturn(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM content_deployments WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // Deployed Paths (real paths reported by Pi after deployment)
  // --------------------------------------------------------------------------

  /**
   * Retourne les chemins reels deployes pour un site (le dernier chemin par video).
   * Utilise par le dashboard pour afficher les vrais chemins au lieu de chemins speculatifs.
   */
  async getDeployedPathsForSite(siteId: string): Promise<Array<{ video_id: string; deployed_path: string; deployed_filename: string }>> {
    const result = await query<{ video_id: string; deployed_path: string; deployed_filename: string }>(
      `SELECT DISTINCT ON (video_id) video_id, deployed_path, deployed_filename
       FROM content_deployments
       WHERE deployed_path IS NOT NULL
         AND status = 'completed'
         AND (target_id = $1 OR target_id IN (
           SELECT group_id FROM site_groups WHERE site_id = $1
         ))
       ORDER BY video_id, completed_at DESC`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * Backfill deployed_path for completed deployments that have NULL paths.
   * Matches Pi's local videos (from sync_local_state) against completed deployments
   * using the video checksum or filename as correlation key.
   *
   * Called automatically on every sync_local_state — self-healing for pre-existing deployments.
   */
  async backfillDeployedPaths(
    siteId: string,
    localVideos: Array<{ filename: string; path: string; checksum?: string | null }>
  ): Promise<number> {
    if (!localVideos || localVideos.length === 0) return 0;

    // Find completed deployments for this site that are missing deployed_path
    const missing = await query<{ id: string; video_id: string; video_filename: string; video_checksum: string | null }>(
      `SELECT cd.id, cd.video_id, v.filename AS video_filename, v.checksum AS video_checksum
       FROM content_deployments cd
       JOIN videos v ON cd.video_id = v.id
       WHERE cd.deployed_path IS NULL
         AND cd.status = 'completed'
         AND (cd.target_id = $1 OR cd.target_id IN (
           SELECT group_id FROM site_groups WHERE site_id = $1
         ))`,
      [siteId]
    );

    if (missing.rows.length === 0) return 0;

    // Build lookup maps from Pi's local videos
    const byChecksum = new Map<string, { path: string; filename: string }>();
    const byFilename = new Map<string, { path: string; filename: string }>();
    for (const lv of localVideos) {
      if (lv.checksum) {
        byChecksum.set(lv.checksum, { path: lv.path, filename: lv.filename });
      }
      byFilename.set(lv.filename, { path: lv.path, filename: lv.filename });
    }

    let backfilled = 0;
    for (const row of missing.rows) {
      // Priority: match by checksum (most reliable), then by filename
      const match = (row.video_checksum && byChecksum.get(row.video_checksum))
        || byFilename.get(row.video_filename);

      if (match) {
        await query(
          `UPDATE content_deployments
           SET deployed_path = $1, deployed_filename = $2
           WHERE id = $3`,
          [match.path, match.filename, row.id]
        );
        backfilled++;
      }
    }

    return backfilled;
  }

  // --------------------------------------------------------------------------
  // Orchestrated Deployments
  // --------------------------------------------------------------------------

  async findOrchestrated(id: string): Promise<OrchestratedDeployment | null> {
    const result = await query<OrchestratedDeployment>(
      'SELECT * FROM orchestrated_deployments WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateOrchestratedStatus(
    id: string,
    status: OrchestratedDeploymentStatus,
    updates: Partial<{
      videos_completed: number;
      videos_failed: number;
      config_deployed: boolean;
      error_message: string;
      failed_video_ids: string[];
    }> = {}
  ): Promise<void> {
    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (key === 'failed_video_ids') {
          setClauses.push(`${key} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else {
          setClauses.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    }

    if (status === 'completed' || status === 'failed' || status === 'partial_failure') {
      setClauses.push('completed_at = NOW()');
    }

    params.push(id);
    await query(
      `UPDATE orchestrated_deployments SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }
}

export const deploymentRepository = new DeploymentRepositoryImpl();
