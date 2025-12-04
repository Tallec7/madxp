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

  updateSiteStatus(id: string, status: string): void {
    const sites = this.sitesSubject.value;
    const index = sites.findIndex(s => s.id === id);
    if (index >= 0) {
      sites[index] = { ...sites[index], status: status as any, last_seen_at: new Date() };
      this.sitesSubject.next([...sites]);
    }
  }
}
