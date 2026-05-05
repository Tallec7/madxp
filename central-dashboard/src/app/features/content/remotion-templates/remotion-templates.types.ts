/**
 * Types partagés pour la page Templates Remotion.
 * Extraits du composant monolithique pour permettre la décomposition en sous-composants.
 */

export type TemplatePropType = 'text' | 'image' | 'number' | 'asset';

export interface TemplatePropDef {
  key: string;
  label: string;
  type: TemplatePropType;
  required: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  admin_only?: boolean;
}

export interface RemotionTemplate {
  id: string;
  name: string;
  composition_id: string;
  description: string;
  props_schema: TemplatePropDef[];
  default_props: Record<string, unknown>;
  thumbnail_url: string | null;
  published: boolean;
  created_at: string;
  /** ADR-075 — null/1 = legacy, 2 = data-driven studio. */
  schema_version?: number;
  /** ADR-075 V2 — null = template global, UUID = scopé à un club (white-glove). */
  site_id?: string | null;
}

// ── ADR-075 Template Studio v2 — types data-driven ─────────────────────────

export type AnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-in'
  | 'zoom'
  | 'logo-pop';

export type AnimationDirection = 'in' | 'out';

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type FitMode =
  | 'contain'
  | 'cover'
  | 'fill-width-anchor-top'
  | 'fill-height-anchor-left';

export type Overflow = 'hidden' | 'visible' | 'top' | 'bottom' | 'left' | 'right';

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
  mask: { top: number; bottom: number; left: number; right: number };
  /** ADR-086 — durée du layer en ms (héritée par les slots enfants). */
  durationMs: number;
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
  alwaysVisible: boolean;
  scaleFrom: number;
  scaleTo: number;
  /** ADR-086 */
  layerId: string | null;
  respectAlpha: boolean;
  animationDirection: AnimationDirection;
  /** PDF JOUEUR §démarrage — slot conditionnel `<key> == "<value>"`. NULL = toujours visible. */
  visibleIf: string | null;
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
  /** ADR-086 */
  layerId: string | null;
  anchor: Anchor;
  fitMode: FitMode;
  safeTopPct: number | null;
  safeLeftPct: number | null;
  safeWidthPct: number | null;
  safeHeightPct: number | null;
  overflow: Overflow;
  animationDirection: AnimationDirection;
  scaleFrom: number | null;
  scaleTo: number | null;
  /** PDF JOUEUR §démarrage — slot conditionnel (cf. TemplateTextField.visibleIf). */
  visibleIf: string | null;
}

/** Option template-level (PDF JOUEUR §démarrage) — choix posé par le user au démarrage. */
export interface TemplateOption {
  id: string;
  templateId: string;
  key: string;
  label: string;
  type: 'enum' | 'boolean';
  values: string[];
  defaultValue: string;
  userEditable: boolean;
  sortOrder: number;
}

/** Vue consolidée retournée par `GET /api/remotion-templates/:id/studio`. */
export interface TemplateStudioView {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: 2;
  compositionId: string;
  durationSeconds: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  thumbnailUrl: string | null;
  published: boolean;
  variants: TemplateVariant[];
  layers: TemplateLayer[];
  textFields: TemplateTextField[];
  imageSlots: TemplateImageSlot[];
  options: TemplateOption[]; // PDF JOUEUR §démarrage — défaut [] si template legacy.
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload v2 envoyé dans `POST /render` via la clé `props`.
 * Le worker le discrimine du payload v1 (clé/valeur plate) par la présence
 * de `variantId` + `textValues` + `imageUploads`.
 */
export interface RenderTemplateRequestV2 {
  variantId: string;
  textValues: Record<string, string>;
  imageUploads: Record<string, string>;
  /** PDF JOUEUR §démarrage — options sélectionnées par le user (intro_mode, packshot, etc.). */
  selectedOptions?: Record<string, string>;
}

export function isV2Template(t: Pick<RemotionTemplate, 'schema_version'>): boolean {
  return t.schema_version === 2;
}

export interface RenderResult {
  video_id: string;
  url: string;
  title: string;
  file_size: number;
}

export interface AssetUploadResult {
  url: string;
  prop_key: string;
}

/**
 * ADR-110 / Plan 02 — Library-level WebM asset metadata returned by
 * GET /api/remotion-templates/assets and POST /api/remotion-templates/library/upload.
 * `id` is a deterministic sha256(url).slice(0,16) derived server-side
 * (assets are not yet a first-class table — the URL is the primary key).
 */
export interface WebmAssetMetadata {
  id: string;
  url: string;
  durationMs: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  pixFmt: string;
  uploadedAt: string;
  usedByCount: number;
}

/**
 * Snapshot of a template version (audit/restore, ADR-055).
 */
export interface TemplateVersion {
  id: string;
  template_id: string;
  props_schema: TemplatePropDef[];
  default_props: Record<string, unknown>;
  snapshot_reason: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Payload returned by POST /remotion-templates/:id/render (202 Accepted).
 */
export interface RenderJobEnqueued {
  job_id: string;
  status: 'pending';
  progress: 0;
}

export type RenderJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RenderJobPhase = 'bundling' | 'selecting' | 'rendering' | 'uploading' | null;

/**
 * Payload returned by GET /remotion-templates/render-jobs/:jobId.
 */
export interface RenderJobSnapshot {
  job_id: string;
  status: RenderJobStatus;
  progress: number;
  phase: RenderJobPhase;
  video_id: string | null;
  video_url: string | null;
  file_size: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
