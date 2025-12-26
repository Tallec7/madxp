import { Request } from 'express';

// Types de rôles disponibles
export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'sponsor' | 'agency';

// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: UserRole;
  sponsor_id: string | null;  // Pour les utilisateurs sponsor
  agency_id: string | null;   // Pour les utilisateurs agence
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface AuthRequest extends Request {
  user?: Express.AuthenticatedUser;
}

// Sponsor types
export interface Sponsor {
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
