import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
  RenderTemplateRequestV2,
  TemplateImageSlot,
  TemplateStudioView,
  TemplateTextField,
  TemplateVariant,
} from './remotion-templates.types';
import type {
  TemplateImageSlotUpdate,
  TemplateTextFieldUpdate,
} from './remotion-templates-data.service';

/** ADR-075 V3 Phase D — Quota snapshot returned by GET /club/remotion-templates/quota. */
export interface ClubTemplateQuota {
  templates: { used: number; limit: number; remaining: number };
  renders: { used: number; limit: number; remaining: number; windowHours: 24 };
}

/**
 * ADR-075 V3 Phase B — Wrap des appels `/api/club/remotion-templates/*`.
 *
 * Uniquement les opérations nécessaires au mode club_admin restreint :
 * list / studio view / rename / drag-patch.
 * Création de variants/layers/champs → NON exposée côté club.
 */
@Injectable({ providedIn: 'root' })
export class ClubTemplatesDataService {
  private api = inject(ApiService);

  list(): Observable<RemotionTemplate[]> {
    return this.api.get<RemotionTemplate[]>('/club/remotion-templates');
  }

  /** ADR-075 V3 Phase D — snapshot quotas templates + renders. */
  getQuota(): Observable<ClubTemplateQuota> {
    return this.api.get<ClubTemplateQuota>('/club/remotion-templates/quota');
  }

  getStudioView(templateId: string): Observable<TemplateStudioView> {
    return this.api.get<TemplateStudioView>(
      `/club/remotion-templates/${templateId}/studio`,
    );
  }

  updateTemplate(
    id: string,
    patch: Partial<{ name: string; canvas_width: number; canvas_height: number }>,
  ): Observable<RemotionTemplate> {
    return this.api.patch<RemotionTemplate>(`/club/remotion-templates/${id}`, patch);
  }

  updateTextField(
    templateId: string,
    fieldId: string,
    patch: TemplateTextFieldUpdate,
  ): Observable<TemplateTextField> {
    return this.api.patch<TemplateTextField>(
      `/club/remotion-templates/${templateId}/text-fields/${fieldId}`,
      patch,
    );
  }

  updateImageSlot(
    templateId: string,
    slotId: string,
    patch: TemplateImageSlotUpdate,
  ): Observable<TemplateImageSlot> {
    return this.api.patch<TemplateImageSlot>(
      `/club/remotion-templates/${templateId}/image-slots/${slotId}`,
      patch,
    );
  }

  /** ADR-075 V3 Phase C — upload d'une vidéo de fond pour la variante principale. */
  uploadVariantBackground(
    templateId: string,
    file: File,
  ): Observable<{ url: string; variant: TemplateVariant }> {
    const form = new FormData();
    form.append('file', file);
    return this.api.upload<{ url: string; variant: TemplateVariant }>(
      `/club/remotion-templates/${templateId}/background`,
      form,
    );
  }

  /**
   * ADR-077 — Upload d'une image utilisateur (logo club, photo joueur, etc.) liée
   * à un slot image du template. L'URL retournée est ensuite injectée dans le
   * payload render v2 sous `imageUploads[slotKey]`.
   *
   * Endpoint partagé avec l'admin (`POST /remotion-templates/:id/user-uploads`)
   * mais autorisé pour les rôles club/operator/advertiser via le middleware
   * `requireRole(['admin', 'super_admin', 'operator', 'club'])`.
   */
  uploadUserImage(
    templateId: string,
    file: File,
    slotKey: string,
  ): Observable<{ url: string; slot_key: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('slot_key', slotKey);
    return this.api.upload<{ url: string; slot_key: string }>(
      `/remotion-templates/${templateId}/user-uploads`,
      form,
    );
  }

  /**
   * ADR-054 + ADR-075 V2 — Lance un rendu async pour un template v2.
   * Retourne 202 + `job_id` ; suivre via `pollRenderJob`.
   *
   * Endpoint partagé avec l'admin mais ouvert au rôle `club` (cf. routes
   * `remotion-templates.routes.ts:141`). Le quota côté serveur est appliqué
   * automatiquement (voir ADR-075 V3 Phase D).
   */
  enqueueRenderV2(
    templateId: string,
    payload: RenderTemplateRequestV2,
    title: string,
  ): Observable<RenderJobEnqueued> {
    return this.api.post<RenderJobEnqueued>(
      `/remotion-templates/${templateId}/render`,
      { props: payload, title },
    );
  }

  /**
   * Polling d'un job de rendu. À appeler toutes les 2s tant que le statut
   * n'est ni `completed` ni `failed`.
   */
  pollRenderJob(jobId: string): Observable<RenderJobSnapshot> {
    return this.api.get<RenderJobSnapshot>(`/remotion-templates/render-jobs/${jobId}`);
  }
}
