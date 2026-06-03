import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { z } from 'zod';

/**
 * Composition de PRODUCTION — ruban LED rendu DIRECTEMENT PLIÉ (PROP-014 étape 3).
 *
 * Décision d'archi (POC `led:ribbon-poc`, 2026-06-03) : rendre le ruban plat entier
 * dans Chromium OOM dès ~10000px (RAM-bound). Le canvas PLIÉ cible ne fait que
 * `bandWidth × (bandCount·height)` (ex. 1920×1120) → on dessine directement dans
 * ce petit canvas, en appliquant la géométrie fold() au draw-time. Aucun
 * intermédiaire géant, donc pas d'OOM, quelle que soit la longueur du périmètre.
 *
 * Invariant anti-OOM : **aucun élément ne dépasse `bandWidth` en largeur**. Chaque
 * bande ne rend que les cellules de motif qui tombent dans sa fenêtre `[srcX, srcX+w]`.
 *
 * ⚠️ La géométrie (ribbonWidth, bandCount, srcX, dstY) duplique
 * `computeRibbonDimensions` + `computeFoldGeometry` de
 * `central-server/src/services/led-fold.service.ts` (SOURCE DE VÉRITÉ ; frontière
 * de bundle webpack). Garder synchronisé.
 */

export const ledPerimeterFoldedSchema = z.object({
  sides: z.array(z.number().positive()).default([40, 20, 20]),
  pitchMm: z.number().positive().default(6),
  height: z.number().positive().default(160),
  spacingM: z.number().positive().default(10),
  zones: z.enum(['uniform', 'per-side']).default('uniform'),
  /** Largeur de bande = largeur d'entrée processeur (canvas_in, défaut provisoire). */
  bandWidth: z.number().positive().default(1920),
  /** Ordre d'empilement des bandes (enum partagé avec fold()). */
  order: z.enum(['top-to-bottom', 'bottom-to-top']).default('top-to-bottom'),
  label: z.string().default('MADXP'),
});

export type LedPerimeterFoldedProps = z.infer<typeof ledPerimeterFoldedSchema>;

const SIDE_COLORS = ['#0a1d3b', '#3b0a1d', '#0a3b1d', '#3b1d0a', '#1d0a3b', '#0a3b3b', '#3b3b0a', '#1d1d3b'];

interface FoldGeom {
  ribbonWidth: number;
  bandWidth: number;
  bandCount: number;
  canvasHeight: number;
  pxPerMeter: number;
}

/** Géométrie de pliage (miroir de led-fold.service.ts — cf. en-tête). */
function foldGeometry(props: LedPerimeterFoldedProps): FoldGeom {
  const pxPerMeter = props.pitchMm > 0 ? 1000 / props.pitchMm : 0;
  const sum = props.sides.reduce((a, b) => a + b, 0);
  const ribbonWidth = Math.max(1, Math.round(sum * pxPerMeter));
  const bandWidth = Math.max(1, Math.round(props.bandWidth));
  const bandCount = Math.ceil(ribbonWidth / bandWidth);
  return {
    ribbonWidth,
    bandWidth,
    bandCount,
    canvasHeight: bandCount * Math.round(props.height),
    pxPerMeter,
  };
}

export const calculateLedFoldedMetadata: CalculateMetadataFunction<LedPerimeterFoldedProps> = ({
  props,
}) => {
  const g = foldGeometry(props);
  return { width: g.bandWidth, height: g.canvasHeight, fps: 25, durationInFrames: 50 };
};

export const LedPerimeterFoldedComposition: React.FC<LedPerimeterFoldedProps> = ({
  sides,
  pitchMm,
  height,
  spacingM,
  zones,
  bandWidth: bandWidthProp,
  order,
  label,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const g = foldGeometry({ sides, pitchMm, height, spacingM, zones, bandWidth: bandWidthProp, order, label });

  const h = Math.round(height);
  const spacingPx = Math.max(1, Math.round(spacingM * g.pxPerMeter));

  // Frontières des côtés (px cumulés sur le ruban logique).
  const sideBounds: Array<{ start: number; end: number; index: number }> = [];
  let acc = 0;
  sides.forEach((s, i) => {
    const start = acc;
    acc += s * g.pxPerMeter;
    sideBounds.push({ start, end: acc, index: i });
  });

  // Pulse global (prouve que c'est une vidéo, sans élément large animé).
  const pulse = interpolate(frame, [0, durationInFrames / 2, durationInFrames], [0.92, 1, 0.92], {
    extrapolateRight: 'clamp',
  });

  const bands = Array.from({ length: g.bandCount }, (_, i) => i);

  return (
    <div style={{ position: 'absolute', inset: 0, width: g.bandWidth, height: g.canvasHeight, background: '#000', opacity: pulse }}>
      {bands.map((i) => {
        const srcX = i * g.bandWidth;
        const w = Math.min(g.bandWidth, g.ribbonWidth - srcX); // dernière bande tronquée
        const slot = order === 'top-to-bottom' ? i : g.bandCount - 1 - i;
        const dstY = slot * h;

        // Cellules de motif visibles dans la fenêtre [srcX, srcX+w] — on ne rend
        // QUE celles-là (aucun élément ne dépasse bandWidth → pas d'OOM).
        const firstCell = Math.floor(srcX / spacingPx);
        const lastCell = Math.ceil((srcX + w) / spacingPx) - 1;
        const cells: number[] = [];
        for (let c = firstCell; c <= lastCell; c++) cells.push(c);

        return (
          <div
            key={`band-${i}`}
            data-band-index={i}
            style={{ position: 'absolute', left: 0, top: dstY, width: w, height: h, overflow: 'hidden', background: '#000' }}
          >
            {/* Fond par zone (segments intersectant la fenêtre de la bande) */}
            {(zones === 'per-side' ? sideBounds : [{ start: 0, end: g.ribbonWidth, index: 0 }]).map((b) => {
              const segStart = Math.max(b.start, srcX);
              const segEnd = Math.min(b.end, srcX + w);
              if (segEnd <= segStart) return null;
              return (
                <div
                  key={`seg-${i}-${b.index}`}
                  style={{
                    position: 'absolute',
                    left: segStart - srcX,
                    top: 0,
                    width: segEnd - segStart,
                    height: h,
                    background: SIDE_COLORS[b.index % SIDE_COLORS.length],
                  }}
                />
              );
            })}

            {/* Motif répété (cellules visibles uniquement) */}
            {cells.map((c) => (
              <div
                key={`cell-${i}-${c}`}
                style={{
                  position: 'absolute',
                  left: c * spacingPx - srcX,
                  top: 0,
                  width: spacingPx,
                  height: h,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontFamily: 'sans-serif',
                  fontWeight: 800,
                  fontSize: Math.round(h * 0.42),
                  borderRight: '1px solid rgba(255,255,255,0.12)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label} · {c + 1}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
