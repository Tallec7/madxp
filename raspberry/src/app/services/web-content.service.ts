import { Injectable, inject } from '@angular/core';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { AnalyticsService } from './analytics.service';
import { ManualVideoService } from './manual-video.service';
import { WebPagePayload, LivestreamPayload } from '../interfaces/command.interface';
import { PiConfigVideoEntry } from '../interfaces/video.interface';

/**
 * ADR-089 / ADR-103 Phase 1+2.5 — Web page & livestream player.
 *
 * Robust manual playback for `web_page` and `livestream` entries, isolated
 * from the DoubleBuffer MP4 pipeline so a misbehaving iframe or HLS stream
 * cannot drag the rotation down.
 *
 * Phase 1 hardening:
 *   - 1s load-timeout on iframe / livestream → skip on failure.
 *   - Analytics with contentType + interruption_reason='web_load_failed'.
 *   - Layered cleanup, deterministic teardown.
 *
 * Phase 2.5 polish:
 *   - When taking over from a manual MP4 video, the manual players are
 *     cleared (paused + hidden + isManualMode=false) so the return-to-loop
 *     never re-shows the manual entry.
 *   - The MP4 loop is **not paused** during web/live playback — it keeps
 *     advancing silently behind the iframe. At returnToLoop:
 *       - if the loop was running → seamless take-over, no restart.
 *       - if the loop was paused (we came from manual) → restart at
 *         savedLoopIndex + 1 (advance, never replay the same step).
 *   - CSS opacity transition (200ms) on iframe + livestream + black
 *     background on iframe (covers the cross-origin white flash during
 *     first paint).
 *   - Freeze frame held ~100ms after `load` to let cross-origin pages
 *     actually paint their first frame before the freeze disappears.
 *   - Freeze frame captured BEFORE clearing the iframe at returnToLoop
 *     so the close transition is also smooth.
 */
@Injectable({ providedIn: 'root' })
export class WebContentService {
  /** Skip after this delay if the iframe / livestream did not signal "ready". */
  static readonly LOAD_TIMEOUT_MS = 1000;
  /**
   * Hold the freeze frame this long after `load`/`loadeddata` AND after two
   * forced paint cycles to let the iframe actually paint its final frame.
   * ADR-103 Phase 2.7 — bumped 120 → 250 ms after Daisy reported a residual
   * flash with variable duration. Cross-origin iframes fire `load` when the
   * sub-document has finished loading, but the browser may need 2-3 paint
   * cycles to render fonts/lazy images/layout shifts before stabilizing. We
   * force two requestAnimationFrame ticks before starting this timer so the
   * delay starts AFTER the iframe has at least one stable frame on screen.
   */
  static readonly REVEAL_DELAY_MS = 250;
  /** CSS opacity transition duration applied to iframe + livestream. */
  static readonly OPACITY_TRANSITION_MS = 200;

  private readonly analytics = inject(AnalyticsService);
  private readonly manualVideoService = inject(ManualVideoService);

  private _iframe: HTMLIFrameElement | null = null;
  private _livestreamPlayer: HTMLVideoElement | null = null;
  private _isActive = false;
  private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _revealDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private _savedLoopIndex = 0;
  private _iframeOnLoad: (() => void) | null = null;
  private _iframeOnError: (() => void) | null = null;
  private _livestreamCleanup: (() => void) | null = null;
  private _currentAnalyticsVideo: PiConfigVideoEntry | null = null;
  /**
   * ADR-103 Phase 2b — when set, the auto-close / failure path calls this
   * callback (which advances the loop to the next step) instead of
   * `returnToLoop()` (which restarts the loop at savedIndex+1). Set by
   * `playInLoop()`, cleared by `teardown()`.
   */
  private _loopOnComplete: (() => void) | null = null;
  /**
   * ADR-103 Phase 1.5 — Hls instance for the current livestream. Lazy-loaded
   * when an `.m3u8` URL is requested AND the browser lacks native HLS
   * support (Chromium kiosk, Firefox). Cleared by teardown.
   */
  private _hlsInstance: import('hls.js').default | null = null;

