import { Component, inject, NgZone, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Configuration, TimeCategory, SportType, ScoreOverlayPosition } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { Video } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { RecordingStateService } from '../../services/recording-state.service';
import { DemoConfigService } from '../../services/demo-config.service';
import { ProfileConfigService } from '../../services/profile-config.service';
import { SaasConfigService } from '../../services/saas-config.service';
import { LocalBroadcastService } from '../../services/local-broadcast.service';
import {
  LocalOptionsService,
  LocalOptions,
  SPORT_LABELS,
  SPORT_PERIODS,
  SPORT_PERIOD_DURATIONS
} from '../../services/local-options.service';
import { LicenseService, LicenseState } from '../../services/license.service';
import { ClubSelectorComponent, ClubInfo } from '../club-selector/club-selector.component';
import { LicenseBannerComponent } from '../license-banner/license-banner.component';
import { LicenseBlockRemoteComponent } from '../license-block-remote/license-block-remote.component';
import { RemoteScoreService } from './remote-score.service';
import { RemoteTimerService } from './remote-timer.service';

type ViewType = 'club-selector' | 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos' | 'options';

@Component({
  selector: 'app-remote',
  standalone: true,
  imports: [CommonModule, FormsModule, ClubSelectorComponent, LicenseBannerComponent, LicenseBlockRemoteComponent],
  templateUrl: './remote.component.html',
  styleUrl: './remote.component.scss',
  providers: [RemoteScoreService, RemoteTimerService],
})
export class RemoteComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly recordingState = inject(RecordingStateService);
  private readonly demoConfigService = inject(DemoConfigService);
  private readonly profileConfigService = inject(ProfileConfigService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly licenseService = inject(LicenseService);
  private readonly saasConfigService = inject(SaasConfigService);
  private readonly ngZone = inject(NgZone);
  public readonly scoreService = inject(RemoteScoreService);
  public readonly timerService = inject(RemoteTimerService);

  // Getters pour compatibilité template (évite de modifier 1800 lignes de HTML)
  public get currentScore() { return this.scoreService.currentScore; }
  public get timerIsRunning() { return this.timerService.isRunning; }

  private subscriptions: Subscription[] = [];

  // Licence
  public licenseState: LicenseState | null = null;
  public isLicenseBlocked = false;
  public hasLicenseWarning = false;

  public configuration!: Configuration;

  // Options locales
  public localOptions: LocalOptions = this.localOptionsService.getOptions();
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];
  public isDemoMode = false;
  public isMultiProfile = false;
  public currentProfileName: string | null = null;
  public isReloading = false;

  // Club-selector (mode demo ou multi-profil)
  public selectorClubs: ClubInfo[] = [];
  public selectorLoading = true;
  public selectorError: string | null = null;
  public selectorTitle = 'Mode Démo';
  public selectorSubtitle = 'Sélectionnez un club pour démarrer la présentation';

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Recherche
  public searchQuery = '';
  public searchResults: Video[] = [];
  public isSearching = false;

  // Match info
  public showMatchModal = false;
  public matchInfo = {
    date: new Date().toISOString().split('T')[0],
    matchName: '',
    audienceEstimate: 150
  };
  public currentSessionId: string | null = null;

  // Score (délégué à RemoteScoreService — accès via scoreService.currentScore)
  public liveScoreEnabled = false;
  public isScorePanelExpanded = false;

  // Phase
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  public readonly matchPhases: ('before' | 'during' | 'after')[] = ['before', 'during', 'after'];
  public isPhaseDropdownOpen = false;

  // Toast
  public showToast = false;
  public toastMessage = '';
  public toastType: 'success' | 'info' = 'success';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Vidéo en cours
  public playingVideoPath: string | null = null;

  // Vidéos récentes
  public recentVideos: Video[] = [];
  private readonly MAX_RECENT_VIDEOS = 5;

  // Analytics recording
  public isRecording = false;
  public showRecordingWarning = false;
  public warningSecondsRemaining = 0;

  public isLoading = false;
  public isDarkMode = false;
  public isHeaderMenuOpen = false;

  // Display multi-écran (PROP-002)
  public connectedDisplays: Array<{ index: number; type: string }> = [];
  public displayTarget: 'all' | number = 'all';

  // Sports & périodes
  public readonly sportTypes: SportType[] = ['football', 'basketball', 'handball', 'volleyball', 'rugby', 'hockey'];
  public readonly sportLabels = SPORT_LABELS;
  public readonly sportPeriods = SPORT_PERIODS;
  public readonly sportPeriodDurations = SPORT_PERIOD_DURATIONS;

  // Overlay
  public readonly overlayPositions: { value: ScoreOverlayPosition; label: string }[] = [
    { value: 'top-left', label: 'Haut gauche' },
    { value: 'top-center', label: 'Haut centre' },
    { value: 'top-right', label: 'Haut droite' },
    { value: 'bottom-left', label: 'Bas gauche' },
    { value: 'bottom-center', label: 'Bas centre' },
    { value: 'bottom-right', label: 'Bas droite' },
  ];

  public readonly goalAnimationStyles: { value: 'popup' | 'fullscreen' | 'slide'; label: string }[] = [
    { value: 'popup', label: 'Popup central' },
    { value: 'fullscreen', label: 'Plein écran' },
    { value: 'slide', label: 'Bandeau glissant' },
  ];

  // Swipe
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly SWIPE_THRESHOLD = 50;

  private readonly ADMIN_BASE_URL = '';
  private thumbnailCacheBuster = Date.now();

  public Math = Math;

  private readonly defaultTimeCategories: TimeCategory[] = [
    { id: 'before', name: 'Avant-match', icon: '🏁', color: 'from-blue-500 to-blue-600', description: 'Échauffement & présentation', categoryIds: [] },
    { id: 'during', name: 'Match', icon: '▶️', color: 'from-green-500 to-green-600', description: 'Live & animations', categoryIds: [] },
    { id: 'after', name: 'Après-match', icon: '🏆', color: 'from-purple-500 to-purple-600', description: 'Résultats & remerciements', categoryIds: [] }
  ];

  public timeCategories: TimeCategory[] = [];

  // Breaking news
  public showBreakingNewsPanel = false;
  public breakingNewsMessage = '';
  public readonly halfDurations = [15, 20, 25, 30, 35, 40, 45];
  public readonly newsDurations = [5, 10, 15, 20, 30];

  public ngOnInit(): void {
    this.subscriptions.push(
      this.licenseService.state$.subscribe((state) => {
        this.ngZone.run(() => {
          this.licenseState = state;
          this.isLicenseBlocked = state.status === 'BLOCKED';
          this.hasLicenseWarning = this.licenseService.hasWarning();
        });
      })
    );

    this.licenseState = this.licenseService.getCurrentState();
    this.isLicenseBlocked = this.licenseService.isBlocked();
    this.hasLicenseWarning = this.licenseService.hasWarning();

    this.subscriptions.push(
      this.recordingState.isRecording$.subscribe((recording) => {
        this.ngZone.run(() => { this.isRecording = recording; });
      })
    );

    this.subscriptions.push(
      this.recordingState.warning$.subscribe((warning) => {
        this.ngZone.run(() => {
          this.showRecordingWarning = warning.active;
          this.warningSecondsRemaining = warning.secondsRemaining;
        });
      })
    );

    this.subscriptions.push(
      this.recordingState.inactivityExpired$.subscribe(() => {
        this.ngZone.run(() => {
          if (this.activePhase !== 'neutral') {
            this.switchPhase('neutral');
          }
        });
      })
    );

    this.isDemoMode = this.demoConfigService.isDemoMode();
    this.isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyDarkMode();
    this.loadRecentVideos();
    this.timerService.initialize(this.localOptions.timer);
    this.timerService.onPeriodEnd = () => this.displayToast('Mi-temps terminée !', 'info');

    if (this.isDemoMode) {
      this.selectorTitle = 'Mode Démo';
      this.selectorSubtitle = 'Sélectionnez un club pour démarrer la présentation';
      this.demoConfigService.getAvailableClubs().subscribe({
        next: (clubs) => { this.selectorClubs = clubs; this.selectorLoading = false; },
        error: () => { this.selectorError = 'Impossible de charger la liste des clubs'; this.selectorLoading = false; }
      });
      this.currentView = 'club-selector';
    } else if (this.saasConfigService.isSaasMode()) {
      this.saasConfigService.getAvailableProfiles().subscribe(profiles => {
        if (profiles.length > 1) {
          this.isMultiProfile = true;
          this.selectorTitle = 'Sélection du profil';
          this.selectorSubtitle = 'Choisissez un profil de configuration';
          this.selectorClubs = profiles.map(p => ({
            id: p.id,
            name: p.displayName || p.name,
            city: p.city || '',
            sport: p.sport || '',
          }));
          this.selectorLoading = false;
          this.currentView = 'club-selector';
        } else {
          const data = this.route.snapshot.data['configuration'] as Configuration;
          this.initializeWithConfiguration(data);
        }
      });
    } else {
      this.profileConfigService.getAvailableProfiles().subscribe(profiles => {
        if (profiles.length > 1) {
          this.isMultiProfile = true;
          this.selectorTitle = 'Sélection du profil';
          this.selectorSubtitle = 'Choisissez un profil de configuration';
          this.selectorClubs = profiles;
          this.selectorLoading = false;
          this.currentView = 'club-selector';
        } else {
          const data = this.route.snapshot.data['configuration'] as Configuration;
          this.initializeWithConfiguration(data);
        }
      });
    }

    this.socketService.on('score-update', (scoreData: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }) => {
      this.ngZone.run(() => {
        this.scoreService.currentScore = {
          homeTeam: scoreData.homeTeam || this.scoreService.currentScore.homeTeam,
          awayTeam: scoreData.awayTeam || this.scoreService.currentScore.awayTeam,
          homeScore: scoreData.homeScore ?? this.scoreService.currentScore.homeScore,
          awayScore: scoreData.awayScore ?? this.scoreService.currentScore.awayScore,
        };
      });
    });

    this.socketService.on('phase-change', (data: { phase: 'neutral' | 'before' | 'during' | 'after' }) => {
      this.ngZone.run(() => { this.activePhase = data.phase; });
    });

    this.socketService.on('displays-changed', (data: { displays: Array<{ index: number; type: string }> }) => {
      this.ngZone.run(() => {
        this.connectedDisplays = data.displays || [];
        if (typeof this.displayTarget === 'number' && !this.connectedDisplays.some(d => d.index === this.displayTarget)) {
          this.displayTarget = 'all';
        }
      });
    });

    this.socketService.emit('request-state', {});
  }

  public ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // ============================================================================
  // INITIALISATION
  // ============================================================================

  public onClubSelected(club: ClubInfo): void {
    if (this.isDemoMode) {
      this.demoConfigService.loadClubConfiguration(club.id).subscribe({
        next: (config) => {
          this.currentProfileName = club.name;
          this.initializeWithConfiguration(config);
          this.currentView = 'home';
          this.socketService.emit('command', { type: 'reload-config', data: config });
        },
        error: (err) => { console.error('Erreur chargement config club demo:', err); }
      });
    } else if (this.saasConfigService.isSaasMode()) {
      const siteId = this.saasConfigService.getSiteId();
      this.saasConfigService.loadProfileConfiguration(siteId, club.id).subscribe({
        next: (config) => {
          this.currentProfileName = club.name;
          this.initializeWithConfiguration(config);
          this.currentView = 'home';
        },
        error: (err) => { console.error('Erreur chargement config profil SaaS:', err); }
      });
    } else {
      this.profileConfigService.loadProfileConfiguration(club.id).subscribe({
        next: (config) => {
          this.currentProfileName = club.name;
          this.initializeWithConfiguration(config);
          this.currentView = 'home';
          this.socketService.emit('profile-switch', { profileId: club.id });
        },
        error: (err) => { console.error('Erreur chargement config profil:', err); }
      });
    }
  }

  private initializeWithConfiguration(config: Configuration): void {
    this.configuration = config;
    this.timeCategories = this.configuration.timeCategories?.length
      ? this.configuration.timeCategories
      : this.defaultTimeCategories;
    this.liveScoreEnabled = config.liveScoreEnabled ?? false;
  }

  public getTimeCategoryGradientClass(timeCategory: TimeCategory): string {
    const knownPrefixes = ['from-blue-500', 'from-green-500', 'from-purple-500'];
    if (timeCategory.color && knownPrefixes.some(p => timeCategory.color.includes(p))) {
      return timeCategory.color;
    }
    switch (timeCategory.id) {
      case 'before': return 'from-blue-500 to-blue-600';
      case 'during': return 'from-green-500 to-green-600';
      case 'after': return 'from-purple-500 to-purple-600';
      default: return 'from-blue-500 to-blue-600';
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  public handleBack(): void {
    if (this.isSearching) { this.clearSearch(); return; }

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

  public backToClubSelector(): void {
    this.currentView = 'club-selector';
    this.breadcrumb = ['Télécommande'];
    this.selectedTimeCategory = null;
    this.selectedCategory = null;
    this.selectedSubCategory = null;
  }

  public selectTimeCategory(timeCategory: TimeCategory): void {
    this.selectedTimeCategory = timeCategory;
    this.breadcrumb.push(timeCategory.name);
    this.currentView = 'time-categories';
  }

  public selectCategory(category: Category): void {
    this.selectedCategory = category;
    this.breadcrumb.push(category.name);
    this.currentView = (category.subCategories && category.subCategories.length > 0) ? 'subcategories' : 'videos';
  }

  public selectSubCategory(subCategory: Category): void {
    this.selectedSubCategory = subCategory;
    this.breadcrumb.push(subCategory.name);
    this.currentView = 'videos';
  }

  // ============================================================================
  // DISPLAY TARGET (PROP-002)
  // ============================================================================

  private getCommandTarget(): number[] | undefined {
    return typeof this.displayTarget === 'number' ? [this.displayTarget] : undefined;
  }

  public setDisplayTarget(target: 'all' | number): void {
    this.displayTarget = target;
  }

  // ============================================================================
  // ACTIONS VIDÉO
  // ============================================================================

  public launchSponsors(): void {
    this.notifyUserActivity();
    const target = this.getCommandTarget();
    this.localBroadcast.emitCommand({ type: 'sponsors', ...(target ? { target } : {}) });
    this.socketService.emit('command', { type: 'sponsors', ...(target ? { target } : {}) });
  }

  public launchVideo(video: Video): void {
    this.notifyUserActivity();
    this.analyticsService.trackManualTrigger(video);
    const target = this.getCommandTarget();
    this.localBroadcast.emitCommand({ type: 'video', data: video, ...(target ? { target } : {}) });
    this.socketService.emit('command', { type: 'video', data: video, ...(target ? { target } : {}) });
    this.addToRecentVideos(video);
    this.playingVideoPath = video.path;
    this.displayToast(`${video.name} lancée sur l'écran`, 'success');
    setTimeout(() => { this.playingVideoPath = null; }, 3000);
  }

  // ============================================================================
  // TOAST
  // ============================================================================

  private displayToast(message: string, type: 'success' | 'info' = 'success'): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    this.toastTimeout = setTimeout(() => { this.showToast = false; }, 3000);
  }

  // ============================================================================
  // HELPERS CATÉGORIES & VIDÉOS
  // ============================================================================

  public getVideoCategoryName(video: Video): string {
    if (!video.categoryId) return '';
    const find = (categories: Category[]): string => {
      for (const cat of categories) {
        if (cat.id === video.categoryId) return cat.name;
        if (cat.subCategories) { const found = find(cat.subCategories); if (found) return found; }
      }
      return '';
    };
    return find(this.configuration?.categories || []);
  }

  public getCategoriesForTimeCategory(timeCategory: TimeCategory): Category[] {
    return this.sortByName(this.configuration.categories.filter(cat => timeCategory.categoryIds.includes(cat.id)));
  }

  public getVideosCount(category: Category): number {
    return (category.videos?.length || 0) + (category.subCategories?.reduce((sum, sub) => sum + this.getVideosCount(sub), 0) || 0);
  }

  public getSubCategoriesCount(category: Category): number {
    return category.subCategories?.length || 0;
  }

  public getSubCategoriesForDisplay(category: Category): Category[] {
    return this.sortByName(category.subCategories ?? []);
  }

  public getCurrentVideos(): Video[] {
    return this.sortByName(this.selectedSubCategory?.videos ?? this.selectedCategory?.videos ?? []);
  }

  public getTotalVideosForTimeCategory(timeCategory: TimeCategory): number {
    return this.getCategoriesForTimeCategory(timeCategory).reduce((sum, cat) => sum + this.getVideosCount(cat), 0);
  }

  public getTotalCategoriesForTimeCategory(timeCategory: TimeCategory): number {
    return this.getCategoriesForTimeCategory(timeCategory).length;
  }

  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  public reloadConfiguration(): void {
    if (this.isReloading || this.isDemoMode) return;
    this.isReloading = true;
    this.isLoading = true;
    const timestamp = Date.now();
    this.thumbnailCacheBuster = timestamp;
    this.http.get<Configuration>(`/configuration.json?t=${timestamp}`).subscribe({
      next: (config) => {
        this.initializeWithConfiguration(this.enrichVideosWithCategoryId(config));
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
    const enrich = (cat: Category): Category => ({
      ...cat,
      videos: cat.videos?.map(v => ({ ...v, categoryId: cat.id })),
      subCategories: cat.subCategories?.map(sub => enrich(sub))
    });
    return { ...config, categories: config.categories?.map(cat => enrich(cat)) || [] };
  }

  // ============================================================================
  // RECHERCHE
  // ============================================================================

  public onSearch(): void {
    if (!this.searchQuery.trim()) { this.clearSearch(); return; }
    this.isSearching = true;
    const query = this.searchQuery.toLowerCase().trim();
    this.searchResults = this.sortByName(this.getAllVideos().filter(v => v.name.toLowerCase().includes(query)));
  }

  public clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
  }

  public getAllVideos(): Video[] {
    const videos: Video[] = [];
    const extract = (cat: Category) => {
      if (cat.videos) videos.push(...cat.videos);
      cat.subCategories?.forEach(sub => extract(sub));
    };
    this.configuration?.categories?.forEach(cat => extract(cat));
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
  // MATCH MODAL
  // ============================================================================

  public openMatchModal(): void { this.showMatchModal = true; }
  public closeMatchModal(): void { this.showMatchModal = false; }

  public saveMatchInfo(): void {
    this.notifyUserActivity();
    this.currentSessionId = this.generateUUID();
    if (this.matchInfo.audienceEstimate > 0) {
      this.analyticsService.setAudienceEstimate(this.matchInfo.audienceEstimate);
    }
    this.socketService.emit('match-config', {
      sessionId: this.currentSessionId,
      matchDate: this.matchInfo.date,
      matchName: this.matchInfo.matchName,
      audienceEstimate: this.matchInfo.audienceEstimate
    });
    this.scoreService.updateTeamNamesFromMatch(this.matchInfo.matchName);
    this.showMatchModal = false;
  }

  public incrementAudience(): void { this.matchInfo.audienceEstimate += 10; }
  public decrementAudience(): void { if (this.matchInfo.audienceEstimate >= 10) this.matchInfo.audienceEstimate -= 10; }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ============================================================================
  // SCORE — délégué à RemoteScoreService
  // ============================================================================

  public incrementHomeScore(): void { this.notifyUserActivity(); this.scoreService.incrementHomeScore(); }
  public decrementHomeScore(): void { this.notifyUserActivity(); this.scoreService.decrementHomeScore(); }
  public incrementAwayScore(): void { this.notifyUserActivity(); this.scoreService.incrementAwayScore(); }
  public decrementAwayScore(): void { this.notifyUserActivity(); this.scoreService.decrementAwayScore(); }
  public resetScore(): void { this.scoreService.resetScore(); }
  public toggleScorePanel(): void { this.isScorePanelExpanded = !this.isScorePanelExpanded; }

  // ============================================================================
  // PHASE
  // ============================================================================

  public switchPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.activePhase = phase;
    this.notifyUserActivity();
    this.recordingState.onPhaseChange(phase);

    const periodMap: Record<string, 'pre_match' | 'halftime' | 'post_match' | 'loop'> = {
      before: 'pre_match', during: 'halftime', after: 'post_match', neutral: 'loop'
    };
    if (phase !== 'neutral') {
      this.analyticsService.setEventType('match');
      this.analyticsService.setPeriod(periodMap[phase]);
    } else {
      this.analyticsService.setEventType('other');
      this.analyticsService.setPeriod('loop');
    }

    this.localBroadcast.emitPhaseChange({ phase });
    this.socketService.emit('phase-change', { phase });
  }

  public togglePhaseDropdown(): void { this.isPhaseDropdownOpen = !this.isPhaseDropdownOpen; }
  public selectPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void { this.switchPhase(phase); this.isPhaseDropdownOpen = false; }

  public getPhaseLabel(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    return { neutral: 'Boucle par défaut', before: 'Avant-match', during: 'Match', after: 'Après-match' }[phase] || phase;
  }

  public getPhaseIcon(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    return { neutral: '🔄', before: '🏁', during: '▶️', after: '🏆' }[phase] || '🔄';
  }

  public hasLoopForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): boolean {
    if (phase === 'neutral') return (this.configuration?.sponsors?.length || 0) > 0;
    return (this.timeCategories.find(tc => tc.id === phase)?.loopVideos?.length || 0) > 0;
  }

  public getLoopVideoCount(phase: 'neutral' | 'before' | 'during' | 'after'): number {
    if (phase === 'neutral') return this.configuration?.sponsors?.length || 0;
    const tc = this.timeCategories.find(t => t.id === phase);
    return tc?.loopVideos?.length || this.configuration?.sponsors?.length || 0;
  }

  // ============================================================================
  // ANALYTICS RECORDING
  // ============================================================================

  public toggleRecording(): void { this.recordingState.toggleRecording(); }
  public extendRecording(): void { this.recordingState.extendRecording(); }
  public dismissRecordingWarning(): void { this.recordingState.stopRecording(true); }

  public formatWarningTime(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  private notifyUserActivity(): void { this.recordingState.resetInactivityTimer(); }

  // ============================================================================
  // DARK MODE & HEADER
  // ============================================================================

  public toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', String(this.isDarkMode));
    this.applyDarkMode();
  }

  private applyDarkMode(): void {
    document.body.classList.toggle('dark-mode', this.isDarkMode);
  }

  public toggleHeaderMenu(): void { this.isHeaderMenuOpen = !this.isHeaderMenuOpen; }
  public closeHeaderMenu(): void { this.isHeaderMenuOpen = false; }

  // ============================================================================
  // VIDÉOS RÉCENTES
  // ============================================================================

  private loadRecentVideos(): void {
    try {
      const stored = localStorage.getItem('recentVideos');
      if (stored) this.recentVideos = JSON.parse(stored);
    } catch { this.recentVideos = []; }
  }

  private addToRecentVideos(video: Video): void {
    this.recentVideos = this.recentVideos.filter(v => v.path !== video.path);
    this.recentVideos.unshift(video);
    this.recentVideos = this.recentVideos.slice(0, this.MAX_RECENT_VIDEOS);
    localStorage.setItem('recentVideos', JSON.stringify(this.recentVideos));
  }

  // ============================================================================
  // SWIPE GESTURES
  // ============================================================================

  public onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  public onTouchEnd(event: TouchEvent): void {
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const deltaY = event.changedTouches[0].clientY - this.touchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.SWIPE_THRESHOLD && deltaX > 0) {
      if (this.currentView !== 'home' || this.isSearching) this.handleBack();
    }
  }

  // ============================================================================
  // THUMBNAILS
  // ============================================================================

  public getVideoThumbnailUrl(video: Video): string | null {
    if (video.thumbnailUrl) return video.thumbnailUrl;
    if (!video.path || this.isDemoMode) return null;
    const thumbnailPath = video.path.replace(/^videos\//, 'thumbnails/').replace(/\.\w+$/, '.jpg');
    return `${this.ADMIN_BASE_URL}/${thumbnailPath}?t=${this.thumbnailCacheBuster}`;
  }

  public getVideoInitials(video: Video): string {
    if (!video.name) return '▶';
    const words = video.name.trim().split(/\s+/);
    return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : video.name.substring(0, 2).toUpperCase();
  }

  public getVideoPlaceholderColor(video: Video): string {
    const colors = ['placeholder-pink', 'placeholder-blue', 'placeholder-green', 'placeholder-purple', 'placeholder-orange', 'placeholder-teal'];
    let hash = 0;
    const name = video.name || video.path || '';
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  public onThumbnailError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) { img.style.display = 'none'; img.parentElement?.classList.add('thumbnail-error'); }
  }

  // ============================================================================
  // OPTIONS LOCALES
  // ============================================================================

  public openOptions(): void {
    if (!this.liveScoreEnabled) { this.displayToast('Options non disponibles', 'info'); this.closeHeaderMenu(); return; }
    this.currentView = 'options';
    this.breadcrumb = ['Télécommande', 'Options'];
    this.closeHeaderMenu();
  }

  public updateOverlayOption(key: keyof LocalOptions['overlay'], value: boolean): void {
    this.localOptionsService.updateOverlayOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
  }

  public updateTimerOption<K extends keyof LocalOptions['timer']>(key: K, value: LocalOptions['timer'][K]): void {
    this.localOptionsService.updateTimerOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
    if (key === 'countDown' || key === 'periodDuration' || key === 'integratedWithScore') {
      this.timerService.initialize(this.localOptions.timer);
    }
  }

  public updateBreakingNewsOption<K extends keyof LocalOptions['breakingNews']>(key: K, value: LocalOptions['breakingNews'][K]): void {
    this.localOptionsService.updateBreakingNewsOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
  }

  public setTemplate(template: LocalOptions['template']): void {
    this.localOptionsService.setTemplate(template);
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
  }

  public addQuickMessage(message: string): void {
    if (message.trim()) { this.localOptionsService.addQuickMessage(message); this.localOptions = this.localOptionsService.getOptions(); }
  }

  public removeQuickMessage(index: number): void {
    this.localOptionsService.removeQuickMessage(index);
    this.localOptions = this.localOptionsService.getOptions();
  }

  public resetOptions(): void {
    this.localOptionsService.resetToDefaults();
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
    this.displayToast('Options réinitialisées', 'success');
  }

  private broadcastOptions(): void {
    this.localBroadcast.broadcast('options-update', this.localOptions);
    this.socketService.emit('options-update', this.localOptions);
  }

  // ============================================================================
  // SPORT & PÉRIODES
  // ============================================================================

  public setSport(sport: SportType): void {
    this.localOptionsService.setSport(sport);
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
    this.displayToast(`Sport: ${SPORT_LABELS[sport]}`, 'success');
  }

  public setPeriod(periodIndex: number): void {
    this.localOptionsService.setPeriod(periodIndex);
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.broadcast();
    this.displayToast(`Période: ${this.localOptions.match.period}`, 'success');
  }

  public nextPeriod(): void {
    this.localOptionsService.nextPeriod();
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.broadcast();
    this.displayToast(`Période: ${this.localOptions.match.period}`, 'success');
  }

  public getAvailablePeriods(): string[] {
    return this.localOptionsService.getAvailablePeriods();
  }

  // ============================================================================
  // ÉQUIPES & LOGOS
  // ============================================================================

  public updateHomeTeamName(name: string): void {
    this.localOptionsService.updateHomeTeam({ name });
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.setHomeTeamName(name);
  }

  public updateAwayTeamName(name: string): void {
    this.localOptionsService.updateAwayTeam({ name });
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.setAwayTeamName(name);
  }

  public onLogoUpload(event: Event, team: 'home' | 'away'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) { this.displayToast('Veuillez sélectionner une image', 'info'); return; }
    if (file.size > 500 * 1024) { this.displayToast('Image trop volumineuse (max 500KB)', 'info'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.localOptionsService.setTeamLogo(team, e.target?.result as string);
      this.localOptions = this.localOptionsService.getOptions();
      this.scoreService.broadcast();
      this.displayToast('Logo mis à jour', 'success');
    };
    reader.readAsDataURL(file);
  }

  public clearTeamLogo(team: 'home' | 'away'): void {
    this.localOptionsService.setTeamLogo(team, undefined);
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.broadcast();
    this.displayToast('Logo supprimé', 'success');
  }

  public startNewMatch(): void {
    this.notifyUserActivity();
    this.localOptionsService.resetMatch();
    this.localOptions = this.localOptionsService.getOptions();
    this.scoreService.resetForNewMatch(this.localOptions.match.homeTeam.name, this.localOptions.match.awayTeam.name);
    this.timerService.reset(this.localOptions.timer);
    this.scoreService.broadcast();
    this.displayToast('Nouveau match préparé', 'success');
  }

  // ============================================================================
  // ANIMATION DE BUT & OVERLAY
  // ============================================================================

  public updateGoalAnimationOption<K extends keyof LocalOptions['goalAnimation']>(key: K, value: LocalOptions['goalAnimation'][K]): void {
    this.localOptionsService.updateGoalAnimation({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
  }

  public setOverlayPosition(position: ScoreOverlayPosition | undefined): void {
    this.localOptionsService.updateOverlayOptions({ position });
    this.localOptions = this.localOptionsService.getOptions();
    this.broadcastOptions();
  }

  // ============================================================================
  // BREAKING NEWS
  // ============================================================================

  public toggleBreakingNewsPanel(): void {
    if (!this.localOptions.breakingNews.enabled) { this.displayToast('Activez les annonces dans les Options', 'info'); return; }
    this.showBreakingNewsPanel = !this.showBreakingNewsPanel;
  }

  public sendBreakingNews(message?: string): void {
    this.notifyUserActivity();
    const text = message || this.breakingNewsMessage.trim();
    if (!text) return;
    const target = this.getCommandTarget();
    const news = {
      message: text,
      duration: this.localOptions.breakingNews.defaultDuration,
      position: this.localOptions.breakingNews.position,
      displayMode: this.localOptions.breakingNews.displayMode,
      ...(target ? { target } : {}),
    };
    this.localBroadcast.emitBreakingNews(news);
    this.socketService.emit('breaking-news', news);
    this.breakingNewsMessage = '';
    this.showBreakingNewsPanel = false;
    this.displayToast('Annonce envoyée', 'success');
  }

  public sendQuickNews(message: string): void { this.sendBreakingNews(message); }

  // ============================================================================
  // TIMER — délégué à RemoteTimerService
  // ============================================================================

  public toggleTimer(): void { this.notifyUserActivity(); this.timerService.toggle(this.localOptions.timer); }
  public startTimer(): void { this.timerService.start(this.localOptions.timer); this.displayToast('Chronomètre démarré', 'success'); }
  public pauseTimer(): void { this.timerService.pause(); this.displayToast('Chronomètre en pause', 'info'); }

  public resetTimer(): void {
    this.notifyUserActivity();
    this.timerService.reset(this.localOptions.timer);
    this.displayToast('Chronomètre réinitialisé', 'success');
  }

  public formatTime(seconds: number): string { return this.timerService.formatTime(seconds); }
  public getDisplayTime(): string { return this.timerService.getDisplayTime(); }
}
