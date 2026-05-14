import { useEffect, useState } from 'react';
import { delayRender, continueRender } from 'remotion';

/**
 * Charge une font custom à partir d'une URL FTP, en bloquant le render
 * Remotion jusqu'à ce que la font soit dispo (sinon fallback CSS s'applique).
 *
 * Phase 1.6 — ADR-127. Couplé à la library d'assets ADR-125 : la font est
 * uploadée via le panel admin (`/templates-studio/admin/assets/library`),
 * déclarée dans le manifest avec `mime: 'font/woff2'` + `fontFamily: 'X'`,
 * puis injectée comme URL dans `props.__assets.<key>` par le worker render.
 *
 * Usage dans une Composition :
 *   useCustomFont('Bulevar', __assets.bulevarFont);
 *   // puis utiliser font-family: 'Bulevar' dans les styles
 *
 * Si url est null/undefined (asset non bound) → continueRender direct + warn.
 * Si load fail → continueRender quand même (fallback CSS appliqué) + warn.
 *
 * delayRender garantit que renderMedia attend la font chargée avant de
 * commencer à capturer les frames (sinon la 1ère frame utilise le fallback).
 * Cf. https://www.remotion.dev/docs/delay-render
 */
export function useCustomFont(family: string, url: string | null | undefined): void {
  const [handle] = useState(() => delayRender(`Loading font: ${family}`));

  useEffect(() => {
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(`[useCustomFont] No URL for font ${family} — fallback CSS applied`);
      continueRender(handle);
      return;
    }

    let cancelled = false;
    const font = new FontFace(family, `url(${url})`);
    font
      .load()
      .then((loaded) => {
        if (cancelled) return;
        // document.fonts.add est typé strict dans certains lib.dom — cast minimal
        // pour rester compat sans @types extras. Le set est runtime-checked.
        (document.fonts as unknown as { add: (f: FontFace) => void }).add(loaded);
        continueRender(handle);
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn(`[useCustomFont] Failed to load font ${family}:`, err);
        continueRender(handle); // fallback CSS s'appliquera
      });

    return () => {
      cancelled = true;
    };
  }, [family, url, handle]);
}
