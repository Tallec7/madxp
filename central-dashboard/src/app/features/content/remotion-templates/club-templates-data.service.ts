import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type {
  RemotionTemplate,
  TemplateImageSlot,
  TemplateStudioView,
  TemplateTextField,
} from './remotion-templates.types';
import type {
  TemplateImageSlotUpdate,
  TemplateTextFieldUpdate,
} from './remotion-templates-data.service';

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
}
