import { Injectable, NgZone } from '@angular/core';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { Sponsor } from '../interfaces/sponsor.interface';
import { generateWeightedPlaylist } from '../utils/weighted-playlist';

/**
 * Callbacks pour l'orchestration de la boucle — le composant TV fournit
 * ces callbacks pour les opérations qui dépendent du context (analytics,
 * socket, master/slave, player state).
 */
export interface PlaybackCallbacks {
  onLoopVideoStarted: (video: Sponsor, videoIndex: number, player: HTMLVideoElement) => void;
  onLoopVideoSwitched: (video: Sponsor, videoIndex: number, newPlayer: HTMLVideoElement) => void;
  onLoopVideoEnded: (completed: boolean) => void;
  onPlayError: (videoIndex: number) => void;
  onTransitionMetrics: (metrics: TransitionMetrics) => void;
  getIsSlaveMode: () => boolean;
  getIsManualMode: () => boolean;
  getActivePhase: () => 'neutral' | 'before' | 'during' | 'after';
  getLoopVideosForPhase: (phase: 'neutral' | 'before' | 'during' | 'after') => Sponsor[];
  /**
   * ADR-103 Phase 2b — invoked when the loop reaches a step whose
   * `contentType` is `'web_page'` or `'livestream'`. The TV component
   * forwards to `WebContentService.playInLoop(entry, onComplete)`. The
   * orchestrator advances to the next loop step when `onComplete` fires.
   * If the callback is not provided, the orchestrator skips the step.
   */
  playWebContentInLoop?: (entry: Sponsor, onComplete: () => void) => void;
}

export interface TransitionMetrics {
  earlySwitchCount: number;
  safetyTimeoutCount: number;
  cleanupSkippedCount: number;
  videoErrorCount: number;
  totalTransitions: number;
}

/**
 * Service d'orchestration de la boucle vidéo.
 * Extrait de tv.component.ts — gère le flux de haut niveau :
 * démarrage de la boucle, weighted playlist, timeupdate, prefetch,
 * early switch, onVideoEnded fallback, et les métriques de transition.
 *
 * Délègue les opérations DOM au DoubleBufferVideoService.
 */
@Injectable({
  providedIn: 'root'
})
export class VideoPlaybackService {
  // Loop state
  private _currentLoopIndex = 0;
  private _currentLoopVideos: Sponsor[] = [];
  private _isLoopMode = false;
  private _isStartingLoop = false;
  private _switchTriggered = false;
  private _switchGeneration = 0;
  private lastTimeUpdateCheck = 0;

  // Disk cache warming
  private prefetchedIndices: Set<number> = new Set();
  private prefetchAbortController: AbortController | null = null;
  private readonly PREFETCH_LOOKAHEAD = 3;

  // Transition metrics
  private metrics: TransitionMetrics = {
    earlySwitchCount: 0,
    safetyTimeoutCount: 0,
    cleanupSkippedCount: 0,
    videoErrorCount: 0,
    totalTransitions: 0,
  };
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private callbacks: PlaybackCallbacks | null = null;

  constructor(
    private doubleBuffer: DoubleBufferVideoService,
    private ngZone: NgZone
  ) {}

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get currentLoopIndex(): number { return this._currentLoopIndex; }
  get currentLoopVideos(): Sponsor[] { return this._currentLoopVideos; }
  get isLoopMode(): boolean { return this._isLoopMode; }
  get isStartingLoop(): boolean { return this._isStartingLoop; }
  get switchGeneration(): number { return this._switchGeneration; }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  init(callbacks: PlaybackCallbacks): void {
    this.callbacks = callbacks;
    console.log('[VideoPlayback] Service initialized');
  }

  /**
   * Start emitting transition metrics every 30s (aligned with heartbeat).
   */
  startMetricsInterval(): void {
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    this.metricsInterval = setInterval(() => this.emitTransitionMetrics(), 30000);
  }

