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
  // Add letter-spacing visual effect by inserting thin spaces between chars
  const clubSpaced = club.split('').join('\u2009\u2009');
  const fadeOutStart = Math.max(duration - 0.6, 1.5);

  const elements: TextElement[] = [];

  // Club name TOP
  elements.push({
    text: clubSpaced,
    x: 960, y: 150,
    fontSize: 38, fontWeight: '700', color: '#FFFFFF', align: 'center',
    fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 20,
    shadow: { blur: 12, color: 'rgba(0,0,0,0.6)' },
  });

  // PRÉNOM big center-top
  elements.push({
    text: prenom,
    x: 960, y: 470,
    fontSize: 200, fontWeight: '900', color: '#FFFFFF', align: 'center',
    fadeIn: [0.3, 0.9], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 40,
    scaleAnim: [1.1, 1],
    shadow: { blur: 30, color: 'rgba(0,0,0,0.7)' },
  });

  // NOM big center-bottom
  elements.push({
    text: nom,
    x: 960, y: 680,
    fontSize: 200, fontWeight: '900', color: '#FFFFFF', align: 'center',
    fadeIn: [0.45, 1.05], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 40,
    scaleAnim: [1.1, 1],
    shadow: { blur: 30, color: 'rgba(0,0,0,0.7)' },
  });

  // Club name BOTTOM
  elements.push({
    text: clubSpaced,
    x: 960, y: 950,
    fontSize: 38, fontWeight: '700', color: '#FFFFFF', align: 'center',
    fadeIn: [0.6, 1.1], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
    slideFromY: 20,
    shadow: { blur: 12, color: 'rgba(0,0,0,0.6)' },
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
          recorder.stop();
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
      ctx.textAlign = el.align;
      ctx.textBaseline = 'middle';
      ctx.font = `${el.fontWeight} ${el.fontSize}px 'Inter', 'Arial', sans-serif`;
      ctx.fillStyle = el.color;

      // Shadow
      if (el.shadow) {
        ctx.shadowBlur = el.shadow.blur;
        ctx.shadowColor = el.shadow.color;
      }

      const x = el.x;
      const y = el.y + yOffset;

      if (scale !== 1) {
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillText(el.text, 0, 0);
      } else {
        ctx.fillText(el.text, x, y);
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
