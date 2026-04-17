import { Injectable, NgZone } from '@angular/core';

/**
 * Callbacks pour le double buffer — le composant TV fournit ces callbacks
 * pour être notifié des événements de lecture sans que le service ne connaisse
 * l'analytique, le socket ou le player state.
 */
export interface DoubleBufferCallbacks {
  onPlayStarted: (videoIndex: number, player: HTMLVideoElement) => void;
  onSwitchReady: (nextVideoIndex: number, newPlayer: HTMLVideoElement) => void;
  onPlayError: (videoIndex: number, error: unknown) => void;
  getIsManualMode: () => boolean;
}

/**
 * Service gérant le système de double-buffer vidéo pour des transitions sans flash.
 * Extrait de tv.component.ts — gère uniquement les opérations DOM sur les players.
 *
 * Architecture:
 * - 2 players pour la boucle (alternent: un joue, l'autre précharge)
 * - 2 players pour les vidéos manuelles (au-dessus de la boucle)
 * - Canvas freeze-frame pour masquer les transitions
 * - Black overlay pour bloquer physiquement la boucle
 *
 * Le service ne connaît PAS la liste de vidéos, l'analytics, le socket, etc.
 * Il reçoit des ordres (play index X, preload index Y) et notifie via callbacks.
 */
@Injectable({
  providedIn: 'root'
})
export class DoubleBufferVideoService {
  // Players de boucle (z-index 1-2)
  private playerA: HTMLVideoElement | null = null;
  private playerB: HTMLVideoElement | null = null;
  private _activePlayer: 'A' | 'B' = 'A';

  // Players manuels (z-index 10-11)
  private manualPlayerA: HTMLVideoElement | null = null;
  private manualPlayerB: HTMLVideoElement | null = null;
  private _activeManualPlayer: 'A' | 'B' = 'A';

  // Canvas freeze-frame (z-index 20)
  private freezeCanvas: HTMLCanvasElement | null = null;
  private freezeCtx: CanvasRenderingContext2D | null = null;
  private hasValidLastFrame = false;
  private lastFrameCaptureInterval: ReturnType<typeof setInterval> | null = null;

  // Black overlay (z-index 5)
  private blackOverlay: HTMLDivElement | null = null;

  // Preload state
  private _preloadedIndex: number | null = null;
  private _preloadReady = false;
  private _pendingSwitch = false;

  // Callbacks
  private callbacks: DoubleBufferCallbacks | null = null;

  constructor(private ngZone: NgZone) {}

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

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

    // Initialiser le canvas (720p pour économiser la mémoire sur Pi)
    if (this.freezeCanvas) {
      this.freezeCtx = this.freezeCanvas.getContext('2d');
      this.freezeCanvas.width = 1280;
      this.freezeCanvas.height = 720;
    }

