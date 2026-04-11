/**
 * Repository for site_videos pivot table (ADR-048).
 * Manages N:N relationship between sites and videos.
 */

import { query } from '../config/database';
import logger from '../config/logger';

interface SiteVideoRow {
  site_id: string;
  video_id: string;
  added_at: Date;
  added_by: string | null;
}

class SiteVideoRepository {
  /**
   * Link a video to a site.
   */
  async link(siteId: string, videoId: string, addedBy?: string): Promise<void> {
    await query(
      `INSERT INTO site_videos (site_id, video_id, added_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, video_id) DO NOTHING`,
      [siteId, videoId, addedBy || null]
    );
  }

  /**
   * Link a video to multiple sites.
   */
  async linkToSites(videoId: string, siteIds: string[], addedBy?: string): Promise<number> {
    if (siteIds.length === 0) return 0;

    const values = siteIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    const params = siteIds.flatMap(siteId => [siteId, videoId, addedBy || null]);

    const result = await query(
      `INSERT INTO site_videos (site_id, video_id, added_by)
       VALUES ${values}
       ON CONFLICT (site_id, video_id) DO NOTHING`,
      params
    );

    return result.rowCount ?? 0;
  }

  /**
   * Unlink a video from a site.
   */
  async unlink(siteId: string, videoId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM site_videos WHERE site_id = $1 AND video_id = $2',
      [siteId, videoId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all site IDs linked to a video.
   */
  async findSitesByVideo(videoId: string): Promise<string[]> {
    const result = await query<{ site_id: string }>(
      'SELECT site_id FROM site_videos WHERE video_id = $1 ORDER BY added_at',
      [videoId]
    );
    return result.rows.map(r => r.site_id);
  }

  /**
   * Get all video IDs linked to a site.
   */
  async findVideosBySite(siteId: string): Promise<string[]> {
    const result = await query<{ video_id: string }>(
      'SELECT video_id FROM site_videos WHERE site_id = $1 ORDER BY added_at DESC',
      [siteId]
    );
    return result.rows.map(r => r.video_id);
  }

  /**
   * Check if a video is linked to a specific site.
   */
  async isLinked(siteId: string, videoId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM site_videos WHERE site_id = $1 AND video_id = $2) as exists',
      [siteId, videoId]
    );
    return result.rows[0]?.exists ?? false;
  }

  /**
   * Count how many sites use a given video.
   */
  async countSites(videoId: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM site_videos WHERE video_id = $1',
      [videoId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Remove all site links for a video.
   */
  async unlinkAll(videoId: string): Promise<number> {
    const result = await query(
      'DELETE FROM site_videos WHERE video_id = $1',
      [videoId]
    );
    return result.rowCount ?? 0;
  }
}

export const siteVideoRepository = new SiteVideoRepository();
