import React from 'react';
import { Player } from '@remotion/player';
import {
  FaitsDeJeuComposition,
  faitsDeJeuSchema,
} from '../../../src/templates/faits_de_jeu/Composition';
// POC : pour les templates BUT et ENTRÉE on consomme les .tsx legacy depuis src/
// afin de montrer le rendu existant fidèlement dans la maquette. Lors de S1 ces
// templates seront ré-écrits proprement dans templates/<slug>/Composition.tsx
// (sans TemplateRuntime). Le smoke test risque #1 reste vert car il scanne
// uniquement src/templates/, pas studio-poc/.
import {
  JoueurButGeneriqueV1,
  joueurButGeneriqueV1Schema,
} from '../../../src/JoueurButGeneriqueV1';
import {
  JoueurEntreeGenerique,
  joueurEntreeGeneriqueSchema,
} from '../../../src/JoueurEntreeGenerique';
import type { ResolvedProps } from '../resolver';

const PREVIEW_WIDTH = 480;

type RegistryEntry = {
  component: React.ComponentType<Record<string, unknown>>;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  // adapter: prend le payload résolu (V1 brand-aware) → props que le composant attend.
  adapter: (resolved: ResolvedProps) => Record<string, unknown>;
};

// Convertit "Kévin Dupont" → "KÉVIN\nDUPONT" pour les templates legacy.
function splitName(full: string | null | undefined): string {
  if (!full) return 'PRÉNOM\nNOM';
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase();
  const prenom = parts[0];
  const nom = parts.slice(1).join(' ');
  return `${prenom.toUpperCase()}\n${nom.toUpperCase()}`;
}

const REGISTRY: Record<string, RegistryEntry> = {
  FaitsDeJeuStory: {
    component: FaitsDeJeuComposition as React.ComponentType<Record<string, unknown>>,
    width: 1920,
    height: 1080,
    fps: 25,
    durationInFrames: 250,
    adapter: (r) =>
      faitsDeJeuSchema.parse({
        label: r.label ?? '2MIN',
      }) as unknown as Record<string, unknown>,
  },
  ButGeneriqueStory: {
    component: JoueurButGeneriqueV1 as React.ComponentType<Record<string, unknown>>,
    width: 1920,
    height: 1080,
    fps: 25,
    durationInFrames: 175,
    adapter: (r) =>
      joueurButGeneriqueV1Schema.parse({
        prenomNom: splitName(r.scorerName as string | null),
        nomClub: (r.clubName as string) || 'NOM DU CLUB',
        numero: r.scorerNumber != null ? String(r.scorerNumber) : '9',
        titre: 'BUT',
        photoJoueur: (r.scorerPhoto as string) || 'photos/001.png',
        logoSrc: (r.clubLogo as string) || 'logo_club.png',
      }) as unknown as Record<string, unknown>,
  },
  EntreeJoueurStory: {
    component: JoueurEntreeGenerique as React.ComponentType<Record<string, unknown>>,
    width: 1920,
    height: 1080,
    fps: 25,
    durationInFrames: 175,
    adapter: (r) =>
      joueurEntreeGeneriqueSchema.parse({
        prenomNom: splitName(r.playerName as string | null),
        nomClub: (r.clubName as string) || 'NOM DU CLUB',
        numero: r.playerNumber != null ? String(r.playerNumber) : '9',
        photoJoueur: (r.playerPhoto as string) || 'photos/001.png',
      }) as unknown as Record<string, unknown>,
  },
};

type Props = {
  compositionId: string;
  resolved: ResolvedProps;
};

export const RemotionPreview: React.FC<Props> = ({ compositionId, resolved }) => {
  const entry = REGISTRY[compositionId];

  if (!entry) {
    return (
      <div className="muted small">
        ⚠ compositionId <code>{compositionId}</code> non enregistré dans REGISTRY.
      </div>
    );
  }

  const inputProps = entry.adapter(resolved);
  const aspectRatio = entry.height / entry.width;
  const previewHeight = Math.round(PREVIEW_WIDTH * aspectRatio);

  // Critique : staticFile() à l'intérieur des compositions (TemplateRuntime,
  // FaitsDeJeuComposition) résout les URLs WebM/PNG via publicPath. Sans ça les
  // assets sont absents → frame noire. Pattern repris de templates-remotion/preview/.
  const publicPath = new URL('/', window.location.href).href;

  return (
    <div>
      <Player
        component={entry.component}
        inputProps={inputProps as unknown as Record<string, unknown>}
        durationInFrames={entry.durationInFrames}
        compositionWidth={entry.width}
        compositionHeight={entry.height}
        fps={entry.fps}
        style={{ width: PREVIEW_WIDTH, height: previewHeight, borderRadius: 8 }}
        controls
        loop
        autoPlay
        initiallyMuted
        acknowledgeRemotionLicense
        publicPath={publicPath}
      />
      <p className="muted small">
        {entry.width}×{entry.height} · {entry.fps}fps · {entry.durationInFrames}{' '}
        frames
      </p>
    </div>
  );
};
