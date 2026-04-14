import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { SitesService } from '../../core/services/sites.service';
import { FeatureGateService } from '../../core/services/feature-gate.service';
import { Site } from '../../core/models';

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplatePropDef {
  key: string;
  label: string;
  type: 'text' | 'image';
  required: boolean;
  placeholder?: string;
}

interface RemotionTemplate {
  id: string;
  name: string;
  composition_id: string;
  description: string;
  props_schema: TemplatePropDef[];
  default_props: Record<string, string>;
  thumbnail_url: string | null;
  published: boolean;
  created_at: string;
}

interface RenderResult {
  video_id: string;
  url: string;
  title: string;
  file_size: number;
}

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-remotion-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Templates Vidéo <span class="badge-new">Remotion</span></h1>
          <p class="subtitle">
            {{ isAdmin ? 'Atelier de création — gérez et publiez les templates' : 'Générez des vidéos personnalisées depuis les templates' }}
          </p>
        </div>
        <div class="site-selector" *ngIf="!isAdmin">
          <select [(ngModel)]="selectedSiteId">
            <option value="">-- Choisir un site --</option>
            <option *ngFor="let site of sites" [value]="site.id">
              {{ site.club_name }} ({{ site.site_name }})
            </option>
          </select>
        </div>
      </div>

      <!-- Loading -->
      <div class="loading-state" *ngIf="loading">Chargement des templates...</div>

      <!-- Liste des templates -->
      <div class="templates-grid" *ngIf="!loading && templates.length > 0">
        <div *ngFor="let tpl of templates"
             class="template-card"
             [class.selected]="selectedTemplate?.id === tpl.id"
             (click)="selectTemplate(tpl)">
          <div class="tpl-thumb" *ngIf="tpl.thumbnail_url">
            <img [src]="tpl.thumbnail_url" [alt]="tpl.name" />
          </div>
          <div class="tpl-thumb tpl-thumb-placeholder" *ngIf="!tpl.thumbnail_url">
            <span>🎬</span>
          </div>
          <div class="tpl-info">
            <div class="tpl-name">{{ tpl.name }}</div>
            <div class="tpl-desc">{{ tpl.description }}</div>
            <div class="tpl-badges">
              <span class="badge badge-published" *ngIf="tpl.published">Publié</span>
              <span class="badge badge-draft" *ngIf="!tpl.published && isAdmin">Brouillon</span>
            </div>
          </div>
          <!-- Admin controls -->
          <div class="tpl-admin-actions" *ngIf="isAdmin" (click)="$event.stopPropagation()">
            <button class="btn-publish"
                    [class.active]="tpl.published"
                    (click)="togglePublish(tpl)"
                    [title]="tpl.published ? 'Dépublier' : 'Publier'">
              {{ tpl.published ? '✓ Publié' : 'Publier' }}
            </button>
          </div>
        </div>
      </div>

      <div class="empty-state" *ngIf="!loading && templates.length === 0">
        Aucun template disponible
      </div>

      <!-- Panneau de personnalisation + render -->
      <div class="render-panel" *ngIf="selectedTemplate">
        <div class="render-panel-header">
          <h2>{{ selectedTemplate.name }}</h2>
          <button class="btn-close" (click)="selectedTemplate = null">✕</button>
        </div>

        <div class="render-panel-body">
          <!-- Formulaire props -->
          <div class="props-form">
            <div *ngFor="let prop of selectedTemplate.props_schema" class="form-field">
              <label [for]="prop.key">
                {{ prop.label }}
                <span class="required" *ngIf="prop.required">*</span>
              </label>

              <input *ngIf="prop.type === 'text'"
                     [id]="prop.key"
                     type="text"
                     [(ngModel)]="propValues[prop.key]"
                     [placeholder]="prop.placeholder || ''"
                     class="form-input" />

              <div *ngIf="prop.type === 'image'" class="image-field">
                <div class="image-preview" *ngIf="imageUrls[prop.key]">
                  <img [src]="imageUrls[prop.key]" [alt]="prop.label" />
                  <button class="btn-remove" (click)="removeImage(prop.key)">✕</button>
                </div>
                <label *ngIf="!imageUrls[prop.key]" class="image-upload-btn" [for]="'img_' + prop.key">
                  📷 Choisir un logo
                </label>
                <input [id]="'img_' + prop.key"
                       type="file"
                       accept="image/png,image/jpeg,image/webp,image/svg+xml"
                       (change)="onImageSelect($event, prop.key)"
                       hidden />
              </div>
            </div>
          </div>

          <!-- Render -->
          <div class="render-section">
            <div class="render-title-field">
              <label for="videoTitle">Titre de la vidéo</label>
              <input id="videoTitle" type="text" [(ngModel)]="videoTitle"
                     [placeholder]="selectedTemplate.name" class="form-input" />
            </div>

            <div class="site-selector-inline" *ngIf="isAdmin">
              <label>Site cible (optionnel)</label>
              <select [(ngModel)]="selectedSiteId" class="form-input">
                <option value="">-- Aucun site --</option>
                <option *ngFor="let site of sites" [value]="site.id">
                  {{ site.club_name }}
                </option>
              </select>
            </div>

            <div class="render-progress" *ngIf="rendering">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="renderProgress"></div>
              </div>
              <span>{{ renderStatusMessage }}</span>
            </div>

            <div class="render-result" *ngIf="lastResult">
              <span class="result-ok">✓ Vidéo générée</span>
              <a [href]="lastResult.url" target="_blank" class="btn-download">Télécharger MP4</a>
              <span class="result-size">{{ formatSize(lastResult.file_size) }}</span>
            </div>

            <button class="btn btn-primary btn-render"
                    [disabled]="rendering || !canRender()"
                    (click)="render()">
              <span *ngIf="!rendering">🎬 Générer la vidéo</span>
              <span *ngIf="rendering">Rendu en cours...</span>
            </button>

            <p class="render-hint" *ngIf="!rendering">
              Le rendu est effectué côté serveur (~2 min). La vidéo sera ajoutée à la bibliothèque du site.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1200px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 6px; }
    .badge-new { background: #8b5cf6; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 12px; vertical-align: middle; margin-left: 8px; }
    .subtitle { color: #666; font-size: 14px; margin: 0; }

    .templates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .template-card { border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; cursor: pointer; transition: border-color .15s, box-shadow .15s; background: #fff; }
    .template-card:hover { border-color: #8b5cf6; box-shadow: 0 2px 8px rgba(139,92,246,.15); }
    .template-card.selected { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,.2); }
    .tpl-thumb { height: 140px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .tpl-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .tpl-thumb-placeholder span { font-size: 40px; }
    .tpl-info { padding: 12px; }
    .tpl-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .tpl-desc { font-size: 12px; color: #666; margin-bottom: 8px; }
    .tpl-badges { display: flex; gap: 6px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .badge-published { background: #d1fae5; color: #065f46; }
    .badge-draft { background: #fef3c7; color: #92400e; }
    .tpl-admin-actions { padding: 8px 12px; border-top: 1px solid #f3f4f6; }
    .btn-publish { font-size: 12px; padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
    .btn-publish.active { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }

    .render-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-top: 8px; }
    .render-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .render-panel-header h2 { font-size: 18px; font-weight: 600; margin: 0; }
    .btn-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #666; }
    .render-panel-body { display: grid; grid-template-columns: 1fr 320px; gap: 32px; }

    .props-form { display: flex; flex-direction: column; gap: 16px; }
    .form-field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #374151; }
    .required { color: #ef4444; margin-left: 2px; }
    .form-input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
    .image-field { }
    .image-preview { position: relative; display: inline-block; }
    .image-preview img { height: 80px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .btn-remove { position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 11px; cursor: pointer; }
    .image-upload-btn { display: inline-block; padding: 8px 16px; border: 1px dashed #d1d5db; border-radius: 8px; cursor: pointer; font-size: 13px; color: #6b7280; }

    .render-section { display: flex; flex-direction: column; gap: 16px; }
    .render-title-field label, .site-selector-inline label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #374151; }
    .btn-render { padding: 12px 24px; font-size: 15px; font-weight: 600; width: 100%; }
    .btn.btn-primary { background: #8b5cf6; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    .btn.btn-primary:hover:not(:disabled) { background: #7c3aed; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .render-hint { font-size: 12px; color: #9ca3af; margin: 0; }
    .progress-bar { height: 6px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
    .progress-fill { height: 100%; background: #8b5cf6; transition: width .3s; }
    .render-result { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #d1fae5; border-radius: 8px; }
    .result-ok { font-size: 13px; color: #065f46; font-weight: 500; }
    .btn-download { font-size: 12px; color: #065f46; text-decoration: underline; }
    .result-size { font-size: 12px; color: #6b7280; margin-left: auto; }

    .loading-state, .empty-state { color: #6b7280; padding: 48px 0; text-align: center; }

    @media (max-width: 768px) { .render-panel-body { grid-template-columns: 1fr; } }
  `],
})
export class RemotionTemplatesComponent implements OnInit {
  private api = inject(ApiService);
  private notifications = inject(NotificationService);
  private authService = inject(AuthService);
  private sitesService = inject(SitesService);
  private featureGate = inject(FeatureGateService);

  templates: RemotionTemplate[] = [];
  selectedTemplate: RemotionTemplate | null = null;
  sites: Site[] = [];
  selectedSiteId = '';
  loading = true;

  propValues: Record<string, string> = {};
  imageUrls: Record<string, string> = {};
  imageFiles: Record<string, File> = {};
  videoTitle = '';

  rendering = false;
  renderProgress = 0;
  renderStatusMessage = 'Démarrage du render...';
  lastResult: RenderResult | null = null;

  get isAdmin(): boolean {
    const role = this.authService.currentUser?.role;
    return role === 'admin' || role === 'super_admin';
  }

  ngOnInit() {
    this.loadTemplates();
    this.loadSites();
  }

  private loadTemplates() {
    this.loading = true;
    this.api.get<RemotionTemplate[]>('/api/remotion-templates').subscribe({
      next: (templates) => { this.templates = templates; this.loading = false; },
      error: () => { this.notifications.error('Impossible de charger les templates'); this.loading = false; },
    });
  }

  private loadSites() {
    this.sitesService.getSites().subscribe({
      next: (sites) => { this.sites = sites; },
      error: () => {},
    });
  }

  selectTemplate(tpl: RemotionTemplate) {
    this.selectedTemplate = tpl;
    this.lastResult = null;
    this.propValues = { ...tpl.default_props };
    this.imageUrls = {};
    this.imageFiles = {};
    this.videoTitle = tpl.name;
  }

  onImageSelect(event: Event, key: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imageFiles[key] = file;
    const reader = new FileReader();
    reader.onload = (e) => { this.imageUrls[key] = e.target?.result as string; };
    reader.readAsDataURL(file);
  }

  removeImage(key: string) {
    delete this.imageUrls[key];
    delete this.imageFiles[key];
    delete this.propValues[key];
  }

  canRender(): boolean {
    if (!this.selectedTemplate) return false;
    return this.selectedTemplate.props_schema
      .filter(p => p.required && p.type === 'text')
      .every(p => !!this.propValues[p.key]?.trim());
  }

  togglePublish(tpl: RemotionTemplate) {
    this.api.patch<RemotionTemplate>(`/api/remotion-templates/${tpl.id}/publish`, { published: !tpl.published }).subscribe({
      next: (updated) => {
        const idx = this.templates.findIndex(t => t.id === tpl.id);
        if (idx !== -1) this.templates[idx] = updated;
        this.notifications.success(updated.published ? 'Template publié' : 'Template dépublié');
      },
      error: () => this.notifications.error('Erreur lors de la publication'),
    });
  }

  async render() {
    if (!this.selectedTemplate || !this.canRender()) return;
    this.rendering = true;
    this.renderProgress = 5;
    this.renderStatusMessage = 'Envoi au serveur...';
    this.lastResult = null;

    // Construire les props finaux avec les images en base64
    const props: Record<string, string> = { ...this.propValues };
    for (const [key, file] of Object.entries(this.imageFiles)) {
      props[key] = await this.fileToDataUrl(file);
    }

    this.renderProgress = 15;
    this.renderStatusMessage = 'Render Remotion en cours (~2 min)...';

    this.api.post<RenderResult>(`/api/remotion-templates/${this.selectedTemplate.id}/render`, {
      props,
      site_id: this.selectedSiteId || null,
      title: this.videoTitle || this.selectedTemplate.name,
    }).subscribe({
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
    return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
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
