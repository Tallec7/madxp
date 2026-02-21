/**
 * Sponsor Alert Service (F-AUD-07)
 *
 * Angular service to interact with the sponsor-alerts API endpoints.
 * Provides the health matrix for the "Advertiser Health" dashboard view.
 */

import { Injectable, inject } from '@angular/core';
import { Observable, timer, switchMap, shareReplay } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type SponsorHealthStatus = 'healthy' | 'warning' | 'critical';

export interface SponsorHealthEntry {
  advertiserId: string;
  advertiserName: string;
  siteId: string;
  siteName: string;
  clubName: string;
  impressionsLast7d: number;
  impressionsLast30d: number;
  avgDailyImpressions7d: number;
  lastImpressionAt: string | null;
  daysSinceLastImpression: number | null;
  status: SponsorHealthStatus;
}

export interface SponsorHealthMatrix {
  entries: SponsorHealthEntry[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  generatedAt: string;
}

export interface SponsorAlertConfig {
  warningThresholdDaily: number;
  criticalThresholdDays: number;
}

interface HealthResponse {
  success: boolean;
  data: SponsorHealthMatrix;
}

interface ConfigResponse {
  success: boolean;
  data: SponsorAlertConfig;
}

interface CheckResponse {
  success: boolean;
  data: {
    created: number;
    total: number;
  };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

@Injectable({
  providedIn: 'root'
})
export class SponsorAlertService {
  private readonly api = inject(ApiService);

  /**
   * Fetch the full health matrix (all advertisers x sites).
   * Optionally filter by a single advertiser.
   */
  getHealthMatrix(advertiserId?: string): Observable<SponsorHealthMatrix> {
    const params: Record<string, string> = {};
    if (advertiserId) {
      params['advertiserId'] = advertiserId;
    }
    return this.api.get<HealthResponse>('/sponsor-alerts/health', params)
      .pipe(map(response => response.data));
  }

  /**
   * Fetch health matrix filtered by a single advertiser (via URL param).
   */
  getAdvertiserHealth(advertiserId: string): Observable<SponsorHealthMatrix> {
    return this.api.get<HealthResponse>(`/sponsor-alerts/health/${advertiserId}`)
      .pipe(map(response => response.data));
  }

  /**
   * Fetch current alert configuration.
   */
  getConfig(): Observable<SponsorAlertConfig> {
    return this.api.get<ConfigResponse>('/sponsor-alerts/config')
      .pipe(map(response => response.data));
  }

  /**
   * Manually trigger an alert check (admin only).
   */
  triggerCheck(): Observable<{ created: number; total: number }> {
    return this.api.post<CheckResponse>('/sponsor-alerts/check', {})
      .pipe(map(response => response.data));
  }

  /**
   * Auto-refreshing health matrix observable.
   * Polls every `intervalMs` milliseconds (default: 60 seconds).
   */
  getHealthMatrixPolling(intervalMs = 60_000): Observable<SponsorHealthMatrix> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.getHealthMatrix()),
      shareReplay(1)
    );
  }
}
