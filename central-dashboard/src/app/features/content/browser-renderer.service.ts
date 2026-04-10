import { inject, Injectable } from '@angular/core';
import { TemplateRendererService } from './template-renderer.service';
import { VideoCompositorService } from './video-compositor.service';
import { VideoEncoderService } from './video-encoder.service';

export type { OverlayConfig, RenderProgress, OverlayElement, TextElement, ImageElement } from './template-renderer.service';

import type { OverlayConfig, RenderProgress } from './template-renderer.service';

/**
 * Browser-side video renderer.
 *
 * Composites animated text overlays on top of a source MP4 video
 * entirely in the browser (Canvas + MediaRecorder). No server rendering needed.
 *
 * Pipeline:
 *   1. Play source video on hidden <video> element
 *   2. Each frame: draw video + overlay text on <canvas>
 *   3. MediaRecorder captures the canvas stream as WebM
 *   4. Returns a Blob ready for upload
 */

@Injectable({ providedIn: 'root' })
export class BrowserRendererService {

  private readonly templateRenderer = inject(TemplateRendererService);
  private readonly compositor = inject(VideoCompositorService);
  private readonly encoder = inject(VideoEncoderService);

  /**
   * Render overlay on video entirely in the browser.
   * Returns a WebM Blob ready for upload.
   */
  async render(
    videoFile: File,
    config: OverlayConfig,
    onProgress?: (p: RenderProgress) => void
  ): Promise<Blob> {
    if (!this.templateRenderer.hasTemplate(config.templateId)) {
      throw new Error(`Unknown template: ${config.templateId}`);
    }

    onProgress?.({ phase: 'loading', progress: 0 });

    await this.encoder.ensureFontsLoaded();

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const duration = video.duration;

    onProgress?.({ phase: 'loading', progress: 50 });

    const elements = this.templateRenderer.buildElements(config.templateId, config.variables, duration);
    const imageCache = await this.compositor.preloadImages(elements);

    onProgress?.({ phase: 'loading', progress: 75 });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const { recorder, stopPromise } = this.encoder.encode(canvas);

    onProgress?.({ phase: 'rendering', progress: 0 });

    return new Promise<Blob>((resolve, reject) => {
      const originalStopPromise = stopPromise;
      originalStopPromise.then((blob) => {
        URL.revokeObjectURL(videoUrl);
        onProgress?.({ phase: 'encoding', progress: 90 });
        onProgress?.({ phase: 'done', progress: 100 });
        resolve(blob);
      }).catch((err) => {
        URL.revokeObjectURL(videoUrl);
        reject(err);
      });

      const drawFrame = (): void => {
        if (video.ended || video.paused) {
          ctx.drawImage(video, 0, 0, width, height);
          this.compositor.drawFrame(ctx, elements, imageCache, duration, width, height);
          setTimeout(() => {
            try { recorder.requestData(); } catch { /* noop */ }
            setTimeout(() => recorder.stop(), 150);
          }, 200);
          return;
        }

        const currentTime = video.currentTime;
        const progress = Math.round((currentTime / duration) * 100);
        onProgress?.({ phase: 'rendering', progress: Math.min(progress, 95) });

        ctx.drawImage(video, 0, 0, width, height);
        this.compositor.drawFrame(ctx, elements, imageCache, currentTime, width, height);

        requestAnimationFrame(drawFrame);
      };

      video.play().then(() => {
        requestAnimationFrame(drawFrame);
      }).catch(reject);
    });
  }
}
