import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type { AssetUploadResult, RemotionTemplate, RenderResult } from './remotion-templates.types';

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

  render(templateId: string, props: Record<string, unknown>, title: string): Observable<RenderResult> {
    return this.api.post<RenderResult>(`/remotion-templates/${templateId}/render`, { props, title });
  }
}
