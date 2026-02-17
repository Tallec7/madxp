import { Injectable } from '@angular/core';
import { Configuration, WatermarkScheduleRule } from '../interfaces/configuration.interface';

/**
 * Service gérant l'affichage et le scheduling du watermark sur la TV
 * Extrait de tv.component.ts pour réduire la complexité
 */
@Injectable({
  providedIn: 'root'
})
export class WatermarkService {
  private configuration: Configuration | null = null;
  private activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  private scheduleInterval: ReturnType<typeof setInterval> | null = null;
  private _showWatermark = false;

  /** Retry state for image load failures */
  private imageRetryCount = 0;
  private readonly MAX_IMAGE_RETRIES = 5;
  private readonly RETRY_DELAYS_MS = [5000, 10000, 30000, 60000, 120000];
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Observable-like getter pour l'état de visibilité
   */
  get showWatermark(): boolean {
    return this._showWatermark;
  }

  /**
   * Initialise le service avec la configuration
   */
  init(configuration: Configuration): void {
    this.configuration = configuration;
    this.resetRetryState();
    this.checkVisibility();

    // Si scheduling actif, vérifier toutes les minutes
    if (configuration?.watermark?.schedule?.enabled) {
      this.startScheduleCheck();
    }
  }

  /**
   * Met à jour la configuration (ex: après reload)
   */
  setConfiguration(configuration: Configuration): void {
    this.configuration = configuration;

    // Restart schedule check if needed
    this.stopScheduleCheck();
    if (configuration?.watermark?.schedule?.enabled) {
      this.startScheduleCheck();
    }

    // Reset retry state on new config (image may have been deployed since last attempt)
    this.resetRetryState();
    this.checkVisibility();
  }

