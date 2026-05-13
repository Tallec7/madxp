// ─────────────────────────────────────────────────────────────────────────────
// Canvas-based luminance masking (remplace CSS mask-image par frame).
//
// Pourquoi :
//   CSS `mask-image: url(frameXXXX.png)` change d'URL 30 fois/sec → invalide
//   le cache raster du compositeur → flash visible sur les couches texte/image.
//   Le rendu MP4 final (headless Chromium + FFmpeg) n'est pas affecté, mais
//   le preview dashboard (club self-service demain, ADR-037) doit être fluide.
//
// Solution :
//   Précharger toutes les frames de masque en HTMLImageElement une seule fois,
//   puis à chaque frame dessiner texte/image dans un <canvas> et appliquer le
//   masque via globalCompositeOperation='destination-in'. Un seul raster par
//   frame, pas de swap de ressource CSS.
//
// Contraintes :
//   - Rendu parité MP4 : le render Remotion utilise la même logique canvas,
//     donc rendu identique côté puppeteer.
//   - Fonts : canvas.fillText n'attend pas le @font-face — on gate via
//     document.fonts.ready (delayRender côté SSR).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';

// ── Convertit un PNG grayscale opaque en bitmap dont l'alpha = luminance ─────
// Nécessaire parce que Canvas `globalCompositeOperation='destination-in'`
// utilise le canal ALPHA de la source, pas sa luminance. Les PNG extraits par
// scripts/extract-masks.sh sont grayscale mais 100% opaques (alpha=255) — sans
// cette conversion, destination-in ne masque rien et le texte est visible
// partout. Le CSS `mask-mode: luminance` faisait la conversion implicitement.
function luminanceToAlphaBitmap(img: HTMLImageElement, threshold = 0): Promise<ImageBitmap | HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(canvas);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    // Luminance Rec.709 ≈ 0.299R + 0.587G + 0.114B ; PNG grayscale → R=G=B
    const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    // SPEC v1 — mode smooth (threshold=0) : alpha = luminance × 5 (clamp 0-255).
    // Permet d'utiliser un mask PNG sombre comme alpha sans avoir un texte
    // semi-transparent. Le mode binarize (threshold>0) reste inchangé pour v0.
    px[i + 3] = threshold > 0
      ? (l >= threshold ? 255 : 0)
      : Math.min(255, Math.round(l * 100));
  }
  ctx.putImageData(imageData, 0, 0);
  // createImageBitmap donne un transfert GPU-friendly si dispo, sinon canvas brut
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(canvas).catch(() => canvas);
  }
  return Promise.resolve(canvas);
}

type MaskFrame = ImageBitmap | HTMLCanvasElement;

// ── Hook : pré-décode un webm frame-par-frame et extrait l'alpha par luminance
// SPEC v1.1 — utilisé quand `alphaSource: 'self'` sur un layer. Permet de se
// passer des PNG masks pré-rendus et de couvrir toute la zone visible du webm.
// Coût : décodage one-shot au chargement (5-10s pour 175 frames en local).
// Le webm est en VP9 yuv420p sans alpha natif → on dérive l'alpha de la
// luminance (noir = transparent, blanc = opaque), comme pour les PNG masks.
export function useMaskFromVideo(
  videoUrl: string,
  frames: number,
  fps: number,
  threshold = 0
): MaskFrame[] {
  const [masks, setMasks] = useState<MaskFrame[]>([]);

  useEffect(() => {
    if (!videoUrl || frames <= 0 || fps <= 0) return;
    const handle = delayRender(`videomask:${videoUrl}`, { timeoutInMilliseconds: 90000 });
    let canceled = false;

    (async () => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';

      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('error', done, { once: true });
      });
      if (canceled) {
        continueRender(handle);
        return;
      }

      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        continueRender(handle);
        return;
      }

      const out: MaskFrame[] = new Array(frames);

      for (let i = 0; i < frames && !canceled; i++) {
        await new Promise<void>((resolve) => {
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            resolve();
          };
          video.addEventListener('seeked', onSeek);
          video.currentTime = i / fps;
        });
        if (canceled) break;

        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const px = imageData.data;
        for (let p = 0; p < px.length; p += 4) {
          const l = (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) / 1000;
          px[p] = 255;
          px[p + 1] = 255;
          px[p + 2] = 255;
          px[p + 3] = threshold > 0 ? (l >= threshold ? 255 : 0) : l;
        }
        ctx.putImageData(imageData, 0, 0);
        try {
          out[i] =
            typeof createImageBitmap === 'function'
              ? await createImageBitmap(canvas)
              : (canvas.cloneNode(true) as HTMLCanvasElement);
        } catch {
          // ignore, slot reste vide
        }
      }

      if (!canceled) setMasks(out);
      continueRender(handle);
    })();

    return () => {
      canceled = true;
    };
  }, [videoUrl, frames, fps, threshold]);

  return masks;
}

