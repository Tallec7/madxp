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
  // NULL = joueur global (catalogue admin), UUID = joueur exclusif au site.
  // Cf migration add-studio-player-global-grants.sql + ADR-082 pattern.
  site_id: string | null;
  // Convenience flag exposé par l'API pour éviter aux composants de tester
  // `site_id === null` partout. `true` ⇔ `site_id === null`.
  is_global: boolean;
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
  // Internal roles : si true, le joueur est créé en global (site_id NULL)
  // + auto-granté au site courant. Ignoré côté backend pour les users `club`.
  is_global?: boolean;
}

export type UpdatePlayerInput = Partial<CreatePlayerInput> & {
  photo_cutout_url?: string | null;
};

/** Grant d'un joueur global vers un site (ADR-082 pattern). */
export interface PlayerGrant {
  site_id: string;
  site_name: string;
  club_name: string | null;
  granted_by: string | null;
  granted_at: string;
}

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

// ────────────────────────────────────────────────────────────────────────────
// ADR-125 — Asset library + bindings (Phase 1.5)
// ────────────────────────────────────────────────────────────────────────────

export interface StudioAsset {
  id: string;
  filename: string;
  ftp_path: string;
  url: string;
  mime_type: string;
  file_size: number;
  checksum_sha256: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  tags: string[];
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface StudioAssetWithUsage extends StudioAsset {
  usage: Array<{
    template_slug: string;
    asset_key: string;
    bound_at: string;
  }>;
}

export interface StudioAssetUploadResult extends StudioAsset {
  /** True si le serveur a détecté un duplicata par checksum_sha256 et n'a pas re-uploadé. */
  deduplicated?: boolean;
}

export interface StudioAssetListFilters {
  tag?: string;
  mime?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface StudioAssetListResult {
  assets: StudioAsset[];
  total: number;
  limit: number;
  offset: number;
}

/** Slot déclaré dans `manifest.requiredAssets[]` côté template. */
export interface RequiredAsset {
  key: string;
  filename: string | null;
  mime: string | null;
}

export interface TemplateAssetBinding {
  template_slug: string;
  asset_key: string;
  asset_id: string;
  bound_by: string | null;
  bound_at: string;
  asset: StudioAsset | null;
}

export interface TemplateAssetBindingsResult {
  template_slug: string;
  required: RequiredAsset[];
  bindings: TemplateAssetBinding[];
  missing: RequiredAsset[];
}
