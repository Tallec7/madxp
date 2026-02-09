import { query } from '../config/database';
import logger from '../config/logger';
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
