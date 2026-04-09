import { Injectable, NgZone } from '@angular/core';
import { AnalyticsService } from './analytics.service';

/**
 * Callbacks pour la récupération d'erreur — le composant TV fournit ces callbacks
 * pour gérer les actions de récupération sans que le service ne connaisse
 * la boucle, les phases, ou le socket.
 */
export interface ErrorRecoveryCallbacks {
  onSkipToNext: (delay: number) => void;
  onFullReset: () => void;
  onManualErrorRecovery: () => void;
  getActivePlayer: () => HTMLVideoElement;
  getIsManualMode: () => boolean;
  getIsLoopMode: () => boolean;
  getIsPendingSwitch: () => boolean;
  getIsSlaveMode: () => boolean;
}

/**
 * Service gérant la récupération automatique des erreurs vidéo.
 * Extrait de tv.component.ts — gère le watchdog, les error handlers,
 * et le nettoyage mémoire préventif.
 *
 * Gère:
 * - Erreurs de lecture (DECODE, NETWORK, etc.)
 * - Vidéos bloquées (stalled)
 * - Watchdog de santé (10s interval)
 * - Nettoyage mémoire préventif (30 min + après 50 vidéos)
 */
@Injectable({
  providedIn: 'root'
})
export class VideoErrorRecoveryService {
  // Configuration
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly MEMORY_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly VIDEO_COUNT_BEFORE_CLEANUP = 50;
  private readonly WATCHDOG_INTERVAL = 10000; // 10 secondes

  // État
  private _consecutiveErrors = 0;
  private _videoPlayCount = 0;
  private lastPlaybackTime = 0;
  private lastPlaybackCheck = 0;

  // Intervals
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private memoryCleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private callbacks: ErrorRecoveryCallbacks | null = null;

  // Callback pour le cleanup mémoire (fourni par le composant via le double-buffer service)
  private onMemoryCleanup: (() => void) | null = null;

  constructor(
    private analyticsService: AnalyticsService,
    private ngZone: NgZone
  ) {}

  get consecutiveErrors(): number {
    return this._consecutiveErrors;
  }

  get videoPlayCount(): number {
    return this._videoPlayCount;
  }

  /**
   * Initialise le service avec les callbacks de récupération
   */
  init(
    callbacks: ErrorRecoveryCallbacks,
    onMemoryCleanup: () => void
  ): void {
    this.callbacks = callbacks;
    this.onMemoryCleanup = onMemoryCleanup;
    console.log('[VideoErrorRecovery] Service initialized');
  }

  /**
   * Attache les error handlers et stall handlers à tous les players.
   * Appelé par le composant après initDoubleBuffer.
   */
  attachErrorHandlers(
    players: {
      loopA: HTMLVideoElement;
      loopB: HTMLVideoElement;
      manualA: HTMLVideoElement;
      manualB: HTMLVideoElement;
    }
  ): void {
    const { loopA, loopB, manualA, manualB } = players;

    // Error handlers
    loopA.addEventListener('error', (e) => this.handleVideoError(loopA, 'loop-A', e));
    loopB.addEventListener('error', (e) => this.handleVideoError(loopB, 'loop-B', e));
    manualA.addEventListener('error', (e) => this.handleVideoError(manualA, 'manual-A', e));
    manualB.addEventListener('error', (e) => this.handleVideoError(manualB, 'manual-B', e));

    // Stall handlers (vidéo bloquée en buffering)
    loopA.addEventListener('stalled', () => this.handleVideoStall(loopA, 'loop-A'));
    loopB.addEventListener('stalled', () => this.handleVideoStall(loopB, 'loop-B'));

    console.log('[VideoErrorRecovery] Error handlers attached');
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Gère les erreurs de lecture vidéo.
   * Returns the error count increment for transition metrics.
   */
  handleVideoError(player: HTMLVideoElement, which: string, event: Event): number {
    const error = player.error;
    const errorCode = error?.code || 0;
    const errorMessage = error?.message || 'Unknown error';
    const currentSrc = player.src || 'no source';

    // Ignorer les erreurs "empty src" sur les players manuels
    if (which.startsWith('manual-') && errorCode === 4 && !player.getAttribute('src')) {
      return 0;
    }

    console.error(`[VideoErrorRecovery] ⚠️ Player ${which} error:`, {
      code: errorCode,
      message: errorMessage,
      src: currentSrc,
      readyState: player.readyState,
      networkState: player.networkState
    });

    // Tracker l'erreur dans les analytics (désactivé pour les slaves)
    if (!this.callbacks?.getIsSlaveMode()) {
      this.analyticsService.trackVideoError(
        { name: currentSrc.split('/').pop() || 'unknown', path: currentSrc, type: 'video/mp4' },
        event
      );
    }

    this._consecutiveErrors++;

    // Si trop d'erreurs consécutives, reset complet
    if (this._consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      console.error(`[VideoErrorRecovery] 🚨 ${this._consecutiveErrors} erreurs consécutives - reset complet`);
      this.callbacks?.onFullReset();
      return 1;
    }

    // Récupération selon le type de player
    if (which.startsWith('loop-')) {
      this.recoverFromLoopError(player, which);
    } else if (which.startsWith('manual-')) {
      this.recoverFromManualError(player, which);
    }

    return 1;
  }

  private recoverFromLoopError(player: HTMLVideoElement, which: string): void {
    console.log(`[VideoErrorRecovery] Recovering from loop error on ${which}`);

    player.pause();
    player.removeAttribute('src');
    player.load();

    // Passer à la vidéo suivante
    const delay = 1000;
    this.callbacks?.onSkipToNext(delay);
  }

  private recoverFromManualError(player: HTMLVideoElement, _which: string): void {
    console.log('[VideoErrorRecovery] Recovering from manual player error');

    player.pause();
    player.style.opacity = '0';
    player.removeAttribute('src');
    player.load();

    this.callbacks?.onManualErrorRecovery();
  }

  private handleVideoStall(player: HTMLVideoElement, which: string): void {
    console.warn(`[VideoErrorRecovery] ⏳ Player ${which} stalled`, {
      src: player.src,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState
    });
    // Le watchdog interviendra si la vidéo reste bloquée
  }

  // ==========================================================================
  // WATCHDOG
  // ==========================================================================

  startWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }

