import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface AgencyDashboard {
  agency: {
    id: string;
    name: string;
    logo_url: string | null;
    status: string;
  };
  stats: {
    total_sites: number;
    online_sites: number;
    offline_sites: number;
    total_videos_played_30d: number;
    total_screen_time_30d: number;
  };
  recent_alerts: Array<{
    id: string;
    site_id: string;
    site_name: string;
    alert_type: string;
    severity: string;
    message: string;
    created_at: Date;
  }>;
}

export interface AgencySite {
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  last_seen_at: Date | null;
  software_version: string | null;
  videos_played_30d: number;
  screen_time_30d: number;
}

export interface AgencySiteDetails {
  site: Record<string, unknown>;
  stats_30d: {
    total_videos: number;
    total_screen_time: number;
    avg_uptime: number;
    active_days: number;
  };
  trends: Array<{
    date: string;
    videos_played: number;
    screen_time_seconds: number;
  }>;
}

export interface AgencyStats {
  period: { from: string; to: string };
  summary: {
    total_sites: number;
    total_videos: number;
    total_screen_time: number;
    avg_uptime: number;
  };
  by_site: Array<{
    site_id: string;
    site_name: string;
    club_name: string;
    videos_played: number;
    screen_time: number;
    avg_uptime: number;
  }>;
  trends: Array<{
    date: string;
    videos_played: number;
    screen_time: number;
  }>;
}

export interface Agency {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: Date;
  site_count?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AgencyPortalService {
  private readonly api = inject(ApiService);

  // Portal endpoints (for agency users)
  getDashboard(): Observable<{ success: boolean; data: AgencyDashboard }> {
    return this.api.get('/agencies/portal/dashboard');
  }

  getSites(): Observable<{ success: boolean; data: { sites: AgencySite[]; total: number } }> {
    return this.api.get('/agencies/portal/sites');
  }

  getSiteDetails(siteId: string): Observable<{ success: boolean; data: AgencySiteDetails }> {
    return this.api.get(`/agencies/portal/sites/${siteId}`);
  }

  getStats(from?: string, to?: string): Observable<{ success: boolean; data: AgencyStats }> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get('/agencies/portal/stats', params);
  }

  // Admin endpoints (for managing agencies)
  listAgencies(): Observable<{ success: boolean; data: { agencies: Agency[]; total: number } }> {
    return this.api.get('/agencies');
  }

  getAgency(id: string): Observable<{ success: boolean; data: { agency: Agency } }> {
    return this.api.get(`/agencies/${id}`);
  }

  createAgency(data: Partial<Agency>): Observable<{ success: boolean; data: Agency }> {
    return this.api.post('/agencies', data);
  }

  updateAgency(id: string, data: Partial<Agency>): Observable<{ success: boolean; data: Agency }> {
    return this.api.put(`/agencies/${id}`, data);
  }

  deleteAgency(id: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/agencies/${id}`);
  }

  addSitesToAgency(agencyId: string, siteIds: string[]): Observable<{ success: boolean; message: string }> {
    return this.api.post(`/agencies/${agencyId}/sites`, { site_ids: siteIds });
  }

  removeSiteFromAgency(agencyId: string, siteId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/agencies/${agencyId}/sites/${siteId}`);
  }
}
