/**
 * ADR-074 — Template Studio v2
 * Types partagés entre le repository, les controllers et le runtime Remotion.
 */

import type { QueryResultRow } from 'pg';

export type AnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-in';

export type TextAlign = 'left' | 'center' | 'right';

export interface TemplateVariant {
  id: string;
  templateId: string;
  name: string;
  backgroundVideoUrl: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

export interface TemplateLayer {
  id: string;
  templateId: string;
  name: string;
  videoUrl: string;
  zIndex: number;
  mask: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface TemplateTextField {
  id: string;
  templateId: string;
  slotKey: string;
  label: string;
  position: { x: number; y: number };
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: TextAlign;
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  defaultValue: string;
  maxChars: number | null;
  multiline: boolean;
  required: boolean;
  sortOrder: number;
}

export interface TemplateImageSlot {
  id: string;
  templateId: string;
  slotKey: string;
  label: string;
  position: { x: number; y: number; width: number; height: number };
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  aspectRatio: string | null;
  required: boolean;
  sortOrder: number;
}

/**
 * Template complet en schema_version=2 (data-driven).
 * Les templates legacy (schema_version=1) continuent d'utiliser
 * NeoProTemplate + props_schema/default_props de la table neopro_templates.
 */
export interface TemplateV2 {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: 2;
  compositionId: string;
  durationSeconds: number;
  fps: number;
  thumbnailUrl: string | null;
  published: boolean;
  variants: TemplateVariant[];
  layers: TemplateLayer[];
  textFields: TemplateTextField[];
  imageSlots: TemplateImageSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface RenderTemplateRequest {
  templateId: string;
  variantId: string;
  textValues: Record<string, string>;
  imageUploads: Record<string, string>;
}

// DB row shapes (snake_case — matches postgres)
export interface TemplateVariantRow extends QueryResultRow {
  id: string;
  template_id: string;
  name: string;
  background_video_url: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_at: Date;
}

export interface TemplateLayerRow extends QueryResultRow {
  id: string;
  template_id: string;
  name: string;
  video_url: string;
  z_index: number;
  mask_top: string;
  mask_bottom: string;
  mask_left: string;
  mask_right: string;
  created_at: Date;
}

export interface TemplateTextFieldRow extends QueryResultRow {
  id: string;
  template_id: string;
  slot_key: string;
  label: string;
  position_x: string;
  position_y: string;
  max_width: string;
  font_family: string;
  font_size: number;
  color: string;
  align: TextAlign;
  appear_at: string;
  appear_duration: string;
  animation: AnimationPreset;
  default_value: string;
  max_chars: number | null;
  multiline: boolean;
  required: boolean;
  sort_order: number;
}

export interface TemplateImageSlotRow extends QueryResultRow {
  id: string;
  template_id: string;
  slot_key: string;
  label: string;
  position_x: string;
  position_y: string;
  width: string;
  height: string;
  appear_at: string;
  appear_duration: string;
  animation: AnimationPreset;
  aspect_ratio: string | null;
  required: boolean;
  sort_order: number;
}
