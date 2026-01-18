import { Injectable, NgZone } from '@angular/core';
import { AnalyticsService } from './analytics.service';

/**
 * Codes d'erreur HTML5 Media
 */
export enum MediaErrorCode {
  MEDIA_ERR_ABORTED = 1,
  MEDIA_ERR_NETWORK = 2,
  MEDIA_ERR_DECODE = 3,
  MEDIA_ERR_SRC_NOT_SUPPORTED = 4,
  MEDIA_ERR_ENCRYPTED = 5
}

/**
 * Callbacks pour la récupération d'erreur
 */
export interface ErrorRecoveryCallbacks {
  onSkipToNext: (delay: number) => void;
  onFullReset: () => void;
  onManualErrorRecovery: () => void;
}

/**
 * Service gérant la récupération automatique des erreurs vidéo
 * Extrait de tv.component.ts pour réduire la complexité
 *
 * Gère:
 * - Erreurs de lecture (DECODE, NETWORK, etc.)
 * - Vidéos bloquées (stalled)
 * - Watchdog de santé
 * - Nettoyage mémoire préventif
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
  private consecutiveErrors = 0;
  private videoPlayCount = 0;
  private lastPlaybackTime = 0;
  private lastPlaybackCheck = 0;

  // Intervals
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private memoryCleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private callbacks: ErrorRecoveryCallbacks | null = null;

  // Références aux players (pour le watchdog et cleanup)
  private players: {
    loopA: HTMLVideoElement | null;
    loopB: HTMLVideoElement | null;
    manualA: HTMLVideoElement | null;
    manualB: HTMLVideoElement | null;
  } = {
    loopA: null,
    loopB: null,
    manualA: null,
    manualB: null
  };

  // État de la lecture
  private isLoopMode = false;
  private isManualMode = false;
  private activeLoopPlayer: 'A' | 'B' = 'A';
  private pendingSwitch = false;

  // Canvas pour cleanup
  private freezeCanvas: HTMLCanvasElement | null = null;
  private freezeCtx: CanvasRenderingContext2D | null = null;

  constructor(
    private analyticsService: AnalyticsService,
    private ngZone: NgZone
  ) {}

  /**
   * Initialise le service avec les références aux players
   */
  init(
    players: {
      loopA: HTMLVideoElement;
      loopB: HTMLVideoElement;
      manualA: HTMLVideoElement;
      manualB: HTMLVideoElement;
    },
    freezeCanvas: HTMLCanvasElement | null,
    callbacks: ErrorRecoveryCallbacks
  ): void {
    this.players = players;
    this.freezeCanvas = freezeCanvas;
    this.freezeCtx = freezeCanvas?.getContext('2d') || null;
    this.callbacks = callbacks;

    // Attacher les error handlers
    this.attachErrorHandlers();

    // Démarrer le watchdog
    this.startWatchdog();

    console.log('[VideoErrorRecovery] Service initialized');
  }

  /**
   * Met à jour l'état de lecture (appelé par TvComponent)
   */
  updateState(state: {
    isLoopMode: boolean;
    isManualMode: boolean;
    activeLoopPlayer: 'A' | 'B';
    pendingSwitch: boolean;
  }): void {
    this.isLoopMode = state.isLoopMode;
    this.isManualMode = state.isManualMode;
    this.activeLoopPlayer = state.activeLoopPlayer;
    this.pendingSwitch = state.pendingSwitch;
  }

  /**
   * Attache les handlers d'erreur à tous les players
   */
  private attachErrorHandlers(): void {
    const { loopA, loopB, manualA, manualB } = this.players;

    // Error handlers
    loopA?.addEventListener('error', (e) => this.handleVideoError(loopA, 'loop-A', e));
    loopB?.addEventListener('error', (e) => this.handleVideoError(loopB, 'loop-B', e));
    manualA?.addEventListener('error', (e) => this.handleVideoError(manualA, 'manual-A', e));
    manualB?.addEventListener('error', (e) => this.handleVideoError(manualB, 'manual-B', e));

    // Stall handlers (vidéo bloquée en buffering)
    loopA?.addEventListener('stalled', () => this.handleVideoStall(loopA, 'loop-A'));
    loopB?.addEventListener('stalled', () => this.handleVideoStall(loopB, 'loop-B'));

    console.log('[VideoErrorRecovery] Error handlers attached');
  }

  /**
   * Gère les erreurs de lecture vidéo
   */
  private handleVideoError(player: HTMLVideoElement, which: string, event: Event): void {
    const error = player.error;
    const errorCode = error?.code || 0;
    const errorMessage = error?.message || 'Unknown error';
    const currentSrc = player.src || 'no source';

    console.error(`[VideoErrorRecovery] ⚠️ Player ${which} error:`, {
      code: errorCode,
      message: errorMessage,
      src: currentSrc,
      readyState: player.readyState,
      networkState: player.networkState
    });

    // Tracker l'erreur dans les analytics
    this.analyticsService.trackVideoError(
      { name: currentSrc.split('/').pop() || 'unknown', path: currentSrc, type: 'video/mp4' },
      event
    );

    this.consecutiveErrors++;

    // Si trop d'erreurs consécutives, tenter un reset complet
    if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      console.error(`[VideoErrorRecovery] 🚨 ${this.consecutiveErrors} erreurs consécutives - reset complet`);
      this.callbacks?.onFullReset();
      this.consecutiveErrors = 0;
      return;
    }

    // Récupération selon le type de player
    if (which.startsWith('loop-')) {
      this.recoverFromLoopError(player);
    } else if (which.startsWith('manual-')) {
      this.recoverFromManualError(player);
    }
  }

  /**
   * Récupération d'une erreur sur un player de boucle
   */
  private recoverFromLoopError(player: HTMLVideoElement): void {
    console.log('[VideoErrorRecovery] Recovering from loop error');

    // Nettoyer le player en erreur
    player.pause();
    player.removeAttribute('src');
    player.load(); // Force le reset du decoder

    // Passer à la vidéo suivante après un délai
    this.callbacks?.onSkipToNext(1000);
  }

  /**
   * Récupération d'une erreur sur un player manuel
   */
  private recoverFromManualError(player: HTMLVideoElement): void {
    console.log('[VideoErrorRecovery] Recovering from manual player error');

    // Nettoyer le player manuel
    player.pause();
    player.style.opacity = '0';
    player.removeAttribute('src');
    player.load();

    // Retourner à la boucle
    this.callbacks?.onManualErrorRecovery();
  }

  /**
   * Gère les événements 'stalled' (vidéo bloquée en buffering)
   */
  private handleVideoStall(player: HTMLVideoElement, which: string): void {
    console.warn(`[VideoErrorRecovery] ⏳ Player ${which} stalled (buffering issue)`, {
      src: player.src,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState
    });
    // Le watchdog interviendra si la vidéo reste bloquée
  }

  /**
   * Démarre le watchdog qui vérifie toutes les 10 secondes
   */
  private startWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }

    this.lastPlaybackTime = 0;
    this.lastPlaybackCheck = Date.now();

    this.watchdogInterval = setInterval(() => {
      this.ngZone.run(() => this.checkPlaybackHealth());
    }, this.WATCHDOG_INTERVAL);

    // Démarrer aussi le cleanup mémoire périodique
    this.startMemoryCleanupInterval();

    console.log('[VideoErrorRecovery] 🐕 Watchdog started');
  }

  /**
   * Arrête le watchdog
   */
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

  /**
   * Vérifie la santé de la lecture vidéo
   */
  private checkPlaybackHealth(): void {
    // Ne pas vérifier si on est en mode manuel
    if (this.isManualMode) return;

    // Ne pas vérifier si la boucle n'est pas active
    if (!this.isLoopMode) return;

    const player = this.getActiveLoopPlayer();
    if (!player) return;

    const now = Date.now();
    const currentTime = player.currentTime || 0;
    const hasProgressed = currentTime !== this.lastPlaybackTime;

    // Si la vidéo est en pause ET on est en mode boucle, c'est un problème
    if (player.paused && this.isLoopMode && !this.pendingSwitch) {
      console.warn('[VideoErrorRecovery] 🐕 Watchdog: video paused unexpectedly');
      this.attemptWatchdogRecovery(player, 'paused');
      return;
    }

    // Si la vidéo n'a pas progressé depuis 10s
    if (!hasProgressed && !player.paused && !player.ended) {
      console.warn('[VideoErrorRecovery] 🐕 Watchdog: video not progressing');
      this.attemptWatchdogRecovery(player, 'stalled');
      return;
    }

    // Tout va bien - reset le compteur d'erreurs
    if (hasProgressed) {
      this.consecutiveErrors = 0;
    }

    this.lastPlaybackTime = currentTime;
    this.lastPlaybackCheck = now;
  }

  /**
   * Tente une récupération via le watchdog
   */
  private attemptWatchdogRecovery(player: HTMLVideoElement, reason: 'paused' | 'stalled'): void {
    console.log(`[VideoErrorRecovery] 🐕 Watchdog recovery attempt (reason: ${reason})`);

    if (reason === 'paused') {
      player.play().then(() => {
        console.log('[VideoErrorRecovery] 🐕 Successfully resumed playback');
        this.consecutiveErrors = 0;
      }).catch(() => {
        console.error('[VideoErrorRecovery] 🐕 Failed to resume, skipping');
        this.callbacks?.onSkipToNext(500);
      });
      return;
    }

    if (reason === 'stalled') {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        this.callbacks?.onFullReset();
        this.consecutiveErrors = 0;
      } else {
        this.callbacks?.onSkipToNext(1000);
      }
    }
  }

  /**
   * Retourne le player de boucle actif
   */
  private getActiveLoopPlayer(): HTMLVideoElement | null {
    return this.activeLoopPlayer === 'A' ? this.players.loopA : this.players.loopB;
  }

  /**
   * Démarre l'intervalle de nettoyage mémoire préventif
   */
  private startMemoryCleanupInterval(): void {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }

    this.memoryCleanupInterval = setInterval(() => {
      this.ngZone.run(() => this.performPreventiveMemoryCleanup());
    }, this.MEMORY_CLEANUP_INTERVAL);

    console.log('[VideoErrorRecovery] 🧹 Memory cleanup interval started');
  }

  /**
   * Nettoyage préventif de la mémoire
   */
  performPreventiveMemoryCleanup(): void {
    console.log('[VideoErrorRecovery] 🧹 Performing preventive memory cleanup', {
      videoPlayCount: this.videoPlayCount
    });

    // Nettoyer le canvas freeze-frame
    if (this.freezeCtx && this.freezeCanvas) {
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
    }

    // Nettoyer le player de boucle inactif
    const inactivePlayer = this.activeLoopPlayer === 'A' ? this.players.loopB : this.players.loopA;
    if (inactivePlayer?.src) {
      inactivePlayer.removeAttribute('src');
      inactivePlayer.load();
      console.log('[VideoErrorRecovery] 🧹 Cleaned inactive loop player');
    }

    // Nettoyer les players manuels s'ils ne sont pas utilisés
    if (!this.isManualMode) {
      [this.players.manualA, this.players.manualB].forEach((player) => {
        if (player?.src) {
          player.removeAttribute('src');
          player.load();
        }
      });
    }

    // Forcer le garbage collection si disponible
    if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
      (window as unknown as { gc: () => void }).gc();
    }

    this.videoPlayCount = 0;
  }

  /**
   * Incrémente le compteur de vidéos et déclenche un cleanup si nécessaire
   */
  incrementVideoPlayCount(): void {
    this.videoPlayCount++;

    if (this.videoPlayCount >= this.VIDEO_COUNT_BEFORE_CLEANUP) {
      console.log(`[VideoErrorRecovery] 🧹 Reached ${this.VIDEO_COUNT_BEFORE_CLEANUP} videos, triggering cleanup`);
      this.performPreventiveMemoryCleanup();
    }
  }

  /**
   * Reset le compteur d'erreurs consécutives
   */
  resetConsecutiveErrors(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Nettoie les ressources du service
   */
  destroy(): void {
    this.stopWatchdog();
    this.players = { loopA: null, loopB: null, manualA: null, manualB: null };
    this.callbacks = null;
    this.freezeCanvas = null;
    this.freezeCtx = null;
  }
}
