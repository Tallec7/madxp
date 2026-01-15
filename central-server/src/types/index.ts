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
  recorded_at: Date;
}

// Alert types
export interface Alert {
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

export interface SponsorVideo {
  name: string;
  path: string;
  type?: string;
  owner?: 'neopro' | 'club';
  locked?: boolean;
  expiresAt?: string;
}

export interface CategoryVideo {
  name: string;
  path: string;
  type?: string;
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
  imagePath: string;      // Chemin local sur le Pi: /home/pi/neopro/assets/watermarks/logo.png
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
