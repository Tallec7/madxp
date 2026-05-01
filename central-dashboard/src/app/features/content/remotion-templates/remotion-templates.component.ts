import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { RemotionTemplatesDataService } from './remotion-templates-data.service';
import { TemplateGridComponent } from './template-grid.component';
import { TemplatePropsFormComponent } from './template-props-form.component';
import { TemplatePreviewComponent } from './template-preview.component';
import { TemplateSchemaEditorComponent } from './template-schema-editor.component';
import { TemplateVersionsComponent } from './template-versions.component';
import { StudioV2EditorComponent } from './studio-v2/studio-v2-editor.component';
import { AdminStudioPanelComponent } from './studio-v2/admin/admin-studio-panel.component';
import { CreateTemplateWizardComponent } from './studio-v2/admin/create-template-wizard.component';
import type {
  RemotionTemplate,
  RenderJobPhase,
  RenderJobSnapshot,
  RenderResult,
  RenderTemplateRequestV2,
  TemplatePropDef,
  TemplateStudioView,
  TemplateVersion,
} from './remotion-templates.types';
import { isV2Template } from './remotion-templates.types';

/**
 * Orchestrateur de la page Templates Remotion.
 * Délègue la présentation aux sous-composants (grid / props form / preview)
 * et coordonne l'état partagé (template sélectionné, props values, render).
 */
@Component({
  selector: 'app-remotion-templates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    TemplateGridComponent,
    TemplatePropsFormComponent,
    TemplatePreviewComponent,
    TemplateSchemaEditorComponent,
    TemplateVersionsComponent,
    StudioV2EditorComponent,
    AdminStudioPanelComponent,
    CreateTemplateWizardComponent,
  ],
  templateUrl: './remotion-templates.component.html',
  styleUrls: ['./remotion-templates.component.scss'],
})
export class RemotionTemplatesComponent implements OnInit, OnDestroy {
  private dataService = inject(RemotionTemplatesDataService);
  private notifications = inject(NotificationService);
  private authService = inject(AuthService);

  templates: RemotionTemplate[] = [];
  selectedTemplate: RemotionTemplate | null = null;
  loading = true;

  propValues: Record<string, unknown> = {};
  imageUrls: Record<string, string> = {};
  imageFiles: Record<string, File> = {};
  assetUploading: Record<string, boolean> = {};
  videoTitle = '';

  rendering = false;
  renderProgress = 0;
  renderStatusMessage = 'Démarrage du render...';
  lastResult: RenderResult | null = null;

  private currentJobId: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly POLL_INTERVAL_MS = 2000;

  // ADR-075 Sprint 2 — studio v2 state
  studioView: TemplateStudioView | null = null;
  studioLoading = false;
  renderPayloadV2: RenderTemplateRequestV2 | null = null;
  readyV2 = false;

  // Admin UX (ADR-055)
  schemaEditorOpen = false;
  schemaEditorSaving = false;
  versions: TemplateVersion[] = [];
  versionsLoading = false;
  restoringVersionId: string | null = null;
  duplicating = false;
  schemaVersionFlipping = false;

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get isAdmin(): boolean {
    const role = this.authService.getCurrentUser()?.role;
    return role === 'admin' || role === 'super_admin';
  }

