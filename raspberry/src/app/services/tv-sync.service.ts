import { Injectable, NgZone, inject } from '@angular/core';
import { SocketService, LoopState } from './socket.service';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { ManualVideoService } from './manual-video.service';
import { WebContentService } from './web-content.service';
import { PiConfigVideoEntry } from '../interfaces/video.interface';

/**
 * Callbacks fournis par TvComponent pour les operations qui dependent du contexte.
 */
export interface TvSyncCallbacks {
  getDisplayType: () => string;
  getDisplayIndex: () => number;
  resolveDisplayVariant: <T extends { path: string; variants?: Record<string, { path: string }> }>(video: T) => T;
  onRoleAssigned: (role: 'master' | 'slave') => void;
  onDemotion: () => void;
  onHdmiStatus: (data: { hdmi0: boolean; hdmi1: boolean; wrongPort: boolean }) => void;
  onPromotion: (reason: string) => void;
  onFailoverDemotion: (reason: string) => void;
  onSlaveReturnToLoop: () => void;
}

/**
 * Service de synchronisation Master-Slave pour le multi-ecran TV.
 * Extrait de tv.component.ts — gere l'enregistrement TV, la reception de role,
 * l'emission de l'etat de boucle, et la synchronisation slave.
 */
@Injectable({
  providedIn: 'root'
})
export class TvSyncService {
  // Role et mode
  private _tvRole: 'master' | 'slave' | null = null;
  private _isSlaveMode = false;

  // Guard anti-race condition (ADR-033)
  private _lastActionReceivedAt = 0;
  /**
   * ADR-103 Phase 1.5b — last time the slave handled a content_type
   * transition (video → web/live or vice versa). Used to ignore stale
   * `tv-loop-state` messages emitted by the master before the transition
   * (similar to `_lastActionReceivedAt` for ADR-033).
   */
  private _lastContentTypeChangeAt = 0;
  /**
   * ADR-103 Phase 1.5b — track what content type the slave is currently
   * showing locally (synced from master). Used to detect transitions and
   * avoid replaying the same web/live URL on every state tick.
   */
  private _slaveCurrentContentType: 'video' | 'web_page' | 'livestream' = 'video';
  private _slaveCurrentExternalUrl: string | null = null;

  // ADR-103 Phase 1.5b — WebContentService injected lazily via DI to avoid
  // bloating the constructor signature.
  private readonly webContentService = inject(WebContentService);

  // Transition quality metrics — slave-specific
  private transitionMetrics = {
    staleLoopStateCount: 0,
    preloadRevealCount: 0,
    preloadCleanupCount: 0,
  };
  private transitionMetricsInterval: ReturnType<typeof setInterval> | null = null;

  private callbacks: TvSyncCallbacks | null = null;

  get tvRole(): 'master' | 'slave' | null { return this._tvRole; }
  get isSlaveMode(): boolean { return this._isSlaveMode; }

  constructor(
    private readonly socketService: SocketService,
    private readonly ngZone: NgZone,
    private readonly doubleBufferService: DoubleBufferVideoService,
    private readonly playbackService: VideoPlaybackService,
    private readonly manualVideoService: ManualVideoService,
  ) {}

  init(callbacks: TvSyncCallbacks): void {
    this.callbacks = callbacks;
    this.registerSocketHandlers();
    this.transitionMetricsInterval = setInterval(() => this.emitSlaveTransitionMetrics(), 30000);
  }

  destroy(): void {
    if (this.transitionMetricsInterval) {
      clearInterval(this.transitionMetricsInterval);
      this.transitionMetricsInterval = null;
    }
    this.stopPreviewHeartbeat();
  }

  /**
   * Called by TvComponent when a manual action command is received (to set the guard timestamp).
   */
  markActionReceived(): void {
    this._lastActionReceivedAt = Date.now();
  }

