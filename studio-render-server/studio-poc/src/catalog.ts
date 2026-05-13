// Catalogue de 3 manifests hardcodés pour la maquette.
// En V1 réelle, ces JSON viendront de templates-remotion/src/templates/<slug>/manifest.json
// et seront seedés dans la table template_definitions de Postgres.

export type BindingSource =
  | { source: `input.${string}`; transform?: string }
  | { source: `brandKit.${string}` }
  | { source: 'literal'; value: unknown };

export type Manifest = {
  id: string;
  version: string;
  label: string;
  description: string;
  // 'video' → renderMedia → MP4 ; 'still' → renderStill → PNG (1 frame).
  kind: 'video' | 'still';
  inputSchema: {
    type: 'object';
    required: string[];
    properties: Record<
      string,
      {
        type: 'string' | 'integer' | 'number';
        ref?: 'Player';
        label?: string;
        minimum?: number;
        maximum?: number;
        enum?: string[];
      }
    >;
  };
  bindings: Record<string, BindingSource>;
  format: { width: number; height: number };
  compositionId: string;
};

export const CATALOG: Manifest[] = [
  {
    id: 'but_generique',
    version: '1.0.0',
    label: 'BUT — Générique',
    description: 'Animation but avec nom du buteur, numéro, photo détourée et minute.',
    kind: 'video',
    inputSchema: {
      type: 'object',
      required: ['scorerPlayerId', 'minute'],
      properties: {
        scorerPlayerId: { type: 'string', ref: 'Player', label: 'Buteur' },
        assistPlayerId: { type: 'string', ref: 'Player', label: 'Passeur (optionnel)' },
        minute: { type: 'integer', minimum: 1, maximum: 130, label: 'Minute du but' },
      },
    },
    bindings: {
      scorerName: { source: 'input.scorerPlayerId', transform: 'player.fullName' },
      scorerNumber: { source: 'input.scorerPlayerId', transform: 'player.number' },
      scorerPhoto: { source: 'input.scorerPlayerId', transform: 'player.cutoutUrl' },
      assistName: { source: 'input.assistPlayerId', transform: 'player.fullName' },
      minute: { source: 'input.minute' },
      clubName: { source: 'brandKit.clubName' },
      clubLogo: { source: 'brandKit.logos.primary' },
      primaryColor: { source: 'brandKit.colors.primary' },
      secondaryColor: { source: 'brandKit.colors.secondary' },
    },
    format: { width: 1080, height: 1920 },
    compositionId: 'ButGeneriqueStory',
  },
  {
    id: 'entree_joueur',
    version: '1.0.0',
    label: 'ENTRÉE Joueur',
    description: 'Présentation joueur (image fixe — frame finale du packshot).',
    kind: 'still',
    inputSchema: {
      type: 'object',
      required: ['playerId'],
      properties: {
        playerId: { type: 'string', ref: 'Player', label: 'Joueur' },
      },
    },
    bindings: {
      playerName: { source: 'input.playerId', transform: 'player.fullName' },
      playerNumber: { source: 'input.playerId', transform: 'player.number' },
      playerPhoto: { source: 'input.playerId', transform: 'player.cutoutUrl' },
      playerPoste: { source: 'input.playerId', transform: 'player.poste' },
      clubName: { source: 'brandKit.clubName' },
      clubLogo: { source: 'brandKit.logos.primary' },
      primaryColor: { source: 'brandKit.colors.primary' },
      secondaryColor: { source: 'brandKit.colors.secondary' },
    },
    format: { width: 1080, height: 1920 },
    compositionId: 'EntreeJoueurStory',
  },
  {
    id: 'faits_de_jeu',
    version: '1.0.0',
    label: 'FAITS DE JEU',
    description: 'Bandeau "2MIN", "PÉNALTY", etc.',
    kind: 'video',
    inputSchema: {
      type: 'object',
      required: ['label'],
      properties: {
        label: {
          type: 'string',
          label: 'Type',
          enum: ['2MIN', 'PÉNALTY', 'CARTON JAUNE', 'CARTON ROUGE', 'CHANGEMENT'],
        },
      },
    },
    bindings: {
      label: { source: 'input.label' },
      clubName: { source: 'brandKit.clubName' },
      clubLogo: { source: 'brandKit.logos.primary' },
      primaryColor: { source: 'brandKit.colors.primary' },
    },
    format: { width: 1080, height: 1920 },
    compositionId: 'FaitsDeJeuStory',
  },
];
