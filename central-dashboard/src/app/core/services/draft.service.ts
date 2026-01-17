/**
 * Draft Service
 *
 * Service Angular pour gérer les brouillons de configuration des sites.
 */

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

// ============================================================================
// Interfaces
// ============================================================================

export interface SponsorVideo {
  name: string;
  path: string;
  type?: string;
  owner?: 'neopro' | 'club';
  locked?: boolean;
  expiresAt?: string;
}

export interface CategoryVideo {
  name: string;
  path: string;
  type?: string;
}

export interface SubCategory {
  id: string;
  name: string;
  videos: CategoryVideo[];
}

export interface Category {
  id: string;
  name: string;
  videos: CategoryVideo[];
  subCategories?: SubCategory[];
}

export interface TimeCategory {
  id: string;
  name: string;
  icon?: string;
  loopVideos: SponsorVideo[];
  categories?: string[];
}

export type CategoryMappings = Record<string, 'sponsor' | 'jingle' | 'ambiance' | 'other'>;

export interface SiteConfiguration {
  sponsors: SponsorVideo[];
  categories: Category[];
  timeCategories?: TimeCategory[];
  categoryMappings?: CategoryMappings;
  liveScoreEnabled?: boolean;
  scoreOverlay?: Record<string, unknown>;
  auth?: {
    password?: string;
    clubName?: string;
    sessionDuration?: number;
  };
  settings?: {
    language?: string;
    timezone?: string;
  };
  siteId?: string;
  siteName?: string;
  clubName?: string;
  apiKey?: string;
  [key: string]: unknown;
}

export type DraftStatus = 'draft' | 'deploying' | 'deployed' | 'failed';

export interface ConfigDraft {
  id: string;
  site_id: string;
  name: string;
  configuration: SiteConfiguration;
  referenced_video_ids: string[];
  status: DraftStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MissingVideoInfo {
  videoId: string | null;
  filename: string;
  path: string;
  isInCloud: boolean;
  isOnPi: boolean;
}

export interface DraftValidationResult {
  valid: boolean;
  missingVideos: MissingVideoInfo[];
  videosToDeploy: string[];
}

export type OrchestratedDeploymentStatus =
  | 'pending'
  | 'deploying_videos'
  | 'deploying_config'
  | 'completed'
  | 'partial_failure'
  | 'failed';

export interface OrchestratedDeploymentProgress {
  id: string;
  status: OrchestratedDeploymentStatus;
  totalVideos: number;
  videosCompleted: number;
  videosFailed: number;
  configDeployed: boolean;
  overallProgress: number;
  errorMessage: string | null;
  failedVideos: Array<{ id: string; filename: string; error?: string }>;
}

export interface DeployDraftResponse {
  success: boolean;
  orchestratedDeploymentId: string;
  totalVideos: number;
  message: string;
}

// ============================================================================
// Service
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class DraftService {
  private readonly api = inject(ApiService);

  /**
   * Récupère le brouillon d'un site
   * Retourne null si aucun brouillon n'existe
   */
  getDraft(siteId: string): Observable<ConfigDraft | null> {
    return this.api.get<{ draft: ConfigDraft | null }>(`/sites/${siteId}/draft`).pipe(
      map(response => response.draft)
    );
  }

  /**
   * Crée ou met à jour le brouillon d'un site
   */
  saveDraft(
    siteId: string,
    configuration: SiteConfiguration,
    name?: string
  ): Observable<ConfigDraft> {
    return this.api.put<ConfigDraft>(`/sites/${siteId}/draft`, {
      name: name || 'Brouillon',
      configuration,
    });
  }

  /**
   * Supprime le brouillon d'un site
   */
  deleteDraft(siteId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete<{ success: boolean; message: string }>(`/sites/${siteId}/draft`);
  }

  /**
   * Valide un brouillon (vérifie les vidéos manquantes)
   */
  validateDraft(siteId: string): Observable<DraftValidationResult> {
    return this.api.post<DraftValidationResult>(`/sites/${siteId}/draft/validate`, {});
  }

  /**
   * Déploie un brouillon (vidéos + configuration)
   */
  deployDraft(siteId: string): Observable<DeployDraftResponse> {
    return this.api.post<DeployDraftResponse>(`/sites/${siteId}/draft/deploy`, {});
  }

  /**
   * Récupère la progression d'un déploiement orchestré
   */
  getDeploymentProgress(
    siteId: string,
    deploymentId: string
  ): Observable<OrchestratedDeploymentProgress> {
    return this.api.get<OrchestratedDeploymentProgress>(
      `/sites/${siteId}/draft/deployment/${deploymentId}`
    );
  }
}
