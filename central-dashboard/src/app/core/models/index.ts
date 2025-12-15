export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator' | 'viewer';
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
   * Active l'affichage du score en live sur la télécommande et la TV
   * Option premium activable par NEOPRO
   */
  live_score_enabled?: boolean;
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
