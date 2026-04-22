/**
 * ADR-086 — Safe-zones image slots.
 * Calcule les styles CSS d'un wrapper image à partir de :
 *   - anchor        (point d'ancrage dans le rectangle safe)
 *   - fit_mode      (comment l'image remplit le rectangle safe)
 *   - safe zone     (sous-rectangle du canvas, en pourcentages)
 *   - overflow      (direction autorisée de débordement)
 *
 * Backward-compat : si aucune safe-zone n'est définie, on retombe sur
 * le comportement historique (position/size du slot + object-fit: contain).
 */

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type FitMode =
  | 'contain'
  | 'cover'
  | 'fill-width-anchor-top'
  | 'fill-height-anchor-left';

export type Overflow = 'hidden' | 'visible' | 'top' | 'bottom' | 'left' | 'right';

export interface SafeZone {
  topPct: number | null;
  leftPct: number | null;
  widthPct: number | null;
  heightPct: number | null;
}

export interface FitModeInput {
  /** Position/size historique du slot (fallback si pas de safe-zone) */
  slotPosition: { x: number; y: number; width: number; height: number };
  anchor: Anchor;
  fitMode: FitMode;
  safeZone: SafeZone;
  overflow: Overflow;
}

export interface FitModeResult {
  /** Styles du wrapper absolu (qui porte la safe-zone) */
  wrapper: React.CSSProperties;
  /** Styles du <img> (objectFit + objectPosition adaptés au fit_mode) */
  img: React.CSSProperties;
}

const anchorToObjectPosition = (anchor: Anchor): string => {
  const [y, x] = anchor.split('-');
  return `${x} ${y}`;
};

const overflowToCss = (overflow: Overflow): React.CSSProperties['overflow'] => {
  if (overflow === 'hidden' || overflow === 'visible') return overflow;
  return 'visible';
};

const hasSafeZone = (sz: SafeZone): boolean =>
  sz.topPct !== null &&
  sz.leftPct !== null &&
  sz.widthPct !== null &&
  sz.heightPct !== null;

export function computeImageStyle(input: FitModeInput): FitModeResult {
  const { slotPosition, anchor, fitMode, safeZone, overflow } = input;

  if (!hasSafeZone(safeZone)) {
    return {
      wrapper: {
        position: 'absolute',
        left: `${slotPosition.x * 100}%`,
        top: `${slotPosition.y * 100}%`,
        width: `${slotPosition.width * 100}%`,
        height: `${slotPosition.height * 100}%`,
        transform: 'translate(-50%, -50%)',
      },
      img: { width: '100%', height: '100%', objectFit: 'contain' },
    };
  }

  const wrapperBase: React.CSSProperties = {
    position: 'absolute',
    left: `${safeZone.leftPct}%`,
    top: `${safeZone.topPct}%`,
    width: `${safeZone.widthPct}%`,
    height: `${safeZone.heightPct}%`,
    overflow: overflowToCss(overflow),
  };

  switch (fitMode) {
    case 'contain':
    case 'cover':
      return {
        wrapper: wrapperBase,
        img: {
          width: '100%',
          height: '100%',
          objectFit: fitMode,
          objectPosition: anchorToObjectPosition(anchor),
        },
      };

    case 'fill-width-anchor-top':
      return {
        wrapper: wrapperBase,
        img: {
          width: '100%',
          height: 'auto',
          objectFit: 'none',
          objectPosition: 'top',
          display: 'block',
        },
      };

    case 'fill-height-anchor-left':
      return {
        wrapper: wrapperBase,
        img: {
          width: 'auto',
          height: '100%',
          objectFit: 'none',
          objectPosition: 'left',
          display: 'block',
        },
      };

    default: {
      const _exhaustive: never = fitMode;
      void _exhaustive;
      return {
        wrapper: wrapperBase,
        img: { width: '100%', height: '100%', objectFit: 'contain' },
      };
    }
  }
}
