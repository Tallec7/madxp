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

  copyConfig(sourceSiteId: string, targetSiteId: string): Observable<{ success: boolean; profiles_copied: number; message: string }> {
    return this.api.post(`/sites/${sourceSiteId}/copy-config`, { target_site_id: targetSiteId });
  }

  updateSiteStatus(id: string, status: string): void {
    const sites = [...this.sitesSubject.value];
    const index = sites.findIndex(s => s.id === id);
    if (index >= 0) {
      sites[index] = { ...sites[index], status: status as Site['status'], last_seen_at: new Date() };
      this.sitesSubject.next(sites);
    }
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
    secondaryVariantVideoIds: string[];
    secondaryDisplayEnabled: boolean;
    deployedPaths: Array<{ videoId: string; deployedPath: string; deployedFilename: string }>;
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

  // Cloud video management
  deleteCloudVideo(videoId: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/videos/${videoId}`);
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

  updateProfileConfiguration(siteId: string, profileId: string, configuration: SiteConfiguration, mode?: 'replace' | 'merge'): Observable<ConfigProfile> {
    return this.api.put<ConfigProfile>(`/sites/${siteId}/profiles/${profileId}/configuration`, { configuration, mode });
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

  saveConfigDirect(siteId: string, configuration: Record<string, unknown>, mode?: 'replace' | 'merge'): Observable<{ success: boolean; versionId: string }> {
    return this.api.put<{ success: boolean; versionId: string }>(`/sites/${siteId}/config`, { configuration, mode });
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
  has_secondary_variant?: boolean;
}
