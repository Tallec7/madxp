/**
 * ADR-075 — Template Studio repository
 * CRUD granulaire sur variants / layers / text_fields / image_slots.
 */

import type { QueryResultRow } from 'pg';
import { query, getClient } from '../config/database';
import type {
  TemplateV2,
  TemplateVariant,
  TemplateLayer,
  TemplateTextField,
  TemplateImageSlot,
  TemplateVariantRow,
  TemplateLayerRow,
  TemplateTextFieldRow,
  TemplateImageSlotRow,
  AnimationPreset,
  AnimationDirection,
  Anchor,
  FitMode,
  Overflow,
  TextAlign,
} from '../types/template-studio.types';

interface TemplateBaseRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  composition_id: string;
  schema_version: number;
  duration_seconds: string;
  fps: number;
  canvas_width: number;
  canvas_height: number;
  thumbnail_url: string | null;
  published: boolean;
  created_at: Date;
  updated_at: Date;
}

const num = (v: string | number): number =>
  typeof v === 'number' ? v : parseFloat(v);

const numOrNull = (v: string | number | null): number | null =>
  v === null || v === undefined ? null : num(v);

const mapVariant = (r: TemplateVariantRow): TemplateVariant => ({
  id: r.id,
  templateId: r.template_id,
  name: r.name,
  backgroundVideoUrl: r.background_video_url,
  thumbnailUrl: r.thumbnail_url,
  sortOrder: r.sort_order,
});

const mapLayer = (r: TemplateLayerRow): TemplateLayer => ({
  id: r.id,
  templateId: r.template_id,
  name: r.name,
  videoUrl: r.video_url,
  zIndex: r.z_index,
  mask: {
    top: num(r.mask_top),
    bottom: num(r.mask_bottom),
    left: num(r.mask_left),
    right: num(r.mask_right),
  },
  durationMs: r.duration_ms,
});

const mapTextField = (r: TemplateTextFieldRow): TemplateTextField => ({
  id: r.id,
  templateId: r.template_id,
  slotKey: r.slot_key,
  label: r.label,
  position: { x: num(r.position_x), y: num(r.position_y) },
  maxWidth: num(r.max_width),
  fontFamily: r.font_family,
  fontSize: r.font_size,
  color: r.color,
  align: r.align,
  appearAt: num(r.appear_at),
  appearDuration: num(r.appear_duration),
  animation: r.animation,
  defaultValue: r.default_value,
  maxChars: r.max_chars,
  multiline: r.multiline,
  required: r.required,
  sortOrder: r.sort_order,
  alwaysVisible: r.always_visible,
  scaleFrom: num(r.scale_from),
  scaleTo: num(r.scale_to),
  layerId: r.layer_id,
  respectAlpha: r.respect_alpha,
  animationDirection: r.animation_direction,
  textTransform: r.text_transform ?? 'none',
  visibleIf: r.visible_if ?? null,
});

const mapImageSlot = (r: TemplateImageSlotRow): TemplateImageSlot => ({
  id: r.id,
  templateId: r.template_id,
  slotKey: r.slot_key,
  label: r.label,
  position: {
    x: num(r.position_x),
    y: num(r.position_y),
    width: num(r.width),
    height: num(r.height),
  },
  appearAt: num(r.appear_at),
  appearDuration: num(r.appear_duration),
  animation: r.animation,
  aspectRatio: r.aspect_ratio,
  required: r.required,
  sortOrder: r.sort_order,
  layerId: r.layer_id,
  anchor: r.anchor,
  fitMode: r.fit_mode,
  safeTopPct: numOrNull(r.safe_top_pct),
  safeLeftPct: numOrNull(r.safe_left_pct),
  safeWidthPct: numOrNull(r.safe_width_pct),
  safeHeightPct: numOrNull(r.safe_height_pct),
  overflow: r.overflow,
  animationDirection: r.animation_direction,
  scaleFrom: numOrNull(r.scale_from),
  scaleTo: numOrNull(r.scale_to),
  visibleIf: r.visible_if ?? null,
});

export interface CreateVariantInput {
  name: string;
  backgroundVideoUrl: string;
  thumbnailUrl?: string | null;
  sortOrder?: number;
}

export interface UpdateVariantInput {
  name?: string;
  backgroundVideoUrl?: string;
  thumbnailUrl?: string | null;
  sortOrder?: number;
}

export interface CreateLayerInput {
  name: string;
  videoUrl: string;
  zIndex: number;
  mask?: { top?: number; bottom?: number; left?: number; right?: number };
  durationMs?: number;
}

