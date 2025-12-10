import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Site, SiteStats, Metrics, ConfigHistory, SiteConfiguration, ConfigDiff } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SitesService {
  private readonly api = inject(ApiService);

  private sitesSubject = new BehaviorSubject<Site[]>([]);
  public sites$ = this.sitesSubject.asObservable();

  private statsSubject = new BehaviorSubject<SiteStats | null>(null);
  public stats$ = this.statsSubject.asObservable();

  loadSites(filters?: Record<string, string | number | boolean>): Observable<{ total: number; sites: Site[] }> {
    return this.api.get<{ total: number; sites: Site[] }>('/sites', filters).pipe(
      tap(response => this.sitesSubject.next(response.sites))
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
  sendCommand(id: string, command: string, params?: Record<string, unknown>): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.api.post(`/sites/${id}/command`, { command, params });
  }

  restartService(id: string, service: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'restart_service', { service });
  }

  rebootSite(id: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'reboot', {});
  }

  getLogs(id: string, lines: number = 100): Observable<{ logs: string[] }> {
    return this.api.get(`/sites/${id}/logs`, { lines });
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

  updateSiteStatus(id: string, status: string): void {
    const sites = this.sitesSubject.value;
    const index = sites.findIndex(s => s.id === id);
    if (index >= 0) {
      sites[index] = { ...sites[index], status: status as Site['status'], last_seen_at: new Date() };
      this.sitesSubject.next([...sites]);
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
  }> {
    return this.api.get(`/sites/${id}/local-content`);
  }

  // Hotspot WiFi management
  getHotspotConfig(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'get_hotspot_config', {});
  }

  updateHotspot(id: string, ssid?: string, password?: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    const params: Record<string, string> = {};
    if (ssid) params['ssid'] = ssid;
    if (password) params['password'] = password;
    return this.sendCommand(id, 'update_hotspot', params);
  }

  // Remote sync-agent update via update_config command
  updateSyncAgent(id: string, agentFiles: Record<string, string>): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'update_config', {
      mode: 'update_agent',
      agentFiles
    });
  }
}
