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
   * Gère les erreurs de chargement de l'image watermark
   */
  onImageError(): void {
    console.warn('[WatermarkService] Watermark image failed to load');
    this._showWatermark = false;
  }

  /**
   * Nettoie les ressources du service
   */
  destroy(): void {
    this.stopScheduleCheck();
  }
}
