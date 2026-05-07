/**
 * ADR-086 / Audit P1 #5 — Reverse symmetry CLI ↔ UI.
 *
 * Builds a SPEC.md (frontmatter YAML + body markdown) from the current DB
 * state of a Template Studio v2 template. The output is round-trip safe:
 * it can be re-imported by `npm run template:import`
 * (`scripts/import-template-spec.ts`).
 *
 * Quick task 260507-ong — backend pure (no UI). The controller
 * `exportTemplateSpec` (remotion-templates.controller.ts) calls this service.
 *
 * Repository pattern strict — never imports `../config/database`.
 */

import logger from '../config/logger';
import { templateStudioRepository } from '../repositories/template-studio.repository';
import type {
  TemplateLayer,
  TemplateTextField,
  TemplateImageSlot,
} from '../types/template-studio.types';
import { stringify as stringifyYaml } from 'yaml';

export interface TemplateSpecBuildResult {
  filename: string;
  content: string;
}

interface SpecLayerRow {
  key: string;
  name: string;
  file: string;
  z_index: number;
  duration_ms: number;
  alpha: boolean;
}

interface SpecAnimationBlock {
  preset: string;
  direction: string;
  duration_ms: number;
  scale_from?: number;
  scale_to?: number;
}

interface SpecTextSlot {
  type: 'text';
  key: string;
  layer: string;
  user_editable: boolean;
  default: string;
  font: string;
  font_size: number;
  color: string;
  text_align: string;
  position: { x: number; y: number };
  max_width_pct?: number;
  respect_alpha: boolean;
  animation?: SpecAnimationBlock;
}

interface SpecImageSlot {
  type: 'image';
  key: string;
  layer: string;
  user_editable: boolean;
  anchor: string;
  fit_mode: string;
  position: { x: number; y: number; width: number; height: number };
  safe_zone?: {
    top_pct: number;
    left_pct: number;
    width_pct: number;
    height_pct: number;
  };
  overflow?: string;
}

interface SpecVariantRow {
  slug: string;
  name: string;
  is_default: boolean;
}

class TemplateSpecBuilderService {
  /**
   * Build a SPEC.md markdown from the current DB state of a v2 template.
   *
   * @throws Error('Template not found: <id>') if the template does not exist
   *         or is still on schema_version=1 (legacy, not exportable).
   */
  async buildSpecMarkdown(templateId: string): Promise<TemplateSpecBuildResult> {
    logger.info('Building SPEC markdown', { template_id: templateId });

    const template = await templateStudioRepository.findV2ById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    const [layers, textFields, imageSlots, variants] = await Promise.all([
      templateStudioRepository.listLayers(templateId),
      templateStudioRepository.listTextFields(templateId),
      templateStudioRepository.listImageSlots(templateId),
      templateStudioRepository.listVariants(templateId),
    ]);

    // Sort layers by z_index ASC, derive deterministic keys A,B,C... (AA, AB...)
    const sortedLayers: TemplateLayer[] = [...layers].sort(
      (a, b) => a.zIndex - b.zIndex,
    );
    const layerIdToKey = new Map<string, string>();
    sortedLayers.forEach((l, i) => layerIdToKey.set(l.id, this.indexToKey(i)));

    const specLayers: SpecLayerRow[] = sortedLayers.map((l) => ({
      key: layerIdToKey.get(l.id) ?? '?',
      name: l.name,
      file: l.videoUrl,
      z_index: l.zIndex,
      duration_ms: l.durationMs,
      // Alpha is asserted at upload time by the controller (yuva420p check).
      // We surface `true` here because the runtime treats v2 layers as alpha-
      // capable; legacy non-alpha rows still parse as `alpha: true` without
      // breaking the importer.
      alpha: true,
    }));

    const specSlots: Array<SpecTextSlot | SpecImageSlot> = [
      ...textFields.map((tf) => this.textToSpec(tf, layerIdToKey)),
      ...imageSlots.map((is) => this.imageToSpec(is, layerIdToKey)),
    ];

    const specVariants: SpecVariantRow[] = variants.map((v, i) => ({
      slug: this.slugify(v.name),
      name: v.name,
      is_default: i === 0,
    }));

    const frontmatter = {
      template: {
        slug: template.compositionId,
        name: template.name,
        description: template.description ?? '',
        duration_seconds: template.durationSeconds,
        canvas: {
          width: template.canvasWidth,
          height: template.canvasHeight,
          fps: template.fps,
        },
      },
      layers: specLayers,
      slots: specSlots,
      variants: specVariants,
    };

    const yaml = stringifyYaml(frontmatter);
    const description = template.description ?? '';
    const body =
      `# Template : ${template.name}\n\n` +
      `## Description\n\n${description}\n\n` +
      `## Layers\n\n${sortedLayers.length} layer(s) — voir frontmatter YAML.\n\n` +
      `## Validation\n\nRé-importable via \`npm run template:import\`.\n`;
    const content = `---\n${yaml}---\n\n${body}`;

    return {
      filename: `${template.compositionId}-spec.md`,
      content,
    };
  }

