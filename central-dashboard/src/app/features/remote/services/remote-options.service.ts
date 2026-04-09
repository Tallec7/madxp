/**
 * RemoteOptionsService — LocalOptions persistence and broadcasting for cloud remote.
 * Extracted from CloudRemoteComponent (ADR-043).
 */
import { Injectable } from '@angular/core';

export type SportType = 'football' | 'basketball' | 'handball' | 'volleyball' | 'rugby' | 'hockey';
export type OverlayTheme = 'broadcast' | 'minimal';
export type ScoreOverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TeamConfig {
  name: string;
  shortName?: string;
  logo?: string;
}

export interface GoalAnimationConfig {
  enabled: boolean;
  style: 'popup' | 'fullscreen' | 'slide';
  duration: number;
  soundEnabled: boolean;
  soundUrl?: string;
}

export interface LocalOptions {
  sport: SportType;
  match: {
    homeTeam: TeamConfig;
    awayTeam: TeamConfig;
    period: string;
    periodIndex: number;
  };
  overlay: {
    scoreEnabled: boolean;
    position?: ScoreOverlayPosition;
  };
  goalAnimation: GoalAnimationConfig;
  timer: {
    enabled: boolean;
    periodDuration: number;
    countDown: boolean;
    integratedWithScore: boolean;
  };
  breakingNews: {
    enabled: boolean;
    position: 'top' | 'bottom';
    defaultDuration: number;
    displayMode: 'scroll';
    quickMessages: string[];
  };
  template: OverlayTheme;
}

export const SPORT_PERIOD_DURATIONS: Record<SportType, number> = {
  football: 45,
  basketball: 10,
  handball: 30,
  volleyball: 25,
  rugby: 40,
  hockey: 20,
};

export const SPORT_PERIODS: Record<SportType, string[]> = {
  football: ['1ère mi-temps', '2ème mi-temps', 'Prolongations', 'Tirs au but'],
  basketball: ['1er quart', '2ème quart', '3ème quart', '4ème quart', 'Prolongation'],
  handball: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  volleyball: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
  rugby: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  hockey: ['1ère période', '2ème période', '3ème période', 'Prolongation', 'Tirs au but'],
};

export const SPORT_LABELS: Record<SportType, string> = {
  football: 'Football',
  basketball: 'Basketball',
  handball: 'Handball',
  volleyball: 'Volleyball',
  rugby: 'Rugby',
  hockey: 'Hockey',
};

export const DEFAULT_GOAL_SOUNDS: Record<SportType, string> = {
  football: '/assets/sounds/goal-football.mp3',
  basketball: '/assets/sounds/buzzer-basketball.mp3',
  handball: '/assets/sounds/goal-handball.mp3',
  volleyball: '/assets/sounds/point-volleyball.mp3',
  rugby: '/assets/sounds/try-rugby.mp3',
  hockey: '/assets/sounds/goal-hockey.mp3',
};

export const DEFAULT_OPTIONS: LocalOptions = {
  sport: 'football',
  match: {
    homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
    awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
    period: '1ère mi-temps',
    periodIndex: 0,
  },
  overlay: {
    scoreEnabled: false,
    position: undefined,
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
  template: 'broadcast',
};

const STORAGE_KEY = 'cloudRemoteOptions';

@Injectable()
export class RemoteOptionsService {
  options: LocalOptions = this.load();

  /** Called after any option mutation to persist */
  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.options));
    } catch {
      // Silencieux - localStorage peut être désactivé
    }
  }

  updateOverlayOption(key: keyof LocalOptions['overlay'], value: boolean): void {
    this.options.overlay[key] = value as never;
    this.save();
  }

  updateTimerOption<K extends keyof LocalOptions['timer']>(
    key: K,
    value: LocalOptions['timer'][K]
  ): void {
    this.options.timer[key] = value;
    this.save();
  }

  updateBreakingNewsOption<K extends keyof LocalOptions['breakingNews']>(
    key: K,
    value: LocalOptions['breakingNews'][K]
  ): void {
    this.options.breakingNews[key] = value;
    this.save();
  }

  setTemplate(template: LocalOptions['template']): void {
    this.options.template = template;
    this.save();
  }

  addQuickMessage(message: string): void {
    if (!this.options.breakingNews.quickMessages) {
      this.options.breakingNews.quickMessages = [];
    }
    if (message.trim() && !this.options.breakingNews.quickMessages.includes(message.trim())) {
      this.options.breakingNews.quickMessages.push(message.trim());
      this.save();
    }
  }

  removeQuickMessage(index: number): void {
    this.options.breakingNews.quickMessages?.splice(index, 1);
    this.save();
  }

  resetOptions(): void {
    this.options = JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
    this.save();
  }

  setSport(sport: SportType): void {
    const periods = SPORT_PERIODS[sport];
    const periodDuration = SPORT_PERIOD_DURATIONS[sport];

    this.options.sport = sport;
    this.options.match.period = periods[0];
    this.options.match.periodIndex = 0;
    this.options.timer.periodDuration = periodDuration;
    this.options.goalAnimation.soundUrl = DEFAULT_GOAL_SOUNDS[sport];
    this.save();
  }

  setPeriod(periodIndex: number): void {
    const periods = this.getAvailablePeriods();
    if (periodIndex >= 0 && periodIndex < periods.length) {
      this.options.match.period = periods[periodIndex];
      this.options.match.periodIndex = periodIndex;
      this.save();
    }
  }

  nextPeriod(): void {
    const periods = this.getAvailablePeriods();
    const nextIndex = (this.options.match.periodIndex + 1) % periods.length;
    this.setPeriod(nextIndex);
  }

  getAvailablePeriods(): string[] {
    return SPORT_PERIODS[this.options.sport] || SPORT_PERIODS.football;
  }

  updateHomeTeamName(name: string): void {
    this.options.match.homeTeam.name = name;
    this.save();
  }

  updateAwayTeamName(name: string): void {
    this.options.match.awayTeam.name = name;
    this.save();
  }

  onLogoUpload(file: File, team: 'home' | 'away'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Veuillez sélectionner une image'));
        return;
      }
      if (file.size > 500 * 1024) {
        reject(new Error('Image trop volumineuse (max 500KB)'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (team === 'home') {
          this.options.match.homeTeam.logo = base64;
        } else {
          this.options.match.awayTeam.logo = base64;
        }
        this.save();
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Erreur de lecture'));
      reader.readAsDataURL(file);
    });
  }

  clearTeamLogo(team: 'home' | 'away'): void {
    if (team === 'home') {
      this.options.match.homeTeam.logo = undefined;
    } else {
      this.options.match.awayTeam.logo = undefined;
    }
    this.save();
  }

  resetForNewMatch(): void {
    this.options.match = {
      homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
      awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
      period: SPORT_PERIODS[this.options.sport][0],
      periodIndex: 0,
    };
    this.save();
  }

  updateGoalAnimationOption<K extends keyof LocalOptions['goalAnimation']>(
    key: K,
    value: LocalOptions['goalAnimation'][K]
  ): void {
    this.options.goalAnimation[key] = value;
    this.save();
  }

  setOverlayPosition(position: ScoreOverlayPosition | undefined): void {
    this.options.overlay.position = position;
    this.save();
  }

  private load(): LocalOptions {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.deepMerge(DEFAULT_OPTIONS, parsed);
      }
    } catch {
      // Options par défaut si le localStorage est corrompu
    }
    return JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
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
          (result as Record<string, unknown>)[key] = Array.isArray(sourceValue)
            ? [...sourceValue]
            : sourceValue;
        }
      }
    }
    return result;
  }
}
