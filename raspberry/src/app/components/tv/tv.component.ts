import { Component, ElementRef, HostListener, inject, Input, OnDestroy, OnInit, ViewChild, NgZone, ViewEncapsulation } from '@angular/core';
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
import { ManualVideoService } from '../../services/manual-video.service';
import { WebContentService } from '../../services/web-content.service';
import { TvSyncService } from '../../services/tv-sync.service';
import { LanReceiverPrecacheService } from '../../services/lan-receiver-precache.service';
import { LicenseBlockComponent } from '../license-block/license-block.component';
import { WaitingScreenComponent } from '../waiting-screen/waiting-screen.component';
import { WrongPortScreenComponent } from '../wrong-port-screen/wrong-port-screen.component';
import { ScoreOverlayComponent } from '../score-overlay/score-overlay.component';
import { HotspotQrComponent } from '../hotspot-qr/hotspot-qr.component';
import { PiConfigVideoEntry } from '../../interfaces/video.interface';
import { Configuration } from '../../interfaces/configuration.interface';
import { Command, WebPagePayload, LivestreamPayload } from '../../interfaces/command.interface';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { Category } from '../../interfaces/category.interface';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tv',
  templateUrl: './tv.component.html',
  styleUrl: './tv.component.scss',
  imports: [CommonModule, LicenseBlockComponent, WaitingScreenComponent, WrongPortScreenComponent, ScoreOverlayComponent, HotspotQrComponent],
  encapsulation: ViewEncapsulation.None, // Désactiver l'encapsulation pour le double-buffer
  host: {
    '[class.tv--pixel-exact]': 'isPixelExactDisplay',
    '[style.--pixel-exact-w]': 'pixelExactCanvasWidth',
    '[style.--pixel-exact-h]': 'pixelExactCanvasHeight',
    '[style.--pixel-exact-scale]': 'pixelExactScale',
  }
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
  private readonly webContentService = inject(WebContentService);
  private readonly tvSyncService = inject(TvSyncService);
  private readonly lanPrecacheService = inject(LanReceiverPrecacheService);

  private localBroadcastSubscriptions: Subscription[] = [];

  // Display type: 'tv' (index 0), 'secondary' (index 1), 'display-N' (index N)
  public displayType = 'tv';
  // Display index for targeted commands and variant resolution
  public displayIndex = 0;

  /**
   * Écran dont la sortie est lue AU PIXEL par un processeur (ruban LED périmétrique).
   *
   * Un Novastar/Colorlight découpe une région fixe en pixels de la trame entrante,
   * puis mappe chaque bande sur un panneau. Le `object-fit: contain` habituel — qui
   * met la vidéo à l'échelle de la fenêtre et la centre — déplace donc TOUS les
   * pixels hors de la région mappée : le ruban n'affiche rien ou du décalé, alors
   * que la vidéo paraît parfaite dans le navigateur.
   *
   * Sur ces écrans on rend à la taille native, ancré en haut à gauche, sur noir.
   * Les autres types (TV, totem, mur LED) gardent le `contain` : leur sortie est
   * regardée par un humain, pas découpée par une machine.
   */
  /**
   * `led-perimeter` et tout ruban additionnel du même club (`led-perimeter-2`,
   * `led-perimeter-3`, ...). ADR-143 : un club peut avoir plusieurs rubans
   * indépendants (bord de terrain, tribune...), chacun avec son propre `type`
   * distinct pour garder son propre `led.canvas_in` — mais tous partagent le
   * même besoin de rendu pixel-exact.
   */
  public get isPixelExactDisplay(): boolean {
    return this.displayType === 'led-perimeter' || this.displayType.startsWith('led-perimeter-');
  }

  /**
   * Taille réelle du canvas plié (band_width × band_count×height), en pixels CSS.
   *
   * `object-fit: none` rend à la taille native mais le conteneur restait en
   * `width/height: 100%` — donc calé sur la fenêtre du PC, pas sur le canvas. Une
   * fenêtre plus petite/grande que le canvas donnait un rognage/zoom visible malgré
   * un fichier source correct (Piraths, 2026-08-12 — le fichier fait bien 1600×480
   * en sortie ffprobe). En fixant width/height à la géométrie confirmée du site, le
   * rendu reste pixel-exact quelle que soit la fenêtre : ancré haut-gauche, marges
   * noires (`:host { background:#000 }`) au lieu d'un rognage.
   *
   * `band_count` doit être la valeur CONFIRMÉE côté site (jamais recalculée ici à
   * partir de `sides`/`pitch` — cf. règle LED "ne jamais recalculer un côté en px
   * à la main"). Absent → fallback silencieux au comportement précédent (100%).
   */
  public get pixelExactCanvasSize(): { width: number; height: number } | null {
    const led = this.configuration?.displays?.[this.displayIndex]?.led;
    const canvasIn = led?.canvas_in;
    if (!led?.height || !canvasIn?.band_width || !canvasIn?.band_count) {
      return null;
    }
    return { width: canvasIn.band_width, height: canvasIn.band_count * led.height };
  }

  public get pixelExactCanvasWidth(): string | null {
    const size = this.pixelExactCanvasSize;
    return size ? `${size.width}px` : null;
  }

  public get pixelExactCanvasHeight(): string | null {
    const size = this.pixelExactCanvasSize;
    return size ? `${size.height}px` : null;
  }

  /**
   * Largeur de la "scène" de référence pour `canvas_in.scene_scaling` — même
   * convention que B2B Alive (vérifié via son panneau OUTPUT, 2026-08-12) :
   * composer à 1920px de large, puis scaler UNIFORMÉMENT (jamais recentrer)
   * pour occuper toute la largeur de fenêtre réelle.
   *
   * Option désactivée par défaut (cf. Joi `canvas_in.scene_scaling`) : un scale
   * ≠ 1 réintroduit un flou d'interpolation sur le ruban si la fenêtre du PC ne
   * fait pas exactement 1920px de large — précisément le risque que le rendu
   * pixel-exact (taille fixe, ci-dessus) évite. À activer seulement pour
   * l'aperçu/démo, ou après validation terrain que le flou est acceptable.
   */
  private static readonly SCENE_STAGE_WIDTH = 1920;

  private windowWidth = window.innerWidth;

  @HostListener('window:resize')
  public onWindowResize(): void {
    this.windowWidth = window.innerWidth;
  }

  public get sceneScalingEnabled(): boolean {
    return !!this.configuration?.displays?.[this.displayIndex]?.led?.canvas_in?.scene_scaling;
  }

  /**
   * `transform: scale()` — jamais `null` en sortie CSS (fallback `1` côté SCSS
   * via `var(--pixel-exact-scale, 1)`) pour que l'option désactivée reproduise
   * exactement le comportement pixel-exact précédent, sans écart.
   */
  public get pixelExactScale(): number | null {
    if (!this.sceneScalingEnabled) {
      return null;
    }
    return this.windowWidth / TvComponent.SCENE_STAGE_WIDTH;
  }

  // HDMI status — E-23 US-23.2.1: splash screen when no display connected
  public hdmiConnected = true; // Assume connected until told otherwise (PC browsers always true)

  // E-23 US-23.5.3: Wrong HDMI port detected (TV on HDMI-1 instead of HDMI-0)
  public wrongPort = false;

  /**
   * ADR-105 — mode preview iframe.
   * Activé via `?preview=1` quand la Remote V2 embarque la TV dans un iframe.
   * Conséquences :
   *  - audio mute (pas de double son TV + Remote)
   *  - skip startSession + startRecording (pas de double comptage analytics)
   *  - skip emit `tv-register` (l'iframe ne doit pas être comptée comme un display
   *    dans `getSaasClientCount` côté central — cf. saas.md "Compter les onglets")
   */
  public isPreviewMode = false;

  // ADR-060 Phase 3 couche 2 — QR hotspot pour rejoindre le Pi hors LAN club.
  // Déclenchable via `?fallback=hotspot` (URL) ou via un futur event
  // internet-watchdog → local-broadcast (à câbler quand sync-agent expose).
  public showHotspotQr = false;

  // E-23 US-23.3.2: Demotion notification for PC browsers (Pi took over as master)
  public demotionNotice = false;
  private demotionTimeout: ReturnType<typeof setTimeout> | null = null;

  // License status - bloque l'affichage si la licence n'est pas valide
  public licenseState: LicenseState | null = null;
  public isLicenseBlocked = false;

  // Options locales (provenant de Remote)
  public localOptions: LocalOptions = this.localOptionsService.getOptions();

  /**
   * Config du site. En SaaS elle arrive par le resolver de route, donc APRÈS
   * `ngOnInit` — d'où ce setter.
   *
   * `displayType` n'était résolu qu'une fois, dans `ngOnInit`, alors que
   * `this.configuration` était encore vide : le repli donnait `'tv'` pour l'index 0
   * et plus rien ne le recalculait. Conséquence sur un club à ruban LED : le player
   * se croyait sur une TV, donc il ignorait la variante `led-perimeter` (il jouait le
   * fichier brut au lieu du canvas plié) ET n'appliquait pas le rendu au pixel
   * (`object-fit: contain` au lieu de `none`). Les deux symptômes, une seule cause
   * (Piraths, 2026-08-11).
   *
   * On ne re-résout QUE si la config déclare réellement un type pour cet index :
   * sinon on écraserait les surcharges volontaires (secondary/preview) posées plus
   * loin dans `ngOnInit`.
   */
  @Input()
  public set configuration(value: Configuration) {
    this._configuration = value;
    const declared = value?.displays?.[this.displayIndex]?.type;
    if (declared) {
      this.displayType = declared;
    }
  }
  public get configuration(): Configuration {
    return this._configuration;
  }
  private _configuration: Configuration;

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

  // ADR-089 — web page iframe + livestream player (z-index 10)
  @ViewChild('webFrame', { static: true }) webFrameRef: ElementRef<HTMLIFrameElement>;
  @ViewChild('livestreamPlayer', { static: true }) livestreamPlayerRef: ElementRef<HTMLVideoElement>;

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
    // ADR-105 — mode preview iframe : la Remote V2 charge la TV avec `?preview=1`
    // pour afficher un mini-monitor sans dégrader la diffusion principale.
    // Mute audio + skip analytics + skip socket-register.
    this.isPreviewMode = this.route.snapshot.queryParamMap.get('preview') === '1';

    // Phase 5 — PROP-002: read displayIndex from route param /display/:n
    const routeN = this.route.snapshot.params['n'];
    if (routeN !== undefined) {
      this.displayIndex = parseInt(routeN, 10) || 0;
    } else {
      // Fallback: route data (rétrocompat accès direct sans param)
      this.displayIndex = this.route.snapshot.data['displayType'] === 'secondary' ? 1 : 0;
    }
    this.displayType = this.resolveDisplayType(this.displayIndex, this.configuration);
    console.log(`[TV] Display type: ${this.displayType}, index: ${this.displayIndex}, preview: ${this.isPreviewMode}`);

    // ADR-060 Phase 3 couche 2 — activation QR hotspot via query param (?fallback=hotspot)
    const fallback = this.route.snapshot.queryParamMap.get('fallback');
    if (fallback === 'hotspot') {
      this.showHotspotQr = true;
    }

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

    // Recording ON par défaut au boot du TV principal (incident 2026-05-14 : la
    // boucle Bresenham sponsors locaux tourne en autonomie sans passer par les
    // commandes socket, donc aucun event analytics ne remontait tant que
    // recordingState restait OFF. Le mode match Remote-driven conserve son
    // comportement : `inactivityExpired` (15 min) coupe le recording si la
    // Remote n'envoie aucun event, et `_isManualOverride` reste false.
    // Mode preview (iframe Remote V2) skip pour ne pas doubler les compteurs.
    if (!this.tvSyncService.isSlaveMode && this.displayType === 'tv' && !this.isPreviewMode) {
      this.recordingState.startRecording(false);
      this.analyticsService.startSession();
    }

    // Initialiser les services (remplace l'ancien initDoubleBuffer monolithique)
    this.initServices();

    // Lancer la boucle vidéo
    this.playbackService.startSeamlessLoop();

    // Initialiser le watermark (délégué au service)
    this.watermarkService.init(this.configuration);

    // Receivers LAN (Fire Stick, smart TV browser) : précharger les vidéos en
    // background pour éliminer le cold-start HTTP/WiFi sur 1er clic. No-op
    // sur le kiosk Pi local (loopback) qui lit en FS direct.
    this.lanPrecacheService.precacheConfiguration(this.configuration);

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

    if (this.isPreviewMode) {
      // ADR-106 — preview-slave init (read-only viewer).
      // Skip master/slave registration (no tvInstances entry, no
      // displays-changed broadcast, no getSaasClientCount increment).
      // Loop sync is driven by 'tv-loop-state' broadcasts only.
      this.initPreviewSlave();
    } else {
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

      // ADR-106 — start preview heartbeat ONLY on the master TV. Emits
      // `tv-preview-tick` every 1s with the master's current playhead
      // position so any preview-slave can correct drift continuously.
      this.tvSyncService.startPreviewHeartbeat(
        () => {
          const player = this.isManualMode
            ? this.doubleBufferService.getActiveManualPlayer()
            : this.doubleBufferService.getActivePlayer();
          return player && player.currentTime ? player.currentTime * 1000 : 0;
        },
        () => this.playbackService.currentLoopIndex,
      );
    }
  }

  /**
   * ADR-106 — preview-slave initialization (only called when isPreviewMode
   * is true). The Remote V2 mini-thumb iframe loads `?preview=1` and
   * instantiates a TvComponent that runs as preview-slave: read-only viewer
   * that mirrors the master's video by listening to `tv-loop-state`
   * broadcasts, without participating in master/slave election.
   *
   * Sync is by `videoIndex` (never `videoPath` — variants secondaires have
   * different paths). The first state arrives ~50ms after register (server
   * emits it immediately on `tv-preview-register`), so the local first-frame
   * flash from `startSeamlessLoop()` is brief and acceptable.
   *
   * Page Visibility API: when the Remote tab is hidden, pause the players
   * to save bandwidth/CPU; resume on visibility return (next tv-loop-state
   * tick re-syncs).
   */
  private initPreviewSlave(): void {
    // ADR-106 — siteId must be in the payload so the central-server can
    // join the socket to the siteId room (the preview iframe skips
    // saas-register per ADR-105, so it never auto-joins). Pi mode is
    // single-tenant: siteId is unused server-side but harmless.
    const params = new URLSearchParams(window.location.search);
    const siteId =
      params.get('site') ||
      localStorage.getItem('neopro_saas_site_id') ||
      '';
    const payload = { siteId } as unknown as Command;

    console.log('[TV] ADR-106 — initializing preview-slave mode', { siteId });

    // Register as preview-slave (no TV instance entry, no display count)
    this.socketService.emit('tv-preview-register', payload);

    // Re-register on socket reconnection
    this.socketService.onReconnect(() => {
      console.log('[TV] Preview-slave: socket reconnected, re-registering');
      this.socketService.emit('tv-preview-register', payload);
    });

    // Receive master loop state — read only, never emit tv-loop-update
    this.socketService.on<LoopState>('tv-loop-state', (state) => {
      this.ngZone.run(() => this.handlePreviewLoopState(state));
    });

    // ADR-106 — heartbeat from master with current playhead (1Hz). Used
    // for continuous drift correction on already-playing video.
    this.socketService.on<{ videoIndex: number; currentTimeMs: number; emittedAt: number }>(
      'tv-preview-tick',
      (tick) => {
        this.ngZone.run(() => this.handlePreviewTick(tick));
      },
    );

    // Page Visibility API — pause players when tab is in background to
    // limit decoder usage; resume on return (next state tick re-syncs).
    document.addEventListener('visibilitychange', () => {
      const playerA = this.playerARef?.nativeElement;
      const playerB = this.playerBRef?.nativeElement;
      if (document.hidden) {
        playerA?.pause();
        playerB?.pause();
        console.log('[TV] Preview-slave: tab hidden, players paused');
      } else {
        // Resume the currently active player; the next tv-loop-state from
        // the master will re-sync if we drifted while hidden.
        const active = this.doubleBufferService.getActivePlayer();
        if (active && active.paused) {
          active.play().catch(() => { /* user interaction not yet granted */ });
        }
        console.log('[TV] Preview-slave: tab visible, players resumed');
      }
    });
  }

  /**
   * ADR-106 — handles `tv-loop-state` broadcasts in preview-slave mode.
   * Sync by `videoIndex` (master playlist is the source of truth), seek to
   * the master's elapsed time. Manual videos are played directly without
   * preload+reveal — the master has already done its transition, the preview
   * just catches up.
   *
   * Drift sources documented in PR #756 review:
   *  - We DO NOT setTimeout before seeking (introduces +500ms drift).
   *  - We recalculate `elapsed` AT seek time (not at receive time).
   *  - We wait for player.readyState >= 3 (HAVE_FUTURE_DATA) before seeking,
   *    otherwise the seek is ignored or clamped on a half-loaded buffer.
   *
   * Read-only: never emits tv-loop-update, never participates in election.
   */
  private handlePreviewLoopState(state: LoopState): void {
    // CASE 1 — master is playing a manual video
    if (state.isManualMode && state.manualVideoPath) {
      const resolvedVideo = this.resolveDisplayVariant({
        name: state.manualVideoPath.split('/').pop() || 'manual',
        path: state.manualVideoPath,
        type: 'video/mp4',
      } as PiConfigVideoEntry);

      const currentManualPlayer = this.doubleBufferService.getActiveManualPlayer();
      const currentManualSrc = currentManualPlayer?.src || '';
      if (!this.manualVideoService.isManualMode || !currentManualSrc.includes(resolvedVideo.path)) {
        console.log('[TV] Preview-slave: master in manual mode, mirroring', state.manualVideoPath);
        this.manualVideoService.play(resolvedVideo);
        this.seekPreviewWhenReady(
          () => this.doubleBufferService.getActiveManualPlayer(),
          state.manualVideoStartedAt,
          'manual',
        );
      }
      return;
    }

    // CASE 2 — master is in loop mode
    if (this.manualVideoService.isManualMode) {
      console.log('[TV] Preview-slave: master returned to loop, stopping manual');
      this.stopManualVideoAndReturnToLoop();
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
    }

    const loopVideos = this.playbackService.currentLoopVideos;
    if (loopVideos.length === 0) {
      // Loop not yet populated — startSeamlessLoop() is async, retry on next tick
      return;
    }

    const syncIndex = state.videoIndex % loopVideos.length;
    const localVideo = loopVideos[syncIndex];
    const activePlayer = this.doubleBufferService.getActivePlayer();
    const activeSrc = activePlayer?.src || '';

    // Already on the right video — apply continuous drift correction only.
    if (localVideo?.path && activeSrc.includes(localVideo.path)) {
      this.applyPreviewDriftCorrection(state.videoStartedAt);
      return;
    }

    console.log(`[TV] Preview-slave: syncing to index ${syncIndex} (${localVideo?.path})`);
    this.doubleBufferService.captureAndShowFreezeFrame();
    if (localVideo?.path) {
      this.doubleBufferService.playOnActivePlayer(localVideo.path, syncIndex);
    }

    this.seekPreviewWhenReady(
      () => this.doubleBufferService.getActivePlayer(),
      state.videoStartedAt,
      'loop',
    );
  }

  /**
   * Seek a preview player to (now - startedAt) the moment it has enough
   * buffered data, then keep correcting drift on subsequent state ticks.
   * Polls readyState >= 3 (HAVE_FUTURE_DATA) every 50ms, max 2s, then
   * applies the seek with `elapsed` recomputed at apply-time (not at
   * call-time — the master's `videoStartedAt` is absolute, not relative).
   */
  private seekPreviewWhenReady(
    getPlayer: () => HTMLVideoElement | null,
    startedAt: number | null,
    label: 'loop' | 'manual',
  ): void {
    if (!startedAt) return;
    const start = Date.now();
    const tick = () => {
      const player = getPlayer();
      if (!player) return;
      if (player.readyState < 3 || !player.duration) {
        if (Date.now() - start > 2000) {
          console.warn(`[TV] Preview-slave: ${label} seek timeout, player not ready`);
          return;
        }
        setTimeout(tick, 50);
        return;
      }
      // RECOMPUTE elapsed at apply time — using the value captured at
      // call time would burn ~50–250ms of polling latency into the seek.
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed > 0.2 && elapsed < player.duration) {
        const drift = Math.abs(player.currentTime - elapsed);
        player.currentTime = elapsed;
        console.log(
          `[TV] Preview-slave: ${label} seek → ${elapsed.toFixed(2)}s (drift was ${drift.toFixed(2)}s)`,
        );
      }
    };
    tick();
  }

  /**
   * ADR-106 — handles `tv-preview-tick` heartbeat (1Hz from master).
   * Authoritative source of truth for the master's current playhead.
   * Applies drift correction if delta > 200ms; ignored if we're not on
   * the right videoIndex yet (next tv-loop-state will resync).
   */
  private handlePreviewTick(tick: { videoIndex: number; currentTimeMs: number; emittedAt: number }): void {
    const loopVideos = this.playbackService.currentLoopVideos;
    if (!loopVideos.length) return;
    const expectedIndex = tick.videoIndex % loopVideos.length;
    const expectedVideo = loopVideos[expectedIndex];
    const player = this.doubleBufferService.getActivePlayer();
    if (!player || !expectedVideo?.path) return;
    if (!player.src.includes(expectedVideo.path)) return; // wrong video; tv-loop-state will fix
    if (player.readyState < 3 || !player.duration) return;
    // Adjust for one-way network latency (ms since master emit)
    const networkLatencyMs = Math.max(0, Date.now() - tick.emittedAt);
    const masterCurrentSec = (tick.currentTimeMs + networkLatencyMs) / 1000;
    if (masterCurrentSec >= player.duration) return;
    const drift = player.currentTime - masterCurrentSec;
    if (Math.abs(drift) > 0.2) {
      console.log(
        `[TV] Preview-slave: tick correction local=${player.currentTime.toFixed(2)}s master=${masterCurrentSec.toFixed(2)}s drift=${drift.toFixed(2)}s lat=${networkLatencyMs}ms`,
      );
      player.currentTime = masterCurrentSec;
    }
  }

  /**
   * Continuous drift correction on already-playing video. Called from each
   * state tick when the preview is already on the correct videoIndex.
   * If drift exceeds 200ms, snap back to the master's elapsed position.
   */
  private applyPreviewDriftCorrection(startedAt: number | null): void {
    if (!startedAt) return;
    const player = this.doubleBufferService.getActivePlayer();
    if (!player || player.readyState < 3 || !player.duration) return;
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed <= 0 || elapsed >= player.duration) return;
    const drift = player.currentTime - elapsed;
    if (Math.abs(drift) > 0.2) {
      console.log(
        `[TV] Preview-slave: drift correction local=${player.currentTime.toFixed(2)}s master=${elapsed.toFixed(2)}s drift=${drift.toFixed(2)}s`,
      );
      player.currentTime = elapsed;
    }
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
      // ADR-103 Phase 2b — when the loop reaches a web_page / livestream
      // step, delegate to WebContentService.playInLoop. The completion
      // callback advances the loop to the next step (handled inside
      // VideoPlaybackService.advanceLoop).
      // ADR-103 Phase 1.5b — also emit `tv-loop-state` with the web/live
      // payload so dual-display slaves mirror the iframe / livestream
      // (the emit happens only on master; isSlaveMode no-op).
      playWebContentInLoop: (entry, onComplete) => {
        if (this.tvSyncService.tvRole === 'master') {
          const externalUrl = entry?.externalUrl || entry?.path || '';
          const durationMs = entry?.durationSeconds ? entry.durationSeconds * 1000 : null;
          this.tvSyncService.emitLoopState(
            this.playbackService.currentLoopIndex,
            externalUrl,
            false,
            undefined,
            {
              contentType: entry.contentType === 'livestream' ? 'livestream' : 'web_page',
              externalUrl,
              durationMs,
              name: entry?.name ?? null,
            },
          );
        }
        this.webContentService.playInLoop(entry, onComplete);
      },
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
          // La vidéo manuelle a planté (404, format invalide, timeout réseau).
          // Le loop player est en pause sous le manual player KO ; sans relance
          // explicite l'écran reste figé sur la freeze frame.
          this.doubleBufferService.hideFreezeFrame();
          this.doubleBufferService.hideBlackOverlay();
          this.isManualMode = false;
          this.lastTriggerType = 'auto';
          console.log('[TV] Manual video error - resuming loop');
          this.playbackService.startSeamlessLoop();
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

    // 4b. ADR-089 — Register web page / livestream DOM elements
    this.webContentService.registerElements(
      this.webFrameRef.nativeElement,
      this.livestreamPlayerRef.nativeElement,
    );

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
      const video = command.data as PiConfigVideoEntry;
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
    } else if (command.type === 'web-page' && command.data) {
      const payload = command.data as WebPagePayload;
      if (this.isDuplicateCommand(`web-page:${payload.url}`)) return;
      this.lastTriggerType = 'manual';
      this.tvSyncService.markActionReceived();
      this.webContentService.showWebPage(payload);
    } else if (command.type === 'livestream' && command.data) {
      const payload = command.data as LivestreamPayload;
      if (this.isDuplicateCommand(`livestream:${payload.url}`)) return;
      this.lastTriggerType = 'manual';
      this.tvSyncService.markActionReceived();
      this.webContentService.showLivestream(payload);
    } else if (command.type === 'stop-manual') {
      if (this.isDuplicateCommand('stop-manual')) return;
      // ADR-103 Phase 2.5 — bouton Stop de la Remote : coupe selon ce qui
      // joue actuellement (web/live OU vidéo manuelle MP4) et reprend la
      // boucle. Les 2 services savent retourner à la boucle correctement
      // (jamais sur la même web/live, jamais sur la même manuelle).
      if (this.webContentService.isActive) {
        this.webContentService.returnToLoop();
      } else if (this.isManualMode) {
        this.manualVideoService.stopAndReturnToLoop(
          this.manualPlayerARef.nativeElement,
          this.manualPlayerBRef.nativeElement,
        );
      }
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

  private resolveDisplayType(idx: number, cfg?: Configuration): string {
    const fromConfig = cfg?.displays?.[idx]?.type;
    return fromConfig ?? (idx === 0 ? 'tv' : idx === 1 ? 'secondary' : `display-${idx}`);
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

  private findVideoInConfig(path: string): PiConfigVideoEntry | Sponsor | null {
    const sponsor = this.configuration.sponsors?.find(s => s.path === path);
    if (sponsor) return sponsor;

    if (this.configuration.timeCategories) {
      for (const tc of this.configuration.timeCategories) {
        const loopVideo = tc.loopVideos?.find(v => v.path === path);
        if (loopVideo) return loopVideo;
      }
    }

    const searchCategories = (cats: Category[]): PiConfigVideoEntry | null => {
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
    this.displayType = this.resolveDisplayType(this.displayIndex, config);
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