export interface UpdateLayerInput {
  name?: string;
  videoUrl?: string;
  zIndex?: number;
  mask?: { top?: number; bottom?: number; left?: number; right?: number };
  durationMs?: number;
}

export interface CreateTextFieldInput {
  slotKey: string;
  label: string;
  positionX: number;
  positionY: number;
  maxWidth?: number;
  fontFamily?: string;
  fontSize: number;
  color?: string;
  align?: TextAlign;
  appearAt: number;
  appearDuration?: number;
  animation?: AnimationPreset;
  defaultValue?: string;
  maxChars?: number | null;
  multiline?: boolean;
  required?: boolean;
  sortOrder?: number;
  alwaysVisible?: boolean;
  scaleFrom?: number;
  scaleTo?: number;
  layerId?: string | null;
  respectAlpha?: boolean;
  animationDirection?: AnimationDirection;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  /** PDF JOUEUR §démarrage — slot conditionnel `<key> == "<value>"`. NULL = toujours visible. */
  visibleIf?: string | null;
}

export type UpdateTextFieldInput = Partial<CreateTextFieldInput>;

export interface CreateImageSlotInput {
  slotKey: string;
  label: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  appearAt: number;
  appearDuration?: number;
  animation?: AnimationPreset;
  aspectRatio?: string | null;
  required?: boolean;
  sortOrder?: number;
  layerId?: string | null;
  anchor?: Anchor;
  fitMode?: FitMode;
  safeTopPct?: number | null;
  safeLeftPct?: number | null;
  safeWidthPct?: number | null;
  safeHeightPct?: number | null;
  overflow?: Overflow;
  animationDirection?: AnimationDirection;
  scaleFrom?: number | null;
  scaleTo?: number | null;
  /** PDF JOUEUR §démarrage — slot conditionnel (cf. CreateTextFieldInput.visibleIf). */
  visibleIf?: string | null;
}

export type UpdateImageSlotInput = Partial<CreateImageSlotInput>;

