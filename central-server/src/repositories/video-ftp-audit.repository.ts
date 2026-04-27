/**
 * Repository pour `video_ftp_audit_warnings` (PR2.2).
 * Détecte les videos.storage_path qui pointent vers un fichier FTP absent.
 */

import { query } from '../config/database';

export interface VideoFtpAuditWarning {
  [key: string]: unknown; // QueryResultRow index signature
  id: string;
  video_id: string;
  video_filename: string;
  video_category: string | null;
  storage_path: string;
  status: 'missing' | 'unreachable';
  http_status: number | null;
  first_detected_at: Date;
  last_checked_at: Date;
  notified_at: Date | null;
  reference_count: number;
}

class VideoFtpAuditRepository {
  /**
   * Liste toutes les warnings actives, enrichies avec le nom du fichier et
   * le nombre de sites qui référencent encore la vidéo (impact métier).
   */
  async findAllActive(limit = 200): Promise<VideoFtpAuditWarning[]> {
    const result = await query<VideoFtpAuditWarning>(
      `SELECT
         w.id,
         w.video_id,
         v.filename AS video_filename,
         v.category AS video_category,
         w.expected_path AS storage_path,
         w.status,
         w.http_status,
         w.first_detected_at,
         w.last_checked_at,
         w.notified_at,
         (SELECT COUNT(*)::int FROM site_videos sv WHERE sv.video_id = w.video_id) AS reference_count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       ORDER BY reference_count DESC, w.first_detected_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Count active FTP orphans referenced by a specific site, via `site_videos`.
   * Source du badge tab "Contenu" sur `/sites/:id` (chantier vidéos manquantes) :
   * une orpheline référencée par ce site = vidéo qui plantera quand quelqu'un
   * tentera de la jouer côté TV.
   */
  async countActiveForSite(siteId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT w.video_id)::int AS count
       FROM video_ftp_audit_warnings w
       JOIN site_videos sv ON sv.video_id = w.video_id
       WHERE sv.site_id = $1`,
      [siteId],
    );
    return parseInt(String(result.rows[0]?.count || '0'), 10) || 0;
  }

  /**
   * List active FTP orphan warnings for a specific site (joined via site_videos).
   * Alimente la bannière détaillée du tab "Contenu" sur `/sites/:id`.
   */
  async findActiveForSite(siteId: string, limit = 100): Promise<VideoFtpAuditWarning[]> {
    const result = await query<VideoFtpAuditWarning>(
      `SELECT
         w.id,
         w.video_id,
         v.filename AS video_filename,
         v.category AS video_category,
         w.expected_path AS storage_path,
         w.status,
         w.http_status,
         w.first_detected_at,
         w.last_checked_at,
         w.notified_at,
         1 AS reference_count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       JOIN site_videos sv ON sv.video_id = w.video_id
       WHERE sv.site_id = $1
       ORDER BY w.first_detected_at ASC
       LIMIT $2`,
      [siteId, limit],
    );
    return result.rows;
  }

  async countActive(): Promise<{ missing: number; unreachable: number }> {
    const result = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int AS count
       FROM video_ftp_audit_warnings
       GROUP BY status`,
    );
    const out = { missing: 0, unreachable: 0 };
    for (const row of result.rows) {
      if (row.status === 'missing') out.missing = parseInt(String(row.count), 10);
      else if (row.status === 'unreachable') out.unreachable = parseInt(String(row.count), 10);
    }
    return out;
  }
}

export const videoFtpAuditRepository = new VideoFtpAuditRepository();
