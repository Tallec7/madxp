import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Display type slug — 'tv', 'secondary', or any custom type (e.g. 'led-banner', 'totem') */
export type DisplayType = string;

/**
 * Mise en page d'une variante LED périmétrique (PROP-014 §8, ADR-134).
 * NULL pour les variantes non-LED (la colonne est inerte hors du domaine LED).
 */
export type VariantLayout = 'repeated' | 'scrolling' | 'stretched';
export const VARIANT_LAYOUTS: readonly VariantLayout[] = ['repeated', 'scrolling', 'stretched'];

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
  layout: VariantLayout | null;
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
  /** Mise en page LED (PROP-014). NULL/omis pour les variantes non-LED. */
  layout?: VariantLayout | null;
}

export interface SecondaryVariantByFilenameRow extends QueryResultRow {
  filename: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  source_filename: string;
}

/** Phase 5 — PROP-002: variant row with display_type for N-display queries */
export interface VariantByFilenameRow extends QueryResultRow {
  filename: string;
  display_type: string;
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
        metadata, uploaded_by, layout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
         -- Préserve le layout existant si l'upsert (ré-upload) n'en fournit pas.
         layout = COALESCE(EXCLUDED.layout, video_variants.layout),
         updated_at = NOW()
       RETURNING *`,
      [
        input.video_id, input.display_type, input.filename,
        input.original_name, input.storage_path, input.file_size,
        input.checksum, input.mime_type, input.width, input.height,
        input.duration, input.metadata, input.uploaded_by,
        input.layout ?? null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met à jour uniquement la mise en page (PROP-014 §8) d'une variante existante.
   * `layout = null` réinitialise. Retourne la row mise à jour ou null si absente.
   */
  async updateLayout(
    videoId: string,
    displayType: DisplayType,
    layout: VariantLayout | null
  ): Promise<VideoVariantRow | null> {
    const result = await query<VideoVariantRow>(
      `UPDATE video_variants
       SET layout = $3, updated_at = NOW()
       WHERE video_id = $1 AND display_type = $2
       RETURNING *`,
      [videoId, displayType, layout]
    );
    return result.rows[0] || null;
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
       WHERE video_id IN (${placeholders}) AND display_type != 'tv'`,
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

  /** Phase 5H — batch variant counts for dashboard badges (X/N) */
  async findVariantCountsByVideoIds(
    videoIds: string[]
  ): Promise<Map<string, { count: number; types: string[] }>> {
    const result = new Map<string, { count: number; types: string[] }>();
    if (videoIds.length === 0) return result;

    const placeholders = videoIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query<{ video_id: string; count: string; types: string[] }>(
      `SELECT video_id, COUNT(*)::text AS count, ARRAY_AGG(display_type ORDER BY display_type) AS types
       FROM video_variants
       WHERE video_id IN (${placeholders})
       GROUP BY video_id`,
      videoIds
    );

    for (const row of rows.rows) {
      result.set(row.video_id, {
        count: parseInt(row.count, 10),
        types: row.types,
      });
    }

    return result;
  }

  /**
   * Phase 5 — PROP-002: query variants for given display types.
   * Empty `displayTypes` → returns ALL variants for the given filenames (any display_type).
   * This fixes the bug where new display types ('led-banner', 'led-wall', etc.) were silently
   * ignored because callers passed only ['secondary'] by default.
   */
  async findVariantsByFilenamesAndTypes(
    filenames: string[],
    displayTypes: string[] = []
  ): Promise<VariantByFilenameRow[]> {
    if (filenames.length === 0) return [];
    const fnPlaceholders = filenames.map((_, i) => `$${i + 1}`).join(', ');
    let sql = `SELECT vv.filename, vv.display_type, vv.storage_path, vv.width, vv.height, vv.duration,
                      v.filename AS source_filename
               FROM video_variants vv
               JOIN videos v ON v.id = vv.video_id
               WHERE v.filename IN (${fnPlaceholders})`;
    const params: string[] = [...filenames];
    if (displayTypes.length > 0) {
      const dtPlaceholders = displayTypes.map((_, i) => `$${filenames.length + i + 1}`).join(', ');
      sql += ` AND vv.display_type IN (${dtPlaceholders})`;
      params.push(...displayTypes);
    }
    const result = await query<VariantByFilenameRow>(sql, params);
    return result.rows;
  }
}

export const videoVariantRepository = new VideoVariantRepositoryImpl();