  /**
   * Emit loop state to slaves (master only).
   *
   * ADR-103 Phase 1.5b — when the loop step is web/live, pass `webContent`
   * so the slave routes to its own WebContentService instead of trying to
   * play `videoPath` as MP4 (which would fail in the DoubleBuffer).
   */
  emitLoopState(
    videoIndex: number,
    videoPath: string,
    isManualMode: boolean,
    manualVideoPath?: string,
    webContent?: { contentType: 'web_page' | 'livestream'; externalUrl: string; durationMs?: number | null; name?: string | null },
  ): void {
    const state: LoopState = {
      videoIndex,
      videoPath,
      videoStartedAt: Date.now(),
      isManualMode,
      manualVideoPath: manualVideoPath || null,
      manualVideoStartedAt: isManualMode ? Date.now() : null,
      manualVideoVisible: false, // ADR-034: loop emissions are never manual-visible
      updatedAt: Date.now(),
      currentContentType: webContent?.contentType ?? 'video',
      currentExternalUrl: webContent?.externalUrl ?? null,
      currentDurationMs: webContent?.durationMs ?? null,
      currentName: webContent?.name ?? null,
    };

    this.socketService.emit('tv-loop-update', state);
    console.log('[TV] Master emitted loop state:', {
      videoIndex,
      videoPath,
      isManualMode,
      contentType: state.currentContentType,
    });
  }

  /**
   * ADR-106 — heartbeat master → preview-slave for continuous drift
   * correction. Emits the master's *current* `player.currentTime` every
   * 1s. The preview applies the correction iff drift > 200ms (cf.
   * `applyPreviewDriftCorrection` in TvComponent). Slaves classiques
   * ignore this event — they sync via `tv-loop-state` only.
   *
   * Lightweight payload: `{videoIndex, currentTimeMs}`. No persistence
   * server-side; just relayed to room.
   */
  startPreviewHeartbeat(getCurrentTimeMs: () => number, getVideoIndex: () => number): void {
    if (this.previewHeartbeatInterval) return;
    this.previewHeartbeatInterval = setInterval(() => {
      const currentTimeMs = getCurrentTimeMs();
      const videoIndex = getVideoIndex();
      if (currentTimeMs <= 0 || videoIndex < 0) return;
      this.socketService.emit('tv-preview-tick', {
        videoIndex,
        currentTimeMs,
        emittedAt: Date.now(),
      } as unknown as import('../interfaces/command.interface').Command);
    }, 1000);
  }

  stopPreviewHeartbeat(): void {
    if (this.previewHeartbeatInterval) {
      clearInterval(this.previewHeartbeatInterval);
      this.previewHeartbeatInterval = null;
    }
  }

