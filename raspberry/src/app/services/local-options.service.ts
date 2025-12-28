import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Options locales stockées dans localStorage.
 * Ces options sont propres à chaque appareil et ne sont pas synchronisées avec le serveur central.
 */
export interface LocalOptions {
  overlay: {
    /** Afficher l'overlay du score sur la TV */
    scoreEnabled: boolean;
    /** Afficher l'animation popup lors d'un but */
    goalPopupEnabled: boolean;
  };
  timer: {
    /** Activer le chronomètre */
    enabled: boolean;
    /** Durée d'une mi-temps en minutes */
    halfDuration: number;
    /** Mode compte à rebours (true) ou compteur croissant (false) */
    countDown: boolean;
  };
  breakingNews: {
    /** Activer les breaking news */
    enabled: boolean;
    /** Position du bandeau (haut ou bas) */
    position: 'top' | 'bottom';
    /** Durée d'affichage par défaut en secondes */
    defaultDuration: number;
    /** Mode d'affichage pour textes longs */
    displayMode: 'scroll' | 'truncate' | 'multiline';
    /** Messages rapides prédéfinis */
    quickMessages: string[];
  };
  /** Template d'overlay actif */
  template: 'sportif' | 'elegant' | 'minimal';
}

const DEFAULT_OPTIONS: LocalOptions = {
  overlay: {
    scoreEnabled: true,
    goalPopupEnabled: true,
  },
  timer: {
    enabled: false,
    halfDuration: 30,
    countDown: true,
  },
  breakingNews: {
    enabled: false,
    position: 'bottom',
    defaultDuration: 10,
    displayMode: 'scroll',
    quickMessages: [
      'Mi-temps ! Rendez-vous à la buvette',
      'Changement de joueur',
      'Temps mort',
      'Applaudissez vos joueurs !',
    ],
  },
  template: 'sportif',
};

const STORAGE_KEY = 'neopro-local-options';

@Injectable({ providedIn: 'root' })
export class LocalOptionsService {
  private options: LocalOptions;
  private options$ = new BehaviorSubject<LocalOptions>(DEFAULT_OPTIONS);

  constructor() {
    this.options = this.loadFromStorage();
    this.options$.next(this.options);
  }

  /**
   * Récupère toutes les options actuelles
   */
  public getOptions(): LocalOptions {
    return { ...this.options };
  }

  /**
   * Observable des options (pour réactivité)
   */
  public getOptions$(): Observable<LocalOptions> {
    return this.options$.asObservable();
  }

  /**
   * Met à jour une ou plusieurs options
   */
  public updateOptions(partial: Partial<LocalOptions>): void {
    this.options = this.deepMerge(this.options, partial);
    this.saveToStorage();
    this.options$.next({ ...this.options });
    console.log('[LocalOptions] Options updated:', this.options);
  }

  /**
   * Met à jour les options d'overlay
   */
  public updateOverlayOptions(overlay: Partial<LocalOptions['overlay']>): void {
    this.updateOptions({ overlay: { ...this.options.overlay, ...overlay } });
  }

  /**
   * Met à jour les options du timer
   */
  public updateTimerOptions(timer: Partial<LocalOptions['timer']>): void {
    this.updateOptions({ timer: { ...this.options.timer, ...timer } });
  }

  /**
   * Met à jour les options de breaking news
   */
  public updateBreakingNewsOptions(breakingNews: Partial<LocalOptions['breakingNews']>): void {
    this.updateOptions({ breakingNews: { ...this.options.breakingNews, ...breakingNews } });
  }

  /**
   * Change le template actif
   */
  public setTemplate(template: LocalOptions['template']): void {
    this.updateOptions({ template });
  }

  /**
   * Ajoute un message rapide aux breaking news
   */
  public addQuickMessage(message: string): void {
    if (message.trim() && !this.options.breakingNews.quickMessages.includes(message.trim())) {
      const quickMessages = [...this.options.breakingNews.quickMessages, message.trim()];
      this.updateBreakingNewsOptions({ quickMessages });
    }
  }

  /**
   * Supprime un message rapide
   */
  public removeQuickMessage(index: number): void {
    const quickMessages = this.options.breakingNews.quickMessages.filter((_, i) => i !== index);
    this.updateBreakingNewsOptions({ quickMessages });
  }

  /**
   * Réinitialise toutes les options aux valeurs par défaut
   */
  public resetToDefaults(): void {
    this.options = { ...DEFAULT_OPTIONS };
    this.saveToStorage();
    this.options$.next({ ...this.options });
    console.log('[LocalOptions] Options reset to defaults');
  }

  private loadFromStorage(): LocalOptions {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge avec les valeurs par défaut pour gérer les nouvelles options
        return this.deepMerge(DEFAULT_OPTIONS, parsed);
      }
    } catch (error) {
      console.warn('[LocalOptions] Failed to load from storage:', error);
    }
    return { ...DEFAULT_OPTIONS };
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.options));
    } catch (error) {
      console.error('[LocalOptions] Failed to save to storage:', error);
    }
  }

  private deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];
        if (
          sourceValue !== null &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue !== null &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          (result as Record<string, unknown>)[key] = this.deepMerge(
            targetValue as object,
            sourceValue as object
          );
        } else if (sourceValue !== undefined) {
          (result as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }
    return result;
  }
}
