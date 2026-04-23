import { Injectable } from '@angular/core';
import { DoubleBufferVideoService } from './double-buffer-video.service';
import { VideoPlaybackService } from './video-playback.service';
import { WebPagePayload, LivestreamPayload } from '../interfaces/command.interface';

/**
 * ADR-088 — Contenus manuels web_page / livestream.
 * Même layer z-index que la vidéo manuelle (10), même mécanisme de return-to-loop.
 */
@Injectable({ providedIn: 'root' })
export class WebContentService {
  private _iframe: HTMLIFrameElement | null = null;
  private _livestreamPlayer: HTMLVideoElement | null = null;
  private _isActive = false;
  private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _savedLoopIndex = 0;

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
    if (!this._iframe) {
      console.warn('[WebContent] iframe not registered');
      return;
    }
    if (!/^https?:\/\//i.test(payload.url)) {
      console.warn('[WebContent] invalid URL', payload.url);
      return;
    }

    this.prepareShow();
    this.hideLivestream();

    console.log('[WebContent] showing web page', payload.url);
    this._iframe.src = payload.url;
    this._iframe.style.opacity = '1';
    this._iframe.style.pointerEvents = 'none';

    this.doubleBufferService.hideFreezeFrame();
    this.doubleBufferService.hideBlackOverlay();

    if (payload.durationMs && payload.durationMs > 0) {
      this._autoCloseTimer = setTimeout(() => this.returnToLoop(), payload.durationMs);
    }
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

    this.prepareShow();
    this.hideIframe();

    console.log('[WebContent] showing livestream', payload.url);
    player.src = payload.url;
    player.muted = true;
    player.load();

    const onEnded = () => {
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('error', onError);
      this.returnToLoop();
    };
    const onError = (e: Event) => {
      console.error('[WebContent] livestream error', e);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('error', onError);
      this.returnToLoop();
    };
    player.addEventListener('ended', onEnded, { once: true });
    player.addEventListener('error', onError, { once: true });

    player.play()
      .then(() => { player.style.opacity = '1'; })
      .catch((err) => {
        console.error('[WebContent] livestream play failed', err);
        this.returnToLoop();
      });
  }

  returnToLoop(): void {
    if (!this._isActive) return;
    console.log('[WebContent] returning to loop');
    this.clearAutoClose();
    this.hideIframe();
    this.hideLivestream();
    this._isActive = false;

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

  private prepareShow(): void {
    this._savedLoopIndex = this.playbackService.currentLoopIndex;
    this.clearAutoClose();
    this._isActive = true;

    const freezeOk = this.doubleBufferService.captureAndShowFreezeFrame(false);
    if (!freezeOk) {
      this.doubleBufferService.showBlackOverlay();
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
}