  private previewHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private registerSocketHandlers(): void {
    const displayType = this.callbacks!.getDisplayType();
    const displayIndex = this.callbacks!.getDisplayIndex();

    // Register as TV instance
    this.socketService.emit('tv-register', { displayType, displayIndex } as unknown as import('../interfaces/command.interface').Command);

    // Re-register on reconnection
    this.socketService.onReconnect(() => {
      console.log('[TV] Socket reconnected — re-registering as', displayType);
      this.socketService.emit('tv-register', { displayType, displayIndex } as unknown as import('../interfaces/command.interface').Command);
    });

    // Role assignment
    this.socketService.on<{ role: 'master' | 'slave' }>('tv-role-assigned', (data) => {
      this.ngZone.run(() => {
        const wasMaster = this._tvRole === 'master';
        const wasAlreadySlave = this._isSlaveMode;
        this._tvRole = data.role;
        this._isSlaveMode = data.role === 'slave';
        console.log(`[TV] Role assigned: ${data.role}, displayType: ${displayType}`);

        if (wasMaster && this._isSlaveMode && displayType === 'tv') {
          this.callbacks?.onDemotion();
        }

        this.callbacks?.onRoleAssigned(data.role);

        if (this._isSlaveMode) {
          console.log('[TV] Running as SLAVE - analytics disabled, waiting for master state');
          // Stop emitting heartbeat ticks: only the master should broadcast them.
          // Without this, a slave in a multi-slave setup would emit ticks received
          // by other slaves as false "master" ground-truth (drift confusion).
          this.stopPreviewHeartbeat();
          // Skip freeze+pause if already slave (Socket.IO reconnect) — the player
          // kept running during the gap, tv-loop-state will re-sync if needed.
          if (this.playbackService.isLoopMode && !wasAlreadySlave) {
            this.doubleBufferService.captureAndShowFreezeFrame();
            this.doubleBufferService.pauseLoopPlayers();
            console.log('[TV] Slave: paused independent loop, waiting for master sync');
          }
        } else {
          console.log('[TV] Running as MASTER - will emit loop state updates');
        }
      });
    });

    // Master loop state (slaves only)
    this.socketService.on<LoopState>('tv-loop-state', (state) => {
      if (!this._isSlaveMode) return;
      this.ngZone.run(() => {
        this.handleMasterLoopState(state);
      });
    });

    // HDMI status
    this.socketService.on<{ hdmi0: boolean; hdmi1: boolean; wrongPort: boolean }>('hdmi-status-update', (data) => {
      this.ngZone.run(() => {
        this.callbacks?.onHdmiStatus(data);
      });
    });

    // Failover promotion
    this.socketService.on<{ reason: string }>('tv-role-promotion', (data) => {
      this.ngZone.run(() => {
        this.callbacks?.onPromotion(data.reason);
      });
    });

    // Failover demotion
    this.socketService.on<{ reason: string }>('tv-role-demotion', (data) => {
      this.ngZone.run(() => {
        this.callbacks?.onFailoverDemotion(data.reason);
      });
    });

    // Continuous drift correction for TV slaves (ADR-106 extension).
    // Preview slaves get this in tv.component.ts; TV slaves (Fire Stick / LAN
    // receivers) subscribe here. Same 200ms threshold — corrects the residual
    // drift that accumulates after initial seek, without re-triggering a full
    // sync (which would freeze-frame on every tick).
    this.socketService.on<{ videoIndex: number; currentTimeMs: number; emittedAt: number }>(
      'tv-preview-tick',
      (tick) => {
        if (!this._isSlaveMode) return;
        this.ngZone.run(() => this.applyTvSlaveDriftCorrection(tick));
      },
    );
  }

  private applyTvSlaveDriftCorrection(tick: { videoIndex: number; currentTimeMs: number; emittedAt: number }): void {
    const loopVideos = this.playbackService.currentLoopVideos;
    if (!loopVideos.length) return;
    const expectedIndex = tick.videoIndex % loopVideos.length;
    const expectedVideo = this.callbacks!.resolveDisplayVariant(loopVideos[expectedIndex]);
    const player = this.doubleBufferService.getActivePlayer();
    if (!player || !expectedVideo?.path) return;
    if (!player.src.includes(expectedVideo.path)) return; // wrong video; tv-loop-state will fix
    if (player.readyState < 3 || !player.duration) return;
    const networkLatencyMs = Math.max(0, Date.now() - tick.emittedAt);
    const masterCurrentSec = (tick.currentTimeMs + networkLatencyMs) / 1000;
    if (masterCurrentSec >= player.duration) return;
    const drift = player.currentTime - masterCurrentSec;
    if (Math.abs(drift) > 0.2) {
      console.log(
        `[TV] Slave: drift correction local=${player.currentTime.toFixed(2)}s master=${masterCurrentSec.toFixed(2)}s drift=${drift.toFixed(2)}s lat=${networkLatencyMs}ms`,
      );
      player.currentTime = masterCurrentSec;
    }
  }

