import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '@env/environment';
import { AnalyticsCategory } from '../models';

export interface ClubHealthData {
  site_id: string;
  club_name: string;
  status: string;
  current_metrics: {
    cpu_usage: number;
    memory_usage: number;
    temperature: number;
    disk_usage: number;
    uptime: number;
    recorded_at: string;
  } | null;
  availability_24h: number;
  alerts_24h: number;
  last_seen_at: string;
}

export interface AvailabilityData {
  date: string;
  total_minutes: number;
  online_minutes: number;
  availability_percent: number;
}

export interface AlertData {
  id: string;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface UsageStats {
  period: string;
  total_plays: number;
  unique_videos: number;
  total_duration: number;
  avg_completion_rate: number;
  manual_triggers: number;
  auto_plays: number;
  daily_breakdown: {
    date: string;
    plays: number;
    duration: number;
  }[];
}

export interface ContentStats {
  top_videos: {
    filename: string;
    category: string;
    play_count: number;
    total_duration: number;
    avg_completion: number;
  }[];
  categories_breakdown: {
    category: string;
    play_count: number;
    total_duration: number;
  }[];
}

export interface DashboardData {
  health: ClubHealthData;
  usage: UsageStats;
  content: ContentStats;
  recent_sessions: {
    id: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number;
    video_count: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // MVP - Health Analytics
  getClubHealth(siteId: string): Observable<ClubHealthData> {
    return this.api.get<ClubHealthData>(`/analytics/clubs/${siteId}/health`);
  }

  getClubAvailability(siteId: string, days: number = 7): Observable<{ availability: AvailabilityData[] }> {
    return this.api.get(`/analytics/clubs/${siteId}/availability`, { days });
  }

  getClubAlerts(siteId: string, days: number = 7): Observable<{ alerts: AlertData[] }> {
    return this.api.get(`/analytics/clubs/${siteId}/alerts`, { days });
  }

  // Phase 2 - Usage Analytics
  getClubUsage(siteId: string, days: number = 30): Observable<UsageStats> {
    return this.api.get<UsageStats>(`/analytics/clubs/${siteId}/usage`, { days });
  }

  getClubContent(siteId: string, days: number = 30): Observable<ContentStats> {
    return this.api.get<ContentStats>(`/analytics/clubs/${siteId}/content`, { days });
  }

  // Phase 3 - Dashboard complet
  getClubDashboard(siteId: string): Observable<DashboardData> {
    return this.api.get<DashboardData>(`/analytics/clubs/${siteId}/dashboard`);
  }

  exportClubData(siteId: string, format: 'csv' | 'json' = 'csv', days: number = 30): Observable<Blob> {
    // L'authentification est geree par le cookie HttpOnly (withCredentials: true)
    const params = new HttpParams().set('format', format).set('days', days.toString());
    return this.http.get(`${this.apiUrl}/analytics/clubs/${siteId}/export`, {
      params,
      responseType: 'blob',
      withCredentials: true
    });
  }

  getClubPdfReport(siteId: string, from: string, to: string): Observable<Blob> {
    // L'authentification est geree par le cookie HttpOnly (withCredentials: true)
    const params = new HttpParams()
      .set('from', from)
      .set('to', to);
    return this.http.get(`${this.apiUrl}/analytics/clubs/${siteId}/report/pdf`, {
      params,
      responseType: 'blob',
      withCredentials: true
    });
  }

  // Admin - Vue d'ensemble
  getAnalyticsOverview(): Observable<{
    total_sites: number;
    online_sites: number;
    total_plays_today: number;
    total_plays_week: number;
    avg_availability: number;
    sites_summary: {
      site_id: string;
      club_name: string;
      status: string;
      plays_today: number;
      availability_24h: number;
    }[];
  }> {
    return this.api.get('/analytics/overview');
  }

  // ============================================================================
  // Analytics Categories Management
  // ============================================================================

  /**
   * Récupérer la liste des catégories analytics disponibles
   */
  getAnalyticsCategories(): Observable<AnalyticsCategory[]> {
    return this.api.get<AnalyticsCategory[]>('/analytics/categories');
  }

  /**
   * Créer une nouvelle catégorie analytics (admin only)
   */
  createAnalyticsCategory(category: Omit<AnalyticsCategory, 'is_default' | 'created_at'>): Observable<AnalyticsCategory> {
    return this.api.post<AnalyticsCategory>('/analytics/categories', category);
  }

  /**
   * Mettre à jour une catégorie analytics (admin only)
   */
  updateAnalyticsCategory(id: string, category: Partial<AnalyticsCategory>): Observable<AnalyticsCategory> {
    return this.api.put<AnalyticsCategory>(`/analytics/categories/${id}`, category);
  }

  /**
   * Supprimer une catégorie analytics (admin only, si non-default)
   */
  deleteAnalyticsCategory(id: string): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/analytics/categories/${id}`);
  }
}
