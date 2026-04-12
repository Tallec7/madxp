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
import { RemoteTimerService } from './services/remote-timer.service';
import {
  RemoteOptionsService, LocalOptions, SportType, ScoreOverlayPosition,
  SPORT_LABELS, SPORT_PERIODS, SPORT_PERIOD_DURATIONS,
} from './services/remote-options.service';
import { CloudRemoteNavigationService, Video, Category, TimeCategory } from './services/cloud-remote-navigation.service';
import { CloudRemoteConfigService, Configuration } from './services/cloud-remote-config.service';

@Component({
  selector: 'app-cloud-remote',
  standalone: true,
  imports: [CommonModule, FormsModule, LicenseBannerComponent, LicenseBlockRemoteComponent, PlayerStatusComponent, ScreenshotViewerComponent],
  providers: [RemoteScoreService, RemoteTimerService, RemoteOptionsService, CloudRemoteNavigationService, CloudRemoteConfigService],
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
  readonly nav = inject(CloudRemoteNavigationService);
  readonly config = inject(CloudRemoteConfigService);
  private readonly destroy$ = new Subject<void>();

  public siteId: string = '';
  public siteName: string = '';
  public clubName: string = '';
  public isConnected = false;
  public connectionError: string | null = null;
  public pendingConfigVersionId: string | null = null;
  public pendingCommandsCount = 0;

  // Backward-compat getters delegating to services
  public get configuration(): Configuration { return this.config.configuration; }
  public get localOptions(): LocalOptions { return this.optionsService.options; }
  public get currentView() { return this.nav.currentView; }
  public set currentView(v) { this.nav.currentView = v; }
  public get breadcrumb() { return this.nav.breadcrumb; }
  public get selectedTimeCategory() { return this.nav.selectedTimeCategory; }
  public get selectedCategory() { return this.nav.selectedCategory; }
  public get selectedSubCategory() { return this.nav.selectedSubCategory; }
  public get searchQuery() { return this.config.searchQuery; }
  public set searchQuery(v) { this.config.searchQuery = v; }
  public get searchPlaceholder() { return this.config.searchPlaceholder; }
  public get searchResults() { return this.config.searchResults; }
  public get isSearching() { return this.config.isSearching; }
  public get recentVideos() { return this.config.recentVideos; }
  public get timeCategories() { return this.config.timeCategories; }
  public get liveScoreEnabled() { return this.config.liveScoreEnabled; }

  public isReloading = false;

  // Match info
  public showMatchModal = false;
  public matchInfo = {
    date: new Date().toISOString().split('T')[0],
    matchName: '',
    audienceEstimate: 150
  };
  public currentSessionId: string | null = null;

  // Score en live
  public isScorePanelExpanded = false;
  public get currentScore() { return this.scoreService.currentScore; }

  // Phase active
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

  // Player state
  public initialPlayerState: PlayerState | null = null;

  // Menu header
  public isHeaderMenuOpen = false;

  // Sports et Périodes (exposed for template)
  public readonly sportTypes: SportType[] = ['football', 'basketball', 'handball', 'volleyball', 'rugby', 'hockey'];
  public readonly sportLabels = SPORT_LABELS;
  public readonly sportPeriods = SPORT_PERIODS;
  public readonly sportPeriodDurations = SPORT_PERIOD_DURATIONS;

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

  // Exposer Math pour le template
  public Math = Math;

  // Breaking News
  public showBreakingNewsPanel = false;
  public breakingNewsMessage = '';

  // Timer delegated
  public get timerCurrentTime() { return this.timerService.currentTime; }
  public get timerIsRunning() { return this.timerService.isRunning; }

  // Durées disponibles
  public readonly halfDurations = [15, 20, 25, 30, 35, 40, 45];
  public readonly newsDurations = [5, 10, 15, 20, 30];

  ngOnInit(): void {
    this.isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyDarkMode();
    this.config.loadRecentVideos();
    this.timerService.initialize(this.localOptions.timer);
    this.timerService.onPeriodEnd = () => this.displayToast('Mi-temps terminée !', 'info');

    this.siteId = this.route.snapshot.paramMap.get('siteId') || '';

    this.scoreService.scoreUpdate$.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => this.scoreService.sendScoreUpdate(this.siteId, this.localOptions.match.period));

    if (this.siteId) {
      this.loadSiteState();
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

  // ==== CHARGEMENT ET CONNEXION ====

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

        if (!this.isConnected) { this.isLoading = false; return; }

        if (state.pinRequired && !state.config) {
          this.pinRequired = true;
          this.isLoading = false;
          return;
        }

        this.pinRequired = false;
        this.config.setSecondaryVariantPaths(state.secondaryVariantPaths || []);
        const rawConfig = this.config.buildConfiguration(state.siteName, state.config);
        this.config.initializeWithConfiguration(this.config.markSecondaryVariants(rawConfig));
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

  public retryConnection(): void { this.loadSiteState(); }

  public submitPin(): void {
    if (!this.pinInput || this.pinInput.length < 4) {
      this.pinError = 'Le PIN doit contenir au moins 4 chiffres';
      return;
    }
    this.pinVerifying = true;
    this.pinError = '';

    this.remoteService.verifyPin(this.siteId, this.pinInput).subscribe({
      next: () => {
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

  public onPinDigit(digit: string): void {
    if (this.pinInput.length < 6) { this.pinInput += digit; this.pinError = ''; }
  }
  public onPinBackspace(): void { this.pinInput = this.pinInput.slice(0, -1); this.pinError = ''; }
  public onPinClear(): void { this.pinInput = ''; this.pinError = ''; }

  private refreshState(): void {
    if (!this.siteId) return;

    this.remoteService.getState(this.siteId).subscribe({
      next: (state: RemoteState) => {
        this.isConnected = state.isConnected && state.connectionHealth?.isHealthy;
        this.pendingConfigVersionId = state.pendingConfigVersionId || null;
        this.pendingCommandsCount = state.pendingCommandsCount || 0;

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
          const rawConfig = this.config.buildConfiguration(state.siteName, state.config);
          this.config.initializeWithConfiguration(rawConfig);
        }

        this.updateLicenseState(state);
        this.updateRecordingState(state);
        if (state.playerState) { this.initialPlayerState = state.playerState; }
      },
      error: () => { /* Silencieux pour le polling */ }
    });
  }

  // ==== LICENSE & RECORDING ====

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
    if (state.recordingState) { this.isRecording = state.recordingState.isRecording; }
  }

  public toggleRecording(): void {
    if (!this.siteId || !this.isConnected) return;
    this.remoteService.toggleRecording(this.siteId).subscribe({
      next: () => {
        this.isRecording = !this.isRecording;
        this.displayToast(this.isRecording ? 'Enregistrement démarré' : 'Enregistrement arrêté', 'success');
      },
      error: () => { this.displayToast('Erreur lors du toggle enregistrement', 'info'); },
    });
  }

  public dismissLicenseBanner(): void { this.licenseBannerDismissed = true; }

  // ==== NAVIGATION (delegated) ====

  public handleBack(): void { this.nav.handleBack(this.config.isSearching, () => this.config.clearSearch()); }
  public selectTimeCategory(tc: TimeCategory): void { this.nav.selectTimeCategory(tc); }
  public selectCategory(cat: Category): void { this.nav.selectCategory(cat); }
  public selectSubCategory(sub: Category): void { this.nav.selectSubCategory(sub); }
  public showAllVideos(): void { this.nav.showAllVideos(); }

  public openOptions(): void {
    if (!this.nav.openOptions(this.config.liveScoreEnabled, () => this.closeHeaderMenu())) {
      this.displayToast('Options non disponibles', 'info');
    }
  }

  // ==== ACTIONS VIDEO ====

  public launchSponsors(): void {
    this.remoteService.playSponsors(this.siteId).subscribe({
      next: () => this.displayToast('Boucle sponsors lancée', 'success'),
      error: (err) => this.displayToast('Erreur: ' + (err.error?.error || 'Échec de la commande'), 'info'),
    });
  }

  public launchVideo(video: Video): void {
    this.remoteService.playVideo(this.siteId, { name: video.name, path: video.path, categoryId: video.categoryId }).subscribe({
      next: () => {
        this.config.addToRecentVideos(video);
        this.playingVideoPath = video.path;
        this.displayToast(`${video.name} lancée sur l'écran`, 'success');
        setTimeout(() => { this.playingVideoPath = null; }, 3000);
      },
      error: (err) => this.displayToast('Erreur: ' + (err.error?.error || 'Échec de la commande'), 'info'),
    });
  }

  // ==== TOAST ====

  private displayToast(message: string, type: 'success' | 'info' = 'success'): void {
    if (this.toastTimeout) { clearTimeout(this.toastTimeout); }
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    this.toastTimeout = setTimeout(() => { this.showToast = false; }, 3000);
  }

  // ==== HELPERS (delegated to config service) ====

  public getVideoCategoryName(video: Video): string { return this.config.getVideoCategoryName(video); }
  public getCategoriesForTimeCategory(tc: TimeCategory): Category[] { return this.config.getCategoriesForTimeCategory(tc); }
  public getVideosCount(cat: Category): number { return this.config.getVideosCount(cat); }
  public getSubCategoriesCount(cat: Category): number { return this.config.getSubCategoriesCount(cat); }
  public getSubCategoriesForDisplay(cat: Category): Category[] { return this.nav.getSubCategoriesForDisplay(cat); }
  public getCurrentVideos(): Video[] { return this.nav.getCurrentVideos(); }
  public getTotalVideosForTimeCategory(tc: TimeCategory): number { return this.config.getTotalVideosForTimeCategory(tc); }
  public getTotalCategoriesForTimeCategory(tc: TimeCategory): number { return this.config.getTotalCategoriesForTimeCategory(tc); }
  public getAllVideos(): Video[] { return this.config.getAllVideos(); }
  public getTotalVideosCount(): number { return this.config.getTotalVideosCount(); }
  public getVideoThumbnailUrl(video: Video): string | null { return this.config.getVideoThumbnailUrl(video); }
  public onThumbnailError(event: Event): void { this.config.onThumbnailError(event); }

  public reloadConfiguration(): void {
    if (this.isReloading) return;
    this.isReloading = true;
    this.isLoading = true;

    this.remoteService.getState(this.siteId).subscribe({
      next: (state: RemoteState) => {
        this.config.setSecondaryVariantPaths(state.secondaryVariantPaths || []);
        const rawConfig = this.config.buildConfiguration(state.siteName, state.config);
        const enrichedConfig = this.config.enrichVideosWithCategoryId(this.config.markSecondaryVariants(rawConfig));
        this.config.initializeWithConfiguration(enrichedConfig);
        this.nav.resetToHome();
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

  // ==== SEARCH (delegated) ====

  public onSearch(): void { this.config.onSearch(); }
  public clearSearch(): void { this.config.clearSearch(); }

  // ==== MATCH INFO ====

  public openMatchModal(): void { this.showMatchModal = true; }
  public closeMatchModal(): void { this.showMatchModal = false; }

  public saveMatchInfo(): void {
    this.currentSessionId = crypto.randomUUID();
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
      error: () => this.displayToast('Erreur lors de l\'enregistrement', 'info'),
    });
  }

  public incrementAudience(): void { this.matchInfo.audienceEstimate += 10; }
  public decrementAudience(): void { if (this.matchInfo.audienceEstimate >= 10) this.matchInfo.audienceEstimate -= 10; }

  // ==== SCORE EN LIVE ====

  public incrementHomeScore(): void { this.scoreService.incrementHomeScore(); }
  public decrementHomeScore(): void { this.scoreService.decrementHomeScore(); }
  public incrementAwayScore(): void { this.scoreService.incrementAwayScore(); }
  public decrementAwayScore(): void { this.scoreService.decrementAwayScore(); }
  public updateTeamNamesFromMatch(): void { this.scoreService.updateTeamNamesFromMatch(this.matchInfo.matchName); }
  public broadcastScore(): void { this.scoreService.scoreUpdate$.next(); }

  public resetScore(): void {
    const { success, error } = this.scoreService.resetScore(this.siteId);
    success.subscribe(() => this.displayToast('Score réinitialisé', 'success'));
    error.subscribe(() => this.displayToast('Erreur lors de la réinitialisation', 'info'));
  }

  public toggleScorePanel(): void { this.isScorePanelExpanded = !this.isScorePanelExpanded; }

  // ==== PHASE DE BOUCLE VIDEO ====

  public switchPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.activePhase = phase;
    this.remoteService.changePhase(this.siteId, phase).subscribe({
      next: () => this.displayToast(`Phase: ${this.config.getPhaseLabel(phase)}`, 'success'),
      error: () => this.displayToast('Erreur lors du changement de phase', 'info'),
    });
  }

  public togglePhaseDropdown(): void { this.isPhaseDropdownOpen = !this.isPhaseDropdownOpen; }
  public selectPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void { this.switchPhase(phase); this.isPhaseDropdownOpen = false; }
  public getPhaseLabel(phase: 'neutral' | 'before' | 'during' | 'after'): string { return this.config.getPhaseLabel(phase); }
  public getPhaseIcon(phase: 'neutral' | 'before' | 'during' | 'after'): string { return this.config.getPhaseIcon(phase); }
  public hasLoopForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): boolean { return this.config.hasLoopForPhase(phase); }
  public getLoopVideoCount(phase: 'neutral' | 'before' | 'during' | 'after'): number { return this.config.getLoopVideoCount(phase); }

  // ==== DARK MODE ====

  public toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', String(this.isDarkMode));
    this.applyDarkMode();
  }

  private applyDarkMode(): void {
    if (this.isDarkMode) { document.body.classList.add('dark-mode'); }
    else { document.body.classList.remove('dark-mode'); }
  }

  public toggleHeaderMenu(): void { this.isHeaderMenuOpen = !this.isHeaderMenuOpen; }
  public closeHeaderMenu(): void { this.isHeaderMenuOpen = false; }

  // ==== OPTIONS (delegated) ====

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

  // ==== SPORT & PÉRIODES ====

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

  // ==== ÉQUIPES & LOGOS ====

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
    this.scoreService.resetForNewMatch(this.localOptions.match.homeTeam.name, this.localOptions.match.awayTeam.name);
    this.resetTimer();
    this.broadcastScore();
    this.displayToast('Nouveau match préparé', 'success');
  }

  // ==== ANIMATION DE BUT ====

  public updateGoalAnimationOption<K extends keyof LocalOptions['goalAnimation']>(key: K, value: LocalOptions['goalAnimation'][K]): void {
    this.optionsService.updateGoalAnimationOption(key, value);
  }

  public setOverlayPosition(position: ScoreOverlayPosition | undefined): void {
    this.optionsService.setOverlayPosition(position);
  }

  // ==== BREAKING NEWS ====

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

    this.remoteService.showBreakingNews(this.siteId, {
      message: text,
      duration: this.localOptions.breakingNews.defaultDuration,
      position: this.localOptions.breakingNews.position
    }).subscribe({
      next: () => {
        this.breakingNewsMessage = '';
        this.showBreakingNewsPanel = false;
        this.displayToast('Annonce envoyée', 'success');
      },
      error: () => this.displayToast('Erreur lors de l\'envoi', 'info'),
    });
  }

  public sendQuickNews(message: string): void { this.sendBreakingNews(message); }

  // ==== TIMER CONTROLS ====

  public toggleTimer(): void { this.timerService.toggle(this.siteId, this.localOptions.timer); this.displayToast(this.timerIsRunning ? 'Chronomètre démarré' : 'Chronomètre en pause', this.timerIsRunning ? 'success' : 'info'); }
  public startTimer(): void { this.timerService.start(this.siteId, this.localOptions.timer); this.displayToast('Chronomètre démarré', 'success'); }
  public pauseTimer(): void { this.timerService.pause(this.siteId); this.displayToast('Chronomètre en pause', 'info'); }
  public resetTimer(): void { this.timerService.reset(this.siteId, this.localOptions.timer); this.displayToast('Chronomètre réinitialisé', 'success'); }
  public formatTime(seconds: number): string { return this.timerService.formatTime(seconds); }
  public getDisplayTime(): string { return this.timerService.getDisplayTime(); }

  // ==== SWIPE GESTURES (delegated) ====

  public onTouchStart(event: TouchEvent): void { this.nav.onTouchStart(event); }
  public onTouchEnd(event: TouchEvent): void { this.nav.onTouchEnd(event, this.config.isSearching, () => this.config.clearSearch()); }
}
