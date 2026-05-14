/**
 * Templates Studio V1 — types partagés côté dashboard.
 * Alignés sur la forme retournée par `central-server/src/controllers/templates-studio.controller.ts`.
 */

export interface BrandKit {
  site_id: string;
  club_name: string | null;
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  logos: {
    primary?: string;
    mono_light?: string;
    mono_dark?: string;
  };
  fonts: {
    display?: string;
    body?: string;
  };
  updated_at: string | null;
}

/**
 * Payload PUT — tous les champs sont optionnels, le serveur coalesce avec
 * les valeurs existantes (un PUT partiel sur `colors` ne wipe pas `logos`).
 */
export interface BrandKitUpsertInput {
  club_name?: string | null;
  colors?: BrandKit['colors'];
  logos?: BrandKit['logos'];
  fonts?: BrandKit['fonts'];
}

export interface TemplateSummary {
  id: string;
  slug: string;
  version: string;
  label: string;
  description: string | null;
  kind: 'video' | 'still';
  manifest: Record<string, unknown>;
  composition_id: string;
}

// Sous-set du manifest utile pour l'UI : inputSchema sert au form auto-gen.
export interface ManifestInputProperty {
  type: 'string' | 'integer' | 'number';
  ref?: 'Player';
  label?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

export interface ManifestInputSchema {
  type: 'object';
  required: string[];
  properties: Record<string, ManifestInputProperty>;
}

export type RenderStatus = 'queued' | 'rendering' | 'ready' | 'failed';

export interface RenderRequestCreated {
  id: string;
  status: RenderStatus;
  template: { id: string; slug: string; kind: 'video' | 'still' };
  created_at: string;
}

export interface RenderRequestSnapshot {
  id: string;
  status: RenderStatus;
  output_url: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

export type CutoutStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface Player {
  id: string;
  site_id: string;
  prenom: string;
  nom: string;
  numero: number | null;
  poste: string | null;
  photo_raw_url: string | null;
  photo_cutout_url: string | null;
  cutout_status: CutoutStatus;
  created_at: string;
  updated_at: string;
}

export interface CreatePlayerInput {
  prenom: string;
  nom: string;
  numero?: number | null;
  poste?: string | null;
  photo_raw_url?: string | null;
}

export type UpdatePlayerInput = Partial<CreatePlayerInput> & {
  photo_cutout_url?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Distribution multi-sites des renders (POST /render-requests/:id/distribute)
// ────────────────────────────────────────────────────────────────────────────

export type RenderDistributionMode = 'push' | 'grant';

export interface RenderDistributionInput {
  mode: RenderDistributionMode;
  site_ids: string[];
  category?: string;
}

export interface RenderDistributionResult {
  videos_created: Array<{ id: string; site_id: string | null }>;
  grants_created: Array<{ video_id: string; site_id: string }>;
}
