import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Display type slug — 'tv', 'secondary', or any custom type (e.g. 'led-banner', 'totem') */
export type DisplayType = string;

export interface VideoVariantRow extends QueryResultRow {
  id: string;
  video_id: string;
  display_type: DisplayType;
  filename: string;
  original_name: string | null;
  storage_path: string;
  file_size: number;
  checksum: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVideoVariantInput {
  video_id: string;
  display_type: DisplayType;
  filename: string;
  original_name: string | null;
  storage_path: string;
  file_size: number;
  checksum: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
}

export interface SecondaryVariantByFilenameRow extends QueryResultRow {
  filename: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  source_filename: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class VideoVariantRepositoryImpl extends BaseRepository<VideoVariantRow> {
  constructor() {
    super('video_variants');
  }

  async findByVideoId(videoId: string): Promise<VideoVariantRow[]> {
    const result = await query<VideoVariantRow>(
      `SELECT * FROM video_variants WHERE video_id = $1 ORDER BY display_type`,
      [videoId]
    );
    return result.rows;
  }

  async findByVideoAndDisplay(
    videoId: string,
    displayType: DisplayType
  ): Promise<VideoVariantRow | null> {
    const result = await query<VideoVariantRow>(
      `SELECT * FROM video_variants
       WHERE video_id = $1 AND display_type = $2`,
      [videoId, displayType]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateVideoVariantInput): Promise<VideoVariantRow> {
    const result = await query<VideoVariantRow>(
      `INSERT INTO video_variants
       (video_id, display_type, filename, original_name, storage_path,
        file_size, checksum, mime_type, width, height, duration,
        metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (video_id, display_type) DO UPDATE SET
         filename = EXCLUDED.filename,
         original_name = EXCLUDED.original_name,
         storage_path = EXCLUDED.storage_path,
         file_size = EXCLUDED.file_size,
         checksum = EXCLUDED.checksum,
         mime_type = EXCLUDED.mime_type,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         duration = EXCLUDED.duration,
         metadata = EXCLUDED.metadata,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING *`,
      [
        input.video_id, input.display_type, input.filename,
        input.original_name, input.storage_path, input.file_size,
        input.checksum, input.mime_type, input.width, input.height,
        input.duration, input.metadata, input.uploaded_by,
      ]
    );
    return result.rows[0];
  }

  async findStoragePath(
    videoId: string,
    displayType: DisplayType
  ): Promise<string | null> {
    const result = await query<{ storage_path: string }>(
      `SELECT storage_path FROM video_variants
       WHERE video_id = $1 AND display_type = $2`,
      [videoId, displayType]
    );
    return result.rows[0]?.storage_path || null;
  }

  async deleteByVideoAndDisplay(
    videoId: string,
    displayType: DisplayType
  ): Promise<boolean> {
    const result = await query(
      `DELETE FROM video_variants
       WHERE video_id = $1 AND display_type = $2`,
      [videoId, displayType]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async findSecondaryVariantsForVideos(
    videoIds: string[]
  ): Promise<VideoVariantRow[]> {
    if (videoIds.length === 0) return [];
    const placeholders = videoIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<VideoVariantRow>(
      `SELECT * FROM video_variants
       WHERE video_id IN (${placeholders}) AND display_type = 'secondary'`,
      videoIds
    );
    return result.rows;
  }

  async findSecondaryVariantsByFilenames(
    filenames: string[]
  ): Promise<SecondaryVariantByFilenameRow[]> {
    if (filenames.length === 0) return [];
    const placeholders = filenames.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<SecondaryVariantByFilenameRow>(
      `SELECT vv.filename, vv.storage_path, vv.width, vv.height, vv.duration,
              v.filename AS source_filename
       FROM video_variants vv
       JOIN videos v ON v.id = vv.video_id
       WHERE v.filename IN (${placeholders}) AND vv.display_type = 'secondary'`,
      filenames
    );
    return result.rows;
  }
}

export const videoVariantRepository = new VideoVariantRepositoryImpl();
