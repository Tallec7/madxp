import { Injectable } from '@angular/core';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { VideoErrorRecoveryService } from './video-error-recovery.service';
import { AnalyticsService } from './analytics.service';
import { RecordingStateService } from './recording-state.service';
import { PlayerStateService } from './player-state.service';
import { PiConfigVideoEntry } from '../interfaces/video.interface';

/**
 * Callbacks fournis par TvComponent pour les opérations qui dépendent du contexte
 * (socket, master/slave, display type).
 */
export interface ManualVideoCallbacks {
  getIsSlaveMode: () => boolean;
  getTvRole: () => 'master' | 'slave' | null;
  getDisplayType: () => string;
  emitLoopUpdate: (state: Record<string, unknown>) => void;
  emitPlayerState: (partial: Partial<import('./player-state.service').PlayerState>) => void;
}

/**
 * Service de lecture des vidéos manuelles (déclenchées par la télécommande).
 * Extrait de tv.component.ts — gère play(), preload (ADR-034), reveal, cleanup.
 */
@Injectable({
  providedIn: 'root'
})
export class ManualVideoService {
  // État des players manuels
  private _isManualMode = false;
  private _manualRecordingStarted = false;
  private _currentManualEndedHandler: (() => void) | null = null;
  private _savedLoopIndex = 0;

  // Debounce: prevent rapid successive play() calls causing black frames on Pi 5
  private _lastPlayTimestamp = 0;
  private static readonly PLAY_DEBOUNCE_MS = 150;

  /**
   * ADR-103 Phase 0 — only `contentType: 'video'` entries are playable in <video>.
   * Synthetic filenames `web_page-<ts>` / `livestream-<ts>` (legacy dashboard entries
   * that lost contentType) are also refused. web_page / livestream must route through
   * WebContentPlayer (Phase 1), not this service.
   */
  static isPlayableVideoEntry(video: PiConfigVideoEntry | null | undefined): boolean {
    if (!video?.path) return false;
    if ((video.contentType ?? 'video') !== 'video') return false;
    if (/(?:^|\/)(?:web_page|livestream)-\d+$/.test(String(video.path))) return false;
    return true;
  }

  // ADR-034: Preloaded manual video state for synchronized reveal
  private _preloadedManualVideo: PiConfigVideoEntry | null = null;
  private _preloadedManualPlayer: HTMLVideoElement | null = null;
  private _preloadReady = false;
  private _pendingReveal = false;

  // Transition quality metrics — slave-specific counters
  public preloadRevealCount = 0;
  public preloadCleanupCount = 0;

  private callbacks: ManualVideoCallbacks | null = null;

  get isManualMode(): boolean { return this._isManualMode; }
  set isManualMode(val: boolean) { this._isManualMode = val; }

  get savedLoopIndex(): number { return this._savedLoopIndex; }

  get hasPreloadedVideo(): boolean { return !!this._preloadedManualVideo; }

  constructor(
    private readonly doubleBufferService: DoubleBufferVideoService,
    private readonly playbackService: VideoPlaybackService,
    private readonly errorRecoveryService: VideoErrorRecoveryService,
    private readonly analyticsService: AnalyticsService,
    private readonly recordingState: RecordingStateService,
    private readonly playerStateService: PlayerStateService,
  ) {}