  /**
   * Met à jour la phase active (pour le scheduling basé sur les phases de match)
   */
  setActivePhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.activePhase = phase;
    this.checkVisibility();
  }

  /**
   * Démarre la vérification périodique du scheduling
   */
  private startScheduleCheck(): void {
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
    }
    this.scheduleInterval = setInterval(() => {
      this.checkVisibility();
    }, 60000); // Toutes les minutes
  }

  /**
   * Arrête la vérification périodique
   */
  private stopScheduleCheck(): void {
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }
  }

  /**
   * Vérifie si le watermark doit être affiché selon le scheduling
   */
  checkVisibility(): void {
    const config = this.configuration?.watermark;

    if (!config?.enabled || !config.imagePath) {
      this._showWatermark = false;
      return;
    }

    // Si pas de scheduling, toujours visible
    if (!config.schedule?.enabled || !config.schedule.rules?.length) {
      this._showWatermark = true;
      return;
    }

    // Évaluer les règles de scheduling
    this._showWatermark = this.isVisibleNow(config.schedule.rules);
  }

  /**
   * Évalue les règles de scheduling pour déterminer si le watermark doit être visible
   */
  private isVisibleNow(rules: WatermarkScheduleRule[]): boolean {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const rule of rules) {
      // Vérifier le jour de la semaine
      if (!rule.daysOfWeek.includes(currentDay)) continue;

      // Vérifier l'heure
      if (currentTime < rule.startTime || currentTime > rule.endTime) continue;

      // Vérifier la phase de match
      if (!rule.matchPhases.includes('all') && !rule.matchPhases.includes(this.activePhase as 'neutral' | 'before' | 'during' | 'after')) continue;

      return true;
    }
    return false;
  }

  /**
   * Calcule les styles dynamiques du watermark (position, taille, opacité)
   */
  getStyles(): Record<string, string> {
    const config = this.configuration?.watermark;
    if (!config) return {};

    // Mode fullscreen : l'image couvre tout l'écran
    if (config.fullscreen) {
      return {
        'opacity': String((config.opacity ?? 100) / 100),
        'top': '0',
        'left': '0',
        'width': '100%',
        'height': '100%',
        'object-fit': 'cover',
        'border-radius': '0',
      };
    }

    // Mode positionné : placement personnalisé
    const position = config.position || 'bottom-right';
    const offsetX = (config.offsetX ?? 20) + 'px';
    const offsetY = (config.offsetY ?? 20) + 'px';

    const styles: Record<string, string> = {
      'opacity': String((config.opacity ?? 100) / 100),
      'width': (config.width ?? 150) + 'px',
      'border-radius': (config.borderRadius ?? 0) + 'px',
    };

    // Hauteur (0 = auto)
    if (config.height && config.height > 0) {
      styles['height'] = config.height + 'px';
    }

    // Position verticale (top/middle/bottom)
    if (position.includes('top')) {
      styles['top'] = offsetY;
      styles['bottom'] = 'auto';
    } else if (position.includes('bottom')) {
      styles['bottom'] = offsetY;
      styles['top'] = 'auto';
    } else {
      // middle
      styles['top'] = '50%';
      styles['transform'] = 'translateY(-50%)';
    }

    // Position horizontale (left/center/right)
    if (position.includes('right')) {
      styles['right'] = offsetX;
      styles['left'] = 'auto';
    } else if (position.includes('left')) {
      styles['left'] = offsetX;
      styles['right'] = 'auto';
    } else {
      // center
      styles['left'] = '50%';
      const existingTransform = styles['transform'] || '';
      styles['transform'] = existingTransform ? 'translate(-50%, -50%)' : 'translateX(-50%)';
    }

    return styles;
  }

  /**
   * Retourne la classe d'animation du watermark
   */
  getAnimationClass(): string {
    const anim = this.configuration?.watermark?.animation || 'none';
    return `watermark-anim-${anim}`;
  }

  /**
   * Retourne le chemin de l'image watermark
   */
  getImagePath(): string | null {
    return this.configuration?.watermark?.imagePath || null;
  }

  /**
   * Retourne le chemin de l'image avec cache-buster pour forcer le rechargement
   * lors des retries (évite que le navigateur serve un 404 depuis le cache)
   */
  getImageSrc(): string | null {
    const imagePath = this.configuration?.watermark?.imagePath;
    if (!imagePath) return null;
    if (this.imageRetryCount === 0) return imagePath;
    const separator = imagePath.includes('?') ? '&' : '?';
    return `${imagePath}${separator}_cb=${Date.now()}`;
  }

  /**
   * Gère les erreurs de chargement de l'image watermark.
   * Au lieu de désactiver définitivement le watermark, programme un retry
   * avec backoff exponentiel. Cela couvre le cas où deploy_asset arrive
   * après update_config (race condition).
   */
  onImageError(): void {
    this._showWatermark = false;

    if (this.imageRetryCount < this.MAX_IMAGE_RETRIES) {
      const delay = this.RETRY_DELAYS_MS[this.imageRetryCount] ?? this.RETRY_DELAYS_MS[this.RETRY_DELAYS_MS.length - 1];
      this.imageRetryCount++;
      console.warn(`[WatermarkService] Watermark image failed to load, retry ${this.imageRetryCount}/${this.MAX_IMAGE_RETRIES} in ${delay / 1000}s`);

      this.clearRetryTimeout();
      this.retryTimeout = setTimeout(() => {
        console.info(`[WatermarkService] Retrying watermark image (attempt ${this.imageRetryCount}/${this.MAX_IMAGE_RETRIES})`);
        this.checkVisibility();
      }, delay);
    } else {
      console.error(`[WatermarkService] Watermark image failed to load after ${this.MAX_IMAGE_RETRIES} retries, giving up`);
    }
  }

  /**
   * Reset retry state (called on init/setConfiguration)
   */
  private resetRetryState(): void {
    this.imageRetryCount = 0;
    this.clearRetryTimeout();
  }

  /**
   * Clear pending retry timeout
   */
  private clearRetryTimeout(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  /**
   * Nettoie les ressources du service
   */
  destroy(): void {
    this.stopScheduleCheck();
    this.clearRetryTimeout();
  }
}
