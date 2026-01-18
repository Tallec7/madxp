/**
 * Positions disponibles pour l'overlay (9 positions)
 */
export type OverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Configuration de l'overlay du score affiché sur la TV
 * Permet de personnaliser la position, les couleurs et les tailles
 */
export interface ScoreOverlayConfig {
  /** Position de l'overlay (9 positions disponibles) */
  position?: OverlayPosition;
  /** Distance horizontale du bord (en pixels) */
  offsetX?: number;
  /** Distance verticale du bord (en pixels) */
  offsetY?: number;
  /** Couleur de fond (format CSS, ex: 'rgba(0, 0, 0, 0.85)') */
  backgroundColor?: string;
  /** Arrondi des coins (en pixels) */
  borderRadius?: number;
  /** Couleur du score (format CSS, ex: '#4caf50') */
  scoreColor?: string;
  /** Taille du score (en pixels) */
  scoreSize?: number;
  /** Couleur des noms d'équipe */
  teamNameColor?: string;
  /** Taille des noms d'équipe (en pixels) */
  teamNameSize?: number;
}

export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'advertiser' | 'sponsor' | 'agency';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  advertiser_id?: string | null;
  sponsor_id?: string | null;
  agency_id?: string | null;
  created_at: Date;
  last_login_at: Date;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Site {
  id: string;
  site_name: string;
  club_name: string;
  location: {
    city?: string;
    region?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  } | null;
  sports: string[] | null;
  status: 'online' | 'offline' | 'maintenance' | 'error';
  last_seen_at: Date | null;
  last_ip: string | null;
  local_ip: string | null;
  software_version: string | null;
  hardware_model: string;
  api_key: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  /**
   * Active l'affichage du score en live et l'accès aux options avancées sur la télécommande
   * Option premium activable par NEOPRO
   */
  live_score_enabled?: boolean;
  /**
   * Configuration NEOPRO déployée sur le site
   * Contient les paramètres gérés centralement (catégories, vidéos, etc.)
   */
  neoProContent?: {
    liveScoreEnabled?: boolean;
    scoreOverlay?: ScoreOverlayConfig;
    [key: string]: unknown;
  };
  /**
   * Miroir de la configuration locale du Pi
   * Contient les vidéos locales, le stockage, et le SSID du hotspot
   */
  local_config_mirror?: {
    _localVideos?: Array<{
      filename: string;
      path: string;
      category: string;
      subcategory?: string;
      size: number;
      lastModified: string;
    }>;
    _localStorage?: {
      total: number;
      used: number;
      free: number;
    };
    _hotspotSsid?: string;
    _hotspotInfo?: {
      ssid: string | null;
      channel: number | null;
      password: string | null;
      clients: number;
      isActive: boolean;
    };
    _lastVideoSync?: string;
    _networkProfile?: NetworkProfile;
    [key: string]: unknown;
  };
  /**
   * Profil réseau détecté par le Pi
   * Stocké dans une colonne dédiée pour faciliter les requêtes
   */
  network_profile?: NetworkProfile;
  network_profile_updated_at?: Date;
}

/**
 * Profil réseau détecté par le NetworkDetector du Pi
 * Permet d'adapter le comportement selon l'environnement
 */
export interface NetworkProfile {
  /** Type de réseau: simple | mesh | mesh_isolated | enterprise | unknown */
  type: 'simple' | 'mesh' | 'mesh_isolated' | 'enterprise' | 'unknown';
  /** Nombre de points d'accès détectés avec le même SSID */
  apCount: number;
  /** BSSID verrouillé dans wpa_supplicant (dangereux en mesh) */
  bssidLocked: boolean;
  /** Isolation client détectée (pas de visibilité des autres clients) */
  hasIsolation?: boolean;
  /** Score de stabilité (0-100) basé sur les déconnexions récentes */
  stabilityScore?: number;
  /** Nombre de warnings actifs */
  warningCount?: number;
  /** Date de la dernière détection */
  detectedAt?: string;
}

