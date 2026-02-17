/**
 * Thèmes d'overlay disponibles
 */
export type OverlayTheme = 'broadcast' | 'minimal';

/**
 * Positions disponibles pour les overlays (9 positions — utilisé par watermark)
 */
export type OverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Positions disponibles pour l'overlay score (6 positions)
 */
export type ScoreOverlayPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Configuration de l'overlay du score affiché sur la TV.
 * Simplifié : thème broadcast/minimal + position.
 */
export interface ScoreOverlayConfig {
  /** Thème d'affichage : broadcast (style TV pro) ou minimal (score discret) */
  theme?: OverlayTheme;
  /** Position de l'overlay score (6 positions) */
  position?: ScoreOverlayPosition;
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
  /** Hostname mDNS dérivé du club_name (ex: neopro-usap) */
  hostname_slug?: string;
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

  // === Subscription fields ===
  /** Date de début d'abonnement */
  subscription_start?: string | null;
  /** Date de fin d'abonnement */
  subscription_end?: string | null;
  /** Plan d'abonnement (trial, standard, premium) */
  subscription_plan?: 'trial' | 'standard' | 'premium';
  /** Site suspendu manuellement */
  suspended?: boolean;
  /** Motif de suspension */
  suspension_reason?: string | null;
  /** Date de suspension */
  suspension_date?: string | null;
  /** Note de suspension */
  suspension_note?: string | null;
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

export interface FanStatus {
  present: boolean;
  type: string | null;
  curState: number | null;
  maxState: number | null;
  speedPercent: number | null;
  is_pi5: boolean;
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
  fan_status: FanStatus | null;
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
  /** État de santé de la connexion (optionnel, présent si connecté) */
  health?: {
    isHealthy: boolean;
    reason: string;
  };
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
 * Site data for fleet health dashboard
 */
export interface FleetHealthSite {
  id: string;
  siteName: string;
  clubName: string;
  displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
  lastSeenAt: Date | null;
  secondsSinceLastSeen: number | null;
  localIp: string | null;
  softwareVersion: string | null;
  location: {
    city?: string;
    region?: string;
    lat?: number;
    lng?: number;
  } | null;
  metrics: {
    cpu_percent: number | null;
    memory_percent: number | null;
    temperature: number | null;
    disk_percent: number | null;
  };
}

/**
 * Fleet health data response from API
 */
export interface FleetHealthData {
  sites: FleetHealthSite[];
  stats: {
    total: number;
    online: number;
    warning: number;
    offline: number;
    unknown: number;
  };
  health: {
    avg_cpu: number;
    avg_memory: number;
    avg_temperature: number;
    sites_high_temp: number;
    sites_low_disk: number;
  };
  versionDistribution: {
    version: string;
    count: number;
    percentage: number;
  }[];
  sitesByRegion: {
    name: string;
    total: number;
    online: number;
  }[];
  atRiskSites: FleetHealthSite[];
  timestamp: string;
}

// ============================================================================
// Match History Types
// ============================================================================

/**
 * A single match/session with audience data
 */
export interface Match {
  id: string;
  matchDate: Date;
  matchName: string;
  audienceEstimate: number | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
  videosPlayed: number;
  manualTriggers: number;
  autoPlays: number;
}

/**
 * Match history response from API
 */
export interface MatchHistoryData {
  siteId: string;
  siteName: string;
  clubName: string;
  matches: Match[];
  stats: {
    totalMatches: number;
    totalAudience: number;
    avgAudience: number;
    totalVideos: number;
    totalDurationHours: number;
  };
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

// ============================================================================
// Subscription System Types
// ============================================================================

/**
 * Plans d'abonnement disponibles
 */
export type SubscriptionPlan = 'trial' | 'standard' | 'premium';

/**
 * Motifs de suspension
 */
export type SuspensionReason =
  | 'unpaid'
  | 'expired'
  | 'abuse'
  | 'maintenance'
  | 'request'
  | 'hardware'
  | 'trial_ended'
  | 'connection';

/**
 * Statuts de licence possibles
 */
export type LicenseStatus = 'VALID' | 'WARNING' | 'GRACE_PERIOD' | 'CONNECTION_WARNING' | 'BLOCKED';

/**
 * Statut d'affichage de l'abonnement (pour badge)
 */
export type SubscriptionDisplayStatus =
  | 'active'           // Actif et valide
  | 'expiring_soon'    // Expire dans moins de 30 jours
  | 'grace_period'     // En période de grâce (7 jours après expiration)
  | 'suspended'        // Suspendu manuellement
  | 'blocked'          // Bloqué (expiré ou suspendu depuis longtemps)
  | 'trial'            // En période d'essai
  | 'unknown';         // État inconnu

/**
 * Informations d'abonnement d'un site
 */
export interface SiteSubscription {
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_plan: SubscriptionPlan;
  suspended: boolean;
  suspension_reason: SuspensionReason | null;
  suspension_date: string | null;
  suspension_note: string | null;
}

/**
 * Statut de licence complet envoyé au Pi
 */
export interface LicenseStatusResponse {
  status: LicenseStatus;
  reason?: SuspensionReason | 'expiring_soon' | 'expired' | 'connection_required';
  subscription_end?: string;
  days_left?: number;
  days_expired?: number;
  days_since_check?: number;
  can_auto_unblock?: boolean;
  message_tv?: string;
  message_remote?: string;
  cache_valid_until: string;
}

/**
 * Entrée d'historique d'abonnement
 */
export interface SubscriptionHistoryEntry {
  id: string;
  site_id: string;
  action: 'activated' | 'renewed' | 'suspended' | 'reactivated' | 'expired' | 'plan_changed';
  reason?: SuspensionReason;
  previous_end_date?: string;
  new_end_date?: string;
  note?: string;
  performed_by?: string;
  performed_by_name?: string;
  created_at: string;
}

/**
 * Statistiques globales des abonnements
 */
export interface SubscriptionStats {
  total_sites: number;
  active_sites: number;
  trial_sites: number;
  suspended_sites: number;
  expiring_soon: number;
  expired_grace: number;
  grace_period: number;
  by_plan: {
    trial: number;
    standard: number;
    premium: number;
  };
  by_suspension_reason: Partial<Record<SuspensionReason, number>>;
}

/**
 * Site à risque (pour la page de gestion)
 */
export interface SiteAtRisk {
  id: string;
  site_name: string;
  club_name: string;
  subscription_end: string | null;
  subscription_plan: SubscriptionPlan;
  suspended: boolean;
  suspension_reason: SuspensionReason | null;
  suspension_note?: string | null;
  days_until_expiration: number | null;
  risk_level: 'warning' | 'critical';
  risk_reason?: string;
  last_seen_at: string | null;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
}

/**
 * Motif de suspension avec labels
 */
export interface SuspensionReasonInfo {
  code: SuspensionReason;
  label: string;
  description: string;
  auto_unblock: boolean;
  message_remote: string;
  message_tv: string;
  severity: 'warning' | 'error';
}

/**
 * Requêtes pour les actions d'abonnement
 */
export interface ExtendSubscriptionRequest {
  new_end_date: string;
  note?: string;
}

export interface SuspendSiteRequest {
  reason: SuspensionReason;
  note?: string;
}

export interface ReactivateSiteRequest {
  new_end_date?: string;
  note?: string;
}

export interface ChangePlanRequest {
  plan: SubscriptionPlan;
  note?: string;
}

export interface UpdateSubscriptionRequest {
  subscription_start?: string | null;
  subscription_end?: string | null;
  subscription_plan?: SubscriptionPlan | null;
  note?: string;
}

// Re-export site config models
export * from './site-config.model';
export * from './admin';
export * from './config-profile.model';
