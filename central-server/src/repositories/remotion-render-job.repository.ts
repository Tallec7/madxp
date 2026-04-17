import { QueryResultRow } from 'pg';
import { query } from '../config/database';

export type RenderJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RenderJobPhase = 'bundling' | 'selecting' | 'rendering' | 'uploading';

export interface RemotionRenderJob extends QueryResultRow {
  id: string;
  template_id: string;
  props: Record<string, unknown>;
  title: string;
  requested_by: string | null;
  requested_for_site_id: string | null;
  status: RenderJobStatus;
  progress: number;
  phase: RenderJobPhase | null;
  video_id: string | null;
  video_url: string | null;
  file_size: number | null;
  error_message: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

export interface CreateRenderJobInput {
  template_id: string;
  props: Record<string, unknown>;
  title: string;
  requested_by: string | null;
  requested_for_site_id: string | null;
}

class RemotionRenderJobRepository {
  async create(input: CreateRenderJobInput): Promise<RemotionRenderJob> {
    const result = await query<RemotionRenderJob>(
      `INSERT INTO remotion_render_jobs
         (template_id, props, title, requested_by, requested_for_site_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.template_id,
        JSON.stringify(input.props),
        input.title,
        input.requested_by,
        input.requested_for_site_id,
      ]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<RemotionRenderJob | null> {
    const result = await query<RemotionRenderJob>(
      'SELECT * FROM remotion_render_jobs WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Atomically claim the oldest pending job for this worker.
   * Uses FOR UPDATE SKIP LOCKED to avoid races between concurrent workers.
   * Returns null when no pending job exists.
   */
  async claimNextPending(workerId: string): Promise<RemotionRenderJob | null> {
    const result = await query<RemotionRenderJob>(
      `UPDATE remotion_render_jobs
       SET status = 'running',
           claimed_by = $1,
           claimed_at = NOW(),
           started_at = NOW(),
           phase = 'bundling',
           progress = 1
       WHERE id = (
         SELECT id FROM remotion_render_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId]
    );
    return result.rows[0] || null;
  }

  async updateProgress(
    id: string,
    progress: number,
    phase?: RenderJobPhase
  ): Promise<void> {
    if (phase) {
      await query(
        'UPDATE remotion_render_jobs SET progress = $1, phase = $2 WHERE id = $3',
        [Math.max(0, Math.min(100, Math.round(progress))), phase, id]
      );
    } else {
      await query(
        'UPDATE remotion_render_jobs SET progress = $1 WHERE id = $2',
        [Math.max(0, Math.min(100, Math.round(progress))), id]
      );
    }
  }

  async markCompleted(
    id: string,
    output: { video_id: string; video_url: string; file_size: number }
  ): Promise<RemotionRenderJob | null> {
    const result = await query<RemotionRenderJob>(
      `UPDATE remotion_render_jobs
       SET status = 'completed',
           progress = 100,
           phase = NULL,
           video_id = $1,
           video_url = $2,
           file_size = $3,
           completed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [output.video_id, output.video_url, output.file_size, id]
    );
    return result.rows[0] || null;
  }

  async markFailed(id: string, errorMessage: string): Promise<RemotionRenderJob | null> {
    const result = await query<RemotionRenderJob>(
      `UPDATE remotion_render_jobs
       SET status = 'failed',
           error_message = $1,
           completed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [errorMessage.slice(0, 2000), id]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete jobs older than N days (completed/failed only). Returns deleted count.
   */
  async cleanupOlderThan(days: number): Promise<number> {
    const result = await query(
      `DELETE FROM remotion_render_jobs
       WHERE status IN ('completed', 'failed')
         AND created_at < NOW() - ($1::int || ' days')::interval`,
      [days]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Recovery helper — on server restart, any 'running' job claimed by this process
   * is stale (the render was interrupted). Mark them failed so the user can retry.
   */
  async failStaleRunningJobs(staleMinutes = 10): Promise<number> {
    const result = await query(
      `UPDATE remotion_render_jobs
       SET status = 'failed',
           error_message = 'Render interrompu (redémarrage serveur)',
           completed_at = NOW()
       WHERE status = 'running'
         AND claimed_at < NOW() - ($1::int || ' minutes')::interval`,
      [staleMinutes]
    );
    return result.rowCount ?? 0;
  }
}

export const remotionRenderJobRepository = new RemotionRenderJobRepository();