  /**
   * Map a 0-based index to a spreadsheet-style column key (A..Z, AA..ZZ, ...).
   * Used to surface stable layer references in the exported SPEC, derived
   * from the z_index ordering.
   */
  private indexToKey(i: number): string {
    if (i < 26) return String.fromCharCode(65 + i);
    return this.indexToKey(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
  }

  private slugify(label: string): string {
    return (
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'default'
    );
  }

  private textToSpec(
    tf: TemplateTextField,
    layerIdToKey: Map<string, string>,
  ): SpecTextSlot {
    const slot: SpecTextSlot = {
      type: 'text',
      key: tf.slotKey,
      layer: tf.layerId ? layerIdToKey.get(tf.layerId) ?? '?' : '?',
      user_editable: !!tf.required,
      default: tf.defaultValue ?? '',
      font: tf.fontFamily,
      font_size: tf.fontSize,
      color: tf.color,
      text_align: tf.align,
      // DB stores 0..1 fractions ; SPEC uses 0..100 percentages (×100).
      position: {
        x: Math.round((tf.position.x ?? 0) * 100),
        y: Math.round((tf.position.y ?? 0) * 100),
      },
      respect_alpha: !!tf.respectAlpha,
    };
    if (tf.maxWidth != null && !Number.isNaN(tf.maxWidth)) {
      slot.max_width_pct = Math.round(tf.maxWidth * 100);
    }
    if (tf.animation && tf.animation !== 'none') {
      // DB stores appearDuration in seconds ; SPEC uses ms (×1000).
      slot.animation = {
        preset: tf.animation,
        direction: tf.animationDirection,
        duration_ms: Math.round((tf.appearDuration ?? 0.4) * 1000),
        scale_from: tf.scaleFrom,
        scale_to: tf.scaleTo,
      };
    }
    return slot;
  }

  private imageToSpec(
    is: TemplateImageSlot,
    layerIdToKey: Map<string, string>,
  ): SpecImageSlot {
    const slot: SpecImageSlot = {
      type: 'image',
      key: is.slotKey,
      layer: is.layerId ? layerIdToKey.get(is.layerId) ?? '?' : '?',
      user_editable: !!is.required,
      anchor: is.anchor,
      fit_mode: is.fitMode,
      position: {
        x: Math.round((is.position.x ?? 0) * 100),
        y: Math.round((is.position.y ?? 0) * 100),
        width: Math.round((is.position.width ?? 1) * 100),
        height: Math.round((is.position.height ?? 1) * 100),
      },
    };
    if (is.safeTopPct != null) {
      slot.safe_zone = {
        top_pct: is.safeTopPct,
        left_pct: is.safeLeftPct ?? 0,
        width_pct: is.safeWidthPct ?? 0,
        height_pct: is.safeHeightPct ?? 0,
      };
    }
    if (is.overflow && is.overflow !== 'hidden') {
      slot.overflow = is.overflow;
    }
    return slot;
  }
}

export const templateSpecBuilderService = new TemplateSpecBuilderService();
