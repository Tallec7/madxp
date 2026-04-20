import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type VideoCategoryType = 'action' | 'loop' | 'match';

export interface VideoCategoryRow extends QueryResultRow {
  id: string;
  site_id: string;
  name: string;
  type: VideoCategoryType;
  icon: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVideoCategoryInput {
  site_id: string;
  name: string;
  type: VideoCategoryType;
  icon?: string | null;
  sort_order?: number;
}

export interface UpdateVideoCategoryInput {
  name?: string;
  type?: VideoCategoryType;
  icon?: string | null;
  sort_order?: number;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class VideoCategoryRepositoryImpl extends BaseRepository<VideoCategoryRow> {
  constructor() {
    super('video_categories');
  }

  async findBySiteId(siteId: string): Promise<VideoCategoryRow[]> {
    const result = await query<VideoCategoryRow>(
      `SELECT * FROM video_categories
       WHERE site_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [siteId]
    );
    return result.rows;
  }

  async findByIdAndSite(id: string, siteId: string): Promise<VideoCategoryRow | null> {
    const result = await query<VideoCategoryRow>(
      `SELECT * FROM video_categories WHERE id = $1 AND site_id = $2`,
      [id, siteId]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateVideoCategoryInput): Promise<VideoCategoryRow> {
    const result = await query<VideoCategoryRow>(
      `INSERT INTO video_categories (site_id, name, type, icon, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE($5, (
         SELECT COALESCE(MAX(sort_order), -1) + 1 FROM video_categories WHERE site_id = $1
       )))
       RETURNING *`,
      [input.site_id, input.name, input.type, input.icon ?? null, input.sort_order ?? null]
    );
    return result.rows[0];
  }

  async update(id: string, siteId: string, input: UpdateVideoCategoryInput): Promise<VideoCategoryRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { fields.push(`name = $${idx++}`); values.push(input.name); }
    if (input.type !== undefined) { fields.push(`type = $${idx++}`); values.push(input.type); }
    if (input.icon !== undefined) { fields.push(`icon = $${idx++}`); values.push(input.icon); }
    if (input.sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(input.sort_order); }

    if (fields.length === 0) return this.findByIdAndSite(id, siteId);

    fields.push(`updated_at = NOW()`);
    values.push(id, siteId);

    const result = await query<VideoCategoryRow>(
      `UPDATE video_categories SET ${fields.join(', ')}
       WHERE id = $${idx++} AND site_id = $${idx}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteByIdAndSite(id: string, siteId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM video_categories WHERE id = $1 AND site_id = $2`,
      [id, siteId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export const videoCategoryRepository = new VideoCategoryRepositoryImpl();
