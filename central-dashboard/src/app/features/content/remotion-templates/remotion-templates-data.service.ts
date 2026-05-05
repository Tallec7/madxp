import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import type {
  Anchor,
  AnimationDirection,
  AnimationPreset,
  AssetUploadResult,
  FitMode,
  Overflow,
  RemotionTemplate,
  RenderJobEnqueued,
  RenderJobSnapshot,
  RenderTemplateRequestV2,
  TemplateImageSlot,
  TemplateLayer,
  TemplateOption,
  TemplatePackshotRef,
  TemplatePropDef,
  TemplateStudioView,
  TemplateTextField,
  TemplateVariant,
  TemplateVersion,
  WebmAssetMetadata,
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
  animation?: AnimationPreset;
  defaultValue?: string;
  maxChars?: number | null;
  multiline?: boolean;
  required?: boolean;
  sortOrder?: number;
  alwaysVisible?: boolean;
  scaleFrom?: number;
  scaleTo?: number;
  /** ADR-086 */
  layerId?: string | null;
  respectAlpha?: boolean;
  animationDirection?: AnimationDirection;
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
  animation?: AnimationPreset;
  defaultValue?: string;
  maxChars?: number | null;
  multiline?: boolean;
  required?: boolean;
  sortOrder?: number;
  alwaysVisible?: boolean;
  scaleFrom?: number;
  scaleTo?: number;
  /** ADR-086 */
  layerId?: string;
  respectAlpha?: boolean;
  animationDirection?: AnimationDirection;
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
  animation?: AnimationPreset;
  aspectRatio?: string | null;
  required?: boolean;
  sortOrder?: number;
  /** ADR-086 */
  layerId?: string | null;
  anchor?: Anchor;
  fitMode?: FitMode;
  safeTopPct?: number | null;
  safeLeftPct?: number | null;
  safeWidthPct?: number | null;
  safeHeightPct?: number | null;
  overflow?: Overflow;
  animationDirection?: AnimationDirection;
  scaleFrom?: number | null;
  scaleTo?: number | null;
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
  animation?: AnimationPreset;
  aspectRatio?: string | null;
  required?: boolean;
  sortOrder?: number;
  /** ADR-086 */
  layerId?: string | null;
  anchor?: Anchor;
  fitMode?: FitMode;
  safeTopPct?: number | null;
  safeLeftPct?: number | null;
  safeWidthPct?: number | null;
  safeHeightPct?: number | null;
  overflow?: Overflow;
  animationDirection?: AnimationDirection;
  scaleFrom?: number | null;
  scaleTo?: number | null;
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

  // ── ADR-110 / Plan 02 — Library Asset Manager (super_admin) ───────────────
  // Distincts d'`uploadAsset` (per-template) : ces méthodes ciblent la
  // bibliothèque flat (catalogue de WebM partagés entre templates).

  listLibraryAssets(): Observable<WebmAssetMetadata[]> {
    return this.api.get<WebmAssetMetadata[]>('/remotion-templates/assets');
  }

  uploadLibraryAsset(
    file: File,
    opts: { respectAlpha?: boolean } = {},
  ): Observable<WebmAssetMetadata> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('respect_alpha', String(opts.respectAlpha ?? false));
    return this.api.upload<WebmAssetMetadata>('/remotion-templates/library/upload', formData);
  }

  deleteLibraryAsset(assetId: string): Observable<void> {
    return this.api.delete<void>(`/remotion-templates/assets/${encodeURIComponent(assetId)}`);
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

  /**
   * ADR-110 / Plan 04 / WIZARD-04 — Reorder all layers of a template.
   * Single transactional call (BEGIN/COMMIT server-side) — returns the
   * new ordered list (z_index ASC) so the caller can replace its signal
   * in one shot. Mounted on `/api/remotion-templates-studio` (NOT the
   * Studio router is mounted on `/api/remotion-templates` BEFORE the legacy
   * router (server.ts) so this URL hits `template-studio.routes.ts`.
   */
  reorderLayers(
    templateId: string,
    orderedLayerIds: string[],
  ): Observable<TemplateLayer[]> {
    return this.api.post<TemplateLayer[]>(
      `/remotion-templates/${encodeURIComponent(templateId)}/layers/reorder`,
      { orderedLayerIds },
    );
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

  // ── ADR-110 / Plan 05 — Template Options + Packshot Refs ─────────────────
  // Routes mounted on `/api/remotion-templates` (template-studio.routes.ts L210-273).
  // Backend returns snake_case rows (SELECT * FROM template_options). The
  // dashboard `TemplateOption` interface is camelCase (used by getStudioView),
  // so we normalize via rxjs `map`.

  /**
   * Plan 05 / WIZARD-01 — Crée une option club (enum | boolean).
   * Le backend valide via `schemas.templateOptionCreate` (snake_case).
   * 409 `key_exists` si l'option existe déjà sur ce template.
   */
  createOption(
    templateId: string,
    payload: {
      key: string;
      label: string;
      type: 'enum' | 'boolean';
      values: string[];
      default_value: string;
      user_editable?: boolean;
      sort_order?: number;
    },
  ): Observable<TemplateOption> {
    return this.api
      .post<TemplateOptionRow>(
        `/remotion-templates/${encodeURIComponent(templateId)}/options`,
        payload,
      )
      .pipe(map(mapTemplateOptionRow));
  }

  deleteOption(templateId: string, optionId: string): Observable<void> {
    return this.api.delete<void>(
      `/remotion-templates/${encodeURIComponent(templateId)}/options/${encodeURIComponent(optionId)}`,
    );
  }

  /**
   * Plan 02-04 / UX-03 — Patch an option (label, values, default_value, etc.).
   * Used by the value-removal flow + future inline label edit.
   */
  updateOption(
    templateId: string,
    optionId: string,
    payload: {
      label?: string;
      values?: string[];
      default_value?: string;
      user_editable?: boolean;
      sort_order?: number;
    },
  ): Observable<TemplateOption> {
    return this.api
      .patch<TemplateOptionRow>(
        `/remotion-templates/${encodeURIComponent(templateId)}/options/${encodeURIComponent(optionId)}`,
        payload,
      )
      .pipe(map(mapTemplateOptionRow));
  }

  /**
   * Plan 02-04 / UX-03 — Atomic rename of an option key.
   * Backend wraps 4 UPDATEs in BEGIN/COMMIT (template_options,
   * packshot_refs, text_fields.visible_if, image_slots.visible_if).
   * 400 `option_key_conflict` if newKey already exists on this template.
   */
  renameOptionKey(
    templateId: string,
    optionId: string,
    newKey: string,
  ): Observable<{
    id: string;
    key: string;
    updatedTextFields: number;
    updatedImageSlots: number;
    updatedPackshotRefs: number;
  }> {
    return this.api.post<{
      id: string;
      key: string;
      updatedTextFields: number;
      updatedImageSlots: number;
      updatedPackshotRefs: number;
    }>(
      `/remotion-templates/${encodeURIComponent(templateId)}/options/${encodeURIComponent(optionId)}/rename`,
      { newKey },
    );
  }

  /**
   * Plan 05 / WIZARD-01 — Liste les packshot refs (option_value → packshot_template_id).
   */
  listPackshotRefs(templateId: string): Observable<TemplatePackshotRef[]> {
    return this.api
      .get<TemplatePackshotRefRow[]>(
        `/remotion-templates/${encodeURIComponent(templateId)}/packshot-refs`,
      )
      .pipe(map((rows) => rows.map(mapPackshotRefRow)));
  }

  /**
   * Plan 05 / WIZARD-01 — Crée un mapping (option_key, option_value) → packshot_template_id.
   * Backend payload snake_case (validation Joi `templatePackshotRefCreate`).
   */
  createPackshotRef(
    templateId: string,
    payload: {
      option_key: string;
      option_value: string;
      packshot_template_id: string;
      start_at_ms?: number;
      z_index_offset?: number;
    },
  ): Observable<TemplatePackshotRef> {
    return this.api
      .post<TemplatePackshotRefRow>(
        `/remotion-templates/${encodeURIComponent(templateId)}/packshot-refs`,
        payload,
      )
      .pipe(map(mapPackshotRefRow));
  }

  deletePackshotRef(templateId: string, refId: string): Observable<void> {
    return this.api.delete<void>(
      `/remotion-templates/${encodeURIComponent(templateId)}/packshot-refs/${encodeURIComponent(refId)}`,
    );
  }

  /**
   * Plan 05 / WIZARD-01 — Liste les templates publiés disponibles comme packshot.
   * Filtré client-side (le contrôleur legacy ne supporte pas de query param).
   */
  listPublishedTemplates(): Observable<RemotionTemplate[]> {
    return this.api
      .get<RemotionTemplate[]>(`/remotion-templates`)
      .pipe(map((list) => list.filter((t) => t.published)));
  }

  // ── Phase 3 Plan 04 — Publish-gate UI (PUB-01 + PUB-02) ──────────────────

  /**
   * Plan 03-04 / PUB-01 — Fetch the 8-rule validation result for the
   * publish-gate panel (super_admin). Backend registry is owned by
   * `central-server/src/services/template-validation/index.ts` (Plan 03-02).
   */
  getValidation(
    templateId: string,
  ): Observable<{ results: ValidationResultDto[] }> {
    return this.api.get<{ results: ValidationResultDto[] }>(
      `/remotion-templates/${encodeURIComponent(templateId)}/validation`,
    );
  }

  /**
   * Plan 03-04 / PUB-02 — Trigger an async test render. Body is sealed
   * server-side (Plan 03-03 — `Joi.object({}).unknown(false)`); fixtures
   * are injected by the controller. Returns the job id; caller should
   * poll `pollRenderJob` until status=completed|failed.
   */
  createTestRender(
    templateId: string,
  ): Observable<RenderJobEnqueued> {
    return this.api.post<RenderJobEnqueued>(
      `/remotion-templates/${encodeURIComponent(templateId)}/test-render`,
      {},
    );
  }
}

// ── Plan 03-04 — Validation DTO (mirrors server contract) ────────────────

export interface ValidationResultDto {
  rule_id: string;
  ok: boolean;
  severity: 'error' | 'warning';
  message?: string;
  fixHint?: { step: number; entityId?: string };
}

// ── snake_case → camelCase mappers (Plan 05) ─────────────────────────────

interface TemplateOptionRow {
  id: string;
  template_id: string;
  key: string;
  label: string;
  type: 'enum' | 'boolean';
  values: unknown;
  default_value: string;
  user_editable: boolean;
  sort_order: number;
}

interface TemplatePackshotRefRow {
  id: string;
  template_id: string;
  option_key: string;
  option_value: string;
  packshot_template_id: string;
  start_at_ms: number;
  z_index_offset: number;
}

function mapTemplateOptionRow(row: TemplateOptionRow): TemplateOption {
  return {
    id: row.id,
    templateId: row.template_id,
    key: row.key,
    label: row.label,
    type: row.type,
    values: Array.isArray(row.values) ? (row.values as string[]) : [],
    defaultValue: row.default_value,
    userEditable: row.user_editable,
    sortOrder: row.sort_order,
  };
}

function mapPackshotRefRow(row: TemplatePackshotRefRow): TemplatePackshotRef {
  return {
    id: row.id,
    templateId: row.template_id,
    optionKey: row.option_key,
    optionValue: row.option_value,
    packshotTemplateId: row.packshot_template_id,
    startAtMs: row.start_at_ms,
    zIndexOffset: row.z_index_offset,
  };
}