class TemplateStudioRepository {
  /**
   * Charge un template v2 avec toutes ses relations en une seule méthode
   * (4 requêtes parallèles). Retourne null si template inexistant ou en
   * schema_version=1 (legacy). Le caller gère le fallback legacy.
   */
  async findV2ById(id: string): Promise<TemplateV2 | null> {
    const base = await query<TemplateBaseRow>(
      `SELECT id, name, description, composition_id, schema_version,
              duration_seconds, fps, canvas_width, canvas_height,
              thumbnail_url, published, created_at, updated_at
       FROM neopro_templates
       WHERE id = $1`,
      [id]
    );
    const row = base.rows[0];
    if (!row || row.schema_version !== 2) return null;

    const [variants, layers, textFields, imageSlots, optionRows] = await Promise.all([
      this.listVariants(id),
      this.listLayers(id),
      this.listTextFields(id),
      this.listImageSlots(id),
      // PDF JOUEUR §démarrage — options exposées au user. Lecture inline pour
      // garder findV2ById en 1 round-trip Promise.all (au lieu de dépendre du
      // templateOptionsRepository depuis ici, ce qui causerait un import circulaire).
      query<{
        id: string;
        template_id: string;
        key: string;
        label: string;
        type: 'enum' | 'boolean';
        values: unknown[];
        default_value: string;
        user_editable: boolean;
        sort_order: number;
      }>(
        `SELECT id, template_id, key, label, type, values, default_value, user_editable, sort_order
         FROM template_options WHERE template_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [id]
      ),
    ]);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schemaVersion: 2,
      compositionId: row.composition_id,
      durationSeconds: num(row.duration_seconds),
      fps: row.fps,
      canvasWidth: row.canvas_width,
      canvasHeight: row.canvas_height,
      thumbnailUrl: row.thumbnail_url,
      published: row.published,
      variants,
      layers,
      textFields,
      imageSlots,
      options: optionRows.rows.map((o) => ({
        id: o.id,
        templateId: o.template_id,
        key: o.key,
        label: o.label,
        type: o.type,
        values: Array.isArray(o.values) ? (o.values as string[]) : [],
        defaultValue: o.default_value,
        userEditable: o.user_editable,
        sortOrder: o.sort_order,
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // ---------- Variants ----------

  async listVariants(templateId: string): Promise<TemplateVariant[]> {
    const { rows } = await query<TemplateVariantRow>(
      `SELECT * FROM template_variants
       WHERE template_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [templateId]
    );
    return rows.map(mapVariant);
  }

  async createVariant(
    templateId: string,
    input: CreateVariantInput
  ): Promise<TemplateVariant> {
    const { rows } = await query<TemplateVariantRow>(
      `INSERT INTO template_variants
         (template_id, name, background_video_url, thumbnail_url, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        templateId,
        input.name,
        input.backgroundVideoUrl,
        input.thumbnailUrl ?? null,
        input.sortOrder ?? 0,
      ]
    );
    return mapVariant(rows[0]);
  }

  async updateVariant(
    variantId: string,
    input: UpdateVariantInput
  ): Promise<TemplateVariant | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.backgroundVideoUrl !== undefined) {
      fields.push(`background_video_url = $${idx++}`);
      values.push(input.backgroundVideoUrl);
    }
    if (input.thumbnailUrl !== undefined) {
      fields.push(`thumbnail_url = $${idx++}`);
      values.push(input.thumbnailUrl);
    }
    if (input.sortOrder !== undefined) {
      fields.push(`sort_order = $${idx++}`);
      values.push(input.sortOrder);
    }
    if (fields.length === 0) {
      const { rows } = await query<TemplateVariantRow>(
        `SELECT * FROM template_variants WHERE id = $1`,
        [variantId]
      );
      return rows[0] ? mapVariant(rows[0]) : null;
    }
    values.push(variantId);
    const { rows } = await query<TemplateVariantRow>(
      `UPDATE template_variants SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] ? mapVariant(rows[0]) : null;
  }

  async deleteVariant(variantId: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM template_variants WHERE id = $1`,
      [variantId]
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------- Layers ----------

  async listLayers(templateId: string): Promise<TemplateLayer[]> {
    const { rows } = await query<TemplateLayerRow>(
      `SELECT * FROM template_layers
       WHERE template_id = $1
       ORDER BY z_index ASC, created_at ASC`,
      [templateId]
    );
    return rows.map(mapLayer);
  }

  async createLayer(
    templateId: string,
    input: CreateLayerInput
  ): Promise<TemplateLayer> {
    const m = input.mask ?? {};
    const { rows } = await query<TemplateLayerRow>(
      `INSERT INTO template_layers
         (template_id, name, video_url, z_index,
          mask_top, mask_bottom, mask_left, mask_right, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        templateId,
        input.name,
        input.videoUrl,
        input.zIndex,
        m.top ?? 0,
        m.bottom ?? 0,
        m.left ?? 0,
        m.right ?? 0,
        input.durationMs ?? 5000,
      ]
    );
    return mapLayer(rows[0]);
  }

  async updateLayer(
    layerId: string,
    input: UpdateLayerInput
  ): Promise<TemplateLayer | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.videoUrl !== undefined) {
      fields.push(`video_url = $${idx++}`);
      values.push(input.videoUrl);
    }
    if (input.zIndex !== undefined) {
      fields.push(`z_index = $${idx++}`);
      values.push(input.zIndex);
    }
    if (input.mask) {
      if (input.mask.top !== undefined) {
        fields.push(`mask_top = $${idx++}`);
        values.push(input.mask.top);
      }
      if (input.mask.bottom !== undefined) {
        fields.push(`mask_bottom = $${idx++}`);
        values.push(input.mask.bottom);
      }
      if (input.mask.left !== undefined) {
        fields.push(`mask_left = $${idx++}`);
        values.push(input.mask.left);
      }
      if (input.mask.right !== undefined) {
        fields.push(`mask_right = $${idx++}`);
        values.push(input.mask.right);
      }
    }
    if (input.durationMs !== undefined) {
      fields.push(`duration_ms = $${idx++}`);
      values.push(input.durationMs);
    }
    if (fields.length === 0) {
      const { rows } = await query<TemplateLayerRow>(
        `SELECT * FROM template_layers WHERE id = $1`,
        [layerId]
      );
      return rows[0] ? mapLayer(rows[0]) : null;
    }
    values.push(layerId);
    const { rows } = await query<TemplateLayerRow>(
      `UPDATE template_layers SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] ? mapLayer(rows[0]) : null;
  }

  async deleteLayer(layerId: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM template_layers WHERE id = $1`,
      [layerId]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * ADR-110 / Plan 04 / WIZARD-04 — single transactional reorder of all
   * layers of a template. The N updates run inside one BEGIN/COMMIT
   * (ROLLBACK on any throw) so the z_index sequence is never partially
   * applied. Ownership check rejects layerIds that don't belong to the
   * given template (defense-in-depth — Joi already validates uuid shape
   * but does not check FK ownership).
   *
   * Returns the new ordered list (z_index ASC) so the caller can replace
   * the dashboard signal in one shot.
   *
   * Throws `Error('layer_ownership_mismatch')` if any id doesn't belong
   * to `templateId` — controller maps to 400.
   */
  async reorderLayers(
    templateId: string,
    orderedLayerIds: string[]
  ): Promise<TemplateLayer[]> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const owned: { rows: Array<{ id: string }> } = await client.query(
        `SELECT id FROM template_layers
          WHERE template_id = $1 AND id = ANY($2::uuid[])`,
        [templateId, orderedLayerIds]
      );
      if (owned.rows.length !== orderedLayerIds.length) {
        throw new Error('layer_ownership_mismatch');
      }
      for (let i = 0; i < orderedLayerIds.length; i++) {
        await client.query(
          `UPDATE template_layers
              SET z_index = $1
            WHERE id = $2 AND template_id = $3`,
          [i + 1, orderedLayerIds[i], templateId]
        );
      }
      await client.query('COMMIT');
      const result: { rows: TemplateLayerRow[] } = await client.query(
        `SELECT * FROM template_layers
          WHERE template_id = $1
          ORDER BY z_index ASC`,
        [templateId]
      );
      return result.rows.map(mapLayer);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * ADR-110 / ASSET-03 / pitfall P5 — count published layers (other than
   * the candidate) that share the same video_url as the layer about to be
   * deleted. If > 0, the controller returns 409 to prevent orphaning a
   * WebM that's still referenced by a published template.
   *
   * "Published" is determined by `neopro_templates.published = true`.
   */
  async countLayersSharingVideoUrl(layerId: string): Promise<number> {
    const r = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
         FROM template_layers tl
         JOIN neopro_templates t ON t.id = tl.template_id
        WHERE tl.video_url = (SELECT video_url FROM template_layers WHERE id = $1)
          AND tl.id <> $1
          AND t.published = true`,
      [layerId]
    );
    return parseInt(r.rows[0]?.cnt ?? '0', 10);
  }

  /**
   * ADR-110 / Plan 02 — variant of `countLayersSharingVideoUrl` that takes the
   * URL directly (no layerId). Used by the library-level DELETE to decide
   * whether the asset is still referenced by ≥1 published template.
   */
  async countLayersSharingVideoUrlByUrl(url: string): Promise<number> {
    const r = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
         FROM template_layers tl
         JOIN neopro_templates t ON t.id = tl.template_id
        WHERE tl.video_url = $1
          AND t.published = true`,
      [url]
    );
    return parseInt(r.rows[0]?.cnt ?? '0', 10);
  }

