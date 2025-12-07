import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Site, SiteStats, Metrics } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SitesService {
  private sitesSubject = new BehaviorSubject<Site[]>([]);
  public sites$ = this.sitesSubject.asObservable();

  private statsSubject = new BehaviorSubject<SiteStats | null>(null);
  public stats$ = this.statsSubject.asObservable();

  constructor(private api: ApiService) {}

  loadSites(filters?: any): Observable<{ total: number; sites: Site[] }> {
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
  sendCommand(id: string, command: string, params?: Record<string, any>): Observable<{ success: boolean; commandId?: string; message: string }> {
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
      sites[index] = { ...sites[index], status: status as any, last_seen_at: new Date() };
      this.sitesSubject.next([...sites]);
    }
  }

  getCommandStatus(siteId: string, commandId: string): Observable<any> {
    return this.api.get(`/sites/${siteId}/command/${commandId}`);
  }

  getConfiguration(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'get_config', {});
  }
}
