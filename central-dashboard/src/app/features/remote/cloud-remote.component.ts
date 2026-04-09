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
import { PlayerStatusComponent, PlayerState } from './components/player-status/player-status.component';
import { ScreenshotViewerComponent } from './components/screenshot-viewer/screenshot-viewer.component';
import { RemoteScoreService } from './services/remote-score.service';
import { RemoteTimerService, TimerConfig } from './services/remote-timer.service';
import {
  RemoteOptionsService, LocalOptions, SportType, OverlayTheme, ScoreOverlayPosition,
  SPORT_LABELS, SPORT_PERIODS, SPORT_PERIOD_DURATIONS, DEFAULT_GOAL_SOUNDS,
} from './services/remote-options.service';

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
  hasSecondaryVariant?: boolean;
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

// LocalOptions, constants, and types imported from RemoteOptionsService

type ViewType = 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos' | 'options';

@Component({
  selector: 'app-cloud-remote',
  standalone: true,
  imports: [CommonModule, FormsModule, LicenseBannerComponent, LicenseBlockRemoteComponent, PlayerStatusComponent, ScreenshotViewerComponent],
  providers: [RemoteScoreService, RemoteTimerService, RemoteOptionsService],
  templateUrl: './cloud-remote.component.html',
  styleUrls: ['./cloud-remote.component.scss']
})
export class CloudRemoteComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly remoteService = inject(RemoteService);
  readonly scoreService = inject(RemoteScoreService);
  readonly timerService = inject(RemoteTimerService);
  readonly optionsService = inject(RemoteOptionsService);
  private readonly destroy$ = new Subject<void>();

  public siteId: string = '';
  public siteName: string = '';
  public clubName: string = '';
  public isConnected = false;
  public connectionError: string | null = null;
  public pendingConfigVersionId: string | null = null;
  public pendingCommandsCount = 0;

  public configuration!: Configuration;
  private secondaryVariantPaths: Set<string> = new Set();

  // Options locales delegated to RemoteOptionsService
  public get localOptions(): LocalOptions { return this.optionsService.options; }
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
  public get currentScore() { return this.scoreService.currentScore; }

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

  // Player state (from heartbeat)
  public initialPlayerState: PlayerState | null = null;

  // Menu header
  public isHeaderMenuOpen = false;

  // Sports et Périodes
  public readonly sportTypes: SportType[] = ['football', 'basketball', 'handball', 'volleyball', 'rugby', 'hockey'];
  public readonly sportLabels = SPORT_LABELS;
  public readonly sportPeriods = SPORT_PERIODS;
  public readonly sportPeriodDurations = SPORT_PERIOD_DURATIONS;

  // Positions overlay (6 positions)
  public readonly overlayPositions: { value: ScoreOverlayPosition; label: string }[] = [
    { value: 'top-left', label: 'Haut gauche' },
    { value: 'top-center', label: 'Haut centre' },
    { value: 'top-right', label: 'Haut droite' },
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

  // Timer / Chronomètre delegated to RemoteTimerService
  public get timerCurrentTime() { return this.timerService.currentTime; }
  public get timerIsRunning() { return this.timerService.isRunning; }

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
    this.timerService.initialize(this.localOptions.timer);
    this.timerService.onPeriodEnd = () => this.displayToast('Mi-temps terminée !', 'info');

    // Récupérer le siteId depuis la route
    this.siteId = this.route.snapshot.paramMap.get('siteId') || '';

    // Debounce score updates (500ms) pour éviter les rafales de requêtes HTTP
    this.scoreService.scoreUpdate$.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => this.scoreService.sendScoreUpdate(this.siteId, this.localOptions.match.period));

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
        this.pendingConfigVersionId = state.pendingConfigVersionId || null;
        this.pendingCommandsCount = state.pendingCommandsCount || 0;

        if (!this.isConnected) {
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
        this.secondaryVariantPaths = new Set(state.secondaryVariantPaths || []);
        this.configuration = {
          remote: { title: state.siteName },
          categories: state.config?.categories || [],
          sponsors: state.config?.sponsors || [],
          timeCategories: state.config?.timeCategories || [],
          liveScoreEnabled: state.config?.liveScoreEnabled || false,
        };

        this.initializeWithConfiguration(this.markSecondaryVariants(this.configuration));
        this.updateLicenseState(state);
        this.updateRecordingState(state);
        this.initialPlayerState = state.playerState || null;
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
        this.pendingConfigVersionId = state.pendingConfigVersionId || null;
        this.pendingCommandsCount = state.pendingCommandsCount || 0;

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

        if (state.playerState) {
          this.initialPlayerState = state.playerState;
        }
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
    const filteredCategories = (this.configuration?.categories ?? []).filter(cat =>
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
        this.secondaryVariantPaths = new Set(state.secondaryVariantPaths || []);
        this.configuration = {
          remote: { title: state.siteName },
          categories: state.config?.categories || [],
          sponsors: state.config?.sponsors || [],
          timeCategories: state.config?.timeCategories || [],
          liveScoreEnabled: state.config?.liveScoreEnabled || false,
        };

        const enrichedConfig = this.enrichVideosWithCategoryId(this.markSecondaryVariants(this.configuration));
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

  /**
   * Marque les vidéos ayant une variante secondaire (📺) pour affichage dans la télécommande.
   */
  private markSecondaryVariants(config: Configuration): Configuration {
    if (this.secondaryVariantPaths.size === 0) return config;

    const markVideo = (video: Video): Video =>
      this.secondaryVariantPaths.has(video.path)
        ? { ...video, hasSecondaryVariant: true }
        : video;

    const markCategory = (cat: Category): Category => ({
      ...cat,
      videos: cat.videos?.map(markVideo),
      subCategories: cat.subCategories?.map(markCategory),
    });

    return {
      ...config,
      sponsors: config.sponsors?.map(markVideo) || [],
      categories: config.categories?.map(markCategory) || [],
      timeCategories: config.timeCategories?.map(tc => ({
        ...tc,
        loopVideos: tc.loopVideos?.map(markVideo),
      })) || [],
    };
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

  public incrementHomeScore(): void { this.scoreService.incrementHomeScore(); }
  public decrementHomeScore(): void { this.scoreService.decrementHomeScore(); }
  public incrementAwayScore(): void { this.scoreService.incrementAwayScore(); }
  public decrementAwayScore(): void { this.scoreService.decrementAwayScore(); }

  public updateTeamNamesFromMatch(): void {
    this.scoreService.updateTeamNamesFromMatch(this.matchInfo.matchName);
  }

  public broadcastScore(): void { this.scoreService.scoreUpdate$.next(); }

  public resetScore(): void {
    const { success, error } = this.scoreService.resetScore(this.siteId);
    success.subscribe(() => this.displayToast('Score réinitialisé', 'success'));
    error.subscribe(() => this.displayToast('Erreur lors de la réinitialisation', 'info'));
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
    this.optionsService.updateOverlayOption(key, value);
  }

  public updateTimerOption<K extends keyof LocalOptions['timer']>(key: K, value: LocalOptions['timer'][K]): void {
    this.optionsService.updateTimerOption(key, value);
    if (key === 'countDown' || key === 'periodDuration' || key === 'integratedWithScore') {
      this.timerService.initialize(this.localOptions.timer);
    }
  }

  public updateBreakingNewsOption<K extends keyof LocalOptions['breakingNews']>(key: K, value: LocalOptions['breakingNews'][K]): void {
    this.optionsService.updateBreakingNewsOption(key, value);
  }

  public setTemplate(template: LocalOptions['template']): void { this.optionsService.setTemplate(template); }
  public addQuickMessage(message: string): void { this.optionsService.addQuickMessage(message); }
  public removeQuickMessage(index: number): void { this.optionsService.removeQuickMessage(index); }

  public resetOptions(): void {
    this.optionsService.resetOptions();
    this.displayToast('Options réinitialisées', 'success');
  }

  // ============================================================================
  // SPORT & PÉRIODES
  // ============================================================================

  public setSport(sport: SportType): void {
    this.optionsService.setSport(sport);
    this.displayToast(`Sport: ${SPORT_LABELS[sport]}`, 'success');
  }

  public setPeriod(periodIndex: number): void {
    this.optionsService.setPeriod(periodIndex);
    this.broadcastScore();
    this.displayToast(`Période: ${this.localOptions.match.period}`, 'success');
  }

  public nextPeriod(): void { this.optionsService.nextPeriod(); this.broadcastScore(); }
  public getAvailablePeriods(): string[] { return this.optionsService.getAvailablePeriods(); }

  // ============================================================================
  // ÉQUIPES & LOGOS
  // ============================================================================

  public updateHomeTeamName(name: string): void {
    this.optionsService.updateHomeTeamName(name);
    this.currentScore.homeTeam = name;
    this.broadcastScore();
  }

  public updateAwayTeamName(name: string): void {
    this.optionsService.updateAwayTeamName(name);
    this.currentScore.awayTeam = name;
    this.broadcastScore();
  }

  public onLogoUpload(event: Event, team: 'home' | 'away'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.optionsService.onLogoUpload(input.files[0], team).then(
      () => { this.broadcastScore(); this.displayToast('Logo mis à jour', 'success'); },
      (err: Error) => this.displayToast(err.message, 'info')
    );
  }

  public clearTeamLogo(team: 'home' | 'away'): void {
    this.optionsService.clearTeamLogo(team);
    this.broadcastScore();
    this.displayToast('Logo supprimé', 'success');
  }

  public startNewMatch(): void {
    this.optionsService.resetForNewMatch();
    this.scoreService.resetForNewMatch(
      this.localOptions.match.homeTeam.name,
      this.localOptions.match.awayTeam.name
    );
    this.resetTimer();
    this.broadcastScore();
    this.displayToast('Nouveau match préparé', 'success');
  }

  // ============================================================================
  // ANIMATION DE BUT
  // ============================================================================

  public updateGoalAnimationOption<K extends keyof LocalOptions['goalAnimation']>(key: K, value: LocalOptions['goalAnimation'][K]): void {
    this.optionsService.updateGoalAnimationOption(key, value);
  }

  public setOverlayPosition(position: ScoreOverlayPosition | undefined): void {
    this.optionsService.setOverlayPosition(position);
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

  public toggleTimer(): void { this.timerService.toggle(this.siteId, this.localOptions.timer); this.displayToast(this.timerIsRunning ? 'Chronomètre démarré' : 'Chronomètre en pause', this.timerIsRunning ? 'success' : 'info'); }
  public startTimer(): void { this.timerService.start(this.siteId, this.localOptions.timer); this.displayToast('Chronomètre démarré', 'success'); }
  public pauseTimer(): void { this.timerService.pause(this.siteId); this.displayToast('Chronomètre en pause', 'info'); }
  public resetTimer(): void { this.timerService.reset(this.siteId, this.localOptions.timer); this.displayToast('Chronomètre réinitialisé', 'success'); }
  public formatTime(seconds: number): string { return this.timerService.formatTime(seconds); }
  public getDisplayTime(): string { return this.timerService.getDisplayTime(); }

}
