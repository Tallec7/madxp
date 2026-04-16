import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  AssetUploadResult,
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
} from './remotion-templates.types';

/**
 * Wrap des appels API `/api/remotion-templates/*`.
 * Extrait du composant pour découpler la logique UI des Observables HTTP.
 */
@Injectable({ providedIn: 'root' })
export class RemotionTemplatesDataService {
  private api = inject(ApiService);

  list(): Observable<RemotionTemplate[]> {
    return this.api.get<RemotionTemplate[]>('/remotion-templates');
  }

  togglePublish(id: string, published: boolean): Observable<RemotionTemplate> {
    return this.api.patch<RemotionTemplate>(`/remotion-templates/${id}/publish`, { published });
  }

  uploadAsset(templateId: string, file: File, propKey: string): Observable<AssetUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prop_key', propKey);
    return this.api.upload<AssetUploadResult>(`/remotion-templates/${templateId}/assets`, formData);
  }

  /**
   * Enqueue an async render job (ADR-054). Returns 202 with job_id; use
   * `pollRenderJob` to follow progress.
   */
  enqueueRender(
    templateId: string,
    props: Record<string, unknown>,
    title: string,
  ): Observable<RenderJobEnqueued> {
    return this.api.post<RenderJobEnqueued>(`/remotion-templates/${templateId}/render`, {
      props,
      title,
    });
  }

  pollRenderJob(jobId: string): Observable<RenderJobSnapshot> {
    return this.api.get<RenderJobSnapshot>(`/remotion-templates/render-jobs/${jobId}`);
  }
}