  /**
   * ADR-075 Sprint 3 — le mode admin Studio (édition variants/layers/fields)
   * est réservé au super_admin. Les admins simples peuvent éditer le schéma
   * props legacy mais pas la composition V2.
   */
  get isSuperAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'super_admin';
  }

  // ADR-075 Sprint 3 — toggle entre mode "preview utilisateur" et "édition admin"
  studioAdminMode = false;

  toggleStudioAdminMode(): void {
    if (!this.isSuperAdmin) return;
    this.studioAdminMode = !this.studioAdminMode;
  }

  /** Re-charge la vue studio après une mutation admin (create/update/delete). */
  onStudioChanged(): void {
    if (this.selectedTemplate) this.loadStudioView(this.selectedTemplate.id);
  }

  // ADR-075 V2 — filtre gallery "Mes templates perso" (white-glove scoping)
  templateScopeFilter: 'all' | 'mine' | 'global' = 'all';

  get currentUserSiteId(): string | null {
    return this.authService.getCurrentUser()?.site_id ?? null;
  }

  get hasClubScopedTemplates(): boolean {
    return this.templates.some((t) => !!t.site_id);
  }

  get filteredTemplates(): RemotionTemplate[] {
    if (this.templateScopeFilter === 'all') return this.templates;
    if (this.templateScopeFilter === 'global') {
      return this.templates.filter((t) => !t.site_id);
    }
    // 'mine' : scoped au site courant (club/operator) OU tous les scopés (admin sans site_id)
    const siteId = this.currentUserSiteId;
    return this.templates.filter((t) =>
      siteId ? t.site_id === siteId : !!t.site_id,
    );
  }

  setTemplateScopeFilter(scope: 'all' | 'mine' | 'global'): void {
    this.templateScopeFilter = scope;
  }

  // ADR-075 Sprint 3 — wizard création template (super_admin)
  wizardOpen = false;

  openWizard(): void {
    if (!this.isSuperAdmin) return;
    this.wizardOpen = true;
  }

  closeWizard(): void {
    this.wizardOpen = false;
  }

  onTemplateCreated(tpl: RemotionTemplate): void {
    this.wizardOpen = false;
    this.templates = [tpl, ...this.templates];
    this.selectTemplate(tpl);
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  private loadTemplates(): void {
    this.loading = true;
    this.dataService.list().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.loading = false;
      },
      error: () => {
        this.notifications.error('Impossible de charger les templates');
        this.loading = false;
      },
    });
  }

  selectTemplate(tpl: RemotionTemplate): void {
    this.selectedTemplate = tpl;
    this.lastResult = null;
    this.propValues = { ...tpl.default_props };
    this.imageUrls = {};
    this.imageFiles = {};
    this.assetUploading = {};
    this.videoTitle = tpl.name;
    this.studioView = null;
    this.renderPayloadV2 = null;
    this.readyV2 = false;
    this.studioAdminMode = false;

    if (isV2Template(tpl)) {
      this.loadStudioView(tpl.id);
    }
  }

  get isV2(): boolean {
    return !!this.selectedTemplate && isV2Template(this.selectedTemplate);
  }

  private loadStudioView(templateId: string): void {
    this.studioLoading = true;
    this.dataService.getStudioView(templateId).subscribe({
      next: (view) => {
        this.studioView = view;
        this.studioLoading = false;
      },
      error: () => {
        this.studioLoading = false;
        this.notifications.error('Impossible de charger la vue Studio');
      },
    });
  }

  onV2PayloadChange(payload: RenderTemplateRequestV2): void {
    this.renderPayloadV2 = payload;
  }

  onV2ReadyChange(ready: boolean): void {
    this.readyV2 = ready;
  }

  closePanel(): void {
    this.selectedTemplate = null;
  }

  togglePublish(tpl: RemotionTemplate): void {
    this.dataService.togglePublish(tpl.id, !tpl.published).subscribe({
      next: (updated) => {
        const idx = this.templates.findIndex((t) => t.id === tpl.id);
        if (idx !== -1) this.templates = [...this.templates.slice(0, idx), updated, ...this.templates.slice(idx + 1)];
        this.notifications.success(updated.published ? 'Template publié' : 'Template dépublié');
      },
      error: () => this.notifications.error('Erreur lors de la publication'),
    });
  }

  // ── Props form events ─────────────────────────────────────────────────────

  onPropChange(key: string, value: unknown): void {
    this.propValues = { ...this.propValues, [key]: value };
  }

  onImageSelect(key: string, file: File): void {
    this.imageFiles[key] = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.imageUrls = { ...this.imageUrls, [key]: dataUrl };
      this.onPropChange(key, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  removeImage(key: string): void {
    const { [key]: _removed, ...restUrls } = this.imageUrls;
    const { [key]: _removedFile, ...restFiles } = this.imageFiles;
    void _removed;
    void _removedFile;
    this.imageUrls = restUrls;
    this.imageFiles = restFiles;
    const defaultVal = this.selectedTemplate?.default_props[key] ?? '';
    this.onPropChange(key, defaultVal);
  }

  onAssetSelect(key: string, file: File): void {
    if (!this.selectedTemplate) return;

    this.assetUploading = { ...this.assetUploading, [key]: true };
    this.dataService.uploadAsset(this.selectedTemplate.id, file, key).subscribe({
      next: ({ url }) => {
        this.assetUploading = { ...this.assetUploading, [key]: false };
        this.onPropChange(key, url);
        this.notifications.success(`Asset "${key}" uploadé`);
      },
      error: () => {
        this.assetUploading = { ...this.assetUploading, [key]: false };
        this.notifications.error('Échec upload asset');
      },
    });
  }

  removeAsset(key: string): void {
    const defaultVal = this.selectedTemplate?.default_props[key] ?? undefined;
    this.onPropChange(key, defaultVal);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  canRender(): boolean {
    if (!this.selectedTemplate) return false;
    if (this.isV2) return this.readyV2 && !!this.renderPayloadV2;
    return this.selectedTemplate.props_schema
      .filter((p) => p.required && (!p.admin_only || this.isAdmin))
      .every((p) => this.isPropFilled(p));
  }

  private isPropFilled(prop: TemplatePropDef): boolean {
    const value = this.propValues[prop.key];
    if (prop.type === 'text') return !!(value as string | undefined)?.trim();
    if (prop.type === 'number') return typeof value === 'number' && !Number.isNaN(value);
    return value !== null && value !== undefined && value !== '';
  }

  async render(): Promise<void> {
    if (!this.selectedTemplate || !this.canRender()) return;
    this.stopPolling();
    this.rendering = true;
    this.renderProgress = 2;
    this.renderStatusMessage = 'Envoi au serveur...';
    this.lastResult = null;

    const title = this.videoTitle || this.selectedTemplate.name;

    const onJob = (job: { job_id: string; progress: number }): void => {
      this.currentJobId = job.job_id;
      this.renderProgress = Math.max(5, job.progress);
      this.renderStatusMessage = 'Render en file d\'attente...';
      this.pollJob();
    };
    const onErr = (err: { error?: { detail?: string } }): void => {
      this.rendering = false;
      this.notifications.error(err?.error?.detail || 'Erreur lors du render');
    };

    if (this.isV2 && this.renderPayloadV2) {
      this.dataService
        .enqueueRenderV2(this.selectedTemplate.id, this.renderPayloadV2, title)
        .subscribe({ next: onJob, error: onErr });
      return;
    }

    // Remplace les File images par leur dataURL pour les props finales.
    const props: Record<string, unknown> = { ...this.propValues };
    for (const [key, file] of Object.entries(this.imageFiles)) {
      props[key] = await this.fileToDataUrl(file);
    }

    this.dataService
      .enqueueRender(this.selectedTemplate.id, props, title)
      .subscribe({ next: onJob, error: onErr });
  }

  private pollJob(): void {
    if (!this.currentJobId) return;
    this.pollTimer = setTimeout(() => {
      if (!this.currentJobId) return;
      this.dataService.pollRenderJob(this.currentJobId).subscribe({
        next: (snapshot) => this.applyJobSnapshot(snapshot),
        error: (err) => {
          // Transient network blip: keep polling. Hard 404/403 stops.
          const status = err?.status;
          if (status === 404 || status === 403) {
            this.rendering = false;
            this.stopPolling();
            this.notifications.error('Render job introuvable');
          } else {
            this.pollJob();
          }
        },
      });
    }, this.POLL_INTERVAL_MS);
  }

  private applyJobSnapshot(snapshot: RenderJobSnapshot): void {
    this.renderProgress = Math.max(this.renderProgress, snapshot.progress);
    this.renderStatusMessage = this.statusMessageFor(snapshot.status, snapshot.phase);

    if (snapshot.status === 'completed') {
      this.stopPolling();
      this.rendering = false;
      this.renderProgress = 100;
      if (snapshot.video_id && snapshot.video_url) {
        this.lastResult = {
          video_id: snapshot.video_id,
          url: snapshot.video_url,
          title: this.videoTitle || this.selectedTemplate?.name || '',
          file_size: snapshot.file_size ?? 0,
        };
      }
      this.notifications.success('Vidéo générée et ajoutée à la bibliothèque !');
      return;
    }

    if (snapshot.status === 'failed') {
      this.stopPolling();
      this.rendering = false;
      this.notifications.error(snapshot.error_message || 'Erreur lors du render');
      return;
    }

    // Still pending or running → continue polling
    this.pollJob();
  }

  private statusMessageFor(status: string, phase: RenderJobPhase): string {
    if (status === 'pending') return 'En file d\'attente...';
    switch (phase) {
      case 'bundling': return 'Préparation du moteur Remotion...';
      case 'selecting': return 'Analyse de la composition...';
      case 'rendering': return 'Rendu des frames en cours...';
      case 'uploading': return 'Téléversement de la vidéo...';
      default: return 'Render en cours...';
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.currentJobId = null;
  }

  formatSize(bytes: number): string {
    if (!bytes) return '-';
    return bytes > 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(bytes / 1000)} KB`;
  }

  // ── Admin: duplicate / schema editor / versions (ADR-055) ─────────────────

  openSchemaEditor(): void {
    if (!this.isAdmin || !this.selectedTemplate) return;
    this.schemaEditorOpen = true;
  }

  closeSchemaEditor(): void {
    this.schemaEditorOpen = false;
  }

  saveSchema(payload: { props_schema: TemplatePropDef[]; default_props: Record<string, unknown> }): void {
    if (!this.selectedTemplate) return;
    this.schemaEditorSaving = true;
    this.dataService
      .updateTemplate(this.selectedTemplate.id, {
        props_schema: payload.props_schema,
        default_props: payload.default_props,
      })
      .subscribe({
        next: (updated) => {
          this.schemaEditorSaving = false;
          this.schemaEditorOpen = false;
          this.applyUpdatedTemplate(updated);
          this.notifications.success('Schéma enregistré — version précédente sauvegardée');
          this.refreshVersions();
        },
        error: () => {
          this.schemaEditorSaving = false;
          this.notifications.error('Échec de la sauvegarde du schéma');
        },
      });
  }

  duplicateTemplate(): void {
    if (!this.isAdmin || !this.selectedTemplate || this.duplicating) return;
    this.duplicating = true;
    this.dataService.duplicateTemplate(this.selectedTemplate.id).subscribe({
      next: (copy) => {
        this.duplicating = false;
        this.templates = [copy, ...this.templates];
        this.notifications.success(`Template dupliqué : "${copy.name}"`);
        this.selectTemplate(copy);
      },
      error: () => {
        this.duplicating = false;
        this.notifications.error('Échec de la duplication');
      },
    });
  }

  onVersionsToggle(opened: boolean): void {
    if (opened) this.refreshVersions();
  }

  private refreshVersions(): void {
    if (!this.selectedTemplate || !this.isAdmin) return;
    this.versionsLoading = true;
    this.dataService.listVersions(this.selectedTemplate.id).subscribe({
      next: (versions) => {
        this.versions = versions;
        this.versionsLoading = false;
      },
      error: () => {
        this.versionsLoading = false;
        this.notifications.error("Impossible de charger l'historique");
      },
    });
  }

  restoreVersion(version: TemplateVersion): void {
    if (!this.selectedTemplate || !this.isAdmin) return;
    this.restoringVersionId = version.id;
    this.dataService.restoreVersion(this.selectedTemplate.id, version.id).subscribe({
      next: (updated) => {
        this.restoringVersionId = null;
        this.applyUpdatedTemplate(updated);
        this.notifications.success('Version restaurée');
        this.refreshVersions();
      },
      error: () => {
        this.restoringVersionId = null;
        this.notifications.error('Échec de la restauration');
      },
    });
  }

  /**
   * ADR-075 — Bascule schema_version 1 ↔ 2 (super_admin uniquement).
   * 409 si flip v1→v2 sans shadow data (variants/text_fields/image_slots).
   */
  toggleSchemaVersion(): void {
    if (!this.isSuperAdmin || !this.selectedTemplate || this.schemaVersionFlipping) return;
    const current = (this.selectedTemplate.schema_version ?? 1) as 1 | 2;
    const target: 1 | 2 = current === 2 ? 1 : 2;
    this.schemaVersionFlipping = true;
    this.dataService.setSchemaVersion(this.selectedTemplate.id, target).subscribe({
      next: (updated) => {
        this.schemaVersionFlipping = false;
        this.applyUpdatedTemplate(updated);
        this.notifications.success(`Schéma basculé en v${target}`);
        if (isV2Template(updated)) this.loadStudioView(updated.id);
        else this.studioView = null;
      },
      error: (err: { status?: number; error?: { error?: string; missing?: Record<string, boolean> } }) => {
        this.schemaVersionFlipping = false;
        if (err?.status === 409) {
          this.handleSchemaVersionConflict(err.error?.missing);
        } else {
          this.notifications.error('Échec du changement de schéma');
        }
      },
    });
  }

  /**
   * ADR-075 — UX 409 : liste le manquant et propose un seed placeholders
   * one-click qui débloque le flip v1→v2 sans passer par le wizard complet.
   */
  private handleSchemaVersionConflict(missing?: Record<string, boolean>): void {
    const parts = missing
      ? Object.entries(missing)
          .filter(([, m]) => m)
          .map(([k]) => k)
          .join(', ')
      : '';
    const detail = parts ? ` (${parts})` : '';
    const confirmed = window.confirm(
      `Impossible de passer en v2 : shadow data manquante${detail}.\n\n` +
        `Initialiser automatiquement 1 variante + 1 champ texte + 1 slot image ` +
        `avec des placeholders ? Tu pourras ensuite les éditer via le mode admin.`,
    );
    if (!confirmed || !this.selectedTemplate) return;
    const templateId = this.selectedTemplate.id;
    this.schemaVersionFlipping = true;
    this.dataService.scaffoldStudio(templateId).subscribe({
      next: () => {
        this.dataService.setSchemaVersion(templateId, 2).subscribe({
          next: (updated) => {
            this.schemaVersionFlipping = false;
            this.applyUpdatedTemplate(updated);
            this.notifications.success('Schéma basculé en v2 avec placeholders');
            if (isV2Template(updated)) this.loadStudioView(updated.id);
          },
          error: () => {
            this.schemaVersionFlipping = false;
            this.notifications.error('Scaffold OK mais échec du flip v2');
          },
        });
      },
      error: () => {
        this.schemaVersionFlipping = false;
        this.notifications.error("Échec de l'initialisation des placeholders");
      },
    });
  }

  private applyUpdatedTemplate(updated: RemotionTemplate): void {
    const idx = this.templates.findIndex((t) => t.id === updated.id);
    if (idx !== -1) {
      this.templates = [...this.templates.slice(0, idx), updated, ...this.templates.slice(idx + 1)];
    }
    this.selectedTemplate = updated;
    this.propValues = { ...updated.default_props };
    this.imageUrls = {};
    this.imageFiles = {};
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