export interface GroupMetadata {
  sport?: string;
  region?: string;
  target_version?: string;
  [key: string]: unknown;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: 'sport' | 'geography' | 'version' | 'custom';
  filters: Record<string, unknown> | null;
  metadata?: GroupMetadata | null;
  created_at: Date;
  updated_at: Date;
  site_count?: number;
  sites?: Site[];
}

export interface Video {
  id: string;
  filename: string;
  original_name: string;
  category: string | null;
  subcategory: string | null;
  file_size: number;
  duration: number | null;
  mime_type: string | null;
  storage_path: string;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Vidéo locale présente sur un Raspberry Pi
 * Synchronisée via sync_local_state
 */
export interface LocalVideo {
  filename: string;
  path: string;
  category: string | null;
  subcategory: string | null;
  size: number;
  duration: number | null; // Durée en secondes (extraite via ffprobe sur le Pi)
  lastModified: string;
  checksum: string | null;
}

/**
 * Vidéo stockée dans le cloud (table videos)
 * Peut être déployée vers les Pi
 */
export interface CloudVideo {
  id: string;
  filename: string;
  originalName: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  size: number;
  duration: number | null;
  checksum: string | null;
  url: string;
  uploadedForSiteId: string | null; // Site for which this video was uploaded (contextual upload)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Informations de stockage d'un Raspberry Pi
 */
export interface LocalStorage {
  total: number;
  used: number;
  free: number;
}

export interface Metrics {
  id: string;
  site_id: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
  uptime: number | null;
  network_status: Record<string, unknown> | null;
  recorded_at: Date;
}

export interface Alert {
  id: string;
  site_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: Date;
  resolved_at: Date | null;
}

export interface ContentDeployment {
  id: string;
  video_id: string;
  target_type: 'site' | 'group';
  target_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error_message: string | null;
  deployed_by: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface UpdateDeployment {
  id: string;
  update_id: string;
  target_type: 'site' | 'group';
  target_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  progress: number;
  error_message: string | null;
  deployed_by: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface SiteStats {
  total_sites: number;
  online: number;
  offline: number;
  maintenance: number;
  error: number;
}

export type ConnectionDisplayStatus = 'online' | 'offline' | 'warning' | 'unknown';

/**
 * État de santé de la connexion WebSocket
 * Permet de détecter les "connexions zombies" (socket présente mais non fonctionnelle)
 */
export interface ConnectionHealth {
  /** Socket présente dans la map connectedSites */
  socketInMap: boolean;
  /** Socket réellement connectée (pas zombie) */
  socketConnected: boolean;
  /** Âge du dernier pong en millisecondes (null si jamais reçu) */
  lastPongAgeMs: number | null;
  /** Connexion saine et fonctionnelle */
  isHealthy: boolean;
  /** Raison de l'état (healthy, not_in_map, socket_disconnected, pong_stale, no_pong_received) */
  reason: string;
}

export interface SiteConnectionStatus {
  siteId: string;
  siteName: string;
  clubName: string;
  connection: {
    isConnected: boolean;
    displayStatus: ConnectionDisplayStatus;
    lastSeenAt: Date | null;
    secondsSinceLastSeen: number | null;
    localIp: string | null;
  };
  sync: {
    lastConfigSync: Date | null;
  };
  statistics: {
    heartbeats24h: number;
    uptime24h: number;
    firstHeartbeat24h: Date | null;
    lastHeartbeat24h: Date | null;
  };
  /** État de santé détaillé de la connexion WebSocket */
  health?: ConnectionHealth;
}

export interface SiteConnectionSummary {
  siteId: string;
  siteName: string;
  clubName: string;
  isConnected: boolean;
  displayStatus: ConnectionDisplayStatus;
  lastSeenAt: Date | null;
  secondsSinceLastSeen: number | null;
  localIp: string | null;
}

export interface AllSitesConnectionStatus {
  sites: SiteConnectionSummary[];
  stats: {
    total: number;
    online: number;
    warning: number;
    offline: number;
    unknown: number;
  };
  timestamp: string;
}

/**
 * Catégorie analytics pour le tracking des vidéos
 */
export interface AnalyticsCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  is_default: boolean;
  created_at?: string;
}

// Re-export site config models
export * from './site-config.model';
export * from './admin';
