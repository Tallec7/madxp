import { staticFile } from 'remotion';

/**
 * Charge les polices custom (OTF locales dans public/) via @font-face.
 * À appeler une seule fois au top-level de index.ts, avant registerRoot().
 * Les polices Google Fonts (Anton, Bebas Neue, etc.) sont chargées par le
 * worker depuis Google CDN — seules les polices custom non-Google sont ici.
 */
export function registerCustomFonts(): void {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Bulevar';
      src: url('${staticFile('Bulevar-Regular.otf')}') format('opentype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'General Sans';
      src: url('${staticFile('GeneralSans-Semibold.otf')}') format('opentype');
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: 'General Sans';
      src: url('${staticFile('GeneralSans-Bold.otf')}') format('opentype');
      font-weight: 700;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);
}