    // Configurer les players de boucle
    [this.playerA, this.playerB].forEach((player, i) => {
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      console.log(`[DoubleBuffer] Loop player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Configurer les players manuels
    [this.manualPlayerA, this.manualPlayerB].forEach((player, i) => {
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      this.setManualPlayerVisible(player, false);
      console.log(`[DoubleBuffer] Manual player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Player A de boucle est visible au départ
    this.setPlayerVisible(this.playerA, true);
    this.setPlayerVisible(this.playerB, false);
    this._activePlayer = 'A';

    console.log('[DoubleBuffer] Service initialized (4 players)');
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get activePlayer(): 'A' | 'B' {
    return this._activePlayer;
  }

  get activeManualPlayer(): 'A' | 'B' {
    return this._activeManualPlayer;
  }

  get preloadedIndex(): number | null {
    return this._preloadedIndex;
  }

  get preloadReady(): boolean {
    return this._preloadReady;
  }

  get pendingSwitch(): boolean {
    return this._pendingSwitch;
  }

  getActivePlayer(): HTMLVideoElement {
    return this._activePlayer === 'A' ? this.playerA! : this.playerB!;
  }

  getInactivePlayer(): HTMLVideoElement {
    return this._activePlayer === 'A' ? this.playerB! : this.playerA!;
  }

  getActiveManualPlayer(): HTMLVideoElement {
    return this._activeManualPlayer === 'A' ? this.manualPlayerA! : this.manualPlayerB!;
  }

  getInactiveManualPlayer(): HTMLVideoElement {
    return this._activeManualPlayer === 'A' ? this.manualPlayerB! : this.manualPlayerA!;
  }

  swapActiveManualPlayer(): void {
    this._activeManualPlayer = this._activeManualPlayer === 'A' ? 'B' : 'A';
  }

  // ==========================================================================
  // PLAYER VISIBILITY
  // ==========================================================================

  setPlayerVisible(player: HTMLVideoElement, visible: boolean, zIndex?: number): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = String(zIndex ?? (visible ? '2' : '0'));
  }

  setManualPlayerVisible(player: HTMLVideoElement, visible: boolean): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = visible ? '11' : '10';
  }

  // ==========================================================================
  // LOOP PLAYER OPERATIONS
  // ==========================================================================

  /**
   * Joue une vidéo sur le player actif.
   * Attend canplaythrough avant de jouer (le décodeur hardware a le premier I-frame prêt).
   * Notifie le callback onPlayStarted une fois la lecture démarrée.
   */
  playOnActivePlayer(videoPath: string, videoIndex: number): void {
    const player = this.getActivePlayer();

    console.log(`[DoubleBuffer] Playing video ${videoIndex} on player ${this._activePlayer}:`, videoPath);

    player.src = videoPath;
    player.load();

    let playStarted = false;

    const doPlay = () => {
      if (playStarted) return;
      playStarted = true;

      player.play().then(() => {
        this.ngZone.run(() => {
          this.callbacks?.onPlayStarted(videoIndex, player);
        });

        // Frame detection: wait for actual pixels before hiding freeze-frame
        this.detectFrameAndReveal(player);
      }).catch(err => {
        console.error('[DoubleBuffer] Error playing video:', err);
        // Hide overlays on error too (otherwise freeze-frame stays forever)
        this.hideFreezeFrame();
        if (!this.callbacks?.getIsManualMode()) {
          this.hideBlackOverlay();
        }
        this.ngZone.run(() => {
          this.callbacks?.onPlayError(videoIndex, err);
        });
      });
    };

    // Attendre canplaythrough avant de jouer
    player.addEventListener('canplaythrough', doPlay, { once: true });

    // Safety timeout — si canplaythrough ne se déclenche pas après 3s, jouer quand même
    setTimeout(() => {
      if (!playStarted) {
        console.warn('[DoubleBuffer] canplaythrough timeout, forcing play');
        doPlay();
      }
    }, 3000);
  }

  /**
   * Attend que le player rende des pixels réels, puis cache le freeze-frame et le black overlay.
   * Polling readyState >= 4 + currentTime > 0 + timeupdate comme signal fiable.
   */
  private detectFrameAndReveal(player: HTMLVideoElement): void {
    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      clearTimeout(safetyTimeout);
      player.removeEventListener('timeupdate', onFirstTimeUpdate);
      requestAnimationFrame(() => {
        this.hideFreezeFrame();
        if (!this.callbacks?.getIsManualMode()) {
          this.hideBlackOverlay();
        }
      });
    };

    const safetyTimeout = setTimeout(() => {
      if (!revealed) {
        console.warn('[DoubleBuffer] Frame detection safety timeout, revealing');
        reveal();
      }
    }, 1500);

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
  }

  /**
   * Précharge une vidéo sur le player inactif
   */
  preloadOnInactivePlayer(videoPath: string, videoIndex: number): void {
    const player = this.getInactivePlayer();

    // Si déjà préchargé, ne rien faire
    if (this._preloadedIndex === videoIndex && this._preloadReady) {
      console.log(`[DoubleBuffer] Video ${videoIndex} already preloaded`);
      return;
    }

    console.log(`[DoubleBuffer] Preloading video ${videoIndex}:`, videoPath);

    this._preloadReady = false;
    this._preloadedIndex = videoIndex;

    // Restaurer preload='auto' si le cleanup l'avait mis à 'none'
    player.preload = 'auto';
    player.src = videoPath;
    player.load();

    const onCanPlay = () => {
      if (this._preloadedIndex === videoIndex) {
        this._preloadReady = true;
        console.log(`[DoubleBuffer] Video ${videoIndex} preloaded and ready`);
      }
      player.removeEventListener('canplaythrough', onCanPlay);
    };
    player.addEventListener('canplaythrough', onCanPlay);
  }

