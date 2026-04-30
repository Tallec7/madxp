/**
 * ADR-108 / ADR-109 — Data services UI super_admin pour le chantier templates JOUEUR.
 *
 * Couvre 3 domaines :
 *   - Versioning : publish / fork / list / setDefault (template-studio.routes /publish, /fork, /versions, /default-version)
 *   - Backgrounds : list / get / create / update / grants (template-backgrounds.routes)
 *   - Auto-crop photo joueur : POST /photo/auto-crop (SPEC JOUEUR Q15)
 *
 * Tous les endpoints sont gated super_admin côté serveur, on ne dédouble pas
 * la check ici (le ApiService renvoie 401/403 si pas autorisé).
 */

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../../core/services/api.service';

// ─── Versioning types ──────────────────────────────────────────────────────

export interface TemplateVersionSnapshot {
  id: string;
  template_id: string;
  version: string;
  layers_snapshot: unknown[];
  text_fields_snapshot: unknown[];
  image_slots_snapshot: unknown[];
  variants_snapshot: unknown[];
  fonts_snapshot: unknown[];
  published_at: string;
  published_by: string;
}

export interface ForkResult {
  id: string;
  version: string;
}

export interface SetDefaultVersionResult {
  template_id: string;
  version: string;
}

// ─── Backgrounds types ─────────────────────────────────────────────────────

export interface TemplateBackground {
  id: string;
  name: string;
  hex_color: string;
  webm_url: string;
  duration_ms: number | null;
  is_public: boolean;
  uploaded_by: string;
  created_at: string;
  archived_at: string | null;
}

export interface BackgroundGrant {
  user_id: string;
  granted_by: string;
  granted_at: string;
}

export interface BulkGrantResult {
  requested: number;
  affected: number;
}

// ─── Auto-crop type ────────────────────────────────────────────────────────

export interface AutoCropResult {
  bbox: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  suggested_offset_x: number;
  canvas_width: number;
  canvas_height: number;
  alpha_threshold: number;
  empty: boolean;
  has_alpha_channel: boolean;
  elapsed_ms: number;
}

// ───────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TemplateVersioningDataService {
  private api = inject(ApiService);

  // Versioning
  publishVersion(templateId: string): Observable<TemplateVersionSnapshot> {
    return this.api.post<TemplateVersionSnapshot>(
      `/remotion-templates/${templateId}/publish`,
      {}
    );
  }

  forkVersion(templateId: string, nextVersion: string): Observable<ForkResult> {
    return this.api.post<ForkResult>(
      `/remotion-templates/${templateId}/fork`,
      { next_version: nextVersion }
    );
  }

  listVersions(templateId: string): Observable<TemplateVersionSnapshot[]> {
    return this.api.get<TemplateVersionSnapshot[]>(
      `/remotion-templates/${templateId}/versions`
    );
  }

  setDefaultVersion(templateId: string, version: string): Observable<SetDefaultVersionResult> {
    return this.api.patch<SetDefaultVersionResult>(
      `/remotion-templates/${templateId}/default-version`,
      { version }
    );
  }

  // Backgrounds
  listBackgrounds(): Observable<TemplateBackground[]> {
    return this.api.get<TemplateBackground[]>('/templates/backgrounds');
  }

  getBackground(id: string): Observable<TemplateBackground> {
    return this.api.get<TemplateBackground>(`/templates/backgrounds/${id}`);
  }

  createBackground(
    file: File,
    payload: { name: string; hex_color: string; is_public?: boolean }
  ): Observable<TemplateBackground> {
    const fd = new FormData();
    fd.append('background', file);
    fd.append('name', payload.name);
    fd.append('hex_color', payload.hex_color);
    if (payload.is_public !== undefined) {
      fd.append('is_public', String(payload.is_public));
    }
    return this.api.upload<TemplateBackground>('/templates/backgrounds', fd);
  }

  updateBackground(
    id: string,
    patch: { name?: string; is_public?: boolean; archived?: boolean }
  ): Observable<TemplateBackground> {
    return this.api.patch<TemplateBackground>(`/templates/backgrounds/${id}`, patch);
  }

  grantBackground(id: string, userIds: string[]): Observable<BulkGrantResult> {
    return this.api.post<BulkGrantResult>(`/templates/backgrounds/${id}/grants`, {
      user_ids: userIds,
    });
  }

  listBackgroundGrants(id: string): Observable<BackgroundGrant[]> {
    return this.api.get<BackgroundGrant[]>(`/templates/backgrounds/${id}/grants`);
  }

  revokeBackgroundGrant(id: string, userId: string): Observable<void> {
    return this.api.delete<void>(`/templates/backgrounds/${id}/grants/${userId}`);
  }

  // Auto-crop
  autoCropPhoto(file: File, threshold = 16): Observable<AutoCropResult> {
    const fd = new FormData();
    fd.append('photo', file);
    return this.api.upload<AutoCropResult>(
      `/remotion-templates/photo/auto-crop?threshold=${threshold}`,
      fd
    );
  }
}
