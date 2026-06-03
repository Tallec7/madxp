import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { z } from 'zod';

/**
 * Composition POC — ruban LED périmétrique déroulé à plat (PROP-014 §2/§3, étape 3).
 *
 * BUT POC : valider que Remotion + Chromium headless peuvent allouer un canvas
 * ultra-wide (ex. 13333×160) via `calculateMetadata`, et trancher *flat-puis-fold*
 * vs *tuilé-plié* sur des FAITS (limite de largeur réelle ≈ 16384 px côté Chromium).
 * Le script `npm run led:ribbon-poc` rend cette compo à des largeurs croissantes
 * et reporte le plafond.
 *
 * Rendu volontairement en **DOM pur** (zéro vidéo/image décodée) : on isole la
 * limite de LARGEUR du canvas, pas la pression GPU du décodage vidéo.
 *
 * ⚠️ La formule `ribbonWidth` duplique `computeRibbonDimensions()` de
 * `central-server/src/services/led-fold.service.ts` (SOURCE DE VÉRITÉ). La compo
 * est webpack-bundlée à part et ne peut pas importer `src/` — garder les deux
 * synchronisées.
 */

export const ledPerimeterRibbonSchema = z.object({
  /** Longueurs des côtés (m). */
  sides: z.array(z.number().positive()).default([40]),
  /** Pas de pixel en mm (P6 → 6). */
  pitchMm: z.number().positive().default(6),
  /** Hauteur de dalle (px). */
  height: z.number().positive().default(160),
  /** Cadence de répétition du motif (m). */
  spacingM: z.number().positive().default(10),
  /** Même contenu partout vs par côté (PROP-014 §5). */
  zones: z.enum(['uniform', 'per-side']).default('uniform'),
  /** Largeur de bande (px) — pour tracer les futures coutures de pliage. */
  bandWidth: z.number().positive().default(1920),
  /** Libellé du motif répété. */
  label: z.string().default('MADXP'),
});

export type LedPerimeterRibbonProps = z.infer<typeof ledPerimeterRibbonSchema>;

/** Largeur du ruban (px). Miroir de `computeRibbonDimensions` (cf. en-tête). */
function ribbonWidthPx(sides: number[], pitchMm: number): number {
  if (pitchMm <= 0) return 1;
  const sum = sides.reduce((a, b) => a + b, 0);
  return Math.max(1, Math.round(sum * (1000 / pitchMm)));
}

/**
 * `calculateMetadata` Remotion : dimensions dérivées du profil LED.
 * Le worker/script appelle `selectComposition` qui exécute cette fonction →
 * width/height adaptés sans hardcode (PROP-014 §11 "dimensions dynamiques").
 */
export const calculateLedRibbonMetadata: CalculateMetadataFunction<LedPerimeterRibbonProps> = ({
  props,
}) => {
  const width = ribbonWidthPx(props.sides, props.pitchMm);
  const height = Math.round(props.height);
  return { width, height, fps: 25, durationInFrames: 50 };
};

// Palette de segments par côté (mode per-side) — couleurs distinctes pour vérifier
// visuellement que le contenu ne traverse jamais un angle.
const SIDE_COLORS = ['#0a1d3b', '#3b0a1d', '#0a3b1d', '#3b1d0a', '#1d0a3b', '#0a3b3b', '#3b3b0a', '#1d1d3b'];

export const LedPerimeterRibbonComposition: React.FC<LedPerimeterRibbonProps> = ({
  sides,
  pitchMm,
  height,
  spacingM,
  zones,
  bandWidth,
  label,
}) => {
  const frame = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();

  const pxPerMeter = pitchMm > 0 ? 1000 / pitchMm : 0;
  const spacingPx = Math.max(1, Math.round(spacingM * pxPerMeter));

  // Frontières des côtés (px cumulés) → segments de zone.
  const sideBounds: Array<{ start: number; end: number; index: number }> = [];
  let acc = 0;
  sides.forEach((s, i) => {
    const start = acc;
    acc += s * pxPerMeter;
    sideBounds.push({ start, end: acc, index: i });
  });

  // Nombre de cellules de motif le long du ruban.
  const cellCount = Math.max(1, Math.ceil(width / spacingPx));
  const cells = Array.from({ length: cellCount }, (_, i) => i);

  // Coutures de pliage (multiples de bandWidth) — où fold() coupera.
  const seamCount = Math.max(0, Math.floor(width / bandWidth));
  const seams = Array.from({ length: seamCount }, (_, i) => (i + 1) * bandWidth);

  // Surbrillance animée (prouve que c'est une vidéo, pas un still).
  const sweepX = interpolate(frame, [0, durationInFrames], [0, width], {
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, width, height, overflow: 'hidden', background: '#000' }}>
      {/* Fond par zone */}
      {zones === 'per-side'
        ? sideBounds.map((b) => (
            <div
              key={`side-${b.index}`}
              style={{
                position: 'absolute',
                left: b.start,
                top: 0,
                width: b.end - b.start,
                height,
                background: SIDE_COLORS[b.index % SIDE_COLORS.length],
              }}
            />
          ))
        : (
          <div style={{ position: 'absolute', inset: 0, background: SIDE_COLORS[0] }} />
        )}

      {/* Motif répété : libellé + numéro de répétition, centré dans chaque cellule */}
      {cells.map((i) => (
        <div
          key={`cell-${i}`}
          style={{
            position: 'absolute',
            left: i * spacingPx,
            top: 0,
            width: spacingPx,
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontFamily: 'sans-serif',
            fontWeight: 800,
            fontSize: Math.round(height * 0.42),
            borderRight: '1px solid rgba(255,255,255,0.12)',
            whiteSpace: 'nowrap',
          }}
        >
          {label} · {i + 1}
        </div>
      ))}

      {/* Coutures de pliage (rouge pointillé) — repère visuel des bandes fold() */}
      {seams.map((x, i) => (
        <div
          key={`seam-${i}`}
          style={{
            position: 'absolute',
            left: x - 1,
            top: 0,
            width: 2,
            height,
            background: 'repeating-linear-gradient(to bottom, #ff3b3b 0 6px, transparent 6px 12px)',
          }}
        />
      ))}

      {/* Surbrillance animée */}
      <div
        style={{
          position: 'absolute',
          left: sweepX - 40,
          top: 0,
          width: 80,
          height,
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)',
        }}
      />
    </div>
  );
};
