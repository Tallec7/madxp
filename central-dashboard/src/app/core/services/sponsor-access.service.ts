import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

// ============================================================================
// SPONSOR ACCESS SERVICE (P5)
// Appels API pour le portail sponsor public (token-based, pas d'auth JWT)
// ============================================================================

export interface SponsorVerification {
  valid: boolean;
  sponsor?: {
    id: string;
    name: string;
    siteId: string;
    clubName: string;
  };
  error?: string;
}

export interface SponsorPortalVideoStats {
  video_filename: string;
  impressions: number;
  screen_time_seconds: number;
  completion_rate: number;
  avg_duration_played: number;
  manual_triggers: number;
}

export interface SponsorPortalPeriodBreakdown {
  period: string;
  impressions: number;
  screen_time_seconds: number;
  completion_rate: number;
}

export interface SponsorPortalBenchmarkEntry {
  site_sponsor_id: string;
  sponsor_name: string;
  impressions: number;
  screen_time_seconds: number;
  completion_rate: number;
  active_days: number;
  rank: number;
}

export interface SponsorPortalBenchmark {
  current_sponsor_id: string;
  period: { from: string; to: string };
  sponsors: SponsorPortalBenchmarkEntry[];
  averages: {
    impressions: number;
    screen_time_seconds: number;
    completion_rate: number;
    active_days: number;
  };
  total_sponsors: number;
}

export interface SponsorPortalStats {
  sponsor: {
    id: string;
    name: string;
    clubName: string;
  };
  period: { from: string; to: string };
  summary: {
    total_impressions: number;
    total_screen_time_seconds: number;
    completion_rate: number;
    estimated_reach: number;
    active_days: number;
    manual_triggers: number;
  };
  daily_trends: Array<{
    date: string;
    impressions: number;
    screen_time: number;
  }>;
  videos: Array<{
    id: string;
    video_filename: string;
    is_primary: boolean;
  }>;
  video_stats: SponsorPortalVideoStats[];
  period_breakdown: SponsorPortalPeriodBreakdown[];
}

@Injectable({ providedIn: 'root' })
export class SponsorAccessService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  verifyToken(token: string): Observable<SponsorVerification> {
    return this.http.get<SponsorVerification>(
      `${this.baseUrl}/sponsor-portal/verify`,
      { params: { token } }
    );
  }

  getStats(token: string, from?: string, to?: string): Observable<SponsorPortalStats> {
    const params: Record<string, string> = { token };
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<{ success: boolean; data: SponsorPortalStats }>(
      `${this.baseUrl}/sponsor-portal/stats`,
      { params }
    ).pipe(map(r => r.data));
  }

  getReportUrl(token: string, from?: string, to?: string): string {
    const params = new URLSearchParams({ token });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `${this.baseUrl}/sponsor-portal/report?${params.toString()}`;
  }

  getBenchmark(token: string, from?: string, to?: string): Observable<SponsorPortalBenchmark> {
    const params: Record<string, string> = { token };
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<{ success: boolean; data: SponsorPortalBenchmark }>(
      `${this.baseUrl}/sponsor-portal/benchmark`,
      { params }
    ).pipe(map(r => r.data));
  }

  getCsvUrl(token: string, from?: string, to?: string): string {
    const params = new URLSearchParams({ token });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `${this.baseUrl}/sponsor-portal/export-csv?${params.toString()}`;
  }
}
