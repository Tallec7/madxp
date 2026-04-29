import { Injectable, inject } from '@angular/core';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { AnalyticsService } from './analytics.service';
import { WebPagePayload, LivestreamPayload } from '../interfaces/command.interface';
import { PiConfigVideoEntry } from '../interfaces/video.interface';

/**
 * ADR-089 / ADR-103 Phase 1 — Web page & livestream player.
 *
 * Robust manual playback for `web_page` and `livestream` entries, isolated
 * from the DoubleBuffer MP4 pipeline so a misbehaving iframe or HLS stream
 * cannot drag the rotation down.
 *
 * Phase 1 hardening:
 *   - 1s load-timeout: if the iframe / livestream does not signal `load`
 *     (resp. `loadeddata`) within `LOAD_TIMEOUT_MS`, skip immediately and
 *     resume the rotation (US tolerance criterion).
 *   - Analytics: each play tracked via AnalyticsService with
 *     contentType + external_url. Failures recorded as
 *     interruption_reason='web_load_failed'.
 *   - Layered cleanup: every show() registers exactly one timer pair and
 *     one set of listeners; switching to another entry or returning to
 *     the loop clears them deterministically.
 *   - Null-safe registration: showWebPage/showLivestream are no-ops if
 *     `registerElements()` was not called yet (defensive — TV component
 *     calls it in ngAfterViewInit).
 */
@Injectable({ providedIn: 'root' })
export class WebContentService {
  /** Skip after this delay if the iframe / livestream did not signal "ready". */
  static readonly LOAD_TIMEOUT_MS = 1000;

  private readonly analytics = inject(AnalyticsService);

  private _iframe: HTMLIFrameElement | null = null;
  private _livestreamPlayer: HTMLVideoElement | null = null;
  private _isActive = false;
  private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _savedLoopIndex = 0;
  private _iframeOnLoad: (() => void) | null = null;
  private _iframeOnError: (() => void) | null = null;
  private _livestreamCleanup: (() => void) | null = null;
  private _currentAnalyticsVideo: PiConfigVideoEntry | null = null;

  constructor(
    private readonly doubleBufferService: DoubleBufferVideoService,
    private readonly playbackService: VideoPlaybackService,
  ) {}

  get isActive(): boolean { return this._isActive; }

  registerElements(iframe: HTMLIFrameElement, livestream: HTMLVideoElement): void {
    this._iframe = iframe;
    this._livestreamPlayer = livestream;
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

    // Listeners attached BEFORE setting src so we don't miss the load event.
    const onLoad = (): void => {
      this.clearLoadTimeout();
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'none';
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
      // Schedule auto-close ONLY after the page actually loaded so durationMs
      // counts visible time, not load latency.
      if (payload.durationMs && payload.durationMs > 0) {
        this.clearAutoClose();
        this._autoCloseTimer = setTimeout(() => this.returnToLoop(true), payload.durationMs);
      }
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

    // 1s timeout — Phase 1 tolerance criterion. If the page does not fire
    // `load` (X-Frame-Options DENY, network slow, frame-ancestors blocked,
    // unreachable URL), skip without ever showing a blank frame.
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
    player.src = payload.url;
    player.muted = true;
    player.load();

    const onLoaded = (): void => {
      this.clearLoadTimeout();
      player.style.opacity = '1';
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
      // Auto-close after the configured duration if provided (livestreams
      // are typically infinite — durationMs caps them).
      if (payload.durationMs && payload.durationMs > 0) {
        this.clearAutoClose();
        this._autoCloseTimer = setTimeout(() => this.returnToLoop(true), payload.durationMs);
      }
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
    };

    // 1s timeout for play() + first frame. Same tolerance criterion as web pages.
    this._loadTimeoutTimer = setTimeout(() => {
      console.warn('[WebContent] livestream load timeout after', WebContentService.LOAD_TIMEOUT_MS, 'ms', payload.url);
      this.failAndReturn('livestream load timeout');
    }, WebContentService.LOAD_TIMEOUT_MS);

    player.play().catch((err) => {
      console.error('[WebContent] livestream play() rejected', err);
      this.failAndReturn('livestream play rejected');
    });
  }

  /**
   * Public return-to-loop handler.
   *   - completed=true  → entry played its full duration (auto-close fired).
   *   - completed=false → manual stop / navigation. Default.
   */
  returnToLoop(completed = false): void {
    if (!this._isActive) return;
    console.log('[WebContent] returning to loop', { completed });
    this.endAnalytics(completed, completed ? undefined : 'manual_action');
    this.teardown();
    this.resumeRotation();
  }

  /** Internal: terminate with `web_load_failed` analytics + skip. */
  private failAndReturn(reason: string): void {
    if (!this._isActive) return;
    console.warn('[WebContent] failAndReturn:', reason);
    this.endAnalytics(false, 'web_load_failed');
    this.teardown();
    this.resumeRotation();
  }

  private resumeRotation(): void {
    const activeLoopPlayer = this.doubleBufferService.getActivePlayer();
    if (!activeLoopPlayer || activeLoopPlayer.paused || activeLoopPlayer.ended || !this.playbackService.isLoopMode) {
      const resumeAt = this._savedLoopIndex + 1;
      this.doubleBufferService.captureAndShowFreezeFrame();
      this.doubleBufferService.resetSwitchState();
      this.playbackService.startSeamlessLoop(resumeAt);
    } else {
      this.doubleBufferService.hideFreezeFrame();
      this.doubleBufferService.hideBlackOverlay();
    }
  }

  private prepareShow(
    contentType: 'web_page' | 'livestream',
    url: string,
    name?: string,
  ): void {
    // If something else was active, end it cleanly before starting a new one.
    if (this._isActive) {
      this.endAnalytics(false, 'manual_action');
      this.teardown();
    }

    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this._isActive = true;

    // Synthetic analytics entry — content_type + external_url so the
    // server-side aggregator can group by web vs live vs video.
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
    this.detachIframeListeners();
    this.detachLivestreamListeners();
    this.hideIframe();
    this.hideLivestream();
    this._isActive = false;
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
    if (!this._iframe) return;
    this._iframe.style.opacity = '0';
    this._iframe.src = 'about:blank';
  }

  private hideLivestream(): void {
    const player = this._livestreamPlayer;
    if (!player) return;
    player.style.opacity = '0';
    player.pause();
    player.removeAttribute('src');
    player.load();
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
}