  /**
   * Switch entre les deux players (transition sans flash).
   * Le freeze-frame doit être affiché par l'appelant AVANT d'appeler cette méthode.
   * Notifie onSwitchReady une fois que le nouveau player rend des frames réels.
   */
  switchPlayers(nextVideoIndex: number): void {
    const oldPlayer = this.getActivePlayer();
    const newPlayer = this.getInactivePlayer();

    console.log(`[DoubleBuffer] Switching from ${this._activePlayer} to ${this._activePlayer === 'A' ? 'B' : 'A'}, preloadReady=${this._preloadReady}`);

    const doSwitch = () => {
      // Rendre le nouveau player visible avec z-index 2 (au-dessus de l'ancien)
      this.setPlayerVisible(newPlayer, true, 2);

      newPlayer.play().then(() => {
        // Attendre que le player rende des pixels réels avant de notifier
        let revealed = false;
        const safetyTimeout = setTimeout(() => {
          if (!revealed) {
            revealed = true;
            console.warn('[DoubleBuffer] Frame detection safety timeout, revealing anyway');
            finalize();
          }
        }, 1500);

        const finalize = () => {
          // Cacher l'ancien player
          this.setPlayerVisible(oldPlayer, false, 0);

          // Cacher le freeze-frame et le black overlay
          this.hideFreezeFrame();
          if (!this.callbacks?.getIsManualMode()) {
            this.hideBlackOverlay();
          }

          // Ramener le nouveau player au z-index standard
          newPlayer.style.zIndex = '1';

          // Mettre à jour l'état
          this._activePlayer = this._activePlayer === 'A' ? 'B' : 'A';
          this._preloadReady = false;
          this._preloadedIndex = null;
          this._pendingSwitch = false;

          this.ngZone.run(() => {
            this.callbacks?.onSwitchReady(nextVideoIndex, newPlayer);
          });
        };

        const checkFrame = () => {
          if (revealed) return;
          if (newPlayer.readyState >= 4 && newPlayer.currentTime > 0) {
            revealed = true;
            clearTimeout(safetyTimeout);
            newPlayer.removeEventListener('timeupdate', onFirstTimeUpdate);
            requestAnimationFrame(() => finalize());
          } else {
            requestAnimationFrame(checkFrame);
          }
        };

        const onFirstTimeUpdate = () => {
          newPlayer.removeEventListener('timeupdate', onFirstTimeUpdate);
          if (!revealed) {
            revealed = true;
            clearTimeout(safetyTimeout);
            requestAnimationFrame(() => finalize());
          }
        };
        newPlayer.addEventListener('timeupdate', onFirstTimeUpdate);
        requestAnimationFrame(checkFrame);
      }).catch(err => {
        console.error('[DoubleBuffer] Error switching to next video:', err);
        this.setPlayerVisible(newPlayer, false, 0);
        this._pendingSwitch = false;
        this._preloadReady = false;
        this._preloadedIndex = null;
        // Don't hide overlays during manual mode — they protect the manual video
        if (!this.callbacks?.getIsManualMode()) {
          // Keep freeze-frame visible — playOnActivePlayer will hide it when ready
        }
        this.ngZone.run(() => {
          this.callbacks?.onPlayError(nextVideoIndex, err);
        });
      });
    };

    // Si la vidéo n'est pas encore préchargée, attendre
    if (!this._preloadReady || this._preloadedIndex !== nextVideoIndex) {
      console.log('[DoubleBuffer] Waiting for preload to complete...');

      if (this._preloadedIndex !== nextVideoIndex) {
        // Caller must provide path — this should not happen if used correctly
        console.warn('[DoubleBuffer] switchPlayers called without preload — caller should preload first');
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
          this._preloadReady = true;
          executeSwitchOnce();
        }
      }, 30);

      const onCanPlay = () => {
        newPlayer.removeEventListener('canplaythrough', onCanPlay);
        clearInterval(checkInterval);
        this._preloadReady = true;
        executeSwitchOnce();
      };
      newPlayer.addEventListener('canplaythrough', onCanPlay);