  init(callbacks: ManualVideoCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Joue une vidéo manuelle (master path).
   */
  play(video: PiConfigVideoEntry): void {
    if (!ManualVideoService.isPlayableVideoEntry(video)) {
      // ADR-103 Phase 0 — refuse web_page / livestream in <video>.
      console.warn('[ManualVideo] Refused non-video entry — ADR-103 Phase 0 guard', { path: video?.path, contentType: video?.contentType });
      return;
    }

    const now = Date.now();
    if (now - this._lastPlayTimestamp < ManualVideoService.PLAY_DEBOUNCE_MS) {
      console.log('tv player : play manual video debounced (too rapid)', video.path);
      return;
    }
    this._lastPlayTimestamp = now;

    // Instrumentation latence (ADR-057) — T0 = clic télécommande reçu.
    // Mesurable via logs : deltas play→loadeddata et play→visible.
    const latencyT0 = performance.now();
    console.log('tv player : play manual video', video.path);

    // Use inactive manual player for double-buffering (manual→manual transitions)
    const targetPlayer = this.doubleBufferService.getInactiveManualPlayer();

    // Nettoyer l'ancien listener ended pour éviter qu'il se déclenche
    // quand on change le src (causerait hideFreezeFrame prématuré → flash boucle)
    if (this._currentManualEndedHandler) {
      targetPlayer.removeEventListener('ended', this._currentManualEndedHandler);
      this._currentManualEndedHandler = null;
    }
    // Stopper proprement le player avant de changer de source
    targetPlayer.pause();

    // ETAPE 0: Mettre isManualMode IMMEDIATEMENT pour bloquer les transitions de boucle
    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this._isManualMode = true;

    // ADR-033: Emettre IMMEDIATEMENT tv-loop-update avec isManualMode: true
    if (this.callbacks?.getTvRole() === 'master') {
      this.callbacks.emitLoopUpdate({
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

    // ETAPE 1: Détecter si une vidéo manuelle est déjà visible (transition manuel→manuel).
    // On teste le player ACTIF (celui qui joue actuellement), pas targetPlayer (inactif, toujours opacity=0).
    const activeManualPlayer = this.doubleBufferService.getActiveManualPlayer();
    const isManualToManual = activeManualPlayer.style.opacity === '1' && !activeManualPlayer.paused;

    // ETAPE 2: En manuel→manuel, l'ancien player reste visible derrière — pas de freeze-frame
    // (sinon on capture la boucle via le frame périodique → flash boucle pendant ~500ms).
    // En boucle→manuel, capturer le freeze-frame depuis le player manuel actif (qui est vide/pausé,
    // donc isManualMode=true force une capture live depuis le player de boucle via fallback).
    if (!isManualToManual) {
      const freezeOk = this.doubleBufferService.captureAndShowFreezeFrame(false);
      if (!freezeOk) {
        this.doubleBufferService.showBlackOverlay();
      }
    }

    // ETAPE 3: Garder le player manuel INVISIBLE pendant le chargement
    targetPlayer.style.opacity = '0';
    targetPlayer.style.zIndex = '10';

    // ETAPE 4: Configurer la source
    targetPlayer.src = video.path;
    targetPlayer.load();

    let switchDone = false;

    // ETAPE 5: Quand la video est prete, la jouer puis rendre visible
    const doSwitch = () => {
      if (switchDone) return;
      switchDone = true;

      targetPlayer.play().then(() => {
        // Un seul rAF pour laisser le frame vidéo être décodé avant reveal.
        // Le setTimeout(200) + double rAF historiques ajoutaient ~230ms perçus
        // sans bénéfice vs un rAF simple post-play() sur Pi 4/5 (hardware decode).
        requestAnimationFrame(() => {
          targetPlayer.style.opacity = '1';
          this.doubleBufferService.swapActiveManualPlayer();
          this.doubleBufferService.hideFreezeFrame();
          this.doubleBufferService.hideBlackOverlay();

          // Tracker (desactive pour les slaves)
          if (!this.callbacks?.getIsSlaveMode()) {
            if (!this.recordingState.isRecording) {
              console.log('[TV] Auto-start recording for manual video');
              this.recordingState.startRecording(false);
              this._manualRecordingStarted = true;
            }
            if (this.callbacks?.getDisplayType() === 'tv') {
              this.analyticsService.trackVideoStart(video, 'manual');
            }
          }

          this.callbacks?.emitPlayerState({
            currentVideo: PlayerStateService.filenameFromPath(video.path),
            currentCategory: null,
            duration: targetPlayer.duration || 0,
            currentTime: 0,
            isManualMode: true,
            isPlaying: true,
            lastError: null,
            lastTransitionAt: new Date().toISOString(),
          });

          // Emettre l'etat si master (video manuelle — visible maintenant)
          if (this.callbacks?.getTvRole() === 'master') {
            this.callbacks.emitLoopUpdate({
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

          const visibleMs = Math.round(performance.now() - latencyT0);
          console.log(`tv player : manual video playing, freeze frame hidden (+${visibleMs}ms)`);
        });
      }).catch(err => {
        console.error('tv player : error playing manual video', err);
        this.doubleBufferService.hideFreezeFrame();
        this.doubleBufferService.hideBlackOverlay();
        targetPlayer.style.opacity = '0';
      });
    };

    // Démarrer dès que le premier frame est décodé (loadeddata) plutôt qu'à
    // canplaythrough (attente de bufferisation complète, 200-500ms sur SD lente).
    // Le double-buffer masque la boucle pendant que la vidéo se bufferise en jouant.
    const onReady = () => {
      targetPlayer.removeEventListener('loadeddata', onReady);
      clearTimeout(fallbackTimeout);
      const loadedMs = Math.round(performance.now() - latencyT0);
      console.log(`tv player : loadeddata received (+${loadedMs}ms)`);
      doSwitch();
    };

    targetPlayer.addEventListener('loadeddata', onReady, { once: true });

    const fallbackTimeout = setTimeout(() => {
      if (!switchDone) {
        console.warn('tv player : manual video timeout, forcing switch');
        targetPlayer.removeEventListener('loadeddata', onReady);
        doSwitch();
      }
    }, 5000);

    // Listener pour la fin de la video manuelle
    const onManualEnded = () => {
      console.log('tv player : manual video ended', video.path);
      targetPlayer.removeEventListener('ended', onManualEnded);

      if (!this.callbacks?.getIsSlaveMode() && this.callbacks?.getDisplayType() === 'tv') {
        this.analyticsService.trackVideoEnd(true);
        if (this._manualRecordingStarted) {
          console.log('[TV] Auto-stop recording after manual video ended');
          this.recordingState.stopRecording(false);
          this._manualRecordingStarted = false;
        }
      }

      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.removeAttribute('src');
      targetPlayer.load();

      this._isManualMode = false;

      const activeLoopPlayer = this.doubleBufferService.getActivePlayer();
      if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.playbackService.isLoopMode) {
        const resumeAt = this._savedLoopIndex + 1;
        console.log('tv player : loop died during manual, restarting at index', resumeAt);
        this.callbacks?.emitPlayerState({ loopResumedFrom: this._savedLoopIndex });
        this.doubleBufferService.captureAndShowFreezeFrame();
        this.doubleBufferService.resetSwitchState();
        this.playbackService.startSeamlessLoop(resumeAt);
      } else {
        this.doubleBufferService.hideFreezeFrame();
        this.doubleBufferService.hideBlackOverlay();
      }

      console.log('tv player : returning to loop');
      this._currentManualEndedHandler = null;
    };

    this._currentManualEndedHandler = onManualEnded;
    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * ADR-034: Preload a manual video without revealing it.
   * Slaves call this on 'action' and wait for master's manualVideoVisible: true signal.
   */
  preloadManualVideo(video: PiConfigVideoEntry): void {
    console.log('[TV] Slave: preloading manual video silently (no freeze/overlay):', video.path);

    this.cleanupPreloadState();

    const targetPlayer = this.doubleBufferService.getActiveManualPlayer();

    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this._isManualMode = true;

    // ADR-034 fix: If replacing an already-visible manual video, capture freeze-frame
    const isReplacingManual = targetPlayer.style.opacity === '1' && !targetPlayer.paused;
    if (isReplacingManual) {
      console.log('[TV] Slave: manual->manual transition, capturing freeze-frame');
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
      targetPlayer.removeAttribute('src');
      targetPlayer.load();

      this._isManualMode = false;
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
  revealPreloadedVideo(): void {
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

    this.callbacks?.emitPlayerState({
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
    this.preloadRevealCount++;

    this._preloadedManualVideo = null;
    this._preloadedManualPlayer = null;
    this._preloadReady = false;
    this._pendingReveal = false;
  }

  /**
   * ADR-034: Clean up preload state without revealing.
   */
  cleanupPreloadState(): void {
    if (!this._preloadedManualVideo) return;

    console.log('[TV] Slave: cleaning up preload state');
    this.preloadCleanupCount++;

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

    this._isManualMode = false;
  }

  /**
   * Stop manual video and return to loop (used by phase switch, master-slave sync).
   */
  stopAndReturnToLoop(
    manualPlayerA: HTMLVideoElement,
    manualPlayerB: HTMLVideoElement,
  ): void {
    console.log('[TV] Stopping manual video to return to loop');

    this.playbackService.stopManualVideoAndReturnToLoop(manualPlayerA, manualPlayerB);

    if (!this.callbacks?.getIsSlaveMode() && this.callbacks?.getDisplayType() === 'tv') {
      this.analyticsService.trackVideoEnd(false);
    }

    this._isManualMode = false;
  }
}
