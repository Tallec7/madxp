import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SportType, OverlayPosition } from '../interfaces/configuration.interface';

/**
 * Configuration d'une équipe pour le match
 */
export interface TeamConfig {
  name: string;
  shortName?: string; // Nom court pour l'affichage compact
  logo?: string; // URL ou data:image base64
}

/**
 * Périodes selon le sport
 */
export interface SportPeriods {
  football: ('1ère mi-temps' | '2ème mi-temps' | 'Prolongations' | 'Tirs au but')[];
  basketball: ('1er quart' | '2ème quart' | '3ème quart' | '4ème quart' | 'Prolongation')[];
  handball: ('1ère mi-temps' | '2ème mi-temps' | 'Prolongations')[];
  volleyball: ('Set 1' | 'Set 2' | 'Set 3' | 'Set 4' | 'Set 5')[];
  rugby: ('1ère mi-temps' | '2ème mi-temps' | 'Prolongations')[];
  hockey: ('1ère période' | '2ème période' | '3ème période' | 'Prolongation' | 'Tirs au but')[];
}

/**
 * Configuration de l'animation de but/point
 */
export interface GoalAnimationConfig {
  enabled: boolean;
  style: 'popup' | 'fullscreen' | 'slide';
  duration: number; // en secondes
  soundEnabled: boolean;
  soundUrl?: string; // URL ou path vers le son
}

/**
 * Preset de configuration sauvegardable
 */
export interface OverlayPreset {
  id: string;
  name: string;
  sport: SportType;
  position: OverlayPosition;
  template: 'sportif' | 'elegant' | 'minimal';
  backgroundColor?: string;
  scoreColor?: string;
  teamNameColor?: string;
  createdAt: number;
}

/**
 * Options locales stockées dans localStorage.
 * Ces options sont propres à chaque appareil et ne sont pas synchronisées avec le serveur central.
 */
export interface LocalOptions {
  /** Sport actuel (détermine le template et les périodes) */
  sport: SportType;

  /** Configuration du match en cours */
  match: {
    homeTeam: TeamConfig;
    awayTeam: TeamConfig;
    period: string; // Période actuelle selon le sport
    periodIndex: number; // Index de la période (0-based)
  };

  overlay: {
    /** Afficher l'overlay du score sur la TV */
    scoreEnabled: boolean;
    /** Position de l'overlay (override local) */
    position?: OverlayPosition;
    /** Surcharger les couleurs du central */
    useLocalColors: boolean;
    /** Couleurs locales (si useLocalColors = true) */
    backgroundColor?: string;
    scoreColor?: string;
    teamNameColor?: string;
  };

  /** Configuration de l'animation de but/point */
  goalAnimation: GoalAnimationConfig;