  /**
   * ADR-110 / Plan 02 — list distinct `template_layers.video_url` rows with
   * their first-use timestamp + total reference count across the fleet
   * (published or not). Powers the v3 Asset Manager library grid.
   */
  async listDistinctLayerAssets(): Promise<
    Array<{ url: string; uploadedAt: string; usedByCount: number }>
  > {
    const r = await query<{ url: string; uploaded_at: Date; used_by_count: string }>(
      `SELECT video_url AS url,
              MIN(created_at) AS uploaded_at,
              COUNT(*)::text AS used_by_count
         FROM template_layers
        WHERE video_url IS NOT NULL AND video_url <> ''
        GROUP BY video_url
        ORDER BY MIN(created_at) DESC`
    );
    return r.rows.map((row) => ({
      url: row.url,
      uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : String(row.uploaded_at),
      usedByCount: parseInt(row.used_by_count, 10),
    }));
  }

  // ---------- Text fields ----------

  async listTextFields(templateId: string): Promise<TemplateTextField[]> {
    const { rows } = await query<TemplateTextFieldRow>(
      `SELECT * FROM template_text_fields
       WHERE template_id = $1
       ORDER BY sort_order ASC, slot_key ASC`,
      [templateId]
    );
    return rows.map(mapTextField);
  }