    this.lastPlaybackTime = 0;
    this.lastPlaybackCheck = Date.now();

    this.watchdogInterval = setInterval(() => {
      this.checkPlaybackHealth();
    }, this.WATCHDOG_INTERVAL);

    this.startMemoryCleanupInterval();
    console.log('[VideoErrorRecovery] 🐕 Watchdog started');
  }

  stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = null;
    }
    console.log('[VideoErrorRecovery] 🐕 Watchdog stopped');
  }

  private checkPlaybackHealth(): void {
    if (this.callbacks?.getIsManualMode()) return;
    if (!this.callbacks?.getIsLoopMode()) return;

    const player = this.callbacks?.getActivePlayer();
    if (!player) return;

    const currentTime = player.currentTime || 0;
    const hasProgressed = currentTime !== this.lastPlaybackTime;

    if (player.paused && !this.callbacks?.getIsPendingSwitch()) {
      console.warn('[VideoErrorRecovery] 🐕 Watchdog: video paused unexpectedly');
      this.attemptWatchdogRecovery(player, 'paused');
      return;
    }

    if (!hasProgressed && !player.paused && !player.ended) {
      console.warn('[VideoErrorRecovery] 🐕 Watchdog: video not progressing', {
        currentTime,
        lastTime: this.lastPlaybackTime,
        readyState: player.readyState,
        networkState: player.networkState
      });
      this.attemptWatchdogRecovery(player, 'stalled');
      return;
    }

    if (hasProgressed) {
      this._consecutiveErrors = 0;
    }

    this.lastPlaybackTime = currentTime;
    this.lastPlaybackCheck = Date.now();
  }

  private attemptWatchdogRecovery(player: HTMLVideoElement, reason: 'paused' | 'stalled'): void {
    console.log(`[VideoErrorRecovery] 🐕 Watchdog recovery (reason: ${reason})`);

    if (reason === 'paused') {
      player.play().then(() => {
        console.log('[VideoErrorRecovery] 🐕 Successfully resumed playback');
        this._consecutiveErrors = 0;
      }).catch(err => {
        console.error('[VideoErrorRecovery] 🐕 Failed to resume, skipping', err);
        this.callbacks?.onSkipToNext(500);
      });
      return;
    }

    if (reason === 'stalled') {
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        this.callbacks?.onFullReset();
        this._consecutiveErrors = 0;
      } else {
        this.callbacks?.onSkipToNext(1000);
      }
    }
  }

  // ==========================================================================
  // MEMORY CLEANUP
  // ==========================================================================

  private startMemoryCleanupInterval(): void {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }

    this.memoryCleanupInterval = setInterval(() => {
      this.onMemoryCleanup?.();
    }, this.MEMORY_CLEANUP_INTERVAL);

    console.log('[VideoErrorRecovery] 🧹 Memory cleanup interval started (every 30 min)');
  }

  /**
   * Incrémente le compteur de vidéos et déclenche un cleanup si nécessaire.
   * Le cleanup est différé pour ne pas s'exécuter pendant une transition.
   */
  incrementVideoPlayCount(): void {
    this._videoPlayCount++;

    if (this._videoPlayCount >= this.VIDEO_COUNT_BEFORE_CLEANUP) {
      console.log(`[VideoErrorRecovery] 🧹 Reached ${this.VIDEO_COUNT_BEFORE_CLEANUP} videos, scheduling cleanup`);
      setTimeout(() => {
        if (!this.callbacks?.getIsPendingSwitch()) {
          this.onMemoryCleanup?.();
          this._videoPlayCount = 0;
        } else {
          console.log('[VideoErrorRecovery] 🧹 Cleanup deferred (switch in progress)');
        }
      }, 1000);
    }
  }

  resetVideoPlayCount(): void {
    this._videoPlayCount = 0;
  }

  resetConsecutiveErrors(): void {
    this._consecutiveErrors = 0;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.stopWatchdog();
    this.callbacks = null;
    this.onMemoryCleanup = null;
  }
}