// ── Hook : précharge une séquence de PNGs + convertit en masques alpha ──────
// SPEC v1 — chargement séquentiel par batch (10 à la fois) pour éviter de
// saturer Chromium headless en mode render (1 seule connexion HTTP/2 limitée).
export function useMaskFrames(dir: string, frames: number, threshold = 0): MaskFrame[] {
  const [masks, setMasks] = useState<MaskFrame[]>([]);

  useEffect(() => {
    if (!dir || frames <= 0) return;
    const handle = delayRender(`masks:${dir}`, { timeoutInMilliseconds: 120000 });
    const out: MaskFrame[] = new Array(frames);
    let canceled = false;
    const BATCH = 10;

    const loadOne = (i: number): Promise<void> =>
      new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        // Timeout fallback : si onload/onerror ne se déclenche jamais (rare en
        // headless surchargé), on libère la promesse après 5s.
        const timer = setTimeout(done, 5000);
        img.src = staticFile(`${dir}/${String(i + 1).padStart(4, '0')}.png`);
        img.onload = async () => {
          try { out[i] = await luminanceToAlphaBitmap(img, threshold); } catch { /* ignore */ }
          clearTimeout(timer);
          done();
        };
        img.onerror = () => { clearTimeout(timer); done(); };
      });

    (async () => {
      for (let start = 0; start < frames && !canceled; start += BATCH) {
        const end = Math.min(start + BATCH, frames);
        const promises: Promise<void>[] = [];
        for (let i = start; i < end; i++) promises.push(loadOne(i));
        await Promise.all(promises);
      }
      if (!canceled) setMasks(out);
      continueRender(handle);
    })();

    return () => { canceled = true; };
  }, [dir, frames, threshold]);

  return masks;
}

// ── Hook : précharge une image arbitraire (logo, photo joueur) ──────────────
export function useImageAsset(url: string | undefined | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const handle = delayRender(`img:${url}`);
    const i = new Image();
    if (url.startsWith('http')) i.crossOrigin = 'anonymous';
    i.src = url;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      continueRender(handle);
    };
    i.onload = () => {
      setImg(i);
      done();
    };
    i.onerror = () => {
      setImg(null);
      done();
    };
  }, [url]);

  return img;
}

// ── Hook : attend que toutes les @font-face soient chargées ─────────────────
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = delayRender('fonts');
    const fontSet = (document as unknown as { fonts?: FontFaceSet }).fonts;
    const resolve = () => {
      setReady(true);
      continueRender(handle);
    };
    if (fontSet && typeof fontSet.ready?.then === 'function') {
      fontSet.ready.then(resolve, resolve);
    } else {
      resolve();
    }
  }, []);

  return ready;
}

// ── Composant : <canvas> masqué par la séquence PNG courante ────────────────
interface MaskedCanvasProps {
  maskFrames: MaskFrame[];
  draw: (ctx: CanvasRenderingContext2D) => void;
  /** Décalage de frame entre la composition et les PNGs de masque (défaut 0). */
  frameOffset?: number;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const MaskedCanvas: React.FC<MaskedCanvasProps> = ({ maskFrames, draw, frameOffset = 0 }) => {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Sans masque prêt pour cette frame → on laisse le canvas vide. Ne jamais
    // dessiner le contenu sans masque, sinon texte/image visible partout.
    const mask = maskFrames[frame + frameOffset];
    if (!mask) return;
    draw(ctx);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  });

  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={1080}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1920,
        height: 1080,
      }}
    />
  );
};

// ── Helper : dessine du texte centré avec ombre ─────────────────────────────
export interface CanvasTextOptions {
  x: number;
  y: number;
  text: string;
  font: string;
  color: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  letterSpacing?: number;
}

export function drawText(ctx: CanvasRenderingContext2D, opts: CanvasTextOptions): void {
  ctx.save();
  ctx.font = opts.font;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.textAlign ?? 'left';
  ctx.textBaseline = opts.textBaseline ?? 'alphabetic';
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow.color;
    ctx.shadowBlur = opts.shadow.blur;
    ctx.shadowOffsetX = opts.shadow.offsetX;
    ctx.shadowOffsetY = opts.shadow.offsetY;
  }
  // Canvas 2D `letterSpacing` est supporté Chrome 99+, Safari 16.4+, headless
  // Chromium Remotion à jour. Fallback manuel si non dispo.
  const spacing = opts.letterSpacing ?? 0;
  const ctxWithSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (spacing !== 0 && 'letterSpacing' in ctx) {
    ctxWithSpacing.letterSpacing = `${spacing}px`;
    ctx.fillText(opts.text, opts.x, opts.y);
    ctxWithSpacing.letterSpacing = '0px';
  } else if (spacing !== 0) {
    // Fallback manuel char par char
    let x = opts.x;
    if (opts.textAlign === 'center') {
      const totalWidth = opts.text.split('').reduce((w, c, i) => w + ctx.measureText(c).width + (i > 0 ? spacing : 0), 0);
      x = opts.x - totalWidth / 2;
    } else if (opts.textAlign === 'right') {
      const totalWidth = opts.text.split('').reduce((w, c, i) => w + ctx.measureText(c).width + (i > 0 ? spacing : 0), 0);
      x = opts.x - totalWidth;
    }
    ctx.textAlign = 'left';
    for (const char of opts.text) {
      ctx.fillText(char, x, opts.y);
      x += ctx.measureText(char).width + spacing;
    }
  } else {
    ctx.fillText(opts.text, opts.x, opts.y);
  }
  ctx.restore();
}
