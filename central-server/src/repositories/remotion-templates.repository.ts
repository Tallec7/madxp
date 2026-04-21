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
  site_id: string | null;
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
  site_id?: string | null;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  props_schema?: Record<string, unknown>[];
  default_props?: Record<string, unknown>;
  site_id?: string | null;
  canvas_width?: number;
  canvas_height?: number;
}

export interface NeoProTemplateVersion extends QueryResultRow {
  id: string;
  template_id: string;
  props_schema: Record<string, unknown>[];
  default_props: Record<string, unknown>;
  snapshot_reason: string | null;
  created_by: string | null;
  created_at: Date;
}

class RemotionTemplatesRepository {
  async findAll(publishedOnly = false): Promise<NeoProTemplate[]> {
    const where = publishedOnly ? 'WHERE published = true' : '';
    const result = await query<NeoProTemplate>(
      `SELECT id, name, composition_id, description, props_schema, default_props,
              thumbnail_url, published, site_id, created_at
       FROM neopro_templates
       ${where}
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  /**
   * ADR-075 V2 — list templates visible par un site : globaux (site_id IS NULL)
   * OR scopés à ce site. Utilisé par la gallery côté dashboard club/operator.
   */
  async findVisibleForSite(siteId: string, publishedOnly = false): Promise<NeoProTemplate[]> {
    const publishedClause = publishedOnly ? 'AND published = true' : '';
    const result = await query<NeoProTemplate>(
      `SELECT id, name, composition_id, description, props_schema, default_props,
              thumbnail_url, published, site_id, created_at
       FROM neopro_templates
       WHERE (site_id IS NULL OR site_id = $1) ${publishedClause}
       ORDER BY site_id NULLS LAST, created_at DESC`,
      [siteId]
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
      `INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, created_by, site_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.name,
        input.composition_id,
        input.description ?? null,
        JSON.stringify(input.props_schema ?? []),
        JSON.stringify(input.default_props ?? {}),
        input.created_by ?? null,
        input.site_id ?? null,
      ]
    );
    return result.rows[0];
  }

  async updateDefaultProps(id: string, defaultProps: Record<string, unknown>): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      `UPDATE neopro_templates SET default_props = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [JSON.stringify(defaultProps), id]
    );
    return result.rows[0] || null;
  }

  async setPublished(id: string, published: boolean): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      `UPDATE neopro_templates SET published = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [published, id]
    );
    return result.rows[0] || null;
  }

  async findSchemaVersion(id: string): Promise<number | null> {
    const result = await query<{ schema_version: number }>(
      'SELECT schema_version FROM neopro_templates WHERE id = $1',
      [id]
    );
    const row = result.rows[0];
    return row ? Number(row.schema_version) : null;
  }

  async setSchemaVersion(id: string, schemaVersion: 1 | 2): Promise<NeoProTemplate | null> {
    const result = await query<NeoProTemplate>(
      `UPDATE neopro_templates SET schema_version = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [schemaVersion, id]
    );
    return result.rows[0] || null;
  }

  async countStudioShadowData(id: string): Promise<{ variants: number; textFields: number; imageSlots: number }> {
    const result = await query<{ variants: string; text_fields: string; image_slots: string }>(
      `SELECT
         (SELECT COUNT(*) FROM template_variants WHERE template_id = $1)     AS variants,
         (SELECT COUNT(*) FROM template_text_fields WHERE template_id = $1)  AS text_fields,
         (SELECT COUNT(*) FROM template_image_slots WHERE template_id = $1)  AS image_slots`,
      [id]
    );
    const row = result.rows[0];
    return {
      variants: Number(row?.variants ?? 0),
      textFields: Number(row?.text_fields ?? 0),
      imageSlots: Number(row?.image_slots ?? 0),
    };
  }

  /**
   * Update template's editable fields. Any UPDATE that touches props_schema or
   * default_props triggers an automatic snapshot into neopro_template_versions
   * (see trigger `trg_neopro_templates_snapshot`, ADR-055).
   */
  async update(id: string, input: UpdateTemplateInput): Promise<NeoProTemplate | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.props_schema !== undefined) {
      fields.push(`props_schema = $${idx++}`);
      values.push(JSON.stringify(input.props_schema));
    }
    if (input.default_props !== undefined) {
      fields.push(`default_props = $${idx++}`);
      values.push(JSON.stringify(input.default_props));
    }
    if (input.site_id !== undefined) {
      fields.push(`site_id = $${idx++}`);
      values.push(input.site_id);
    }
    if (input.canvas_width !== undefined) {
      fields.push(`canvas_width = $${idx++}`);
      values.push(input.canvas_width);
    }
    if (input.canvas_height !== undefined) {
      fields.push(`canvas_height = $${idx++}`);
      values.push(input.canvas_height);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await query<NeoProTemplate>(
      `UPDATE neopro_templates SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Duplicate a template: copies composition_id, description, props_schema and
   * default_props. The new row starts unpublished. Name defaults to
   * "<original> (copie)" when caller does not provide one.
   */
  async duplicate(sourceId: string, options: { name?: string; createdBy?: string | null }): Promise<NeoProTemplate | null> {
    const src = await this.findById(sourceId);
    if (!src) return null;

    const newName = options.name?.trim() || `${src.name} (copie)`;
    const result = await query<NeoProTemplate>(
      `INSERT INTO neopro_templates
        (name, composition_id, description, props_schema, default_props, created_by, published)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [
        newName,
        src.composition_id,
        src.description,
        JSON.stringify(src.props_schema),
        JSON.stringify(src.default_props),
        options.createdBy ?? null,
      ]
    );
    return result.rows[0];
  }
}

/**
 * Versions repository — read-only reads + a manual snapshot helper.
 * Most snapshots are created automatically by `trg_neopro_templates_snapshot`
 * (AFTER INSERT/UPDATE on neopro_templates), see ADR-055.
 */
class RemotionTemplateVersionsRepository {
  async listByTemplate(templateId: string, limit = 50): Promise<NeoProTemplateVersion[]> {
    const result = await query<NeoProTemplateVersion>(
      `SELECT id, template_id, props_schema, default_props, snapshot_reason,
              created_by, created_at
       FROM neopro_template_versions
       WHERE template_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [templateId, limit]
    );
    return result.rows;
  }

  async findById(versionId: string): Promise<NeoProTemplateVersion | null> {
    const result = await query<NeoProTemplateVersion>(
      `SELECT id, template_id, props_schema, default_props, snapshot_reason,
              created_by, created_at
       FROM neopro_template_versions
       WHERE id = $1`,
      [versionId]
    );
    return result.rows[0] || null;
  }
}

export const remotionTemplatesRepository = new RemotionTemplatesRepository();
export const remotionTemplateVersionsRepository = new RemotionTemplateVersionsRepository();
