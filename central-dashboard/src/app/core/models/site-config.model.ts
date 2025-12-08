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

// Sponsor (vidéo de boucle partenaires)
// Format compatible avec l'app :8080
export interface SponsorConfig {
  name: string;
  type: string;  // ex: "video/mp4"
  path: string;  // ex: "videos/BOUCLE_PARTENAIRES/video.mp4"
}

// Vidéo dans une catégorie
// Format compatible avec l'app :8080
export interface VideoConfig {
  name: string;
  type: string;  // ex: "video/mp4"
  path: string;  // ex: "videos/CATEGORY/video.mp4"
}

// Sous-catégorie de vidéos
export interface SubcategoryConfig {
  id: string;
  name: string;
  videos: VideoConfig[];
}

// Catégorie de vidéos
export interface CategoryConfig {
  id: string;
  name: string;
  videos: VideoConfig[];
  subCategories: SubcategoryConfig[];
}

// Configuration complète du site
export interface SiteConfiguration {
  version: string;
  remote: RemoteConfig;
  auth: AuthConfig;
  sync: SyncConfig;
  sponsors: SponsorConfig[];
  categories: CategoryConfig[];
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
  version: '1.0',
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
    serverUrl: 'https://neopro-central-server.onrender.com',
    siteName: '',
    clubName: '',
  },
  sponsors: [],
  categories: [],
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
