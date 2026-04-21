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

/**
 * Flat payload matching server Joi schema `templateStudioTextFieldCreate`
 * (positionX/positionY, not nested `position`). Do not use `Omit<TemplateTextField, ...>`
 * — the domain type has nested `position` but the API expects flat fields.
 */
export interface TemplateTextFieldCreate {
  slotKey: string;
  label: string;
  positionX: number;
  positionY: number;
  maxWidth?: number;
  fontFamily?: string;
  fontSize: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  appearAt: number;
  appearDuration?: number;
  animation?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in';
  defaultValue?: string;
  maxChars?: number | null;
  multiline?: boolean;
  required?: boolean;
  sortOrder?: number;
}

/**
 * Flat payload matching server Joi schema `templateStudioTextFieldUpdate`.
 */
export interface TemplateTextFieldUpdate {
  slotKey?: string;
  label?: string;
  positionX?: number;
  positionY?: number;
  maxWidth?: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  appearAt?: number;
  appearDuration?: number;
  animation?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in';
  defaultValue?: string;
  maxChars?: number | null;
  multiline?: boolean;
  required?: boolean;
  sortOrder?: number;
}

/**
 * Flat payload matching server Joi schema `templateStudioImageSlotCreate`.
 */
export interface TemplateImageSlotCreate {
  slotKey: string;
  label: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  appearAt: number;
  appearDuration?: number;
  animation?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in';
  aspectRatio?: string | null;
  required?: boolean;
  sortOrder?: number;
}

/**
 * Flat payload matching server Joi schema `templateStudioImageSlotUpdate`.
 */
export interface TemplateImageSlotUpdate {
  slotKey?: string;
  label?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  appearAt?: number;
  appearDuration?: number;
  animation?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in';
  aspectRatio?: string | null;
  required?: boolean;
  sortOrder?: number;
}

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

  /**
   * ADR-075 — Seed placeholders (1 variant + 1 text field + 1 image slot).
   * Idempotent : ne crée que ce qui manque. Utilisé par l'UI pour débloquer le
   * flip v1→v2 d'un template legacy sans passer par le wizard complet.
   */
  scaffoldStudio(
    id: string,
  ): Observable<{
    templateId: string;
    created: { variantsCreated: number; textFieldsCreated: number; imageSlotsCreated: number };
  }> {
    return this.api.post(`/remotion-templates/${id}/studio/scaffold`, {});
  }

  uploadAsset(templateId: string, file: File, propKey: string): Observable<AssetUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prop_key', propKey);
    return this.api.upload<AssetUploadResult>(`/remotion-templates/${templateId}/assets`, formData);
  }

  /**
   * ADR-075 V2 — Upload d'un asset (vidéo de fond variant, thumbnail, vidéo layer)
   * sans mutation de `default_props`. Le fichier atterrit dans le dossier FTP
   * `template-assets/studio/` (isolé du `remotion-assets/` legacy v1). L'URL
   * retournée doit ensuite être branchée via PATCH sur la ressource cible.
   */
  uploadStudioAsset(templateId: string, file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.upload<{ url: string }>(
      `/remotion-templates/${templateId}/assets`,
      formData,
    );
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
      canvas_width: number;
      canvas_height: number;
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
