import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';

/**
 * Row vidéo retournée par `/api/videos` (sélecteur sponsor).
 *
 * DTO API distinct de la `Video` canonique (`core/models/video.model.ts`) — le
 * payload sponsor expose `title` et `created_at: string` (ISO sérialisé) au
 * lieu de `original_name` / `Date`. Renommé pour éviter la collision et
 * documenter la nature DTO.
 */
export interface SponsorVideoRow {
  id: string;
  title: string;
  filename: string;
  duration: number;
  file_size?: number;
  created_at: string;
}

export interface SponsorVideo {
  video_id: string;
  video_title: string;
  video_duration: number;
  priority: number;
  associated_at: string;
}

interface SponsorResponse {
  success: boolean;
  data: { advertiser: { name: string } };
}

interface SponsorVideosResponse {
  success: boolean;
  data: { videos: SponsorVideo[] };
}

interface VideosResponse {
  data: SponsorVideoRow[];
  pagination: { page: number; limit: number; total: number };
}

interface ReorderVideoItem {
  video_id: string;
  priority: number;
}

@Injectable({ providedIn: 'root' })
export class SponsorVideoDataService {
  private readonly api = inject(ApiService);

  loadSponsor(sponsorId: string): Observable<string> {
    return this.api.get<SponsorResponse>(
      `/analytics/advertisers/${sponsorId}`
    ).pipe(map(r => r.data.advertiser.name));
  }

  loadSponsorVideos(sponsorId: string): Observable<SponsorVideo[]> {
    return this.api.get<SponsorVideosResponse>(
      `/analytics/advertisers/${sponsorId}/videos`
    ).pipe(
      map(r => (r.data.videos || []).sort((a, b) => a.priority - b.priority))
    );
  }

  loadAvailableVideos(): Observable<SponsorVideoRow[]> {
    return this.api.get<VideosResponse>(
      '/videos', { limit: 500 }
    ).pipe(map(r => r.data || []));
  }

  addVideosToSponsor(sponsorId: string, videoIds: string[]): Observable<unknown> {
    return this.api.post(
      `/analytics/advertisers/${sponsorId}/videos`,
      { video_ids: videoIds }
    );
  }

  removeVideoFromSponsor(sponsorId: string, videoId: string): Observable<unknown> {
    return this.api.delete(
      `/analytics/advertisers/${sponsorId}/videos/${videoId}`
    );
  }

  updateVideoPriority(sponsorId: string, videoId: string, priority: number): Observable<unknown> {
    return this.api.put(
      `/analytics/advertisers/${sponsorId}/videos/${videoId}`,
      { priority }
    );
  }

  reorderVideos(sponsorId: string, videos: ReorderVideoItem[]): Observable<unknown> {
    return this.api.put(
      `/analytics/advertisers/${sponsorId}/videos/reorder`,
      { videos }
    );
  }
}
