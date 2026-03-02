import { Request } from 'express';

// Types de rôles disponibles
// Note: 'advertiser' remplace 'sponsor' - 'sponsor' gardé pour rétrocompatibilité
export type UserRole = 'super_admin' | 'superadmin' | 'admin' | 'operator' | 'viewer' | 'advertiser' | 'sponsor' | 'agency';

// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: UserRole;
  advertiser_id: string | null;  // Pour les utilisateurs annonceurs
  sponsor_id?: string | null;    // @deprecated - Utiliser advertiser_id
  agency_id: string | null;      // Pour les utilisateurs agence
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface AuthRequest extends Request {
  user?: Express.AuthenticatedUser;
}

// Advertiser types (anciennement Sponsor)
export interface Advertiser {
  [key: string]: unknown;
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: 'active' | 'inactive' | 'paused';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// @deprecated - Utiliser Advertiser
export type Sponsor = Advertiser;

// Agency types
export interface Agency {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: Record<string, unknown> | null;
  status: 'active' | 'inactive' | 'suspended';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// Site types
export interface Site {
  [key: string]: unknown;
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
  software_version: string | null;
  hardware_model: string;
  api_key: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  pending_config_version_id: string | null;
  remote_pin_hash: string | null;
  hostname_slug: string | null;
}

// Group types
export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: 'sport' | 'geography' | 'version' | 'custom';
  filters: {
    sport?: string;
    region?: string;
    version?: string;
    [key: string]: any;
  } | null;
  created_at: Date;
  updated_at: Date;
}

// Video types
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
  metadata: Record<string, any>;
  uploaded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// Deployment types
export interface ContentDeployment {
  [key: string]: unknown;
  id: string;
  video_id: string;
  target_type: 'site' | 'group';
  target_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error_message: string | null;
  deployed_by: string | null;
  has_secondary_variant: boolean;
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
  backup_path: string | null;
  deployed_by: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

// Software update types
export interface SoftwareUpdate {
  id: string;
  version: string;
  changelog: string | null;
  package_url: string | null;
  package_size: number | null;
  checksum: string | null;
  uploaded_by: string | null;
  created_at: Date;
}

// Command types
export interface RemoteCommand {
  id: string;
  site_id: string;
  command_type: string;
  command_data: Record<string, any> | null;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'timeout';
  result: Record<string, any> | null;
  error_message: string | null;
  executed_by: string | null;
  created_at: Date;
  executed_at: Date | null;
  completed_at: Date | null;
}

// Fan status types
export interface FanStatus {
  present: boolean;
  type: string | null;
  curState: number | null;
  maxState: number | null;
  speedPercent: number | null;
  is_pi5: boolean;
}

// Metrics types
export interface Metrics {
  id: string;
  site_id: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
  uptime: number | null;
  network_status: Record<string, any> | null;
  fan_status: FanStatus | null;
  recorded_at: Date;
}

// Alert types
export interface Alert {
  [key: string]: unknown;
  id: string;
  site_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, any>;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: Date;
  resolved_at: Date | null;
}

// Socket.IO types
export interface SocketData {
  siteId: string;
  apiKey: string;
}

export interface CommandMessage {
  id: string;
  type: string;
  data: Record<string, any>;
}

export interface CommandResult {
  commandId: string;
  status: 'success' | 'error';
  result?: any;
  error?: string;
}

export interface TransitionMetrics {
  earlySwitchCount: number;
  safetyTimeoutCount: number;
  cleanupSkippedCount: number;
  videoErrorCount: number;
  totalTransitions: number;
  staleLoopStateCount?: number; // ADR-033: tv-loop-state stales ignored by slave guard
  preloadRevealCount?: number; // ADR-034: successful preload→reveal syncs on slave
  preloadCleanupCount?: number; // ADR-034: preload aborted before reveal
  lastUpdatedAt?: number | null;
}

export interface HeartbeatMessage {
  siteId: string;
  timestamp: number;
  metrics: {
    cpu: number;
    memory: number;
    temperature: number;
    disk: number;
    uptime: number;
    localIp?: string | null;
  };
  softwareVersion?: string | null;
  versionInfo?: {
    version: string | null;
    commit?: string | null;
    buildDate?: string | null;
    source?: string | null;
  };
  kioskStatus?: {
    status: 'running' | 'crashed';
    chromiumAlive: boolean;
    restartCount: number;
    lastEvent: string;
    reason?: string;
    pid: number;
    displayFallback?: string;
    primaryResolution?: string;
    secondaryResolution?: string;
  } | null;
  recordingState?: {
    isRecording: boolean;
    isManualOverride: boolean;
  } | null;
  transitionMetrics?: TransitionMetrics | null;
  playerState?: {
    currentVideo: string | null;
    currentCategory: string | null;
    progress: number;
    duration: number;
    currentTime: number;
    phase: string;
    isManualMode: boolean;
    isPlaying: boolean;
    loopIndex: number;
    loopTotal: number;
    nextVideo: string | null;
    lastError: string | null;
    lastTransitionAt: string | null;
    overlayActive: boolean;
    loopResumedFrom: number | null;
    updatedAt: string;
  } | null;
  wifiStatus?: {
    interface: string | null;
    connected: boolean;
    ssid: string | null;
    signal: number | null;
    quality: number | null;
    connectionType: 'wifi' | 'ethernet' | 'none';
    disconnectsLastHour: number;
    throttled: string | null;
    voltageOk: boolean;
    powerManagement?: 'on' | 'off' | null;
    channel?: number | null;
    hotspotChannel?: number | null;
  } | null;
  fanStatus?: FanStatus | null;
  filesystemHealth?: {
    ext4Errors: number;
    isReadOnly: boolean;
  } | null;
  hdmiStatus?: {
    hdmi0: boolean;
    hdmi1: boolean;
    wrongPort: boolean;
    updatedAt: number | null;
  } | null;
  connectedClients?: Array<{
    socketId: string;
    role: 'master' | 'slave';
    displayType: string;
    userAgent: string | null;
    ip: string | null;
    connectedAt: number;
  }> | null;
  /** E-23 US-23.4.4: Both HDMI ports active (dual-display mode) */
  dualDisplayActive?: boolean;
}

// ============================================================================
// Config Profile types (multi-config par site / profils / tournois)
// ============================================================================

export interface ConfigProfile {
  id: string;
  site_id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  sport: string | null;
  sort_order: number;
  is_default: boolean;
  configuration: SiteConfiguration;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConfigProfileSyncPayload {
  id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  sport: string | null;
  is_default: boolean;
  configuration: SiteConfiguration;
}

// ============================================================================
// Config Draft types (système de brouillons de configuration)
// ============================================================================

export type DraftStatus = 'draft' | 'deploying' | 'deployed' | 'failed';

export interface ConfigDraft {
  id: string;
  site_id: string;
  name: string;
  configuration: SiteConfiguration;
  referenced_video_ids: string[];
  status: DraftStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type OrchestratedDeploymentStatus =
  | 'pending'
  | 'deploying_videos'
  | 'deploying_config'
  | 'completed'
  | 'partial_failure'
  | 'failed';

export interface OrchestratedDeployment {
  [key: string]: unknown;
  id: string;
  site_id: string;
  draft_id: string | null;
  status: OrchestratedDeploymentStatus;
  total_videos: number;
  videos_completed: number;
  videos_failed: number;
  config_deployed: boolean;
  error_message: string | null;
  failed_video_ids: string[];
  started_by: string | null;
  started_at: Date;
  completed_at: Date | null;
  configuration_snapshot: SiteConfiguration;
}

export interface DraftValidationResult {
  valid: boolean;
  missingVideos: MissingVideoInfo[];
  videosToDeploy: string[];  // IDs des vidéos cloud à déployer sur le Pi
}

export interface MissingVideoInfo {
  videoId: string | null;
  filename: string;
  path: string;
  isInCloud: boolean;
  isOnPi: boolean;
}

// ============================================================================
// Site Configuration types (structure de configuration.json)
// ============================================================================

export interface VideoVariantInfo {
  path: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface VideoVariants {
  secondary?: VideoVariantInfo;
}

export interface SponsorVideo {
  name: string;
  path: string;
  type?: string;
  owner?: 'neopro' | 'club';
  locked?: boolean;
  expiresAt?: string;
  site_sponsor_id?: string;
  display_name?: string;
  variants?: VideoVariants;
  /** UUID de la vidéo en base (pour le tracking analytics côté Pi) */
  video_id?: string;
  /** UUID de l'advertiser associé (pour le tracking analytics côté Pi) */
  advertiser_id?: string;
  /** @deprecated Utiliser advertiser_id — rétrocompat Pi */
  sponsor_id?: string;
  /** Catégorie analytics : sponsor, jingle, ambiance, other */
  analytics_category?: string;
}

/**
 * Données d'un sponsor de site envoyées au Pi lors du déploiement.
 * Permet au Pi de connaître les sponsors du dashboard central.
 */
export interface SiteSponsorDeployment {
  id: string;
  name: string;
  display_name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  source: 'local' | 'neopro';
  videoFilenames: string[];
  isActive: boolean;
}

export interface CategoryVideo {
  name: string;
  path: string;
  type?: string;
  site_sponsor_id?: string; // Auto-résolu depuis site_sponsor_videos au déploiement
  variants?: VideoVariants;
  /** UUID de la vidéo en base (pour le tracking analytics côté Pi) */
  video_id?: string;
  /** UUID du sponsor associé (pour le tracking analytics côté Pi) */
  sponsor_id?: string;
  /** Catégorie analytics : sponsor, jingle, ambiance, other */
  analytics_category?: string;
}

export interface SubCategory {
  id: string;
  name: string;
  videos: CategoryVideo[];
}

export interface Category {
  id: string;
  name: string;
  videos: CategoryVideo[];
  subCategories?: SubCategory[];
}

export interface TimeCategory {
  id: string;
  name: string;
  icon?: string;
  loopVideos: SponsorVideo[];
  categories?: string[];  // IDs des catégories disponibles dans cette phase
}

export type CategoryMappings = Record<string, 'sponsor' | 'jingle' | 'ambiance' | 'other'>;

export interface SiteConfiguration {
  sponsors: SponsorVideo[];
  categories: Category[];
  timeCategories?: TimeCategory[];
  categoryMappings?: CategoryMappings;
  liveScoreEnabled?: boolean;
  scoreOverlay?: Record<string, unknown>;
  watermark?: WatermarkConfig;
  auth?: {
    password?: string;
    clubName?: string;
    sessionDuration?: number;
  };
  settings?: {
    language?: string;
    timezone?: string;
  };
  siteId?: string;
  siteName?: string;
  clubName?: string;
  apiKey?: string;
  [key: string]: unknown;  // Pour la flexibilité
}

// ============================================================================
// Watermark Configuration types (logo en surimpression)
// ============================================================================

export type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkAnimation =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-top'
  | 'slide-bottom'
  | 'zoom';

export interface WatermarkScheduleRule {
  id: string;
  startTime: string;      // Format HH:mm
  endTime: string;        // Format HH:mm
  daysOfWeek: number[];   // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  matchPhases: ('all' | 'neutral' | 'before' | 'during' | 'after')[];
}

export interface WatermarkSchedule {
  enabled: boolean;
  rules: WatermarkScheduleRule[];
}

export interface WatermarkConfig {
  enabled: boolean;
  imagePath: string;      // Chemin local sur le Pi: /home/pi/neopro/webapp/assets/watermarks/logo.png
  cloudUrl?: string;      // URL cloud (FTP) pour l'aperçu dans le dashboard
  fullscreen: boolean;    // Mode plein écran (couvre tout l'écran)
  position: OverlayPosition;  // Ignoré si fullscreen
  offsetX: number;        // Offset horizontal en pixels - ignoré si fullscreen
  offsetY: number;        // Offset vertical en pixels - ignoré si fullscreen
  opacity: number;        // 0-100
  width: number;          // Largeur en pixels - ignoré si fullscreen
  height: number;         // Hauteur en pixels (0 = auto) - ignoré si fullscreen
  borderRadius: number;   // Arrondi des coins en pixels - ignoré si fullscreen
  animation: WatermarkAnimation;
  animationDuration: number;  // Durée de l'animation en ms
  schedule?: WatermarkSchedule;
}

// ============================================================================
// Asset Deployment types (déploiement d'images watermark, logos, etc.)
// ============================================================================

export interface AssetDeploymentRequest {
  assetUrl: string;       // URL de téléchargement (CDN/FTP)
  filename: string;       // Nom du fichier
  targetPath: string;     // Chemin relatif de destination sur le Pi
  checksum?: string;      // SHA256 pour vérification d'intégrité
  assetType: 'watermark' | 'logo' | 'image';
}

export interface AssetDeploymentResult {
  success: boolean;
  path: string;
  fullPath: string;
  size: number;
  checksum: string;
}

// ============================================================================
// Subscription & License types (système d'abonnement)
// ============================================================================

/**
 * Types de plans d'abonnement
 * - trial: Période d'essai gratuite (ex: 30 jours)
 * - standard: Abonnement de base
 * - premium: Abonnement avec fonctionnalités avancées
 */
export type SubscriptionPlan = 'trial' | 'standard' | 'premium';

/**
 * Motifs de suspension d'un site
 * - unpaid: Facture impayée (auto-déblocage possible)
 * - expired: Abonnement expiré > 7 jours (auto-déblocage possible)
 * - abuse: Utilisation abusive / non-respect CGU (déblocage manuel requis)
 * - maintenance: Maintenance technique Neopro (auto-déblocage)
 * - request: Suspendu à la demande du client (déblocage manuel requis)
 * - hardware: Problème matériel nécessitant intervention (déblocage manuel requis)
 * - trial_ended: Fin de période d'essai (auto-déblocage si souscription)
 * - connection: Boîtier non connecté > 14 jours (auto-déblocage à la connexion)
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
 * Statut de licence calculé
 * - VALID: Abonnement actif, tout fonctionne normalement
 * - WARNING: Abonnement expire bientôt (< 30 jours) - bandeau d'info sur /remote
 * - GRACE_PERIOD: Abonnement expiré mais dans la période de grâce (7 jours)
 * - CONNECTION_WARNING: Cache licence expire bientôt, connexion Internet requise
 * - BLOCKED: Service bloqué (expiration > 7j, suspension, ou cache expiré > 14j)
 */
export type LicenseStatus =
  | 'VALID'
  | 'WARNING'
  | 'GRACE_PERIOD'
  | 'CONNECTION_WARNING'
  | 'BLOCKED';

/**
 * Données d'abonnement d'un site (colonnes ajoutées à la table sites)
 */
export interface SiteSubscription {
  [key: string]: unknown;
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_plan: SubscriptionPlan;
  suspended: boolean;
  suspension_reason: SuspensionReason | null;
  suspension_date: string | null;
  suspension_note: string | null;
}

/**
 * Type minimal pour le calcul du statut de licence
 * Utilisé par computeLicenseStatus et checkAutoUnblock
 * Contient uniquement les champs nécessaires au calcul, pas tout le site
 */
export interface SiteSubscriptionInfo extends SiteSubscription {
  [key: string]: unknown;
  id: string;
  last_seen_at: string | null;
  site_name?: string; // Optionnel, utilisé pour le logging
}

/**
 * Motif de suspension avec métadonnées (table subscription_suspension_reasons)
 */
export interface SuspensionReasonInfo {
  [key: string]: unknown;
  code: SuspensionReason;
  label: string;
  description: string;
  auto_unblock: boolean;
  message_remote: string;
  message_tv: string;
  severity: 'warning' | 'error';
}

/**
 * Statut de licence complet envoyé au Pi via Socket.IO
 * Le Pi stocke cette réponse dans license_cache.json
 */
export interface LicenseStatusResponse {
  status: LicenseStatus;
  reason?: SuspensionReason | 'expiring_soon' | 'expired' | 'connection_required';
  subscription_end?: string;
  subscription_plan?: SubscriptionPlan;
  days_left?: number;           // Jours restants avant expiration (positif)
  days_expired?: number;        // Jours depuis expiration (positif, si expiré)
  days_since_check?: number;    // Jours depuis dernière vérification serveur
  can_auto_unblock?: boolean;   // Si true, le Pi peut se débloquer automatiquement
  message_tv?: string;          // Message à afficher sur /tv (neutre, public)
  message_remote?: string;      // Message à afficher sur /remote (explicite, staff)
  cache_valid_until: string;    // Date jusqu'à laquelle le cache est valide (ISO 8601)
  server_timestamp: string;     // Timestamp du serveur (ISO 8601)
}

/**
 * Actions possibles dans l'historique des abonnements
 */
export type SubscriptionAction =
  | 'activated'       // Première activation
  | 'created'         // Configuration initiale
  | 'renewed'         // Renouvellement (prolongation)
  | 'suspended'       // Suspension manuelle
  | 'reactivated'     // Réactivation après suspension
  | 'expired'         // Passage en état expiré (automatique)
  | 'plan_changed';   // Changement de plan

/**
 * Entrée dans l'historique des abonnements
 */
export interface SubscriptionHistoryEntry {
  [key: string]: unknown;
  id: string;
  site_id: string;
  action: SubscriptionAction;
  reason?: SuspensionReason;
  previous_end_date?: string;
  new_end_date?: string;
  previous_plan?: SubscriptionPlan;
  new_plan?: SubscriptionPlan;
  note?: string;
  performed_by?: string;
  performed_by_name?: string;   // Nom de l'utilisateur (jointure)
  created_at: string;
}

/**
 * Statistiques globales des abonnements (vue subscription_stats)
 */
export interface SubscriptionStats {
  [key: string]: unknown;
  active_count: number;         // Abonnements actifs (> date actuelle, non suspendus)
  expiring_soon_count: number;  // Expirent dans < 30 jours
  grace_period_count: number;   // En période de grâce (expirés < 7 jours)
  blocked_count: number;        // Bloqués (expirés > 7 jours ou suspendus)
  suspended_count: number;      // Suspendus manuellement
  trial_count: number;          // Plans trial
  standard_count: number;       // Plans standard
  premium_count: number;        // Plans premium
  total_count: number;          // Total des sites
}

/**
 * Requête pour prolonger un abonnement
 */
export interface ExtendSubscriptionRequest {
  new_end_date: string;         // Nouvelle date de fin (ISO 8601)
  note?: string;                // Note interne
}

/**
 * Requête pour suspendre un site
 */
export interface SuspendSiteRequest {
  reason: SuspensionReason;     // Motif de suspension
  note?: string;                // Note interne
  notify_contact?: boolean;     // Envoyer un email au contact du site
}

/**
 * Requête pour réactiver un site
 */
export interface ReactivateSiteRequest {
  new_end_date?: string;        // Optionnel: nouvelle date de fin
  note?: string;                // Note interne
  notify_contact?: boolean;     // Envoyer un email au contact du site
}

/**
 * Site avec informations d'abonnement (pour les vues dashboard et calcul licence)
 * Note: last_seen_at est redéfini comme string | null pour compatibilité avec les données DB
 */
export interface SiteWithSubscription extends SiteSubscription {
  [key: string]: unknown;
  // Champs du Site (redéfinis car Omit perd les propriétés avec index signature)
  id: string;
  site_name: string;
  club_name: string;
  location: Site['location'];
  sports: string[] | null;
  status: Site['status'];
  software_version: string | null;
  hardware_model: string;
  api_key: string;
  metadata: Record<string, unknown>;
  pending_config_version_id: string | null;
  // Redéfinition des champs Date en string pour compatibilité avec les données SQL brutes
  last_seen_at: string | null;
  created_at?: string;
  updated_at?: string;
  // Champs calculés
  subscription_status?: 'active' | 'expiring_soon' | 'expiring_urgent' | 'grace_period' | 'blocked' | 'suspended' | 'no_subscription';
  days_until_expiry?: number;
  suspension_label?: string;
}
