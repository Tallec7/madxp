import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SocketService, LoopState } from '../../services/socket.service';
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

  private localBroadcastSubscriptions: Subscription[] = [];

  // Display type: 'tv' (HDMI 0 principal) ou 'secondary' (HDMI 1 écran secondaire)
  public displayType: 'tv' | 'secondary' = 'tv';
  // Display index for targeted commands (Phase 4 — PROP-002): tv=0, secondary=1
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
  private currentSponsorIndex = 0;
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

  // État des players manuels
  private isManualMode = false; // Est-on en train de jouer une vidéo manuelle ?
  private _manualRecordingStarted = false; // Auto-start recording pour vidéo manuelle en neutral
  private _savedLoopIndex = 0; // Index de la boucle sauvegardé avant mode manuel
  private _lastActionReceivedAt = 0; // Timestamp de la dernière action reçue (guard anti-race condition)
  private _lastCommandKey: string | null = null; // Guard déduplication BroadcastChannel + Socket.IO
  private _lastCommandAt = 0; // Timestamp de la dernière commande traitée

  // ADR-034: Preloaded manual video state for synchronized reveal
  private _preloadedManualVideo: Video | null = null;
  private _preloadedManualPlayer: HTMLVideoElement | null = null;
  private _preloadReady = false; // true quand play() a résolu (vidéo décodée et en lecture)
  private _pendingReveal = false; // true si le master a signalé reveal avant que le preload soit prêt

  // Master-Slave synchronisation (second écran via Socket.IO)
  private tvRole: 'master' | 'slave' | null = null;
  private isSlaveMode = false;

  // Transition quality metrics — slave-specific counters not in PlaybackService
  private transitionMetrics = {
    staleLoopStateCount: 0, // ADR-033: nombre de tv-loop-state stales ignorés
    preloadRevealCount: 0, // ADR-034: nombre de révélations preload→reveal synchronisées
    preloadCleanupCount: 0, // ADR-034: nombre de nettoyages preload avortés
  };
  private transitionMetricsInterval: ReturnType<typeof setInterval> | null = null;

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
    // Lire le displayType depuis la route data (/secondary → 'secondary', /tv → 'tv')
    this.displayType = (this.route.snapshot.data['displayType'] as 'tv' | 'secondary') || 'tv';
    this.displayIndex = this.displayType === 'secondary' ? 1 : 0;
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

    // En mode SaaS, la boucle tourne en continu sans phase match — activer le recording et la session au démarrage
    if ((environment as { saasMode?: boolean }).saasMode && !this.isSlaveMode && this.displayType !== 'secondary') {
      this.recordingState.startRecording(false);
      this.analyticsService.startSession();
    }

    // Récupérer le site_id depuis l'API du serveur local
    this.loadSiteId();

    // Initialiser les services (remplace l'ancien initDoubleBuffer monolithique)
    this.initServices();

    // Lancer la boucle vidéo
    this.playbackService.startSeamlessLoop();

    // Initialiser le watermark (délégué au service)
    this.watermarkService.init(this.configuration);

    // Activer le plein écran ET le son au premier clic/touche utilisateur
    const activateFullscreenAndUnmute = () => {
      // Activer le son sur les deux players
      const playerA = this.playerARef?.nativeElement;
      const playerB = this.playerBRef?.nativeElement;
      if (playerA) playerA.muted = false;
      if (playerB) playerB.muted = false;

      console.log('Sound unmuted after user interaction');

      // Activer le plein écran sur le document
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(() => {
          console.log('fullscreen activated');
        }).catch((error) => {
          console.error('fullscreen issue', error);
        });
      }
    };
    document.addEventListener('click', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('keydown', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('touchstart', activateFullscreenAndUnmute, { once: true });

    this.socketService.on('action', (command: Command) => {
      console.log('tv action received', command);
      this.handleTvCommand(command);
    });

    // Match info updates (audience estimate → analytics context)
    this.socketService.on('match-info-updated', (matchInfo: { audienceEstimate?: number }) => {
      console.log('[TV] Match info updated:', matchInfo);
      if (matchInfo.audienceEstimate) {
        this.updateAudienceEstimate(matchInfo.audienceEstimate);
      }
    });

    // Phase changes (match loop switching)
    this.socketService.on('phase-change', (data: { phase: 'neutral' | 'before' | 'during' | 'after' }) => {
      console.log('[TV] Phase change received:', data.phase);
      this.switchToPhase(data.phase);
    });

    // Options updates via Socket.IO (for localOptions used by TvComponent)
    this.socketService.on<OptionsUpdateEvent>('options-update', (options) => {
      console.log('[TV] Options update received via socket:', options);
      this.localOptions = options as LocalOptions;
    });

    // SCREENSHOT À LA DEMANDE (cloud dashboard → Pi)
    this.socketService.on('screenshot-request', () => {
      console.log('[TV] Screenshot request received');
      const activeVideo = this.isManualMode
        ? this.doubleBufferService.getActiveManualPlayer()
        : this.doubleBufferService.getActivePlayer();
      if (!activeVideo) {
        console.warn('[TV] Screenshot failed: no active video element');
        this.socketService.emit('screenshot-data', {
          error: 'no_active_video',
          timestamp: Date.now(),
        } as unknown as Command);
        return;
      }
      const data = this.screenshotService.captureScreenshot(activeVideo);
      if (!data) {
        console.warn('[TV] Screenshot failed: capture returned empty');
        this.socketService.emit('screenshot-data', {
          error: 'capture_failed',
          timestamp: Date.now(),
        } as unknown as Command);
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

    // COMMUNICATION LOCALE VIA BROADCASTCHANNEL

    // Phase changes via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onPhaseChange().subscribe((data: PhaseChangeEvent) => {
        console.log('[TV] Local phase change received:', data.phase);
        this.switchToPhase(data.phase);
      })
    );

    // Commands via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onCommand().subscribe((command) => {
        console.log('[TV] Local command received:', command);
        this.handleTvCommand(command as Command);
      })
    );

    // Options updates via BroadcastChannel (for localOptions used by TvComponent)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onOptionsUpdate().subscribe((options: OptionsUpdateEvent) => {
        console.log('[TV] Local options update received:', options);
        this.localOptions = options as LocalOptions;
      })
    );

    // MASTER-SLAVE TV SYNCHRONISATION

    // S'enregistrer en tant qu'instance TV (avec le type d'écran)
    this.socketService.emit('tv-register', { displayType: this.displayType } as unknown as Command);

    // Re-register on reconnection (socket drop → zombie state → no tv-loop-state)
    this.socketService.onReconnect(() => {
      console.log('[TV] Socket reconnected — re-registering as', this.displayType);
      this.socketService.emit('tv-register', { displayType: this.displayType } as unknown as Command);
    });

    // Recevoir le rôle assigné par le serveur
    this.socketService.on<{ role: 'master' | 'slave' }>('tv-role-assigned', (data) => {
      this.ngZone.run(() => {
        const wasMaster = this.tvRole === 'master';
        this.tvRole = data.role;
        this.isSlaveMode = data.role === 'slave';
        console.log(`[TV] Role assigned: ${data.role}, displayType: ${this.displayType}`);

        // E-23 US-23.3.2: Show demotion notice on PC when Pi takes over as master
        if (wasMaster && this.isSlaveMode && this.displayType === 'tv') {
          console.log('[TV] Demoted from master to slave (Pi took over)');
          this.demotionNotice = true;
          if (this.demotionTimeout) clearTimeout(this.demotionTimeout);
          this.demotionTimeout = setTimeout(() => { this.demotionNotice = false; }, 8000);
        }

        if (this.isSlaveMode) {
          console.log('[TV] Running as SLAVE - analytics disabled, waiting for master state');
          if (this.playbackService.isLoopMode) {
            this.doubleBufferService.captureAndShowFreezeFrame();
            this.doubleBufferService.pauseLoopPlayers();
            console.log('[TV] Slave: paused independent loop, waiting for master sync');
          }
        } else {
          console.log('[TV] Running as MASTER - will emit loop state updates');
        }
      });
    });

    // Recevoir l'état de la boucle du master (slaves uniquement)
    this.socketService.on<LoopState>('tv-loop-state', (state) => {
      if (!this.isSlaveMode) return;
      this.ngZone.run(() => {
        this.handleMasterLoopState(state);
      });
    });

    // E-23 US-23.2.1: HDMI status updates — show splash when no display connected
    this.socketService.on<{ hdmi0: boolean; hdmi1: boolean; wrongPort: boolean }>('hdmi-status-update', (data) => {
      this.ngZone.run(() => {
        if (this.displayType === 'tv') {
          this.hdmiConnected = data.hdmi0 || data.hdmi1;
        } else {
          this.hdmiConnected = data.hdmi1;
        }

        // E-23 US-23.5.3: Track wrong port status
        this.wrongPort = !!data.wrongPort;

        // E-23 US-23.3.4: Refine boot-to-video metric with actual HDMI detection time
        if (this.hdmiConnected && !this.bootMetrics.emitted) {
          this.bootMetrics.hdmiDetectedAt = Date.now();
          console.log('[TV] Boot metric: HDMI detected at', this.bootMetrics.hdmiDetectedAt);
        }
      });
    });

    // E-23 US-23.6.4: Failover promotion — secondary becomes full TV mode
    this.socketService.on<{ reason: string }>('tv-role-promotion', (data) => {
      this.ngZone.run(() => {
        if (this.displayType === 'secondary') {
          console.log(`[TV] Failover promotion: switching to TV mode (${data.reason})`);
          this.displayType = 'tv';
        }
      });
    });

    // E-23 US-23.6.4: Failover demotion — TV returns to secondary mode after recovery
    this.socketService.on<{ reason: string }>('tv-role-demotion', (data) => {
      this.ngZone.run(() => {
        if (this.route.snapshot.data['displayType'] === 'secondary' && this.displayType === 'tv') {
          console.log(`[TV] Failover demotion: returning to secondary mode (${data.reason})`);
          this.displayType = 'secondary';
        }
      });
    });
  }

  public ngOnDestroy() {
    this.stopPlayerStateProgressTracker();

    if (!this.isSlaveMode) {
      this.analyticsService.endSession();
    }

    // Destroy extracted services
    this.playbackService.destroy();
    this.errorRecoveryService.destroy();
    this.doubleBufferService.destroy();

    // Arrêter l'émission des métriques de transition slave
    if (this.transitionMetricsInterval) {
      clearInterval(this.transitionMetricsInterval);
      this.transitionMetricsInterval = null;
    }

    this.watermarkService.destroy();

    this.localBroadcastSubscriptions.forEach(sub => sub.unsubscribe());
    this.localBroadcastSubscriptions = [];
  }

  // =========================================================================
  // SERVICE INITIALIZATION
  // =========================================================================

  /**
   * Initialise les 3 services extraits avec les éléments DOM et les callbacks.
   * Remplace l'ancien initDoubleBuffer() monolithique.
   */
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
        if (!this.isSlaveMode && this.displayType !== 'secondary') {
          this.analyticsService.trackVideoEnd(completed);
        }
      },
      onPlayError: () => {
        this.emitPlayerState({ lastError: 'play_error', isPlaying: false });
      },
      onTransitionMetrics: (metrics) => {
        this.socketService.emit('transition-metrics', metrics);
      },
      getIsSlaveMode: () => this.isSlaveMode,
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
        getIsSlaveMode: () => this.isSlaveMode,
      },
      () => {
        // Memory cleanup callback
        this.doubleBufferService.performMemoryCleanup(
          this.isManualMode,
          this.doubleBufferService.preloadReady
        );
      }
    );

    // Attach error handlers to all players
    this.errorRecoveryService.attachErrorHandlers({ loopA: playerA, loopB: playerB, manualA: manualPlayerA, manualB: manualPlayerB });

    // Ended listeners for the loop → delegated to PlaybackService
    playerA.addEventListener('ended', () => this.playbackService.onVideoEnded('A'));
    playerB.addEventListener('ended', () => this.playbackService.onVideoEnded('B'));

    // TimeUpdate listeners for early preload/switch → delegated to PlaybackService
    playerA.addEventListener('timeupdate', () => this.playbackService.onTimeUpdate('A'));
    playerB.addEventListener('timeupdate', () => this.playbackService.onTimeUpdate('B'));

    // Start watchdog, frame capture, metrics, player state tracker
    this.errorRecoveryService.startWatchdog();
    this.doubleBufferService.startLastFrameCapture();
    this.playbackService.startMetricsInterval();
    this.startPlayerStateProgressTracker();

    // Slave-specific metrics (staleLoopStateCount, preloadRevealCount, preloadCleanupCount)
    this.transitionMetricsInterval = setInterval(() => this.emitSlaveTransitionMetrics(), 30000);

    console.log('[TV] Services initialized (4 players) with error recovery + transition metrics + player state');
  }

  // =========================================================================
  // SERVICE CALLBACKS — called by PlaybackService via callback interfaces
  // =========================================================================

  private onLoopVideoStarted(video: Sponsor, videoIndex: number, player: HTMLVideoElement): void {
    this.errorRecoveryService.incrementVideoPlayCount();
    this.errorRecoveryService.resetConsecutiveErrors();

    // Track analytics (disabled for slaves and secondary — E-23 US-23.7.5)
    if (!this.isSlaveMode && this.displayType !== 'secondary') {
      this.analyticsService.trackVideoStart(video, 'auto');
    }

    // Emit loop state if master
    if (this.tvRole === 'master') {
      this.emitLoopState(videoIndex, video.path, false);
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

    // Player state for cloud monitoring
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

    if (!this.isSlaveMode && this.displayType !== 'secondary') {
      this.analyticsService.trackVideoStart(video, 'auto');
    }

    if (this.tvRole === 'master') {
      this.emitLoopState(videoIndex, video.path, false);
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
  // PLAYER STATE — Émet l'état du player pour le monitoring cloud
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
        // B1-fix: Capturer la durée réelle de la vidéo pour analytics (PoC Proof of Play)
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
    // Phase 4 — PROP-002: targeted commands. If target is specified, ignore if this display is not in the list.
    // Only applies to video/sponsors commands. reload-config is always broadcast.
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
      this._lastActionReceivedAt = Date.now();
      const resolvedVideo = this.resolveSecondaryVariant(video);
      if (this.isSlaveMode) {
        this.preloadManualVideo(resolvedVideo);
      } else {
        this.play(resolvedVideo);
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
  // MANUAL VIDEO PLAYBACK
  // =========================================================================

  private play(video: Video) {
    console.log('tv player : play manual video', video.path);

    const isSponsor = this.playbackService.currentLoopVideos.some(s => s.path === video.path);

    const targetPlayer = this.doubleBufferService.getActiveManualPlayer();

    // ÉTAPE 0: Mettre isManualMode IMMÉDIATEMENT pour bloquer les transitions de boucle
    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this.isManualMode = true;

    // ADR-033: Émettre IMMÉDIATEMENT tv-loop-update avec isManualMode: true
    if (this.tvRole === 'master') {
      this.socketService.emit('tv-loop-update', {
        videoIndex: this.playbackService.currentLoopIndex,
        videoPath: this.playbackService.currentLoopVideos[this.playbackService.currentLoopIndex]?.path || '',
        videoStartedAt: null,
        isManualMode: true,
        manualVideoPath: video.path,
        manualVideoStartedAt: Date.now(),
        manualVideoVisible: false, // ADR-034: slaves should preload, not reveal yet
        updatedAt: Date.now()
      });
    }

    // ÉTAPE 1: Capturer et afficher le freeze-frame IMMÉDIATEMENT
    this.doubleBufferService.captureAndShowFreezeFrame();

    // ÉTAPE 2: Afficher le black overlay pour bloquer la boucle
    this.doubleBufferService.showBlackOverlay();

    // ÉTAPE 3: Garder le player manuel INVISIBLE pendant le chargement
    targetPlayer.style.opacity = '0';
    targetPlayer.style.zIndex = '10';

    // ÉTAPE 4: Configurer la source
    targetPlayer.src = video.path;
    targetPlayer.load();

    let switchDone = false;

    // ÉTAPE 5: Quand la vidéo est prête, la jouer puis rendre visible
    const doSwitch = () => {
      if (switchDone) return;
      switchDone = true;

      targetPlayer.play().then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              targetPlayer.style.opacity = '1';
              this.doubleBufferService.hideFreezeFrame();

              // Tracker (désactivé pour les slaves)
              if (!this.isSlaveMode) {
                if (!this.recordingState.isRecording) {
                  console.log('[TV] Auto-start recording for manual video');
                  this.recordingState.startRecording(false);
                  this._manualRecordingStarted = true;
                }
                if (this.displayType !== 'secondary') {
                  this.analyticsService.trackVideoStart(video, 'manual');
                }
              }

              this.emitPlayerState({
                currentVideo: PlayerStateService.filenameFromPath(video.path),
                currentCategory: null,
                duration: targetPlayer.duration || 0,
                currentTime: 0,
                isManualMode: true,
                isPlaying: true,
                lastError: null,
                lastTransitionAt: new Date().toISOString(),
              });

              // Émettre l'état si master (vidéo manuelle — visible maintenant)
              if (this.tvRole === 'master') {
                this.socketService.emit('tv-loop-update', {
                  videoIndex: this.playbackService.currentLoopIndex,
                  videoPath: this.playbackService.currentLoopVideos[this.playbackService.currentLoopIndex]?.path || '',
                  videoStartedAt: null,
                  isManualMode: true,
                  manualVideoPath: video.path,
                  manualVideoStartedAt: Date.now(),
                  manualVideoVisible: true, // ADR-034: signal slaves to reveal
                  updatedAt: Date.now()
                });
              }

              console.log('tv player : manual video playing, freeze frame hidden');
            }, 200);
          });
        });
      }).catch(err => {
        console.error('tv player : error playing manual video', err);
        this.doubleBufferService.hideFreezeFrame();
        this.doubleBufferService.hideBlackOverlay();
        targetPlayer.style.opacity = '0';
      });
    };

    // Attendre canplaythrough
    const onReady = () => {
      targetPlayer.removeEventListener('canplaythrough', onReady);
      targetPlayer.removeEventListener('canplay', onReadyFallback);
      clearTimeout(fallbackTimeout);
      console.log('tv player : canplaythrough received');
      doSwitch();
    };

    const onReadyFallback = () => {
      setTimeout(() => {
        if (!switchDone) {
          console.log('tv player : using canplay fallback');
          targetPlayer.removeEventListener('canplaythrough', onReady);
          doSwitch();
        }
      }, 500);
    };

    targetPlayer.addEventListener('canplaythrough', onReady, { once: true });
    targetPlayer.addEventListener('canplay', onReadyFallback, { once: true });

    const fallbackTimeout = setTimeout(() => {
      if (!switchDone) {
        console.warn('tv player : manual video timeout, forcing switch');
        targetPlayer.removeEventListener('canplaythrough', onReady);
        targetPlayer.removeEventListener('canplay', onReadyFallback);
        doSwitch();
      }
    }, 5000);

    // Listener pour la fin de la vidéo manuelle
    const onManualEnded = () => {
      console.log('tv player : manual video ended', video.path);
      targetPlayer.removeEventListener('ended', onManualEnded);

      if (!this.isSlaveMode && this.displayType !== 'secondary') {
        this.analyticsService.trackVideoEnd(true);
        if (this._manualRecordingStarted) {
          console.log('[TV] Auto-stop recording after manual video ended');
          this.recordingState.stopRecording(false);
          this._manualRecordingStarted = false;
        }
      }

      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.src = '';

      this.isManualMode = false;
      this.lastTriggerType = 'auto';

      const activeLoopPlayer = this.doubleBufferService.getActivePlayer();
      if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.playbackService.isLoopMode) {
        const resumeAt = this._savedLoopIndex + 1;
        console.log('tv player : loop died during manual, restarting at index', resumeAt);
        this.emitPlayerState({ loopResumedFrom: this._savedLoopIndex });
        this.doubleBufferService.captureAndShowFreezeFrame();
        this.doubleBufferService.resetSwitchState();
        this.playbackService.startSeamlessLoop(resumeAt);
      } else {
        this.doubleBufferService.hideFreezeFrame();
        this.doubleBufferService.hideBlackOverlay();
      }

      console.log('tv player : returning to loop');
    };

    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * ADR-034: Preload a manual video without revealing it.
   * Slaves call this on 'action' and wait for master's manualVideoVisible: true signal.
   */
  private preloadManualVideo(video: Video): void {
    console.log('[TV] Slave: preloading manual video silently (no freeze/overlay):', video.path);

    this.cleanupPreloadState();

    const targetPlayer = this.doubleBufferService.getActiveManualPlayer();

    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this.isManualMode = true;

    // ADR-034 fix: If replacing an already-visible manual video, capture freeze-frame
    const isReplacingManual = targetPlayer.style.opacity === '1' && !targetPlayer.paused;
    if (isReplacingManual) {
      console.log('[TV] Slave: manual→manual transition, capturing freeze-frame');
      this.doubleBufferService.captureAndShowFreezeFrame();
    }

    // Player invisible + muted during preload
    targetPlayer.style.opacity = '0';
    targetPlayer.style.zIndex = '10';
    targetPlayer.muted = true;

    targetPlayer.src = video.path;
    targetPlayer.load();

    this._preloadedManualVideo = video;
    this._preloadedManualPlayer = targetPlayer;

    let preloadDone = false;

    const doPreload = () => {
      if (preloadDone) return;
      preloadDone = true;

      targetPlayer.play().then(() => {
        this._preloadReady = true;
        console.log('[TV] Slave: manual video preloaded and playing (hidden+muted), waiting for reveal signal');

        if (this._pendingReveal) {
          console.log('[TV] Slave: executing pending reveal (master signaled before preload was ready)');
          this._pendingReveal = false;
          this.revealPreloadedVideo();
        }
      }).catch(err => {
        console.error('[TV] Slave: error preloading manual video', err);
        this._pendingReveal = false;
        this.cleanupPreloadState();
      });
    };

    const onReady = () => {
      targetPlayer.removeEventListener('canplaythrough', onReady);
      targetPlayer.removeEventListener('canplay', onReadyFallback);
      clearTimeout(fallbackTimeout);
      doPreload();
    };

    const onReadyFallback = () => {
      setTimeout(() => {
        if (!preloadDone) {
          targetPlayer.removeEventListener('canplaythrough', onReady);
          doPreload();
        }
      }, 500);
    };

    targetPlayer.addEventListener('canplaythrough', onReady, { once: true });
    targetPlayer.addEventListener('canplay', onReadyFallback, { once: true });

    const fallbackTimeout = setTimeout(() => {
      if (!preloadDone) {
        console.warn('[TV] Slave: preload timeout, forcing');
        targetPlayer.removeEventListener('canplaythrough', onReady);
        targetPlayer.removeEventListener('canplay', onReadyFallback);
        doPreload();
      }
    }, 5000);

    const onManualEnded = () => {
      console.log('[TV] Slave: preloaded manual video ended', video.path);
      targetPlayer.removeEventListener('ended', onManualEnded);

      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.src = '';

      this.isManualMode = false;
      this.lastTriggerType = 'auto';
      this._preloadedManualVideo = null;
      this._preloadedManualPlayer = null;

      const activeLoopPlayer = this.doubleBufferService.getActivePlayer();
      if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.playbackService.isLoopMode) {
        const resumeAt = this._savedLoopIndex + 1;
        console.log('[TV] Slave: loop died during preloaded manual, restarting at index', resumeAt);
        this.doubleBufferService.captureAndShowFreezeFrame();
        this.doubleBufferService.resetSwitchState();
        this.playbackService.startSeamlessLoop(resumeAt);
      } else {
        this.doubleBufferService.hideFreezeFrame();
        this.doubleBufferService.hideBlackOverlay();
      }
    };

    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * ADR-034: Reveal a preloaded manual video.
   */
  private revealPreloadedVideo(): void {
    const player = this._preloadedManualPlayer;
    const video = this._preloadedManualVideo;

    if (!player || !video) {
      console.warn('[TV] Slave: revealPreloadedVideo called but no preload state');
      return;
    }

    if (!this._preloadReady) {
      console.log('[TV] Slave: reveal requested but preload not ready yet, deferring');
      this._pendingReveal = true;
      return;
    }

    console.log('[TV] Slave: revealing preloaded manual video (instant):', video.path);

    player.style.opacity = '1';

    // Safe unmute: Chrome pauses on unmute without user interaction
    player.muted = false;
    if (player.paused) {
      console.warn('[TV] Slave: video paused on unmute (autoplay policy), resuming muted');
      player.muted = true;
      player.play().catch(() => {
        console.error('[TV] Slave: muted play also failed after unmute pause');
      });
    }

    this.doubleBufferService.hideFreezeFrame();

    this.emitPlayerState({
      currentVideo: PlayerStateService.filenameFromPath(video.path),
      currentCategory: null,
      duration: player.duration || 0,
      currentTime: 0,
      isManualMode: true,
      isPlaying: true,
      lastError: null,
      lastTransitionAt: new Date().toISOString(),
    });

    console.log('[TV] Slave: preloaded manual video revealed');
    this.transitionMetrics.preloadRevealCount++;

    this._preloadedManualVideo = null;
    this._preloadedManualPlayer = null;
    this._preloadReady = false;
    this._pendingReveal = false;
  }

  /**
   * ADR-034: Clean up preload state without revealing.
   */
  private cleanupPreloadState(): void {
    if (!this._preloadedManualVideo) return;

    console.log('[TV] Slave: cleaning up preload state');
    this.transitionMetrics.preloadCleanupCount++;

    const player = this._preloadedManualPlayer;
    if (player) {
      player.pause();
      player.muted = false;
      player.style.opacity = '0';
      player.removeAttribute('src');
      player.load();
    }

    this._preloadedManualVideo = null;
    this._preloadedManualPlayer = null;
    this._preloadReady = false;
    this._pendingReveal = false;

    this.isManualMode = false;
    this.lastTriggerType = 'auto';
  }

  // =========================================================================
  // LOOP MANAGEMENT
  // =========================================================================

  private sponsors() {
    console.log('[TV] Play loop for phase:', this.activePhase);
    this.playbackService.startSeamlessLoop();
  }

  /**
   * Récupère les vidéos de la boucle pour une phase donnée.
   */
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

    if (this.displayType === 'secondary') {
      return videos.map(video => this.resolveSecondaryVariant(video));
    }

    return videos;
  }

  private resolveSecondaryVariant<T extends { path: string; variants?: { secondary?: { path: string } } }>(video: T): T {
    if (this.displayType !== 'secondary') return video;

    if (video.variants?.secondary?.path) {
      console.log('[TV] Secondary: resolved variant from video object:', video.variants.secondary.path);
      return { ...video, path: video.variants.secondary.path };
    }

    const found = this.findVideoInConfig(video.path);
    if (found?.variants?.secondary?.path) {
      console.log('[TV] Secondary: resolved variant from config lookup:', found.variants.secondary.path);
      return { ...video, path: found.variants.secondary.path };
    }

    console.warn('[TV] Secondary: no variant found for video, using primary path:', video.path);
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

    const siteInfoUrl = `${environment.socketUrl}/api/site-info`;
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
  // MASTER-SLAVE SYNCHRONISATION
  // =========================================================================

  private emitLoopState(videoIndex: number, videoPath: string, isManualMode: boolean, manualVideoPath?: string): void {
    const state: LoopState = {
      videoIndex,
      videoPath,
      videoStartedAt: Date.now(),
      isManualMode,
      manualVideoPath: manualVideoPath || null,
      manualVideoStartedAt: isManualMode ? Date.now() : null,
      manualVideoVisible: false, // ADR-034: loop emissions are never manual-visible
      updatedAt: Date.now()
    };

    this.socketService.emit('tv-loop-update', state);
    console.log('[TV] Master emitted loop state:', { videoIndex, videoPath, isManualMode });
  }

  private handleMasterLoopState(state: LoopState): void {
    console.log('[TV] Slave received master state:', {
      videoPath: state.videoPath,
      videoIndex: state.videoIndex,
      isManualMode: state.isManualMode,
      manualVideoPath: state.manualVideoPath
    });

    // CAS 1: Le master joue une vidéo manuelle
    if (state.isManualMode && state.manualVideoPath) {
      const resolvedVideo = this.resolveSecondaryVariant({
        name: state.manualVideoPath.split('/').pop() || 'manual',
        path: state.manualVideoPath,
        type: 'video/mp4'
      } as Video);

      // Sous-cas 1a: manualVideoVisible !== true → preload si pas déjà fait
      if (state.manualVideoVisible !== true) {
        if (!this._preloadedManualVideo) {
          console.log('[TV] Slave: preloading manual video from master state:', state.manualVideoPath,
            this.displayType === 'secondary' ? `(resolved: ${resolvedVideo.path})` : '');
          this.preloadManualVideo(resolvedVideo);
        }
        return;
      }

      // Sous-cas 1b: manualVideoVisible === true → reveal ou play direct
      if (this._preloadedManualVideo) {
        console.log('[TV] Slave: master revealed, showing preloaded video');
        this.revealPreloadedVideo();
        return;
      }

      // Fallback: manualVideoVisible === true mais pas de preload (backward compat / race condition)
      const currentManualPlayer = this.doubleBufferService.getActiveManualPlayer();
      const currentManualSrc = currentManualPlayer?.src || '';

      if (!this.isManualMode || !currentManualSrc.includes(resolvedVideo.path)) {
        console.log('[TV] Slave: master revealed but no preload ready, direct play:', state.manualVideoPath,
          this.displayType === 'secondary' ? `(resolved: ${resolvedVideo.path})` : '');
        this.play(resolvedVideo);

        if (state.manualVideoStartedAt) {
          const elapsed = (Date.now() - state.manualVideoStartedAt) / 1000;
          if (elapsed > 1) {
            setTimeout(() => {
              const player = this.doubleBufferService.getActiveManualPlayer();
              if (player && player.duration && elapsed < player.duration) {
                player.currentTime = elapsed;
                console.log(`[TV] Slave: seeked manual video to ${elapsed.toFixed(1)}s`);
              }
            }, 500);
          }
        }
      }
      return;
    }

    // CAS 2: Le master est en mode boucle
    if (this._preloadedManualVideo) {
      console.log('[TV] Slave: master returned to loop, cleaning up preload state');
      this.cleanupPreloadState();
    }

    // ADR-033: Guard anti-race condition
    if (this.isManualMode) {
      const msSinceLastAction = Date.now() - this._lastActionReceivedAt;
      if (msSinceLastAction < 2000) {
        console.log(`[TV] Slave: ignoring stale loop state (action received ${msSinceLastAction}ms ago)`);
        this.transitionMetrics.staleLoopStateCount++;
        return;
      }
      console.log('[TV] Slave: master returned to loop, stopping manual video');
      this.stopManualVideoAndReturnToLoop();
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
    }

    // Sync to master's video
    const loopVideos = this.playbackService.currentLoopVideos;
    if (loopVideos.length === 0) {
      console.warn('[TV] Slave: no videos in local loop, ignoring master state');
      return;
    }

    const syncIndex = state.videoIndex % loopVideos.length;
    const localVideo = loopVideos[syncIndex];

    console.log(`[TV] Slave: syncing to index ${syncIndex} (master: ${state.videoPath}, local: ${localVideo?.path})`);

    this.doubleBufferService.captureAndShowFreezeFrame();

    if (localVideo?.path) {
      this.doubleBufferService.playOnActivePlayer(localVideo.path, syncIndex);
    }

    // Seek approximatif au temps du master
    if (state.videoStartedAt) {
      const elapsed = (Date.now() - state.videoStartedAt) / 1000;
      if (elapsed > 1) {
        setTimeout(() => {
          const player = this.doubleBufferService.getActivePlayer();
          if (player && player.duration && elapsed < player.duration) {
            player.currentTime = elapsed;
            console.log(`[TV] Slave: seeked to ${elapsed.toFixed(1)}s`);
          }
        }, 500);
      }
    }
  }

  // =========================================================================
  // MANUAL VIDEO → LOOP TRANSITION
  // =========================================================================

  private stopManualVideoAndReturnToLoop(): void {
    console.log('[TV] Stopping manual video to return to loop');

    this.playbackService.stopManualVideoAndReturnToLoop(
      this.manualPlayerARef.nativeElement,
      this.manualPlayerBRef.nativeElement
    );

    if (!this.isSlaveMode && this.displayType !== 'secondary') {
      this.analyticsService.trackVideoEnd(false);
    }

    if (this.tvRole === 'master') {
      const loopVideos = this.playbackService.currentLoopVideos;
      const idx = this.playbackService.currentLoopIndex;
      this.emitLoopState(idx, loopVideos[idx]?.path || '', false);
    }

    this.isManualMode = false;
    this.lastTriggerType = 'auto';
  }

  // =========================================================================
  // FULL RESET & STOP
  // =========================================================================

  private performFullReset(): void {
    console.log('[TV] 🔄 Performing full video system reset');

    this.errorRecoveryService.stopWatchdog();
    this.doubleBufferService.performFullReset();
    this.playbackService.setLoopMode(false);
    this.isManualMode = false;
    this.errorRecoveryService.resetConsecutiveErrors();

    // Attendre 3s pour que le GPU se libère, puis redémarrer
    setTimeout(() => {
      console.log('[TV] 🔄 Restarting video loop after full reset');
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

  // =========================================================================
  // SLAVE-SPECIFIC TRANSITION METRICS
  // =========================================================================

  private emitSlaveTransitionMetrics(): void {
    const m = this.transitionMetrics;
    if (!this.isSlaveMode) return;
    if (m.staleLoopStateCount === 0 && m.preloadRevealCount === 0 && m.preloadCleanupCount === 0) return;

    this.socketService.emit('transition-metrics', {
      staleLoopStateCount: m.staleLoopStateCount,
      preloadRevealCount: m.preloadRevealCount,
      preloadCleanupCount: m.preloadCleanupCount,
    });

    m.staleLoopStateCount = 0;
    m.preloadRevealCount = 0;
    m.preloadCleanupCount = 0;
  }
}
