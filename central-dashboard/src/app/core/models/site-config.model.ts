/**
 * Interfaces pour la configuration des sites NEOPRO
 * Structure typée pour remplacer l'édition JSON brute
 */

// Section Remote (télécommande)
export interface RemoteConfig {
  title: string;
}

// Section Auth (authentification)
export interface AuthConfig {
  password: string;
  clubName: string;
  sessionDuration: number; // en millisecondes (défaut: 28800000 = 8h)
}

// Section Sync (synchronisation)
export interface SyncConfig {
  enabled: boolean;
  serverUrl: string;
  siteName: string;
  clubName: string;
}

/**
 * Configuration d'une vidéo dans la boucle de lecture.
 * Les vidéos de la boucle sont souvent des sponsors mais pas exclusivement
 * (peuvent inclure des annonces club, des animations, etc.)
 *
 * Format compatible avec l'app Raspberry :8080
 */
export interface LoopVideoConfig {
  name: string;
  type: string;        // ex: "video/mp4"
  path: string;        // ex: "videos/BOUCLE/video.mp4"
  owner?: ContentOwner; // 'neopro' ou 'club'
  locked?: boolean;    // true = non modifiable par le club
  video_id?: string;   // UUID de la vidéo dans la table videos (pour tracking analytics)
  /** @deprecated Utiliser site_sponsor_id */
  sponsor_id?: string; // Ancien champ — conservé pour rétrocompatibilité configs existantes
  site_sponsor_id?: string; // UUID du site_sponsor unifié (tracking granulaire par site)
}

/**
 * @deprecated Utiliser LoopVideoConfig à la place.
 * Conservé pour rétrocompatibilité avec les configurations existantes.
 */
export type SponsorConfig = LoopVideoConfig;

// Type de propriétaire du contenu
export type ContentOwner = 'neopro' | 'club';

// Vidéo dans une catégorie
// Format compatible avec l'app :8080
export interface VideoConfig {
  name: string;
  type: string;  // ex: "video/mp4"
  path: string;  // ex: "videos/CATEGORY/video.mp4"
  owner?: ContentOwner; // 'neopro' = contenu central, 'club' = contenu local
  locked?: boolean;  // true = non modifiable par le club
  deployed_at?: string;  // ISO date - quand la vidéo a été déployée par NEOPRO
  expires_at?: string;  // ISO date - expiration automatique (annonces temporaires)
  site_sponsor_id?: string; // Auto-résolu depuis site_sponsor_videos au déploiement
}

// Sous-catégorie de vidéos
export interface SubcategoryConfig {
  id: string;
  name: string;
  owner?: ContentOwner;  // 'neopro' = contenu central, 'club' = contenu local
  locked?: boolean;  // true = non modifiable par le club
  videos: VideoConfig[];
}

// Catégorie de vidéos
export interface CategoryConfig {
  id: string;
  name: string;
  locked?: boolean;  // true = catégorie gérée par NEOPRO, non modifiable
  owner?: ContentOwner;  // 'neopro' = contenu central, 'club' = contenu local
  videos: VideoConfig[];
  subCategories: SubcategoryConfig[];
}

/**
 * TimeCategory pour organiser les catégories dans /remote (Avant-match, Match, Après-match).
 * Chaque phase peut avoir sa propre boucle de vidéos spécifique.
 */
export interface TimeCategoryConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  categoryIds: string[]; // IDs des catégories assignées à ce bloc
  /**
   * Vidéos de la boucle spécifique à cette phase de jeu.
   * Si non défini ou vide, la boucle globale (loopVideos[]) sera utilisée.
   */
  loopVideos?: LoopVideoConfig[];
}

/**
 * Configuration complète d'un site Neopro.
 * Structure principale stockée sur le Raspberry Pi et synchronisée avec le central.
 */
export interface SiteConfiguration {
  version: string;
  remote: RemoteConfig;
  auth: AuthConfig;
  sync: SyncConfig;
  /**
   * Boucle de vidéos globale (sponsors, annonces, animations).
   * Jouée automatiquement en mode boucle ou quand aucune vidéo spécifique n'est sélectionnée.
   * @deprecated Le champ s'appelle 'sponsors' pour rétrocompatibilité mais contient des LoopVideoConfig
   */
  sponsors: LoopVideoConfig[];
  categories: CategoryConfig[];
  timeCategories?: TimeCategoryConfig[]; // Organisation des catégories pour /remote
  /**
   * Mapping des catégories de vidéos vers les catégories analytics.
   * Clé: ID de la catégorie vidéo (ex: "But", "Entrée")
   * Valeur: ID de la catégorie analytics (ex: "jingle", "ambiance")
   */
  categoryMappings?: Record<string, string>;
  // Champs optionnels pour extensions futures
  [key: string]: unknown;
}

// Historique de configuration
export interface ConfigHistory {
  id: string;
  site_id: string;
  configuration: SiteConfiguration;
  deployed_by: string;
  deployed_by_email?: string;
  deployed_by_name?: string;
  deployed_at: Date;
  comment?: string;
  changes_summary?: ConfigDiff[];
}

// Résultat de validation
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ConfigValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Diff entre deux configurations
export interface ConfigDiff {
  field: string;
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

// Valeurs par défaut
export const DEFAULT_CONFIG: Partial<SiteConfiguration> = {
  version: '2.0',
  remote: {
    title: 'Telecommande Neopro',
  },
  auth: {
    password: '',
    clubName: '',
    sessionDuration: 28800000, // 8 heures
  },
  sync: {
    enabled: true,
    serverUrl: 'https://neopro-central-production.up.railway.app',
    siteName: '',
    clubName: '',
  },
  sponsors: [],
  categories: [],
  timeCategories: [
    {
      id: 'before',
      name: 'Avant-match',
      icon: '🏁',
      color: 'from-blue-500 to-blue-600',
      description: 'Échauffement & présentation',
      categoryIds: [],
    },
    {
      id: 'during',
      name: 'Match',
      icon: '▶️',
      color: 'from-green-500 to-green-600',
      description: 'Live & animations',
      categoryIds: [],
    },
    {
      id: 'after',
      name: 'Après-match',
      icon: '🏆',
      color: 'from-purple-500 to-purple-600',
      description: 'Résultats & remerciements',
      categoryIds: [],
    },
  ],
};

// Schéma de validation
export const CONFIG_SCHEMA = {
  required: ['auth', 'auth.clubName'],
  fields: {
    'remote.title': {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    'auth.password': {
      type: 'string',
      minLength: 0,
      maxLength: 100,
    },
    'auth.clubName': {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
    },
    'auth.sessionDuration': {
      type: 'number',
      min: 300000, // 5 minutes min
      max: 604800000, // 7 jours max
    },
    'sync.enabled': {
      type: 'boolean',
    },
    'sync.serverUrl': {
      type: 'string',
      pattern: /^https?:\/\/.+/,
    },
    'sync.siteName': {
      type: 'string',
      maxLength: 100,
    },
    'sync.clubName': {
      type: 'string',
      maxLength: 100,
    },
  },
};
