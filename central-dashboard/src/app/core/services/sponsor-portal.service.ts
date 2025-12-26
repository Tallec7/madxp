import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface SponsorDashboard {
  sponsor: {
    id: string;
    name: string;
    logo_url: string | null;
    status: string;
  };
  stats: {
    total_videos: number;
    total_sites: number;
    total_impressions_30d: number;
    total_screen_time_30d: number;
    avg_completion_rate: number;
  };
  trends: Array<{
    date: string;
    impressions: number;
    screen_time: number;
  }>;
}

export interface SponsorSite {
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  contract_start: Date | null;
  contract_end: Date | null;
  impressions_30d: number;
  screen_time_30d: number;
}

export interface SponsorVideo {
  video_id: string;
  filename: string;
  duration: number;
  thumbnail_url: string | null;
  impressions_30d: number;
  completion_rate: number;
}

export interface SponsorStats {
  period: { from: string; to: string };
  summary: {
    total_impressions: number;
    total_screen_time_seconds: number;
    avg_daily_impressions: number;
    completion_rate: number;
    active_sites: number;
  };
  by_video: Array<{
    video_id: string;
    filename: string;
    impressions: number;
    screen_time: number;
    completion_rate: number;
  }>;
  by_site: Array<{
    site_id: string;
    site_name: string;
    club_name: string;
    impressions: number;
    screen_time: number;
  }>;
  trends: Array<{
    date: string;
    impressions: number;
    screen_time: number;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class SponsorPortalService {
  private readonly api = inject(ApiService);

  getDashboard(): Observable<{ success: boolean; data: SponsorDashboard }> {
    return this.api.get('/sponsor/dashboard');
  }

  getSites(): Observable<{ success: boolean; data: { sites: SponsorSite[]; total: number } }> {
    return this.api.get('/sponsor/sites');
  }

  getVideos(): Observable<{ success: boolean; data: { videos: SponsorVideo[]; total: number } }> {
    return this.api.get('/sponsor/videos');
  }

  getStats(from?: string, to?: string): Observable<{ success: boolean; data: SponsorStats }> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get('/sponsor/stats', params);
  }
}