  private handleMasterLoopState(state: LoopState): void {
    console.log('[TV] Slave received master state:', {
      videoPath: state.videoPath,
      videoIndex: state.videoIndex,
      isManualMode: state.isManualMode,
      manualVideoPath: state.manualVideoPath,
      contentType: state.currentContentType,
    });

    const masterContentType = state.currentContentType ?? 'video';
    const masterExternalUrl = state.currentExternalUrl ?? null;

    // ADR-103 Phase 1.5b — CAS 0 : the master is currently in a web/live
    // step (rotation auto Phase 2b). Mirror the same iframe / livestream
    // on this slave display.
    if (!state.isManualMode && masterContentType !== 'video') {
      const sameAsCurrent =
        this._slaveCurrentContentType === masterContentType &&
        this._slaveCurrentExternalUrl === masterExternalUrl &&
        this.webContentService.isActive;
      if (sameAsCurrent) {
        // Already showing the same web/live entry — nothing to do, the
        // master keeps emitting state ticks but we don't want to reload
        // the iframe each time (would flash).
        return;
      }

      console.log('[TV] Slave: master is in web/live step, mirroring', {
        contentType: masterContentType,
        url: masterExternalUrl,
      });
      this._lastContentTypeChangeAt = Date.now();
      this._slaveCurrentContentType = masterContentType;
      this._slaveCurrentExternalUrl = masterExternalUrl;

      if (!masterExternalUrl) {
        console.warn('[TV] Slave: master web/live state missing externalUrl, skipping');
        return;
      }

      // The master drives the loop advancement — onComplete on the slave
      // is a no-op (no analytics, no advancement). The next tv-loop-state
      // emit by the master will move the slave to the next step.
      this.webContentService.playInLoop(
        {
          contentType: masterContentType,
          path: masterExternalUrl,
          externalUrl: masterExternalUrl,
          name: state.currentName ?? undefined,
          durationSeconds:
            state.currentDurationMs && state.currentDurationMs > 0
              ? Math.round(state.currentDurationMs / 1000)
              : null,
        },
        () => { /* slave: master drives advancement */ },
      );
      return;
    }

    // ADR-103 Phase 1.5b — CAS 0bis : we were showing a web/live step but
    // the master is now back to MP4 (or manual). Tear down the iframe so
    // the next MP4 frame is visible.
    if (
      this._slaveCurrentContentType !== 'video' &&
      (masterContentType === 'video' || state.isManualMode)
    ) {
      console.log('[TV] Slave: master left web/live step, returning to MP4 / manual');
      this._lastContentTypeChangeAt = Date.now();
      this._slaveCurrentContentType = 'video';
      this._slaveCurrentExternalUrl = null;
      // returnToLoop in slave context: webContent teardown + freeze frame.
      // The slave's playback stays driven by the next master state tick.
      if (this.webContentService.isActive) {
        this.webContentService.returnToLoop(false);
      }
    }

    // ADR-103 Phase 1.5b — guard against stale MP4 state arriving WITHIN
    // 2s of the slave's content_type transition (same pattern as ADR-033
    // for `_lastActionReceivedAt`). The master's emit ordering can produce
    // a brief window where an old MP4 state lands after we already routed
    // to web/live, which would briefly flicker the MP4 underneath.
    const msSinceContentTypeChange = Date.now() - this._lastContentTypeChangeAt;
    if (
      msSinceContentTypeChange < 2000 &&
      masterContentType === 'video' &&
      this.webContentService.isActive
    ) {
      console.log(`[TV] Slave: ignoring stale MP4 state (content-type changed ${msSinceContentTypeChange}ms ago)`);
      this.transitionMetrics.staleLoopStateCount++;
      return;
    }

    // CAS 1: Le master joue une video manuelle
    if (state.isManualMode && state.manualVideoPath) {
      const resolvedVideo = this.callbacks!.resolveDisplayVariant({
        name: state.manualVideoPath.split('/').pop() || 'manual',
        path: state.manualVideoPath,
        type: 'video/mp4'
      } as PiConfigVideoEntry);

      // Sous-cas 1a: manualVideoVisible !== true -> preload si pas deja fait
      if (state.manualVideoVisible !== true) {
        if (!this.manualVideoService.hasPreloadedVideo) {
          const displayType = this.callbacks!.getDisplayType();
          console.log('[TV] Slave: preloading manual video from master state:', state.manualVideoPath,
            displayType !== 'tv' ? `(resolved: ${resolvedVideo.path})` : '');
          this.manualVideoService.preloadManualVideo(resolvedVideo);
        }
        return;
      }

      // Sous-cas 1b: manualVideoVisible === true -> reveal ou play direct
      if (this.manualVideoService.hasPreloadedVideo) {
        console.log('[TV] Slave: master revealed, showing preloaded video');
        this.manualVideoService.revealPreloadedVideo();
        return;
      }

      // Fallback: manualVideoVisible === true mais pas de preload (backward compat / race condition)
      const currentManualPlayer = this.doubleBufferService.getActiveManualPlayer();
      const currentManualSrc = currentManualPlayer?.src || '';

      if (!this.manualVideoService.isManualMode || !currentManualSrc.includes(resolvedVideo.path)) {
        const displayType = this.callbacks!.getDisplayType();
        console.log('[TV] Slave: master revealed but no preload ready, direct play:', state.manualVideoPath,
          displayType !== 'tv' ? `(resolved: ${resolvedVideo.path})` : '');
        this.manualVideoService.play(resolvedVideo);

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
    if (this.manualVideoService.hasPreloadedVideo) {
      console.log('[TV] Slave: master returned to loop, cleaning up preload state');
      this.manualVideoService.cleanupPreloadState();
    }

    // ADR-033: Guard anti-race condition
    if (this.manualVideoService.isManualMode) {
      const msSinceLastAction = Date.now() - this._lastActionReceivedAt;
      if (msSinceLastAction < 2000) {
        console.log(`[TV] Slave: ignoring stale loop state (action received ${msSinceLastAction}ms ago)`);
        this.transitionMetrics.staleLoopStateCount++;
        return;
      }
      console.log('[TV] Slave: master returned to loop, stopping manual video');
      this.callbacks?.onSlaveReturnToLoop();
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

    // Reconnect guard: if already playing the correct video (Socket.IO drop/rejoin),
    // skip the freeze+restart — drift correction ticks will handle timing.
    const activePlayer = this.doubleBufferService.getActivePlayer();
    const resolvedLocal = localVideo ? this.callbacks!.resolveDisplayVariant(localVideo) : null;
    if (
      activePlayer &&
      resolvedLocal?.path &&
      !activePlayer.paused &&
      activePlayer.src.includes(resolvedLocal.path)
    ) {
      console.log('[TV] Slave: reconnect guard — already on correct video, skipping re-sync');
      return;
    }

    this.doubleBufferService.captureAndShowFreezeFrame();

    if (localVideo?.path) {
      this.doubleBufferService.playOnActivePlayer(localVideo.path, syncIndex);
    }

    // Seek approximatif au temps du master.
    // elapsed est recalculé DANS le callback (pas avant) pour cibler la position
    // réelle au moment du seek, pas celle au moment de la réception de l'event
    // (sinon décalage fixe = durée du timeout, cf. preview slave ADR-106).
    if (state.videoStartedAt) {
      const videoStartedAt = state.videoStartedAt;
      setTimeout(() => {
        const elapsed = (Date.now() - videoStartedAt) / 1000;
        const player = this.doubleBufferService.getActivePlayer();
        if (player && player.duration && elapsed > 0 && elapsed < player.duration) {
          player.currentTime = elapsed;
          console.log(`[TV] Slave: seeked to ${elapsed.toFixed(1)}s`);
        }
      }, 500);
    }
  }

  private emitSlaveTransitionMetrics(): void {
    // Merge counts from ManualVideoService
    const m = {
      staleLoopStateCount: this.transitionMetrics.staleLoopStateCount,
      preloadRevealCount: this.transitionMetrics.preloadRevealCount + this.manualVideoService.preloadRevealCount,
      preloadCleanupCount: this.transitionMetrics.preloadCleanupCount + this.manualVideoService.preloadCleanupCount,
    };
    if (!this._isSlaveMode) return;
    if (m.staleLoopStateCount === 0 && m.preloadRevealCount === 0 && m.preloadCleanupCount === 0) return;

    this.socketService.emit('transition-metrics', m);

    this.transitionMetrics.staleLoopStateCount = 0;
    this.transitionMetrics.preloadRevealCount = 0;
    this.transitionMetrics.preloadCleanupCount = 0;
    this.manualVideoService.preloadRevealCount = 0;
    this.manualVideoService.preloadCleanupCount = 0;
  }
}
