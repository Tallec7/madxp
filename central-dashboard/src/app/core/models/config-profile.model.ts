/**
 * Interfaces pour les profils de configuration multi-config.
 * Permet a un site d'avoir N profils selectionnables depuis la remote du Pi.
 */

import { SiteConfiguration } from './site-config.model';

/**
 * Profil de configuration tel que retourne par l'API
 */
export interface ConfigProfile {
  id: string;
  site_id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  sport: string | null;
  sort_order: number;
  is_default: boolean;
  configuration: SiteConfiguration;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload pour creer un nouveau profil
 */
export interface CreateProfilePayload {
  name: string;
  display_name?: string | null;
  city?: string | null;
  sport?: string | null;
  sort_order?: number;
  is_default?: boolean;
  configuration: SiteConfiguration;
}

/**
 * Payload pour modifier un profil existant
 */
export interface UpdateProfilePayload {
  name?: string;
  display_name?: string | null;
  city?: string | null;
  sport?: string | null;
  sort_order?: number;
  is_default?: boolean;
  configuration?: SiteConfiguration;
}

/**
 * Reponse de GET /api/sites/:siteId/profiles
 */
export interface ProfilesListResponse {
  site_id: string;
  count: number;
  profiles: ConfigProfile[];
}

/**
 * Reponse de POST /api/sites/:siteId/profiles/:profileId/deploy
 */
export interface DeployProfileResponse {
  success: boolean;
  version_id: string;
  profile_id: string;
  profile_name: string;
}

/**
 * Reponse de POST /api/sites/:siteId/profiles/sync
 */
export interface SyncProfilesResponse {
  success: boolean;
  profile_count: number;
  profiles: Array<{ id: string; name: string; is_default: boolean }>;
}
