/**
 * Cloud Remote Component
 *
 * Télécommande cloud identique à /remote sur le Raspberry Pi.
 * Accessible via https://dashboard.neopro.tv/remote/{siteId}
 *
 * Différences avec le Pi:
 * - Utilise RemoteService (HTTP API) au lieu de LocalBroadcastService
 * - Pas de mode démo (club selector)
 * - Configuration chargée depuis le cloud au lieu de local
 *
 * Date: 2026-01-18
 */

import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, interval, takeUntil, debounceTime } from 'rxjs';
import { RemoteService, RemoteState } from '../../core/services/remote.service';
import { LicenseState, LicenseStatus } from '../../core/models/license.model';
import { LicenseBannerComponent } from './components/license-banner.component';
import { LicenseBlockRemoteComponent } from './components/license-block-remote.component';

// Types locaux (identiques au Pi)
type SportType = 'football' | 'basketball' | 'handball' | 'volleyball' | 'rugby' | 'hockey';
type OverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface Category {
  id: string;
  name: string;
  videos?: Video[];
  subCategories?: Category[];
}

interface Video {
  name: string;
  path: string;
  type?: string;
  categoryId?: string;
}

interface TimeCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  categoryIds?: string[];
  loopVideos?: Video[];
}

interface Configuration {
  remote?: { title?: string };
  categories: Category[];
  sponsors: Video[];
  timeCategories?: TimeCategory[];
  liveScoreEnabled?: boolean;
}

interface TeamConfig {
  name: string;
  shortName?: string;
  logo?: string;
}

interface GoalAnimationConfig {
  enabled: boolean;
  style: 'popup' | 'fullscreen' | 'slide';
  duration: number;
  soundEnabled: boolean;
  soundUrl?: string;
}

interface OverlayPreset {
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

interface LocalOptions {
  sport: SportType;
  match: {
    homeTeam: TeamConfig;
    awayTeam: TeamConfig;
    period: string;
    periodIndex: number;
  };
  overlay: {
    scoreEnabled: boolean;
    position?: OverlayPosition;
    useLocalColors: boolean;
    backgroundColor?: string;
    scoreColor?: string;
    teamNameColor?: string;
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
    displayMode: 'scroll' | 'truncate' | 'multiline';
    quickMessages: string[];
  };
  template: 'sportif' | 'elegant' | 'minimal';
  presets: OverlayPreset[];
}

// Constantes (identiques au Pi)
const SPORT_PERIOD_DURATIONS: Record<SportType, number> = {
  football: 45,
  basketball: 10,
  handball: 30,
  volleyball: 25,
  rugby: 40,
  hockey: 20,
};

const SPORT_PERIODS: Record<SportType, string[]> = {
  football: ['1ère mi-temps', '2ème mi-temps', 'Prolongations', 'Tirs au but'],
  basketball: ['1er quart', '2ème quart', '3ème quart', '4ème quart', 'Prolongation'],
  handball: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  volleyball: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
  rugby: ['1ère mi-temps', '2ème mi-temps', 'Prolongations'],
  hockey: ['1ère période', '2ème période', '3ème période', 'Prolongation', 'Tirs au but'],
};

const SPORT_LABELS: Record<SportType, string> = {
  football: 'Football',
  basketball: 'Basketball',
  handball: 'Handball',
  volleyball: 'Volleyball',
  rugby: 'Rugby',
  hockey: 'Hockey',
};

const DEFAULT_GOAL_SOUNDS: Record<SportType, string> = {
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
    homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
    awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
    period: '1ère mi-temps',
    periodIndex: 0,
  },
  overlay: {
    scoreEnabled: false,
    position: undefined,
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

type ViewType = 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos' | 'options';

@Component({
  selector: 'app-cloud-remote',
  standalone: true,
  imports: [CommonModule, FormsModule, LicenseBannerComponent, LicenseBlockRemoteComponent],
  templateUrl: './cloud-remote.component.html',
  styleUrls: ['./cloud-remote.component.scss']
})
export class CloudRemoteComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly remoteService = inject(RemoteService);
  private readonly destroy$ = new Subject<void>();
  private readonly scoreUpdate$ = new Subject<void>();

  public siteId: string = '';
  public siteName: string = '';
  public clubName: string = '';
  public isConnected = false;
  public connectionError: string | null = null;

  public configuration!: Configuration;

  // Options locales (stockées dans localStorage du navigateur)
  public localOptions: LocalOptions = this.loadLocalOptions();
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];
  public isReloading = false;

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Recherche
  public searchQuery = '';
  public readonly searchPlaceholder = 'Rechercher une vid\u00e9o...';
  public searchResults: Video[] = [];
  public isSearching = false;

  // Affluence et match info
  public showMatchModal = false;
  public matchInfo = {
    date: new Date().toISOString().split('T')[0],
    matchName: '',
    audienceEstimate: 150
  };
  public currentSessionId: string | null = null;

