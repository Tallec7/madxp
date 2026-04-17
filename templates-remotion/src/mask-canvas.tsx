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

// ── Hook : précharge une séquence de PNGs de masque ─────────────────────────
export function useMaskFrames(dir: string, frames: number): HTMLImageElement[] {
  const [images, setImages] = useState<HTMLImageElement[]>([]);

  useEffect(() => {
    const handle = delayRender(`masks:${dir}`);
    const imgs: HTMLImageElement[] = new Array(frames);
    let loaded = 0;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      setImages(imgs);
      continueRender(handle);
    };
    for (let i = 0; i < frames; i++) {
      const img = new Image();
      img.src = staticFile(`${dir}/${String(i + 1).padStart(4, '0')}.png`);
      img.onload = () => {
        imgs[i] = img;
        if (++loaded === frames) done();
      };
      img.onerror = () => {
        if (++loaded === frames) done();
      };
    }
  }, [dir, frames]);

  return images;
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
  maskFrames: HTMLImageElement[];
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
    draw(ctx);
    const mask = maskFrames[frame];
    if (mask && mask.complete && mask.naturalWidth > 0) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
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
