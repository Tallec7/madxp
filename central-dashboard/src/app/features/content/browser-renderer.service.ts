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
  kind: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: string;
  fontFamily?: string;
  letterSpacing?: number;
  color: string;
  align: CanvasTextAlign;
  fadeIn: [number, number];
  fadeOut: [number, number];
  slideFromY?: number;
  scaleAnim?: [number, number];
  scaleWindow?: [number, number];
  shadow?: { blur: number; color: string };
}

interface ImageElement {
  kind: 'image';
  src: string; // data URI or URL
  x: number;
  y: number;
  width: number;
  height: number;
  fadeIn: [number, number];
  fadeOut: [number, number];
  borderRadius?: number;
  border?: { width: number; color: string };
  objectFit?: 'contain' | 'cover';
  shadow?: { blur: number; color: string };
}

type OverlayElement = TextElement | ImageElement;

// ── Template definitions ──────────────────────────────────────────────────

function buildPlayerElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const nom = (vars['nom'] || 'NOM').toUpperCase();
  const prenom = (vars['prenom'] || 'PRÉNOM').toUpperCase();
  const club = (vars['club'] || 'NOM DU CLUB').toUpperCase();
  const numero = vars['numero'] || '';
  const photoDataUri = vars['_image_photo'] || '';
  const logoDataUri = vars['_image_logo'] || '';
  const REVEAL = 1.22;
  const NAME_IN = 2.10;
  const fadeOutStart = Math.max(duration - 0.6, NAME_IN + 0.6);

  const displayFont = "'Bebas Neue', 'Anton', 'Oswald', 'Barlow Condensed', 'Impact', sans-serif";
  const surtitleFont = "'Barlow Condensed', 'Oswald', 'Inter', sans-serif";

  const elements: OverlayElement[] = [];

  // Photo joueur — coin bas gauche, apparaît avec les noms
  if (photoDataUri) {
    elements.push({
      kind: 'image',
      src: photoDataUri,
      x: 80, y: 780,
      width: 200, height: 200,
      fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
      borderRadius: 100,
      border: { width: 3, color: 'rgba(255,255,255,0.3)' },
      objectFit: 'cover',
    });
  }

  // Logo club — coin haut droit, apparaît avec les noms
  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: 1760, y: 60,
      width: 100, height: 100,
      fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
      objectFit: 'contain',
      shadow: { blur: 12, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (numero) {
    elements.push({
      kind: 'text',
      text: numero,
      x: 960, y: 540,
      fontSize: 520, fontWeight: '900',
      fontFamily: displayFont,
      color: '#FFFFFF', align: 'center',
      fadeIn: [0, 0.001],
      fadeOut: [REVEAL, REVEAL + 0.15],
      scaleAnim: [0.15, 1.5],
      scaleWindow: [0, REVEAL],
    });
  }

  elements.push({
    kind: 'text',
    text: club,
    x: 960, y: 145,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: prenom,
    x: 960, y: 460,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: nom,
    x: 960, y: 700,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: club,
    x: 960, y: 945,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  return elements;
}

function buildScorePlusElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const score = vars['score'] || '+1';
  const nom = vars['nom'] || '';
  const club = vars['club'] || '';
  const color = vars['color'] || '#FF3333';
  const logoDataUri = vars['_image_logo'] || '';
  const fadeOutStart = Math.max(duration - 0.8, 1.5);

  const elements: OverlayElement[] = [];

  // Logo club — à gauche du nom du club
  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: club ? 780 : 908,
      y: 248,
      width: 56, height: 56,
      fadeIn: [0.15, 0.65], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      objectFit: 'contain',
      shadow: { blur: 8, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (club) {
    elements.push({
      kind: 'text',
      text: club.toUpperCase(),
      x: logoDataUri ? 1000 : 960, y: 280,
      fontSize: 48, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.15, 0.65], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  elements.push({
    kind: 'text',
    text: score,
    x: 960, y: 500,
    fontSize: 320, fontWeight: '900', color, align: 'center',
    fadeIn: [0, 0.4], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
    scaleAnim: [1.6, 1],
    shadow: { blur: 80, color: color + '66' },
  });

  if (nom) {
    elements.push({
      kind: 'text',
      text: nom.toUpperCase(),
      x: 960, y: 650,
      fontSize: 80, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.3, 0.8], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  return elements;
}

function buildButeurElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const nom = vars['nom'] || '';
  const numero = vars['numero'] || '';
  const club = vars['club'] || '';
  const logoDataUri = vars['_image_logo'] || '';
  const fadeOutStart = Math.max(duration - 1, 2);

  const elements: OverlayElement[] = [];

  // Logo club — à gauche du nom du club
  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: club ? 760 : 908,
      y: 165,
      width: 64, height: 64,
      fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      objectFit: 'contain',
      shadow: { blur: 8, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (club) {
    elements.push({
      kind: 'text',
      text: club.toUpperCase(),
      x: logoDataUri ? 1000 : 960, y: 200,
      fontSize: 50, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  elements.push({
    kind: 'text',
    text: 'BUUUUT !',
    x: 960, y: 380,
    fontSize: 140, fontWeight: '900', color: '#FF3344', align: 'center',
    fadeIn: [0, 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
    scaleAnim: [1.8, 1],
    shadow: { blur: 60, color: 'rgba(255,50,70,0.5)' },
  });

  if (numero) {
    elements.push({
      kind: 'text',
      text: `#${numero}`,
      x: 960, y: 560,
      fontSize: 220, fontWeight: '900', color: '#FFFFFF', align: 'center',
      fadeIn: [0.4, 0.9], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      scaleAnim: [1.5, 1],
    });
  }

  if (nom) {
    elements.push({
      kind: 'text',
      text: nom.toUpperCase(),
      x: 960, y: 700,
      fontSize: 90, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.7, 1.2], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  return elements;
}

const TEMPLATE_BUILDERS: Record<string, (vars: Record<string, string>, duration: number) => OverlayElement[]> = {
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

    // 2b. Preload images for ImageElements
    const imageCache = await this.preloadImages(elements);

    onProgress?.({ phase: 'loading', progress: 75 });

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
          this.drawOverlay(ctx, elements, imageCache, duration, width, height);
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
        this.drawOverlay(ctx, elements, imageCache, currentTime, width, height);

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

  // ── Image preloading ────────────────────────────────────────────

  private async preloadImages(elements: OverlayElement[]): Promise<Map<string, HTMLImageElement>> {
    const cache = new Map<string, HTMLImageElement>();
    const imageElements = elements.filter((el): el is ImageElement => el.kind === 'image');

    await Promise.all(imageElements.map(el => {
      if (cache.has(el.src)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { cache.set(el.src, img); resolve(); };
        img.onerror = () => resolve();
        img.src = el.src;
      });
    }));

    return cache;
  }

  // ── Drawing helpers ────────────────────────────────────────────

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    elements: OverlayElement[],
    imageCache: Map<string, HTMLImageElement>,
    time: number,
    _width: number,
    _height: number
  ): void {
    for (const el of elements) {
      const opacity = this.computeOpacity(el, time);
      if (opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (el.kind === 'image') {
        this.drawImageElement(ctx, el, imageCache);
      } else {
        this.drawTextElement(ctx, el, time);
      }

      ctx.restore();
    }
  }

  private drawImageElement(
    ctx: CanvasRenderingContext2D,
    el: ImageElement,
    imageCache: Map<string, HTMLImageElement>
  ): void {
    const img = imageCache.get(el.src);
    if (!img) return;

    if (el.shadow) {
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
    }

    if (el.borderRadius) {
      ctx.beginPath();
      ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.min(el.width, el.height) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    if (el.objectFit === 'cover') {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = el.width / el.height;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (imgRatio > boxRatio) {
        sw = img.naturalHeight * boxRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / boxRatio;
        sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, el.x, el.y, el.width, el.height);
    } else {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = el.width / el.height;
      let dw = el.width, dh = el.height, dx = el.x, dy = el.y;
      if (imgRatio > boxRatio) {
        dh = el.width / imgRatio;
        dy = el.y + (el.height - dh) / 2;
      } else {
        dw = el.height * imgRatio;
        dx = el.x + (el.width - dw) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    if (el.border) {
      ctx.strokeStyle = el.border.color;
      ctx.lineWidth = el.border.width;
      if (el.borderRadius) {
        ctx.beginPath();
        ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.min(el.width, el.height) / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      }
    }
  }

  private drawTextElement(ctx: CanvasRenderingContext2D, el: TextElement, time: number): void {
    const scale = this.computeScale(el, time);
    const yOffset = this.computeSlideOffset(el, time);

    ctx.textBaseline = 'middle';
    const fontFamily = el.fontFamily || "'Inter', 'Arial', sans-serif";
    ctx.font = `${el.fontWeight} ${el.fontSize}px ${fontFamily}`;
    ctx.fillStyle = el.color;

    if (el.shadow) {
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowColor = el.shadow.color;
    }

    const x = el.x;
    const y = el.y + yOffset;

    if (el.letterSpacing && el.letterSpacing > 0) {
      const chars = [...el.text];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const totalWidth = widths.reduce((a, b) => a + b, 0) + el.letterSpacing * (chars.length - 1);
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
  }

  private computeOpacity(el: OverlayElement, time: number): number {
    if (time < el.fadeIn[0]) return 0;
    if (time < el.fadeIn[1]) return (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    if (time >= el.fadeOut[0]) {
      if (time >= el.fadeOut[1]) return 0;
      return 1 - (time - el.fadeOut[0]) / (el.fadeOut[1] - el.fadeOut[0]);
    }
    return 1;
  }

  private computeScale(el: OverlayElement, time: number): number {
    if (el.kind !== 'text' || !el.scaleAnim) return 1;
    const win = el.scaleWindow || el.fadeIn;
    if (time < win[0]) return el.scaleAnim[0];
    if (time >= win[1]) return el.scaleAnim[1];
    const t = (time - win[0]) / (win[1] - win[0]);
    const eased = 1 - Math.pow(1 - t, 3);
    return el.scaleAnim[0] + (el.scaleAnim[1] - el.scaleAnim[0]) * eased;
  }

  private computeSlideOffset(el: OverlayElement, time: number): number {
    if (el.kind !== 'text' || !el.slideFromY) return 0;
    if (time < el.fadeIn[0]) return el.slideFromY;
    if (time >= el.fadeIn[1]) return 0;
    const t = (time - el.fadeIn[0]) / (el.fadeIn[1] - el.fadeIn[0]);
    const eased = 1 - Math.pow(1 - t, 3);
    return el.slideFromY * (1 - eased);
  }
}
