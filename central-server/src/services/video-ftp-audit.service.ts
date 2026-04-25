/**
 * Service d'audit FTP des vidéos.
 *
 * Vérifie que chaque `videos.storage_path` pointe vers un fichier qui existe
 * réellement sur le FTP Hostinger. Détecte les anomalies que la cascade DELETE
 * ne couvre pas : fichiers supprimés directement sur le FTP (FileZilla / SSH),
 * ou uploads qui n'ont jamais réussi côté FTP malgré la création de la row DB.
 *
 * Cause racine de l'incident PR #613 (vidéo `acff5e34` morte sur SaaS) — la
 * cascade backend (PR2) ne couvre que les suppressions API. Cette défense-ci
 * couvre les manipulations hors API.
 *
 * Appelé par le CRON `video_ftp_audit` (quotidien 03:00).
 */

import { query } from '../config/database';
import { getVideoUrl } from './storage.service';
import metricsService from './metrics.service';
import logger from '../config/logger';

const HEAD_TIMEOUT_MS = 8000;

export interface AuditResult {
  scanned: number;
  missing: number;
  unreachable: number;
  resolved: number;
  durationMs: number;
}

export interface AuditOptions {
  batchSize?: number;
  concurrency?: number;
}

interface VideoRow {
  [key: string]: unknown;
  id: string;
  storage_path: string;
}

class VideoFtpAuditService {
  /**
   * Audite toutes les vidéos en DB. Pour chaque storage_path :
   *   - HEAD sur l'URL upstream (avec timeout 8s)
   *   - 404 → upsert dans `video_ftp_audit_warnings` (status='missing')
   *   - timeout / 5xx → upsert (status='unreachable')
   *   - 200 → si une warning existe, la supprimer (auto-resolve)
   */
  async auditAllVideos(opts: AuditOptions = {}): Promise<AuditResult> {
    const startedAt = Date.now();
    const batchSize = opts.batchSize ?? 50;
    const concurrency = opts.concurrency ?? 5;

    const videos = await this.fetchAllVideos();
    logger.info('Video FTP audit started', { totalVideos: videos.length, batchSize, concurrency });

    let scanned = 0;
    let missing = 0;
    let unreachable = 0;
    let resolved = 0;

    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      const results = await this.processBatch(batch, concurrency);
      for (const r of results) {
        scanned++;
        if (r === 'missing') missing++;
        else if (r === 'unreachable') unreachable++;
        else if (r === 'resolved') resolved++;
      }
    }

    const durationMs = Date.now() - startedAt;

    metricsService.recordVideoFtpAudit({ missing, unreachable, resolved, scanned, durationMs });

    logger.info('Video FTP audit completed', { scanned, missing, unreachable, resolved, durationMs });

    return { scanned, missing, unreachable, resolved, durationMs };
  }

  private async fetchAllVideos(): Promise<VideoRow[]> {
    const result = await query<VideoRow>(
      `SELECT id, storage_path FROM videos WHERE storage_path IS NOT NULL AND storage_path <> ''`
    );
    return result.rows;
  }

  private async processBatch(
    batch: VideoRow[],
    concurrency: number,
  ): Promise<Array<'missing' | 'unreachable' | 'ok' | 'resolved'>> {
    const results: Array<'missing' | 'unreachable' | 'ok' | 'resolved'> = [];

    for (let i = 0; i < batch.length; i += concurrency) {
      const slice = batch.slice(i, i + concurrency);
      const checks = await Promise.all(slice.map(v => this.checkOne(v)));
      results.push(...checks);
    }

    return results;
  }

  private async checkOne(video: VideoRow): Promise<'missing' | 'unreachable' | 'ok' | 'resolved'> {
    const url = getVideoUrl(video.storage_path);

    let httpStatus: number | null = null;
    let outcome: 'missing' | 'unreachable' | 'ok' = 'ok';

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
      const response = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timeout);
      httpStatus = response.status;

      if (response.status === 404) outcome = 'missing';
      else if (response.status >= 500) outcome = 'unreachable';
      else outcome = 'ok';
    } catch (err) {
      // Timeout, DNS error, ECONNRESET, etc.
      outcome = 'unreachable';
      logger.warn('Video FTP audit HEAD failed', {
        videoId: video.id,
        storagePath: video.storage_path,
        err: (err as Error).message,
      });
    }

    if (outcome === 'ok') {
      const cleared = await this.clearWarning(video.id);
      return cleared ? 'resolved' : 'ok';
    }

    await this.upsertWarning(video.id, video.storage_path, outcome, httpStatus);
    return outcome;
  }

  private async upsertWarning(
    videoId: string,
    expectedPath: string,
    status: 'missing' | 'unreachable',
    httpStatus: number | null,
  ): Promise<void> {
    await query(
      `INSERT INTO video_ftp_audit_warnings (video_id, expected_path, status, http_status, last_checked_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (video_id) DO UPDATE
         SET status = EXCLUDED.status,
             expected_path = EXCLUDED.expected_path,
             http_status = EXCLUDED.http_status,
             last_checked_at = NOW()`,
      [videoId, expectedPath, status, httpStatus],
    );
  }

  /** Retourne true si une warning existait et a été supprimée (auto-resolve). */
  private async clearWarning(videoId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM video_ftp_audit_warnings WHERE video_id = $1`,
      [videoId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const videoFtpAuditService = new VideoFtpAuditService();
export default videoFtpAuditService;