  async createTextField(
    templateId: string,
    input: CreateTextFieldInput
  ): Promise<TemplateTextField> {
    // ADR-086 — layer_id est NOT NULL. Si absent, on rattache au premier layer
    // (z_index ASC) du template. Si aucun layer n'existe, on en crée un vide.
    let layerId = input.layerId ?? null;
    if (!layerId) {
      const existing = await this.listLayers(templateId);
      if (existing.length > 0) {
        layerId = existing[0].id;
      } else {
        const fallback = await this.createLayer(templateId, {
          name: 'Layer par défaut',
          videoUrl: '',
          zIndex: 1,
        });
        layerId = fallback.id;
      }
    }
    const { rows } = await query<TemplateTextFieldRow>(
      `INSERT INTO template_text_fields
         (template_id, slot_key, label, position_x, position_y, max_width,
          font_family, font_size, color, align, appear_at, appear_duration,
          animation, default_value, max_chars, multiline, required, sort_order,
          always_visible, scale_from, scale_to,
          layer_id, respect_alpha, animation_direction, text_transform, visible_if)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING *`,
      [
        templateId,
        input.slotKey,
        input.label,
        input.positionX,
        input.positionY,
        input.maxWidth ?? 0.8,
        input.fontFamily ?? 'Anton',
        input.fontSize,
        input.color ?? '#FFFFFF',
        input.align ?? 'center',
        input.appearAt,
        input.appearDuration ?? 0.4,
        input.animation ?? 'fade',
        input.defaultValue ?? '',
        input.maxChars ?? null,
        input.multiline ?? false,
        input.required ?? true,
        input.sortOrder ?? 0,
        input.alwaysVisible ?? false,
        input.scaleFrom ?? 0.7,
        input.scaleTo ?? 1.0,
        layerId,
        input.respectAlpha ?? false,
        input.animationDirection ?? 'in',
        input.textTransform ?? 'none',
        input.visibleIf ?? null,
      ]
    );
    return mapTextField(rows[0]);
  }

  async findTextFieldById(fieldId: string): Promise<TemplateTextField | null> {
    const { rows } = await query<TemplateTextFieldRow>(
      `SELECT * FROM template_text_fields WHERE id = $1`,
      [fieldId]
    );
    return rows[0] ? mapTextField(rows[0]) : null;
  }