      // Safety timeout (5s — freeze-frame covers the wait, remote WiFi access needs >= 5s)
      setTimeout(() => {
        clearInterval(checkInterval);
        newPlayer.removeEventListener('canplaythrough', onCanPlay);
        if (!switchExecuted) {
          console.warn('[DoubleBuffer] Preload timeout, forcing switch');
          executeSwitchOnce();
        }
      }, 5000);
    } else {
      doSwitch();
    }
  }

  /**
   * Nettoie le player inactif pour libérer la mémoire GPU (~30-50MB par vidéo).
   * Ne nettoie pas si un preload est en cours ou si la vidéo active est courte.
   * Returns true if cleanup was performed, false if skipped.
   */
  cleanupInactivePlayer(): boolean {
    const inactivePlayer = this.getInactivePlayer();
    if (!inactivePlayer) return false;

    // Ne pas nettoyer si un preload est en cours
    if (this._preloadReady || this._preloadedIndex !== null) return false;

    // Ne pas nettoyer si la vidéo active est courte (< 5s)
    const activePlayer = this.getActivePlayer();
    if (activePlayer?.duration && activePlayer.duration < 5) {
      console.log('[DoubleBuffer] Skipping cleanup: active video is short');
      return false;
    }

    if (inactivePlayer.src) {
      inactivePlayer.pause();
      inactivePlayer.removeAttribute('src');
      inactivePlayer.load();
      inactivePlayer.preload = 'none';
      console.log('[DoubleBuffer] Cleaned inactive player (freed decoder buffers)');
      return true;
    }
    return false;
  }

  // ==========================================================================
  // PENDING SWITCH STATE
  // ==========================================================================

  setPendingSwitch(value: boolean): void {
    this._pendingSwitch = value;
  }

  resetSwitchState(): void {
    this._pendingSwitch = false;
    this._preloadReady = false;
    this._preloadedIndex = null;
  }

  // ==========================================================================
  // FREEZE FRAME
  // ==========================================================================

  /**
   * Démarre la capture périodique du dernier frame visible (every 500ms).
   * Sur Chromium/Pi, le décodeur hardware libère le frame buffer à 'ended',
   * donc on pré-capture pour avoir toujours un frame valide.
   */
  startLastFrameCapture(): void {
    if (this.lastFrameCaptureInterval) {
      clearInterval(this.lastFrameCaptureInterval);
    }

    this.lastFrameCaptureInterval = setInterval(() => {
      this.captureLastFrame();
    }, 500);

    console.log('[DoubleBuffer] Last frame pre-capture started (every 500ms)');
  }

  stopLastFrameCapture(): void {
    if (this.lastFrameCaptureInterval) {
      clearInterval(this.lastFrameCaptureInterval);
      this.lastFrameCaptureInterval = null;
    }
  }

  /**
   * Capture silencieusement le frame actuel dans le canvas (sans l'afficher).
   * @param isManualMode whether the manual player is active
   * @param isLoopMode whether the loop is active
   */
  captureLastFrame(isManualMode = false, isLoopMode = true): void {
    if (!this.freezeCanvas || !this.freezeCtx) return;

    let player: HTMLVideoElement | null = null;
    if (isManualMode) {
      player = this.getActiveManualPlayer();
    } else if (isLoopMode) {
      player = this.getActivePlayer();
    } else {
      return;
    }

    if (!player || player.paused || player.ended) return;
    if (player.videoWidth === 0 || player.videoHeight === 0) return;
    if (player.readyState < 2) return;

    try {
      this.freezeCtx.drawImage(player, 0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      this.hasValidLastFrame = true;
    } catch {
      // Silencieux - erreur CORS ou vidéo pas encore prête
    }
  }

  /**
   * Affiche le freeze-frame pré-capturé. Si aucun frame valide, tente une capture live.
   * Returns true si le freeze-frame est affiché.
   */
  captureAndShowFreezeFrame(isManualMode = false): boolean {
    if (!this.freezeCanvas || !this.freezeCtx) {
      console.warn('[DoubleBuffer] Freeze canvas not available');
      return false;
    }

    // Si on a un frame pré-capturé ET qu'on n'est pas en mode manuel, l'afficher directement.
    // En mode manuel, la pré-capture vient du player de boucle — il faut capturer live
    // depuis le player manuel pour éviter un flash retour à la boucle.
    if (this.hasValidLastFrame && !isManualMode) {
      this.freezeCanvas.style.opacity = '1';
      this.freezeCanvas.style.zIndex = '20';
      console.log('[DoubleBuffer] Freeze frame shown (pre-captured)');
      return true;
    }

    // Fallback: tenter une capture live
    let sourceVideo: HTMLVideoElement | null = null;
    if (isManualMode) {
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
      this.freezeCanvas.style.opacity = '1';
      this.freezeCanvas.style.zIndex = '20';
      console.log('[DoubleBuffer] Freeze frame captured live and displayed');
      return true;
    } catch (err) {
      console.error('[DoubleBuffer] Error capturing freeze frame:', err);
      return false;
    }
  }

  /**
   * Cache le canvas freeze-frame.
   * Note: PAS de display:none — uniquement opacity pour éviter le reflow sur Pi GPU.
   * NE reset PAS hasValidLastFrame — la capture périodique continue.
   */
  hideFreezeFrame(): void {
    if (this.freezeCanvas) {
      this.freezeCanvas.style.opacity = '0';
      console.log('[DoubleBuffer] Freeze frame hidden');
    }
  }

  // ==========================================================================
  // BLACK OVERLAY
  // ==========================================================================

  showBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '1';
      console.log('[DoubleBuffer] Black overlay shown');
    }
  }

  hideBlackOverlay(): void {
    if (this.blackOverlay) {
      this.blackOverlay.style.opacity = '0';
      console.log('[DoubleBuffer] Black overlay hidden');
    }
  }

  // ==========================================================================
  // MEMORY CLEANUP
  // ==========================================================================

  /**
   * Nettoyage préventif de la mémoire (appelé par le service d'erreur/watchdog).
   * Nettoie le canvas, le player inactif, et les players manuels.
   */
  performMemoryCleanup(isManualMode: boolean, isPreloadReady: boolean): void {
    console.log('[DoubleBuffer] Performing memory cleanup');

    // Nettoyer le canvas freeze-frame (libère ~4.5MB)
    if (this.freezeCtx && this.freezeCanvas) {
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
      // Recapturer immédiatement pour ne pas laisser de fenêtre sans frame valide
      this.captureLastFrame(isManualMode, true);
    }

    // Nettoyer le player inactif
    const inactivePlayer = this.getInactivePlayer();
    if (inactivePlayer && !isPreloadReady) {
      if (inactivePlayer.src) {
        inactivePlayer.removeAttribute('src');
        inactivePlayer.load();
        console.log('[DoubleBuffer] Cleaned inactive loop player');
      }
    }

    // Nettoyer les players manuels s'ils ne sont pas utilisés
    if (!isManualMode) {
      [this.manualPlayerA, this.manualPlayerB].forEach((player, i) => {
        if (player && player.src) {
          player.removeAttribute('src');
          player.load();
          console.log(`[DoubleBuffer] Cleaned manual player ${i === 0 ? 'A' : 'B'}`);
        }
      });
    }

    // Forcer le garbage collection si disponible
    if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
      (window as unknown as { gc: () => void }).gc();
      console.log('[DoubleBuffer] Forced garbage collection');
    }
  }

  // ==========================================================================
  // FULL RESET
  // ==========================================================================

  /**
   * Reset complet du système de double-buffer.
   * Arrête tous les players, reset les états, nettoie le canvas.
   */
  performFullReset(): void {
    console.log('[DoubleBuffer] Performing full reset');

    [this.playerA, this.playerB, this.manualPlayerA, this.manualPlayerB].forEach(player => {
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    });

    this._pendingSwitch = false;
    this._preloadReady = false;
    this._preloadedIndex = null;
    this._activePlayer = 'A';

    this.hideFreezeFrame();
    this.showBlackOverlay();

    if (this.freezeCtx && this.freezeCanvas) {
      this.freezeCtx.clearRect(0, 0, this.freezeCanvas.width, this.freezeCanvas.height);
    }
    this.hasValidLastFrame = false;

    if (this.playerA) this.setPlayerVisible(this.playerA, true);
    if (this.playerB) this.setPlayerVisible(this.playerB, false);
  }

  /**
   * Arrête tous les players (boucle + manuels)
   */
  stopAllPlayers(): void {
    this.playerA?.pause();
    this.playerB?.pause();
    this.manualPlayerA?.pause();
    this.manualPlayerB?.pause();
    console.log('[DoubleBuffer] All players stopped');
  }

  /**
   * Pause les players de boucle
   */
  pauseLoopPlayers(): void {
    this.playerA?.pause();
    this.playerB?.pause();
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.stopLastFrameCapture();
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
