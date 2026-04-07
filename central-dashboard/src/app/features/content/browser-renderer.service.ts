import { Injectable } from '@angular/core';

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

// ── Types ─────────────────────────────────────────────────────────────────

export interface OverlayConfig {
  templateId: string;
  variables: Record<string, string>;
}

export interface RenderProgress {
  phase: 'loading' | 'rendering' | 'encoding' | 'done';
  progress: number; // 0-100
}

interface TextElement {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: string;
  fontFamily?: string;
  letterSpacing?: number; // px between chars (rendered char-by-char when set)
  color: string;
  align: CanvasTextAlign;
  /** Animation: [startTime, endTime] in seconds for fade-in */
  fadeIn: [number, number];
  /** Animation: [startTime, endTime] for fade-out */
  fadeOut: [number, number];
  /** Vertical slide offset in pixels (slides up from this offset) */
  slideFromY?: number;
  /** Scale animation: [startScale, endScale] during fadeIn */
  scaleAnim?: [number, number];
  /** Optional text shadow */
  shadow?: { blur: number; color: string };
}

// ── Template definitions ──────────────────────────────────────────────────

function buildPlayerElements(vars: Record<string, string>, duration: number): TextElement[] {
  const nom = (vars['nom'] || 'NOM').toUpperCase();
  const prenom = (vars['prenom'] || 'PRÉNOM').toUpperCase();
  const club = (vars['club'] || 'NOM DU CLUB').toUpperCase();
  const fadeOutStart = Math.max(duration - 0.6, 1.5);

  // Ultra-condensed display font stack
  const displayFont = "'Bebas Neue', 'Anton', 'Oswald', 'Barlow Condensed', 'Impact', sans-serif";
  const surtitleFont = "'Barlow Condensed', 'Oswald', 'Inter', sans-serif";

  const elements: TextElement[] = [];

  // Club name TOP — small, very wide letter-spacing, light weight
  elements.push({
    text: club,
    x: 960, y: 145,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 15,
  });

  // PRÉNOM huge — ultra-condensed, ultra-bold, tight to NOM
  elements.push({
    text: prenom,
    x: 960, y: 460,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [0.3, 0.9], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 30,
    scaleAnim: [1.05, 1],
  });

  // NOM huge — same style, glued under PRÉNOM (line-height ~0.85)
  elements.push({
    text: nom,
    x: 960, y: 700,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [0.45, 1.05], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 30,
    scaleAnim: [1.05, 1],
  });

  // Club name BOTTOM — symmetric mirror of TOP
  elements.push({
    text: club,
    x: 960, y: 945,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [0.6, 1.1], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 15,
  });

  return elements;
}