  // Score en live + Options avancées
  public liveScoreEnabled = false;
  public isScorePanelExpanded = false;
  public currentScore = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0
  };

  // Phase active de la boucle vidéo
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  public readonly matchPhases: ('before' | 'during' | 'after')[] = ['before', 'during', 'after'];
  public isPhaseDropdownOpen = false;

  // Toast notification
  public showToast = false;
  public toastMessage = '';
  public toastType: 'success' | 'info' = 'success';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Video en cours de lecture
  public playingVideoPath: string | null = null;

  // Vidéos récemment lancées
  public recentVideos: Video[] = [];
  private readonly MAX_RECENT_VIDEOS = 5;

  // Loading state
  public isLoading = true;

  // PIN
  public pinRequired = false;
  public pinInput = '';
  public pinError = '';
  public pinVerifying = false;
  public pinAttemptsRemaining: number | null = null;

  // Dark mode
  public isDarkMode = false;

  // License
  public licenseState: LicenseState | null = null;
  public isLicenseBlocked = false;
  public hasLicenseWarning = false;
  public licenseBannerDismissed = false;

  // Recording
  public isRecording = false;

  // Menu header
  public isHeaderMenuOpen = false;

  // Sports et Périodes
  public readonly sportTypes: SportType[] = ['football', 'basketball', 'handball', 'volleyball', 'rugby', 'hockey'];
  public readonly sportLabels = SPORT_LABELS;
  public readonly sportPeriods = SPORT_PERIODS;
  public readonly sportPeriodDurations = SPORT_PERIOD_DURATIONS;

  // Positions overlay (9 positions)
  public readonly overlayPositions: { value: OverlayPosition; label: string }[] = [
    { value: 'top-left', label: 'Haut gauche' },
    { value: 'top-center', label: 'Haut centre' },
    { value: 'top-right', label: 'Haut droite' },
    { value: 'middle-left', label: 'Milieu gauche' },
    { value: 'middle-center', label: 'Centre' },
    { value: 'middle-right', label: 'Milieu droite' },
    { value: 'bottom-left', label: 'Bas gauche' },
    { value: 'bottom-center', label: 'Bas centre' },
    { value: 'bottom-right', label: 'Bas droite' },
  ];

  // Styles d'animation de but
  public readonly goalAnimationStyles: { value: 'popup' | 'fullscreen' | 'slide'; label: string }[] = [
    { value: 'popup', label: 'Popup central' },
    { value: 'fullscreen', label: 'Plein écran' },
    { value: 'slide', label: 'Bandeau glissant' },
  ];

  // Présets
  public showPresetModal = false;
  public newPresetName = '';

  // Swipe gesture tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly SWIPE_THRESHOLD = 50;

  // Exposer Math pour le template
  public Math = Math;

  // Organisation par temps de match
  private readonly defaultTimeCategories: TimeCategory[] = [
    {
      id: 'before',
      name: 'Avant-match',
      icon: '🏁',
      color: 'from-blue-500 to-blue-600',
      description: 'Échauffement & présentation',
      categoryIds: []
    },
    {
      id: 'during',
      name: 'Match',
      icon: '▶️',
      color: 'from-green-500 to-green-600',
      description: 'Live & animations',
      categoryIds: []
    },
    {
      id: 'after',
      name: 'Après-match',
      icon: '🏆',
      color: 'from-purple-500 to-purple-600',
      description: 'Résultats & remerciements',
      categoryIds: []
    }
  ];

  public timeCategories: TimeCategory[] = [];

  // Breaking News
  public showBreakingNewsPanel = false;
  public breakingNewsMessage = '';

  // Timer / Chronomètre
  public timerCurrentTime = 0;
  public timerIsRunning = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // Durées disponibles
  public readonly halfDurations = [15, 20, 25, 30, 35, 40, 45];
  public readonly newsDurations = [5, 10, 15, 20, 30];

  ngOnInit(): void {
    // Charger le dark mode depuis localStorage
    this.isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyDarkMode();

    // Charger les vidéos récentes depuis localStorage
    this.loadRecentVideos();

    // Initialiser le timer
    this.initializeTimer();

    // Récupérer le siteId depuis la route
    this.siteId = this.route.snapshot.paramMap.get('siteId') || '';

    // Debounce score updates (500ms) pour éviter les rafales de requêtes HTTP
    this.scoreUpdate$.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => this.sendScoreUpdate());

    if (this.siteId) {
      this.loadSiteState();
      // Polling pour garder l'état synchronisé (toutes les 60 secondes)
      interval(60000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.refreshState());
    } else {
      this.connectionError = 'Site ID manquant dans l\'URL';
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // ============================================================================
  // CHARGEMENT ET CONNEXION
  // ============================================================================

  private loadSiteState(): void {
    this.isLoading = true;
    this.connectionError = null;

    this.remoteService.getState(this.siteId).subscribe({
      next: (state: RemoteState) => {
        this.siteName = state.siteName;
        this.clubName = state.clubName;
        this.isConnected = state.isConnected && state.connectionHealth?.isHealthy;

        if (!this.isConnected) {
          this.connectionError = 'Le boîtier n\'est pas connecté au cloud. Vérifiez sa connexion Internet.';
          this.isLoading = false;
          return;
        }

        // Vérifier si un PIN est requis
        if (state.pinRequired && !state.config) {
          this.pinRequired = true;
          this.isLoading = false;
          return;
        }

        // PIN ok ou pas de PIN → charger normalement
        this.pinRequired = false;
        this.configuration = {
          remote: { title: state.siteName },
          categories: state.config?.categories || [],
          sponsors: state.config?.sponsors || [],
          timeCategories: state.config?.timeCategories || [],
          liveScoreEnabled: state.config?.liveScoreEnabled || false,
        };

        this.initializeWithConfiguration(this.configuration);
        this.updateLicenseState(state);
        this.updateRecordingState(state);
        this.isLoading = false;
      },
      error: (err) => {
        this.connectionError = err.error?.error || 'Impossible de charger l\'état du site';
        this.isLoading = false;
      }
    });
  }

  public retryConnection(): void {
    this.loadSiteState();
  }

  /**
   * Vérifie le PIN saisi par l'utilisateur
   */
  public submitPin(): void {
    if (!this.pinInput || this.pinInput.length < 4) {
      this.pinError = 'Le PIN doit contenir au moins 4 chiffres';
      return;
    }

    this.pinVerifying = true;
    this.pinError = '';

    this.remoteService.verifyPin(this.siteId, this.pinInput).subscribe({
      next: () => {
        // PIN vérifié avec succès → recharger l'état complet
        this.pinRequired = false;
        this.pinInput = '';
        this.pinError = '';
        this.pinVerifying = false;
        this.pinAttemptsRemaining = null;
        this.loadSiteState();
      },
      error: (err: { status: number; error?: { message?: string; attemptsRemaining?: number } }) => {
        this.pinVerifying = false;
        this.pinInput = '';
        if (err.status === 429) {
          this.pinError = err.error?.message || 'Trop de tentatives. Réessayez plus tard.';
        } else {
          this.pinError = err.error?.message || 'PIN incorrect';
          this.pinAttemptsRemaining = err.error?.attemptsRemaining ?? null;
        }
      }
    });
  }

  /**
   * Gestion de la saisie du PIN (numpad)
   */
  public onPinDigit(digit: string): void {
    if (this.pinInput.length < 6) {
      this.pinInput += digit;
      this.pinError = '';
    }
  }

  public onPinBackspace(): void {
    this.pinInput = this.pinInput.slice(0, -1);
    this.pinError = '';
  }

  public onPinClear(): void {
    this.pinInput = '';
    this.pinError = '';
  }

  private refreshState(): void {
    if (!this.siteId) return;

    this.remoteService.getState(this.siteId).subscribe({
      next: (state: RemoteState) => {
        this.isConnected = state.isConnected && state.connectionHealth?.isHealthy;

        // Si PIN requis à nouveau (token expiré)
        if (state.pinRequired && !state.config) {
          this.remoteService.clearToken(this.siteId);
          this.pinRequired = true;
          return;
        }

        if (!this.isConnected && !this.connectionError) {
          this.displayToast('Connexion perdue avec le boîtier', 'info');
        } else if (this.isConnected && this.connectionError) {
          this.displayToast('Connexion rétablie', 'success');
          this.connectionError = null;
        }

        if (state.config) {
          this.configuration = {
            remote: { title: state.siteName },
            categories: state.config.categories || [],
            sponsors: state.config.sponsors || [],
            timeCategories: state.config.timeCategories || [],
            liveScoreEnabled: state.config.liveScoreEnabled || false,
          };
        }

        this.updateLicenseState(state);
        this.updateRecordingState(state);
      },
      error: () => {
        // Silencieux pour le polling
      }
    });
  }

  private initializeWithConfiguration(config: Configuration): void {
    this.configuration = config;
    this.timeCategories = config.timeCategories?.length
      ? config.timeCategories
      : this.defaultTimeCategories;
    this.liveScoreEnabled = config.liveScoreEnabled ?? false;
  }

  // ============================================================================
  // LICENSE & RECORDING
  // ============================================================================

  private updateLicenseState(state: RemoteState): void {
    if (state.licenseStatus) {
      this.licenseState = {
        status: state.licenseStatus.status as LicenseStatus,
        reason: state.licenseStatus.reason,
        daysLeft: state.licenseStatus.daysLeft,
        daysExpired: state.licenseStatus.daysExpired,
        messageRemote: state.licenseStatus.messageRemote,
        subscriptionEnd: state.licenseStatus.subscriptionEnd,
        subscriptionPlan: state.licenseStatus.subscriptionPlan,
        canAutoUnblock: state.licenseStatus.canAutoUnblock,
        needsConnection: state.licenseStatus.needsConnection,
        daysSinceCheck: state.licenseStatus.daysSinceCheck,
      };
      this.isLicenseBlocked = this.licenseState.status === 'BLOCKED';
      this.hasLicenseWarning = ['WARNING', 'GRACE_PERIOD', 'CONNECTION_WARNING'].includes(this.licenseState.status);
    } else {
      this.licenseState = null;
      this.isLicenseBlocked = false;
      this.hasLicenseWarning = false;
    }
  }

  private updateRecordingState(state: RemoteState): void {
    if (state.recordingState) {
      this.isRecording = state.recordingState.isRecording;
    }
  }

  public toggleRecording(): void {
    if (!this.siteId || !this.isConnected) return;
    this.remoteService.toggleRecording(this.siteId).subscribe({
      next: () => {
        this.isRecording = !this.isRecording;
        this.displayToast(
          this.isRecording ? 'Enregistrement démarré' : 'Enregistrement arrêté',
          'success'
        );
      },
      error: () => {
        this.displayToast('Erreur lors du toggle enregistrement', 'info');
      },
    });
  }

  public dismissLicenseBanner(): void {
    this.licenseBannerDismissed = true;
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  public handleBack(): void {
    if (this.isSearching) {
      this.clearSearch();
      return;
    }

    if (this.currentView === 'all-videos' || this.currentView === 'options') {
      this.currentView = 'home';
      this.breadcrumb = ['Télécommande'];
      return;
    }

    this.breadcrumb.pop();

    if (this.breadcrumb.length === 1) {
      this.currentView = 'home';
      this.selectedTimeCategory = null;
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 2) {
      this.currentView = 'time-categories';
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 3) {
      this.currentView = 'subcategories';
      this.selectedSubCategory = null;
    }
  }

  public selectTimeCategory(timeCategory: TimeCategory): void {
    this.selectedTimeCategory = timeCategory;
    this.breadcrumb.push(timeCategory.name);
    this.currentView = 'time-categories';
  }

  public selectCategory(category: Category): void {
    this.selectedCategory = category;
    this.breadcrumb.push(category.name);

    if (category.subCategories && category.subCategories.length > 0) {
      this.currentView = 'subcategories';
    } else {
      this.currentView = 'videos';
    }
  }

  public selectSubCategory(subCategory: Category): void {
    this.selectedSubCategory = subCategory;
    this.breadcrumb.push(subCategory.name);
    this.currentView = 'videos';
  }

  // ============================================================================
  // ACTIONS VIDÉO (via HTTP API)
  // ============================================================================

  public launchSponsors(): void {
    this.remoteService.playSponsors(this.siteId).subscribe({
      next: () => {
        this.displayToast('Boucle sponsors lancée', 'success');
      },
      error: (err) => {
        this.displayToast('Erreur: ' + (err.error?.error || 'Échec de la commande'), 'info');
      }
    });
  }

  public launchVideo(video: Video): void {
    this.remoteService.playVideo(this.siteId, {
      name: video.name,
      path: video.path,
      categoryId: video.categoryId
    }).subscribe({
      next: () => {
        this.addToRecentVideos(video);
        this.playingVideoPath = video.path;
        this.displayToast(`${video.name} lancée sur l'écran`, 'success');

        setTimeout(() => {
          this.playingVideoPath = null;
        }, 3000);
      },
      error: (err) => {
        this.displayToast('Erreur: ' + (err.error?.error || 'Échec de la commande'), 'info');
      }
    });
  }

  // ============================================================================
  // TOAST
  // ============================================================================

  private displayToast(message: string, type: 'success' | 'info' = 'success'): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;

    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  public getVideoCategoryName(video: Video): string {
    if (!video.categoryId) return '';

    const findCategory = (categories: Category[]): string => {
      for (const cat of categories) {
        if (cat.id === video.categoryId) return cat.name;
        if (cat.subCategories) {
          const found = findCategory(cat.subCategories);
          if (found) return found;
        }
      }
      return '';
    };

    return findCategory(this.configuration?.categories || []);
  }

  public getCategoriesForTimeCategory(timeCategory: TimeCategory): Category[] {
    const filteredCategories = this.configuration.categories.filter(cat =>
      timeCategory.categoryIds?.includes(cat.id)
    );
    return this.sortByName(filteredCategories);
  }

  public getVideosCount(category: Category): number {
    let count = category.videos?.length || 0;
    if (category.subCategories) {
      count += category.subCategories.reduce((sum, sub) => {
        return sum + this.getVideosCount(sub);
      }, 0);
    }
    return count;
  }

  public getSubCategoriesCount(category: Category): number {
    return category.subCategories?.length || 0;
  }

  public getSubCategoriesForDisplay(category: Category): Category[] {
    return this.sortByName(category.subCategories ?? []);
  }

  public getCurrentVideos(): Video[] {
    const videos = this.selectedSubCategory?.videos ?? this.selectedCategory?.videos ?? [];
    return this.sortByName(videos);
  }

  public getTotalVideosForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => sum + this.getVideosCount(cat), 0);
  }

  public getTotalCategoriesForTimeCategory(timeCategory: TimeCategory): number {
    return this.getCategoriesForTimeCategory(timeCategory).length;
  }

  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  public reloadConfiguration(): void {
    if (this.isReloading) return;

    this.isReloading = true;
    this.isLoading = true;

    this.remoteService.getState(this.siteId).subscribe({
      next: (state: RemoteState) => {
        this.configuration = {
          remote: { title: state.siteName },
          categories: state.config?.categories || [],
          sponsors: state.config?.sponsors || [],
          timeCategories: state.config?.timeCategories || [],
          liveScoreEnabled: state.config?.liveScoreEnabled || false,
        };

        const enrichedConfig = this.enrichVideosWithCategoryId(this.configuration);
        this.initializeWithConfiguration(enrichedConfig);

        this.currentView = 'home';
        this.breadcrumb = ['Télécommande'];
        this.selectedTimeCategory = null;
        this.selectedCategory = null;
        this.selectedSubCategory = null;
        this.isReloading = false;
        this.isLoading = false;
        this.displayToast('Configuration mise à jour', 'success');
      },
      error: () => {
        this.isReloading = false;
        this.isLoading = false;
        this.displayToast('Erreur de chargement', 'info');
      }
    });
  }

  private enrichVideosWithCategoryId(config: Configuration): Configuration {
    const enrichCategory = (category: Category): Category => ({
      ...category,
      videos: category.videos?.map(video => ({
        ...video,
        categoryId: category.id
      })),
      subCategories: category.subCategories?.map(sub => enrichCategory(sub))
    });

    return {
      ...config,
      categories: config.categories?.map(cat => enrichCategory(cat)) || []
    };
  }

  // ============================================================================
  // RECHERCHE
  // ============================================================================

  public onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.clearSearch();
      return;
    }

    this.isSearching = true;
    const query = this.searchQuery.toLowerCase().trim();
    const filtered = this.getAllVideos().filter(video =>
      video.name.toLowerCase().includes(query)
    );
    this.searchResults = this.sortByName(filtered);
  }

  public clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
  }

  public getAllVideos(): Video[] {
    const videos: Video[] = [];

    const extractVideos = (category: Category) => {
      if (category.videos) {
        videos.push(...category.videos);
      }
      if (category.subCategories) {
        category.subCategories.forEach(sub => extractVideos(sub));
      }
    };

    this.configuration?.categories?.forEach(cat => extractVideos(cat));
    return this.sortByName(videos);
  }

  public showAllVideos(): void {
    this.currentView = 'all-videos';
    this.breadcrumb = ['Télécommande', 'Toutes les vidéos'];
  }

  public getTotalVideosCount(): number {
    return this.getAllVideos().length;
  }

  // ============================================================================
  // AFFLUENCE / MATCH INFO
  // ============================================================================

  public openMatchModal(): void {
    this.showMatchModal = true;
  }

  public closeMatchModal(): void {
    this.showMatchModal = false;
  }

  public saveMatchInfo(): void {
    this.currentSessionId = this.generateUUID();

    this.remoteService.configureMatch(this.siteId, {
      sessionId: this.currentSessionId,
      matchDate: this.matchInfo.date,
      matchName: this.matchInfo.matchName,
      audienceEstimate: this.matchInfo.audienceEstimate
    }).subscribe({
      next: () => {
        this.updateTeamNamesFromMatch();
        this.showMatchModal = false;
        this.displayToast('Configuration du match enregistrée', 'success');
      },
      error: () => {
        this.displayToast('Erreur lors de l\'enregistrement', 'info');
      }
    });
  }

  public incrementAudience(): void {
    this.matchInfo.audienceEstimate += 10;
  }

  public decrementAudience(): void {
    if (this.matchInfo.audienceEstimate >= 10) {
      this.matchInfo.audienceEstimate -= 10;
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================================================
  // SCORE EN LIVE
  // ============================================================================

  public incrementHomeScore(): void {
    this.currentScore.homeScore++;
    this.broadcastScore();
  }

  public decrementHomeScore(): void {
    if (this.currentScore.homeScore > 0) {
      this.currentScore.homeScore--;
      this.broadcastScore();
    }
  }

  public incrementAwayScore(): void {
    this.currentScore.awayScore++;
    this.broadcastScore();
  }

  public decrementAwayScore(): void {
    if (this.currentScore.awayScore > 0) {
      this.currentScore.awayScore--;
      this.broadcastScore();
    }
  }

  public updateTeamNamesFromMatch(): void {
    if (this.matchInfo.matchName && this.matchInfo.matchName.toLowerCase().includes('vs')) {
      const teams = this.matchInfo.matchName.split(/vs/i).map(t => t.trim());
      this.currentScore.homeTeam = teams[0] || 'DOMICILE';
      this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
      this.broadcastScore();
    }
  }

  public broadcastScore(): void {
    // Debounced : déclenche l'envoi HTTP après 500ms d'inactivité
    // Permet de cliquer rapidement +1 +1 +1 sans faire 3 requêtes
    this.scoreUpdate$.next();
  }

  private sendScoreUpdate(): void {
    const scoreData = {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: this.currentScore.homeScore,
      awayScore: this.currentScore.awayScore,
      period: this.localOptions.match.period
    };

    this.remoteService.updateScore(this.siteId, scoreData).subscribe({
      next: () => {
        // Score envoyé silencieusement
      },
      error: () => {
        // Silencieux - le score sera renvoyé au prochain update
      }
    });
  }

  public resetScore(): void {
    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;

    this.remoteService.resetScore(this.siteId).subscribe({
      next: () => {
        this.displayToast('Score réinitialisé', 'success');
      },
      error: () => {
        this.displayToast('Erreur lors de la réinitialisation', 'info');
      }
    });
  }

  public toggleScorePanel(): void {
    this.isScorePanelExpanded = !this.isScorePanelExpanded;
  }

  // ============================================================================
  // PHASE DE BOUCLE VIDÉO
  // ============================================================================

  public switchPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.activePhase = phase;

    this.remoteService.changePhase(this.siteId, phase).subscribe({
      next: () => {
        this.displayToast(`Phase: ${this.getPhaseLabel(phase)}`, 'success');
      },
      error: () => {
        this.displayToast('Erreur lors du changement de phase', 'info');
      }
    });
  }

  public togglePhaseDropdown(): void {
    this.isPhaseDropdownOpen = !this.isPhaseDropdownOpen;
  }

  public selectPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.switchPhase(phase);
    this.isPhaseDropdownOpen = false;
  }

  public getPhaseLabel(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const labels: Record<string, string> = {
      'neutral': 'Boucle par défaut',
      'before': 'Avant-match',
      'during': 'Match',
      'after': 'Après-match'
    };
    return labels[phase] || phase;
  }

  public getPhaseIcon(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const icons: Record<string, string> = {
      'neutral': '🔄',
      'before': '🏁',
      'during': '▶️',
      'after': '🏆'
    };
    return icons[phase] || '🔄';
  }

  public hasLoopForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): boolean {
    if (phase === 'neutral') {
      return (this.configuration?.sponsors?.length || 0) > 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    return (timeCategory?.loopVideos?.length || 0) > 0;
  }

  public getLoopVideoCount(phase: 'neutral' | 'before' | 'during' | 'after'): number {
    if (phase === 'neutral') {
      return this.configuration?.sponsors?.length || 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    if (timeCategory?.loopVideos?.length) {
      return timeCategory.loopVideos.length;
    }
    return this.configuration?.sponsors?.length || 0;
  }

  // ============================================================================
  // DARK MODE
  // ============================================================================

  public toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', String(this.isDarkMode));
    this.applyDarkMode();
  }

  private applyDarkMode(): void {
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  public toggleHeaderMenu(): void {
    this.isHeaderMenuOpen = !this.isHeaderMenuOpen;
  }

  public closeHeaderMenu(): void {
    this.isHeaderMenuOpen = false;
  }

  // ============================================================================
  // VIDÉOS RÉCENTES
  // ============================================================================

  private loadRecentVideos(): void {
    try {
      const stored = localStorage.getItem('cloudRemoteRecentVideos');
      if (stored) {
        this.recentVideos = JSON.parse(stored);
      }
    } catch {
      this.recentVideos = [];
    }
  }

  private addToRecentVideos(video: Video): void {
    this.recentVideos = this.recentVideos.filter(v => v.path !== video.path);
    this.recentVideos.unshift(video);
    this.recentVideos = this.recentVideos.slice(0, this.MAX_RECENT_VIDEOS);
    localStorage.setItem('cloudRemoteRecentVideos', JSON.stringify(this.recentVideos));
  }

  // ============================================================================
  // SWIPE GESTURES
  // ============================================================================

  public onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  public onTouchEnd(event: TouchEvent): void {
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        this.onSwipeRight();
      }
    }
  }

  private onSwipeRight(): void {
    if (this.currentView === 'home' && !this.isSearching) {
      return;
    }
    this.handleBack();
  }

  // ============================================================================
  // THUMBNAILS (pas disponibles en cloud - fallback)
  // ============================================================================

  public getVideoThumbnailUrl(_video: Video): string | null {
    // En mode cloud, pas de thumbnails disponibles
    return null;
  }

  public onThumbnailError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const parent = img.parentElement;
      if (parent) {
        parent.classList.add('thumbnail-error');
      }
    }
  }

  // ============================================================================
  // OPTIONS LOCALES
  // ============================================================================

  public openOptions(): void {
    if (!this.liveScoreEnabled) {
      this.displayToast('Options non disponibles', 'info');
      this.closeHeaderMenu();
      return;
    }
    this.currentView = 'options';
    this.breadcrumb = ['Télécommande', 'Options'];
    this.closeHeaderMenu();
  }

  public updateOverlayOption(key: keyof LocalOptions['overlay'], value: boolean): void {
    this.localOptions.overlay[key] = value as never;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  public updateTimerOption<K extends keyof LocalOptions['timer']>(
    key: K,
    value: LocalOptions['timer'][K]
  ): void {
    this.localOptions.timer[key] = value;
    this.saveLocalOptions();
    this.broadcastOptions();

    if (key === 'countDown' || key === 'periodDuration' || key === 'integratedWithScore') {
      this.initializeTimer();
    }
  }

  public updateBreakingNewsOption<K extends keyof LocalOptions['breakingNews']>(
    key: K,
    value: LocalOptions['breakingNews'][K]
  ): void {
    this.localOptions.breakingNews[key] = value;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  public setTemplate(template: LocalOptions['template']): void {
    this.localOptions.template = template;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  public addQuickMessage(message: string): void {
    if (message.trim() && !this.localOptions.breakingNews.quickMessages.includes(message.trim())) {
      this.localOptions.breakingNews.quickMessages.push(message.trim());
      this.saveLocalOptions();
    }
  }

  public removeQuickMessage(index: number): void {
    this.localOptions.breakingNews.quickMessages.splice(index, 1);
    this.saveLocalOptions();
  }

  public resetOptions(): void {
    this.localOptions = JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
    this.saveLocalOptions();
    this.broadcastOptions();
    this.displayToast('Options réinitialisées', 'success');
  }

  private broadcastOptions(): void {
    // Les options sont stockées localement uniquement
    // En cloud, on pourrait les envoyer au serveur pour persistance
  }

  // ============================================================================
  // SPORT & PÉRIODES
  // ============================================================================

  public setSport(sport: SportType): void {
    const periods = SPORT_PERIODS[sport];
    const periodDuration = SPORT_PERIOD_DURATIONS[sport];

    this.localOptions.sport = sport;
    this.localOptions.match.period = periods[0];
    this.localOptions.match.periodIndex = 0;
    this.localOptions.timer.periodDuration = periodDuration;
    this.localOptions.goalAnimation.soundUrl = DEFAULT_GOAL_SOUNDS[sport];

    this.saveLocalOptions();
    this.broadcastOptions();
    this.displayToast(`Sport: ${SPORT_LABELS[sport]}`, 'success');
  }

  public setPeriod(periodIndex: number): void {
    const periods = this.getAvailablePeriods();
    if (periodIndex >= 0 && periodIndex < periods.length) {
      this.localOptions.match.period = periods[periodIndex];
      this.localOptions.match.periodIndex = periodIndex;
      this.saveLocalOptions();
      this.broadcastScore();
      this.displayToast(`Période: ${this.localOptions.match.period}`, 'success');
    }
  }

  public nextPeriod(): void {
    const periods = this.getAvailablePeriods();
    const nextIndex = (this.localOptions.match.periodIndex + 1) % periods.length;
    this.setPeriod(nextIndex);
  }

  public getAvailablePeriods(): string[] {
    return SPORT_PERIODS[this.localOptions.sport] || SPORT_PERIODS.football;
  }

  // ============================================================================
  // ÉQUIPES & LOGOS
  // ============================================================================

  public updateHomeTeamName(name: string): void {
    this.localOptions.match.homeTeam.name = name;
    this.currentScore.homeTeam = name;
    this.saveLocalOptions();
    this.broadcastScore();
  }

  public updateAwayTeamName(name: string): void {
    this.localOptions.match.awayTeam.name = name;
    this.currentScore.awayTeam = name;
    this.saveLocalOptions();
    this.broadcastScore();
  }

  public onLogoUpload(event: Event, team: 'home' | 'away'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.displayToast('Veuillez sélectionner une image', 'info');
      return;
    }

    if (file.size > 500 * 1024) {
      this.displayToast('Image trop volumineuse (max 500KB)', 'info');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (team === 'home') {
        this.localOptions.match.homeTeam.logo = base64;
      } else {
        this.localOptions.match.awayTeam.logo = base64;
      }
      this.saveLocalOptions();
      this.broadcastScore();
      this.displayToast('Logo mis à jour', 'success');
    };
    reader.readAsDataURL(file);
  }

  public clearTeamLogo(team: 'home' | 'away'): void {
    if (team === 'home') {
      this.localOptions.match.homeTeam.logo = undefined;
    } else {
      this.localOptions.match.awayTeam.logo = undefined;
    }
    this.saveLocalOptions();
    this.broadcastScore();
    this.displayToast('Logo supprimé', 'success');
  }

  public startNewMatch(): void {
    this.localOptions.match = {
      homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
      awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
      period: SPORT_PERIODS[this.localOptions.sport][0],
      periodIndex: 0,
    };
    this.currentScore = {
      homeTeam: this.localOptions.match.homeTeam.name,
      awayTeam: this.localOptions.match.awayTeam.name,
      homeScore: 0,
      awayScore: 0
    };
    this.resetTimer();
    this.saveLocalOptions();
    this.broadcastScore();
    this.displayToast('Nouveau match préparé', 'success');
  }

  // ============================================================================
  // ANIMATION DE BUT
  // ============================================================================

  public updateGoalAnimationOption<K extends keyof LocalOptions['goalAnimation']>(
    key: K,
    value: LocalOptions['goalAnimation'][K]
  ): void {
    this.localOptions.goalAnimation[key] = value;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  // ============================================================================
  // POSITION OVERLAY
  // ============================================================================

  public setOverlayPosition(position: OverlayPosition | undefined): void {
    this.localOptions.overlay.position = position;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  public toggleLocalColors(useLocal: boolean): void {
    this.localOptions.overlay.useLocalColors = useLocal;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  public setLocalColor(colorType: 'backgroundColor' | 'scoreColor' | 'teamNameColor', color: string): void {
    this.localOptions.overlay[colorType] = color;
    this.saveLocalOptions();
    this.broadcastOptions();
  }

  // ============================================================================
  // PRESETS
  // ============================================================================

  public openPresetModal(): void {
    this.showPresetModal = true;
    this.newPresetName = '';
  }

  public closePresetModal(): void {
    this.showPresetModal = false;
    this.newPresetName = '';
  }

  public savePreset(): void {
    if (!this.newPresetName.trim()) {
      this.displayToast('Veuillez entrer un nom', 'info');
      return;
    }

    const preset: OverlayPreset = {
      id: 'preset_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
      name: this.newPresetName.trim(),
      sport: this.localOptions.sport,
      position: this.localOptions.overlay.position || 'top-right',
      template: this.localOptions.template,
      backgroundColor: this.localOptions.overlay.backgroundColor,
      scoreColor: this.localOptions.overlay.scoreColor,
      teamNameColor: this.localOptions.overlay.teamNameColor,
      createdAt: Date.now(),
    };

    this.localOptions.presets.push(preset);
    this.saveLocalOptions();
    this.closePresetModal();
    this.displayToast('Preset sauvegardé', 'success');
  }

  public applyPreset(presetId: string): void {
    const preset = this.localOptions.presets.find(p => p.id === presetId);
    if (!preset) return;

    this.localOptions.sport = preset.sport;
    this.localOptions.template = preset.template;
    this.localOptions.overlay.position = preset.position;
    this.localOptions.overlay.useLocalColors = !!(preset.backgroundColor || preset.scoreColor || preset.teamNameColor);
    this.localOptions.overlay.backgroundColor = preset.backgroundColor;
    this.localOptions.overlay.scoreColor = preset.scoreColor;
    this.localOptions.overlay.teamNameColor = preset.teamNameColor;

    const periods = SPORT_PERIODS[preset.sport];
    this.localOptions.match.period = periods[0];
    this.localOptions.match.periodIndex = 0;
    this.localOptions.timer.periodDuration = SPORT_PERIOD_DURATIONS[preset.sport];

    this.saveLocalOptions();
    this.broadcastOptions();
    this.displayToast('Preset appliqué', 'success');
  }

  public deletePreset(presetId: string): void {
    this.localOptions.presets = this.localOptions.presets.filter(p => p.id !== presetId);
    this.saveLocalOptions();
    this.displayToast('Preset supprimé', 'success');
  }

  public getPresets(): OverlayPreset[] {
    return [...this.localOptions.presets];
  }

  // ============================================================================
  // BREAKING NEWS
  // ============================================================================

  public toggleBreakingNewsPanel(): void {
    if (!this.localOptions.breakingNews.enabled) {
      this.displayToast('Activez les annonces dans les Options', 'info');
      return;
    }
    this.showBreakingNewsPanel = !this.showBreakingNewsPanel;
  }

  public sendBreakingNews(message?: string): void {
    const text = message || this.breakingNewsMessage.trim();
    if (!text) return;

    const news = {
      message: text,
      duration: this.localOptions.breakingNews.defaultDuration,
      position: this.localOptions.breakingNews.position
    };

    this.remoteService.showBreakingNews(this.siteId, news).subscribe({
      next: () => {
        this.breakingNewsMessage = '';
        this.showBreakingNewsPanel = false;
        this.displayToast('Annonce envoyée', 'success');
      },
      error: () => {
        this.displayToast('Erreur lors de l\'envoi', 'info');
      }
    });
  }

  public sendQuickNews(message: string): void {
    this.sendBreakingNews(message);
  }

  // ============================================================================
  // TIMER CONTROLS
  // ============================================================================

  public toggleTimer(): void {
    if (this.timerIsRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  public startTimer(): void {
    if (this.timerIsRunning) return;

    this.timerIsRunning = true;

    this.remoteService.updateTimer(this.siteId, {
      action: 'start',
      time: this.timerCurrentTime
    }).subscribe();

    this.timerInterval = setInterval(() => {
      if (this.localOptions.timer.countDown) {
        if (this.timerCurrentTime > 0) {
          this.timerCurrentTime--;
        } else {
          this.pauseTimer();
          this.displayToast('Mi-temps terminée !', 'info');
        }
      } else {
        const maxTime = this.localOptions.timer.periodDuration * 60;
        if (this.timerCurrentTime < maxTime) {
          this.timerCurrentTime++;
        } else {
          this.pauseTimer();
          this.displayToast('Mi-temps terminée !', 'info');
        }
      }

      // Sync timer toutes les 30s au lieu de 5s pour réduire les requêtes HTTP
      if (this.timerCurrentTime % 30 === 0) {
        this.syncTimer();
      }
    }, 1000);

    this.displayToast('Chronomètre démarré', 'success');
  }

  public pauseTimer(): void {
    if (!this.timerIsRunning) return;

    this.timerIsRunning = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.remoteService.updateTimer(this.siteId, {
      action: 'pause',
      time: this.timerCurrentTime
    }).subscribe();

    this.displayToast('Chronomètre en pause', 'info');
  }

  public resetTimer(): void {
    this.pauseTimer();

    if (this.localOptions.timer.countDown) {
      this.timerCurrentTime = this.localOptions.timer.periodDuration * 60;
    } else {
      this.timerCurrentTime = 0;
    }

    this.remoteService.updateTimer(this.siteId, {
      action: 'reset',
      time: this.timerCurrentTime
    }).subscribe();

    this.displayToast('Chronomètre réinitialisé', 'success');
  }

  private syncTimer(): void {
    this.remoteService.updateTimer(this.siteId, {
      action: 'sync',
      time: this.timerCurrentTime
    }).subscribe();
  }

  public formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  public getDisplayTime(): string {
    return this.formatTime(this.timerCurrentTime);
  }

  private initializeTimer(): void {
    if (this.localOptions.timer.countDown) {
      this.timerCurrentTime = this.localOptions.timer.periodDuration * 60;
    } else {
      this.timerCurrentTime = 0;
    }
  }

  // ============================================================================
  // LOCAL OPTIONS STORAGE
  // ============================================================================

  private loadLocalOptions(): LocalOptions {
    try {
      const stored = localStorage.getItem('cloudRemoteOptions');
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.deepMerge(DEFAULT_OPTIONS, parsed);
      }
    } catch {
      // Options par défaut si le localStorage est corrompu
    }
    return JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
  }

  private saveLocalOptions(): void {
    try {
      localStorage.setItem('cloudRemoteOptions', JSON.stringify(this.localOptions));
    } catch {
      // Silencieux - localStorage peut être désactivé
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
