import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, tap, map } from 'rxjs';
import { ApiService } from './api.service';
import { CacheService } from './cache.service';
import { Site, SiteStats, Metrics, ConfigHistory, SiteConfiguration, ConfigDiff, SiteConnectionStatus, AllSitesConnectionStatus, LocalVideo, LocalStorage, CloudVideo, FleetHealthData, MatchHistoryData, ConfigProfile, CreateProfilePayload, UpdateProfilePayload, ProfilesListResponse, DeployProfileResponse, SyncProfilesResponse } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SitesService {
  private readonly api = inject(ApiService);
  private readonly cache = inject(CacheService);

  private sitesSubject = new BehaviorSubject<Site[]>([]);
  public sites$ = this.sitesSubject.asObservable();

  private statsSubject = new BehaviorSubject<SiteStats | null>(null);
  public stats$ = this.statsSubject.asObservable();

  loadSites(filters?: Record<string, string | number | boolean>): Observable<{ total: number; sites: Site[] }> {
    return this.api.get<{ data: Site[]; pagination: { total: number } }>('/sites', filters).pipe(
      tap(response => this.sitesSubject.next(response.data)),
      // Transform paginated response to expected format
      map(response => ({ sites: response.data, total: response.pagination.total }))
    );
  }

  loadStats(): Observable<SiteStats> {
    return this.api.get<SiteStats>('/sites/stats').pipe(
      tap(stats => this.statsSubject.next(stats))
    );
  }

  getSite(id: string): Observable<Site> {
    return this.api.get<Site>(`/sites/${id}`);
  }

  createSite(data: Partial<Site>): Observable<Site> {
    return this.api.post<Site>('/sites', data);
  }

  updateSite(id: string, data: Partial<Site>): Observable<Site> {
    return this.api.put<Site>(`/sites/${id}`, data);
  }

  deleteSite(id: string): Observable<void> {
    return this.api.delete<void>(`/sites/${id}`);
  }

  regenerateApiKey(id: string): Observable<Site> {
    return this.api.post<Site>(`/sites/${id}/regenerate-key`, {});
  }

  getSiteMetrics(id: string, hours: number = 24): Observable<{ site_id: string; period_hours: number; metrics: Metrics[] }> {
    return this.api.get(`/sites/${id}/metrics`, { hours });
  }

  // Commandes à distance
  sendCommand(id: string, command: string, params?: Record<string, unknown>): Observable<{
    success: boolean;
    sent?: boolean;
    queued?: boolean;
    commandId?: string;
    message: string;
  }> {
    return this.api.post(`/sites/${id}/command`, { command, params });
  }

  restartService(id: string, service: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'restart_service', { service });
  }

  rebootSite(id: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'reboot', {});
  }

  getLogs(id: string, lines: number = 100, service: string = 'neopro-app'): Observable<{ logs: string[] }> {
    return this.api.get(`/sites/${id}/logs`, { lines, service });
  }

  getSystemInfo(id: string): Observable<{
    hostname: string;
    os: string;
    kernel: string;
    architecture: string;
    cpu_model: string;
    cpu_cores: number;
    total_memory: number;
    ip_address: string;
    mac_address: string;
  }> {
    return this.api.get(`/sites/${id}/system-info`);
  }

  getHotspotConfig(id: string): Observable<{
    success: boolean;
    configured: boolean;
    ssid?: string;
    password?: string;
    channel?: number;
    isActive?: boolean;
    message?: string;
  }> {
    return this.api.get(`/sites/${id}/hotspot-config`);
  }

  getHealthStatus(id: string): Observable<{
    success: boolean;
    timestamp: string;
    healthScore: number;
    healthStatus: 'healthy' | 'degraded' | 'critical';
    issues: Array<{
      severity: 'critical' | 'warning';
      component: string;
      message: string;
      fix: string;
      lastError?: string | null;
    }>;
    gpu: {
      gpu_mem_mb: number | null;
      gpu_mem_warning: boolean;
      temperature: number | null;
      temperature_warning: boolean;
      throttled: string | null;
      throttled_flags: string[];
      voltage_ok: boolean;
      frequency_capped: boolean;
      throttling_active: boolean;
    };
    services: Array<{
      name: string;
      description: string;
      status: string;
      active: boolean;
      failed: boolean;
      lastError?: string | null;
    }>;
    metrics: {
      cpu: number;
      memory: number;
      disk: number;
      temperature: number;
      uptime: number;
      localIp: string | null;
    } | null;
    system: {
      hostname: string;
      os: string;
      uptime: number;
      localIp: string | null;
    };
    error?: string;
  }> {
    return this.api.get(`/sites/${id}/health-status`);
  }

  runDiagnostics(id: string): Observable<{
    success: boolean;
    timestamp: string;
    output: string;
    errors?: string | null;
    scriptPath?: string;
  }> {
    return this.api.get(`/sites/${id}/diagnostics`);
  }

  updateSiteStatus(id: string, status: string): void {
    const sites = [...this.sitesSubject.value];
    const index = sites.findIndex(s => s.id === id);
    if (index >= 0) {
      sites[index] = { ...sites[index], status: status as Site['status'], last_seen_at: new Date() };
      this.sitesSubject.next(sites);
    }
  }

  getCommandStatus(siteId: string, commandId: string): Observable<{ status: string; result?: { configuration?: SiteConfiguration; message?: string }; error_message?: string }> {
    return this.api.get(`/sites/${siteId}/command/${commandId}`);
  }

  getConfiguration(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'get_config', {});
  }

  // Historique des configurations
  getConfigHistory(id: string, limit = 20, offset = 0): Observable<{ site_id: string; total: number; history: ConfigHistory[] }> {
    return this.api.get(`/sites/${id}/config-history`, { limit, offset });
  }

  getConfigVersion(siteId: string, versionId: string): Observable<ConfigHistory> {
    return this.api.get(`/sites/${siteId}/config-history/${versionId}`);
  }

  saveConfigVersion(id: string, configuration: SiteConfiguration, comment?: string): Observable<ConfigHistory> {
    return this.api.post(`/sites/${id}/config-history`, { configuration, comment });
  }

  compareConfigVersions(id: string, version1: string, version2: string): Observable<{
    version1: { id: string; deployed_at: Date; configuration: SiteConfiguration };
    version2: { id: string; deployed_at: Date; configuration: SiteConfiguration };
    diff: ConfigDiff[];
  }> {
    return this.api.get(`/sites/${id}/config-history-compare`, { version1, version2 });
  }

  previewConfigDiff(id: string, newConfiguration: SiteConfiguration): Observable<{
    hasChanges: boolean;
    changesCount: number;
    diff: ConfigDiff[];
    currentConfiguration: SiteConfiguration | null;
    newConfiguration: SiteConfiguration;
  }> {
    return this.api.post(`/sites/${id}/config-preview-diff`, { newConfiguration });
  }

  getLocalContent(id: string): Observable<{
    siteId: string;
    siteName: string;
    clubName: string;
    hasContent: boolean;
    lastSync: Date | null;
    configHash: string | null;
    configuration: SiteConfiguration | null;
    localVideos: LocalVideo[];
    cloudVideos: CloudVideo[];
    localStorage: LocalStorage | null;
    lastVideoSync: string | null;
    hotspotInfo: { ssid: string | null; channel: number | null; clients: number; isActive: boolean } | null;
  }> {
    return this.api.get(`/sites/${id}/local-content`);
  }

  // Connection status
  getConnectionStatus(id: string): Observable<SiteConnectionStatus> {
    return this.api.get(`/sites/${id}/connection-status`);
  }

  getAllConnectionStatus(): Observable<AllSitesConnectionStatus> {
    return this.api.get('/sites/connection-status');
  }

  /**
   * Get fleet health data for the admin dashboard
   * Aggregates connection status, metrics, versions, and at-risk sites
   */
  getFleetHealthData(): Observable<FleetHealthData> {
    return this.api.get('/sites/fleet-health');
  }

  /**
   * Get match history for a specific site
   * Returns recent matches with audience estimates, videos played, and duration
   */
  getMatchHistory(siteId: string, limit: number = 20): Observable<MatchHistoryData> {
    return this.api.get(`/sites/${siteId}/match-history`, { limit });
  }

  /**
   * Endpoint agrégé qui combine connection status + metrics en une seule requête
   * Optimise les performances en réduisant de 3 requêtes à 1
   * Utilise le cache pour éviter les appels redondants
   */
  getDashboardData(id: string, hours: number = 24, useCache = true): Observable<{
    site: { id: string; site_name: string; club_name: string };
    connection: {
      isConnected: boolean;
      status: 'online' | 'offline' | 'warning' | 'unknown';
      lastSeenAt: Date | null;
      secondsSinceLastSeen: number | null;
      localIp: string | null;
      lastConfigSync: Date | null;
      heartbeat_24h: {
        count: number;
        firstAt: Date | null;
        lastAt: Date | null;
      };
    };
    metrics: {
      period_hours: number;
      data: Metrics[];
    };
  }> {
    const cacheKey = `dashboard:${id}:${hours}`;

    if (!useCache) {
      this.cache.invalidate(cacheKey);
    }

    return this.cache.get(
      cacheKey,
      () => this.api.get(`/sites/${id}/dashboard`, { hours }),
      5000 // TTL de 5 secondes
    );
  }

  // Hotspot WiFi management
  updateHotspot(id: string, ssid?: string, password?: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    const params: Record<string, string> = {};
    if (ssid) params['ssid'] = ssid;
    if (password) params['password'] = password;
    return this.sendCommand(id, 'update_hotspot', params);
  }

  // Fix hotspot - endpoint dédié pour diagnostiquer et réparer le hotspot WiFi
  fixHotspot(id: string, autoFix: boolean = false): Observable<{
    success: boolean;
    timestamp: string;
    output?: string;
    errors?: string | null;
    checks?: Array<{
      name: string;
      status: 'ok' | 'fail' | 'warning';
      message: string;
    }>;
    recommendations?: string[];
    // Nouveau format JSON du script fix-hotspot.sh
    diagnostic?: {
      currentChannel: number;
      recommendedChannel: number;
      ssid: string;
      hostapdActive: boolean;
      dnsmasqActive: boolean;
      powerOk: boolean;
      throttledValue: string;
    };
    fix?: {
      channelChanged: boolean;
      needsReboot: boolean;
      oldChannel: string;
      newChannel: string;
    };
    message?: string;
  }> {
    return this.api.post(`/sites/${id}/fix-hotspot`, { autoFix });
  }

  // Get WiFi BSSID status - détecte l'environnement mesh et le verrouillage BSSID
  getWifiBssidStatus(id: string): Observable<{
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
  }> {
    return this.api.get(`/sites/${id}/wifi-bssid-status`);
  }

  // Remove BSSID lock - supprime le verrouillage pour permettre le roaming
  removeBssidLock(id: string): Observable<{
    success: boolean;
    message: string;
    modified: boolean;
    configPath?: string;
    timestamp: string;
  }> {
    return this.api.delete(`/sites/${id}/bssid-lock`);
  }

  // Optimize for mesh - configure wpa_supplicant pour les environnements mesh
  optimizeForMesh(id: string): Observable<{
    success: boolean;
    message: string;
    modified: boolean;
    configPath?: string;
    timestamp: string;
  }> {
    return this.api.post(`/sites/${id}/optimize-mesh`, {});
  }

  // WiFi Client Configuration — scan & connect wlan1 à distance
  scanWifiNetworks(id: string): Observable<{
    success: boolean;
    networks: Array<{
      ssid: string;
      bssid: string | null;
      signal: number | null;
      quality: number | null;
      channel: number | null;
      security: string;
    }>;
    currentSsid: string | null;
    currentBssid: string | null;
    scannedAt: string;
    error?: string;
  }> {
    return this.api.get(`/sites/${id}/wifi-scan`);
  }

  connectWifiClient(id: string, ssid: string, password: string): Observable<{
    success: boolean;
    connected: boolean;
    ssid: string;
    ipAddress: string | null;
    signal: number | null;
    message: string;
    timestamp: string;
  }> {
    return this.api.post(`/sites/${id}/wifi-connect`, { ssid, password });
  }

  // Export debug bundle - collecte toutes les informations de debug du Pi
  exportDebugBundle(id: string): Observable<{
    success: boolean;
    timestamp: string;
    bundle: {
      configuration: Record<string, unknown>;
      version: string;
      healthStatus: Record<string, unknown>;
      services: Array<{ name: string; status: string; active: boolean }>;
      logs: string[];
      network: Record<string, unknown>;
      disk: Record<string, unknown>;
      buffers: Record<string, unknown>;
      hotspotConfig: Record<string, unknown>;
      bootConfig: Record<string, unknown>;
      videos: Array<{ filename: string; size: number; category: string }>;
    };
  }> {
    return this.api.get(`/sites/${id}/debug-bundle`);
  }

  // Network diagnostics - endpoint dédié pour récupérer les données réseau
  getNetworkDiagnostics(id: string): Observable<{
    success: boolean;
    timestamp: string;
    internet: {
      reachable: boolean;
      latency_ms: number | null;
      packet_loss_percent: number | null;
      packets_sent: number;
      packets_received: number;
    };
    central_server: {
      reachable: boolean;
      latency_ms: number | null;
      http_latency_ms: number | null;
      http_status: number | null;
      url: string;
      port_443_open: boolean | null;
      ssl_valid: boolean | null;
    };
    dns: {
      working: boolean;
      resolution_time_ms: number | null;
      tested_domain: string | null;
      resolved_ip: string | null;
    };
    gateway: {
      ip: string | null;
      reachable: boolean;
      latency_ms: number | null;
    };
    interfaces: Array<{
      name: string;
      ip4: string | null;
      ip6: string | null;
      mac: string | null;
      type: string;
      operstate: string;
      speed: number | null;
    }>;
    wifi: {
      connected: boolean;
      ssid: string | null;
      quality_percent: number | null;
      signal_dbm: number | null;
      bitrate_mbps: number | null;
    } | null;
    stability: {
      interface_uptime_seconds: number | null;
      reconnections_24h: number | null;
    };
  }> {
    return this.api.get(`/sites/${id}/network-diagnostics`);
  }

  // Deprecated: utilisez getNetworkDiagnostics à la place
  runNetworkDiagnostics(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'network_diagnostics', {});
  }

  // Update site settings (language, timezone)
  updateSiteSettings(id: string, settings: { language?: 'fr' | 'en' | 'es'; timezone?: string }): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'update_settings', settings);
  }

  // Command Queue - Commandes en attente pour sites offline
  getPendingCommands(id: string): Observable<{
    siteId: string;
    siteName: string;
    clubName: string;
    pendingCount: number;
    commands: Array<{
      id: string;
      site_id: string;
      command_type: string;
      command_data: Record<string, unknown>;
      priority: number;
      created_at: Date;
      expires_at: Date | null;
      attempts: number;
      description: string | null;
    }>;
  }> {
    return this.api.get(`/sites/${id}/pending-commands`);
  }

  cancelPendingCommand(siteId: string, commandId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/sites/${siteId}/pending-commands/${commandId}`);
  }

  clearPendingCommands(siteId: string): Observable<{ success: boolean; message: string; count: number }> {
    return this.api.delete(`/sites/${siteId}/pending-commands`);
  }

  getQueueSummary(): Observable<{
    totalPending: number;
    sitesWithPendingCommands: number;
    sites: Array<{
      site_id: string;
      club_name: string;
      site_status: string;
      pending_count: number;
      highest_priority: number;
      oldest_command: Date | null;
      newest_command: Date | null;
      command_types: string[];
    }>;
  }> {
    return this.api.get('/sites/queue/summary');
  }

  // Timeline des événements récents (P3.4)
  getTimeline(id: string, limit: number = 20): Observable<{
    siteId: string;
    siteName: string;
    events: Array<{
      id: string;
      type: 'deployment' | 'command' | 'config' | 'alert';
      timestamp: string;
      title: string;
      details: Record<string, unknown>;
      status?: string;
      user?: string;
    }>;
    counts: {
      deployments: number;
      commands: number;
      configs: number;
      alerts: number;
    };
  }> {
    return this.api.get(`/sites/${id}/timeline?limit=${limit}`);
  }

  // Pending deployments management
  getPendingDeployments(siteId: string): Observable<PendingDeployment[]> {
    return this.api.get<PendingDeployment[]>('/deployments').pipe(
      map(deployments => deployments.filter(d =>
        d.target_type === 'site' &&
        d.target_id === siteId &&
        (d.status === 'pending' || d.status === 'in_progress')
      ))
    );
  }

  cancelDeployment(deploymentId: string): Observable<void> {
    return this.api.delete(`/deployments/${deploymentId}`);
  }

  // Remote PIN management
  setRemotePin(siteId: string, pin: string): Observable<{ success: boolean; message: string }> {
    return this.api.post(`/sites/${siteId}/remote-pin`, { pin });
  }

  clearRemotePin(siteId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/sites/${siteId}/remote-pin`);
  }

  getRemotePinStatus(siteId: string): Observable<{ pinEnabled: boolean }> {
    return this.api.get(`/sites/${siteId}/remote-pin`);
  }

  // ============================================================================
  // Config Profiles (multi-config)
  // ============================================================================

  getProfiles(siteId: string): Observable<ProfilesListResponse> {
    return this.api.get<ProfilesListResponse>(`/sites/${siteId}/profiles`);
  }

  getProfile(siteId: string, profileId: string): Observable<ConfigProfile> {
    return this.api.get<ConfigProfile>(`/sites/${siteId}/profiles/${profileId}`);
  }

  createProfile(siteId: string, payload: CreateProfilePayload): Observable<ConfigProfile> {
    return this.api.post<ConfigProfile>(`/sites/${siteId}/profiles`, payload);
  }

  updateProfile(siteId: string, profileId: string, payload: UpdateProfilePayload): Observable<ConfigProfile> {
    return this.api.put<ConfigProfile>(`/sites/${siteId}/profiles/${profileId}`, payload);
  }

  deleteProfile(siteId: string, profileId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete<{ success: boolean; message: string }>(`/sites/${siteId}/profiles/${profileId}`);
  }

  deployProfile(siteId: string, profileId: string): Observable<DeployProfileResponse> {
    return this.api.post<DeployProfileResponse>(`/sites/${siteId}/profiles/${profileId}/deploy`, {});
  }

  syncProfiles(siteId: string): Observable<SyncProfilesResponse> {
    return this.api.post<SyncProfilesResponse>(`/sites/${siteId}/profiles/sync`, {});
  }
}

export interface PendingDeployment {
  id: string;
  video_id: string;
  target_type: 'site' | 'group';
  target_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  deployed_at: string | null;
  filename: string;
  original_name: string | null;
  video_title: string;
  target_name: string;
}
