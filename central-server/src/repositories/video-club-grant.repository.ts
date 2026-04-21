import { query } from '../config/database';

export interface VideoClubGrantRow {
  [key: string]: unknown;
  video_id: string;
  site_id: string;
  site_name: string;
  club_name: string | null;
  created_at: Date;
}

class VideoClubGrantRepository {
  async findGrantedSiteIdsForVideo(videoId: string): Promise<VideoClubGrantRow[]> {
    const result = await query<VideoClubGrantRow>(
      `SELECT g.video_id, g.site_id, s.site_name, s.club_name, g.created_at
       FROM video_club_grants g
       JOIN sites s ON s.id = g.site_id
       WHERE g.video_id = $1
       ORDER BY g.created_at ASC`,
      [videoId]
    );
    return result.rows;
  }

  async findGrantedVideoIdsForSite(siteId: string): Promise<Set<string>> {
    const result = await query<{ video_id: string }>(
      'SELECT video_id FROM video_club_grants WHERE site_id = $1',
      [siteId]
    );
    return new Set(result.rows.map((r) => r.video_id));
  }

  async addGrant(videoId: string, siteId: string): Promise<void> {
    await query(
      `INSERT INTO video_club_grants (video_id, site_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [videoId, siteId]
    );
  }

  async removeGrant(videoId: string, siteId: string): Promise<void> {
    await query(
      'DELETE FROM video_club_grants WHERE video_id = $1 AND site_id = $2',
      [videoId, siteId]
    );
  }

  async hasGrant(videoId: string, siteId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM video_club_grants WHERE video_id = $1 AND site_id = $2) AS exists',
      [videoId, siteId]
    );
    return result.rows[0]?.exists ?? false;
  }
}

export const videoClubGrantRepository = new VideoClubGrantRepository();
