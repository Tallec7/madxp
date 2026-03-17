import { Injectable, NgZone } from '@angular/core';
import { Sponsor } from '../interfaces/sponsor.interface';

/**
 * Callbacks pour le double buffer
 */
export interface DoubleBufferCallbacks {
  onVideoStarted: (video: Sponsor, playerName: 'A' | 'B') => void;
  onVideoEnded: (completed: boolean) => void;
  onSwitchComplete: (newIndex: number, playerName: 'A' | 'B') => void;
  onError: (player: HTMLVideoElement, which: string, error: Event) => void;
}

/**
 * Service gérant le système de double-buffer vidéo pour des transitions sans flash
 * Extrait de tv.component.ts pour réduire la complexité
 *
 * Architecture:
 * - 2 players pour la boucle (alternent: un joue, l'autre précharge)
 * - 2 players pour les vidéos manuelles (au-dessus de la boucle)
 * - Canvas freeze-frame pour masquer les transitions
 * - Black overlay pour bloquer physiquement la boucle
 */
@Injectable({
  providedIn: 'root'
})
export class DoubleBufferVideoService {
  // Players de boucle (z-index 1-2)
  private playerA: HTMLVideoElement | null = null;
  private playerB: HTMLVideoElement | null = null;
  private activePlayer: 'A' | 'B' = 'A';

  // Players manuels (z-index 10-11)
  private manualPlayerA: HTMLVideoElement | null = null;
  private manualPlayerB: HTMLVideoElement | null = null;
  private activeManualPlayer: 'A' | 'B' = 'A';

  // Canvas freeze-frame (z-index 20)
  private freezeCanvas: HTMLCanvasElement | null = null;
  private freezeCtx: CanvasRenderingContext2D | null = null;

  // Black overlay (z-index 5)
  private blackOverlay: HTMLDivElement | null = null;

  // État
  private isLoopMode = false;
  private isManualMode = false;
  private currentLoopIndex = 0;
  private currentLoopVideos: Sponsor[] = [];
  private isStartingLoop = false;
  private pendingSwitch = false;
  private switchTriggered = false;
  private preloadReady = false;
  private preloadedIndex: number | null = null;

  // Callbacks
  private callbacks: DoubleBufferCallbacks | null = null;

  constructor(private ngZone: NgZone) {}

