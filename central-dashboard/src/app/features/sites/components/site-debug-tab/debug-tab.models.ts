export interface GpuInfo {
  gpu_mem_mb: number | null;
  gpu_mem_warning: boolean;
  gpu_mem_note?: string | null;
  is_pi5?: boolean;
  temperature: number | null;
  temperature_warning: boolean;
  throttled: string | null;
  throttled_flags: string[];
  voltage_ok: boolean;
  frequency_capped: boolean;
  throttling_active: boolean;
}

export interface ServiceStatus {
  name: string;
  description: string;
  status: string;
  active: boolean;
  failed: boolean;
  lastError?: string | null;
}

export interface HealthIssue {
  severity: 'critical' | 'warning';
  component: string;
  message: string;
  fix: string;
  lastError?: string | null;
}

export interface HdmiCecStatus {
  tv_power: 'on' | 'standby' | 'transitioning' | 'unknown' | null;
  tv_connected: boolean;
  devices_found: number;
  cec_available: boolean;
  last_check_at: string | null;
  error: string | null;
}

export interface EdidDetailed {
  screen_size: string | null;
  year_of_manufacture: number | null;
  input_type: string | null;
  color_depth: string | null;
  native_resolution: string | null;
  max_refresh_rate: number | null;
  hdmi_version: string | null;
  hdr_supported: boolean;
  color_spaces: string[];
  standby_supported: boolean;
  display_product_type: string | null;
  diagonal_inches: number | null;
  audio_supported: boolean;
  supported_resolutions: string[];
}

export interface DisplayInfo {
  connected: boolean;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  resolution: string | null;
  display_type: 'tv' | 'monitor' | 'projector' | 'unknown';
  detection_method: string;
  display_category?: string;
  edid_detailed?: EdidDetailed | null;
}

export interface FanStatusInfo {
  present: boolean;
  type: string | null;
  curState: number | null;
  maxState: number | null;
  speedPercent: number | null;
  is_pi5: boolean;
}

export interface HealthStatus {
  success: boolean;
  timestamp: string;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  issues: HealthIssue[];
  gpu: GpuInfo;
  fanStatus?: FanStatusInfo;
  services: ServiceStatus[];
  metrics: {
    cpu: number;
    memory: number;
    temperature: number;
    disk: number;
    uptime: number;
    localIp: string | null;
  } | null;
  hdmiCecStatus?: HdmiCecStatus;
  displayInfo?: DisplayInfo;
  secondaryDisplayInfo?: DisplayInfo;
  system: {
    hostname: string;
    os: string;
    uptime: number;
    localIp: string | null;
  };
  error?: string;
}

export interface DiagnosticCheck {
  category: string;
  name: string;
  status: 'ok' | 'fail' | 'warning' | 'unknown';
  value: string;
  warning?: string | null;
}

export interface DiagnosticsResult {
  success: boolean;
  timestamp: string;
  output?: string;
  checks?: DiagnosticCheck[];
  errors?: string | null;
}

export interface ConnectionHealth {
  socketInMap: boolean;
  socketConnected: boolean;
  lastPongAgeMs: number | null;
  isHealthy: boolean;
  reason: string;
}

export interface NetworkDiagnostics {
  success: boolean;
  timestamp: string;
  internet?: {
    reachable: boolean;
    latency_ms: number | null;
    packet_loss_percent: number | null;
    packets_sent?: number;
    packets_received?: number;
  };
  dns?: {
    working: boolean;
    resolution_time_ms: number | null;
    tested_domain?: string | null;
    resolved_ip?: string | null;
  };
  gateway?: {
    ip: string | null;
    reachable: boolean;
    latency_ms?: number | null;
  };
  central_server?: {
    reachable: boolean;
    latency_ms: number | null;
    http_latency_ms?: number | null;
    http_status?: number | null;
    url?: string;
    port_443_open?: boolean | null;
    ssl_valid?: boolean | null;
  };
  interfaces?: Array<{
    name: string;
    ip4: string | null;
    ip6: string | null;
    mac: string | null;
    type: string;
    operstate: string;
    speed: number | null;
  }>;
  wifi?: {
    connected: boolean;
    ssid: string | null;
    quality_percent: number | null;
    signal_dbm: number | null;
    bitrate_mbps: number | null;
  };
  stability?: {
    interface_uptime_seconds: number | null;
    reconnections_24h: number | null;
  };
}

export interface BufferInfo {
  file_exists: boolean;
  event_count: number;
  file_size_bytes: number;
  oldest_event: string | null;
  newest_event: string | null;
}

export interface BufferStatus {
  success: boolean;
  timestamp: string;
  analytics?: BufferInfo;
  sponsors?: { event_count: number; oldest_event: string | null; newest_event: string | null };
  legacy_sponsor_file?: boolean;
}

export interface HotspotCheck {
  name: string;
  status: 'ok' | 'fail' | 'warning';
  value: string;
}

export interface HotspotDiagnostic {
  currentChannel: number;
  recommendedChannel: number;
  ssid: string;
  hostapdActive: boolean;
  dnsmasqActive: boolean;
  powerOk: boolean;
  throttledValue: string;
}

export interface HotspotFix {
  channelChanged: boolean;
  needsReboot: boolean;
  oldChannel: string;
  newChannel: string;
}

export interface HotspotResult {
  success: boolean;
  timestamp: string;
  autoFix?: boolean;
  output?: string;
  checks?: HotspotCheck[];
  manual?: boolean;
  diagnostic?: HotspotDiagnostic;
  fix?: HotspotFix;
  message?: string;
}

export interface WifiBssidStatus {
  success: boolean;
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  bssidLocked: string | null;
  isMeshEnvironment: boolean;
  meshApCount: number;
  signal: number | null;
  ipAddress: string | null;
  timestamp: string;
}

export interface WifiNetwork {
  ssid: string;
  bssid: string | null;
  signal: number | null;
  quality: number | null;
  channel: number | null;
  security: string;
}

export interface WifiScanResult {
  success: boolean;
  networks: WifiNetwork[];
  currentSsid: string | null;
  currentBssid: string | null;
  scannedAt: string;
  error?: string;
}

export type WizardStepStatus = 'pending' | 'checking' | 'ok' | 'warning' | 'error';

export interface WizardStep {
  id: number;
  title: string;
  icon: string;
  status: WizardStepStatus;
  message: string;
  details: string[];
  suggestions: string[];
}

export interface HotspotInfo {
  ssid: string | null;
  channel: number | null;
  clients: number;
  isActive: boolean;
}

export interface TimelineEvent {
  id: string;
  type: 'deployment' | 'command' | 'config' | 'alert';
  timestamp: string;
  title: string;
  details: Record<string, unknown>;
  status?: string;
  user?: string;
}

export interface ConfirmModalState {
  visible: boolean;
  title: string;
  message: string;
  warning: string;
  confirmLabel: string;
  danger: boolean;
  icon: string;
  executing: boolean;
  onConfirm: (() => void) | null;
}
