import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SocketService, LoopState } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { LocalBroadcastService, PhaseChangeEvent, OptionsUpdateEvent } from '../../services/local-broadcast.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { DoubleBufferVideoService, DoubleBufferCallbacks } from '../../services/double-buffer-video.service';
import { VideoErrorRecoveryService, ErrorRecoveryCallbacks } from '../../services/video-error-recovery.service';
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
import { generateWeightedPlaylist } from '../../utils/weighted-playlist';
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

  // Services extraits (P2 refactoring)
  private readonly doubleBufferService = inject(DoubleBufferVideoService);
  private readonly errorRecoveryService = inject(VideoErrorRecoveryService);
  private readonly watermarkService = inject(WatermarkService);
  private readonly licenseService = inject(LicenseService);
  private readonly playerStateService = inject(PlayerStateService);
  private readonly screenshotService = inject(ScreenshotService);
  private readonly recordingState = inject(RecordingStateService);
  private readonly saasConfigService = inject(SaasConfigService);

  private localBroadcastSubscriptions: Subscription[] = [];

  // Display type: 'tv' (HDMI 0 principal) ou 'secondary' (HDMI 1 écran secondaire)
  public displayType: 'tv' | 'secondary' = 'tv';

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
  private currentLoopVideos: Sponsor[] = [];

  // Score overlay state — delegated to ScoreOverlayComponent
  // Proxy getters for template backward compatibility and emitPlayerState
  public get currentScore() { return this.scoreOverlay?.currentScore ?? null; }
  public get showScoreOverlay() { return this.scoreOverlay?.showScoreOverlay ?? false; }

  // Watermark - délégué au WatermarkService
  public get showWatermark(): boolean {
    return this.watermarkService.showWatermark;
  }

  // Timer state — delegated to ScoreOverlayComponent

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

  // État de la boucle
  public isLoopMode = true;
  private currentLoopIndex = 0;
  private playerA: HTMLVideoElement;
  private playerB: HTMLVideoElement;
  private activePlayer: 'A' | 'B' = 'A'; // Quel player de boucle est visible
  private isStartingLoop = false;
  private pendingSwitch = false;
  private preloadedIndex: number | null = null;
  private preloadReady = false;
  private switchTriggered = false;
  private switchGeneration = 0; // Incrémenté à chaque switchToPhase pour annuler les callbacks en cours
  private lastTimeUpdateCheck = 0;

  // État des players manuels
  private manualPlayerA: HTMLVideoElement;
  private manualPlayerB: HTMLVideoElement;
  private activeManualPlayer: 'A' | 'B' = 'A'; // Quel player manuel est visible
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

  // Watchdog et récupération d'erreurs
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private memoryCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private lastPlaybackTime = 0;
  private lastPlaybackCheck = 0;
  private consecutiveErrors = 0;
  private videoPlayCount = 0; // Compteur de vidéos jouées pour le cleanup périodique
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly MEMORY_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly VIDEO_COUNT_BEFORE_CLEANUP = 50; // Cleanup après 50 vidéos

  // Disk cache warming : prefetch des prochaines vidéos via fetch()
  // Les données vont dans le page cache du kernel, pas dans la mémoire Chromium
  private prefetchedIndices: Set<number> = new Set();
  private prefetchAbortController: AbortController | null = null;
  private readonly PREFETCH_LOOKAHEAD = 3; // Nombre de vidéos à prefetch en avance

  // Canvas freeze-frame
  private freezeCanvas: HTMLCanvasElement;
  private freezeCtx: CanvasRenderingContext2D | null = null;
  private lastFrameCaptureInterval: ReturnType<typeof setInterval> | null = null;
  private hasValidLastFrame = false; // true si le canvas contient un frame valide pré-capturé

  // Black overlay pour bloquer la boucle
  private blackOverlay: HTMLDivElement;

  // Master-Slave synchronisation (second écran via Socket.IO)
  private tvRole: 'master' | 'slave' | null = null;
  private isSlaveMode = false;

  // Transition quality metrics (compteurs agrégés, émis toutes les 30s, reset après)
  private transitionMetrics = {
    earlySwitchCount: 0,
    safetyTimeoutCount: 0,
    cleanupSkippedCount: 0,
    videoErrorCount: 0,
    totalTransitions: 0,
    staleLoopStateCount: 0, // ADR-033: nombre de tv-loop-state stales ignorés par le guard anti-race condition
    preloadRevealCount: 0, // ADR-034: nombre de révélations preload→reveal synchronisées
    preloadCleanupCount: 0, // ADR-034: nombre de nettoyages preload avortés (retour boucle avant reveal)
  };
  private transitionMetricsInterval: ReturnType<typeof setInterval> | null = null;

  // E-23 US-23.3.4: Boot-to-video timing metric
  // hdmiDetectedAt defaults to component creation time — if the first video plays before
  // the hdmi-status event arrives (race condition), we still get a meaningful metric
  // instead of 0ms. The hdmi-status handler refines this with the actual detection time.
  private bootMetrics = {
    hdmiDetectedAt: Date.now(), // fallback: component init time (refined by hdmi-status)
    firstVideoPlayAt: 0,       // timestamp when first video frame plays
    emitted: false,            // true once the metric has been sent (one-shot)
  };

  public ngOnInit() {
    // Lire le displayType depuis la route data (/secondary → 'secondary', /tv → 'tv')
    this.displayType = (this.route.snapshot.data['displayType'] as 'tv' | 'secondary') || 'tv';
    console.log(`[TV] Display type: ${this.displayType}`);

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

    // Initialiser le double-buffer
    this.initDoubleBuffer();

    // Lancer la boucle vidéo
    this.startSeamlessLoop();

    // Initialiser le watermark (délégué au service)
    this.watermarkService.init(this.configuration);

    // Activer le plein écran ET le son au premier clic/touche utilisateur
    const activateFullscreenAndUnmute = () => {
      // Activer le son sur les deux players
      if (this.playerA) this.playerA.muted = false;
      if (this.playerB) this.playerB.muted = false;

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

    // Live Score — score-update, score-reset, options-update, breaking-news, timer-update
    // are now handled by ScoreOverlayComponent directly

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

    // =========================================================================
    // SCREENSHOT À LA DEMANDE (cloud dashboard → Pi)
    // =========================================================================
    this.socketService.on('screenshot-request', () => {
      console.log('[TV] Screenshot request received');
      const activeVideo = this.isManualMode
        ? this.getActiveManualPlayer()
        : this.getActivePlayer();
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

    // =========================================================================
    // COMMUNICATION LOCALE VIA BROADCASTCHANNEL
    // Permet à Remote et TV de communiquer directement sur le même appareil
    // sans passer par le serveur cloud
    // =========================================================================

    // Score, options, breaking news, timer via BroadcastChannel
    // are now handled by ScoreOverlayComponent directly

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
        this.handleTvCommand(command);
      })
    );

    // Options updates via BroadcastChannel (for localOptions used by TvComponent)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onOptionsUpdate().subscribe((options: OptionsUpdateEvent) => {
        console.log('[TV] Local options update received:', options);
        this.localOptions = options as LocalOptions;
      })
    );

    // =========================================================================
    // MASTER-SLAVE TV SYNCHRONISATION
    // Le kiosk est le master (premier connecté), les navigateurs sont des slaves
    // Le master émet son état de boucle, les slaves se synchronisent
    // =========================================================================

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
        // Secondary display syncs as slave to the primary (master)
        // so both screens show the same video at the same time.
        // When secondary variants exist, the slave uses its own variant path via getFilteredVideos().
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
          // Stop independent loop playback — startSeamlessLoop() already ran before
          // tv-register was even emitted, so the slave is playing independently.
          // Pause and show freeze frame; handleMasterLoopState() will restart playback
          // when the master's loop state arrives (next event from server).
          if (this.isLoopMode) {
            this.captureAndShowFreezeFrame();
            this.playerA?.pause();
            this.playerB?.pause();
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
        const wasDisconnected = !this.hdmiConnected;
        // For the primary TV display: connected if HDMI-0 OR HDMI-1 is active
        // (auto-swap/failover handles routing to the correct port)
        // For secondary: connected if HDMI-1 is active
        if (this.displayType === 'tv') {
          this.hdmiConnected = data.hdmi0 || data.hdmi1;
        } else {
          this.hdmiConnected = data.hdmi1;
        }

        // E-23 US-23.5.3: Track wrong port status
        this.wrongPort = !!data.wrongPort;

        // E-23 US-23.3.4: Refine boot-to-video metric with actual HDMI detection time.
        // hdmiDetectedAt defaults to component init time (Date.now()) as fallback.
        // On first hdmi-status event while connected, refine with the actual time.
        // This only updates once (emitted flag prevents overwrite after first video).
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
        // Only revert if this instance was originally a secondary display
        if (this.route.snapshot.data['displayType'] === 'secondary' && this.displayType === 'tv') {
          console.log(`[TV] Failover demotion: returning to secondary mode (${data.reason})`);
          this.displayType = 'secondary';
        }
      });
    });
  }

  /**
   * Affiche une breaking news sur l'écran
   */
  // displayBreakingNews, handleTimerUpdate, startLocalTimer, stopLocalTimer, formatTimerDisplay
  // → delegated to ScoreOverlayComponent

  // =========================================================================
  // PLAYER STATE — Émet l'état du player pour le monitoring cloud
  // =========================================================================

  private playerStateInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Partial update of the player state and emit via Socket.IO.
   * Called on every meaningful change (play, ended, error, phase, manual).
   */
  private emitPlayerState(partial: Partial<import('../../services/player-state.service').PlayerState>): void {
    const state = this.playerStateService.update(partial);
    this.socketService.emit('player-state', state as unknown as Command);
  }

  /**
   * Start periodic progress updates (every 5 seconds).
   * Lightweight: only updates currentTime/progress/duration, no Socket.IO emit
   * (the heartbeat picks up the latest state every 30s).
   */
  private startPlayerStateProgressTracker(): void {
    if (this.playerStateInterval) return;
    this.playerStateInterval = setInterval(() => {
      const player = this.isManualMode
        ? this.getActiveManualPlayer()
        : this.getActivePlayer();
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

  public ngOnDestroy() {
    // Arrêter le tracker de progression du player state
    this.stopPlayerStateProgressTracker();

    // Terminer la session analytics (désactivé pour les slaves)
    if (!this.isSlaveMode) {
      this.analyticsService.endSession();
    }

    // Timer local — nettoyé par ScoreOverlayComponent.ngOnDestroy

    // Arrêter le watchdog
    this.stopWatchdog();

    // Arrêter la capture périodique
    this.stopLastFrameCapture();

    // Arrêter la boucle seamless
    this.stopSeamlessLoop();

    // Annuler les fetch de prefetch en cours
    this.resetPrefetchState();

    // Arrêter l'émission des métriques de transition
    if (this.transitionMetricsInterval) {
      clearInterval(this.transitionMetricsInterval);
      this.transitionMetricsInterval = null;
    }

    // Nettoyer le service watermark
    this.watermarkService.destroy();

    // Se désabonner des événements BroadcastChannel
    this.localBroadcastSubscriptions.forEach(sub => sub.unsubscribe());
    this.localBroadcastSubscriptions = [];

  }

  /**
   * Guard contre les doubles appels de commande via BroadcastChannel + Socket.IO.
   * Quand remote et TV sont dans le même navigateur web, les deux canaux délivrent
   * le même 'command'. Le second appel (ex: load() dans play()) annule le premier
   * → race condition → freeze. Retourne true si l'appel est un doublon à ignorer.
   */
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

  /**
   * Gestionnaire centralisé des commandes TV (BroadcastChannel + Socket.IO).
   * Le guard isDuplicateCommand() empêche le double-traitement quand les deux canaux
   * délivrent le même message (navigateur web avec remote+TV dans le même browser).
   */
  private handleTvCommand(command: Command | { type: string; data?: unknown }): void {
    if (command.type === 'video' && command.data) {
      const video = command.data as Video;
      // Guard: ignorer le doublon BroadcastChannel/Socket.IO pour la même vidéo
      if (this.isDuplicateCommand(`video:${video.path}`)) return;
      this.lastTriggerType = 'manual';
      // ADR-033: Marquer le timestamp pour protéger contre les tv-loop-state stales
      this._lastActionReceivedAt = Date.now();
      const resolvedVideo = this.resolveSecondaryVariant(video);
      // ADR-034: Slaves preload but wait for master's reveal signal
      if (this.isSlaveMode) {
        this.preloadManualVideo(resolvedVideo);
      } else {
        this.play(resolvedVideo);
      }
    } else if (command.type === 'sponsors') {
      if (this.isDuplicateCommand('sponsors')) return;
      this.lastTriggerType = 'auto';
      this.captureAndShowFreezeFrame();
      this.sponsors();
    } else if (command.type === 'reload-config' && command.data) {
      if (this.isDuplicateCommand('reload-config')) return;
      console.log('tv: reloading config for club', command.data);
      this.reloadConfiguration(command.data as Configuration);
    }
  }

  private play(video: Video) {
    console.log('tv player : play manual video', video.path);

    // Si c'est une vidéo de la boucle courante déclenchée manuellement, tracker l'impression
    const isSponsor = this.currentLoopVideos.some(s => s.path === video.path);

    // =======================================================================
    // STRATÉGIE: CANVAS FREEZE-FRAME + BLACK OVERLAY + PLAYER MANUEL
    // 1. Capturer le frame actuel sur le canvas (z-index 20, masque tout)
    // 2. Afficher le black overlay (z-index 5, bloque la boucle physiquement)
    // 3. Rendre le player manuel visible (z-index 10, entre overlay et canvas)
    // 4. Charger la vidéo et la jouer
    // 5. Attendre 200ms APRÈS play() pour que le frame soit vraiment affiché
    // 6. Cacher le freeze-frame (la vidéo manuelle est maintenant visible)
    // Note: le black overlay reste visible pendant toute la lecture manuelle
    // pour garantir qu'on ne voit JAMAIS la boucle en transparence
    // =======================================================================

    const targetPlayer = this.manualPlayerA;

    // ÉTAPE 0: Mettre isManualMode IMMÉDIATEMENT pour bloquer les transitions de boucle
    // (onVideoEnded ignore les ended events quand isManualMode est true)
    // Sauvegarder l'index courant pour reprendre la boucle au bon endroit après la vidéo manuelle
    this._savedLoopIndex = this.currentLoopIndex;
    this.isManualMode = true;

    // ADR-033: Émettre IMMÉDIATEMENT tv-loop-update avec isManualMode: true
    // pour que le serveur mette à jour l'état AVANT tout tv-loop-state stale.
    // Sans cela, un tv-loop-state stale (isManualMode: false) émis par la boucle
    // juste avant cette action peut arriver au slave et tuer sa vidéo manuelle.
    // L'émission tardive (après 2×rAF + 200ms) met aussi à jour manualVideoStartedAt
    // pour permettre le seek approximatif sur les slaves.
    if (this.tvRole === 'master') {
      this.socketService.emit('tv-loop-update', {
        videoIndex: this.currentLoopIndex,
        videoPath: this.currentLoopVideos[this.currentLoopIndex]?.path || '',
        videoStartedAt: null,
        isManualMode: true,
        manualVideoPath: video.path,
        manualVideoStartedAt: Date.now(),
        manualVideoVisible: false, // ADR-034: slaves should preload, not reveal yet
        updatedAt: Date.now()
      });
    }

    // ÉTAPE 1: Capturer et afficher le freeze-frame IMMÉDIATEMENT
    this.captureAndShowFreezeFrame();

    // ÉTAPE 2: Afficher le black overlay pour bloquer la boucle
    this.showBlackOverlay();

    // ÉTAPE 3: Garder le player manuel INVISIBLE pendant le chargement
    // Le freeze-frame (z-index 20) et le black overlay (z-index 5) masquent tout
    // On ne rend le player visible qu'après play() pour éviter le flash blanc
    targetPlayer.style.opacity = '0';
    targetPlayer.style.zIndex = '10';

    // ÉTAPE 4: Configurer la source (le canvas masque tout)
    targetPlayer.src = video.path;
    targetPlayer.load();

    let switchDone = false;

    // ÉTAPE 5: Quand la vidéo est prête, la jouer puis rendre visible
    const doSwitch = () => {
      if (switchDone) return;
      switchDone = true;

      targetPlayer.play().then(() => {
        // IMPORTANT: Attendre 2×rAF + 200ms APRÈS play() pour que le décodeur
        // ait vraiment affiché le premier frame sur le Pi
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              // D'abord rendre le player manuel visible (il a maintenant un frame affiché)
              targetPlayer.style.opacity = '1';

              // Puis cacher le freeze-frame (le player manuel est visible en dessous)
              this.hideFreezeFrame();
              // NOTE: On garde le black overlay visible pendant toute la lecture
              // pour éviter que la boucle transparaisse si la vidéo a des zones transparentes

              // isManualMode déjà mis à true à l'ÉTAPE 0 (avant le chargement)
              this.activeManualPlayer = 'A';

              // Tracker (désactivé pour les slaves)
              if (!this.isSlaveMode) {
                // Auto-start recording temporaire si OFF (ex: vidéo manuelle en boucle par défaut)
                if (!this.recordingState.isRecording) {
                  console.log('[TV] Auto-start recording for manual video');
                  this.recordingState.startRecording(false);
                  this._manualRecordingStarted = true;
                }
                // E-23 US-23.7.5: secondary display ne doit pas tracker les analytics
                if (this.displayType !== 'secondary') {
                  this.analyticsService.trackVideoStart(video, 'manual');
                }
              }

              // Mettre à jour l'état du player pour le monitoring cloud
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
                  videoIndex: this.currentLoopIndex,
                  videoPath: this.currentLoopVideos[this.currentLoopIndex]?.path || '',
                  videoStartedAt: null,
                  isManualMode: true,
                  manualVideoPath: video.path,
                  manualVideoStartedAt: Date.now(),
                  manualVideoVisible: true, // ADR-034: signal slaves to reveal
                  updatedAt: Date.now()
                });
              }

              console.log('tv player : manual video playing, freeze frame hidden');
            }, 200); // 200ms de délai pour le décodeur Pi
          });
        });
      }).catch(err => {
        console.error('tv player : error playing manual video', err);
        this.hideFreezeFrame();
        this.hideBlackOverlay();
        targetPlayer.style.opacity = '0';
      });
    };

    // Attendre canplaythrough (vidéo entièrement buffered)
    const onReady = () => {
      targetPlayer.removeEventListener('canplaythrough', onReady);
      targetPlayer.removeEventListener('canplay', onReadyFallback);
      clearTimeout(fallbackTimeout);
      console.log('tv player : canplaythrough received');
      doSwitch();
    };

    // Fallback après canplay + délai
    const onReadyFallback = () => {
      setTimeout(() => {
        if (!switchDone) {
          console.log('tv player : using canplay fallback');
          targetPlayer.removeEventListener('canplaythrough', onReady);
          doSwitch();
        }
      }, 500); // 500ms après canplay
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

      // Tracker la fin (désactivé pour les slaves ET secondary — E-23 US-23.7.5)
      if (!this.isSlaveMode && this.displayType !== 'secondary') {
        this.analyticsService.trackVideoEnd(true);
        // Auto-stop recording si on l'avait démarré pour cette vidéo manuelle
        if (this._manualRecordingStarted) {
          console.log('[TV] Auto-stop recording after manual video ended');
          this.recordingState.stopRecording(false);
          this._manualRecordingStarted = false;
        }
      }

      // Cacher le player manuel
      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.src = '';

      // Sortir du mode manuel
      this.isManualMode = false;
      this.lastTriggerType = 'auto';

      // Vérifier si la boucle tourne encore correctement
      // La boucle a pu se terminer pendant la lecture manuelle (pas de gestion du ended)
      const activeLoopPlayer = this.getActivePlayer();
      if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.isLoopMode) {
        // Reprendre à la vidéo suivante (celle d'avant a déjà été vue/interrompue)
        const resumeAt = this._savedLoopIndex + 1;
        console.log('tv player : loop died during manual, restarting at index', resumeAt);
        // Signaler la reprise pour le monitoring cloud
        this.emitPlayerState({ loopResumedFrom: this._savedLoopIndex });
        // La boucle est morte — la relancer proprement
        // Le freeze-frame couvre visuellement pendant le redémarrage
        this.captureAndShowFreezeFrame();
        this.pendingSwitch = false;
        this.switchTriggered = false;
        this.startSeamlessLoop(resumeAt);
        // playOnActivePlayer cachera le freeze-frame quand la vidéo sera prête
      } else {
        // La boucle tourne encore — cacher les overlays pour la révéler
        this.hideFreezeFrame();
        this.hideBlackOverlay();
      }

      console.log('tv player : returning to loop');
    };

    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * ADR-034: Preload a manual video without revealing it.
   * Slaves call this on 'action' and wait for master's manualVideoVisible: true signal.
   * Same pipeline as play() but stops before the opacity 0→1 transition.
   */
  private preloadManualVideo(video: Video): void {
    console.log('[TV] Slave: preloading manual video silently (no freeze/overlay):', video.path);

    // Clean up any previous preload
    this.cleanupPreloadState();

    const targetPlayer = this.manualPlayerA;

    // Same ÉTAPE 0 as play(): block loop transitions
    this._savedLoopIndex = this.currentLoopIndex;
    this.isManualMode = true;

    // ADR-034 fix: If replacing an already-visible manual video, capture
    // freeze-frame to cover the gap while the new video loads.
    // If this is the first manual video (from loop), no freeze — loop keeps playing.
    const isReplacingManual = targetPlayer.style.opacity === '1' && !targetPlayer.paused;
    if (isReplacingManual) {
      console.log('[TV] Slave: manual→manual transition, capturing freeze-frame');
      this.captureAndShowFreezeFrame();
    }

    // Player invisible + muted during preload
    targetPlayer.style.opacity = '0';
    targetPlayer.style.zIndex = '10';
    targetPlayer.muted = true;

    // Load video
    targetPlayer.src = video.path;
    targetPlayer.load();

    // Store preload state
    this._preloadedManualVideo = video;
    this._preloadedManualPlayer = targetPlayer;

    let preloadDone = false;

    const doPreload = () => {
      if (preloadDone) return;
      preloadDone = true;

      targetPlayer.play().then(() => {
        // Video is playing but invisible (opacity 0) and muted.
        // Loop keeps playing normally underneath.
        // Wait for revealPreloadedVideo() to be called by handleMasterLoopState.
        this.activeManualPlayer = 'A';
        this._preloadReady = true;
        console.log('[TV] Slave: manual video preloaded and playing (hidden+muted), waiting for reveal signal');

        // Si le master a signalé le reveal avant que le preload soit prêt
        // (fréquent sur navigateur web où le chargement HTTP est plus lent que sur Pi),
        // révéler maintenant que la vidéo est prête
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

    // Same ready/fallback/timeout pattern as play()
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

    // Register ended handler (same as play())
    const onManualEnded = () => {
      console.log('[TV] Slave: preloaded manual video ended', video.path);
      targetPlayer.removeEventListener('ended', onManualEnded);

      // Tracker la fin (slaves/secondary ne trackent pas — E-23 US-23.7.5)

      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.src = '';

      this.isManualMode = false;
      this.lastTriggerType = 'auto';
      this._preloadedManualVideo = null;
      this._preloadedManualPlayer = null;

      const activeLoopPlayer = this.getActivePlayer();
      if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.isLoopMode) {
        const resumeAt = this._savedLoopIndex + 1;
        console.log('[TV] Slave: loop died during preloaded manual, restarting at index', resumeAt);
        this.captureAndShowFreezeFrame();
        this.pendingSwitch = false;
        this.switchTriggered = false;
        this.startSeamlessLoop(resumeAt);
      } else {
        this.hideFreezeFrame();
        this.hideBlackOverlay();
      }
    };

    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * ADR-034: Reveal a preloaded manual video.
   * Called when master signals manualVideoVisible: true.
   */
  private revealPreloadedVideo(): void {
    const player = this._preloadedManualPlayer;
    const video = this._preloadedManualVideo;

    if (!player || !video) {
      console.warn('[TV] Slave: revealPreloadedVideo called but no preload state');
      return;
    }

    // Si le preload n'est pas encore prêt (vidéo encore en chargement HTTP),
    // différer le reveal jusqu'à ce que play() résolve dans doPreload().
    // Fréquent sur navigateur web où le master finit avant le slave.
    if (!this._preloadReady) {
      console.log('[TV] Slave: reveal requested but preload not ready yet, deferring');
      this._pendingReveal = true;
      return;
    }

    console.log('[TV] Slave: revealing preloaded manual video (instant):', video.path);

    // ADR-034 fix: Reveal instantly — no 2×rAF+200ms delay needed.
    // The master already waited that long before signaling manualVideoVisible: true.
    // The video is loaded, decoded, and playing (hidden+muted).
    player.style.opacity = '1';

    // Safe unmute: Chrome's autoplay policy pauses a playing video when
    // programmatically unmuted on a tab with no user interaction (/secondary).
    // The master's play() never unmutes (keeps HTML muted attribute), so
    // consistency + safety = try unmuting, detect pause, fallback to muted.
    player.muted = false;
    if (player.paused) {
      console.warn('[TV] Slave: video paused on unmute (autoplay policy), resuming muted');
      player.muted = true;
      player.play().catch(() => {
        // Last resort: if even muted play fails, at least show the frame
        console.error('[TV] Slave: muted play also failed after unmute pause');
      });
    }

    this.hideFreezeFrame(); // Hide freeze-frame if shown (manual→manual transition)

    // Mettre à jour l'état du player pour le monitoring cloud
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

    // Clear preload state (video is now playing normally)
    this._preloadedManualVideo = null;
    this._preloadedManualPlayer = null;
    this._preloadReady = false;
    this._pendingReveal = false;
  }

  /**
   * ADR-034: Clean up preload state without revealing.
   * Called when master returns to loop before reveal signal.
   */
  private cleanupPreloadState(): void {
    if (!this._preloadedManualVideo) return;

    console.log('[TV] Slave: cleaning up preload state');
    this.transitionMetrics.preloadCleanupCount++;

    const player = this._preloadedManualPlayer;
    if (player) {
      player.pause();
      player.muted = false; // Reset mute state
      player.style.opacity = '0';
      player.removeAttribute('src');
      player.load();
    }

    this._preloadedManualVideo = null;
    this._preloadedManualPlayer = null;
    this._preloadReady = false;
    this._pendingReveal = false;

    // Reset manual mode if it was set by preload
    this.isManualMode = false;
    this.lastTriggerType = 'auto';
  }

  private sponsors() {
    console.log('[TV] Play loop for phase:', this.activePhase);

    // Utiliser le double-buffer pour la boucle seamless
    this.startSeamlessLoop();
  }

  /**
   * Récupère les vidéos de la boucle pour une phase donnée.
   * Si la phase n'a pas de loopVideos configurés, utilise sponsors[] global.
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
        // Fallback: utiliser la boucle globale
        videos = this.configuration.sponsors || [];
      }
    }

    // Secondary display: utiliser la variante secondaire quand disponible
    if (this.displayType === 'secondary') {
      return videos.map(video => this.resolveSecondaryVariant(video));
    }

    return videos;
  }

  /**
   * Résout la variante secondaire d'une vidéo si le displayType est 'secondary'.
   * Remplace le path par celui de la variante secondaire quand disponible.
   * Pour les vidéos manuelles reçues sans variants (ex: via tv-loop-state),
   * cherche dans la configuration complète par le path du master.
   */
  private resolveSecondaryVariant<T extends { path: string; variants?: { secondary?: { path: string } } }>(video: T): T {
    if (this.displayType !== 'secondary') return video;

    // Si la vidéo a déjà sa variante secondaire, l'utiliser
    if (video.variants?.secondary?.path) {
      console.log('[TV] Secondary: resolved variant from video object:', video.variants.secondary.path);
      return { ...video, path: video.variants.secondary.path };
    }

    // Sinon, chercher dans la configuration complète (catégories + sponsors + timeCategories)
    const found = this.findVideoInConfig(video.path);
    if (found?.variants?.secondary?.path) {
      console.log('[TV] Secondary: resolved variant from config lookup:', found.variants.secondary.path);
      return { ...video, path: found.variants.secondary.path };
    }

    // Monitoring : pas de variante secondaire trouvée
    console.warn('[TV] Secondary: no variant found for video, using primary path:', video.path);
    return video;
  }

  /**
   * Cherche une vidéo dans toute la configuration par son path.
   * Parcourt sponsors[], timeCategories[].loopVideos[] et categories[].videos[] (récursif).
   */
  private findVideoInConfig(path: string): Video | Sponsor | null {
    // Chercher dans sponsors[]
    const sponsor = this.configuration.sponsors?.find(s => s.path === path);
    if (sponsor) return sponsor;

    // Chercher dans timeCategories[].loopVideos[]
    if (this.configuration.timeCategories) {
      for (const tc of this.configuration.timeCategories) {
        const loopVideo = tc.loopVideos?.find(v => v.path === path);
        if (loopVideo) return loopVideo;
      }
    }

    // Chercher dans categories[] (récursif)
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

  /**
   * Change la phase active et recharge la boucle correspondante.
   * Met également à jour le contexte analytics.
   * Utilise freeze-frame + black overlay pour une transition sans flash.
   *
   * Si une vidéo manuelle est en cours, elle sera coupée et on revient à la boucle.
   * Si on clique sur la même phase, on relance quand même la boucle (utile pour
   * couper une vidéo manuelle et revenir à la boucle).
   */
  public switchToPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    console.log('[TV] Switching to phase:', phase, 'isManualMode:', this.isManualMode);

    // Annuler tout switchPlayers/onVideoEnded en cours pour éviter les race conditions
    this.switchGeneration++;
    this.pendingSwitch = false;
    this.switchTriggered = false;

    // Réinitialiser le prefetch (la liste de vidéos va changer)
    this.resetPrefetchState();

    // Si une vidéo manuelle est en cours, on la coupe pour revenir à la boucle
    // même si c'est la même phase
    const wasInManualMode = this.isManualMode;
    if (this.isManualMode) {
      console.log('[TV] Cutting manual video to return to loop');
      this.stopManualVideoAndReturnToLoop();
    }

    // Si même phase ET on ne vient PAS de couper une vidéo manuelle, ne rien faire
    // (la boucle tourne déjà)
    // IMPORTANT: Si on vient du mode manuel, on doit TOUJOURS continuer pour
    // cacher le black overlay et relancer la boucle proprement
    if (phase === this.activePhase && !wasInManualMode) {
      // Vérifier si la boucle est bien en cours, sinon la relancer
      if (this.isLoopMode && !this.pendingSwitch) {
        const activePlayer = this.getActivePlayer();
        if (!activePlayer.paused) {
          console.log('[TV] Already in phase', phase, 'and loop is running - skipping');
          return;
        }
      }
      console.log('[TV] Same phase but loop not running, restarting');
    }

    // ÉTAPE 1: Capturer le freeze-frame AVANT de changer quoi que ce soit
    const freezeSuccess = this.captureAndShowFreezeFrame();
    if (!freezeSuccess) {
      // Fallback: afficher le black overlay si le freeze-frame échoue
      this.showBlackOverlay();
    }

    this.activePhase = phase;

    // Mettre à jour l'état du player pour le monitoring cloud
    this.emitPlayerState({ phase });

    // Mapper la phase vers la période analytics
    const periodMap: Record<string, 'pre_match' | 'halftime' | 'post_match' | 'loop'> = {
      'neutral': 'loop',
      'before': 'pre_match',
      'during': 'halftime',
      'after': 'post_match'
    };
    const period = periodMap[phase];
    this.updatePeriod(period);

    // Recharger la boucle avec les vidéos de la phase
    this.lastTriggerType = 'auto';
    this.sponsors();

    // Vérifier la visibilité du watermark (peut dépendre de la phase)
    this.watermarkService.setActivePhase(phase);

    // Le freeze-frame sera caché automatiquement quand la nouvelle vidéo joue
    // via startSeamlessLoop -> playOnActivePlayer
  }

  private reloadConfiguration(config: Configuration) {
    console.log('tv: updating configuration and playlist');

    // ÉTAPE 1: Capturer le freeze-frame AVANT de changer quoi que ce soit
    const freezeSuccess = this.captureAndShowFreezeFrame();
    if (!freezeSuccess) {
      this.showBlackOverlay();
    }

    this.configuration = config;

    // Mettre à jour la configuration dans l'analytics service
    this.analyticsService.setConfiguration(config);

    // Réinitialiser à la phase neutre
    this.activePhase = 'neutral';
    this.updatePeriod('loop');

    // Lancer la nouvelle boucle (sponsors() gère maintenant la playlist selon la phase)
    // Le freeze-frame sera caché automatiquement par playOnActivePlayer
    this.lastTriggerType = 'auto';
    this.sponsors();

    // Réinitialiser le watermark avec la nouvelle configuration
    this.watermarkService.setConfiguration(config);
  }

  /**
   * Méthodes publiques pour contrôler le contexte analytics sponsors
   * (appelées depuis la télécommande ou des événements externes)
   */
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

  /**
   * Gère la mise à jour du score en direct
   * Inclut les logos des équipes depuis les options locales
   */
  // handleScoreUpdate, triggerGoalAnimation, playGoalSound, getGoalAnimationStyle,
  // showGoalPopup, toggleScoreOverlay, getOverlayPosition
  // → delegated to ScoreOverlayComponent

  // ============================================================================
  // WATERMARK - Délégué au WatermarkService (P2 refactoring)
  // ============================================================================

  /**
   * Calcule les styles dynamiques du watermark (délégué au service)
   */
  public getWatermarkStyles(): Record<string, string> {
    return this.watermarkService.getStyles();
  }

  /**
   * Retourne la classe d'animation du watermark (délégué au service)
   */
  public getWatermarkAnimationClass(): string {
    return this.watermarkService.getAnimationClass();
  }

  /**
   * Retourne le src de l'image watermark avec cache-buster pour les retries
   */
  public getWatermarkImageSrc(): string | null {
    return this.watermarkService.getImageSrc();
  }

  /**
   * Gère les erreurs de chargement de l'image watermark (délégué au service)
   */
  public onWatermarkError(): void {
    this.watermarkService.onImageError();
  }

  /**
   * Récupère le site_id depuis l'API du serveur local et configure le service analytics
   */
  private loadSiteId(): void {
    // En mode SaaS, le siteId provient du SaasConfigService (URL param + localStorage)
    // Pas d'API locale /api/site-info disponible
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

  // ===========================================================================
  // DOUBLE-BUFFER VIDEO SYSTEM
  // Deux players qui alternent: un joue pendant que l'autre précharge
  // Permet des transitions sans flash noir
  // ===========================================================================

  /**
   * Initialise les 4 players (2 pour boucle, 2 pour manuel) et le canvas freeze-frame
   */
  private initDoubleBuffer(): void {
    // Players de boucle
    this.playerA = this.playerARef.nativeElement;
    this.playerB = this.playerBRef.nativeElement;

    // Players manuels
    this.manualPlayerA = this.manualPlayerARef.nativeElement;
    this.manualPlayerB = this.manualPlayerBRef.nativeElement;

    // Canvas freeze-frame
    this.freezeCanvas = this.freezeCanvasRef?.nativeElement;
    if (this.freezeCanvas) {
      this.freezeCtx = this.freezeCanvas.getContext('2d');
      // Définir la taille du canvas (720p pour économiser la mémoire sur Pi)
      this.freezeCanvas.width = 1280;
      this.freezeCanvas.height = 720;
    }

    // Black overlay
    this.blackOverlay = this.blackOverlayRef?.nativeElement;

    // Configurer les players de boucle
    [this.playerA, this.playerB].forEach((player, i) => {
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      console.log(`[TV] Loop player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Configurer les players manuels
    [this.manualPlayerA, this.manualPlayerB].forEach((player, i) => {
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      // Cachés par défaut
      this.setManualPlayerVisible(player, false);
      console.log(`[TV] Manual player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Player A de boucle est visible au départ
    this.setPlayerVisible(this.playerA, true);
    this.setPlayerVisible(this.playerB, false);
    this.activePlayer = 'A';

    // Ended listeners pour la boucle
    this.playerA.addEventListener('ended', () => this.onVideoEnded('A'));
    this.playerB.addEventListener('ended', () => this.onVideoEnded('B'));

    // TimeUpdate listeners pour le preload anticipé et l'early switch
    // Déclenche le préchargement 1.5s avant la fin et le switch 0.5s avant
    this.playerA.addEventListener('timeupdate', () => this.onTimeUpdate('A'));
    this.playerB.addEventListener('timeupdate', () => this.onTimeUpdate('B'));

    // Error handlers pour TOUS les players (critique pour éviter les crashs)
    this.playerA.addEventListener('error', (e) => this.handleVideoError(this.playerA, 'loop-A', e));
    this.playerB.addEventListener('error', (e) => this.handleVideoError(this.playerB, 'loop-B', e));
    this.manualPlayerA.addEventListener('error', (e) => this.handleVideoError(this.manualPlayerA, 'manual-A', e));
    this.manualPlayerB.addEventListener('error', (e) => this.handleVideoError(this.manualPlayerB, 'manual-B', e));

    // Stall handlers (vidéo bloquée en buffering)
    this.playerA.addEventListener('stalled', () => this.handleVideoStall(this.playerA, 'loop-A'));
    this.playerB.addEventListener('stalled', () => this.handleVideoStall(this.playerB, 'loop-B'));

    // Démarrer le watchdog de santé
    this.startWatchdog();

    // Démarrer la capture périodique du dernier frame visible
    // Sur Chromium/Pi, le décodeur hardware libère le frame buffer à 'ended',
    // donc captureAndShowFreezeFrame() dans onVideoEnded() capture du noir.
    // On pré-capture le frame toutes les 500ms pour avoir toujours un frame valide.
    this.startLastFrameCapture();

    // Émettre les métriques de transition toutes les 30s (aligné avec heartbeat)
    this.transitionMetricsInterval = setInterval(() => this.emitTransitionMetrics(), 30000);

    // Démarrer le tracker de progression du player state (mise à jour toutes les 5s)
    this.startPlayerStateProgressTracker();

    console.log('[TV] Double-buffer initialized (4 players) with error recovery + transition metrics + player state');
  }

  /**
   * Rend un player manuel visible ou invisible
   */
  private setManualPlayerVisible(player: HTMLVideoElement, visible: boolean): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = visible ? '11' : '10';
  }

  /**
   * Retourne le player manuel actif
   */
  private getActiveManualPlayer(): HTMLVideoElement {
    return this.activeManualPlayer === 'A' ? this.manualPlayerA : this.manualPlayerB;
  }

  /**
   * Retourne le player manuel inactif
   */
  private getInactiveManualPlayer(): HTMLVideoElement {
    return this.activeManualPlayer === 'A' ? this.manualPlayerB : this.manualPlayerA;
  }

  /**
   * Appelé à chaque mise à jour du temps de lecture
   * Déclenche le préchargement 3s avant la fin, puis le switch 500ms avant
   * Throttled pour éviter la surcharge CPU
   */
  private onTimeUpdate(fromPlayer: 'A' | 'B'): void {
    if (!this.isLoopMode || fromPlayer !== this.activePlayer) return;
    if (this.isManualMode) return; // Ne pas déclencher d'early switch pendant une vidéo manuelle
    if (this.switchTriggered || this.pendingSwitch) return;

    // Throttle: ne vérifier que toutes les 200ms max
    const now = performance.now();
    if (now - this.lastTimeUpdateCheck < 200) return;
    this.lastTimeUpdateCheck = now;

    const player = this.getActivePlayer();
    if (!player.duration || player.duration <= 0) return;

    const remaining = player.duration - player.currentTime;
    const elapsed = player.currentTime;

    // Préchauffer le cache disque à mi-vidéo pour les 3 prochaines vidéos
    // Les données vont dans le page cache kernel, pas dans la mémoire Chromium
    if (elapsed >= player.duration * 0.5 && !this.prefetchedIndices.has(this.currentLoopIndex)) {
      this.prefetchedIndices.add(this.currentLoopIndex); // Marquer comme traité pour ne pas refetch
      this.warmDiskCache(this.currentLoopIndex);
    }

    // Précharger 1.5s avant la fin seulement - minimise le temps de décodage parallèle
    // Le préchargement cause une saccade, donc on le retarde au maximum
    const preloadThreshold = Math.min(1.5, player.duration * 0.15); // 1.5s ou 15% max
    if (remaining <= preloadThreshold && !this.preloadReady && this.preloadedIndex === null) {
      const nextIndex = (this.currentLoopIndex + 1) % this.currentLoopVideos.length;
      console.log(`[TV] Starting late preload, ${remaining.toFixed(1)}s remaining`);
      this.preloadOnInactivePlayer(nextIndex);
    }

    // Déclencher le switch 500ms avant la fin (ou 300ms si vidéo courte)
    const switchThreshold = player.duration > 3 ? 0.5 : 0.3;
    if (remaining <= switchThreshold && remaining > 0) {
      console.log(`[TV] Triggering early switch, ${remaining.toFixed(2)}s remaining`);
      this.transitionMetrics.earlySwitchCount++;
      this.transitionMetrics.totalTransitions++;
      this.switchTriggered = true;
      this.triggerSwitch();
    }
  }

  /**
   * Rend un player visible ou invisible via styles inline
   * @param zIndex optionnel: z-index à appliquer (défaut: 2 si visible, 0 si caché)
   */
  private setPlayerVisible(player: HTMLVideoElement, visible: boolean, zIndex?: number): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = String(zIndex ?? (visible ? '2' : '0'));
  }

  /**
   * Retourne le player actuellement actif (visible)
   */
  private getActivePlayer(): HTMLVideoElement {
    return this.activePlayer === 'A' ? this.playerA : this.playerB;
  }

  /**
   * Retourne le player inactif (caché, pour préchargement)
   */
  private getInactivePlayer(): HTMLVideoElement {
    return this.activePlayer === 'A' ? this.playerB : this.playerA;
  }

  /**
   * Démarre la boucle vidéo avec double-buffer
   */
  private startSeamlessLoop(resumeIndex?: number): void {
    if (this.isStartingLoop) {
      console.log('[TV] startSeamlessLoop already in progress, skipping');
      return;
    }
    this.isStartingLoop = true;

    // Réinitialiser le prefetch (nouvelle boucle = nouvelle liste de vidéos)
    this.resetPrefetchState();

    // Arrêter les players existants
    this.playerA?.pause();
    this.playerB?.pause();

    this.isLoopMode = true;
    this.pendingSwitch = false;
    this.switchTriggered = false;

    // Récupérer les vidéos de la boucle
    const loopVideos = this.getLoopVideosForPhase(this.activePhase);
    this.currentLoopVideos = loopVideos;

    // Filtrer les étapes sans vidéo pour éviter des écrans noirs
    const validVideos = loopVideos.filter(v => v?.path);
    if (validVideos.length !== loopVideos.length) {
      console.warn(`[TV] Filtered out ${loopVideos.length - validVideos.length} step(s) with no video path`);
    }
    // Générer la playlist pondérée (weight absent = 1 → round-robin classique)
    this.currentLoopVideos = generateWeightedPlaylist(validVideos);

    if (validVideos.length === 0) {
      console.warn('[TV] No videos in loop');
      this.isLoopMode = false;
      this.isStartingLoop = false;
      // Cacher les overlays pour ne pas rester figé sur un écran noir/freeze
      // SAUF le black overlay si une vidéo manuelle est en cours
      this.hideFreezeFrame();
      if (!this.isManualMode) {
        this.hideBlackOverlay();
      }
      return;
    }

    // Reprendre à l'index demandé (clampé à la taille de la boucle) ou 0 par défaut
    const startIndex = (resumeIndex != null && validVideos.length > 0)
      ? resumeIndex % validVideos.length
      : 0;
    this.currentLoopIndex = startIndex;

    // En mode slave, ne pas jouer indépendamment — attendre les directives du master.
    // Cela arrive quand switchToPhase() ou sponsors() relance la boucle sur le slave.
    // La première boucle au boot est aussi concernée : tv-role-assigned pausera ensuite.
    if (this.isSlaveMode) {
      console.log('[TV] Slave mode: loop ready with', validVideos.length, 'videos, waiting for master sync');
      this.isStartingLoop = false;
      return;
    }

    console.log('[TV] Starting loop with', validVideos.length, 'videos at index', startIndex);

    // Jouer la vidéo à l'index de reprise sur le player actif
    this.playOnActivePlayer(startIndex);

    // NE PAS précharger immédiatement - attendre les dernières secondes
    // Cela évite de décoder 2 vidéos en parallèle et réduit les saccades

    setTimeout(() => {
      this.isStartingLoop = false;
    }, 500);
  }

  /**
   * Joue une vidéo sur le player actif
   * Cache le freeze-frame une fois que la vidéo est en lecture
   */
  private playOnActivePlayer(index: number): void {
    const loopVideos = this.currentLoopVideos;
    if (loopVideos.length === 0) return;

    const videoIndex = index % loopVideos.length;
    const video = loopVideos[videoIndex];

    // Guard: skip step if no video path (prevents black screen)
    if (!video?.path) {
      console.warn(`[TV] Skipping step ${videoIndex}: no video path`);
      const nextIndex = (videoIndex + 1) % loopVideos.length;
      if (nextIndex !== videoIndex) {
        this.playOnActivePlayer(nextIndex);
      }
      return;
    }

    const player = this.getActivePlayer();

    console.log(`[TV] Playing video ${videoIndex} on player ${this.activePlayer}:`, video.path);

    player.src = video.path;
    player.load();

    let playStarted = false;

    const doPlay = () => {
      if (playStarted) return;
      playStarted = true;

      player.play().then(() => {
        this.ngZone.run(() => {
          this.currentLoopIndex = videoIndex;
          this.lastTriggerType = 'auto';

          // Incrémenter le compteur pour le cleanup mémoire
          this.incrementVideoPlayCount();

          // Tracker (désactivé pour les slaves ET le secondary display — E-23 US-23.7.5)
          if (!this.isSlaveMode && this.displayType !== 'secondary') {
            this.analyticsService.trackVideoStart(video, 'auto');
          }

          // Émettre l'état de la boucle si master
          if (this.tvRole === 'master') {
            this.emitLoopState(videoIndex, video.path, false);
          }

          console.log(`[TV] Now playing video ${videoIndex} on ${this.activePlayer}`);

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

          // Mettre à jour l'état du player pour le monitoring cloud
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
            // Effacer loopResumedFrom après la première vidéo de reprise
            loopResumedFrom: null,
          });

          // Attendre que le player rende réellement des pixels avant de cacher le freeze-frame.
          // Polling readyState + timeupdate au lieu d'un timer fixe de 300ms
          let revealed = false;
          const safetyTimeout = setTimeout(() => {
            if (!revealed) {
              revealed = true;
              console.warn('[TV] playOnActivePlayer frame detection timeout, revealing');
              this.transitionMetrics.safetyTimeoutCount++;
              this.hideFreezeFrame();
              if (!this.isManualMode) {
                this.hideBlackOverlay();
              }
            }
          }, 1500);

          const reveal = () => {
            if (revealed) return;
            revealed = true;
            clearTimeout(safetyTimeout);
            player.removeEventListener('timeupdate', onFirstTimeUpdate);
            requestAnimationFrame(() => {
              this.hideFreezeFrame();
              if (!this.isManualMode) {
                this.hideBlackOverlay();
              }
            });
          };

          const checkFrame = () => {
            if (revealed) return;
            if (player.readyState >= 4 && player.currentTime > 0) {
              reveal();
            } else {
              requestAnimationFrame(checkFrame);
            }
          };

          const onFirstTimeUpdate = () => {
            reveal();
          };
          player.addEventListener('timeupdate', onFirstTimeUpdate, { once: true });

          requestAnimationFrame(checkFrame);
        });
      }).catch(err => {
        console.error('[TV] Error playing video:', err, '- skipping to next');
        // En cas d'erreur, cacher quand même le freeze-frame
        this.hideFreezeFrame();
        if (!this.isManualMode) {
          this.hideBlackOverlay();
        }
        setTimeout(() => {
          const nextIndex = (videoIndex + 1) % this.currentLoopVideos.length;
          if (nextIndex !== videoIndex) {
            this.playOnActivePlayer(nextIndex);
          }
        }, 1000);
      });
    };

    // Attendre canplaythrough avant de jouer (la vidéo est décodée et prête)
    // Sur Pi, cela garantit que le décodeur hardware a le premier I-frame prêt
    player.addEventListener('canplaythrough', doPlay, { once: true });

    // Safety timeout — si canplaythrough ne se déclenche pas après 3s, jouer quand même
    setTimeout(() => {
      if (!playStarted) {
        console.warn('[TV] canplaythrough timeout in playOnActivePlayer, forcing play');
        doPlay();
      }
    }, 3000);
  }

  /**
   * Précharge une vidéo sur le player inactif
   */
  private preloadOnInactivePlayer(index: number): void {
    const loopVideos = this.currentLoopVideos;
    if (loopVideos.length === 0) return;

    const videoIndex = index % loopVideos.length;
    const video = loopVideos[videoIndex];
    const player = this.getInactivePlayer();

    // Si déjà préchargé, ne rien faire
    if (this.preloadedIndex === videoIndex && this.preloadReady) {
      console.log(`[TV] Video ${videoIndex} already preloaded`);
      return;
    }

    // Guard: skip step if no video path
    if (!video?.path) {
      console.warn(`[TV] Skipping preload for step ${videoIndex}: no video path`);
      // Chercher la prochaine vidéo valide
      const nextIndex = (videoIndex + 1) % loopVideos.length;
      if (nextIndex !== videoIndex) {
        this.preloadOnInactivePlayer(nextIndex);
      }
      return;
    }

    console.log(`[TV] Preloading video ${videoIndex} on inactive player:`, video.path);

    this.preloadReady = false;
    this.preloadedIndex = videoIndex;

    // Restaurer preload='auto' si le cleanup l'avait mis à 'none'
    player.preload = 'auto';
    player.src = video.path;
    player.load();

    // Écouter quand la vidéo est prête
    const onCanPlay = () => {
      if (this.preloadedIndex === videoIndex) {
        this.preloadReady = true;
        console.log(`[TV] Video ${videoIndex} preloaded and ready`);
      }
      player.removeEventListener('canplaythrough', onCanPlay);
    };
    player.addEventListener('canplaythrough', onCanPlay);
  }

  /**
   * Nettoie le player inactif après un switch pour libérer la mémoire GPU.
   * Chaque vidéo décodée occupe ~30-50MB de buffers décodeur.
   * Sans cleanup, la mémoire croît linéairement avec le nombre de vidéos jouées
   * et finit par causer un OOM kill de Chromium.
   */
  private cleanupInactivePlayer(): void {
    // Après un switch, le player actif a changé.
    // getInactivePlayer() retourne donc l'ancien player qui a fini de jouer.
    const inactivePlayer = this.getInactivePlayer();
    if (!inactivePlayer) return;

    // Ne pas nettoyer si un preload est en cours sur ce player
    if (this.preloadReady || this.preloadedIndex !== null) return;

    // Ne pas nettoyer si la vidéo active est courte (< 5s) — le preload va
    // commencer bientôt et aura besoin de ce player. Le cleanup arriverait
    // juste avant le preload, forçant un rechargement complet depuis le disque.
    const activePlayer = this.getActivePlayer();
    if (activePlayer?.duration && activePlayer.duration < 5) {
      console.log('[TV] Skipping cleanup: active video is short, preload will need inactive player soon');
      this.transitionMetrics.cleanupSkippedCount++;
      return;
    }

    if (inactivePlayer.src) {
      inactivePlayer.pause();
      inactivePlayer.removeAttribute('src');
      inactivePlayer.load(); // Force libération des buffers décodeur GPU
      inactivePlayer.preload = 'none'; // Empêche re-buffering automatique
      console.log('[TV] 🧹 Cleaned inactive player after switch (freed decoder buffers)');
    }
  }

  /**
   * Émet les métriques de transition vers le serveur local via Socket.IO.
   * Appelé toutes les 30s (aligné avec le heartbeat du sync-agent).
   * Les compteurs sont accumulés par le serveur local, puis lus et reset par le sync-agent.
   * Seul le master émet (les slaves ne font pas de transitions réelles).
   */
  private emitTransitionMetrics(): void {
    // Le slave n'émet que staleLoopStateCount (les autres métriques viennent du master)
    const m = this.transitionMetrics;
    if (this.isSlaveMode) {
      if (m.staleLoopStateCount > 0 || m.preloadRevealCount > 0 || m.preloadCleanupCount > 0) {
        this.socketService.emit('transition-metrics', {
          staleLoopStateCount: m.staleLoopStateCount,
          preloadRevealCount: m.preloadRevealCount,
          preloadCleanupCount: m.preloadCleanupCount,
        });
        m.staleLoopStateCount = 0;
        m.preloadRevealCount = 0;
        m.preloadCleanupCount = 0;
      }
      return;
    }

    // Ne rien émettre si aucune activité
    if (m.totalTransitions === 0 && m.safetyTimeoutCount === 0 && m.videoErrorCount === 0 && m.staleLoopStateCount === 0) return;

    this.socketService.emit('transition-metrics', {
      earlySwitchCount: m.earlySwitchCount,
      safetyTimeoutCount: m.safetyTimeoutCount,
      cleanupSkippedCount: m.cleanupSkippedCount,
      videoErrorCount: m.videoErrorCount,
      totalTransitions: m.totalTransitions,
      staleLoopStateCount: m.staleLoopStateCount,
    });

    // Reset après émission
    m.earlySwitchCount = 0;
    m.safetyTimeoutCount = 0;
    m.cleanupSkippedCount = 0;
    m.videoErrorCount = 0;
    m.totalTransitions = 0;
    m.staleLoopStateCount = 0;
  }

  /**
   * Préchauffe le cache disque du kernel pour les prochaines vidéos de la boucle.
   * Utilise fetch() pour lire les fichiers vidéo en mémoire puis les jeter.
   * Les données restent dans le page cache du kernel Linux, rendant le preload
   * quasi-instantané quand le player en a besoin.
   *
   * Appelé à mi-vidéo par onTimeUpdate pour avoir le temps de charger
   * avant que le preload réel ne se déclenche (1.5s avant la fin).
   *
   * Crucial pour les boucles de 20-100+ vidéos où la vidéo 0 n'est plus
   * en cache quand on y revient après 19+ autres vidéos.
   */
  private warmDiskCache(fromIndex: number): void {
    const videos = this.currentLoopVideos;
    if (videos.length <= 1) return;

    // Annuler les fetch en cours si changement de contexte
    this.prefetchAbortController?.abort();
    this.prefetchAbortController = new AbortController();
    const signal = this.prefetchAbortController.signal;

    for (let offset = 1; offset <= this.PREFETCH_LOOKAHEAD; offset++) {
      const targetIndex = (fromIndex + offset) % videos.length;

      // Skip si déjà prefetché
      if (this.prefetchedIndices.has(targetIndex)) continue;

      const video = videos[targetIndex];
      if (!video?.path) continue;

      this.prefetchedIndices.add(targetIndex);

      const isCrossOrigin = video.path.startsWith('http://') || video.path.startsWith('https://');

      if (isCrossOrigin) {
        // SaaS mode: cross-origin URLs → use <link rel="prefetch"> (no CORS restriction)
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'video';
        link.href = video.path;
        document.head.appendChild(link);
        // Cleanup after browser has had time to initiate the prefetch
        setTimeout(() => link.remove(), 10000);
        console.log(`[TV] Prefetch hint added for video ${targetIndex}: ${video.name || video.path}`);
      } else {
        // Pi mode: local files → fetch() warms kernel page cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetch(video.path, { signal, priority: 'low' } as any)
          .then((response: Response) => {
            if (response.ok) {
              return response.arrayBuffer();
            }
            return undefined;
          })
          .then(() => {
            if (!signal.aborted) {
              console.log(`[TV] Disk cache warmed for video ${targetIndex}: ${video.name || video.path}`);
            }
          })
          .catch(() => {
            // Silencieux : abort ou erreur réseau
            // Le preload normal fonctionnera quand même, juste plus lentement
          });
      }
    }
  }

  /**
   * Réinitialise le state du prefetch (à appeler quand la liste de vidéos change)
   */
  private resetPrefetchState(): void {
    this.prefetchAbortController?.abort();
    this.prefetchAbortController = null;
    this.prefetchedIndices.clear();
  }

  /**
   * Déclenche le switch vers la vidéo suivante
   */
  private triggerSwitch(): void {
    if (this.pendingSwitch) return;
    this.pendingSwitch = true;

    this.ngZone.run(() => {
      // Tracker la fin de la vidéo actuelle (désactivé pour les slaves ET secondary — E-23 US-23.7.5)
      if (!this.isSlaveMode && this.displayType !== 'secondary') {
        this.analyticsService.trackVideoEnd(true);
      }

      const loopVideos = this.currentLoopVideos;
      const nextIndex = (this.currentLoopIndex + 1) % loopVideos.length;

      console.log(`[TV] Triggering switch to next video (index ${nextIndex})`);

      // Switch les players
      this.switchPlayers(nextIndex);
    });
  }

  /**
   * Appelé quand une vidéo se termine sur un player
   * Mode simplifié: pas de préchargement anticipé pour éviter les saccades
   *
   * IMPORTANT: On capture un freeze-frame AVANT de switcher pour éviter
   * le flash noir entre les vidéos. Le freeze-frame masque la transition
   * pendant que le nouveau player charge et démarre.
   */
  private onVideoEnded(fromPlayer: 'A' | 'B'): void {
    console.log(`[TV] onVideoEnded called from player ${fromPlayer}, isLoopMode=${this.isLoopMode}, activePlayer=${this.activePlayer}, isManualMode=${this.isManualMode}, isSlaveMode=${this.isSlaveMode}`);

    // Ignorer si ce n'est pas le player actif ou si pas en mode boucle
    if (!this.isLoopMode || fromPlayer !== this.activePlayer) {
      console.log('[TV] Ignoring ended event (not active or not in loop mode)');
      return;
    }

    // IMPORTANT: Ignorer les ended events pendant le mode manuel
    // La boucle continue en arrière-plan mais on ne doit PAS switcher
    // car ça pourrait cacher le freeze-frame/black overlay protégeant la vidéo manuelle
    if (this.isManualMode) {
      console.log('[TV] Ignoring ended event during manual mode');
      return;
    }

    // En mode slave, afficher le freeze-frame et attendre le prochain état du master
    // Le master va envoyer tv-loop-state quand sa propre vidéo change
    if (this.isSlaveMode) {
      console.log('[TV] Slave mode: showing freeze frame, waiting for master state');
      this.captureAndShowFreezeFrame();
      return;
    }

    // Éviter les switchs multiples
    if (this.pendingSwitch) {
      console.log('[TV] Switch already pending, ignoring ended event');
      return;
    }

    // Afficher le freeze-frame pré-capturé pour masquer le gap entre les vidéos.
    // Sur Chromium/Pi avec décodeur hardware, le frame buffer est déjà libéré
    // à ce stade (ended), donc on utilise le frame pré-capturé par l'intervalle.
    // Si aucun frame pré-capturé n'est disponible, on utilise le black overlay.
    const freezeOk = this.captureAndShowFreezeFrame();
    if (!freezeOk) {
      // Fallback: le black overlay évite de voir la boucle sans vidéo
      this.showBlackOverlay();
    }

    // Calculer l'index de la vidéo suivante
    const loopVideos = this.currentLoopVideos;
    const nextIndex = (this.currentLoopIndex + 1) % loopVideos.length;

    // Précharger la vidéo suivante AVANT le switch
    // Le freeze-frame couvre visuellement cette attente
    this.preloadOnInactivePlayer(nextIndex);

    // Attendre que la vidéo soit prête, PUIS switcher
    const inactivePlayer = this.getInactivePlayer();
    let switchTriggered = false;
    const generation = this.switchGeneration; // Capturer la génération actuelle

    const doTriggerSwitch = () => {
      if (switchTriggered) return;
      // Si switchToPhase a été appelé entre-temps, abandonner ce switch
      if (this.switchGeneration !== generation) {
        console.log('[TV] Switch cancelled by phase change (generation mismatch)');
        return;
      }
      // Compter comme transition (fallback path via onVideoEnded)
      this.transitionMetrics.totalTransitions++;
      switchTriggered = true;
      console.log('[TV] Video ended, freeze frame shown:', freezeOk, '- triggering switch (preloaded)');
      this.triggerSwitch();
    };

    const onReady = () => {
      inactivePlayer.removeEventListener('canplaythrough', onReady);
      clearInterval(readyCheckInterval);
      clearTimeout(safetyTimeout);
      this.preloadReady = true;
      doTriggerSwitch();
    };
    inactivePlayer.addEventListener('canplaythrough', onReady);

    // Polling actif du readyState — canplaythrough ne se déclenche pas toujours
    // sur Pi avec erreurs GPU, mais readyState progresse quand même
    const readyCheckInterval = setInterval(() => {
      if (switchTriggered) {
        clearInterval(readyCheckInterval);
        return;
      }
      if (inactivePlayer.readyState >= 3) {
        clearInterval(readyCheckInterval);
        inactivePlayer.removeEventListener('canplaythrough', onReady);
        clearTimeout(safetyTimeout);
        this.preloadReady = true;
        doTriggerSwitch();
      }
    }, 50); // Vérifier toutes les 50ms

    // Timeout de sécurité 1.5s (réduit de 3s) — le freeze-frame couvre l'attente
    // mais 3s est trop long pour l'utilisateur
    const safetyTimeout = setTimeout(() => {
      clearInterval(readyCheckInterval);
      inactivePlayer.removeEventListener('canplaythrough', onReady);
      console.warn('[TV] Preload safety timeout in onVideoEnded, forcing switch');
      doTriggerSwitch();
    }, 1500);
  }

  /**
   * Switch entre les deux players (transition sans flash)
   *
   * Le freeze-frame est affiché par onVideoEnded() AVANT d'appeler cette méthode.
   * Il masque la transition pendant toute la durée du chargement.
   * On le cache une fois que la nouvelle vidéo a affiché son premier frame.
   */
  private switchPlayers(nextVideoIndex: number): void {
    const oldPlayer = this.getActivePlayer();
    const newPlayer = this.getInactivePlayer();

    console.log(`[TV] Switching from ${this.activePlayer} to ${this.activePlayer === 'A' ? 'B' : 'A'}, preloadReady=${this.preloadReady}`);

    // Fonction pour effectuer le switch une fois que la vidéo est prête
    const doSwitch = () => {
      // Rendre le nouveau player visible avec z-index 2 (au-dessus de l'ancien à z-index 1)
      // Le freeze-frame (z-index 20) masque tout, donc pas de flash visible
      this.setPlayerVisible(newPlayer, true, 2);

      // Démarrer la vidéo préchargée
      newPlayer.play().then(() => {
        // Attendre que la vidéo rende réellement des pixels avant de cacher le freeze-frame.
        // On ne se fie PAS à un timer fixe (300ms) car sur Pi 5 avec erreurs GPU,
        // le décodeur hardware peut prendre plus longtemps.
        // Stratégie : polling rapide de readyState + timeupdate comme signal fiable
        // que le décodeur produit des frames, avec un safety timeout.
        const revealWhenReady = () => {
          // D'abord cacher l'ancien player (en dessous, à z-index 0)
          this.setPlayerVisible(oldPlayer, false, 0);

          // Puis cacher le freeze-frame et le black overlay
          // SAUF si une vidéo manuelle est en cours (le black overlay protège la vidéo manuelle)
          // Le nouveau player (z-index 2, opacity 1) est déjà visible
          this.hideFreezeFrame();
          if (!this.isManualMode) {
            this.hideBlackOverlay();
          }

          // Ramener le nouveau player au z-index standard (1) une fois l'ancien caché
          newPlayer.style.zIndex = '1';

          // Mettre à jour l'état
          this.activePlayer = this.activePlayer === 'A' ? 'B' : 'A';
          this.currentLoopIndex = nextVideoIndex;
          this.preloadReady = false;
          this.preloadedIndex = null;

          // Incrémenter le compteur pour le cleanup mémoire
          this.incrementVideoPlayCount();

          // Tracker (désactivé pour les slaves ET le secondary display — E-23 US-23.7.5)
          const video = this.currentLoopVideos[nextVideoIndex];
          if (!this.isSlaveMode && this.displayType !== 'secondary') {
            this.analyticsService.trackVideoStart(video, 'auto');
          }

          // Émettre l'état de la boucle si master
          if (this.tvRole === 'master') {
            this.emitLoopState(nextVideoIndex, video.path, false);
          }

          console.log(`[TV] Switched to player ${this.activePlayer}, now playing index ${nextVideoIndex}`);

          // NE PAS précharger immédiatement après le switch
          // Le préchargement sera déclenché par onTimeUpdate 1.5s avant la fin
          // Cela évite de décoder 2 vidéos en parallèle
          this.pendingSwitch = false;
          this.switchTriggered = false; // Reset pour le prochain cycle

          // Nettoyer l'ancien player après stabilisation du nouveau
          // Libère les buffers décodeur GPU (~30-50MB par vidéo)
          setTimeout(() => this.cleanupInactivePlayer(), 500);
        };

        // Polling: attendre que le player ait réellement des données décodées
        // readyState 4 = HAVE_ENOUGH_DATA, currentTime > 0 = le décodeur a avancé
        let revealed = false;
        const safetyTimeout = setTimeout(() => {
          if (!revealed) {
            revealed = true;
            console.warn('[TV] Frame detection safety timeout, revealing anyway');
            this.transitionMetrics.safetyTimeoutCount++;
            revealWhenReady();
          }
        }, 1500); // Safety: max 1.5s d'attente (au lieu de 300ms fixe)

        const checkFrame = () => {
          if (revealed) return;
          // Le player a décodé au moins un frame ET progresse dans le temps
          if (newPlayer.readyState >= 4 && newPlayer.currentTime > 0) {
            revealed = true;
            clearTimeout(safetyTimeout);
            // Un seul rAF pour synchroniser avec le prochain paint du compositor
            requestAnimationFrame(() => {
              revealWhenReady();
            });
          } else {
            // Re-vérifier au prochain frame (~16ms à 60fps)
            requestAnimationFrame(checkFrame);
          }
        };

        // Aussi écouter timeupdate comme signal fiable (le décodeur produit des frames)
        const onFirstTimeUpdate = () => {
          newPlayer.removeEventListener('timeupdate', onFirstTimeUpdate);
          if (!revealed) {
            revealed = true;
            clearTimeout(safetyTimeout);
            requestAnimationFrame(() => {
              revealWhenReady();
            });
          }
        };
        newPlayer.addEventListener('timeupdate', onFirstTimeUpdate);

        // Démarrer le polling
        requestAnimationFrame(checkFrame);
      }).catch(err => {
        console.error('[TV] Error switching to next video:', err);
        // Remettre le nouveau player en invisible (il n'a pas de frame affiché)
        this.setPlayerVisible(newPlayer, false, 0);
        // NE PAS cacher les overlays pendant le mode manuel
        // Le freeze-frame et le black overlay protègent la vidéo manuelle
        if (!this.isManualMode) {
          // Garder le freeze-frame visible — playOnActivePlayer le cachera
          // this.hideFreezeFrame(); -- on ne cache PAS, le fallback le fera
          // this.hideBlackOverlay(); -- on ne cache PAS non plus
        }
        this.pendingSwitch = false;
        this.switchTriggered = false;
        this.preloadReady = false;
        this.preloadedIndex = null;
        // Fallback: rejouer sur le même player (il cachera le freeze quand prêt)
        if (!this.isManualMode) {
          setTimeout(() => {
            this.playOnActivePlayer(nextVideoIndex);
          }, 500);
        }
      });
    };

    // Si la vidéo n'est pas encore préchargée, attendre
    // Le freeze-frame masque tout pendant cette attente
    if (!this.preloadReady || this.preloadedIndex !== nextVideoIndex) {
      console.log(`[TV] Waiting for preload to complete (freeze frame visible)...`);

      // Charger si pas déjà en cours
      if (this.preloadedIndex !== nextVideoIndex) {
        this.preloadOnInactivePlayer(nextVideoIndex);
      }

      let switchExecuted = false;
      const executeSwitchOnce = () => {
        if (switchExecuted) return;
        switchExecuted = true;
        doSwitch();
      };

      // Vérifier périodiquement si prêt via readyState
      const checkInterval = setInterval(() => {
        if (switchExecuted) {
          clearInterval(checkInterval);
          return;
        }
        if (newPlayer.readyState >= 3) {
          // readyState 3 = HAVE_FUTURE_DATA, assez pour jouer
          clearInterval(checkInterval);
          this.preloadReady = true;
          executeSwitchOnce();
        }
      }, 30);

      // Écouter aussi l'événement canplaythrough
      const onCanPlay = () => {
        newPlayer.removeEventListener('canplaythrough', onCanPlay);
        clearInterval(checkInterval);
        this.preloadReady = true;
        executeSwitchOnce();
      };
      newPlayer.addEventListener('canplaythrough', onCanPlay);

      // Safety timeout - si toujours pas prêt après 2s, forcer
      setTimeout(() => {
        clearInterval(checkInterval);
        newPlayer.removeEventListener('canplaythrough', onCanPlay);
        if (!switchExecuted) {
          console.warn('[TV] Preload timeout, forcing switch');
          executeSwitchOnce();
        }
      }, 2000);
    } else {
      doSwitch();
    }
  }

  /**
   * Arrête la boucle pour le mode manuel
   */
  private stopSeamlessLoop(): void {
    this.isLoopMode = false;
    this.playerA?.pause();
    this.playerB?.pause();
    console.log('[TV] Loop stopped, switching to manual mode');
  }

  /**
   * Arrête la vidéo manuelle en cours et prépare le retour à la boucle.
   * Appelé quand l'utilisateur clique sur une phase pour couper une vidéo
   * et revenir à la boucle de sponsors.
   */
  private stopManualVideoAndReturnToLoop(): void {
    console.log('[TV] Stopping manual video to return to loop');

    // Arrêter les deux players manuels (au cas où)
    [this.manualPlayerA, this.manualPlayerB].forEach(player => {
      if (player) {
        player.pause();
        player.style.opacity = '0';
        player.removeAttribute('src');
        player.load();
      }
    });

    // Tracker la fin de la vidéo manuelle (interrompue) — désactivé pour les slaves ET secondary (E-23 US-23.7.5)
    if (!this.isSlaveMode && this.displayType !== 'secondary') {
      this.analyticsService.trackVideoEnd(false); // false = pas complétée
    }

    // Émettre l'état si master (retour à la boucle)
    if (this.tvRole === 'master') {
      this.emitLoopState(this.currentLoopIndex, this.currentLoopVideos[this.currentLoopIndex]?.path || '', false);
    }

    // NE PAS cacher le black overlay ici — l'appelant (switchToPhase) gère
    // les overlays après avoir capturé le freeze-frame. Cacher l'overlay ici
    // causerait un flash noir entre le moment où il disparaît et le moment
    // où le freeze-frame est affiché par switchToPhase.

    // Sortir du mode manuel
    this.isManualMode = false;
    this.lastTriggerType = 'auto';
  }

  // ===========================================================================
  // MASTER-SLAVE TV SYNCHRONISATION
  // Le master émet son état, les slaves se synchronisent
  // ===========================================================================

  /**
   * Émet l'état actuel de la boucle vers les slaves via Socket.IO
   */
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

  /**
   * Gère l'état de boucle reçu du master (slaves uniquement)
   * Synchronise la vidéo en cours avec le master
   */
  private handleMasterLoopState(state: LoopState): void {
    console.log('[TV] Slave received master state:', {
      videoPath: state.videoPath,
      videoIndex: state.videoIndex,
      isManualMode: state.isManualMode,
      manualVideoPath: state.manualVideoPath
    });

    // CAS 1: Le master joue une vidéo manuelle
    if (state.isManualMode && state.manualVideoPath) {
      // Résoudre la variante secondaire si applicable
      const resolvedVideo = this.resolveSecondaryVariant({
        name: state.manualVideoPath.split('/').pop() || 'manual',
        path: state.manualVideoPath,
        type: 'video/mp4'
      } as Video);

      // ADR-034: Deux sous-cas selon manualVideoVisible
      // Sous-cas 1a: manualVideoVisible !== true → preload si pas déjà fait
      // Couvre: manualVideoVisible à false, undefined, ou absent (backward compat)
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
      const currentManualPlayer = this.getActiveManualPlayer();
      const currentManualSrc = currentManualPlayer?.src || '';

      if (!this.isManualMode || !currentManualSrc.includes(resolvedVideo.path)) {
        console.log('[TV] Slave: master revealed but no preload ready, direct play:', state.manualVideoPath,
          this.displayType === 'secondary' ? `(resolved: ${resolvedVideo.path})` : '');
        this.play(resolvedVideo);

        // Seek approximatif au temps du master
        if (state.manualVideoStartedAt) {
          const elapsed = (Date.now() - state.manualVideoStartedAt) / 1000;
          if (elapsed > 1) {
            setTimeout(() => {
              const player = this.getActiveManualPlayer();
              if (player && player.duration && elapsed < player.duration) {
                player.currentTime = elapsed;
                console.log(`[TV] Slave: seeked manual video to ${elapsed.toFixed(1)}s`);
              }
            }, 500); // Attendre que le player charge
          }
        }
      }
      return;
    }

    // CAS 2: Le master est en mode boucle
    // ADR-034: Cleanup any pending preload state
    if (this._preloadedManualVideo) {
      console.log('[TV] Slave: master returned to loop, cleaning up preload state');
      this.cleanupPreloadState();
    }

    // Si on est en mode manuel, en sortir — SAUF si un 'action' vient d'être reçu
    // ADR-033: Race condition — un tv-loop-state stale (isManualMode: false) émis
    // par le master AVANT qu'il reçoive l'action peut arriver au slave APRÈS que
    // le slave a déjà traité l'action et démarré la vidéo manuelle.
    // Guard: ignorer les tv-loop-state non-manual dans les 2s suivant une action locale.
    if (this.isManualMode) {
      const msSinceLastAction = Date.now() - this._lastActionReceivedAt;
      if (msSinceLastAction < 2000) {
        console.log(`[TV] Slave: ignoring stale loop state (action received ${msSinceLastAction}ms ago)`);
        this.transitionMetrics.staleLoopStateCount++;
        return;
      }
      console.log('[TV] Slave: master returned to loop, stopping manual video');
      this.stopManualVideoAndReturnToLoop();
      // Cacher les overlays
      this.hideFreezeFrame();
      this.hideBlackOverlay();
    }

    // Trouver la vidéo dans notre boucle locale.
    // Stratégie : index d'abord (fiable même avec variants secondaires), path en fallback.
    // Le secondary display remplace les paths par leurs variants (getLoopVideosForPhase),
    // donc le path du master ne matchera jamais le path du slave quand des variants existent.
    // L'index est toujours fiable car les deux boucles ont le même ordre.
    if (this.currentLoopVideos.length === 0) {
      console.warn('[TV] Slave: no videos in local loop, ignoring master state');
      return;
    }

    const syncIndex = state.videoIndex % this.currentLoopVideos.length;
    const localVideo = this.currentLoopVideos[syncIndex];

    console.log(`[TV] Slave: syncing to index ${syncIndex} (master: ${state.videoPath}, local: ${localVideo?.path})`);

    // Afficher le freeze-frame pour masquer la transition
    this.captureAndShowFreezeFrame();

    // Jouer la vidéo sur le player actif
    this.playOnActivePlayer(syncIndex);

    // Seek approximatif au temps du master pour rester synchrone
    if (state.videoStartedAt) {
      const elapsed = (Date.now() - state.videoStartedAt) / 1000;
      if (elapsed > 1) {
        setTimeout(() => {
          const player = this.getActivePlayer();
          if (player && player.duration && elapsed < player.duration) {
            player.currentTime = elapsed;
            console.log(`[TV] Slave: seeked to ${elapsed.toFixed(1)}s`);
          }
        }, 500);
      }
    }
  }

  /**
   * Arrête tous les players (utilisé lors du blocage licence)
   */
  private stopAllPlayers(): void {
    this.isLoopMode = false;
    this.isManualMode = false;

    // Arrêter les players de la boucle
    this.playerA?.pause();
    this.playerB?.pause();

    // Arrêter les players manuels
    this.manualPlayerA?.pause();
    this.manualPlayerB?.pause();

    // Arrêter le watchdog et la capture périodique
    this.stopWatchdog();
    this.stopLastFrameCapture();

    console.log('[TV] All players stopped due to license block');
  }

  /**
   * Redémarre la boucle après une vidéo manuelle
   */
  private restartSeamlessLoop(): void {
    console.log('[TV] Restarting loop');
    this.startSeamlessLoop();
  }

  // ===========================================================================
  // LAST FRAME PRE-CAPTURE SYSTEM
  // Capture périodiquement le dernier frame visible pendant la lecture.
  // Sur Chromium/Pi avec décodeur hardware, le frame buffer est libéré
  // dès l'événement 'ended', donc drawImage() dans onVideoEnded() capture
  // du noir. En pré-capturant toutes les 500ms, on a toujours un frame
  // valide prêt à afficher instantanément.
  // ===========================================================================

  /**
   * Démarre la capture périodique du dernier frame visible
   */
  private startLastFrameCapture(): void {
    if (this.lastFrameCaptureInterval) {
      clearInterval(this.lastFrameCaptureInterval);
    }

    this.lastFrameCaptureInterval = setInterval(() => {
      this.captureLastFrame();
    }, 500); // Toutes les 500ms - léger sur le CPU

    console.log('[TV] Last frame pre-capture started (every 500ms)');
  }

  /**
   * Arrête la capture périodique
   */
  private stopLastFrameCapture(): void {
    if (this.lastFrameCaptureInterval) {
      clearInterval(this.lastFrameCaptureInterval);
      this.lastFrameCaptureInterval = null;
    }
  }

  /**
   * Capture silencieusement le frame actuel dans le canvas (sans l'afficher)
   * Le canvas reste invisible (opacity: 0) mais contient un frame valide
   */
  private captureLastFrame(): void {
    if (!this.freezeCanvas || !this.freezeCtx) return;

    // Capturer le frame du player visuellement au premier plan :
    // - En mode manuel : capturer depuis le player manuel
    // - En mode boucle : capturer depuis le player de boucle actif
    // IMPORTANT: On capture aussi en mode manuel car la boucle continue
    // en arrière-plan et peut se terminer. Sans capture du player manuel,
    // il n'y aurait aucun frame valide pour couvrir les transitions.
    let player: HTMLVideoElement | null = null;

    if (this.isManualMode) {
      player = this.getActiveManualPlayer();
    } else if (this.isLoopMode) {
      player = this.getActivePlayer();
    } else {
      return;
    }

    // Vérifier que la vidéo joue et a des dimensions valides
    if (!player || player.paused || player.ended) return;
    if (player.videoWidth === 0 || player.videoHeight === 0) return;
    if (player.readyState < 2) return; // HAVE_CURRENT_DATA minimum

    try {
      this.freezeCtx.drawImage(player, 0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      this.hasValidLastFrame = true;
    } catch {
      // Silencieux - erreur CORS ou vidéo pas encore prête
    }
  }

  // ===========================================================================
  // CANVAS FREEZE-FRAME SYSTEM
  // Capture le frame actuel pour masquer les transitions
  // ===========================================================================

  /**
   * Affiche le freeze-frame pré-capturé sur le canvas.
   * Si aucun frame pré-capturé n'est disponible, tente une capture live
   * (fonctionne sur desktop mais pas sur Chromium/Pi après 'ended').
   * Retourne true si le canvas est affiché avec un frame valide.
   */
  private captureAndShowFreezeFrame(): boolean {
    if (!this.freezeCanvas || !this.freezeCtx) {
      console.warn('[TV] Freeze canvas not available');
      return false;
    }

    // Si on a un frame pré-capturé valide, l'afficher directement
    // (pas besoin de drawImage, le canvas contient déjà le frame)
    // Note: PAS de display:block — on utilise uniquement opacity pour éviter le reflow
    // layout qui causait un flash noir sur le GPU lent du Pi
    if (this.hasValidLastFrame) {
      this.freezeCanvas.style.opacity = '1';
      this.freezeCanvas.style.zIndex = '20';
      console.log('[TV] Freeze frame shown (pre-captured)');
      return true;
    }

    // Fallback: tenter une capture live (fonctionne sur desktop, pas sur Pi après ended)
    let sourceVideo: HTMLVideoElement | null = null;

    if (this.isManualMode) {
      sourceVideo = this.getActiveManualPlayer();
    } else {
      sourceVideo = this.getActivePlayer();
    }

    if (!sourceVideo || sourceVideo.videoWidth === 0 || sourceVideo.videoHeight === 0) {
      console.warn('[TV] No valid video source for freeze frame, using black overlay');
      return false;
    }

    try {
      this.freezeCtx.drawImage(sourceVideo, 0, 0, this.freezeCanvas.width, this.freezeCanvas.height);

      // Note: PAS de display:block — on utilise uniquement opacity pour éviter le reflow
      this.freezeCanvas.style.opacity = '1';
      this.freezeCanvas.style.zIndex = '20';

      console.log('[TV] Freeze frame captured live and displayed');
      return true;
    } catch (err) {
      console.error('[TV] Error capturing freeze frame:', err);
      return false;
    }
  }

  /**
   * Cache le canvas freeze-frame
   * Note: on ne clearRect() PAS et on ne reset PAS hasValidLastFrame ici
   * car la capture périodique continue de remplir le canvas avec des frames
   * valides de la vidéo en cours. Le canvas reste disponible pour la prochaine
   * transition. Le clearRect est fait uniquement dans performPreventiveMemoryCleanup().
   */
  private hideFreezeFrame(): void {
    if (this.freezeCanvas && this.freezeCtx) {
      this.freezeCanvas.style.opacity = '0';
      // PAS de display:none — on utilise uniquement opacity pour éviter le reflow
      // layout qui causait un flash noir sur le GPU lent du Pi (VideoCore)
      // L'élément reste dans le render tree mais invisible (opacity: 0)
      // NE PAS reset hasValidLastFrame - la capture périodique continue
      // et le canvas contient toujours un frame valide de la vidéo précédente
      // La prochaine capture le mettra à jour avec la nouvelle vidéo
      console.log('[TV] Freeze frame hidden');
    }
  }

  // ===========================================================================
  // BLACK OVERLAY SYSTEM
  // Overlay noir pour bloquer physiquement la boucle pendant les transitions
  // ===========================================================================

  /**
   * Affiche le black overlay pour bloquer la boucle
   */
  private showBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '1';
      console.log('[TV] Black overlay shown');
    }
  }

  /**
   * Cache le black overlay
   */
  private hideBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '0';
      console.log('[TV] Black overlay hidden');
    }
  }

  // ===========================================================================
  // ERROR RECOVERY SYSTEM
  // Gestion des erreurs vidéo et récupération automatique
  // ===========================================================================

  /**
   * Gère les erreurs de lecture vidéo
   * Codes d'erreur HTML5:
   * - 1: MEDIA_ERR_ABORTED
   * - 2: MEDIA_ERR_NETWORK
   * - 3: MEDIA_ERR_DECODE (souvent après surchauffe GPU)
   * - 4: MEDIA_ERR_SRC_NOT_SUPPORTED
   * - 5: MEDIA_ERR_ENCRYPTED (DRM)
   */
  private handleVideoError(player: HTMLVideoElement, which: string, event: Event): void {
    const error = player.error;
    const errorCode = error?.code || 0;
    const errorMessage = error?.message || 'Unknown error';
    const currentSrc = player.src || 'no source';

    // Ignorer les erreurs "empty src" sur les players manuels : elles sont déclenchées
    // par le cleanup (removeAttribute('src') + load()) lors du retour à la boucle.
    // Code 4 = MEDIA_SRC_NOT_SUPPORTED — inoffensif quand le player est en cours de reset.
    if (which.startsWith('manual-') && errorCode === 4 && !player.getAttribute('src')) {
      return;
    }

    console.error(`[TV] ⚠️ Player ${which} error:`, {
      code: errorCode,
      message: errorMessage,
      src: currentSrc,
      readyState: player.readyState,
      networkState: player.networkState
    });

    // Tracker l'erreur dans les analytics (désactivé pour les slaves)
    if (!this.isSlaveMode) {
      this.analyticsService.trackVideoError(
        { name: currentSrc.split('/').pop() || 'unknown', path: currentSrc, type: 'video/mp4' },
        event
      );
    }

    this.consecutiveErrors++;
    this.transitionMetrics.videoErrorCount++;

    // Mettre à jour l'état du player pour le monitoring cloud
    this.emitPlayerState({
      lastError: `[${which}] ${errorMessage} (code ${errorCode})`,
      isPlaying: false,
    });

    // Si trop d'erreurs consécutives, tenter un reset complet
    if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      console.error(`[TV] 🚨 ${this.consecutiveErrors} erreurs consécutives - reset complet de la boucle`);
      this.performFullReset();
      return;
    }

    // Récupération selon le type de player
    if (which.startsWith('loop-')) {
      this.recoverFromLoopError(player, which);
    } else if (which.startsWith('manual-')) {
      this.recoverFromManualError(player, which);
    }
  }

  /**
   * Récupération d'une erreur sur un player de boucle
   */
  private recoverFromLoopError(player: HTMLVideoElement, which: string): void {
    console.log(`[TV] Recovering from loop error on ${which}`);

    // Nettoyer le player en erreur
    player.pause();
    player.removeAttribute('src');
    player.load(); // Force le reset du decoder

    // Passer à la vidéo suivante après un délai
    const nextIndex = (this.currentLoopIndex + 1) % this.currentLoopVideos.length;

    // Si on n'a qu'une seule vidéo et qu'elle est en erreur, attendre plus longtemps
    const delay = this.currentLoopVideos.length === 1 ? 5000 : 1000;

    setTimeout(() => {
      console.log(`[TV] Skipping to video index ${nextIndex} after error`);
      this.pendingSwitch = false;
      this.switchTriggered = false;
      this.preloadReady = false;
      this.preloadedIndex = null;
      this.playOnActivePlayer(nextIndex);
    }, delay);
  }

  /**
   * Récupération d'une erreur sur un player manuel
   */
  private recoverFromManualError(player: HTMLVideoElement, which: string): void {
    console.log(`[TV] Recovering from manual player error on ${which}`);

    // Nettoyer le player manuel
    player.pause();
    player.style.opacity = '0';
    player.removeAttribute('src');
    player.load();

    // Cacher les overlays et retourner à la boucle
    this.hideFreezeFrame();
    this.hideBlackOverlay();
    this.isManualMode = false;
    this.lastTriggerType = 'auto';

    // La boucle devrait continuer automatiquement
    if (!this.isLoopMode) {
      this.startSeamlessLoop();
    }
  }

  /**
   * Gère les événements 'stalled' (vidéo bloquée en buffering)
   */
  private handleVideoStall(player: HTMLVideoElement, which: string): void {
    console.warn(`[TV] ⏳ Player ${which} stalled (buffering issue)`, {
      src: player.src,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState
    });

    // Si la vidéo est bloquée depuis plus de 10 secondes, le watchdog interviendra
    // Ici on log juste pour le diagnostic
  }

  /**
   * Reset complet de la boucle vidéo (dernier recours)
   */
  private performFullReset(): void {
    console.log('[TV] 🔄 Performing full video system reset');

    // Arrêter le watchdog temporairement
    this.stopWatchdog();

    // Reset tous les players
    [this.playerA, this.playerB, this.manualPlayerA, this.manualPlayerB].forEach(player => {
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    });

    // Reset les états
    this.isLoopMode = false;
    this.isManualMode = false;
    this.pendingSwitch = false;
    this.switchTriggered = false;
    this.preloadReady = false;
    this.preloadedIndex = null;
    this.currentLoopIndex = 0;
    this.activePlayer = 'A';
    this.consecutiveErrors = 0;

    // Garder le black overlay visible pendant le cooldown GPU
    // pour éviter un écran noir/vide pendant 3 secondes
    this.hideFreezeFrame();
    this.showBlackOverlay();

    // Libérer la mémoire du canvas
    if (this.freezeCtx && this.freezeCanvas) {
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
    }

    // Reset les visibilités
    this.setPlayerVisible(this.playerA, true);
    this.setPlayerVisible(this.playerB, false);

    // Attendre un peu pour que le GPU se libère, puis redémarrer
    // playOnActivePlayer cachera le black overlay quand la vidéo sera prête
    setTimeout(() => {
      console.log('[TV] 🔄 Restarting video loop after full reset');
      this.startWatchdog();
      this.startSeamlessLoop();
    }, 3000); // 3 secondes pour laisser le GPU respirer
  }

  // ===========================================================================
  // WATCHDOG SYSTEM
  // Surveillance continue de la santé de la lecture vidéo
  // ===========================================================================

  /**
   * Démarre le watchdog qui vérifie toutes les 10 secondes
   * que la vidéo progresse normalement
   */
  private startWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }

    this.lastPlaybackTime = 0;
    this.lastPlaybackCheck = Date.now();

    this.watchdogInterval = setInterval(() => {
      this.checkPlaybackHealth();
    }, 10000); // Vérifier toutes les 10 secondes

    // Démarrer aussi le cleanup mémoire périodique
    this.startMemoryCleanupInterval();

    console.log('[TV] 🐕 Watchdog started');
  }

  /**
   * Démarre l'intervalle de nettoyage mémoire préventif
   */
  private startMemoryCleanupInterval(): void {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }

    this.memoryCleanupInterval = setInterval(() => {
      this.performPreventiveMemoryCleanup();
    }, this.MEMORY_CLEANUP_INTERVAL);

    console.log('[TV] 🧹 Memory cleanup interval started (every 30 min)');
  }

  /**
   * Nettoyage préventif de la mémoire pour éviter les memory leaks
   * sur les longues sessions (5h+)
   */
  private performPreventiveMemoryCleanup(): void {
    console.log('[TV] 🧹 Performing preventive memory cleanup', {
      videoPlayCount: this.videoPlayCount
    });

    // Nettoyer le canvas freeze-frame (libère ~4.5MB)
    if (this.freezeCtx && this.freezeCanvas) {
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      // Recapturer immédiatement pour ne pas laisser de fenêtre sans frame valide
      // (sinon un onVideoEnded pendant les 500ms de gap utiliserait le black overlay)
      this.captureLastFrame();
      // Si captureLastFrame a réussi, hasValidLastFrame est true
      // Sinon il reste false mais la prochaine capture périodique le remplira
    }

    // Nettoyer le player inactif (libère les buffers vidéo)
    const inactivePlayer = this.getInactivePlayer();
    if (inactivePlayer && !this.preloadReady) {
      // Ne nettoyer que si pas de préchargement en cours
      const hadSrc = !!inactivePlayer.src;
      if (hadSrc) {
        inactivePlayer.removeAttribute('src');
        inactivePlayer.load();
        console.log('[TV] 🧹 Cleaned inactive loop player');
      }
    }

    // Nettoyer les players manuels s'ils ne sont pas utilisés
    if (!this.isManualMode) {
      [this.manualPlayerA, this.manualPlayerB].forEach((player, i) => {
        if (player && player.src) {
          player.removeAttribute('src');
          player.load();
          console.log(`[TV] 🧹 Cleaned manual player ${i === 0 ? 'A' : 'B'}`);
        }
      });
    }

    // Forcer le garbage collection si disponible (Chrome/V8)
    if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
      (window as unknown as { gc: () => void }).gc();
      console.log('[TV] 🧹 Forced garbage collection');
    }

    // Reset le compteur
    this.videoPlayCount = 0;
  }

  /**
   * Incrémente le compteur de vidéos et déclenche un cleanup si nécessaire
   */
  private incrementVideoPlayCount(): void {
    this.videoPlayCount++;

    // Cleanup après un certain nombre de vidéos (indépendamment du timer)
    // IMPORTANT: Différer le cleanup pour ne pas l'exécuter pendant une transition
    // (clearRect sur le canvas pendant qu'il est affiché causerait un flash noir)
    if (this.videoPlayCount >= this.VIDEO_COUNT_BEFORE_CLEANUP) {
      console.log(`[TV] 🧹 Reached ${this.VIDEO_COUNT_BEFORE_CLEANUP} videos, scheduling cleanup`);
      setTimeout(() => {
        if (!this.pendingSwitch) {
          this.performPreventiveMemoryCleanup();
        } else {
          // Réessayer plus tard si une transition est en cours
          console.log('[TV] 🧹 Cleanup deferred (switch in progress)');
        }
      }, 1000);
    }
  }

  /**
   * Arrête le watchdog et le cleanup mémoire
   */
  private stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = null;
    }
    console.log('[TV] 🐕 Watchdog stopped');
  }

  /**
   * Vérifie la santé de la lecture vidéo
   */
  private checkPlaybackHealth(): void {
    // Ne pas vérifier si on est en mode manuel (l'utilisateur a le contrôle)
    if (this.isManualMode) {
      return;
    }

    // Ne pas vérifier si la boucle n'est pas active
    if (!this.isLoopMode || this.currentLoopVideos.length === 0) {
      return;
    }

    const player = this.getActivePlayer();
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastPlaybackCheck;

    // Vérifier si la vidéo progresse
    const currentTime = player.currentTime || 0;
    const hasProgressed = currentTime !== this.lastPlaybackTime;

    // Si la vidéo est en pause ET on est en mode boucle, c'est un problème
    if (player.paused && this.isLoopMode && !this.pendingSwitch) {
      console.warn('[TV] 🐕 Watchdog: video paused unexpectedly, attempting recovery');
      this.attemptWatchdogRecovery('paused');
      return;
    }

    // Si la vidéo n'a pas progressé depuis 10s (et n'est pas en pause)
    if (!hasProgressed && !player.paused && !player.ended) {
      console.warn('[TV] 🐕 Watchdog: video not progressing', {
        currentTime,
        lastTime: this.lastPlaybackTime,
        readyState: player.readyState,
        networkState: player.networkState,
        paused: player.paused
      });
      this.attemptWatchdogRecovery('stalled');
      return;
    }

    // Tout va bien - reset le compteur d'erreurs si la vidéo joue
    if (hasProgressed) {
      this.consecutiveErrors = 0;
    }

    this.lastPlaybackTime = currentTime;
    this.lastPlaybackCheck = now;
  }

  /**
   * Tente une récupération via le watchdog
   */
  private attemptWatchdogRecovery(reason: 'paused' | 'stalled'): void {
    console.log(`[TV] 🐕 Watchdog recovery attempt (reason: ${reason})`);

    const player = this.getActivePlayer();

    // Première tentative: essayer de reprendre la lecture
    if (reason === 'paused') {
      player.play().then(() => {
        console.log('[TV] 🐕 Watchdog: successfully resumed playback');
        this.consecutiveErrors = 0;
      }).catch(err => {
        console.error('[TV] 🐕 Watchdog: failed to resume, trying next video', err);
        this.recoverFromLoopError(player, `loop-${this.activePlayer}`);
      });
      return;
    }

    // Pour 'stalled': passer à la vidéo suivante
    if (reason === 'stalled') {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        this.performFullReset();
      } else {
        this.recoverFromLoopError(player, `loop-${this.activePlayer}`);
      }
    }
  }

}
