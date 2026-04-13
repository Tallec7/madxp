import { inject, Injectable } from '@angular/core';
import { TemplateRendererService } from './template-renderer.service';
import { VideoCompositorService } from './video-compositor.service';
import { VideoEncoderService } from './video-encoder.service';

export type { OverlayConfig, RenderProgress, OverlayElement, TextElement, ImageElement } from './template-renderer.service';

import type { OverlayConfig, RenderProgress } from './template-renderer.service';
import { environment } from '../../../environments/environment';

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

  /**
   * Render a standalone template (no source video).
   * Loads layered WebM videos from API, composites on canvas with text, returns WebM Blob.
   */
  async renderStandalone(
    config: OverlayConfig,
    assets: Record<string, string>,
    onProgress?: (p: RenderProgress) => void,
  ): Promise<Blob> {
    onProgress?.({ phase: 'loading', progress: 0 });

    await this.encoder.ensureFontsLoaded();

    // Load all 3 video layers
    const loadVideo = (url: string): Promise<HTMLVideoElement> => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.src = url;
      return new Promise((resolve, reject) => {
        v.onloadeddata = () => resolve(v);
        v.onerror = () => reject(new Error(`Failed to load video: ${url}`));
      });
    };

    // Assets URLs are relative (e.g. /api/template-assets/...), prefix with API origin
    const apiOrigin = environment.apiUrl.replace(/\/api$/, '');
    const apiBase = assets['layerA'].startsWith('http') ? '' : apiOrigin;

    const [videoA, videoB, videoC] = await Promise.all([
      loadVideo(apiBase + assets['layerA']),
      loadVideo(apiBase + assets['layerB']),
      loadVideo(apiBase + assets['layerC']),
    ]);

    onProgress?.({ phase: 'loading', progress: 50 });

    // Load logo if provided
    let logoImg: HTMLImageElement | null = null;
    const logoDataUri = config.variables['_image_logo'];
    if (logoDataUri) {
      logoImg = new Image();
      logoImg.src = logoDataUri;
      await new Promise<void>((resolve) => {
        logoImg!.onload = () => resolve();
        logoImg!.onerror = () => { logoImg = null; resolve(); };
      });
    }

    onProgress?.({ phase: 'loading', progress: 75 });

    const W = 1920, H = 1080;
    const DURATION = videoA.duration || 6;
    const LOGO_HIDE_S = 1.6;
    const TEXT_SHOW_S = 2.4;

    const vars = config.variables;
    const prenom = (vars['prenom'] || 'PRENOM').toUpperCase();
    const nom = (vars['nom'] || 'NOM').toUpperCase();
    const club = (vars['club'] || 'NOM DU CLUB').toUpperCase();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const { recorder, stopPromise } = this.encoder.encode(canvas);

    onProgress?.({ phase: 'rendering', progress: 0 });

    return new Promise<Blob>((resolve, reject) => {
      stopPromise.then((blob) => {
        onProgress?.({ phase: 'done', progress: 100 });
        resolve(blob);
      }).catch(reject);

      const drawFrame = (): void => {
        if (videoA.ended || videoA.paused) {
          // Draw final frame
          ctx.globalAlpha = 1;
          ctx.drawImage(videoA, 0, 0, W, H);
          ctx.drawImage(videoC, 0, 0, W, H);
          ctx.drawImage(videoB, 0, 0, W, H);
          this.drawStandaloneText(ctx, W, H, prenom, nom, club, DURATION, TEXT_SHOW_S);
          setTimeout(() => {
            try { recorder.requestData(); } catch { /* noop */ }
            setTimeout(() => recorder.stop(), 150);
          }, 200);
          return;
        }

        const t = videoA.currentTime;
        const progress = Math.round((t / DURATION) * 100);
        onProgress?.({ phase: 'rendering', progress: Math.min(progress, 95) });

        // Draw layers
        ctx.globalAlpha = 1;
        ctx.drawImage(videoA, 0, 0, W, H);
        ctx.drawImage(videoC, 0, 0, W, H);
        ctx.drawImage(videoB, 0, 0, W, H);

        // Draw logo
        if (t < LOGO_HIDE_S && logoImg) {
          const lw = 500, lh = logoImg.naturalHeight * (500 / logoImg.naturalWidth);
          const lx = (W - lw) / 2, ly = (H - lh) / 2;
          let la = 1;
          if (t < 0.6) la = t / 0.6;
          else if (t > LOGO_HIDE_S - 0.4) la = (LOGO_HIDE_S - t) / 0.4;
          ctx.globalAlpha = Math.max(0, Math.min(1, la));
          ctx.drawImage(logoImg, lx, ly, lw, lh);
          ctx.globalAlpha = 1;
        }

        // Draw text
        this.drawStandaloneText(ctx, W, H, prenom, nom, club, t, TEXT_SHOW_S);

        requestAnimationFrame(drawFrame);
      };

      Promise.all([videoA.play(), videoB.play(), videoC.play()]).then(() => {
        requestAnimationFrame(drawFrame);
      }).catch(reject);
    });
  }

  private drawStandaloneText(
    ctx: CanvasRenderingContext2D,
    W: number, H: number,
    prenom: string, nom: string, club: string,
    t: number, TEXT_SHOW_S: number,
  ): void {
    if (t < TEXT_SHOW_S) return;

    const alpha = Math.min((t - TEXT_SHOW_S) / 0.3, 1);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    // Club top
    ctx.font = "500 28px 'Oswald', 'Bebas Neue', 'Impact', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(club, W / 2, 245);

    // Prenom + Nom
    ctx.font = "italic 700 130px 'Oswald', 'Bebas Neue', 'Impact', sans-serif";
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.fillText(prenom, W / 2, 490);
    ctx.fillText(nom, W / 2, 620);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Club bottom
    ctx.font = "500 28px 'Oswald', 'Bebas Neue', 'Impact', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(club, W / 2, 890);

    ctx.globalAlpha = 1;
  }
}
