import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

export interface SaasDailyPoint {
  day: string;
  videosPlayed: number;
  screenTimeSeconds: number;
}
export interface SaasTopVideo {
  filename: string;
  category: string;
  plays: number;
  avgCompletion: number;
}
export interface SaasActiveProfile {
  id: string;
  name: string;
  displayName: string | null;
  loopVideoCount: number;
  sponsorCount: number;
}
export interface SaasActiveSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  videoCount: number;
  totalImpressions: number;
}
export interface SaasMetrics {
  connectedClients: number;
  todayVideosPlayed: number;
  todayScreenTime: number;
  todaySessions: number;
  weekVideosPlayed: number;
  weekScreenTime: number;
  weekCompletionRate: number;
  weekSponsorsDisplayed: number;
  yesterdayVideosPlayed?: number;
  yesterdayScreenTime?: number;
  previousWeekCompletionRate?: number;
  previousWeekVideosPlayed?: number;
  dailySparkline?: SaasDailyPoint[];
  topVideos?: SaasTopVideo[];
  activeProfile?: SaasActiveProfile | null;
  activeSponsors?: SaasActiveSponsor[];
  lastOtaDeployment?: {
    version: string;
    status: string;
    completedAt: string | null;
    createdAt: string;
  } | null;
  activeAlertsCount?: number;
}

export interface SiteDashboard {
  site: {
    id: string;
    site_name: string;
    club_name: string;
    site_type?: string;
    status?: string;
    last_seen_at?: string | null;
    software_version?: string | null;
  };
  connection: {
    isConnected: boolean;
    lastSeen?: string | null;
    lastSeenAt?: string | null;
  };
  metrics: {
    storage_used: number;
    storage_total: number;
    storage_percent: number;
    video_count: number;
    last_video_sync: string | null;
  } | null;
  saasMetrics?: SaasMetrics | null;
}

@Injectable({ providedIn: 'root' })
export class ClubDashboardDataService {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  fetchDashboard(): Observable<SiteDashboard> {
    const siteId = this.authService.getCurrentUser()?.site_id;
    return this.api.get<SiteDashboard>(`/sites/${siteId}/dashboard`);
  }
}