  constructor(
    private readonly doubleBufferService: DoubleBufferVideoService,
    private readonly playbackService: VideoPlaybackService,
  ) {}

  get isActive(): boolean { return this._isActive; }

  registerElements(iframe: HTMLIFrameElement, livestream: HTMLVideoElement): void {
    this._iframe = iframe;
    this._livestreamPlayer = livestream;
    // ADR-103 Phase 2.5 — black background covers cross-origin white flash
    // during first paint.
    iframe.style.background = '#000';
    // ADR-103 Phase 2.6 — no opacity transition by default. We apply it
    // explicitly only when CLOSING (so the close fade-out is hidden behind
    // the freeze-frame at z-20). On SHOW we want the iframe to become
    // opaque INSTANTLY: a CSS opacity 0→1 transition on a layer beneath the
    // freeze-frame means that, the moment we hide the freeze, the half-opaque
    // iframe shows the MP4 player through itself for ~200ms — that's the
    // post-Phase 2.5 flash users reported.
    iframe.style.transition = 'none';
    livestream.style.transition = 'none';
  }

  showWebPage(payload: WebPagePayload): void {
    const iframe = this._iframe;
    if (!iframe) {
      console.warn('[WebContent] iframe not registered');
      return;
    }
    if (!/^https?:\/\//i.test(payload.url)) {
      console.warn('[WebContent] invalid URL', payload.url);
      return;
    }

    this.prepareShow('web_page', payload.url, payload.name);
    this.hideLivestream();

    console.log('[WebContent] showing web page', payload.url);

    const onLoad = (): void => {
      this.clearLoadTimeout();
      // ADR-103 Phase 2.7 — `load` fires when the sub-document has finished
      // loading, but cross-origin iframes may still need 2-3 paint cycles
      // for fonts/lazy images/layout shifts to settle. We force TWO rAF
      // ticks (≈33ms) before starting REVEAL_DELAY_MS so the delay starts
      // AFTER the iframe has put at least one stable frame on screen, not
      // mid-paint.
      this.clearRevealDelay();
      this.scheduleAfterTwoFrames(() => {
        this._revealDelayTimer = setTimeout(() => {
          this._revealDelayTimer = null;
          // Phase 2.6 — INSTANT show. Order is critical:
          //   1) iframe.opacity = 1 (no transition, full opaque under freeze).
          //   2) hideFreezeFrame: freeze opacity 0 — iframe fully visible at
          //      that instant, so the MP4 underneath is never exposed.
          iframe.style.transition = 'none';
          iframe.style.opacity = '1';
          iframe.style.pointerEvents = 'none';
          this.doubleBufferService.hideFreezeFrame();
          this.doubleBufferService.hideBlackOverlay();
          // Auto-close ONLY after the page actually loaded (counts visible
          // time, not load latency).
          if (payload.durationMs && payload.durationMs > 0) {
            this.clearAutoClose();
            this._autoCloseTimer = setTimeout(() => this.returnToLoop(true), payload.durationMs);
          }
        }, WebContentService.REVEAL_DELAY_MS);
      });
    };
    const onError = (): void => {
      console.warn('[WebContent] iframe load error', payload.url);
      this.failAndReturn('iframe error');
    };
    this._iframeOnLoad = onLoad;
    this._iframeOnError = onError;
    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onError);

    iframe.src = payload.url;