  /**
   * Initialise le service avec les références aux éléments DOM
   */
  init(
    elements: {
      playerA: HTMLVideoElement;
      playerB: HTMLVideoElement;
      manualPlayerA: HTMLVideoElement;
      manualPlayerB: HTMLVideoElement;
      freezeCanvas: HTMLCanvasElement;
      blackOverlay: HTMLDivElement;
    },
    callbacks: DoubleBufferCallbacks
  ): void {
    this.playerA = elements.playerA;
    this.playerB = elements.playerB;
    this.manualPlayerA = elements.manualPlayerA;
    this.manualPlayerB = elements.manualPlayerB;
    this.freezeCanvas = elements.freezeCanvas;
    this.blackOverlay = elements.blackOverlay;
    this.callbacks = callbacks;

    // Initialiser le canvas
    if (this.freezeCanvas) {
      this.freezeCtx = this.freezeCanvas.getContext('2d');
      this.freezeCanvas.width = 1280;
      this.freezeCanvas.height = 720;
    }

    // Configurer les players de boucle
    [this.playerA, this.playerB].forEach((player, i) => {
      if (!player) return;
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      console.log(`[DoubleBuffer] Loop player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Configurer les players manuels
    [this.manualPlayerA, this.manualPlayerB].forEach((player, i) => {
      if (!player) return;
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      this.setManualPlayerVisible(player, false);
      console.log(`[DoubleBuffer] Manual player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Player A de boucle est visible au départ
    this.setPlayerVisible(this.playerA!, true);
    this.setPlayerVisible(this.playerB!, false);
    this.activePlayer = 'A';

    // Ended listeners pour la boucle
    this.playerA?.addEventListener('ended', () => this.onVideoEnded('A'));
    this.playerB?.addEventListener('ended', () => this.onVideoEnded('B'));

    console.log('[DoubleBuffer] Service initialized');
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get isInLoopMode(): boolean {
    return this.isLoopMode;
  }

  get isInManualMode(): boolean {
    return this.isManualMode;
  }

  get currentIndex(): number {
    return this.currentLoopIndex;
  }

  get isPendingSwitch(): boolean {
    return this.pendingSwitch;
  }

  get activeLoopPlayer(): 'A' | 'B' {
    return this.activePlayer;
  }

  getActivePlayer(): HTMLVideoElement | null {
    return this.activePlayer === 'A' ? this.playerA : this.playerB;
  }

  getInactivePlayer(): HTMLVideoElement | null {
    return this.activePlayer === 'A' ? this.playerB : this.playerA;
  }

  getActiveManualPlayer(): HTMLVideoElement | null {
    return this.activeManualPlayer === 'A' ? this.manualPlayerA : this.manualPlayerB;
  }

  // ==========================================================================
  // BOUCLE VIDÉO
  // ==========================================================================

  /**
   * Démarre la boucle vidéo avec les vidéos fournies
   */
  startLoop(videos: Sponsor[]): void {
    if (this.isStartingLoop) {
      console.log('[DoubleBuffer] startLoop already in progress, skipping');
      return;
    }
    this.isStartingLoop = true;

    // Arrêter les players existants
    this.playerA?.pause();
    this.playerB?.pause();

    this.isLoopMode = true;
    this.currentLoopIndex = 0;
    this.currentLoopVideos = videos;
    this.pendingSwitch = false;
    this.switchTriggered = false;

    if (videos.length === 0) {
      console.warn('[DoubleBuffer] No videos in loop');
      this.isLoopMode = false;
      this.isStartingLoop = false;
      return;
    }

    console.log('[DoubleBuffer] Starting loop with', videos.length, 'videos');

    // Jouer la première vidéo sur le player actif
    this.playOnActivePlayer(0);

    setTimeout(() => {
      this.isStartingLoop = false;
    }, 500);
  }

  /**
   * Arrête la boucle
   */
  stopLoop(): void {
    this.isLoopMode = false;
    this.playerA?.pause();
    this.playerB?.pause();
    console.log('[DoubleBuffer] Loop stopped');
  }

  /**
   * Joue une vidéo sur le player actif
   */
  private playOnActivePlayer(index: number): void {
    const videos = this.currentLoopVideos;
    if (videos.length === 0) return;

    const videoIndex = index % videos.length;
    const video = videos[videoIndex];
    const player = this.getActivePlayer();
    if (!player) return;

    console.log(`[DoubleBuffer] Playing video ${videoIndex} on player ${this.activePlayer}:`, video.path);

    player.src = video.path;
    player.load();

    player.play().then(() => {
      this.ngZone.run(() => {
        this.currentLoopIndex = videoIndex;
        this.callbacks?.onVideoStarted(video, this.activePlayer);

        // Cacher le freeze-frame après un court délai
        setTimeout(() => {
          this.hideFreezeFrame();
          this.hideBlackOverlay();
        }, 150);
      });
    }).catch(err => {
      console.error('[DoubleBuffer] Error playing video:', err);
      this.hideFreezeFrame();
      this.hideBlackOverlay();
      // Skip to next
      setTimeout(() => {
        const nextIndex = (videoIndex + 1) % this.currentLoopVideos.length;
        if (nextIndex !== videoIndex) {
          this.playOnActivePlayer(nextIndex);
        }
      }, 1000);
    });
  }

  /**
   * Précharge une vidéo sur le player inactif
   */
  preloadOnInactivePlayer(index: number): void {
    const videos = this.currentLoopVideos;
    if (videos.length === 0) return;

    const videoIndex = index % videos.length;
    const video = videos[videoIndex];
    const player = this.getInactivePlayer();
    if (!player) return;

    if (this.preloadedIndex === videoIndex && this.preloadReady) {
      return;
    }

    console.log(`[DoubleBuffer] Preloading video ${videoIndex}:`, video.path);

    this.preloadReady = false;
    this.preloadedIndex = videoIndex;

    player.src = video.path;
    player.load();

    const onCanPlay = () => {
      if (this.preloadedIndex === videoIndex) {
        this.preloadReady = true;
        console.log(`[DoubleBuffer] Video ${videoIndex} preloaded`);
      }
      player.removeEventListener('canplaythrough', onCanPlay);
    };
    player.addEventListener('canplaythrough', onCanPlay);
  }

  /**
   * Appelé quand une vidéo se termine
   */
  private onVideoEnded(fromPlayer: 'A' | 'B'): void {
    console.log(`[DoubleBuffer] Video ended on player ${fromPlayer}`);

    if (!this.isLoopMode || fromPlayer !== this.activePlayer) return;
    if (this.pendingSwitch) return;

    this.triggerSwitch();
  }

  /**
   * Déclenche le switch vers la vidéo suivante
   */
  triggerSwitch(): void {
    if (this.pendingSwitch) return;
    this.pendingSwitch = true;

    this.ngZone.run(() => {
      this.callbacks?.onVideoEnded(true);

      const nextIndex = (this.currentLoopIndex + 1) % this.currentLoopVideos.length;
      console.log(`[DoubleBuffer] Switching to video ${nextIndex}`);

      this.switchPlayers(nextIndex);
    });
  }

  /**
   * Switch entre les deux players
   */
  private switchPlayers(nextVideoIndex: number): void {
    const oldPlayer = this.getActivePlayer();
    const newPlayer = this.getInactivePlayer();
    if (!oldPlayer || !newPlayer) return;

    const doSwitch = () => {
      newPlayer.play().then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.setPlayerVisible(newPlayer, true);
            this.setPlayerVisible(oldPlayer, false);

            this.activePlayer = this.activePlayer === 'A' ? 'B' : 'A';
            this.currentLoopIndex = nextVideoIndex;
            this.preloadReady = false;
            this.preloadedIndex = null;

            const video = this.currentLoopVideos[nextVideoIndex];
            this.callbacks?.onSwitchComplete(nextVideoIndex, this.activePlayer);
            this.callbacks?.onVideoStarted(video, this.activePlayer);

            this.pendingSwitch = false;
            this.switchTriggered = false;
          });
        });
      }).catch(err => {
        console.error('[DoubleBuffer] Error switching:', err);
        this.pendingSwitch = false;
        this.switchTriggered = false;
        this.preloadReady = false;
        this.preloadedIndex = null;
        setTimeout(() => this.playOnActivePlayer(nextVideoIndex), 500);
      });
    };

    // Si pas préchargé, attendre
    if (!this.preloadReady || this.preloadedIndex !== nextVideoIndex) {
      if (this.preloadedIndex !== nextVideoIndex) {
        this.preloadOnInactivePlayer(nextVideoIndex);
      }

      let switchExecuted = false;
      const executeSwitchOnce = () => {
        if (switchExecuted) return;
        switchExecuted = true;
        doSwitch();
      };

      const checkInterval = setInterval(() => {
        if (switchExecuted) {
          clearInterval(checkInterval);
          return;
        }
        if (newPlayer.readyState >= 3) {
          clearInterval(checkInterval);
          this.preloadReady = true;
          executeSwitchOnce();
        }
      }, 30);

      const onCanPlay = () => {
        newPlayer.removeEventListener('canplay', onCanPlay);
        clearInterval(checkInterval);
        this.preloadReady = true;
        executeSwitchOnce();
      };
      newPlayer.addEventListener('canplay', onCanPlay);

      // Timeout de sécurité (5s pour supporter l'accès distant via réseau WiFi)
      setTimeout(() => {
        clearInterval(checkInterval);
        newPlayer.removeEventListener('canplay', onCanPlay);
        if (!switchExecuted) {
          console.warn('[DoubleBuffer] Preload timeout, forcing switch');
          executeSwitchOnce();
        }
      }, 5000);
    } else {
      doSwitch();
    }
  }

  // ==========================================================================
  // VISIBILITÉ DES PLAYERS
  // ==========================================================================

  private setPlayerVisible(player: HTMLVideoElement, visible: boolean): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = visible ? '1' : '0';
  }

  private setManualPlayerVisible(player: HTMLVideoElement, visible: boolean): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = visible ? '11' : '10';
  }

  // ==========================================================================
  // FREEZE FRAME
  // ==========================================================================

  /**
   * Capture le frame actuel et l'affiche sur le canvas
   */
  captureAndShowFreezeFrame(): boolean {
    if (!this.freezeCanvas || !this.freezeCtx) {
      console.warn('[DoubleBuffer] Freeze canvas not available');
      return false;
    }

    let sourceVideo: HTMLVideoElement | null = null;
    if (this.isManualMode) {
      sourceVideo = this.getActiveManualPlayer();
    } else {
      sourceVideo = this.getActivePlayer();
    }

    if (!sourceVideo || sourceVideo.videoWidth === 0 || sourceVideo.videoHeight === 0) {
      console.warn('[DoubleBuffer] No valid video source for freeze frame');
      return false;
    }

    try {
      this.freezeCtx.drawImage(sourceVideo, 0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      this.freezeCanvas.style.display = 'block';
      this.freezeCanvas.style.opacity = '1';
      this.freezeCanvas.style.zIndex = '20';
      console.log('[DoubleBuffer] Freeze frame captured');
      return true;
    } catch (err) {
      console.error('[DoubleBuffer] Error capturing freeze frame:', err);
      return false;
    }
  }

  /**
   * Cache le freeze frame et libère la mémoire
   */
  hideFreezeFrame(): void {
    if (this.freezeCanvas && this.freezeCtx) {
      this.freezeCanvas.style.opacity = '0';
      this.freezeCanvas.style.display = 'none';
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      console.log('[DoubleBuffer] Freeze frame hidden');
    }
  }

  // ==========================================================================
  // BLACK OVERLAY
  // ==========================================================================

  showBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '1';
    }
  }

  hideBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '0';
    }
  }

  // ==========================================================================
  // VIDÉOS MANUELLES
  // ==========================================================================

  /**
   * Joue une vidéo manuelle (au-dessus de la boucle)
   */
  playManualVideo(
    videoPath: string,
    onStarted: () => void,
    onEnded: () => void,
    onError: () => void
  ): void {
    console.log('[DoubleBuffer] Playing manual video:', videoPath);

    const targetPlayer = this.manualPlayerA!;

    // Capturer le freeze frame
    this.captureAndShowFreezeFrame();
    this.showBlackOverlay();

    // Rendre le player manuel visible
    targetPlayer.style.opacity = '1';
    targetPlayer.style.zIndex = '10';

    targetPlayer.src = videoPath;
    targetPlayer.load();

    let switchDone = false;

    const doSwitch = () => {
      if (switchDone) return;
      switchDone = true;

      targetPlayer.play().then(() => {
        setTimeout(() => {
          this.hideFreezeFrame();
          this.isManualMode = true;
          this.activeManualPlayer = 'A';
          onStarted();
        }, 200);
      }).catch(err => {
        console.error('[DoubleBuffer] Error playing manual video', err);
        this.hideFreezeFrame();
        this.hideBlackOverlay();
        onError();
      });
    };

    const onReady = () => {
      targetPlayer.removeEventListener('canplaythrough', onReady);
      targetPlayer.removeEventListener('canplay', onReadyFallback);
      clearTimeout(fallbackTimeout);
      doSwitch();
    };

    const onReadyFallback = () => {
      setTimeout(() => {
        if (!switchDone) {
          targetPlayer.removeEventListener('canplaythrough', onReady);
          doSwitch();
        }
      }, 500);
    };

    targetPlayer.addEventListener('canplaythrough', onReady, { once: true });
    targetPlayer.addEventListener('canplay', onReadyFallback, { once: true });

    const fallbackTimeout = setTimeout(() => {
      if (!switchDone) {
        console.warn('[DoubleBuffer] Manual video timeout, forcing switch');
        targetPlayer.removeEventListener('canplaythrough', onReady);
        targetPlayer.removeEventListener('canplay', onReadyFallback);
        doSwitch();
      }
    }, 5000);

    // Listener pour la fin
    const onManualEnded = () => {
      targetPlayer.removeEventListener('ended', onManualEnded);
      targetPlayer.style.opacity = '0';
      targetPlayer.pause();
      targetPlayer.src = '';
      this.hideBlackOverlay();
      this.isManualMode = false;
      onEnded();
    };

    targetPlayer.addEventListener('ended', onManualEnded, { once: true });
  }

  /**
   * Termine le mode manuel et retourne à la boucle
   */
  endManualMode(): void {
    const player = this.getActiveManualPlayer();
    if (player) {
      player.style.opacity = '0';
      player.pause();
      player.src = '';
    }
    this.hideBlackOverlay();
    this.isManualMode = false;
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  /**
   * Reset complet du système
   */
  performFullReset(): void {
    console.log('[DoubleBuffer] 🔄 Performing full reset');

    [this.playerA, this.playerB, this.manualPlayerA, this.manualPlayerB].forEach(player => {
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    });

    this.isLoopMode = false;
    this.isManualMode = false;
    this.pendingSwitch = false;
    this.switchTriggered = false;
    this.preloadReady = false;
    this.preloadedIndex = null;
    this.currentLoopIndex = 0;
    this.activePlayer = 'A';

    this.hideFreezeFrame();
    this.hideBlackOverlay();

    if (this.playerA) this.setPlayerVisible(this.playerA, true);
    if (this.playerB) this.setPlayerVisible(this.playerB, false);
  }

  /**
   * Nettoie les ressources
   */
  destroy(): void {
    this.stopLoop();
    this.playerA = null;
    this.playerB = null;
    this.manualPlayerA = null;
    this.manualPlayerB = null;
    this.freezeCanvas = null;
    this.freezeCtx = null;
    this.blackOverlay = null;
    this.callbacks = null;
  }
}
