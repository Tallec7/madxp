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
function luminanceToAlphaBitmap(img: HTMLImageElement): Promise<ImageBitmap | HTMLCanvasElement> {
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
    px[i + 3] = l;
  }
  ctx.putImageData(imageData, 0, 0);
  // createImageBitmap donne un transfert GPU-friendly si dispo, sinon canvas brut
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(canvas).catch(() => canvas);
  }
  return Promise.resolve(canvas);
}

type MaskFrame = ImageBitmap | HTMLCanvasElement;

// ── Hook : précharge une séquence de PNGs + convertit en masques alpha ──────
export function useMaskFrames(dir: string, frames: number): MaskFrame[] {
  const [masks, setMasks] = useState<MaskFrame[]>([]);

  useEffect(() => {
    const handle = delayRender(`masks:${dir}`);
    const out: MaskFrame[] = new Array(frames);
    let settled = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setMasks(out);
      continueRender(handle);
    };
    for (let i = 0; i < frames; i++) {
      const img = new Image();
      img.src = staticFile(`${dir}/${String(i + 1).padStart(4, '0')}.png`);
      img.onload = async () => {
        try {
          out[i] = await luminanceToAlphaBitmap(img);
        } catch {
          /* ignore, slot reste vide */
        }
        if (++settled === frames) finish();
      };
      img.onerror = () => {
        if (++settled === frames) finish();
      };
    }
  }, [dir, frames]);

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
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const MaskedCanvas: React.FC<MaskedCanvasProps> = ({ maskFrames, draw }) => {
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
    const mask = maskFrames[frame];
    if (!mask) return;
    draw(ctx);
    ctx.globalCompositeOperation = 'destination-in';
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