  timer: {
    /** Activer le chronomètre */
    enabled: boolean;
    /** Durée d'une période en minutes (selon le sport) */
    periodDuration: number;
    /** Mode compte à rebours (true) ou compteur croissant (false) */
    countDown: boolean;
    /** Afficher le timer intégré au score (sinon standalone) */
    integratedWithScore: boolean;
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

  /** Presets sauvegardés par l'utilisateur */
  presets: OverlayPreset[];
}

/**
 * Durées par défaut des périodes selon le sport (en minutes)
 */
export const SPORT_PERIOD_DURATIONS: Record<SportType, number> = {
  football: 45,
  basketball: 10,
  handball: 30,
  volleyball: 25, // Pas de temps fixe, mais pour le timer
  rugby: 40,
  hockey: 20,
};

/**
 * Périodes disponibles selon le sport
 */
export const SPORT_PERIODS: Record<SportType, string[]> = {
  football: ['1ère mi-temps', '2ème mi-temps', 'Prolongations', 'Tirs au but'],
  basketball: ['1er quart', '2ème quart', '3ème quart', '4ème quart', 'Prolongation'],
  handball: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  volleyball: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
  rugby: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  hockey: ['1ère période', '2ème période', '3ème période', 'Prolongation', 'Tirs au but'],
};

/**
 * Libellés des sports
 */
export const SPORT_LABELS: Record<SportType, string> = {
  football: 'Football',
  basketball: 'Basketball',
  handball: 'Handball',
  volleyball: 'Volleyball',
  rugby: 'Rugby',
  hockey: 'Hockey',
};

/**
 * Sons de but par défaut selon le sport
 */
export const DEFAULT_GOAL_SOUNDS: Record<SportType, string> = {
  football: '/assets/sounds/goal-football.mp3',
  basketball: '/assets/sounds/buzzer-basketball.mp3',
  handball: '/assets/sounds/goal-handball.mp3',
  volleyball: '/assets/sounds/point-volleyball.mp3',
  rugby: '/assets/sounds/try-rugby.mp3',
  hockey: '/assets/sounds/goal-hockey.mp3',
};

const DEFAULT_OPTIONS: LocalOptions = {
  sport: 'football',

  match: {
    homeTeam: {
      name: 'DOMICILE',
      shortName: 'DOM',
      logo: undefined,
    },
    awayTeam: {
      name: 'EXTÉRIEUR',
      shortName: 'EXT',
      logo: undefined,
    },
    period: '1ère mi-temps',
    periodIndex: 0,
  },

  overlay: {
    scoreEnabled: false, // Désactivé par défaut - le staff du club active quand il y a un match
    position: undefined, // Utilise la position du central par défaut
    useLocalColors: false,
    backgroundColor: undefined,
    scoreColor: undefined,
    teamNameColor: undefined,
  },

  goalAnimation: {
    enabled: true,
    style: 'popup',
    duration: 4,
    soundEnabled: true,
    soundUrl: DEFAULT_GOAL_SOUNDS.football,
  },

  timer: {
    enabled: false,
    periodDuration: 45,
    countDown: true,
    integratedWithScore: true,
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

  presets: [],
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

  // ============================================================================
  // SPORT & PÉRIODES
  // ============================================================================

  /**
   * Change le sport actuel et met à jour les options liées
   */
  public setSport(sport: SportType): void {
    const periods = SPORT_PERIODS[sport];
    const periodDuration = SPORT_PERIOD_DURATIONS[sport];

    this.updateOptions({
      sport,
      match: {
        ...this.options.match,
        period: periods[0],
        periodIndex: 0,
      },
      timer: {
        ...this.options.timer,
        periodDuration,
      },
      goalAnimation: {
        ...this.options.goalAnimation,
        soundUrl: DEFAULT_GOAL_SOUNDS[sport],
      },
    });
  }

  /**
   * Récupère les périodes disponibles pour le sport actuel
   */
  public getAvailablePeriods(): string[] {
    return SPORT_PERIODS[this.options.sport] || SPORT_PERIODS.football;
  }

  /**
   * Change la période actuelle
   */
  public setPeriod(periodIndex: number): void {
    const periods = this.getAvailablePeriods();
    if (periodIndex >= 0 && periodIndex < periods.length) {
      this.updateOptions({
        match: {
          ...this.options.match,
          period: periods[periodIndex],
          periodIndex,
        },
      });
    }
  }

  /**
   * Passe à la période suivante
   */
  public nextPeriod(): void {
    const periods = this.getAvailablePeriods();
    const nextIndex = (this.options.match.periodIndex + 1) % periods.length;
    this.setPeriod(nextIndex);
  }

  // ============================================================================
  // ÉQUIPES & LOGOS
  // ============================================================================

  /**
   * Met à jour les informations de l'équipe à domicile
   */
  public updateHomeTeam(team: Partial<TeamConfig>): void {
    this.updateOptions({
      match: {
        ...this.options.match,
        homeTeam: { ...this.options.match.homeTeam, ...team },
      },
    });
  }

  /**
   * Met à jour les informations de l'équipe extérieure
   */
  public updateAwayTeam(team: Partial<TeamConfig>): void {
    this.updateOptions({
      match: {
        ...this.options.match,
        awayTeam: { ...this.options.match.awayTeam, ...team },
      },
    });
  }

  /**
   * Définit le logo d'une équipe (base64 ou URL)
   */
  public setTeamLogo(team: 'home' | 'away', logo: string | undefined): void {
    if (team === 'home') {
      this.updateHomeTeam({ logo });
    } else {
      this.updateAwayTeam({ logo });
    }
  }

  /**
   * Efface les logos des équipes (pour nouveau match)
   */
  public clearTeamLogos(): void {
    this.updateHomeTeam({ logo: undefined });
    this.updateAwayTeam({ logo: undefined });
  }

  /**
   * Réinitialise le match (nouveau match)
   */
  public resetMatch(): void {
    this.updateOptions({
      match: {
        homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
        awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
        period: SPORT_PERIODS[this.options.sport][0],
        periodIndex: 0,
      },
    });
  }

  // ============================================================================
  // ANIMATION DE BUT
  // ============================================================================

  /**
   * Met à jour les options d'animation de but
   */
  public updateGoalAnimation(config: Partial<GoalAnimationConfig>): void {
    this.updateOptions({
      goalAnimation: { ...this.options.goalAnimation, ...config },
    });
  }

  // ============================================================================
  // PRESETS
  // ============================================================================

  /**
   * Sauvegarde la configuration actuelle comme preset
   */
  public savePreset(name: string): OverlayPreset {
    const preset: OverlayPreset = {
      id: this.generateId(),
      name,
      sport: this.options.sport,
      position: this.options.overlay.position || 'top-right',
      template: this.options.template,
      backgroundColor: this.options.overlay.backgroundColor,
      scoreColor: this.options.overlay.scoreColor,
      teamNameColor: this.options.overlay.teamNameColor,
      createdAt: Date.now(),
    };

    this.updateOptions({
      presets: [...this.options.presets, preset],
    });

    console.log('[LocalOptions] Preset saved:', preset);
    return preset;
  }

  /**
   * Applique un preset
   */
  public applyPreset(presetId: string): boolean {
    const preset = this.options.presets.find(p => p.id === presetId);
    if (!preset) return false;

    this.updateOptions({
      sport: preset.sport,
      template: preset.template,
      overlay: {
        ...this.options.overlay,
        position: preset.position,
        useLocalColors: !!(preset.backgroundColor || preset.scoreColor || preset.teamNameColor),
        backgroundColor: preset.backgroundColor,
        scoreColor: preset.scoreColor,
        teamNameColor: preset.teamNameColor,
      },
    });

    // Mettre à jour les périodes pour le sport du preset
    const periods = SPORT_PERIODS[preset.sport];
    this.updateOptions({
      match: {
        ...this.options.match,
        period: periods[0],
        periodIndex: 0,
      },
      timer: {
        ...this.options.timer,
        periodDuration: SPORT_PERIOD_DURATIONS[preset.sport],
      },
    });

    console.log('[LocalOptions] Preset applied:', preset);
    return true;
  }

  /**
   * Supprime un preset
   */
  public deletePreset(presetId: string): void {
    this.updateOptions({
      presets: this.options.presets.filter(p => p.id !== presetId),
    });
    console.log('[LocalOptions] Preset deleted:', presetId);
  }

  /**
   * Récupère tous les presets
   */
  public getPresets(): OverlayPreset[] {
    return [...this.options.presets];
  }

  /**
   * Génère un ID unique
   */
  private generateId(): string {
    return 'preset_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
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
        } else {
          // Accepter toutes les valeurs, y compris undefined (pour effacer une prop)
          (result as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }
    return result;
  }
}
