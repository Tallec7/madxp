import React from 'react';
import type { BrandKit } from '../mocks';

type Props = {
  brandKit: BrandKit;
  onChange: (next: BrandKit) => void;
};

export const BrandKitPanel: React.FC<Props> = ({ brandKit, onChange }) => {
  const setColor = (key: 'primary' | 'secondary' | 'accent', val: string) =>
    onChange({ ...brandKit, colors: { ...brandKit.colors, [key]: val } });

  return (
    <div className="panel">
      <h3>Brand Kit</h3>
      <label className="field">
        <span>Nom club</span>
        <input
          type="text"
          value={brandKit.clubName}
          onChange={(e) => onChange({ ...brandKit, clubName: e.target.value })}
        />
      </label>
      <div className="colors">
        <label className="field">
          <span>Primaire</span>
          <input
            type="color"
            value={brandKit.colors.primary}
            onChange={(e) => setColor('primary', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Secondaire</span>
          <input
            type="color"
            value={brandKit.colors.secondary}
            onChange={(e) => setColor('secondary', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Accent</span>
          <input
            type="color"
            value={brandKit.colors.accent}
            onChange={(e) => setColor('accent', e.target.value)}
          />
        </label>
      </div>
      <div className="logo-preview">
        <img src={brandKit.logos.primary} alt="Logo club" />
      </div>
    </div>
  );
};
