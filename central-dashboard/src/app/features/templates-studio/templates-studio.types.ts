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
