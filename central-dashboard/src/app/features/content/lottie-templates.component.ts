import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService, UploadProgress } from '../../core/services/api.service';
import { Site } from '../../core/models';
import { Subscription, Subject, debounceTime } from 'rxjs';

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'color' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
  prefillFrom?: string;
}

interface OverlayTemplate {
  id: string;
  name: string;
  description: string;
  variables: TemplateVariable[];
}

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-lottie-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Templates Video</h1>
          <p class="subtitle">Superposez des animations sur vos videos existantes</p>
        </div>
        <div class="site-selector">
          <select [(ngModel)]="selectedSiteId" (ngModelChange)="onSiteChange($event)">
            <option value="">-- Choisir un site --</option>
            <option *ngFor="let site of sites" [value]="site.id">
              {{ site.club_name }} ({{ site.site_name }})
            </option>
          </select>
          <div class="site-status" *ngIf="selectedSite">
            <span class="status-dot" [class.online]="selectedSite.status === 'online'"
                  [class.offline]="selectedSite.status !== 'online'"></span>
            {{ selectedSite.status === 'online' ? 'En ligne' : 'Hors ligne' }}
          </div>
        </div>
      </div>

      <div class="content-layout">
        <!-- Left column: upload + template + variables -->
        <div class="left-column">

          <!-- Step 1: Upload video -->
          <div class="step-card">
            <h3><span class="step-num">1</span> Video source</h3>
            <div class="upload-zone"
                 [class.has-file]="!!sourceFile"
                 (dragover)="onDragOver($event)"
                 (drop)="onDrop($event)"
                 (click)="fileInput.click()">
              <input #fileInput type="file" accept="video/mp4,video/quicktime" (change)="onFileSelect($event)" hidden />
              <div *ngIf="!sourceFile" class="upload-placeholder">
                <span class="upload-icon">📁</span>
                <span>Glissez un MP4 ou cliquez pour choisir</span>
              </div>
              <div *ngIf="sourceFile" class="upload-info">
                <span class="file-icon">🎬</span>
                <div>
                  <div class="file-name">{{ sourceFile.name }}</div>
                  <div class="file-meta">{{ formatFileSize(sourceFile.size) }}</div>
                </div>
                <button class="btn-remove" (click)="removeFile($event)">✕</button>
              </div>
            </div>
          </div>

          <!-- Step 2: Choose template -->
          <div class="step-card">
            <h3><span class="step-num">2</span> Template overlay</h3>
            <div class="templates-grid" *ngIf="templates.length > 0">
              <div *ngFor="let tpl of templates"
                   class="template-card"
                   [class.selected]="selectedTemplate?.id === tpl.id"
                   (click)="selectTemplate(tpl)">
                <div class="template-name">{{ tpl.name }}</div>
                <div class="template-desc">{{ tpl.description }}</div>
              </div>
            </div>
            <div *ngIf="templates.length === 0 && !loadingTemplates" class="empty-state">
              Aucun template disponible
            </div>
            <div *ngIf="loadingTemplates" class="loading-state">Chargement...</div>
          </div>

          <!-- Step 3: Fill variables -->
          <div class="step-card" *ngIf="selectedTemplate">
            <h3><span class="step-num">3</span> Personnalisation</h3>
            <div *ngFor="let v of selectedTemplate.variables" class="form-field">
              <label [for]="v.key">
                {{ v.label }}
                <span class="required" *ngIf="v.required">*</span>
              </label>
              <input *ngIf="v.type === 'text'"
                     [id]="v.key"
                     type="text"
                     [(ngModel)]="variableValues[v.key]"
                     [placeholder]="v.placeholder || ''"
                     class="form-input" />
              <input *ngIf="v.type === 'color'"
                     [id]="v.key"
                     type="color"
                     [(ngModel)]="variableValues[v.key]"
                     class="form-input form-color" />
              <select *ngIf="v.type === 'select'"
                      [id]="v.key"
                      [(ngModel)]="variableValues[v.key]"
                      class="form-input">
                <option *ngFor="let opt of v.options" [value]="opt">{{ opt }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Right column: preview + render -->
        <div class="right-column">
          <div class="render-preview" *ngIf="sourceFile && selectedTemplate; else emptyPreview">
            <div class="preview-header">
              <span class="preview-label">Apercu</span>
              <span class="preview-template">{{ selectedTemplate.name }}</span>
            </div>
            <div class="preview-summary">
              <div *ngFor="let v of selectedTemplate.variables">
                <span class="var-label">{{ v.label }}:</span>
                <span class="var-value">{{ variableValues[v.key] || v.placeholder || '—' }}</span>
              </div>
            </div>
          </div>
          <ng-template #emptyPreview>
            <div class="preview-placeholder">
              <div class="placeholder-icon">🎬</div>
              <p>Uploadez une video et choisissez un template</p>
            </div>
          </ng-template>

          <!-- Render button -->
          <div class="render-section" *ngIf="sourceFile && selectedTemplate">
            <div class="site-info-box" *ngIf="selectedSite">
              <span class="status-dot" [class.online]="selectedSite.status === 'online'"
                    [class.offline]="selectedSite.status !== 'online'"></span>
              <strong>{{ selectedSite.club_name }}</strong>
              — {{ selectedSite.status === 'online' ? 'En ligne' : 'Hors ligne' }}
            </div>

            <!-- Progress bar -->
            <div class="progress-bar-container" *ngIf="renderProgress">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="renderProgress.progress"></div>
              </div>
              <span class="progress-text">{{ getRenderStatusText() }}</span>
            </div>

            <button class="btn btn-primary btn-render"
                    [disabled]="!canRender"
                    (click)="render()">
              <span *ngIf="!rendering && !rendered">{{ getRenderLabel() }}</span>
              <span *ngIf="rendering">Rendu en cours...</span>
              <span *ngIf="rendered">&#10003; Video generee !</span>
            </button>
          </div>

          <!-- Result -->
          <div class="result-card" *ngIf="renderedVideo">
            <h4>Video generee</h4>
            <div class="result-info">
              <span>{{ renderedVideo.title }}</span>
              <a [href]="renderedVideo.url" target="_blank" class="btn btn-secondary btn-sm">Telecharger</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1400px; margin: 0 auto; }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 24px; flex-wrap: wrap; gap: 16px;
    }
    .page-header h1 { margin: 0; font-size: 24px; }
    .subtitle { color: #666; font-size: 14px; margin-top: 4px; }

    .site-selector select {
      padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd;
      font-size: 14px; min-width: 280px; background: white;
    }
    .site-status {
      margin-top: 4px; font-size: 13px; color: #666;
      display: flex; align-items: center; gap: 6px;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-dot.online { background: #22c55e; }
    .status-dot.offline { background: #ef4444; }

    .content-layout { display: flex; gap: 24px; }
    .left-column { flex: 0 0 45%; min-width: 0; }
    .right-column { flex: 1; min-width: 0; }

    /* Step cards */
    .step-card {
      background: white; border: 1px solid #eee; border-radius: 10px;
      padding: 20px; margin-bottom: 16px;
    }
    .step-card h3 { margin: 0 0 14px; font-size: 15px; display: flex; align-items: center; gap: 10px; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%; background: #1e3a5f;
      color: white; font-size: 13px; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center;
    }

    /* Upload zone */
    .upload-zone {
      border: 2px dashed #ddd; border-radius: 8px; padding: 24px;
      text-align: center; cursor: pointer; transition: all 0.15s;
      color: #888; font-size: 14px;
    }
    .upload-zone:hover { border-color: #1e3a5f; background: #f8fafc; }
    .upload-zone.has-file { border-style: solid; border-color: #22c55e; background: #f0fdf4; }
    .upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .upload-icon { font-size: 28px; }
    .upload-info { display: flex; align-items: center; gap: 12px; text-align: left; }
    .file-icon { font-size: 28px; }
    .file-name { font-weight: 600; color: #333; font-size: 14px; }
    .file-meta { color: #888; font-size: 12px; }
    .btn-remove {
      margin-left: auto; background: none; border: none; font-size: 18px;
      color: #999; cursor: pointer; padding: 4px 8px;
    }
    .btn-remove:hover { color: #ef4444; }

    /* Template grid */
    .templates-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    .template-card {
      border: 2px solid #eee; border-radius: 8px; padding: 12px;
      cursor: pointer; transition: all 0.15s; background: white;
    }
    .template-card:hover { border-color: #1e3a5f; transform: translateY(-1px); }
    .template-card.selected { border-color: #1e3a5f; background: #f0f4f8; }
    .template-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .template-desc { font-size: 11px; color: #888; line-height: 1.3; }
    .empty-state, .loading-state { text-align: center; color: #999; padding: 20px; font-size: 14px; }

    /* Form */
    .form-field { margin-bottom: 12px; }
    .form-field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
    .required { color: #ef4444; }
    .form-input {
      width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
      font-size: 14px; box-sizing: border-box;
    }
    .form-input:focus { outline: none; border-color: #1e3a5f; box-shadow: 0 0 0 2px rgba(30,58,95,0.1); }
    .form-color { height: 40px; padding: 4px; cursor: pointer; }

    /* Preview */
    .render-preview {
      background: white; border: 1px solid #eee; border-radius: 10px;
      padding: 20px; margin-bottom: 16px;
    }
    .preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .preview-label { font-weight: 600; font-size: 15px; }
    .preview-template {
      padding: 3px 12px; background: #f0f4f8; border-radius: 12px;
      font-size: 12px; font-weight: 600; color: #1e3a5f;
    }
    .preview-summary { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .var-label { color: #888; margin-right: 6px; }
    .var-value { font-weight: 500; }

    .preview-placeholder {
      background: #f8f9fa; border: 2px dashed #ddd; border-radius: 10px;
      padding: 60px 40px; text-align: center; color: #999;
    }
    .placeholder-icon { font-size: 42px; margin-bottom: 10px; }

    /* Render section */
    .render-section { margin-top: 16px; }
    .site-info-box {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; background: #f8f9fa; border-radius: 8px;
      font-size: 14px; margin-bottom: 12px;
    }
    .btn-render { width: 100%; padding: 14px; font-size: 15px; font-weight: 600; border-radius: 8px; }

    /* Progress */
    .progress-bar-container { margin-bottom: 12px; }
    .progress-bar {
      height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 4px;
    }
    .progress-fill { height: 100%; background: #1e3a5f; border-radius: 4px; transition: width 0.3s; }
    .progress-text { font-size: 12px; color: #888; }

    /* Result */
    .result-card {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;
      padding: 16px; margin-top: 16px;
    }
    .result-card h4 { margin: 0 0 8px; font-size: 14px; color: #166534; }
    .result-info { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }

    /* Shared btn */
    .btn { border: none; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #1e3a5f; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2a4a6f; }
    .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #ddd; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-sm { padding: 6px 14px; font-size: 12px; }

    @media (max-width: 900px) {
      .content-layout { flex-direction: column; }
      .left-column { flex: 1; }
      .templates-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class LottieTemplatesComponent implements OnInit, OnDestroy {
  private readonly sitesService = inject(SitesService);
  private readonly notifications = inject(NotificationService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  sites: Site[] = [];
  selectedSiteId = '';
  selectedSite: Site | null = null;

  // Templates from API
  templates: OverlayTemplate[] = [];
  loadingTemplates = false;
  selectedTemplate: OverlayTemplate | null = null;
  variableValues: Record<string, string> = {};

  // Source video file
  sourceFile: File | null = null;

  // Render state
  rendering = false;
  rendered = false;
  renderProgress: UploadProgress | null = null;
  renderedVideo: { id: string; title: string; url: string } | null = null;

  private subscriptions: Subscription[] = [];

  get canRender(): boolean {
    return !!this.sourceFile && !!this.selectedTemplate && !this.rendering && this.isFormValid();
  }

  ngOnInit(): void {
    // Load sites
    const sub = this.sitesService.loadSites({ limit: 200 }).subscribe({
      next: (res) => { this.sites = res.sites; },
      error: () => { this.notifications.error('Erreur lors du chargement des sites'); }
    });
    this.subscriptions.push(sub);

    // Load available templates from API
    this.loadTemplates();

    // Route param for pre-selected template
    const paramSub = this.route.params.subscribe(params => {
      if (params['id']) {
        const tpl = this.templates.find(t => t.id === params['id']);
        if (tpl) this.selectTemplate(tpl);
      }
    });
    this.subscriptions.push(paramSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  // ── Templates ─────────────────────────────────────────────────────

  private loadTemplates(): void {
    this.loadingTemplates = true;
    const sub = this.api.get<{ templates: OverlayTemplate[] }>('/content/templates/available').subscribe({
      next: (res) => {
        this.templates = res.templates;
        this.loadingTemplates = false;
      },
      error: () => {
        this.notifications.error('Erreur lors du chargement des templates');
        this.loadingTemplates = false;
      }
    });
    this.subscriptions.push(sub);
  }

  selectTemplate(tpl: OverlayTemplate): void {
    this.selectedTemplate = tpl;
    this.rendered = false;
    this.renderedVideo = null;

    // Init variables with placeholders
    this.variableValues = {};
    for (const v of tpl.variables) {
      if (v.prefillFrom === 'club_name' && this.selectedSite) {
        this.variableValues[v.key] = this.selectedSite.club_name;
      } else {
        this.variableValues[v.key] = v.placeholder || '';
      }
    }
  }

  // ── Site ───────────────────────────────────────────────────────────

  onSiteChange(siteId: string): void {
    this.selectedSite = this.sites.find(s => s.id === siteId) ?? null;
    this.prefillFromSite();
  }

  private prefillFromSite(): void {
    if (!this.selectedTemplate || !this.selectedSite) return;
    for (const v of this.selectedTemplate.variables) {
      if (v.prefillFrom === 'club_name') {
        this.variableValues[v.key] = this.selectedSite.club_name;
      }
    }
  }

  // ── File upload ───────────────────────────────────────────────────

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.sourceFile = input.files[0];
      this.rendered = false;
      this.renderedVideo = null;
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file && (file.type.startsWith('video/') || file.name.endsWith('.mp4'))) {
      this.sourceFile = file;
      this.rendered = false;
      this.renderedVideo = null;
    }
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.sourceFile = null;
    this.rendered = false;
    this.renderedVideo = null;
  }

  // ── Render ────────────────────────────────────────────────────────

  render(): void {
    if (!this.canRender || !this.sourceFile || !this.selectedTemplate) return;

    this.rendering = true;
    this.rendered = false;
    this.renderedVideo = null;
    this.renderProgress = { status: 'uploading', progress: 0 };

    const formData = new FormData();
    formData.append('video', this.sourceFile);
    formData.append('templateId', this.selectedTemplate.id);
    formData.append('variables', JSON.stringify(this.variableValues));
    if (this.selectedSiteId) {
      formData.append('site_id', this.selectedSiteId);
    }

    const sub = this.api.uploadWithProgress<{ success: boolean; video: { id: string; title: string; url: string } }>(
      '/content/render-template',
      formData
    ).subscribe({
      next: (progress) => {
        this.renderProgress = progress;

        if (progress.status === 'complete' && progress.response) {
          const resp = progress.response as { success: boolean; video: { id: string; title: string; url: string } };
          this.rendering = false;
          this.rendered = true;
          this.renderedVideo = resp.video;
          this.notifications.success('Video generee avec succes !');
        }
      },
      error: (err) => {
        this.rendering = false;
        this.renderProgress = null;
        const msg = err?.error?.details || err?.error?.error || 'Erreur lors du rendu';
        this.notifications.error(msg);
      }
    });
    this.subscriptions.push(sub);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  isFormValid(): boolean {
    if (!this.selectedTemplate) return false;
    return this.selectedTemplate.variables
      .filter(v => v.required)
      .every(v => {
        const val = this.variableValues[v.key];
        return val !== undefined && val !== null && String(val).trim() !== '';
      });
  }

  getRenderLabel(): string {
    if (!this.sourceFile) return 'Choisissez une video';
    if (!this.selectedTemplate) return 'Choisissez un template';
    if (!this.isFormValid()) return 'Remplissez les champs requis';
    return 'Generer la video';
  }

  getRenderStatusText(): string {
    if (!this.renderProgress) return '';
    if (this.renderProgress.status === 'uploading') {
      return `Upload: ${this.renderProgress.progress}%`;
    }
    if (this.renderProgress.status === 'processing') {
      return 'Rendu en cours...';
    }
    return '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
