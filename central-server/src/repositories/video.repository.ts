import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface VideoRow {
  [key: string]: unknown;
  id: string;
  filename: string;
  original_name: string;
  category: string | null;
  subcategory: string | null;
  file_size: number;
  duration: number | null;
  url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  uploaded_for_site_id: string | null;
  upload_status: string;
  created_at: Date;
  updated_at: Date;
}

export interface VideoFilters {
  category?: string;
  search?: string;
}

export interface CreateVideoInput {
  filename: string;
  original_name: string;
  category: string | null;
  subcategory: string | null;
  file_size: number;
  mime_type: string;
  storage_path: string;
  checksum: string;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  uploaded_for_site_id: string | null;
  upload_status: string;
  upload_verified_at: Date | null;
  upload_verified_size: number | null;
  duration?: number;
}

export interface CreateVideoBulkResult {
  [key: string]: unknown;
  id: string;
  name: string;
  original_name: string;
  size: number;
  checksum: string;
}

export interface UpdateVideoInput {
  filename?: string;
  original_name?: string;
  category?: string;
  subcategory?: string;
  file_size?: number;
  duration?: number;
  storage_path?: string;
  thumbnail_url?: string;
  metadata?: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class VideoRepositoryImpl extends BaseRepository<VideoRow> {
  constructor() {
    super('videos');
  }

  /**
   * Liste legere id + titre pour les dropdowns (pas de pagination, pas de metadata lourde).
   */
  async findAllNames(): Promise<{ id: string; title: string; file_size: number }[]> {
    const result = await query<{ id: string; original_name: string; filename: string; metadata: Record<string, unknown>; file_size: number }>(
      `SELECT id, original_name, filename, metadata, file_size
       FROM videos
       ORDER BY created_at DESC`
    );
    return result.rows.map(r => ({
      id: r.id,
      title: (r.metadata as { title?: string })?.title || r.original_name || r.filename,
      file_size: r.file_size,
    }));
  }

  /**
   * Retourne le sous-ensemble d'IDs qui existent dans la table videos.
   */
  async findExistingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<{ id: string }>(
      `SELECT id FROM videos WHERE id IN (${placeholders})`,
      ids
    );
    return new Set(result.rows.map(r => r.id));
  }

  /**
   * Verifie si un nom de fichier existe deja en base.
   */
  async filenameExists(filename: string): Promise<boolean> {
    const result = await query(
      'SELECT id FROM videos WHERE filename = $1',
      [filename]
    );
    return result.rows.length > 0;
  }

  /**
   * Liste paginee de videos avec filtres optionnels.
   * Retourne data + total en parallele.
   */
  async findAllPaginated(
    filters: VideoFilters,
    limit: number,
    offset: number
  ): Promise<{ rows: VideoRow[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.search) {
      whereClause += ` AND (original_name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const dataQuery = `
      SELECT id, filename, original_name, category, subcategory,
             file_size, duration, storage_path as url,
             thumbnail_url, metadata, created_at, updated_at
      FROM videos
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `SELECT COUNT(*) as count FROM videos ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      query<VideoRow>(dataQuery, [...params, limit, offset]),
      query(countQuery, params),
    ]);

    const total = parseInt(String((countResult.rows[0] as Record<string, unknown>)?.count ?? '0'), 10);

    return { rows: dataResult.rows, total };
  }

  /**
   * Recupere une video par ID avec alias storage_path -> url.
   */
  async findVideoById(id: string): Promise<VideoRow | null> {
    const result = await query<VideoRow>(
      `SELECT id, filename, original_name, category, subcategory,
              file_size, duration, storage_path as url,
              thumbnail_url, metadata, created_at, updated_at
       FROM videos
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree une video avec toutes les colonnes (upload standard).
   */
  async create(input: CreateVideoInput): Promise<VideoRow> {
    const result = await query<VideoRow>(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by, uploaded_for_site_id, upload_status, upload_verified_at, upload_verified_size${input.duration !== undefined ? ', duration' : ''})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14${input.duration !== undefined ? ', $15' : ''})
       RETURNING id, filename as name, original_name, category, subcategory, file_size as size, duration, storage_path as url, thumbnail_url, checksum, metadata, uploaded_for_site_id, upload_status, created_at, updated_at`,
      [
        input.filename, input.original_name, input.category, input.subcategory,
        input.file_size, input.mime_type, input.storage_path, input.checksum,
        input.metadata, input.uploaded_by, input.uploaded_for_site_id,
        input.upload_status, input.upload_verified_at, input.upload_verified_size,
        ...(input.duration !== undefined ? [input.duration] : []),
      ]
    );
    return result.rows[0];
  }

  /**
   * Cree une video en bulk (subset de colonnes RETURNING).
   */
  async createBulk(input: Omit<CreateVideoInput, 'upload_status' | 'upload_verified_at' | 'upload_verified_size'>): Promise<CreateVideoBulkResult> {
    const result = await query<CreateVideoBulkResult>(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by, uploaded_for_site_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, filename as name, original_name, file_size as size, checksum`,
      [
        input.filename, input.original_name, input.category, input.subcategory,
        input.file_size, input.mime_type, input.storage_path, input.checksum,
        input.metadata, input.uploaded_by, input.uploaded_for_site_id,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une video (COALESCE pour ne modifier que les champs fournis).
   */
  async update(id: string, input: UpdateVideoInput): Promise<VideoRow | null> {
    const result = await query<VideoRow>(
      `UPDATE videos
       SET filename = COALESCE($1, filename),
           original_name = COALESCE($2, original_name),
           category = COALESCE($3, category),
           subcategory = COALESCE($4, subcategory),
           file_size = COALESCE($5, file_size),
           duration = COALESCE($6, duration),
           storage_path = COALESCE($7, storage_path),
           thumbnail_url = COALESCE($8, thumbnail_url),
           metadata = COALESCE($9, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        input.filename, input.original_name, input.category,
        input.subcategory, input.file_size, input.duration,
        input.storage_path, input.thumbnail_url, input.metadata, id,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere le chemin de stockage d'une video.
   */
  async findStoragePath(id: string): Promise<string | null> {
    const result = await query<{ storage_path: string }>(
      'SELECT storage_path FROM videos WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].storage_path;
  }

  /**
   * Supprime une video et retourne true si supprimee.
   */
  async deleteAndReturn(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM videos WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Liste paginee de videos priorisees pour un site.
   * Les videos uploadees pour ce site apparaissent en premier.
   */
  async findForSitePaginated(
    siteId: string,
    filters: VideoFilters,
    limit: number,
    offset: number
  ): Promise<{ rows: VideoRow[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [siteId]; // $1 = siteId pour le tri
    let paramIndex = 2;

    if (filters.category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.search) {
      whereClause += ` AND (original_name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const dataQuery = `
      SELECT id, filename, original_name, category, subcategory,
             file_size, duration, storage_path as url,
             thumbnail_url, metadata, uploaded_for_site_id,
             created_at, updated_at,
             CASE WHEN uploaded_for_site_id = $1 THEN 1 ELSE 0 END as is_for_site
      FROM videos
      ${whereClause}
      ORDER BY is_for_site DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `SELECT COUNT(*) as count FROM videos ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      query<VideoRow & { is_for_site: number }>(dataQuery, [...params, limit, offset]),
      query(countQuery, params.slice(1)), // Sans siteId pour le count
    ]);

    const total = parseInt(String((countResult.rows[0] as Record<string, unknown>)?.count ?? '0'), 10);

    return { rows: dataResult.rows, total };
  }
}

export const videoRepository = new VideoRepositoryImpl();
