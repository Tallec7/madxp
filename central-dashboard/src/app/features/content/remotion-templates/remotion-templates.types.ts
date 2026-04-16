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
