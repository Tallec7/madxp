/**
 * ADR-086 — Import template depuis un SPEC.md (frontmatter YAML).
 *
 * Usage :
 *   npx ts-node src/scripts/import-template-spec.ts <path/to/SPEC.md>
 *
 * MVP v1 :
 *  - Parse le frontmatter YAML du SPEC (entre les deux `---`).
 *  - Crée neopro_templates + variant default + layers + text_fields + image_slots.
 *  - Valide que les fonts référencées existent dans template_fonts.
 *  - Les `file:` des layers sont stockés tels quels dans video_url (URL absolue attendue).
 *  - Pas d'upload FTP dans v1 : l'admin uploade les assets séparément puis met les URLs
 *    dans le SPEC. L'upload auto-FTP est un second incrément.
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { query } from '../config/database';
import logger from '../config/logger';
import { templateStudioRepository } from '../repositories/template-studio.repository';
import type {
  AnimationDirection,
  AnimationPreset,
  Anchor,
  FitMode,
  Overflow,
  TextAlign,
} from '../types/template-studio.types';

dotenv.config();

interface SpecTemplate {
  slug: string;
  name: string;
  description?: string;
  duration_seconds: number;
  canvas: { width: number; height: number; fps: number };
}

interface SpecLayer {
  key: string;
  name: string;
  file: string;
  z_index: number;
  duration_ms: number;
  alpha?: boolean;
}

interface SpecAnimation {
  preset?: AnimationPreset;
  direction?: AnimationDirection;
  duration_ms?: number;
  scale_from?: number;
  scale_to?: number;
}

interface SpecTextSlot {
  type: 'text';
  key: string;
  layer: string;
  user_editable?: boolean;
  default?: string;
  font?: string;
  font_size: number;
  color?: string;
  text_align?: TextAlign;
  position: { x: number; y: number };
  max_width_pct?: number;
  max_lines?: number;
  respect_alpha?: boolean;
  animation?: SpecAnimation;
  source_key?: string;
}

interface SpecImageSlot {
  type: 'image';
  key: string;
  layer: string;
  user_editable?: boolean;
  source?: string;
  asset_name?: string;
  anchor?: Anchor;
  fit_mode?: FitMode;
  position?: { x: number; y: number; width?: number; height?: number };
  safe_zone?: { top_pct: number; left_pct: number; width_pct: number; height_pct: number };
  overflow?: Overflow;
  opacity?: number;
  animation?: SpecAnimation;
}

type SpecSlot = SpecTextSlot | SpecImageSlot;

interface SpecVariant {
  slug: string;
  name: string;
  is_default?: boolean;
}

interface SpecFont {
  name: string;
  file: string | null;
}

interface TemplateSpec {
  template: SpecTemplate;
  layers: SpecLayer[];
  slots: SpecSlot[];
  variants: SpecVariant[];
  fonts?: SpecFont[];
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('Frontmatter YAML introuvable (attendu entre deux lignes `---`).');
  }
  return match[1];
}

function validate(spec: unknown): asserts spec is TemplateSpec {
  const s = spec as Partial<TemplateSpec>;
  if (!s.template?.slug || !s.template?.name) {
    throw new Error('template.slug et template.name sont requis.');
  }
  if (!s.template.canvas?.width || !s.template.canvas?.height || !s.template.canvas?.fps) {
    throw new Error('template.canvas.width/height/fps sont requis.');
  }
  if (!Array.isArray(s.layers) || s.layers.length === 0) {
    throw new Error('Au moins un layer est requis.');
  }
  if (!Array.isArray(s.slots)) {
    throw new Error('slots doit être un tableau (peut être vide).');
  }
  if (!Array.isArray(s.variants) || s.variants.length === 0) {
    throw new Error('Au moins un variant est requis.');
  }
}

async function ensureFontsExist(fonts: SpecFont[] | undefined): Promise<void> {
  if (!fonts?.length) return;
  const names = fonts.map((f) => f.name);
  const { rows } = await query<{ name: string }>(
    `SELECT name FROM template_fonts WHERE name = ANY($1::text[])`,
    [names],
  );
  const present = new Set(rows.map((r) => r.name));
  const missing = names.filter((n) => !present.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Fonts absentes de template_fonts : ${missing.join(', ')}. ` +
        `Ajouter via INSERT ou upload dashboard avant import.`,
    );
  }
}

async function ensureSlugAvailable(slug: string): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM neopro_templates WHERE composition_id = $1 LIMIT 1`,
    [slug],
  );
  if (rows.length > 0) {
    throw new Error(
      `Template avec composition_id="${slug}" existe déjà (id=${rows[0].id}). ` +
        `v1 ne supporte pas l'upsert — supprimer avant re-import.`,
    );
  }
}

async function insertTemplateRow(spec: TemplateSpec): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO neopro_templates
       (name, composition_id, description, duration_seconds, fps,
        canvas_width, canvas_height, published, schema_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2)
     RETURNING id`,
    [
      spec.template.name,
      spec.template.slug,
      spec.template.description ?? null,
      spec.template.duration_seconds,
      spec.template.canvas.fps,
      spec.template.canvas.width,
      spec.template.canvas.height,
      false,
    ],
  );
  return rows[0].id;
}

async function createLayers(
  templateId: string,
  specLayers: SpecLayer[],
): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();
  for (const l of specLayers) {
    const layer = await templateStudioRepository.createLayer(templateId, {
      name: l.name,
      videoUrl: l.file,
      zIndex: l.z_index,
      durationMs: l.duration_ms,
    });
    keyToId.set(l.key, layer.id);
  }
  return keyToId;
}

async function createSlots(
  templateId: string,
  slots: SpecSlot[],
  layerKeyToId: Map<string, string>,
): Promise<{ texts: number; images: number }> {
  let texts = 0;
  let images = 0;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const layerId = layerKeyToId.get(slot.layer);
    if (!layerId) {
      throw new Error(`Slot "${slot.key}" référence un layer inconnu : "${slot.layer}".`);
    }

    if (slot.type === 'text') {
      await templateStudioRepository.createTextField(templateId, {
        slotKey: slot.key,
        label: slot.key,
        positionX: slot.position.x / 100,
        positionY: slot.position.y / 100,
        maxWidth: slot.max_width_pct != null ? slot.max_width_pct / 100 : undefined,
        fontFamily: slot.font,
        fontSize: slot.font_size,
        color: slot.color,
        align: slot.text_align,
        appearAt: 0,
        appearDuration: slot.animation?.duration_ms ? slot.animation.duration_ms / 1000 : 0.4,
        animation: slot.animation?.preset,
        animationDirection: slot.animation?.direction,
        scaleFrom: slot.animation?.scale_from,
        scaleTo: slot.animation?.scale_to,
        defaultValue: slot.default,
        multiline: (slot.max_lines ?? 1) > 1,
        required: !!slot.user_editable,
        sortOrder: i,
        layerId,
        respectAlpha: !!slot.respect_alpha,
      });
      texts++;
    } else {
      const pos = slot.position ?? { x: 50, y: 50, width: 100, height: 100 };
      await templateStudioRepository.createImageSlot(templateId, {
        slotKey: slot.key,
        label: slot.key,
        positionX: (pos.x ?? 50) / 100,
        positionY: (pos.y ?? 50) / 100,
        width: (pos.width ?? 100) / 100,
        height: (pos.height ?? 100) / 100,
        appearAt: 0,
        appearDuration: slot.animation?.duration_ms ? slot.animation.duration_ms / 1000 : 0.4,
        animation: slot.animation?.preset,
        animationDirection: slot.animation?.direction,
        scaleFrom: slot.animation?.scale_from ?? null,
        scaleTo: slot.animation?.scale_to ?? null,
        required: !!slot.user_editable,
        sortOrder: i,
        layerId,
        anchor: slot.anchor,
        fitMode: slot.fit_mode,
        safeTopPct: slot.safe_zone?.top_pct ?? null,
        safeLeftPct: slot.safe_zone?.left_pct ?? null,
        safeWidthPct: slot.safe_zone?.width_pct ?? null,
        safeHeightPct: slot.safe_zone?.height_pct ?? null,
        overflow: slot.overflow,
      });
      images++;
    }
  }
  return { texts, images };
}

async function createDefaultVariant(templateId: string, spec: TemplateSpec): Promise<void> {
  const def = spec.variants.find((v) => v.is_default) ?? spec.variants[0];
  await templateStudioRepository.createVariant(templateId, {
    name: def.name,
    backgroundVideoUrl: '',
    sortOrder: 0,
  });
}

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) {
    logger.error('Usage: ts-node import-template-spec.ts <path/to/SPEC.md>');
    process.exit(1);
  }

  const abs = resolve(process.cwd(), specPath);
  const raw = readFileSync(abs, 'utf8');
  const yamlText = extractFrontmatter(raw);
  const spec = parseYaml(yamlText);
  validate(spec);

  logger.info('Import template', {
    slug: spec.template.slug,
    layers: spec.layers.length,
    slots: spec.slots.length,
    variants: spec.variants.length,
  });

  await ensureSlugAvailable(spec.template.slug);
  await ensureFontsExist(spec.fonts);

  const templateId = await insertTemplateRow(spec);
  await createDefaultVariant(templateId, spec);
  const layerKeyToId = await createLayers(templateId, spec.layers);
  const counts = await createSlots(templateId, spec.slots, layerKeyToId);

  logger.info('Template importé', {
    templateId,
    slug: spec.template.slug,
    layers: layerKeyToId.size,
    textSlots: counts.texts,
    imageSlots: counts.images,
  });
}

main().catch((err) => {
  logger.error('Import échoué', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
