import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

// Flat-top hexagon: vertices at left/right, flat edges top/bottom
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;

// Base radii for concentric rings (inner → outer)
const BASE_RADII = [290, 390, 490, 590, 690, 790, 890];

export const ShieldPattern: React.FC = () => {
  const frame = useCurrentFrame();

  // Slow global scale outward over 30s
  const scale = interpolate(frame, [0, 750], [1.0, 1.18]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, overflow: 'hidden' }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        {BASE_RADII.map((baseR, i) => {
          // Outer rings are more transparent
          const opacity = interpolate(i, [0, BASE_RADII.length - 1], [0.35, 0.06]);
          const strokeWidth = interpolate(i, [0, BASE_RADII.length - 1], [2.5, 1.5]);
          return (
            <polygon
              key={i}
              points={hexPoints(CX, CY, baseR)}
              fill="none"
              stroke="rgba(180,210,255,1)"
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );
        })}
      </svg>
    </div>
  );
};
