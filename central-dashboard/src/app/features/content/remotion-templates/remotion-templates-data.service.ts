import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  AssetUploadResult,
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
  TemplatePropDef,
  TemplateVersion,
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

  // ── Admin: schema editor + duplicate + versions (ADR-055) ──────────────────

  updateTemplate(
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      props_schema: TemplatePropDef[];
      default_props: Record<string, unknown>;
    }>,
  ): Observable<RemotionTemplate> {
    return this.api.patch<RemotionTemplate>(`/remotion-templates/${id}`, patch);
  }

  duplicateTemplate(id: string, name?: string): Observable<RemotionTemplate> {
    return this.api.post<RemotionTemplate>(`/remotion-templates/${id}/duplicate`, name ? { name } : {});
  }

  listVersions(id: string): Observable<TemplateVersion[]> {
    return this.api.get<TemplateVersion[]>(`/remotion-templates/${id}/versions`);
  }

  restoreVersion(templateId: string, versionId: string): Observable<RemotionTemplate> {
    return this.api.post<RemotionTemplate>(
      `/remotion-templates/${templateId}/versions/${versionId}/restore`,
      {},
    );
  }
}