  async updateTextField(
    fieldId: string,
    input: UpdateTextFieldInput
  ): Promise<TemplateTextField | null> {
    const colMap: Record<keyof UpdateTextFieldInput, string> = {
      slotKey: 'slot_key',
      label: 'label',
      positionX: 'position_x',
      positionY: 'position_y',
      maxWidth: 'max_width',
      fontFamily: 'font_family',
      fontSize: 'font_size',
      color: 'color',
      align: 'align',
      appearAt: 'appear_at',
      appearDuration: 'appear_duration',
      animation: 'animation',
      defaultValue: 'default_value',
      maxChars: 'max_chars',
      multiline: 'multiline',
      required: 'required',
      sortOrder: 'sort_order',
      alwaysVisible: 'always_visible',
      scaleFrom: 'scale_from',
      scaleTo: 'scale_to',
      layerId: 'layer_id',
      respectAlpha: 'respect_alpha',
      animationDirection: 'animation_direction',
      textTransform: 'text_transform',
      visibleIf: 'visible_if',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const key of Object.keys(input) as (keyof UpdateTextFieldInput)[]) {
      if (input[key] === undefined) continue;
      fields.push(`${colMap[key]} = $${idx++}`);
      values.push(input[key]);
    }
    if (fields.length === 0) {
      const { rows } = await query<TemplateTextFieldRow>(
        `SELECT * FROM template_text_fields WHERE id = $1`,
        [fieldId]
      );
      return rows[0] ? mapTextField(rows[0]) : null;
    }
    values.push(fieldId);
    const { rows } = await query<TemplateTextFieldRow>(
      `UPDATE template_text_fields SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] ? mapTextField(rows[0]) : null;
  }

  async deleteTextField(fieldId: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM template_text_fields WHERE id = $1`,
      [fieldId]
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------- Image slots ----------

  async listImageSlots(templateId: string): Promise<TemplateImageSlot[]> {
    const { rows } = await query<TemplateImageSlotRow>(
      `SELECT * FROM template_image_slots
       WHERE template_id = $1
       ORDER BY sort_order ASC, slot_key ASC`,
      [templateId]
    );
    return rows.map(mapImageSlot);
  }

  async createImageSlot(
    templateId: string,
    input: CreateImageSlotInput
  ): Promise<TemplateImageSlot> {
    // ADR-086 — layer_id est NOT NULL. Si absent, on rattache au premier layer
    // (z_index ASC) du template. Si aucun layer n'existe, on en crée un vide
    // (cohérent avec createTextField).
    let layerId = input.layerId ?? null;
    if (!layerId) {
      const existing = await this.listLayers(templateId);
      if (existing.length > 0) {
        layerId = existing[0].id;
      } else {
        const fallback = await this.createLayer(templateId, {
          name: 'Layer par défaut',
          videoUrl: '',
          zIndex: 1,
        });
        layerId = fallback.id;
      }
    }
    const { rows } = await query<TemplateImageSlotRow>(
      `INSERT INTO template_image_slots
         (template_id, slot_key, label, position_x, position_y, width, height,
          appear_at, appear_duration, animation, aspect_ratio, required, sort_order,
          layer_id, anchor, fit_mode,
          safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
          overflow, animation_direction, scale_from, scale_to, visible_if)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        templateId,
        input.slotKey,
        input.label,
        input.positionX,
        input.positionY,
        input.width,
        input.height,
        input.appearAt,
        input.appearDuration ?? 0.4,
        input.animation ?? 'fade',
        input.aspectRatio ?? null,
        input.required ?? false,
        input.sortOrder ?? 0,
        layerId,
        input.anchor ?? 'center',
        input.fitMode ?? 'contain',
        input.safeTopPct ?? null,
        input.safeLeftPct ?? null,
        input.safeWidthPct ?? null,
        input.safeHeightPct ?? null,
        input.overflow ?? 'hidden',
        input.animationDirection ?? 'in',
        input.scaleFrom ?? null,
        input.scaleTo ?? null,
        input.visibleIf ?? null,
      ]
    );
    return mapImageSlot(rows[0]);
  }

  async findImageSlotById(slotId: string): Promise<TemplateImageSlot | null> {
    const { rows } = await query<TemplateImageSlotRow>(
      `SELECT * FROM template_image_slots WHERE id = $1`,
      [slotId]
    );
    return rows[0] ? mapImageSlot(rows[0]) : null;
  }

  async updateImageSlot(
    slotId: string,
    input: UpdateImageSlotInput
  ): Promise<TemplateImageSlot | null> {
    const colMap: Record<keyof UpdateImageSlotInput, string> = {
      slotKey: 'slot_key',
      label: 'label',
      positionX: 'position_x',
      positionY: 'position_y',
      width: 'width',
      height: 'height',
      appearAt: 'appear_at',
      appearDuration: 'appear_duration',
      animation: 'animation',
      aspectRatio: 'aspect_ratio',
      required: 'required',
      sortOrder: 'sort_order',
      layerId: 'layer_id',
      anchor: 'anchor',
      fitMode: 'fit_mode',
      safeTopPct: 'safe_top_pct',
      safeLeftPct: 'safe_left_pct',
      safeWidthPct: 'safe_width_pct',
      safeHeightPct: 'safe_height_pct',
      overflow: 'overflow',
      animationDirection: 'animation_direction',
      scaleFrom: 'scale_from',
      scaleTo: 'scale_to',
      visibleIf: 'visible_if',
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const key of Object.keys(input) as (keyof UpdateImageSlotInput)[]) {
      if (input[key] === undefined) continue;
      fields.push(`${colMap[key]} = $${idx++}`);
      values.push(input[key]);
    }
    if (fields.length === 0) {
      const { rows } = await query<TemplateImageSlotRow>(
        `SELECT * FROM template_image_slots WHERE id = $1`,
        [slotId]
      );
      return rows[0] ? mapImageSlot(rows[0]) : null;
    }
    values.push(slotId);
    const { rows } = await query<TemplateImageSlotRow>(
      `UPDATE template_image_slots SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] ? mapImageSlot(rows[0]) : null;
  }

  async deleteImageSlot(slotId: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM template_image_slots WHERE id = $1`,
      [slotId]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * ADR-110 / DUP-02 / pitfall P4 — Transactional deep clone.
   *
   * Clones a template across the 6 child tables in a single BEGIN/COMMIT
   * transaction. If any INSERT fails, ROLLBACK leaves the DB pristine
   * (no orphan template + zero half-cloned children). The new template
   * starts unpublished and is named `<source> (copie)` unless the
   * caller overrides.
   *
   * Tables cloned (FK chain) :
   *   1. neopro_templates           (root, new id)
   *   2. template_variants          (FK template_id)
   *   3. template_layers            (FK template_id, build layerIdMap)
   *   4. template_text_fields       (FK template_id + layer_id, REMAP via layerIdMap)
   *   5. template_image_slots       (FK template_id + layer_id, REMAP via layerIdMap)
   *   6. template_options           (FK template_id only)
   *   7. template_packshot_refs     (FK template_id; packshot_template_id kept as-is, no recursion)
   *
   * file_url / video_url / background_video_url are byte-identical to
   * source (ADR-110 SPEC: assets are SHARED, never copied physically —
   * the FTP layer is content-addressed by URL).
   */
  async duplicateDeep(
    sourceId: string,
    opts?: { name?: string; createdBy?: string | null }
  ): Promise<TemplateV2> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Clone neopro_templates root
      const src = await client.query(
        `SELECT * FROM neopro_templates WHERE id = $1`,
        [sourceId]
      );
      if (src.rows.length === 0) throw new Error('source_template_not_found');
      const s = src.rows[0];
      const newName = opts?.name?.trim() || `${s.name} (copie)`;
      // composition_id has no UNIQUE constraint but is used as a Remotion
      // bundle key — suffix with a base36 timestamp to keep clones distinct.
      const newCompositionId = `${s.composition_id}-copie-${Date.now().toString(36)}`;
      const tpl: { rows: Array<{ id: string }> } = await client.query(
        `INSERT INTO neopro_templates
           (name, composition_id, description, props_schema, default_props,
            thumbnail_url, published, created_by, schema_version,
            duration_seconds, fps, site_id, canvas_width, canvas_height)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          newName,
          newCompositionId,
          s.description,
          JSON.stringify(s.props_schema ?? {}),
          JSON.stringify(s.default_props ?? {}),
          s.thumbnail_url,
          opts?.createdBy ?? null,
          s.schema_version,
          s.duration_seconds,
          s.fps,
          s.site_id,
          s.canvas_width,
          s.canvas_height,
        ]
      );
      const newId = tpl.rows[0].id;

      // 2. Clone template_variants (no remap needed downstream in our 6 tables)
      const variants = await client.query(
        `SELECT * FROM template_variants WHERE template_id = $1`,
        [sourceId]
      );
      for (const v of variants.rows) {
        await client.query(
          `INSERT INTO template_variants
             (template_id, name, background_video_url, thumbnail_url, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [newId, v.name, v.background_video_url, v.thumbnail_url, v.sort_order]
        );
      }

      // 3. Clone template_layers — build layerIdMap REQUIRED for steps 4/5.
      const layers = await client.query(
        `SELECT * FROM template_layers WHERE template_id = $1 ORDER BY z_index`,
        [sourceId]
      );
      const layerIdMap: Record<string, string> = {};
      for (const l of layers.rows) {
        const r: { rows: Array<{ id: string }> } = await client.query(
          `INSERT INTO template_layers
             (template_id, name, video_url, z_index,
              mask_top, mask_bottom, mask_left, mask_right, duration_ms)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [
            newId,
            l.name,
            l.video_url,
            l.z_index,
            l.mask_top,
            l.mask_bottom,
            l.mask_left,
            l.mask_right,
            l.duration_ms,
          ]
        );
        layerIdMap[l.id] = r.rows[0].id;
      }

      // 4. Clone template_text_fields — REMAP layer_id via layerIdMap.
      // layer_id is NOT NULL on this table per ADR-086 invariant.
      const textFields = await client.query(
        `SELECT * FROM template_text_fields WHERE template_id = $1`,
        [sourceId]
      );
      for (const tf of textFields.rows) {
        const newLayerId = layerIdMap[tf.layer_id];
        if (!newLayerId) {
          throw new Error(`layer_id_remap_missing_for_text_field_${tf.id}`);
        }
        await client.query(
          `INSERT INTO template_text_fields
             (template_id, slot_key, label, position_x, position_y, max_width,
              font_family, font_size, color, align, appear_at, appear_duration,
              animation, default_value, max_chars, multiline, required, sort_order,
              always_visible, scale_from, scale_to, visible_if,
              layer_id, respect_alpha, animation_direction, text_transform)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
          [
            newId,
            tf.slot_key,
            tf.label,
            tf.position_x,
            tf.position_y,
            tf.max_width,
            tf.font_family,
            tf.font_size,
            tf.color,
            tf.align,
            tf.appear_at,
            tf.appear_duration,
            tf.animation,
            tf.default_value,
            tf.max_chars,
            tf.multiline,
            tf.required,
            tf.sort_order,
            tf.always_visible,
            tf.scale_from,
            tf.scale_to,
            tf.visible_if ?? null,
            newLayerId,
            tf.respect_alpha,
            tf.animation_direction,
            tf.text_transform ?? 'none',
          ]
        );
      }

      // 5. Clone template_image_slots — REMAP layer_id via layerIdMap (nullable).
      const imgSlots = await client.query(
        `SELECT * FROM template_image_slots WHERE template_id = $1`,
        [sourceId]
      );
      for (const im of imgSlots.rows) {
        const newLayerId = im.layer_id ? layerIdMap[im.layer_id] ?? null : null;
        await client.query(
          `INSERT INTO template_image_slots
             (template_id, slot_key, label, position_x, position_y, width, height,
              appear_at, appear_duration, animation, aspect_ratio, required, sort_order,
              anchor, fit_mode,
              safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
              overflow, animation_direction, layer_id, scale_from, scale_to, visible_if)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
          [
            newId,
            im.slot_key,
            im.label,
            im.position_x,
            im.position_y,
            im.width,
            im.height,
            im.appear_at,
            im.appear_duration,
            im.animation,
            im.aspect_ratio,
            im.required,
            im.sort_order,
            im.anchor,
            im.fit_mode,
            im.safe_top_pct,
            im.safe_left_pct,
            im.safe_width_pct,
            im.safe_height_pct,
            im.overflow,
            im.animation_direction,
            newLayerId,
            im.scale_from,
            im.scale_to,
            im.visible_if ?? null,
          ]
        );
      }

      // 6. Clone template_options (no FK remap — single template_id).
      const optionRows = await client.query(
        `SELECT * FROM template_options WHERE template_id = $1`,
        [sourceId]
      );
      for (const o of optionRows.rows) {
        await client.query(
          `INSERT INTO template_options
             (template_id, key, label, type, values, default_value, user_editable, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            newId,
            o.key,
            o.label,
            o.type,
            JSON.stringify(o.values ?? []),
            o.default_value,
            o.user_editable,
            o.sort_order,
          ]
        );
      }

      // 7. Clone template_packshot_refs (packshot_template_id kept — no recursion).
      const refs = await client.query(
        `SELECT * FROM template_packshot_refs WHERE template_id = $1`,
        [sourceId]
      );
      for (const ref of refs.rows) {
        await client.query(
          `INSERT INTO template_packshot_refs
             (template_id, option_key, option_value, packshot_template_id, start_at_ms, z_index_offset)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            newId,
            ref.option_key,
            ref.option_value,
            ref.packshot_template_id,
            ref.start_at_ms,
            ref.z_index_offset,
          ]
        );
      }

