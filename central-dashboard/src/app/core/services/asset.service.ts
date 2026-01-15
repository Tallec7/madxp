/**
 * Asset Service
 *
 * Service Angular pour gérer les assets (watermarks, logos) des sites.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ============================================================================
// Interfaces Watermark
// ============================================================================

export type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkAnimation =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-top'
  | 'slide-bottom'
  | 'zoom';

export interface WatermarkScheduleRule {
  id: string;
  startTime: string;      // Format HH:mm
  endTime: string;        // Format HH:mm
  daysOfWeek: number[];   // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  matchPhases: ('all' | 'neutral' | 'before' | 'during' | 'after')[];
}

export interface WatermarkSchedule {
  enabled: boolean;
  rules: WatermarkScheduleRule[];
}

export interface WatermarkConfig {
  enabled: boolean;
  imagePath: string;
  position: OverlayPosition;
  offsetX: number;
  offsetY: number;
  opacity: number;        // 0-100
  width: number;
  height: number;         // 0 = auto
  borderRadius: number;
  animation: WatermarkAnimation;
  animationDuration: number;
  schedule?: WatermarkSchedule;
}

// ============================================================================
// Interfaces API Responses
// ============================================================================

export interface UploadWatermarkResponse {
  success: boolean;
  message: string;
  cloudUrl: string;
  localPath: string;
  checksum: string;
  deployment: {
    sent: boolean;
    queued: boolean;
    commandId?: string;
  };
  suggestedConfig: WatermarkConfig;
}

export interface ValidateWatermarkResponse {
  valid: boolean;
  errors: string[];
}

export interface DeployAssetResponse {
  success: boolean;
  message: string;
  sent: boolean;
  queued: boolean;
  commandId?: string;
}

// ============================================================================
// Service
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class AssetService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Upload et déploie un watermark vers un site
   * @param siteId ID du site cible
   * @param file Fichier image à uploader
   */
  uploadWatermark(siteId: string, file: File): Observable<UploadWatermarkResponse> {
    const formData = new FormData();
    formData.append('image', file);

    return this.http.post<UploadWatermarkResponse>(
      `${this.apiUrl}/assets/watermark/${siteId}`,
      formData,
      { withCredentials: true }
    );
  }

  /**
   * Valide une configuration watermark
   * @param config Configuration à valider
   */
  validateWatermarkConfig(config: Partial<WatermarkConfig>): Observable<ValidateWatermarkResponse> {
    return this.http.post<ValidateWatermarkResponse>(
      `${this.apiUrl}/assets/watermark/validate`,
      config,
      { withCredentials: true }
    );
  }

  /**
   * Déploie un asset existant vers un site
   * @param siteId ID du site cible
   * @param assetUrl URL de l'asset dans le cloud
   * @param filename Nom du fichier
   * @param targetPath Chemin cible sur le Pi
   * @param checksum Checksum SHA256 (optionnel)
   * @param assetType Type d'asset
   */
  deployAsset(
    siteId: string,
    assetUrl: string,
    filename: string,
    targetPath: string,
    checksum?: string,
    assetType: 'watermark' | 'logo' | 'image' = 'image'
  ): Observable<DeployAssetResponse> {
    return this.http.post<DeployAssetResponse>(
      `${this.apiUrl}/assets/deploy/${siteId}`,
      { assetUrl, filename, targetPath, checksum, assetType },
      { withCredentials: true }
    );
  }

  /**
   * Crée une configuration watermark par défaut
   * @param imagePath Chemin de l'image sur le Pi
   */
  createDefaultWatermarkConfig(imagePath: string): WatermarkConfig {
    return {
      enabled: true,
      imagePath,
      position: 'bottom-right',
      offsetX: 20,
      offsetY: 20,
      opacity: 80,
      width: 150,
      height: 0,
      borderRadius: 0,
      animation: 'fade',
      animationDuration: 500,
      schedule: {
        enabled: false,
        rules: [],
      },
    };
  }

  /**
   * Liste des positions disponibles pour l'UI
   */
  getPositionOptions(): { value: OverlayPosition; label: string }[] {
    return [
      { value: 'top-left', label: 'Haut gauche' },
      { value: 'top-center', label: 'Haut centre' },
      { value: 'top-right', label: 'Haut droite' },
      { value: 'center-left', label: 'Centre gauche' },
      { value: 'center', label: 'Centre' },
      { value: 'center-right', label: 'Centre droite' },
      { value: 'bottom-left', label: 'Bas gauche' },
      { value: 'bottom-center', label: 'Bas centre' },
      { value: 'bottom-right', label: 'Bas droite' },
    ];
  }

  /**
   * Liste des animations disponibles pour l'UI
   */
  getAnimationOptions(): { value: WatermarkAnimation; label: string }[] {
    return [
      { value: 'none', label: 'Aucune' },
      { value: 'fade', label: 'Fondu' },
      { value: 'slide-left', label: 'Glissement gauche' },
      { value: 'slide-right', label: 'Glissement droite' },
      { value: 'slide-top', label: 'Glissement haut' },
      { value: 'slide-bottom', label: 'Glissement bas' },
      { value: 'zoom', label: 'Zoom' },
    ];
  }

  /**
   * Liste des jours de la semaine pour le scheduling
   */
  getDaysOfWeekOptions(): { value: number; label: string; shortLabel: string }[] {
    return [
      { value: 0, label: 'Dimanche', shortLabel: 'Dim' },
      { value: 1, label: 'Lundi', shortLabel: 'Lun' },
      { value: 2, label: 'Mardi', shortLabel: 'Mar' },
      { value: 3, label: 'Mercredi', shortLabel: 'Mer' },
      { value: 4, label: 'Jeudi', shortLabel: 'Jeu' },
      { value: 5, label: 'Vendredi', shortLabel: 'Ven' },
      { value: 6, label: 'Samedi', shortLabel: 'Sam' },
    ];
  }

  /**
   * Liste des phases de match pour le scheduling
   */
  getMatchPhaseOptions(): { value: string; label: string }[] {
    return [
      { value: 'all', label: 'Toutes les phases' },
      { value: 'neutral', label: 'Hors match' },
      { value: 'before', label: 'Avant-match' },
      { value: 'during', label: 'Pendant le match' },
      { value: 'after', label: 'Après-match' },
    ];
  }

  /**
   * Génère un ID unique pour une règle de scheduling
   */
  generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Crée une règle de scheduling par défaut
   */
  createDefaultScheduleRule(): WatermarkScheduleRule {
    return {
      id: this.generateRuleId(),
      startTime: '08:00',
      endTime: '22:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Tous les jours
      matchPhases: ['all'],
    };
  }
}
