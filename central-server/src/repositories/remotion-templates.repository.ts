import { QueryResultRow } from 'pg';
import { query } from '../config/database';

export interface NeoProTemplate extends QueryResultRow {
  id: string;
  name: string;
  composition_id: string;
  description: string | null;
  props_schema: Record<string, unknown>[];
  default_props: Record<string, unknown>;
  thumbnail_url: string | null;
  published: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateInput {
  name: string;
  composition_id: string;
  description?: string | null;
  props_schema?: Record<string, unknown>[];
  default_props?: Record<string, unknown>;
  created_by?: string | null;
}

class RemotionTemplatesRepository {
  async findAll(publishedOnly = false): Promise<NeoProTemplate[]> {
    const where = publishedOnly ? 'WHERE published = true' : '';
    const result = await query<NeoProTemplate>(
      `SELECT id, name, composition_id, description, props_schema, default_props,
              thumbnail_url, published, created_at
       FROM neopro_templates
       ${where}
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async findById(id: string): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      'SELECT * FROM neopro_templates WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findPublishedById(id: string): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      'SELECT * FROM neopro_templates WHERE id = $1 AND published = true',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateTemplateInput): Promise<NeoProTemplate> {
    const result = await query<NeoProTemplate>(
      `INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.name,
        input.composition_id,
        input.description ?? null,
        JSON.stringify(input.props_schema ?? []),
        JSON.stringify(input.default_props ?? {}),
        input.created_by ?? null,
      ]
    );
    return result.rows[0];
  }

  async setPublished(id: string, published: boolean): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      `UPDATE neopro_templates SET published = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [published, id]
    );
    return result.rows[0] || null;
  }
}

export const remotionTemplatesRepository = new RemotionTemplatesRepository();
