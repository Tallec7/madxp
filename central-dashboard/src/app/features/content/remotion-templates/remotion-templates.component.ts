import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { RemotionTemplatesDataService } from './remotion-templates-data.service';
import { TemplateGridComponent } from './template-grid.component';
import { TemplatePropsFormComponent } from './template-props-form.component';
import { TemplatePreviewComponent } from './template-preview.component';
import type { RemotionTemplate, RenderResult, TemplatePropDef } from './remotion-templates.types';

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
    TranslateModule,
    TemplateGridComponent,
    TemplatePropsFormComponent,
    TemplatePreviewComponent,
  ],
  templateUrl: './remotion-templates.component.html',
  styleUrls: ['./remotion-templates.component.scss'],
})
export class RemotionTemplatesComponent implements OnInit {
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

  get isAdmin(): boolean {
    const role = this.authService.getCurrentUser()?.role;
    return role === 'admin' || role === 'super_admin';
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
    this.rendering = true;
    this.renderProgress = 5;
    this.renderStatusMessage = 'Envoi au serveur...';
    this.lastResult = null;

    // Remplace les File images par leur dataURL pour les props finales.
    const props: Record<string, unknown> = { ...this.propValues };
    for (const [key, file] of Object.entries(this.imageFiles)) {
      props[key] = await this.fileToDataUrl(file);
    }

    this.renderProgress = 15;
    this.renderStatusMessage = 'Render Remotion en cours (~2 min)...';

    const title = this.videoTitle || this.selectedTemplate.name;
    this.dataService.render(this.selectedTemplate.id, props, title).subscribe({
      next: (result) => {
        this.lastResult = result;
        this.rendering = false;
        this.renderProgress = 100;
        this.notifications.success('Vidéo générée et ajoutée à la bibliothèque !');
      },
      error: (err) => {
        this.rendering = false;
        this.notifications.error(err?.error?.detail || 'Erreur lors du render');
      },
    });
  }

  formatSize(bytes: number): string {
    if (!bytes) return '-';
    return bytes > 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.round(bytes / 1000)} KB`;
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
