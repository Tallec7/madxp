import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';
import type { LedExportFit, LedExportLayout } from '../services/led-fold.service';

/**
 * File de jobs d'export LED (PROP-014 étape 6 / ADR-134). Pollée par
 * `led-export-worker.service.ts`. Même pattern que `render_requests` (ADR-054/124) :
 * claim atomique `FOR UPDATE SKIP LOCKED`, markReady/markFailed, failStaleRunning au boot.
 */

export type LedExportStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface LedExportJobRow extends QueryResultRow {
  id: string;
  site_id: string;
  video_id: string;
  display_type: string;
  fit: LedExportFit;
  /** Mise en page réelle (pavage). NULL = legacy (utilise `fit`). PROP-014 §4. */
  layout: LedExportLayout | null;
  status: LedExportStatus;
  output_url: string | null;
  geometry_hash?: string | null;
  error_msg: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateLedExportJobInput {
  site_id: string;
  video_id: string;
  display_type: string;
  fit: LedExportFit;
  layout: LedExportLayout;
  created_by: string | null;
  /** Empreinte géométrie + source + layout (ADR-139) — clé de cache. */
  geometry_hash?: string | null;
}

class LedExportJobRepositoryImpl extends BaseRepository<LedExportJobRow> {
  constructor() {
    super('led_export_jobs');
  }

  async create(input: CreateLedExportJobInput): Promise<LedExportJobRow> {
    const result = await query<LedExportJobRow>(
      `INSERT INTO led_export_jobs (site_id, video_id, display_type, fit, layout, status, created_by, geometry_hash)
       VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7)
       RETURNING *`,
      [
        input.site_id,
        input.video_id,
        input.display_type,
        input.fit,
        input.layout,
        input.created_by,
        input.geometry_hash ?? null,
      ]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<LedExportJobRow | null> {
    const result = await query<LedExportJobRow>(
      `SELECT * FROM led_export_jobs WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Dernier export PRÊT pour un (vidéo × club × mise en page) donné — permet de
   * réutiliser un ruban déjà plié plutôt que de replier (la source à plat est
   * globale, le ruban produit est propre au club). Retourne null si aucun n'est prêt.
   */
  async findReady(
    videoId: string,
    siteId: string,
    layout: LedExportLayout
  ): Promise<LedExportJobRow | null> {
    const result = await query<LedExportJobRow>(
      `SELECT * FROM led_export_jobs
       WHERE video_id = $1 AND site_id = $2 AND layout = $3
         AND status = 'ready' AND output_url IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [videoId, siteId, layout]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Canvas plié déjà fabriqué pour CETTE géométrie exacte (ADR-139, étape D).
   *
   * L'empreinte couvre géométrie + source + layout : si l'une change, la clé
   * change, le cache rate, et le canvas est refabriqué. C'est ce qui rend
   * l'invalidation automatique — pas de logique d'expiration à maintenir.
   */
  async findReadyByGeometry(
    siteId: string,
    videoId: string,
    geometryHash: string
  ): Promise<LedExportJobRow | null> {
    const result = await query<LedExportJobRow>(
      `SELECT * FROM led_export_jobs
       WHERE site_id = $1 AND video_id = $2 AND geometry_hash = $3
         AND status = 'ready' AND output_url IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [siteId, videoId, geometryHash]
    );
    return result.rows[0] ?? null;
  }

  /** Un job est-il déjà en vol pour cette empreinte ? (anti-doublon d'enqueue) */
  async hasPendingForGeometry(
    siteId: string,
    videoId: string,
    geometryHash: string
  ): Promise<boolean> {
    const result = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM led_export_jobs
       WHERE site_id = $1 AND video_id = $2 AND geometry_hash = $3
         AND status IN ('queued', 'processing')`,
      [siteId, videoId, geometryHash]
    );
    return Number(result.rows[0]?.n ?? 0) > 0;
  }

  /** Claim atomique du prochain job en queue (multi-worker safe). */
  async claimNextQueued(): Promise<LedExportJobRow | null> {
    const result = await query<LedExportJobRow>(
      `UPDATE led_export_jobs SET status = 'processing', updated_at = NOW()
       WHERE id = (
         SELECT id FROM led_export_jobs
         WHERE status = 'queued'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`
    );
    return result.rows[0] ?? null;
  }

  async markReady(id: string, outputUrl: string): Promise<void> {
    await query(
      `UPDATE led_export_jobs SET status = 'ready', output_url = $1, updated_at = NOW() WHERE id = $2`,
      [outputUrl, id]
    );
  }

  async markFailed(id: string, errorMsg: string): Promise<void> {
    await query(
      `UPDATE led_export_jobs SET status = 'failed', error_msg = $1, updated_at = NOW() WHERE id = $2`,
      [errorMsg.slice(0, 1000), id]
    );
  }

  /**
   * Garde-fou boot : remet en `queued` les jobs `processing` orphelins (process mort).
   * Sans ça, un job claimé par un worker crashé reste bloqué ad vitam (ADR-054).
   */
  async failStaleRunning(maxAgeMinutes: number): Promise<number> {
    const result = await query(
      `UPDATE led_export_jobs SET status = 'queued', updated_at = NOW()
       WHERE status = 'processing' AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [String(maxAgeMinutes)]
    );
    return result.rowCount ?? 0;
  }
}

export const ledExportJobRepository = new LedExportJobRepositoryImpl();