      await client.query('COMMIT');

      const fresh = await this.findV2ById(newId);
      if (!fresh) {
        // V2 view returned null (source was schema_version=1) — clone still
        // exists in DB, but caller's contract expects a TemplateV2. We surface
        // a typed error so the controller can map to a 400.
        throw new Error('clone_not_v2_readable');
      }
      return fresh;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * ADR-075 — Scaffold placeholders pour un template legacy.
   * Crée 1 variant + 1 text field + 1 image slot si absents, pour débloquer
   * le flip v1→v2. Idempotent : chaque ressource est créée uniquement si sa
   * table est vide pour ce template. Les URLs placeholders sont vides — le
   * runtime Remotion applique un guard `isValidSrc` qui skip les URLs non
   * valides (cf. template-runtime.tsx), donc l'aperçu montre un fond noir
   * tant que l'admin n'a pas uploadé les vraies vidéos via le wizard.
   */
  async scaffoldPlaceholders(templateId: string): Promise<{
    variantsCreated: number;
    textFieldsCreated: number;
    imageSlotsCreated: number;
  }> {
    const [variants, textFields, imageSlots] = await Promise.all([
      this.listVariants(templateId),
      this.listTextFields(templateId),
      this.listImageSlots(templateId),
    ]);
    let variantsCreated = 0;
    let textFieldsCreated = 0;
    let imageSlotsCreated = 0;
    if (variants.length === 0) {
      await this.createVariant(templateId, {
        name: 'Par défaut',
        backgroundVideoUrl: '',
        sortOrder: 0,
      });
      variantsCreated = 1;
    }
    if (textFields.length === 0) {
      await this.createTextField(templateId, {
        slotKey: 'title',
        label: 'Titre',
        positionX: 0.5,
        positionY: 0.5,
        maxWidth: 0.8,
        fontFamily: 'Anton',
        fontSize: 48,
        color: '#FFFFFF',
        align: 'center',
        appearAt: 0.5,
        appearDuration: 0.4,
        animation: 'fade',
        defaultValue: 'Titre',
        multiline: false,
        required: false,
        sortOrder: 0,
      });
      textFieldsCreated = 1;
    }
    if (imageSlots.length === 0) {
      await this.createImageSlot(templateId, {
        slotKey: 'photo',
        label: 'Image',
        positionX: 0.5,
        positionY: 0.5,
        width: 0.3,
        height: 0.3,
        appearAt: 0.5,
        appearDuration: 0.4,
        animation: 'fade',
        required: false,
        sortOrder: 0,
      });
      imageSlotsCreated = 1;
    }
    return { variantsCreated, textFieldsCreated, imageSlotsCreated };
  }
}

export const templateStudioRepository = new TemplateStudioRepository();
