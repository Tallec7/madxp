import React from 'react';
import type { Manifest } from '../catalog';
import type { ResolvedProps } from '../resolver';

type Props = {
  manifest: Manifest;
  resolved: ResolvedProps;
};

const FRAME_W = 270;
const SCALE = FRAME_W / 1080;
const FRAME_H = Math.round(1920 * SCALE);

export const FakePreview: React.FC<Props> = ({ manifest, resolved }) => {
  const primary = (resolved.primaryColor as string) || '#0066ff';
  const secondary = (resolved.secondaryColor as string) || '#ffffff';
  const logo = resolved.clubLogo as string | null;
  const clubName = (resolved.clubName as string) || '';

  const isBut = manifest.id === 'but_generique';
  const isEntree = manifest.id === 'entree_joueur';
  const isFaits = manifest.id === 'faits_de_jeu';

  const photo =
    (resolved.scorerPhoto as string | null) ||
    (resolved.playerPhoto as string | null);
  const name =
    (resolved.scorerName as string | null) ||
    (resolved.playerName as string | null);
  const number =
    (resolved.scorerNumber as number | null) ??
    (resolved.playerNumber as number | null);

  return (
    <div
      className="preview-frame"
      style={{
        width: FRAME_W,
        height: FRAME_H,
        background: `linear-gradient(180deg, ${primary} 0%, #111 100%)`,
        color: secondary,
      }}
    >
      <div className="preview-meta">
        <span className="badge">{manifest.format.width}×{manifest.format.height}</span>
      </div>

      {logo ? (
        <img className="preview-logo" src={logo} alt="logo" />
      ) : null}

      {isFaits && (
        <div className="preview-faits">
          <div className="faits-label" style={{ color: secondary }}>
            {(resolved.label as string) || '—'}
          </div>
          <div className="faits-club">{clubName}</div>
        </div>
      )}

      {(isBut || isEntree) && photo ? (
        <img
          className="preview-photo"
          src={photo}
          alt="joueur"
          style={{ borderColor: secondary }}
        />
      ) : null}

      {(isBut || isEntree) && (
        <div className="preview-player-block">
          {number != null && <div className="player-number">#{number}</div>}
          <div className="player-name">{name || '—'}</div>
          {isBut && resolved.minute != null && (
            <div className="player-minute">
              <span style={{ background: secondary, color: primary }}>
                {resolved.minute as number}&apos;
              </span>{' '}
              BUT
            </div>
          )}
          {isEntree && resolved.playerPoste && (
            <div className="player-minute">{resolved.playerPoste as string}</div>
          )}
          {isBut && resolved.assistName ? (
            <div className="player-assist">
              passe : {resolved.assistName as string}
            </div>
          ) : null}
        </div>
      )}

      <div className="preview-footer">{clubName}</div>
    </div>
  );
};
