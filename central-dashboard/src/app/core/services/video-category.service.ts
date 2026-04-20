import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { VideoCategory, CreateVideoCategoryDto, UpdateVideoCategoryDto, mapVideoCategory } from '../models/video-category.model';

@Injectable({ providedIn: 'root' })
export class VideoCategoryService {
  private readonly api = inject(ApiService);

  list(siteId: string): Observable<VideoCategory[]> {
    return this.api.get<{ data: Record<string, unknown>[] }>(`/sites/${siteId}/video-categories`).pipe(
      map(res => res.data.map(mapVideoCategory))
    );
  }

  create(siteId: string, dto: CreateVideoCategoryDto): Observable<VideoCategory> {
    return this.api.post<{ data: Record<string, unknown> }>(`/sites/${siteId}/video-categories`, dto).pipe(
      map(res => mapVideoCategory(res.data))
    );
  }

  update(siteId: string, id: string, dto: UpdateVideoCategoryDto): Observable<VideoCategory> {
    return this.api.put<{ data: Record<string, unknown> }>(`/sites/${siteId}/video-categories/${id}`, dto).pipe(
      map(res => mapVideoCategory(res.data))
    );
  }

  delete(siteId: string, id: string): Observable<void> {
    return this.api.delete<void>(`/sites/${siteId}/video-categories/${id}`);
  }
}
