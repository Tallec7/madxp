import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  SiteSponsor,
  SiteSponsorVideo,
  SiteSponsorStatsResponse,
  GeneratedReport,
  NetworkSponsorStatsResponse,
  SiteSponsorBenchmarkResponse
} from '../models';

/** Wrapper backend standard { success: boolean; data: T } */
interface ApiResponse<T> { success: boolean; data: T }

@Injectable({
  providedIn: 'root'
})
export class SiteSponsorService {
  private readonly api = inject(ApiService);

  listSiteSponsors(siteId: string, includeInactive = false): Observable<{
    site: { id: string; site_name: string; club_name: string };
    sponsors: SiteSponsor[];
    total: number;
  }> {
    const params: Record<string, string> = {};
    if (includeInactive) params['include_inactive'] = 'true';
    return this.api.get<ApiResponse<{
      site: { id: string; site_name: string; club_name: string };
      sponsors: SiteSponsor[];
      total: number;
    }>>(`/sites/${siteId}/sponsors`, params).pipe(map(r => r.data));
  }

  getSiteSponsor(siteId: string, sponsorId: string): Observable<SiteSponsor & { videos: SiteSponsorVideo[] }> {
    return this.api.get<ApiResponse<SiteSponsor & { videos: SiteSponsorVideo[] }>>(
      `/sites/${siteId}/sponsors/${sponsorId}`
    ).pipe(map(r => r.data));
  }

  createSiteSponsor(siteId: string, data: Partial<SiteSponsor>): Observable<SiteSponsor> {
    return this.api.post<ApiResponse<SiteSponsor>>(
      `/sites/${siteId}/sponsors`, data
    ).pipe(map(r => r.data));
  }

  updateSiteSponsor(siteId: string, sponsorId: string, data: Partial<SiteSponsor>): Observable<SiteSponsor> {
    return this.api.put<ApiResponse<SiteSponsor>>(
      `/sites/${siteId}/sponsors/${sponsorId}`, data
    ).pipe(map(r => r.data));
  }

  deleteSiteSponsor(siteId: string, sponsorId: string): Observable<void> {
    return this.api.delete<void>(`/sites/${siteId}/sponsors/${sponsorId}`);
  }

  getSiteSponsorStats(siteId: string, sponsorId: string, from?: string, to?: string): Observable<SiteSponsorStatsResponse> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<ApiResponse<SiteSponsorStatsResponse>>(
      `/sites/${siteId}/sponsors/${sponsorId}/stats`, params
    ).pipe(map(r => r.data));
  }

  addVideoToSiteSponsor(siteId: string, sponsorId: string, videoFilename: string): Observable<void> {
    return this.api.post<void>(
      `/sites/${siteId}/sponsors/${sponsorId}/videos`,
      { video_filename: videoFilename }
    );
  }

  removeVideoFromSiteSponsor(siteId: string, sponsorId: string, videoFilename: string): Observable<void> {
    return this.api.delete<void>(
      `/sites/${siteId}/sponsors/${sponsorId}/videos/${encodeURIComponent(videoFilename)}`
    );
  }

  generateSponsorReport(siteId: string, sponsorId: string, periodStart: string, periodEnd: string): Observable<{ reportId: string; url: string }> {
    return this.api.post<ApiResponse<{ reportId: string; url: string }>>(
      '/reports/generate',
      { type: 'site_sponsor', entityId: sponsorId, siteId, periodStart, periodEnd }
    ).pipe(map(r => r.data));
  }

  getSponsorReports(sponsorId: string): Observable<GeneratedReport[]> {
    return this.api.get<ApiResponse<GeneratedReport[]>>(
      `/reports/site-sponsors/${sponsorId}`
    ).pipe(map(r => r.data));
  }

  getNetworkSponsorStats(advertiserId: string, from?: string, to?: string): Observable<NetworkSponsorStatsResponse> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<ApiResponse<NetworkSponsorStatsResponse>>(
      `/network/advertisers/${advertiserId}/stats`, params
    ).pipe(map(r => r.data));
  }

  getSiteSponsorBenchmark(siteId: string, from?: string, to?: string): Observable<SiteSponsorBenchmarkResponse> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<ApiResponse<SiteSponsorBenchmarkResponse>>(
      `/sites/${siteId}/sponsors/benchmark`, params
    ).pipe(map(r => r.data));
  }

  createSponsorAccessLink(siteId: string, sponsorId: string): Observable<{
    accessUrl: string; expiresAt: string; emailSent: boolean; sentTo: string | null;
  }> {
    return this.api.post<ApiResponse<{
      accessUrl: string; expiresAt: string; emailSent: boolean; sentTo: string | null;
    }>>(
      `/sites/${siteId}/sponsors/${sponsorId}/access-link`,
      {}
    ).pipe(map(r => r.data));
  }
}
