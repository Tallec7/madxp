import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { Sponsor, SponsorVideo } from './advertiser-detail.models';

export interface SponsorQuickStats {
  total_impressions: number;
  total_screen_time: number;
  completion_rate: number;
  unique_sites: number;
}

export interface SponsorLoadResult {
  sponsor: Sponsor;
  videos: SponsorVideo[];
  quickStats: SponsorQuickStats | null;
}

@Injectable({ providedIn: 'root' })
export class AdvertiserDetailDataService {
  private readonly api = inject(ApiService);

  loadSponsorWithRelations(sponsorId: string): Observable<SponsorLoadResult> {
    const sponsor$ = this.api.get<{ success: boolean; data: { advertiser: Sponsor } }>(
      `/analytics/advertisers/${sponsorId}`
    ).pipe(map(r => r.data.advertiser));

    const videos$ = this.api.get<{ success: boolean; data: { videos: SponsorVideo[] } }>(
      `/analytics/advertisers/${sponsorId}/videos`
    ).pipe(
      map(r => r.data.videos || []),
      catchError(() => of([] as SponsorVideo[]))
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic stats shape from API
    const stats$ = this.api.get<{ success: boolean; data: { summary: any } }>(
      `/analytics/advertisers/${sponsorId}/stats`, { days: '30' }
    ).pipe(
      map(r => r.data.summary as SponsorQuickStats | null),
      catchError(() => of(null))
    );

    return forkJoin({ sponsor: sponsor$, videos: videos$, quickStats: stats$ });
  }

  updateSponsor(sponsorId: string, data: Partial<Sponsor>): Observable<Sponsor> {
    return this.api.put<{ success: boolean; data: { advertiser: Sponsor } }>(
      `/analytics/advertisers/${sponsorId}`, data
    ).pipe(map(r => r.data.advertiser));
  }

  deleteSponsor(sponsorId: string): Observable<void> {
    return this.api.delete<{ success: boolean }>(
      `/analytics/advertisers/${sponsorId}`
    ).pipe(map(() => undefined));
  }
}
