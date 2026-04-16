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
