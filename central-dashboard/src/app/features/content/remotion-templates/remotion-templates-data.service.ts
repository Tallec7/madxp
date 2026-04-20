import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  AssetUploadResult,
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
  RenderTemplateRequestV2,
  TemplateImageSlot,
  TemplateLayer,
  TemplatePropDef,
  TemplateStudioView,
  TemplateTextField,
  TemplateVariant,
  TemplateVersion,
} from './remotion-templates.types';

/** Payload create variant — id + templateId sont injectés par le serveur. */
export type TemplateVariantCreate = Omit<TemplateVariant, 'id' | 'templateId'>;
export type TemplateVariantUpdate = Partial<TemplateVariantCreate>;

export type TemplateLayerCreate = Omit<TemplateLayer, 'id' | 'templateId'>;
export type TemplateLayerUpdate = Partial<TemplateLayerCreate>;

export type TemplateTextFieldCreate = Omit<TemplateTextField, 'id' | 'templateId'>;
export type TemplateTextFieldUpdate = Partial<TemplateTextFieldCreate>;

export type TemplateImageSlotCreate = Omit<TemplateImageSlot, 'id' | 'templateId'>;
export type TemplateImageSlotUpdate = Partial<TemplateImageSlotCreate>;

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

  /**
   * ADR-075 — Toggle schema_version 1 ↔ 2 (super_admin UI).
   * 409 si schema_version=2 demandé sans shadow data (variants/text_fields/image_slots).
   */
  setSchemaVersion(id: string, schemaVersion: 1 | 2): Observable<RemotionTemplate> {
    return this.api.patch<RemotionTemplate>(`/remotion-templates/${id}/schema-version`, {
      schema_version: schemaVersion,
    });
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

  createTemplate(payload: {
    name: string;
    composition_id: string;
    description?: string | null;
    props_schema?: TemplatePropDef[];
    default_props?: Record<string, unknown>;
  }): Observable<RemotionTemplate> {
    return this.api.post<RemotionTemplate>('/remotion-templates', payload);
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

  // ── ADR-075 Template Studio v2 — Admin CRUD (super_admin only) ────────────

  createVariant(templateId: string, payload: TemplateVariantCreate): Observable<TemplateVariant> {
    return this.api.post<TemplateVariant>(`/remotion-templates/${templateId}/variants`, payload);
  }

  updateVariant(
    templateId: string,
    variantId: string,
    patch: TemplateVariantUpdate,
  ): Observable<TemplateVariant> {
    return this.api.patch<TemplateVariant>(
      `/remotion-templates/${templateId}/variants/${variantId}`,
      patch,
    );
  }

  deleteVariant(templateId: string, variantId: string): Observable<void> {
    return this.api.delete<void>(`/remotion-templates/${templateId}/variants/${variantId}`);
  }

  createLayer(templateId: string, payload: TemplateLayerCreate): Observable<TemplateLayer> {
    return this.api.post<TemplateLayer>(`/remotion-templates/${templateId}/layers`, payload);
  }

  updateLayer(
    templateId: string,
    layerId: string,
    patch: TemplateLayerUpdate,
  ): Observable<TemplateLayer> {
    return this.api.patch<TemplateLayer>(
      `/remotion-templates/${templateId}/layers/${layerId}`,
      patch,
    );
  }

  deleteLayer(templateId: string, layerId: string): Observable<void> {
    return this.api.delete<void>(`/remotion-templates/${templateId}/layers/${layerId}`);
  }

  createTextField(
    templateId: string,
    payload: TemplateTextFieldCreate,
  ): Observable<TemplateTextField> {
    return this.api.post<TemplateTextField>(
      `/remotion-templates/${templateId}/text-fields`,
      payload,
    );
  }

  updateTextField(
    templateId: string,
    fieldId: string,
    patch: TemplateTextFieldUpdate,
  ): Observable<TemplateTextField> {
    return this.api.patch<TemplateTextField>(
      `/remotion-templates/${templateId}/text-fields/${fieldId}`,
      patch,
    );
  }

  deleteTextField(templateId: string, fieldId: string): Observable<void> {
    return this.api.delete<void>(`/remotion-templates/${templateId}/text-fields/${fieldId}`);
  }

  createImageSlot(
    templateId: string,
    payload: TemplateImageSlotCreate,
  ): Observable<TemplateImageSlot> {
    return this.api.post<TemplateImageSlot>(
      `/remotion-templates/${templateId}/image-slots`,
      payload,
    );
  }

  updateImageSlot(
    templateId: string,
    slotId: string,
    patch: TemplateImageSlotUpdate,
  ): Observable<TemplateImageSlot> {
    return this.api.patch<TemplateImageSlot>(
      `/remotion-templates/${templateId}/image-slots/${slotId}`,
      patch,
    );
  }

  deleteImageSlot(templateId: string, slotId: string): Observable<void> {
    return this.api.delete<void>(`/remotion-templates/${templateId}/image-slots/${slotId}`);
  }
}
