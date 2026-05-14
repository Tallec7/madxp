import React from 'react';
import { Composition } from 'remotion';
import {
  ButGeneriqueComposition,
  butGeneriqueSchema,
} from './templates/but_generique/Composition';
import {
  EntreeJoueurComposition,
  entreeJoueurSchema,
} from './templates/entree_joueur/Composition';
import {
  FaitsDeJeuComposition,
  faitsDeJeuSchema,
} from './templates/faits_de_jeu/Composition';

/**
 * Registre Remotion des compositions Templates Studio.
 *
 * Chaque `<Composition id="...">` doit matcher le `compositionId` du manifest
 * du template (`templates/<slug>/manifest.json`). Le worker render appelle
 * `selectComposition({ id: compositionId })` puis `renderMedia({ composition })`
 * — si l'ID ne match pas, render fail avec "Unknown composition".
 */
export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ButGeneriqueStory"
        component={ButGeneriqueComposition}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        schema={butGeneriqueSchema}
        defaultProps={{
          scorerName: 'PRÉNOM NOM',
          scorerNumber: '10',
          scorerPhoto: null,
          assistName: null,
          minute: 45,
          clubName: 'NOM DU CLUB',
          clubLogo: null,
          primaryColor: '#0a1d3b',
          secondaryColor: '#ffffff',
        }}
      />

      <Composition
        id="EntreeJoueurStory"
        component={EntreeJoueurComposition}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        schema={entreeJoueurSchema}
        defaultProps={{
          playerName: 'PRÉNOM NOM',
          playerNumber: '10',
          playerPhoto: null,
          playerPoste: 'GARDIEN',
          clubName: 'NOM DU CLUB',
          clubLogo: null,
          primaryColor: '#0a1d3b',
          secondaryColor: '#ffffff',
        }}
      />

      <Composition
        id="FaitsDeJeuStory"
        component={FaitsDeJeuComposition}
        durationInFrames={250}
        fps={25}
        width={1920}
        height={1080}
        schema={faitsDeJeuSchema}
        defaultProps={{ label: '2MIN' }}
      />
    </>
  );
};
