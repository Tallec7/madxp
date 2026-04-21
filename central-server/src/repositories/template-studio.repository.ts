/**
 * ADR-075 — Template Studio repository
 * CRUD granulaire sur variants / layers / text_fields / image_slots.
 */

import type { QueryResultRow } from 'pg';
import { query } from '../config/database';
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
}

export interface UpdateLayerInput {
  name?: string;
  videoUrl?: string;
  zIndex?: number;
  mask?: { top?: number; bottom?: number; left?: number; right?: number };
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

    const [variants, layers, textFields, imageSlots] = await Promise.all([
      this.listVariants(id),
      this.listLayers(id),
      this.listTextFields(id),
      this.listImageSlots(id),
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
          mask_top, mask_bottom, mask_left, mask_right)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    const { rows } = await query<TemplateTextFieldRow>(
      `INSERT INTO template_text_fields
         (template_id, slot_key, label, position_x, position_y, max_width,
          font_family, font_size, color, align, appear_at, appear_duration,
          animation, default_value, max_chars, multiline, required, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
    const { rows } = await query<TemplateImageSlotRow>(
      `INSERT INTO template_image_slots
         (template_id, slot_key, label, position_x, position_y, width, height,
          appear_at, appear_duration, animation, aspect_ratio, required, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