function buildScorePlusElements(vars: Record<string, string>, duration: number): TextElement[] {
  const score = vars['score'] || '+1';
  const nom = vars['nom'] || '';
  const club = vars['club'] || '';
  const color = vars['color'] || '#FF3333';
  const fadeOutStart = Math.max(duration - 0.8, 1.5);

  const elements: TextElement[] = [];

  if (club) {
    elements.push({
      text: club.toUpperCase(),
      x: 960, y: 280,
      fontSize: 48, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.15, 0.65], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  elements.push({
    text: score,
    x: 960, y: 500,
    fontSize: 320, fontWeight: '900', color, align: 'center',
    fadeIn: [0, 0.4], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
    scaleAnim: [1.6, 1],
    shadow: { blur: 80, color: color + '66' },
  });

  if (nom) {
    elements.push({
      text: nom.toUpperCase(),
      x: 960, y: 650,
      fontSize: 80, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.3, 0.8], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  return elements;
}

function buildButeurElements(vars: Record<string, string>, duration: number): TextElement[] {
  const nom = vars['nom'] || '';
  const numero = vars['numero'] || '';
  const club = vars['club'] || '';
  const fadeOutStart = Math.max(duration - 1, 2);

  const elements: TextElement[] = [];

  if (club) {
    elements.push({
      text: club.toUpperCase(),
      x: 960, y: 200,
      fontSize: 50, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  elements.push({
    text: 'BUUUUT !',
    x: 960, y: 380,
    fontSize: 140, fontWeight: '900', color: '#FF3344', align: 'center',
    fadeIn: [0, 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
    scaleAnim: [1.8, 1],
    shadow: { blur: 60, color: 'rgba(255,50,70,0.5)' },
  });

  if (numero) {
    elements.push({
      text: `#${numero}`,
      x: 960, y: 560,
      fontSize: 220, fontWeight: '900', color: '#FFFFFF', align: 'center',
      fadeIn: [0.4, 0.9], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      scaleAnim: [1.5, 1],
    });
  }

  if (nom) {
    elements.push({
      text: nom.toUpperCase(),
      x: 960, y: 700,
      fontSize: 90, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.7, 1.2], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  return elements;
}

const TEMPLATE_BUILDERS: Record<string, (vars: Record<string, string>, duration: number) => TextElement[]> = {
  tpl_player: buildPlayerElements,
  tpl_score_plus: buildScorePlusElements,
  tpl_buteur: buildButeurElements,
};

// ── Service ───────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BrowserRendererService {

  /**
   * Render overlay on video entirely in the browser.
   * Returns a WebM Blob ready for upload.
   */
  async render(
    videoFile: File,
    config: OverlayConfig,
    onProgress?: (p: RenderProgress) => void
  ): Promise<Blob> {
    const builder = TEMPLATE_BUILDERS[config.templateId];
    if (!builder) {
      throw new Error(`Unknown template: ${config.templateId}`);
    }

    onProgress?.({ phase: 'loading', progress: 0 });

    // 0. Ensure display fonts are loaded (Bebas Neue + Barlow Condensed)
    await this.ensureFontsLoaded();

    // 1. Load video into a hidden <video> element
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

    // 2. Build overlay elements
    const elements = builder(config.variables, duration);

    // 3. Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 4. Setup MediaRecorder on canvas stream
    const stream = canvas.captureStream(30); // 30fps
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000, // 8 Mbps for good quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    onProgress?.({ phase: 'rendering', progress: 0 });

    // 5. Play video and draw each frame
    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        URL.revokeObjectURL(videoUrl);
        onProgress?.({ phase: 'encoding', progress: 90 });

        const blob = new Blob(chunks, { type: mimeType });
        onProgress?.({ phase: 'done', progress: 100 });
        resolve(blob);
      };

      recorder.onerror = (_e) => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error('MediaRecorder error'));
      };

      recorder.start(100); // collect data every 100ms

      const drawFrame = (): void => {
        if (video.ended || video.paused) {
          // Draw a few extra frames of the last video frame so MediaRecorder
          // flushes the final chunks (otherwise the WebM is truncated by ~200ms)
          ctx.drawImage(video, 0, 0, width, height);
          this.drawOverlay(ctx, elements, duration, width, height);
          setTimeout(() => {
            try { recorder.requestData(); } catch { /* noop */ }
            setTimeout(() => recorder.stop(), 150);
          }, 200);
          return;
        }

        const currentTime = video.currentTime;
        const progress = Math.round((currentTime / duration) * 100);
        onProgress?.({ phase: 'rendering', progress: Math.min(progress, 95) });

        // Draw video frame
        ctx.drawImage(video, 0, 0, width, height);

        // Draw overlay elements
        this.drawOverlay(ctx, elements, currentTime, width, height);

        requestAnimationFrame(drawFrame);
      };

      video.play().then(() => {
        requestAnimationFrame(drawFrame);
      }).catch(reject);
    });
  }

  // ── Font loading ──────────────────────────────────────────────────

  private fontsLoadedPromise: Promise<void> | null = null;

  private ensureFontsLoaded(): Promise<void> {
    if (this.fontsLoadedPromise) return this.fontsLoadedPromise;

    this.fontsLoadedPromise = new Promise<void>((resolve) => {
      // Inject Google Fonts stylesheet once
      const id = 'neopro-template-fonts';
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@500;700;900&family=Anton&display=swap';
        document.head.appendChild(link);
      }

      // Force-load specific font faces so they are ready before canvas rendering
      const fontsApi = (document as unknown as { fonts?: { load: (s: string) => Promise<unknown>; ready: Promise<unknown> } }).fonts;
      if (fontsApi) {
        Promise.all([
          fontsApi.load("900 280px 'Bebas Neue'"),
          fontsApi.load("500 30px 'Barlow Condensed'"),
        ])
          .then(() => fontsApi.ready)
          .then(() => resolve())
          .catch(() => resolve()); // fall back to system fonts
      } else {
        // Older browsers: just wait a moment
        setTimeout(resolve, 500);
      }
    });

    return this.fontsLoadedPromise;
  }

  // ── Drawing helpers ───────────────────────────────────────────────

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    elements: TextElement[],
    time: number,
    _width: number,
    _height: number
  ): void {
    // Optional: draw semi-transparent banner background for player template
    // (skip for now — elements draw directly)

    for (const el of elements) {
      const opacity = this.computeOpacity(el, time);
      if (opacity <= 0) continue;

      const scale = this.computeScale(el, time);
      const yOffset = this.computeSlideOffset(el, time);

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.textBaseline = 'middle';
      const fontFamily = el.fontFamily || "'Inter', 'Arial', sans-serif";
      ctx.font = `${el.fontWeight} ${el.fontSize}px ${fontFamily}`;
      ctx.fillStyle = el.color;

      // Shadow
      if (el.shadow) {
        ctx.shadowBlur = el.shadow.blur;
        ctx.shadowColor = el.shadow.color;
      }

      const x = el.x;
      const y = el.y + yOffset;

      // Custom letter-spacing: render char-by-char so we can compute exact width
      if (el.letterSpacing && el.letterSpacing > 0) {
        const chars = [...el.text];
        const widths = chars.map((c) => ctx.measureText(c).width);
        const totalWidth =
          widths.reduce((a, b) => a + b, 0) + el.letterSpacing * (chars.length - 1);
        let cursor = el.align === 'center' ? -totalWidth / 2 : el.align === 'right' ? -totalWidth : 0;

        ctx.textAlign = 'left';
        ctx.translate(x, y);
        if (scale !== 1) ctx.scale(scale, scale);
        for (let i = 0; i < chars.length; i++) {
          ctx.fillText(chars[i], cursor, 0);
          cursor += widths[i] + el.letterSpacing;
        }
      } else {
        ctx.textAlign = el.align;
        if (scale !== 1) {
          ctx.translate(x, y);
          ctx.scale(scale, scale);
          ctx.fillText(el.text, 0, 0);
        } else {
          ctx.fillText(el.text, x, y);
        }
      }

      ctx.restore();
    }
  }

  private computeOpacity(el: TextElement, time: number): number {
    // Fade in
    if (time < el.fadeIn[0]) return 0;
    if (time < el.fadeIn[1]) {
      return (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    }

    // Fade out
    if (time >= el.fadeOut[0]) {
      if (time >= el.fadeOut[1]) return 0;
      return 1 - (time - el.fadeOut[0]) / (el.fadeOut[1] - el.fadeOut[0]);
    }

    return 1;
  }

  private computeScale(el: TextElement, time: number): number {
    if (!el.scaleAnim) return 1;
    if (time < el.fadeIn[0]) return el.scaleAnim[0];
    if (time >= el.fadeIn[1]) return el.scaleAnim[1];

    const t = (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    return el.scaleAnim[0] + (el.scaleAnim[1] - el.scaleAnim[0]) * eased;
  }

  private computeSlideOffset(el: TextElement, time: number): number {
    if (!el.slideFromY) return 0;
    if (time < el.fadeIn[0]) return el.slideFromY;
    if (time >= el.fadeIn[1]) return 0;

    const t = (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    const eased = 1 - Math.pow(1 - t, 3);
    return el.slideFromY * (1 - eased);
  }
}