  stopMetricsInterval(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  // ==========================================================================
  // METRICS
  // ==========================================================================

  incrementSafetyTimeout(): void { this.metrics.safetyTimeoutCount++; }
  incrementCleanupSkipped(): void { this.metrics.cleanupSkippedCount++; }
  incrementVideoError(): void { this.metrics.videoErrorCount++; }

  private emitTransitionMetrics(): void {
    const m = this.metrics;
    if (m.totalTransitions === 0 && m.safetyTimeoutCount === 0 && m.videoErrorCount === 0) return;

    this.callbacks?.onTransitionMetrics({ ...m });

    // Reset after emission
    m.earlySwitchCount = 0;
    m.safetyTimeoutCount = 0;
    m.cleanupSkippedCount = 0;
    m.videoErrorCount = 0;
    m.totalTransitions = 0;
  }

  // ==========================================================================
  // SEAMLESS LOOP
  // ==========================================================================

  /**
   * Démarre la boucle vidéo avec double-buffer.
   * @param resumeIndex index de reprise (clampé). null = début.
   */
  startSeamlessLoop(resumeIndex?: number): void {
    if (this._isStartingLoop) {
      console.log('[VideoPlayback] startSeamlessLoop already in progress, skipping');
      return;
    }
    this._isStartingLoop = true;

    // Reset prefetch state
    this.resetPrefetchState();

    // Pause existing loop players
    this.doubleBuffer.pauseLoopPlayers();

    this._isLoopMode = true;
    this.doubleBuffer.setPendingSwitch(false);
    this._switchTriggered = false;

    // Get videos for current phase
    const phase = this.callbacks?.getActivePhase() ?? 'neutral';
    const loopVideos = this.callbacks?.getLoopVideosForPhase(phase) ?? [];

    // Filter steps that the loop can ACTUALLY play.
    //
    // ADR-103 Phase 0 / 0.5 / 2b — keep two safety nets but allow web/live:
    //   1. Reject synthetic `web_page-<ts>` / `livestream-<ts>` filenames —
    //      these are dashboard mishaps that the backend resolver should
    //      have rewritten to a real URL. If we still see one, the row was
    //      deleted in DB or the resolver failed; skip to avoid the loop
    //      crashing on a non-playable path (incident NLF 28/04/2026).
    //   2. Accept video entries with any path; accept web_page / livestream
    //      entries provided they have an http(s) URL as path. The orchestrator
    //      delegates them to WebContentService.playInLoop (Phase 2b).
    const isPlayableEntry = (v: Sponsor): boolean => {
      if (!v?.path) return false;
      const path = String(v.path);
      if (/(?:^|\/)(?:web_page|livestream)-\d+$/.test(path)) return false;
      const ct = (v.contentType ?? 'video') as string;
      if (ct === 'video') return true;
      if (ct === 'web_page' || ct === 'livestream') {
        return /^https?:\/\//i.test(path);
      }
      return false;
    };
    const validVideos = loopVideos.filter(isPlayableEntry);
    if (validVideos.length !== loopVideos.length) {
      const skipped = loopVideos.length - validVideos.length;
      console.warn(`[VideoPlayback] Filtered out ${skipped} unplayable step(s) (no path, synthetic filename, or unknown contentType — ADR-103 Phase 0/2b guard)`);
    }
    this._currentLoopVideos = generateWeightedPlaylist(validVideos);

    if (validVideos.length === 0) {
      console.warn('[VideoPlayback] No videos in loop');
      this._isLoopMode = false;
      this._isStartingLoop = false;
      this.doubleBuffer.hideFreezeFrame();
      if (!this.callbacks?.getIsManualMode()) {
        this.doubleBuffer.hideBlackOverlay();
      }
      return;
    }

    // Clamp resume index
    const startIndex = (resumeIndex != null && validVideos.length > 0)
      ? resumeIndex % validVideos.length
      : 0;
    this._currentLoopIndex = startIndex;

    // Slave mode: don't play independently — wait for master sync
    if (this.callbacks?.getIsSlaveMode()) {
      console.log('[VideoPlayback] Slave mode: loop ready, waiting for master sync');
      this._isStartingLoop = false;
      return;
    }

    console.log('[VideoPlayback] Starting loop with', validVideos.length, 'videos at index', startIndex);

    // ADR-103 Phase 2b — dispatcher routes the step by contentType:
    // MP4 → DoubleBuffer.playOnActivePlayer ; web/live → WebContentService.playInLoop.
    this.dispatchLoopStep(startIndex);

    setTimeout(() => {
      this._isStartingLoop = false;
    }, 500);
  }

  /**
   * ADR-103 Phase 2b — central dispatcher for a loop step. Routes by
   * `contentType` of the entry at `index`. For MP4 entries, plays on the
   * active loop player (existing behavior). For web/live entries, delegates
   * to the `playWebContentInLoop` callback (TV component → WebContentService).
   *
   * Updates `_currentLoopIndex` so the rest of the orchestrator (timeupdate,
   * preload, switch) sees the new position.
   */
  private dispatchLoopStep(index: number): void {
    const entry = this._currentLoopVideos[index];
    if (!entry) {
      console.warn('[VideoPlayback] dispatchLoopStep: no entry at index', index);
      return;
    }
    this._currentLoopIndex = index;

    if (this.isWebContentEntry(entry)) {
      // Web/live step. Reset MP4 transition state — the DoubleBuffer is
      // not driving this step; the WebContentService is.
      this._switchTriggered = false;
      this.doubleBuffer.setPendingSwitch(false);
      const cb = this.callbacks?.playWebContentInLoop;
      if (!cb) {
        console.warn('[VideoPlayback] No playWebContentInLoop callback — skipping web/live step');
        this.advanceLoop();
        return;
      }
      console.log('[VideoPlayback] Dispatching web/live step', { index, name: entry.name, contentType: entry.contentType });
      cb(entry, () => this.advanceLoop());
    } else {
      // MP4 step — DoubleBuffer plays it. The orchestrator's timeupdate /
      // onVideoEnded handlers will trigger the next step when this one ends.
      this.doubleBuffer.playOnActivePlayer(entry.path, index);
    }
  }

  /**
   * ADR-103 Phase 2b — advance to the next loop step. Called by:
   *   - WebContentService.playInLoop completion callback (auto-close or
   *     1s skip on error).
   *   - the orchestrator itself when a missing callback forces a skip.
   *
   * Wraps mod arithmetic + dispatchLoopStep.
   */
  private advanceLoop(): void {
    if (!this._isLoopMode) return;
    if (!this._currentLoopVideos.length) return;
    const next = (this._currentLoopIndex + 1) % this._currentLoopVideos.length;
    this.dispatchLoopStep(next);
  }

  /**
   * ADR-103 Phase 2b — predicate for "this loop step is web/live, not MP4".
   * Filter pass already guarantees the path is an http(s) URL when web/live.
   */
  private isWebContentEntry(entry: Sponsor): boolean {
    return entry?.contentType === 'web_page' || entry?.contentType === 'livestream';
  }

  stopSeamlessLoop(): void {
    this._isLoopMode = false;
    this.doubleBuffer.pauseLoopPlayers();
    console.log('[VideoPlayback] Loop stopped');
  }

  restartSeamlessLoop(): void {
    console.log('[VideoPlayback] Restarting loop');
    this.startSeamlessLoop();
  }

  // ==========================================================================
  // LOOP EVENT HANDLERS (called by TvComponent)
  // ==========================================================================

  /**
   * Called by the double-buffer's onPlayStarted callback.
   * Updates loop index and notifies the component.
   */
  handlePlayStarted(videoIndex: number, player: HTMLVideoElement): void {
    this._currentLoopIndex = videoIndex;
    const video = this._currentLoopVideos[videoIndex];
    if (video) {
      this.callbacks?.onLoopVideoStarted(video, videoIndex, player);
    }
  }

  /**
   * Called by the double-buffer's onSwitchReady callback.
   * Updates loop state after a successful switch.
   */
  handleSwitchReady(nextVideoIndex: number, newPlayer: HTMLVideoElement): void {
    this._currentLoopIndex = nextVideoIndex;
    this._switchTriggered = false;

    const video = this._currentLoopVideos[nextVideoIndex];
    if (video) {
      this.callbacks?.onLoopVideoSwitched(video, nextVideoIndex, newPlayer);
    }

    // Cleanup the old (now inactive) player after stabilization
    setTimeout(() => {
      const cleaned = this.doubleBuffer.cleanupInactivePlayer();
      if (!cleaned) {
        this.metrics.cleanupSkippedCount++;
      }
    }, 500);
  }

  /**
   * Called by the double-buffer's onPlayError callback.
   * Attempts to skip to the next video.
   */
  handlePlayError(videoIndex: number): void {
    this.metrics.videoErrorCount++;
    this.doubleBuffer.hideFreezeFrame();
    if (!this.callbacks?.getIsManualMode()) {
      this.doubleBuffer.hideBlackOverlay();
    }
    setTimeout(() => {
      const nextIndex = (videoIndex + 1) % this._currentLoopVideos.length;
      if (nextIndex !== videoIndex) {
        const video = this._currentLoopVideos[nextIndex];
        if (video?.path) {
          this.doubleBuffer.playOnActivePlayer(video.path, nextIndex);
        }
      }
    }, 1000);
  }

  // ==========================================================================
  // TIMEUPDATE — early preload & switch
  // ==========================================================================

  /**
   * Called from the player's timeupdate event.
   * Triggers disk cache warming, late preload, and early switch.
   */
  onTimeUpdate(fromPlayer: 'A' | 'B'): void {
    if (!this._isLoopMode || fromPlayer !== this.doubleBuffer.activePlayer) return;
    if (this.callbacks?.getIsManualMode()) return;
    if (this._switchTriggered || this.doubleBuffer.pendingSwitch) return;

    // Throttle: check only every 200ms
    const now = performance.now();
    if (now - this.lastTimeUpdateCheck < 200) return;
    this.lastTimeUpdateCheck = now;

    const player = this.doubleBuffer.getActivePlayer();
    if (!player.duration || player.duration <= 0) return;

    const remaining = player.duration - player.currentTime;
    const elapsed = player.currentTime;

    // Warm disk cache at 50% playback
    if (elapsed >= player.duration * 0.5 && !this.prefetchedIndices.has(this._currentLoopIndex)) {
      this.prefetchedIndices.add(this._currentLoopIndex);
      this.warmDiskCache(this._currentLoopIndex);
    }

    // Preload 1.5s before end (or 15% max for short videos)
    const preloadThreshold = Math.min(1.5, player.duration * 0.15);
    if (remaining <= preloadThreshold && !this.doubleBuffer.preloadReady && this.doubleBuffer.preloadedIndex === null) {
      const nextIndex = (this._currentLoopIndex + 1) % this._currentLoopVideos.length;
      const nextVideo = this._currentLoopVideos[nextIndex];
      // ADR-103 Phase 2b — skip MP4 preload if the next loop step is
      // web/live; the DoubleBuffer cannot preload an iframe URL, and
      // the orchestrator will route this step to WebContentService at
      // switch time. The freeze frame already covers the transition.
      if (nextVideo?.path && !this.isWebContentEntry(nextVideo)) {
        console.log(`[VideoPlayback] Starting late preload, ${remaining.toFixed(1)}s remaining`);
        this.doubleBuffer.preloadOnInactivePlayer(nextVideo.path, nextIndex);
      }
    }

    // Early switch 500ms before end (300ms for short videos)
    const switchThreshold = player.duration > 3 ? 0.5 : 0.3;
    if (remaining <= switchThreshold && remaining > 0) {
      console.log(`[VideoPlayback] Triggering early switch, ${remaining.toFixed(2)}s remaining`);
      this.metrics.earlySwitchCount++;
      this.metrics.totalTransitions++;
      this._switchTriggered = true;
      this.triggerSwitch();
    }
  }

  // ==========================================================================
  // VIDEO ENDED (fallback when early switch didn't fire)
  // ==========================================================================

  /**
   * Called when a loop video ends on a player.
   * Shows freeze-frame, preloads next, and triggers switch.
   */
  onVideoEnded(fromPlayer: 'A' | 'B'): void {
    if (!this._isLoopMode || fromPlayer !== this.doubleBuffer.activePlayer) return;
    if (this.callbacks?.getIsManualMode()) return;

    // Slave mode: show freeze-frame and wait for master
    if (this.callbacks?.getIsSlaveMode()) {
      console.log('[VideoPlayback] Slave mode: showing freeze frame, waiting for master');
      this.doubleBuffer.captureAndShowFreezeFrame();
      return;
    }

    if (this.doubleBuffer.pendingSwitch) return;

    // Show freeze-frame to cover the transition
    const isManual = this.callbacks?.getIsManualMode() ?? false;
    const freezeOk = this.doubleBuffer.captureAndShowFreezeFrame(isManual);
    if (!freezeOk) {
      this.doubleBuffer.showBlackOverlay();
    }

    const nextIndex = (this._currentLoopIndex + 1) % this._currentLoopVideos.length;
    const nextVideo = this._currentLoopVideos[nextIndex];

    // ADR-103 Phase 2b — fallback path: if next step is web/live, route
    // directly to the dispatcher instead of preloading + switching the
    // DoubleBuffer (which would attempt to load an iframe URL into a
    // <video>, fail with MEDIA_ELEMENT_ERROR, and stall the rotation).
    if (this.isWebContentEntry(nextVideo)) {
      console.log(`[VideoPlayback] onVideoEnded → web/live step ${nextIndex}`);
      this.dispatchLoopStep(nextIndex);
      return;
    }

    // Preload before switch
    if (nextVideo?.path) {
      this.doubleBuffer.preloadOnInactivePlayer(nextVideo.path, nextIndex);
    }

    // Wait for preload then switch
    const inactivePlayer = this.doubleBuffer.getInactivePlayer();
    let switchTriggered = false;
    const generation = this._switchGeneration;

    const doTriggerSwitch = () => {
      if (switchTriggered) return;
      if (this._switchGeneration !== generation) {
        console.log('[VideoPlayback] Switch cancelled by phase change');
        return;
      }
      this.metrics.totalTransitions++;
      switchTriggered = true;
      this.triggerSwitch();
    };

    const onReady = () => {
      inactivePlayer.removeEventListener('canplaythrough', onReady);
      clearInterval(readyCheckInterval);
      clearTimeout(safetyTimeout);
      doTriggerSwitch();
    };
    inactivePlayer.addEventListener('canplaythrough', onReady);

    const readyCheckInterval = setInterval(() => {
      if (switchTriggered) {
        clearInterval(readyCheckInterval);
        return;
      }
      if (inactivePlayer.readyState >= 3) {
        clearInterval(readyCheckInterval);
        inactivePlayer.removeEventListener('canplaythrough', onReady);
        clearTimeout(safetyTimeout);
        doTriggerSwitch();
      }
    }, 50);

    const safetyTimeout = setTimeout(() => {
      clearInterval(readyCheckInterval);
      inactivePlayer.removeEventListener('canplaythrough', onReady);
      console.warn('[VideoPlayback] Preload safety timeout, forcing switch');
      doTriggerSwitch();
    }, 1500);
  }

  // ==========================================================================
  // SWITCH
  // ==========================================================================

  private triggerSwitch(): void {
    if (this.doubleBuffer.pendingSwitch) return;
    this.doubleBuffer.setPendingSwitch(true);

    // Capturer le freeze-frame pour couvrir la transition.
    // En software decode (Pi 5 fallback), le switch peut prendre plus longtemps
    // et sans freeze-frame le player inactif (pas encore de frame rendu) cause un flash noir.
    this.doubleBuffer.captureAndShowFreezeFrame();

    this.ngZone.run(() => {
      this.callbacks?.onLoopVideoEnded(true);
      const nextIndex = (this._currentLoopIndex + 1) % this._currentLoopVideos.length;
      const nextVideo = this._currentLoopVideos[nextIndex];

      // ADR-103 Phase 2b — if the next step is web/live, route via the
      // dispatcher (WebContentService.playInLoop) instead of switching the
      // DoubleBuffer (which cannot play an iframe / non-MP4 URL).
      if (this.isWebContentEntry(nextVideo)) {
        console.log(`[VideoPlayback] Switching to web/live step ${nextIndex}`);
        this.doubleBuffer.setPendingSwitch(false);
        this.dispatchLoopStep(nextIndex);
        return;
      }

      console.log(`[VideoPlayback] Triggering switch to video ${nextIndex}`);
      this.doubleBuffer.switchPlayers(nextIndex);
    });
  }

  // ==========================================================================
  // MANUAL VIDEO SUPPORT
  // ==========================================================================

  /**
   * Stop the manual video and prepare to return to loop.
   * Called by TvComponent when user switches phase during manual playback.
   */
  stopManualVideoAndReturnToLoop(
    manualPlayerA: HTMLVideoElement,
    manualPlayerB: HTMLVideoElement
  ): void {
    console.log('[VideoPlayback] Stopping manual video to return to loop');

    [manualPlayerA, manualPlayerB].forEach(player => {
      if (player) {
        player.pause();
        player.style.opacity = '0';
        player.removeAttribute('src');
        player.load();
      }
    });
  }

  /**
   * Increment the switch generation to cancel any pending callbacks.
   * Called by TvComponent when switching phase.
   */
  incrementSwitchGeneration(): void {
    this._switchGeneration++;
  }

  /**
   * Set loop mode directly (used by TvComponent for state management).
   */
  setLoopMode(value: boolean): void {
    this._isLoopMode = value;
  }

  /**
   * Set current loop index directly (used by slave mode sync).
   */
  setCurrentLoopIndex(index: number): void {
    this._currentLoopIndex = index;
  }

  // ==========================================================================
  // DISK CACHE WARMING
  // ==========================================================================

  private warmDiskCache(fromIndex: number): void {
    const videos = this._currentLoopVideos;
    if (videos.length <= 1) return;

    this.prefetchAbortController?.abort();
    this.prefetchAbortController = new AbortController();
    const signal = this.prefetchAbortController.signal;

    for (let offset = 1; offset <= this.PREFETCH_LOOKAHEAD; offset++) {
      const targetIndex = (fromIndex + offset) % videos.length;
      if (this.prefetchedIndices.has(targetIndex)) continue;

      const video = videos[targetIndex];
      if (!video?.path) continue;

      this.prefetchedIndices.add(targetIndex);

      const isCrossOrigin = video.path.startsWith('http://') || video.path.startsWith('https://');

      if (isCrossOrigin) {
        // SaaS mode: <link rel="prefetch">
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'video';
        link.href = video.path;
        document.head.appendChild(link);
        setTimeout(() => link.remove(), 10000);
        console.log(`[VideoPlayback] Prefetch hint for video ${targetIndex}`);
      } else {
        // Pi mode: fetch() warms kernel page cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetch(video.path, { signal, priority: 'low' } as any)
          .then((response: Response) => response.ok ? response.arrayBuffer() : undefined)
          .then(() => {
            if (!signal.aborted) {
              console.log(`[VideoPlayback] Disk cache warmed for video ${targetIndex}`);
            }
          })
          .catch(() => { /* Silencieux : abort ou erreur réseau */ });
      }
    }
  }

  private resetPrefetchState(): void {
    this.prefetchAbortController?.abort();
    this.prefetchAbortController = null;
    this.prefetchedIndices.clear();
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.stopMetricsInterval();
    this.resetPrefetchState();
    this.callbacks = null;
    this._currentLoopVideos = [];
  }
}
