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
import {
  LedPerimeterRibbonComposition,
  ledPerimeterRibbonSchema,
  calculateLedRibbonMetadata,
} from './templates/led_perimeter_ribbon/Composition';
import {
  LedPerimeterFoldedComposition,
  ledPerimeterFoldedSchema,
  calculateLedFoldedMetadata,
} from './templates/led_perimeter_folded/Composition';

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
        durationInFrames={175}
        fps={25}
        width={1920}
        height={1080}
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
        durationInFrames={175}
        fps={25}
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

      {/*
        POC LED périmétrique (PROP-014 étape 3). Dimensions DYNAMIQUES via
        calculateMetadata — width/height ci-dessous ne sont que des fallbacks
        Remotion Studio, surchargés au render par le profil LED. Pas de manifest
        ni de row DB : compo POC rendue directement par `npm run led:ribbon-poc`
        (le seed templates-studio skippe les dossiers sans manifest.json).
      */}
      <Composition
        id="LedPerimeterRibbon"
        component={LedPerimeterRibbonComposition}
        calculateMetadata={calculateLedRibbonMetadata}
        durationInFrames={50}
        fps={25}
        width={1920}
        height={160}
        schema={ledPerimeterRibbonSchema}
        defaultProps={{
          sides: [40, 20, 20],
          pitchMm: 6,
          height: 160,
          spacingM: 10,
          zones: 'uniform',
          bandWidth: 1920,
          label: 'MADXP',
        }}
      />

      {/*
        Composition de PRODUCTION (PROP-014 étape 3) — ruban rendu directement PLIÉ
        (canvas ≤ bandWidth × N). Stratégie validée par le POC (flat OOM ≥10000px).
        Dimensions dynamiques via calculateMetadata. Pas de manifest (skeleton, le
        binding motif/asset viendra plus tard).
      */}
      <Composition
        id="LedPerimeterFolded"
        component={LedPerimeterFoldedComposition}
        calculateMetadata={calculateLedFoldedMetadata}
        durationInFrames={50}
        fps={25}
        width={1920}
        height={1120}
        schema={ledPerimeterFoldedSchema}
        defaultProps={{
          sides: [40, 20, 20],
          pitchMm: 6,
          height: 160,
          spacingM: 10,
          zones: 'uniform',
          bandWidth: 1920,
          order: 'top-to-bottom',
          label: 'MADXP',
        }}
      />
    </>
  );
};
