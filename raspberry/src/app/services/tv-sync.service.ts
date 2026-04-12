import { Injectable, NgZone } from '@angular/core';
import { SocketService, LoopState } from './socket.service';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { ManualVideoService } from './manual-video.service';
import { Video } from '../interfaces/video.interface';

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
  }

  /**
   * Called by TvComponent when a manual action command is received (to set the guard timestamp).
   */
  markActionReceived(): void {
    this._lastActionReceivedAt = Date.now();
  }

  /**
   * Emit loop state to slaves (master only).
   */
  emitLoopState(videoIndex: number, videoPath: string, isManualMode: boolean, manualVideoPath?: string): void {
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
        this._tvRole = data.role;
        this._isSlaveMode = data.role === 'slave';
        console.log(`[TV] Role assigned: ${data.role}, displayType: ${displayType}`);

        if (wasMaster && this._isSlaveMode && displayType === 'tv') {
          this.callbacks?.onDemotion();
        }

        this.callbacks?.onRoleAssigned(data.role);

        if (this._isSlaveMode) {
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
  }

  private handleMasterLoopState(state: LoopState): void {
    console.log('[TV] Slave received master state:', {
      videoPath: state.videoPath,
      videoIndex: state.videoIndex,
      isManualMode: state.isManualMode,
      manualVideoPath: state.manualVideoPath
    });

    // CAS 1: Le master joue une video manuelle
    if (state.isManualMode && state.manualVideoPath) {
      const resolvedVideo = this.callbacks!.resolveDisplayVariant({
        name: state.manualVideoPath.split('/').pop() || 'manual',
        path: state.manualVideoPath,
        type: 'video/mp4'
      } as Video);

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