    // 1s timeout (Phase 1 tolerance criterion).
    this._loadTimeoutTimer = setTimeout(() => {
      console.warn('[WebContent] iframe load timeout after', WebContentService.LOAD_TIMEOUT_MS, 'ms', payload.url);
      this.failAndReturn('iframe load timeout');
    }, WebContentService.LOAD_TIMEOUT_MS);
  }

  showLivestream(payload: LivestreamPayload): void {
    const player = this._livestreamPlayer;
    if (!player) {
      console.warn('[WebContent] livestream player not registered');
      return;
    }
    if (!/^https?:\/\//i.test(payload.url)) {
      console.warn('[WebContent] invalid livestream URL', payload.url);
      return;
    }

    this.prepareShow('livestream', payload.url, payload.name);
    this.hideIframe();

    console.log('[WebContent] showing livestream', payload.url);
    player.muted = true;

    const onLoaded = (): void => {
      this.clearLoadTimeout();
      this.clearRevealDelay();
      // ADR-103 Phase 2.7 — same paint-stable wait as showWebPage.
      this.scheduleAfterTwoFrames(() => {
        this._revealDelayTimer = setTimeout(() => {
          this._revealDelayTimer = null;
          // Phase 2.6 — INSTANT show (cf. showWebPage above for rationale).
          player.style.transition = 'none';
          player.style.opacity = '1';
          this.doubleBufferService.hideFreezeFrame();
          this.doubleBufferService.hideBlackOverlay();
          if (payload.durationMs && payload.durationMs > 0) {
            this.clearAutoClose();
            this._autoCloseTimer = setTimeout(() => this.returnToLoop(true), payload.durationMs);
          }
        }, WebContentService.REVEAL_DELAY_MS);
      });
    };
    const onEnded = (): void => this.returnToLoop(true);
    const onError = (e: Event): void => {
      console.error('[WebContent] livestream error', e);
      this.failAndReturn('livestream error');
    };
    player.addEventListener('loadeddata', onLoaded, { once: true });
    player.addEventListener('ended', onEnded, { once: true });
    player.addEventListener('error', onError, { once: true });
    this._livestreamCleanup = () => {
      player.removeEventListener('loadeddata', onLoaded);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('error', onError);
      // Phase 1.5 — destroy the hls.js instance attached to this play, if any.
      if (this._hlsInstance) {
        try { this._hlsInstance.destroy(); } catch { /* noop */ }
        this._hlsInstance = null;
      }
    };

    this._loadTimeoutTimer = setTimeout(() => {
      console.warn('[WebContent] livestream load timeout after', WebContentService.LOAD_TIMEOUT_MS, 'ms', payload.url);
      this.failAndReturn('livestream load timeout');
    }, WebContentService.LOAD_TIMEOUT_MS);

    // ADR-103 Phase 1.5 — pick the right loader for the source:
    //   - .m3u8 with native browser support (Safari + iOS) → set src directly.
    //   - .m3u8 without native support (Chromium kiosk, Firefox) → lazy-load
    //     hls.js and attach it to the player. hls.js fires its own error
    //     events that we route to failAndReturn.
    //   - non-HLS (mp4, webm, etc.) → set src directly, native HTML5 path.
    const isHls = /\.m3u8(\?|$|#)/i.test(payload.url);
    const nativeHls = player.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (isHls && !nativeHls) {
      void this.attachHlsAndPlay(player, payload.url);
    } else {
      player.src = payload.url;
      player.load();
      player.play().catch((err) => {
        console.error('[WebContent] livestream play() rejected', err);
        this.failAndReturn('livestream play rejected');
      });
    }
  }

  /**
   * ADR-103 Phase 1.5 — lazy-load hls.js and attach it to the livestream
   * player. Lazy import keeps hls.js out of the main bundle (~500KB) so a
   * site that never plays a livestream never downloads it.
   */
  private async attachHlsAndPlay(player: HTMLVideoElement, url: string): Promise<void> {
    let HlsCtor: typeof import('hls.js').default | null = null;
    try {
      const mod = await import('hls.js');
      HlsCtor = mod.default ?? null;
    } catch (err) {
      console.error('[WebContent] failed to load hls.js dynamically', err);
      this.failAndReturn('hls.js dynamic import failed');
      return;
    }

    if (!HlsCtor || !HlsCtor.isSupported()) {
      console.error('[WebContent] hls.js not supported on this platform');
      this.failAndReturn('hls.js not supported');
      return;
    }

    // If we were torn down between import() resolution and now, abort.
    if (!this._isActive || this._livestreamPlayer !== player) {
      console.log('[WebContent] hls.js attach aborted — service no longer active');
      return;
    }

    // Destroy any previous instance defensively (should be cleared by teardown).
    if (this._hlsInstance) {
      try { this._hlsInstance.destroy(); } catch { /* noop */ }
      this._hlsInstance = null;
    }

    const hls = new HlsCtor({
      // Conservative defaults; we don't want hls.js to enable controls or
      // mess with mute. Auto-quality based on first available level.
      enableWorker: true,
      // Treat manifest fetch errors as fatal so we hit failAndReturn fast.
      manifestLoadingTimeOut: 5000,
      manifestLoadingMaxRetry: 1,
    });
    this._hlsInstance = hls;
    hls.on(HlsCtor.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        console.error('[WebContent] hls.js fatal error', data);
        this.failAndReturn('hls.js fatal error');
      }
    });
    hls.loadSource(url);
    hls.attachMedia(player);
    // The MEDIA_ATTACHED event flow gives us a chance to start playback.
    hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      player.play().catch((err) => {
        console.error('[WebContent] livestream play() rejected (post-hls)', err);
        this.failAndReturn('livestream play rejected (post-hls)');
      });
    });
  }

  /**
   * Public return-to-loop handler.
   *   - completed=true  → entry played its full duration (auto-close fired).
   *   - completed=false → manual stop / navigation. Default.
   *
   * ADR-103 Phase 2b — when `_loopOnComplete` is set (i.e. we were
   * playing as a STEP of the loop), invoke that callback (which advances
   * the loop) instead of `resumeRotation()` (which restarts the loop at
   * savedIndex+1, useful only for the manual mode of Phase 1/2.5).
   */
  returnToLoop(completed = false): void {
    if (!this._isActive) return;
    console.log('[WebContent] returning to loop', { completed, loopMode: !!this._loopOnComplete });
    this.endAnalytics(completed, completed ? undefined : 'manual_action');
    const onComplete = this._loopOnComplete;
    this.teardown();  // teardown clears _loopOnComplete
    if (onComplete) {
      onComplete();
    } else {
      this.resumeRotation();
    }
  }

  /** Internal: terminate with `web_load_failed` analytics + skip. */
  private failAndReturn(reason: string): void {
    if (!this._isActive) return;
    console.warn('[WebContent] failAndReturn:', reason);
    this.endAnalytics(false, 'web_load_failed');
    const onComplete = this._loopOnComplete;
    this.teardown();
    if (onComplete) {
      // Loop mode: skip this step, advance to next.
      onComplete();
    } else {
      // Manual mode: restart loop.
      this.resumeRotation();
    }
  }

  /**
   * ADR-103 Phase 2b — play a web/live entry as a STEP of the boucle.
   * Used by the orchestrator (`video-playback.service`) when a loop
   * playlist step has `contentType !== 'video'`. The `onComplete`
   * callback is invoked when:
   *   - the entry's `durationMs` elapsed (success), OR
   *   - the load timed out / errored (skip step).
   * The orchestrator typically advances to the next loop step.
   *
   * Differences with `showWebPage` / `showLivestream` (manual mode):
   *   - returnToLoop() / failAndReturn() call onComplete instead of
   *     resumeRotation() (which would restart the loop fresh at
   *     savedIndex+1 — fine for manual, wrong for in-loop where the
   *     orchestrator already knows how to advance).
   *   - durationMs is REQUIRED (Phase 2 backend validation should
   *     guarantee it for entries placed in sponsors[]/loopVideos/etc).
   */
  playInLoop(
    entry: { contentType?: string; path?: string; externalUrl?: string; name?: string; durationSeconds?: number | null },
    onComplete: () => void,
  ): void {
    const contentType = entry?.contentType === 'livestream' ? 'livestream' : 'web_page';
    const url = (entry?.externalUrl || entry?.path || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      console.warn('[WebContent] playInLoop: invalid URL — skipping step', url);
      onComplete();
      return;
    }
    const durationMs = entry?.durationSeconds && entry.durationSeconds > 0
      ? entry.durationSeconds * 1000
      : 30000; // safe fallback so the loop never gets stuck on an entry without duration

    this._loopOnComplete = onComplete;
    if (contentType === 'web_page') {
      this.showWebPage({ url, durationMs, name: entry?.name });
    } else {
      this.showLivestream({ url, mimeType: null, durationMs, name: entry?.name });
    }
  }

  private resumeRotation(): void {
    const activeLoopPlayer = this.doubleBufferService.getActivePlayer();
    if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.playbackService.isLoopMode) {
      // Loop wasn't running (came from manual, or first boot). Restart at
      // savedLoopIndex + 1 — ADR-103 Phase 2.5 invariant: web/live retour
      // toujours au step SUIVANT, jamais le step où on était (ni manual, ni
      // la même web/live).
      const resumeAt = this._savedLoopIndex + 1;
      this.doubleBufferService.captureAndShowFreezeFrame();
      this.doubleBufferService.resetSwitchState();
      this.playbackService.startSeamlessLoop(resumeAt);
    } else {
      // Loop kept advancing under the iframe (Phase 2.5 — no pause). Just
      // hide the freeze frame and let it continue from where it advanced.
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
    }
  }

  private prepareShow(
    contentType: 'web_page' | 'livestream',
    url: string,
    name?: string,
  ): void {
    // If web/live was already active, end it cleanly before starting new.
    if (this._isActive) {
      this.endAnalytics(false, 'manual_action');
      this.teardown();
    }

    // ADR-103 Phase 2.5 — clear active manual MP4 (if any) so the return
    // goes to LOOP, not back to the manual. We don't call
    // manualVideoService.stopAndReturnToLoop() because that would restart
    // the loop, fighting our take-over. We just hide the manual players
    // and reset the flag.
    this.clearActiveManualVideoIfAny();

    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this._isActive = true;

    // Synthetic analytics entry — content_type + external_url.
    this._currentAnalyticsVideo = {
      name: name ?? url,
      type: contentType === 'web_page' ? 'text/html' : 'application/vnd.apple.mpegurl',
      path: url,
      contentType,
      externalUrl: url,
    };
    this.analytics.trackVideoStart(this._currentAnalyticsVideo, 'manual');

    const freezeOk = this.doubleBufferService.captureAndShowFreezeFrame(false);
    if (!freezeOk) {
      this.doubleBufferService.showBlackOverlay();
    }
  }

  /**
   * ADR-103 Phase 2.5 — when web/live takes over from a manual MP4, hide
   * the manual players and reset the flag so the return-to-loop goes to
   * the LOOP, never back to the manual. Idempotent: no-op when no manual
   * is active.
   */
  private clearActiveManualVideoIfAny(): void {
    if (!this.manualVideoService.isManualMode) return;
    console.log('[WebContent] clearing active manual MP4 to take over');
    const a = this.doubleBufferService.getActiveManualPlayer();
    const b = this.doubleBufferService.getInactiveManualPlayer();
    [a, b].forEach((player) => {
      if (!player) return;
      try { player.pause(); } catch { /* noop */ }
      player.style.opacity = '0';
      player.removeAttribute('src');
      try { player.load(); } catch { /* noop */ }
    });
    this.manualVideoService.isManualMode = false;
  }

  private endAnalytics(
    completed: boolean,
    interruptionReason?: 'manual_action' | 'web_load_failed',
  ): void {
    if (!this._currentAnalyticsVideo) return;
    this.analytics.trackVideoEnd(completed, interruptionReason);
    this._currentAnalyticsVideo = null;
  }

  private teardown(): void {
    this.clearAutoClose();
    this.clearLoadTimeout();
    this.clearRevealDelay();
    this.detachIframeListeners();
    this.detachLivestreamListeners();
    // ADR-103 Phase 1.5 — defensive hls.js cleanup in case the cleanup
    // closure wasn't installed (early failure path between import resolution
    // and listener attach).
    if (this._hlsInstance) {
      try { this._hlsInstance.destroy(); } catch { /* noop */ }
      this._hlsInstance = null;
    }
    // ADR-103 Phase 2.5 — capture a freeze of the underlying loop player
    // BEFORE clearing the iframe / livestream so the close transition has
    // a frame to fade into instead of a brief blank gap.
    this.doubleBufferService.captureAndShowFreezeFrame(false);
    this.hideIframe();
    this.hideLivestream();
    this._isActive = false;
    // ADR-103 Phase 2b — clear loop callback so a subsequent manual show
    // doesn't accidentally inherit the in-loop completion behavior.
    this._loopOnComplete = null;
  }

  private detachIframeListeners(): void {
    const iframe = this._iframe;
    if (!iframe) return;
    if (this._iframeOnLoad) iframe.removeEventListener('load', this._iframeOnLoad);
    if (this._iframeOnError) iframe.removeEventListener('error', this._iframeOnError);
    this._iframeOnLoad = null;
    this._iframeOnError = null;
  }

  private detachLivestreamListeners(): void {
    if (this._livestreamCleanup) {
      this._livestreamCleanup();
      this._livestreamCleanup = null;
    }
  }

  private hideIframe(): void {
    const iframe = this._iframe;
    if (!iframe) return;
    // ADR-103 Phase 2.6 — close path:
    //   1. teardown() captures a freeze frame of the loop player at z-20
    //      BEFORE this method runs (covers the iframe).
    //   2. We can therefore clear the iframe instantly — the freeze hides
    //      the transition. No animated fade-out needed because the user
    //      never sees the iframe disappear (freeze is on top).
    iframe.style.transition = 'none';
    iframe.style.opacity = '0';
    iframe.src = 'about:blank';
  }

  private hideLivestream(): void {
    const player = this._livestreamPlayer;
    if (!player) return;
    // ADR-103 Phase 2.6 — close path: freeze frame captured by teardown
    // covers the player at z-20, so we can teardown instantly.
    player.style.transition = 'none';
    player.style.opacity = '0';
    try { player.pause(); } catch { /* noop */ }
    player.removeAttribute('src');
    try { player.load(); } catch { /* noop */ }
  }

  private clearAutoClose(): void {
    if (this._autoCloseTimer) {
      clearTimeout(this._autoCloseTimer);
      this._autoCloseTimer = null;
    }
  }

  private clearLoadTimeout(): void {
    if (this._loadTimeoutTimer) {
      clearTimeout(this._loadTimeoutTimer);
      this._loadTimeoutTimer = null;
    }
  }

  /**
   * ADR-103 Phase 2.7 — schedule `cb` after two `requestAnimationFrame`
   * ticks have elapsed. The double rAF guarantees that the browser has
   * committed at least one paint cycle since the caller (typical pattern
   * for "wait until the previous DOM mutation is rendered"). Falls back
   * to setTimeout in environments without rAF (server, tests).
   */
  private scheduleAfterTwoFrames(cb: () => void): void {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(cb, 32);
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => cb());
    });
  }

  private clearRevealDelay(): void {
    if (this._revealDelayTimer) {
      clearTimeout(this._revealDelayTimer);
      this._revealDelayTimer = null;
    }
  }
}
