import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { LocalBroadcastService, PhaseChangeEvent, OptionsUpdateEvent } from '../../services/local-broadcast.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { DoubleBufferVideoService } from '../../services/double-buffer-video.service';
import { VideoErrorRecoveryService } from '../../services/video-error-recovery.service';
import { VideoPlaybackService } from '../../services/video-playback.service';
import { WatermarkService } from '../../services/watermark.service';
import { LicenseService, LicenseState } from '../../services/license.service';
import { PlayerStateService } from '../../services/player-state.service';
import { ScreenshotService } from '../../services/screenshot.service';
import { RecordingStateService } from '../../services/recording-state.service';
import { SaasConfigService } from '../../services/saas-config.service';
import { ManualVideoService } from '../../services/manual-video.service';
import { TvSyncService } from '../../services/tv-sync.service';
import { LicenseBlockComponent } from '../license-block/license-block.component';
import { WaitingScreenComponent } from '../waiting-screen/waiting-screen.component';
import { WrongPortScreenComponent } from '../wrong-port-screen/wrong-port-screen.component';
import { ScoreOverlayComponent } from '../score-overlay/score-overlay.component';
import { Video } from '../../interfaces/video.interface';
import { Configuration } from '../../interfaces/configuration.interface';
import { Command } from '../../interfaces/command.interface';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { Category } from '../../interfaces/category.interface';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tv',
  templateUrl: './tv.component.html',
  styleUrl: './tv.component.scss',
  imports: [CommonModule, LicenseBlockComponent, WaitingScreenComponent, WrongPortScreenComponent, ScoreOverlayComponent],
  encapsulation: ViewEncapsulation.None // Désactiver l'encapsulation pour le double-buffer
})
export class TvComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);

  // Extracted services
  private readonly doubleBufferService = inject(DoubleBufferVideoService);
  private readonly errorRecoveryService = inject(VideoErrorRecoveryService);
  private readonly playbackService = inject(VideoPlaybackService);
  private readonly watermarkService = inject(WatermarkService);
  private readonly licenseService = inject(LicenseService);
  private readonly playerStateService = inject(PlayerStateService);
  private readonly screenshotService = inject(ScreenshotService);
  private readonly recordingState = inject(RecordingStateService);
  private readonly saasConfigService = inject(SaasConfigService);
  private readonly manualVideoService = inject(ManualVideoService);
  private readonly tvSyncService = inject(TvSyncService);

  private localBroadcastSubscriptions: Subscription[] = [];

  // Display type: 'tv' (index 0), 'secondary' (index 1), 'display-N' (index N)
  public displayType = 'tv';
  // Display index for targeted commands and variant resolution
  public displayIndex = 0;

  // HDMI status — E-23 US-23.2.1: splash screen when no display connected
  public hdmiConnected = true; // Assume connected until told otherwise (PC browsers always true)

  // E-23 US-23.5.3: Wrong HDMI port detected (TV on HDMI-1 instead of HDMI-0)
  public wrongPort = false;

  // E-23 US-23.3.2: Demotion notification for PC browsers (Pi took over as master)
  public demotionNotice = false;
  private demotionTimeout: ReturnType<typeof setTimeout> | null = null;

  // License status - bloque l'affichage si la licence n'est pas valide
  public licenseState: LicenseState | null = null;
  public isLicenseBlocked = false;

  // Options locales (provenant de Remote)
  public localOptions: LocalOptions = this.localOptionsService.getOptions();

  @Input() public configuration: Configuration;

  private lastTriggerType: 'auto' | 'manual' = 'auto';
  private currentEventType: 'match' | 'training' | 'tournament' | 'other' = 'other';
  private currentPeriod: 'pre_match' | 'halftime' | 'post_match' | 'loop' = 'loop';

  // Phase active pour la boucle vidéo
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';

  // Score overlay state — delegated to ScoreOverlayComponent
  public get currentScore() { return this.scoreOverlay?.currentScore ?? null; }
  public get showScoreOverlay() { return this.scoreOverlay?.showScoreOverlay ?? false; }

  // Watermark - délégué au WatermarkService
  public get showWatermark(): boolean {
    return this.watermarkService.showWatermark;
  }

  // Proxy for isManualMode (delegated to ManualVideoService)
  private get isManualMode(): boolean { return this.manualVideoService.isManualMode; }
  private set isManualMode(val: boolean) { this.manualVideoService.isManualMode = val; }

  // Double-buffer pour la BOUCLE (z-index 1-2)
  @ViewChild('playerA', { static: true }) playerARef: ElementRef<HTMLVideoElement>;
  @ViewChild('playerB', { static: true }) playerBRef: ElementRef<HTMLVideoElement>;

  // Double-buffer pour les vidéos MANUELLES (z-index 10-11, au-dessus de la boucle)
  @ViewChild('manualPlayerA', { static: true }) manualPlayerARef: ElementRef<HTMLVideoElement>;
  @ViewChild('manualPlayerB', { static: true }) manualPlayerBRef: ElementRef<HTMLVideoElement>;

  // Score overlay component (score, timer, goal animation, breaking news)
  @ViewChild(ScoreOverlayComponent) scoreOverlay: ScoreOverlayComponent;

  // Canvas freeze-frame pour transitions sans flash (z-index 20)
  @ViewChild('freezeCanvas', { static: true }) freezeCanvasRef: ElementRef<HTMLCanvasElement>;

  // Black overlay pour bloquer la boucle pendant les transitions (z-index 5)
  @ViewChild('blackOverlay', { static: true }) blackOverlayRef: ElementRef<HTMLDivElement>;

  // Dedup guard for commands
  private _lastCommandKey: string | null = null;
  private _lastCommandAt = 0;

  // E-23 US-23.3.4: Boot-to-video timing metric
  private bootMetrics = {
    hdmiDetectedAt: Date.now(),
    firstVideoPlayAt: 0,
    emitted: false,
  };

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  public ngOnInit() {
    // Phase 5 — PROP-002: read displayIndex from route param /display/:n
    const routeN = this.route.snapshot.params['n'];
    if (routeN !== undefined) {
      this.displayIndex = parseInt(routeN, 10) || 0;
    } else {
      // Fallback: route data (rétrocompat accès direct sans param)
      this.displayIndex = this.route.snapshot.data['displayType'] === 'secondary' ? 1 : 0;
    }
    this.displayType = this.displayIndex === 0 ? 'tv' : this.displayIndex === 1 ? 'secondary' : `display-${this.displayIndex}`;
    console.log(`[TV] Display type: ${this.displayType}, index: ${this.displayIndex}`);

    // S'abonner aux mises à jour du statut de licence
    this.localBroadcastSubscriptions.push(
      this.licenseService.state$.subscribe((state) => {
        this.licenseState = state;
        this.isLicenseBlocked = state.status === 'BLOCKED';

        // Si bloqué, arrêter la lecture vidéo
        if (this.isLicenseBlocked) {
          this.stopAllPlayers();
        }
      })
    );

    // Si la licence est déjà bloquée au démarrage, ne pas initialiser la boucle vidéo
    if (this.licenseService.isBlocked()) {
      this.isLicenseBlocked = true;
      this.licenseState = this.licenseService.getCurrentState();
      return; // Ne pas initialiser la boucle vidéo
    }

    // Charger les options locales et s'abonner aux changements
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcastSubscriptions.push(
      this.localOptionsService.getOptions$().subscribe((options) => {
        this.localOptions = options;
      })
    );

    // Configurer l'analytics service avec la configuration (pour le mapping des catégories)
    this.analyticsService.setConfiguration(this.configuration);

    // Récupérer le site_id depuis l'API du serveur local (doit être avant startSession pour SaaS)
    this.loadSiteId();

    // En mode SaaS, la boucle tourne en continu sans phase match — activer le recording et la session au démarrage
    if ((environment as { saasMode?: boolean }).saasMode && !this.tvSyncService.isSlaveMode && this.displayType === 'tv') {
      this.recordingState.startRecording(false);
      this.analyticsService.startSession();
    }

    // Initialiser les services (remplace l'ancien initDoubleBuffer monolithique)
    this.initServices();

    // Lancer la boucle vidéo
    this.playbackService.startSeamlessLoop();

    // Initialiser le watermark (délégué au service)
    this.watermarkService.init(this.configuration);

    // Activer le plein écran ET le son au premier clic/touche utilisateur
    const activateFullscreenAndUnmute = () => {
      const playerA = this.playerARef?.nativeElement;
      const playerB = this.playerBRef?.nativeElement;
      if (playerA) playerA.muted = false;
      if (playerB) playerB.muted = false;
      console.log('Sound unmuted after user interaction');
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(() => console.log('fullscreen activated'))
          .catch((error) => console.error('fullscreen issue', error));
      }
    };
    document.addEventListener('click', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('keydown', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('touchstart', activateFullscreenAndUnmute, { once: true });

    // SOCKET EVENT HANDLERS
    this.socketService.on('action', (command: Command) => {
      console.log('tv action received', command);
      this.handleTvCommand(command);
    });

    this.socketService.on('match-info-updated', (matchInfo: { audienceEstimate?: number }) => {
      console.log('[TV] Match info updated:', matchInfo);
      if (matchInfo.audienceEstimate) {
        this.updateAudienceEstimate(matchInfo.audienceEstimate);
      }
    });

    this.socketService.on('phase-change', (data: { phase: 'neutral' | 'before' | 'during' | 'after' }) => {
      console.log('[TV] Phase change received:', data.phase);
      this.switchToPhase(data.phase);
    });

    this.socketService.on<OptionsUpdateEvent>('options-update', (options) => {
      console.log('[TV] Options update received via socket:', options);
      this.localOptions = options as LocalOptions;
    });

    this.socketService.on('screenshot-request', () => {
      console.log('[TV] Screenshot request received');
      const activeVideo = this.isManualMode
        ? this.doubleBufferService.getActiveManualPlayer()
        : this.doubleBufferService.getActivePlayer();
      if (!activeVideo) {
        this.socketService.emit('screenshot-data', { error: 'no_active_video', timestamp: Date.now() } as unknown as Command);
        return;
      }
      const data = this.screenshotService.captureScreenshot(activeVideo);
      if (!data) {
        this.socketService.emit('screenshot-data', { error: 'capture_failed', timestamp: Date.now() } as unknown as Command);
        return;
      }
      this.socketService.emit('screenshot-data', {
        image: data,
        timestamp: Date.now(),
        currentVideo: PlayerStateService.filenameFromPath(activeVideo.src),
        phase: this.activePhase,
        isManualMode: this.isManualMode,
      } as unknown as Command);
      console.log('[TV] Screenshot sent');
    });

    // BROADCASTCHANNEL HANDLERS
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onPhaseChange().subscribe((data: PhaseChangeEvent) => {
        console.log('[TV] Local phase change received:', data.phase);
        this.switchToPhase(data.phase);
      })
    );

    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onCommand().subscribe((command) => {
        console.log('[TV] Local command received:', command);
        this.handleTvCommand(command as Command);
      })
    );

    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onOptionsUpdate().subscribe((options: OptionsUpdateEvent) => {
        console.log('[TV] Local options update received:', options);
        this.localOptions = options as LocalOptions;
      })
    );

    // MASTER-SLAVE SYNCHRONISATION — delegated to TvSyncService
    this.tvSyncService.init({
      getDisplayType: () => this.displayType,
      getDisplayIndex: () => this.displayIndex,
      resolveDisplayVariant: (video) => this.resolveDisplayVariant(video),
      onRoleAssigned: (_role) => { /* state managed by tvSyncService */ },
      onDemotion: () => {
        this.demotionNotice = true;
        if (this.demotionTimeout) clearTimeout(this.demotionTimeout);
        this.demotionTimeout = setTimeout(() => { this.demotionNotice = false; }, 8000);
      },
      onHdmiStatus: (data) => {
        if (this.displayType === 'tv') {
          this.hdmiConnected = data.hdmi0 || data.hdmi1;
        } else {
          this.hdmiConnected = data.hdmi1;
        }
        this.wrongPort = !!data.wrongPort;
        if (this.hdmiConnected && !this.bootMetrics.emitted) {
          this.bootMetrics.hdmiDetectedAt = Date.now();
          console.log('[TV] Boot metric: HDMI detected at', this.bootMetrics.hdmiDetectedAt);
        }
      },
      onPromotion: (reason) => {
        if (this.displayType === 'secondary') {
          console.log(`[TV] Failover promotion: switching to TV mode (${reason})`);
          this.displayType = 'tv';
        }
      },
      onFailoverDemotion: (reason) => {
        if (this.route.snapshot.data['displayType'] === 'secondary' && this.displayType === 'tv') {
          console.log(`[TV] Failover demotion: returning to secondary mode (${reason})`);
          this.displayType = 'secondary';
        }
      },
      onSlaveReturnToLoop: () => {
        this.stopManualVideoAndReturnToLoop();
      },
    });
  }

  public ngOnDestroy() {
    this.stopPlayerStateProgressTracker();

    if (!this.tvSyncService.isSlaveMode) {
      this.analyticsService.endSession();
    }

    // Destroy extracted services
    this.playbackService.destroy();
    this.errorRecoveryService.destroy();
    this.doubleBufferService.destroy();
    this.tvSyncService.destroy();
    this.watermarkService.destroy();

    this.localBroadcastSubscriptions.forEach(sub => sub.unsubscribe());
    this.localBroadcastSubscriptions = [];
  }

  // =========================================================================
  // SERVICE INITIALIZATION
  // =========================================================================

  private initServices(): void {
    const playerA = this.playerARef.nativeElement;
    const playerB = this.playerBRef.nativeElement;
    const manualPlayerA = this.manualPlayerARef.nativeElement;
    const manualPlayerB = this.manualPlayerBRef.nativeElement;

    // 1. Initialize DoubleBuffer (DOM-level player management)
    this.doubleBufferService.init(
      {
        playerA, playerB, manualPlayerA, manualPlayerB,
        freezeCanvas: this.freezeCanvasRef.nativeElement,
        blackOverlay: this.blackOverlayRef.nativeElement,
      },
      {
        onPlayStarted: (videoIndex, player) => this.playbackService.handlePlayStarted(videoIndex, player),
        onSwitchReady: (nextVideoIndex, newPlayer) => this.playbackService.handleSwitchReady(nextVideoIndex, newPlayer),
        onPlayError: (videoIndex) => this.playbackService.handlePlayError(videoIndex),
        getIsManualMode: () => this.isManualMode,
      }
    );

    // 2. Initialize VideoPlayback (loop orchestration)
    this.playbackService.init({
      onLoopVideoStarted: (video, videoIndex, player) => this.onLoopVideoStarted(video, videoIndex, player),
      onLoopVideoSwitched: (video, videoIndex, newPlayer) => this.onLoopVideoSwitched(video, videoIndex, newPlayer),
      onLoopVideoEnded: (completed) => {
        if (!this.tvSyncService.isSlaveMode && this.displayType === 'tv') {
          this.analyticsService.trackVideoEnd(completed);
        }
      },
      onPlayError: () => {
        this.emitPlayerState({ lastError: 'play_error', isPlaying: false });
      },
      onTransitionMetrics: (metrics) => {
        this.socketService.emit('transition-metrics', metrics);
      },
      getIsSlaveMode: () => this.tvSyncService.isSlaveMode,
      getIsManualMode: () => this.isManualMode,
      getActivePhase: () => this.activePhase,
      getLoopVideosForPhase: (phase) => this.getLoopVideosForPhase(phase),
    });

    // 3. Initialize ErrorRecovery (watchdog, error handlers, memory cleanup)
    this.errorRecoveryService.init(
      {
        onSkipToNext: (delay) => {
          this.doubleBufferService.resetSwitchState();
          setTimeout(() => {
            const videos = this.playbackService.currentLoopVideos;
            const nextIndex = (this.playbackService.currentLoopIndex + 1) % videos.length;
            const video = videos[nextIndex];
            if (video?.path) {
              this.doubleBufferService.playOnActivePlayer(video.path, nextIndex);
            }
          }, delay);
        },
        onFullReset: () => this.performFullReset(),
        onManualErrorRecovery: () => {
          this.doubleBufferService.hideFreezeFrame();
          this.doubleBufferService.hideBlackOverlay();
          this.isManualMode = false;
          this.lastTriggerType = 'auto';
          if (!this.playbackService.isLoopMode) {
            this.playbackService.startSeamlessLoop();
          }
        },
        getActivePlayer: () => this.doubleBufferService.getActivePlayer(),
        getIsManualMode: () => this.isManualMode,
        getIsLoopMode: () => this.playbackService.isLoopMode,
        getIsPendingSwitch: () => this.doubleBufferService.pendingSwitch,
        getIsSlaveMode: () => this.tvSyncService.isSlaveMode,
      },
      () => {
        this.doubleBufferService.performMemoryCleanup(
          this.isManualMode,
          this.doubleBufferService.preloadReady
        );
      }
    );

    // 4. Initialize ManualVideoService
    this.manualVideoService.init({
      getIsSlaveMode: () => this.tvSyncService.isSlaveMode,
      getTvRole: () => this.tvSyncService.tvRole,
      getDisplayType: () => this.displayType,
      emitLoopUpdate: (state) => this.socketService.emit('tv-loop-update', state),
      emitPlayerState: (partial) => this.emitPlayerState(partial),
    });

    // Attach error handlers to all players
    this.errorRecoveryService.attachErrorHandlers({ loopA: playerA, loopB: playerB, manualA: manualPlayerA, manualB: manualPlayerB });

    // Ended listeners for the loop
    playerA.addEventListener('ended', () => this.playbackService.onVideoEnded('A'));
    playerB.addEventListener('ended', () => this.playbackService.onVideoEnded('B'));

    // TimeUpdate listeners for early preload/switch
    playerA.addEventListener('timeupdate', () => this.playbackService.onTimeUpdate('A'));
    playerB.addEventListener('timeupdate', () => this.playbackService.onTimeUpdate('B'));

    // Start watchdog, frame capture, metrics, player state tracker
    this.errorRecoveryService.startWatchdog();
    this.doubleBufferService.startLastFrameCapture();
    this.playbackService.startMetricsInterval();
    this.startPlayerStateProgressTracker();

    console.log('[TV] Services initialized (4 players) with error recovery + transition metrics + player state');
  }

  // =========================================================================
  // SERVICE CALLBACKS
  // =========================================================================

  private onLoopVideoStarted(video: Sponsor, videoIndex: number, player: HTMLVideoElement): void {
    this.errorRecoveryService.incrementVideoPlayCount();
    this.errorRecoveryService.resetConsecutiveErrors();

    if (!this.tvSyncService.isSlaveMode && this.displayType === 'tv') {
      this.analyticsService.trackVideoStart(video, 'auto');
    }

    if (this.tvSyncService.tvRole === 'master') {
      this.tvSyncService.emitLoopState(videoIndex, video.path, false);
    }

    // E-23 US-23.3.4: Emit boot-to-video metric (one-shot)
    if (!this.bootMetrics.emitted) {
      this.bootMetrics.firstVideoPlayAt = Date.now();
      this.bootMetrics.emitted = true;
      const deltaMs = this.bootMetrics.hdmiDetectedAt
        ? this.bootMetrics.firstVideoPlayAt - this.bootMetrics.hdmiDetectedAt
        : 0;
      console.log(`[TV] Boot metric: first video at ${this.bootMetrics.firstVideoPlayAt}, boot-to-video=${deltaMs}ms`);
      this.socketService.emit('boot-to-video', {
        hdmiDetectedAt: this.bootMetrics.hdmiDetectedAt,
        firstVideoPlayAt: this.bootMetrics.firstVideoPlayAt,
        bootToVideoMs: deltaMs,
      });
    }

    const loopVideos = this.playbackService.currentLoopVideos;
    const nextIdx = (videoIndex + 1) % loopVideos.length;
    this.emitPlayerState({
      currentVideo: PlayerStateService.filenameFromPath(video.path),
      currentCategory: video.analytics_category || null,
      duration: player.duration || 0,
      currentTime: 0,
      isManualMode: false,
      isPlaying: true,
      loopIndex: videoIndex,
      loopTotal: loopVideos.length,
      nextVideo: PlayerStateService.filenameFromPath(loopVideos[nextIdx]?.path),
      lastError: null,
      lastTransitionAt: new Date().toISOString(),
      loopResumedFrom: null,
    });
  }

  private onLoopVideoSwitched(video: Sponsor, videoIndex: number, _newPlayer: HTMLVideoElement): void {
    this.errorRecoveryService.incrementVideoPlayCount();
    this.errorRecoveryService.resetConsecutiveErrors();

    if (!this.tvSyncService.isSlaveMode && this.displayType === 'tv') {
      this.analyticsService.trackVideoStart(video, 'auto');
    }

    if (this.tvSyncService.tvRole === 'master') {
      this.tvSyncService.emitLoopState(videoIndex, video.path, false);
    }

    const loopVideos = this.playbackService.currentLoopVideos;
    const nextIdx = (videoIndex + 1) % loopVideos.length;
    this.emitPlayerState({
      currentVideo: PlayerStateService.filenameFromPath(video.path),
      currentCategory: video.analytics_category || null,
      isManualMode: false,
      isPlaying: true,
      loopIndex: videoIndex,
      loopTotal: loopVideos.length,
      nextVideo: PlayerStateService.filenameFromPath(loopVideos[nextIdx]?.path),
      lastError: null,
      lastTransitionAt: new Date().toISOString(),
    });
  }

  // =========================================================================
  // PLAYER STATE
  // =========================================================================

  private playerStateInterval: ReturnType<typeof setInterval> | null = null;

  private emitPlayerState(partial: Partial<import('../../services/player-state.service').PlayerState>): void {
    const state = this.playerStateService.update(partial);
    this.socketService.emit('player-state', state as unknown as Command);
  }

  private startPlayerStateProgressTracker(): void {
    if (this.playerStateInterval) return;
    this.playerStateInterval = setInterval(() => {
      const player = this.isManualMode
        ? this.doubleBufferService.getActiveManualPlayer()
        : this.doubleBufferService.getActivePlayer();
      if (player && player.duration > 0 && !player.paused) {
        this.playerStateService.update({
          currentTime: Math.floor(player.currentTime),
          duration: Math.floor(player.duration),
          progress: Math.round((player.currentTime / player.duration) * 100),
          isPlaying: true,
        });
        this.analyticsService.setCurrentVideoDuration(player.duration);
      }
    }, 5000);
  }

  private stopPlayerStateProgressTracker(): void {
    if (this.playerStateInterval) {
      clearInterval(this.playerStateInterval);
      this.playerStateInterval = null;
    }
  }

  // =========================================================================
  // COMMAND ROUTING
  // =========================================================================

  private isDuplicateCommand(commandKey: string): boolean {
    const now = Date.now();
    if (this._lastCommandKey === commandKey && now - this._lastCommandAt < 1000) {
      console.log('[TV] Ignoring duplicate command (BroadcastChannel+Socket.IO race):', commandKey);
      return true;
    }
    this._lastCommandKey = commandKey;
    this._lastCommandAt = now;
    return false;
  }

  private handleTvCommand(command: Command): void {
    if (command.target && Array.isArray(command.target) && command.type !== 'reload-config') {
      if (!command.target.includes(this.displayIndex)) {
        console.log(`[TV] Ignoring targeted command (target=${command.target}, my index=${this.displayIndex})`);
        return;
      }
    }
    if (command.type === 'video' && command.data) {
      const video = command.data as Video;
      if (this.isDuplicateCommand(`video:${video.path}`)) return;
      this.lastTriggerType = 'manual';
      this.tvSyncService.markActionReceived();
      const resolvedVideo = this.resolveDisplayVariant(video);
      if (this.tvSyncService.isSlaveMode) {
        this.manualVideoService.preloadManualVideo(resolvedVideo);
      } else {
        this.manualVideoService.play(resolvedVideo);
      }
    } else if (command.type === 'sponsors') {
      if (this.isDuplicateCommand('sponsors')) return;
      this.lastTriggerType = 'auto';
      this.doubleBufferService.captureAndShowFreezeFrame();
      this.sponsors();
    } else if (command.type === 'reload-config' && command.data) {
      if (this.isDuplicateCommand('reload-config')) return;
      console.log('tv: reloading config for club', command.data);
      this.reloadConfiguration(command.data as Configuration);
    }
  }

  // =========================================================================
  // LOOP MANAGEMENT
  // =========================================================================

  private sponsors() {
    console.log('[TV] Play loop for phase:', this.activePhase);
    this.playbackService.startSeamlessLoop();
  }

  private getLoopVideosForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): Sponsor[] {
    let videos: Sponsor[];

    if (phase === 'neutral') {
      videos = this.configuration.sponsors || [];
    } else {
      const timeCategory = this.configuration.timeCategories?.find(tc => tc.id === phase);
      if (timeCategory?.loopVideos && timeCategory.loopVideos.length > 0) {
        videos = timeCategory.loopVideos;
      } else {
        videos = this.configuration.sponsors || [];
      }
    }

    if (this.displayType !== 'tv') {
      return videos.map(video => this.resolveDisplayVariant(video));
    }

    return videos;
  }

  private resolveDisplayVariant<T extends { path: string; variants?: Record<string, { path: string }> }>(video: T): T {
    if (this.displayType === 'tv') return video;

    const variant = video.variants?.[this.displayType];
    if (variant?.path) {
      console.log(`[TV] Display ${this.displayType}: resolved variant from video object:`, variant.path);
      return { ...video, path: variant.path };
    }

    const found = this.findVideoInConfig(video.path);
    const foundVariant = (found as { variants?: Record<string, { path: string }> })?.variants?.[this.displayType];
    if (foundVariant?.path) {
      console.log(`[TV] Display ${this.displayType}: resolved variant from config lookup:`, foundVariant.path);
      return { ...video, path: foundVariant.path };
    }

    console.warn(`[TV] Display ${this.displayType}: no variant found for video, using primary path:`, video.path);
    return video;
  }

  private findVideoInConfig(path: string): Video | Sponsor | null {
    const sponsor = this.configuration.sponsors?.find(s => s.path === path);
    if (sponsor) return sponsor;

    if (this.configuration.timeCategories) {
      for (const tc of this.configuration.timeCategories) {
        const loopVideo = tc.loopVideos?.find(v => v.path === path);
        if (loopVideo) return loopVideo;
      }
    }

    const searchCategories = (cats: Category[]): Video | null => {
      for (const cat of cats) {
        const video = cat.videos?.find(v => v.path === path);
        if (video) return video;
        if (cat.subCategories) {
          const found = searchCategories(cat.subCategories);
          if (found) return found;
        }
      }
      return null;
    };

    return this.configuration.categories ? searchCategories(this.configuration.categories) : null;
  }

  // =========================================================================
  // PHASE MANAGEMENT
  // =========================================================================

  public switchToPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    console.log('[TV] Switching to phase:', phase, 'isManualMode:', this.isManualMode);

    this.playbackService.incrementSwitchGeneration();
    this.doubleBufferService.resetSwitchState();

    const wasInManualMode = this.isManualMode;
    if (this.isManualMode) {
      console.log('[TV] Cutting manual video to return to loop');
      this.stopManualVideoAndReturnToLoop();
    }

    if (phase === this.activePhase && !wasInManualMode) {
      if (this.playbackService.isLoopMode && !this.doubleBufferService.pendingSwitch) {
        const activePlayer = this.doubleBufferService.getActivePlayer();
        if (!activePlayer.paused) {
          console.log('[TV] Already in phase', phase, 'and loop is running - skipping');
          return;
        }
      }
      console.log('[TV] Same phase but loop not running, restarting');
    }

    const freezeSuccess = this.doubleBufferService.captureAndShowFreezeFrame();
    if (!freezeSuccess) {
      this.doubleBufferService.showBlackOverlay();
    }

    this.activePhase = phase;
    this.emitPlayerState({ phase });

    const periodMap: Record<string, 'pre_match' | 'halftime' | 'post_match' | 'loop'> = {
      'neutral': 'loop',
      'before': 'pre_match',
      'during': 'halftime',
      'after': 'post_match'
    };
    this.updatePeriod(periodMap[phase]);

    this.lastTriggerType = 'auto';
    this.sponsors();

    this.watermarkService.setActivePhase(phase);
  }

  private reloadConfiguration(config: Configuration) {
    console.log('tv: updating configuration and playlist');

    const freezeSuccess = this.doubleBufferService.captureAndShowFreezeFrame();
    if (!freezeSuccess) {
      this.doubleBufferService.showBlackOverlay();
    }

    this.configuration = config;
    this.analyticsService.setConfiguration(config);

    this.activePhase = 'neutral';
    this.updatePeriod('loop');

    this.lastTriggerType = 'auto';
    this.sponsors();

    this.watermarkService.setConfiguration(config);
  }

  // =========================================================================
  // ANALYTICS CONTEXT
  // =========================================================================

  public setEventContext(
    eventType: 'match' | 'training' | 'tournament' | 'other',
    period?: 'pre_match' | 'halftime' | 'post_match' | 'loop',
    audienceEstimate?: number
  ): void {
    this.currentEventType = eventType;
    this.analyticsService.setEventType(eventType);
    if (period) {
      this.currentPeriod = period;
      this.analyticsService.setPeriod(period);
    }
    if (audienceEstimate !== undefined) {
      this.analyticsService.setAudienceEstimate(audienceEstimate);
    }
    console.log('[TV] Event context updated:', { eventType, period, audienceEstimate });
  }

  public updatePeriod(period: 'pre_match' | 'halftime' | 'post_match' | 'loop'): void {
    this.currentPeriod = period;
    this.analyticsService.setPeriod(period);
    console.log('[TV] Period updated:', period);
  }

  public updateAudienceEstimate(estimate: number): void {
    this.analyticsService.setAudienceEstimate(estimate);
    console.log('[TV] Audience estimate updated:', estimate);
  }

  // =========================================================================
  // WATERMARK — Délégué au WatermarkService
  // =========================================================================

  public getWatermarkStyles(): Record<string, string> {
    return this.watermarkService.getStyles();
  }

  public getWatermarkAnimationClass(): string {
    return this.watermarkService.getAnimationClass();
  }

  public getWatermarkImageSrc(): string | null {
    return this.watermarkService.getImageSrc();
  }

  public onWatermarkError(): void {
    this.watermarkService.onImageError();
  }

  // =========================================================================
  // SITE ID
  // =========================================================================

  private loadSiteId(): void {
    if (this.saasConfigService.isSaasMode()) {
      const siteId = this.saasConfigService.getSiteId();
      if (siteId) {
        this.analyticsService.setSiteId(siteId);
        console.log('[TV] Site ID loaded for analytics (SaaS):', siteId);
      }
      return;
    }

    const baseUrl = environment.socketUrl || `${window.location.protocol}//${window.location.hostname}:3000`;
    const siteInfoUrl = `${baseUrl}/api/site-info`;
    this.http.get<{ siteId: string | null; siteName: string | null; configured: boolean }>(siteInfoUrl)
      .subscribe({
        next: (response) => {
          if (response.siteId) {
            this.analyticsService.setSiteId(response.siteId);
            console.log('[TV] Site ID loaded for analytics:', response.siteId);
          } else {
            console.warn('[TV] No site ID configured - sponsor analytics will not include site_id');
          }
        },
        error: (error) => {
          console.error('[TV] Failed to load site info:', error.message || error);
        }
      });
  }

  // =========================================================================
  // MANUAL VIDEO → LOOP TRANSITION
  // =========================================================================

  private stopManualVideoAndReturnToLoop(): void {
    this.manualVideoService.stopAndReturnToLoop(
      this.manualPlayerARef.nativeElement,
      this.manualPlayerBRef.nativeElement
    );

    if (this.tvSyncService.tvRole === 'master') {
      const loopVideos = this.playbackService.currentLoopVideos;
      const idx = this.playbackService.currentLoopIndex;
      this.tvSyncService.emitLoopState(idx, loopVideos[idx]?.path || '', false);
    }

    this.lastTriggerType = 'auto';
  }

  // =========================================================================
  // FULL RESET & STOP
  // =========================================================================

  private performFullReset(): void {
    console.log('[TV] Performing full video system reset');

    this.errorRecoveryService.stopWatchdog();
    this.doubleBufferService.performFullReset();
    this.playbackService.setLoopMode(false);
    this.isManualMode = false;
    this.errorRecoveryService.resetConsecutiveErrors();

    setTimeout(() => {
      console.log('[TV] Restarting video loop after full reset');
      this.errorRecoveryService.startWatchdog();
      this.playbackService.startSeamlessLoop();
    }, 3000);
  }

  private stopAllPlayers(): void {
    this.playbackService.setLoopMode(false);
    this.isManualMode = false;
    this.doubleBufferService.stopAllPlayers();
    this.errorRecoveryService.stopWatchdog();
    this.doubleBufferService.stopLastFrameCapture();
    console.log('[TV] All players stopped due to license block');
  }
}
