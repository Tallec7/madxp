import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  AssetUploadResult,
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
  RenderTemplateRequestV2,
  TemplatePropDef,
  TemplateStudioView,
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
   * ADR-077 — Upload image utilisateur (JPEG/PNG/WebP ≤ 10Mo) accessible à tout
   * rôle authentifié (pas uniquement super_admin). L'URL retournée doit être
   * injectée dans le payload render v2 sous `imageUploads[slotKey]`.
   */
  uploadUserImage(
    templateId: string,
    file: File,
    slotKey: string,
  ): Observable<{ url: string; slot_key: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('slot_key', slotKey);
    return this.api.upload<{ url: string; slot_key: string }>(
      `/remotion-templates/${templateId}/user-uploads`,
      formData,
    );
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

  // ── ADR-075 Template Studio v2 ─────────────────────────────────────────────

  /**
   * Charge la vue consolidée V2 (variants + layers + text_fields + image_slots).
   * Retourne 404 si `schema_version = 1` — fallback legacy.
   */
  getStudioView(templateId: string): Observable<TemplateStudioView> {
    return this.api.get<TemplateStudioView>(`/remotion-templates/${templateId}/studio`);
  }

  /**
   * Render v2 : enqueue un job avec payload `{ variantId, textValues, imageUploads }`
   * transporté sous la clé `props` (le worker discrimine par la forme).
   */
  enqueueRenderV2(
    templateId: string,
    payload: RenderTemplateRequestV2,
    title: string,
  ): Observable<RenderJobEnqueued> {
    return this.api.post<RenderJobEnqueued>(`/remotion-templates/${templateId}/render`, {
      props: payload,
      title,
    });
  }
}
