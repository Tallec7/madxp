import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

export interface FrameSequenceAsset {
  baseUrl: string;
  framePattern: string;
  frameCount: number;
}

const BATCH_SIZE = 10;
const PER_FRAME_TIMEOUT_MS = 5000;
const RENDER_TIMEOUT_MS = 120_000;

function buildFrameUrl(asset: FrameSequenceAsset, frameIdx: number): string {
  const idx = Math.max(1, Math.min(asset.frameCount, frameIdx));
  const interpolated = asset.framePattern.replace(/\{i:0(\d+)d\}/, (_match, padding) =>
    String(idx).padStart(parseInt(padding, 10), '0'),
  );
  return asset.baseUrl + interpolated;
}

function preloadOne(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(done, PER_FRAME_TIMEOUT_MS);
    img.onload = (): void => {
      clearTimeout(timer);
      done();
    };
    img.onerror = (): void => {
      clearTimeout(timer);
      done();
    };
    img.src = url;
  });
}

/**
 * Précharge toutes les frames PNG d'un asset directory dans le cache navigateur
 * et bloque `renderMedia` (via `delayRender`) jusqu'à la fin du preload.
 *
 * Sans ce preload, sur un environnement réseau lent (Railway Hobby → FTP
 * Hostinger), Chromium headless screenshot des frames avant que les
 * `<image href>` SVG aient chargé leur PNG mask → masques vides, layers visibles
 * plein écran, rendu non conforme.
 *
 * Pattern porté de `studio-template/templates-remotion/src/mask-canvas.tsx`
 * (`useMaskFrames`) qui marche en local depuis sa première version : batch
 * sérialisé de 10 PNG en parallèle pour éviter de saturer la connexion HTTP/2
 * unique de Chromium headless.
 */
export function usePreloadFrameSequence(
  asset: FrameSequenceAsset | undefined,
  label: string,
): void {
  const [handle] = useState(() =>
    delayRender(`preloadFrames:${label}`, { timeoutInMilliseconds: RENDER_TIMEOUT_MS }),
  );

  useEffect(() => {
    if (!asset || asset.frameCount <= 0) {
      continueRender(handle);
      return;
    }

    let cancelled = false;

    void (async (): Promise<void> => {
      for (let start = 0; start < asset.frameCount && !cancelled; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE, asset.frameCount);
        const batch: Promise<void>[] = [];
        for (let i = start; i < end; i++) {
          batch.push(preloadOne(buildFrameUrl(asset, i + 1)));
        }
        await Promise.all(batch);
      }
      if (!cancelled) {
        continueRender(handle);
      }
    })();

    return (): void => {
      cancelled = true;
    };
  }, [asset?.baseUrl, asset?.frameCount, asset?.framePattern, handle]);
}
