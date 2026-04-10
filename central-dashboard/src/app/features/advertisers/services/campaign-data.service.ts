import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  Campaign, CampaignSite, CampaignVideo,
  ResolvedSite, GroupOption
} from '../advertiser-detail.models';

@Injectable({ providedIn: 'root' })
export class CampaignDataService {
  private api = inject(ApiService);

  loadCampaigns(advertiserId: string): Observable<Campaign[]> {
    return this.api.get<{ success: boolean; data: { campaigns: Campaign[] } }>(
      '/campaigns', { advertiser_id: advertiserId }
    ).pipe(map(r => r.data?.campaigns || []));
  }

  createCampaign(payload: Partial<Campaign> & { advertiser_id: string }): Observable<string | null> {
    return this.api.post<{ success: boolean; data: { campaign: { id: string } } }>(
      '/campaigns', payload
    ).pipe(map(r => r.data?.campaign?.id || null));
  }

  updateCampaign(campaignId: string, payload: Partial<Campaign>): Observable<void> {
    return this.api.put<{ success: boolean }>(`/campaigns/${campaignId}`, payload).pipe(map(() => {}));
  }

  deleteCampaign(campaignId: string): Observable<void> {
    return this.api.delete<{ success: boolean }>(`/campaigns/${campaignId}`).pipe(map(() => {}));
  }

  deployCampaign(campaignId: string): Observable<number> {
    return this.api.post<{ success: boolean; data: { sitesTriggered: number } }>(
      `/campaigns/${campaignId}/deploy`, {}
    ).pipe(map(r => r.data?.sitesTriggered || 0));
  }

  undeployCampaign(campaignId: string): Observable<number> {
    return this.api.post<{ success: boolean; data: { sitesTriggered: number } }>(
      `/campaigns/${campaignId}/undeploy`, {}
    ).pipe(map(r => r.data?.sitesTriggered || 0));
  }

  // Campaign Videos

  loadCampaignVideos(campaignId: string): Observable<CampaignVideo[]> {
    return this.api.get<{ success: boolean; data: { videos: CampaignVideo[] } }>(
      `/campaigns/${campaignId}/videos`
    ).pipe(map(r => r.data?.videos || []));
  }

  addCampaignVideo(campaignId: string, videoId: string, weight = 1): Observable<void> {
    return this.api.post(`/campaigns/${campaignId}/videos`, { video_id: videoId, weight }).pipe(map(() => {}));
  }

  removeCampaignVideo(campaignId: string, videoId: string): Observable<void> {
    return this.api.delete(`/campaigns/${campaignId}/videos/${videoId}`).pipe(map(() => {}));
  }

  updateCampaignVideoWeight(campaignId: string, videoId: string, weight: number): Observable<void> {
    return this.api.post(`/campaigns/${campaignId}/videos`, { video_id: videoId, weight }).pipe(map(() => {}));
  }

  // Campaign Sites / Targeting

  loadCampaignSites(campaignId: string): Observable<CampaignSite[]> {
    return this.api.get<{ success: boolean; data: { sites: CampaignSite[] } }>(
      `/campaigns/${campaignId}/sites`
    ).pipe(map(r => r.data?.sites || []));
  }

  addSiteToCampaign(campaignId: string, siteId: string): Observable<void> {
    return this.api.post(`/campaigns/${campaignId}/sites`, { site_id: siteId }).pipe(map(() => {}));
  }

  removeCampaignSite(campaignId: string, siteId: string): Observable<void> {
    return this.api.delete(`/campaigns/${campaignId}/sites/${siteId}`).pipe(map(() => {}));
  }

  resolveSites(criteria: Record<string, unknown>): Observable<ResolvedSite[]> {
    return this.api.post<{ success: boolean; data: { sites: ResolvedSite[] } }>(
      '/campaigns/resolve-sites', { target_criteria: criteria }
    ).pipe(map(r => r.data?.sites || []));
  }

  applyCriteriaAndAddSites(campaignId: string, criteria: Record<string, unknown>): Observable<void> {
    return new Observable(subscriber => {
      this.api.put(`/campaigns/${campaignId}`, { target_criteria: criteria }).subscribe({
        next: () => {
          this.api.post(`/campaigns/${campaignId}/sites`, { resolve: true }).subscribe({
            next: () => { subscriber.next(); subscriber.complete(); },
            error: (err) => subscriber.error(err),
          });
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadGroups(): Observable<GroupOption[]> {
    return this.api.get<{ success: boolean; data: GroupOption[] }>('/groups').pipe(
      map(r => r.data || [])
    );
  }
}
