import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService, UploadProgress } from '../../core/services/api.service';
import { BrowserRendererService, RenderProgress } from './browser-renderer.service';
import { TemplateRendererService } from './template-renderer.service';
import { environment } from '../../../environments/environment';
import { Site } from '../../core/models';
import { Subscription } from 'rxjs';

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'color' | 'select' | 'image';
  required: boolean;
  placeholder?: string;
  options?: string[];
  prefillFrom?: string;
  accept?: string;
}

interface OverlayTemplate {
  id: string;
  name: string;
  description: string;
  type?: 'standalone';
  variables: TemplateVariable[];
  assets?: Record<string, string>;
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

          <!-- Step 1: Upload video (hidden for standalone templates) -->
          <div class="step-card" *ngIf="!isStandaloneTemplate">
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
              <div *ngIf="v.type === 'image'" class="image-input">
                <div class="image-preview" *ngIf="imagePreviews[v.key]">
                  <img [src]="imagePreviews[v.key]" [alt]="v.label" />
                  <button class="btn-remove-img" (click)="removeImage(v.key)">✕</button>
                </div>
                <label *ngIf="!imagePreviews[v.key]" class="image-upload-btn" [for]="'img_' + v.key">
                  📷 Choisir une image
                </label>
                <input [id]="'img_' + v.key"
                       type="file"
                       [accept]="v.accept || 'image/jpeg,image/png,image/webp'"
                       (change)="onImageSelect($event, v.key)"
                       hidden />
              </div>
            </div>
          </div>
        </div>

        <!-- Right column: preview + render -->
        <div class="right-column">
          <!-- Standalone live preview (iframe-based, uses tested HTML template) -->
          <div class="standalone-preview" *ngIf="isStandaloneTemplate && selectedTemplate">
            <div class="preview-header">
              <span class="preview-label">Apercu live</span>
              <span class="preview-template">{{ selectedTemplate.name }}</span>
            </div>
            <div class="standalone-iframe-wrap">
              <iframe #standaloneIframe
                      [src]="standaloneIframeSrc"
                      class="standalone-iframe"
                      frameborder="0"
                      allow="autoplay"></iframe>
            </div>
            <div class="standalone-controls">
              <button class="btn btn-primary" (click)="playStandalone()">Jouer</button>
              <button class="btn btn-secondary" (click)="resetStandalone()">Reset</button>
            </div>
          </div>

          <div class="render-preview" *ngIf="!isStandaloneTemplate && sourceFile && selectedTemplate; else emptyPreview">
            <div class="preview-header">
              <span class="preview-label">Apercu</span>
              <span class="preview-template">{{ selectedTemplate.name }}</span>
            </div>
            <div class="preview-summary">
              <div *ngFor="let v of selectedTemplate.variables">
                <span class="var-label">{{ v.label }}:</span>
                <span *ngIf="v.type !== 'image'" class="var-value">{{ variableValues[v.key] || v.placeholder || '—' }}</span>
                <img *ngIf="v.type === 'image' && imagePreviews[v.key]" [src]="imagePreviews[v.key]" [alt]="v.label" style="width:32px;height:32px;object-fit:cover;border-radius:4px;vertical-align:middle;" />
                <span *ngIf="v.type === 'image' && !imagePreviews[v.key]" class="var-value">—</span>
              </div>
            </div>
          </div>
          <ng-template #emptyPreview>
            <div class="preview-placeholder" *ngIf="!isStandaloneTemplate">
              <div class="placeholder-icon">🎬</div>
              <p>Uploadez une video et choisissez un template</p>
            </div>
          </ng-template>

          <!-- Render button -->
          <div class="render-section" *ngIf="(sourceFile || isStandaloneTemplate) && selectedTemplate">
            <div class="site-info-box" *ngIf="selectedSite">
              <span class="status-dot" [class.online]="selectedSite.status === 'online'"
                    [class.offline]="selectedSite.status !== 'online'"></span>
              <strong>{{ selectedSite.club_name }}</strong>
              — {{ selectedSite.status === 'online' ? 'En ligne' : 'Hors ligne' }}
            </div>

            <!-- Progress bar -->
            <div class="progress-bar-container" *ngIf="rendering">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="renderPercent"></div>
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
            <video *ngIf="renderedBlobUrl"
                   [src]="renderedBlobUrl"
                   controls
                   class="result-video"></video>
            <div class="result-actions">
              <button class="btn btn-danger" (click)="deleteRenderedVideo()">
                ✕ Supprimer
              </button>
              <button class="btn btn-success" (click)="validateRenderedVideo()">
                ✓ Valider et garder
              </button>
            </div>
            <div class="result-info">
              <span class="result-filename">{{ renderedVideo.title }}</span>
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

    /* Image input */
    .image-input { margin-top: 4px; }
    .image-preview {
      position: relative; display: inline-block;
      border: 2px solid #ddd; border-radius: 8px; overflow: hidden;
    }
    .image-preview img { width: 80px; height: 80px; object-fit: cover; display: block; }
    .btn-remove-img {
      position: absolute; top: 2px; right: 2px;
      background: rgba(0,0,0,0.5); color: white; border: none;
      border-radius: 50%; width: 20px; height: 20px;
      font-size: 12px; cursor: pointer; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .btn-remove-img:hover { background: #ef4444; }
    .image-upload-btn {
      display: inline-block; padding: 8px 16px;
      background: #f3f4f6; border: 1px dashed #ccc; border-radius: 6px;
      font-size: 13px; cursor: pointer; color: #666; transition: all 0.15s;
    }
    .image-upload-btn:hover { border-color: #1e3a5f; background: #f0f4f8; color: #1e3a5f; }

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
    .result-card h4 { margin: 0 0 12px; font-size: 14px; color: #166534; }
    .result-video {
      width: 100%; border-radius: 8px; display: block;
      margin-bottom: 12px; background: #000;
    }
    .result-actions {
      display: flex; gap: 8px; margin-bottom: 10px;
    }
    .result-actions .btn { flex: 1; padding: 10px; font-size: 13px; font-weight: 600; border-radius: 6px; }
    .btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .btn-danger:hover { background: #fee2e2; }
    .btn-success { background: #166534; color: white; border: none; }
    .btn-success:hover { background: #15803d; }
    .result-info { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .result-filename { color: #666; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }

    /* Shared btn */
    .btn { border: none; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #1e3a5f; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2a4a6f; }
    .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #ddd; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-sm { padding: 6px 14px; font-size: 12px; }

    /* Standalone preview (iframe-based) */
    .standalone-preview {
      background: white; border: 1px solid #eee; border-radius: 10px;
      padding: 20px; margin-bottom: 16px;
    }
    .standalone-iframe-wrap {
      margin-top: 12px; position: relative;
      width: 100%; aspect-ratio: 16/9;
      border-radius: 8px; overflow: hidden; background: #000;
    }
    .standalone-iframe {
      width: 100%; height: 100%; border: none;
    }
    .standalone-controls {
      display: flex; gap: 8px; margin-top: 10px;
    }
    .standalone-controls .btn { flex: 1; padding: 10px; font-size: 13px; }

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
  private readonly browserRenderer = inject(BrowserRendererService);
  private readonly templateRendererSvc = inject(TemplateRendererService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('standaloneIframe') standaloneIframeRef?: ElementRef<HTMLIFrameElement>;
  standaloneIframeSrc: SafeUrl | null = null;

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

  // Image files for template variables (key → File)
  imageFiles: Record<string, File> = {};
  imagePreviews: Record<string, string> = {};

  // Render state
  rendering = false;
  rendered = false;
  renderPhase: 'idle' | 'rendering' | 'uploading' | 'done' = 'idle';
  renderPercent = 0;
  renderedVideo: { id: string; title: string; url: string } | null = null;
  renderedBlobUrl: SafeUrl | null = null;
  private rawBlobUrl: string | null = null;

  // Standalone template state
  standaloneTextVisible = false;
  private standaloneTimers: ReturnType<typeof setTimeout>[] = [];

  private subscriptions: Subscription[] = [];

  get isStandaloneTemplate(): boolean {
    return !!this.selectedTemplate && this.templateRendererSvc.isStandalone(this.selectedTemplate.id);
  }

  get canRender(): boolean {
    if (this.isStandaloneTemplate) {
      return !!this.selectedTemplate && !this.rendering && this.isFormValid();
    }
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
    this.revokeImagePreviews();
    this.revokeBlobUrl();
  }

  // ── Templates ─────────────────────────────────────────────────────

  private loadTemplates(): void {
    this.loadingTemplates = true;
    const sub = this.api.get<{ templates: OverlayTemplate[] }>('/templates/available').subscribe({
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

  private _selectTemplateBase(tpl: OverlayTemplate): void {
    this.selectedTemplate = tpl;
    this.rendered = false;
    this.renderedVideo = null;
    this.revokeBlobUrl();

    // Reset images
    this.revokeImagePreviews();
    this.imageFiles = {};
    this.imagePreviews = {};

    // Init variables with placeholders
    this.variableValues = {};
    for (const v of tpl.variables) {
      if (v.prefillFrom === 'club_name' && this.selectedSite) {
        this.variableValues[v.key] = this.selectedSite.club_name;
      } else if (v.type !== 'image') {
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
    this.revokeBlobUrl();
  }

  // ── Image handling ──────────────────────────────────────────────

  onImageSelect(event: Event, key: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.imageFiles[key] = file;
    this.rendered = false;
    this.renderedVideo = null;

    // Create preview URL
    if (this.imagePreviews[key]) {
      URL.revokeObjectURL(this.imagePreviews[key]);
    }
    this.imagePreviews[key] = URL.createObjectURL(file);
  }

  removeImage(key: string): void {
    delete this.imageFiles[key];
    if (this.imagePreviews[key]) {
      URL.revokeObjectURL(this.imagePreviews[key]);
      delete this.imagePreviews[key];
    }
    // Remove from variables too
    delete this.variableValues[`_image_${key}`];
    this.rendered = false;
    this.renderedVideo = null;
  }

  private revokeImagePreviews(): void {
    for (const url of Object.values(this.imagePreviews)) {
      URL.revokeObjectURL(url);
    }
  }

  private async readImageAsDataUri(file: File, maxSize = 800): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    if (width <= maxSize && height <= maxSize) {
      bitmap.close();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
    }

    const scale = maxSize / Math.max(width, height);
    const dw = Math.round(width * scale);
    const dh = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, dw, dh);
    bitmap.close();

    return canvas.toDataURL('image/png');
  }

  // ── Render (browser-side) ───────────────────────────────────────

  async render(): Promise<void> {
    if (!this.canRender || !this.selectedTemplate) return;

    // Standalone templates: record via iframe canvas capture
    if (this.isStandaloneTemplate) {
      this.renderStandalone();
      return;
    }

    if (!this.sourceFile) return;

    this.rendering = true;
    this.rendered = false;
    this.renderedVideo = null;
    this.renderPhase = 'rendering';
    this.renderPercent = 0;

    const templateId = this.selectedTemplate.id;
    const variables = { ...this.variableValues };

    // Inject image data URIs into variables for browser-side rendering
    for (const [key, file] of Object.entries(this.imageFiles)) {
      try {
        variables[`_image_${key}`] = await this.readImageAsDataUri(file);
      } catch {
        // Skip failed image reads
      }
    }

    // Step 1: Render in the browser (Canvas + MediaRecorder)
    this.browserRenderer.render(
      this.sourceFile,
      { templateId, variables },
      (p) => {
        this.renderPhase = p.phase === 'done' ? 'uploading' : 'rendering';
        this.renderPercent = p.progress;
      }
    ).then((blob) => {
      // Store blob URL for in-page preview
      this.revokeBlobUrl();
      this.rawBlobUrl = URL.createObjectURL(blob);
      this.renderedBlobUrl = this.sanitizer.bypassSecurityTrustUrl(this.rawBlobUrl);

      // Step 2: Upload the rendered video as a regular video file
      this.renderPhase = 'uploading';
      this.renderPercent = 0;

      const baseName = this.sourceFile!.name.replace(/\.\w+$/, '');
      const filename = `${baseName}_${templateId}.webm`;
      const file = new File([blob], filename, { type: blob.type });

      const formData = new FormData();
      formData.append('video', file);
      if (this.selectedSiteId) {
        formData.append('site_id', this.selectedSiteId);
      }

      const sub = this.api.uploadWithProgress<{ success: boolean; video: { id: string; title: string; url: string } }>(
        '/videos',
        formData
      ).subscribe({
        next: (progress) => {
          this.renderPercent = progress.progress;

          if (progress.status === 'complete' && progress.response) {
            const resp = progress.response as { success: boolean; video: { id: string; title: string; url: string } };
            this.rendering = false;
            this.rendered = true;
            this.renderPhase = 'done';
            this.renderedVideo = resp.video;
            this.notifications.success('Video generee et uploadee !');
          }
        },
        error: (err) => {
          this.rendering = false;
          this.renderPhase = 'idle';
          const msg = err?.error?.details || err?.error?.error || 'Erreur lors de l\'upload';
          this.notifications.error(msg);
        }
      });
      this.subscriptions.push(sub);
    }).catch((err) => {
      this.rendering = false;
      this.renderPhase = 'idle';
      this.notifications.error(`Erreur rendu: ${err.message || 'Erreur inconnue'}`);
    });
  }

  // ── Standalone preview ──────────────────────────────────────────

  selectTemplate(tpl: OverlayTemplate): void {
    this._selectTemplateBase(tpl);
    if (this.templateRendererSvc.isStandalone(tpl.id)) {
      // Build iframe URL pointing to the served HTML template
      const iframeUrl = `${environment.apiUrl}/template-assets/but-simple/index.html`;
      this.standaloneIframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(iframeUrl);
    } else {
      this.standaloneIframeSrc = null;
    }
  }

  playStandalone(): void {
    this.postToIframe({ action: 'play', variables: this.variableValues });
  }

  resetStandalone(): void {
    this.postToIframe({ action: 'reset' });
  }

  private postToIframe(msg: Record<string, unknown>): void {
    const iframe = this.standaloneIframeRef?.nativeElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(msg, '*');
    }
  }

  private renderStandalone(): void {
    this.rendering = true;
    this.rendered = false;
    this.renderedVideo = null;
    this.renderPhase = 'rendering';
    this.renderPercent = 0;

    // Listen for messages from iframe
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data?.type) return;

      if (data.type === 'recordProgress') {
        this.renderPercent = data.progress;
      }

      if (data.type === 'recordBlob') {
        window.removeEventListener('message', handler);

        const blob = new Blob([data.buffer], { type: data.mimeType || 'video/webm' });

        // Store blob URL for preview
        this.revokeBlobUrl();
        this.rawBlobUrl = URL.createObjectURL(blob);
        this.renderedBlobUrl = this.sanitizer.bypassSecurityTrustUrl(this.rawBlobUrl);

        // Upload
        this.renderPhase = 'uploading';
        this.renderPercent = 0;

        const prenom = this.variableValues['prenom'] || 'PRENOM';
        const nom = this.variableValues['nom'] || 'NOM';
        const filename = `BUT_${prenom}_${nom}.webm`;
        const file = new File([blob], filename, { type: blob.type });

        const formData = new FormData();
        formData.append('video', file);
        if (this.selectedSiteId) {
          formData.append('site_id', this.selectedSiteId);
        }

        const sub = this.api.uploadWithProgress<{ success: boolean; video: { id: string; title: string; url: string } }>(
          '/videos',
          formData,
        ).subscribe({
          next: (progress) => {
            this.renderPercent = progress.progress;
            if (progress.status === 'complete' && progress.response) {
              const resp = progress.response as { success: boolean; video: { id: string; title: string; url: string } };
              this.rendering = false;
              this.rendered = true;
              this.renderPhase = 'done';
              this.renderedVideo = resp.video;
              this.notifications.success('Video generee et uploadee !');
            }
          },
          error: (err) => {
            this.rendering = false;
            this.renderPhase = 'idle';
            const msg = err?.error?.details || err?.error?.error || 'Erreur lors de l\'upload';
            this.notifications.error(msg);
          },
        });
        this.subscriptions.push(sub);
      }
    };

    window.addEventListener('message', handler);

    // Tell iframe to start recording
    this.postToIframe({ action: 'record', variables: this.variableValues });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  isFormValid(): boolean {
    if (!this.selectedTemplate) return false;
    return this.selectedTemplate.variables
      .filter(v => v.required)
      .every(v => {
        if (v.type === 'image') return !!this.imageFiles[v.key];
        const val = this.variableValues[v.key];
        return val !== undefined && val !== null && String(val).trim() !== '';
      });
  }

  deleteRenderedVideo(): void {
    if (!this.renderedVideo) return;
    const sub = this.api.delete(`/videos/${this.renderedVideo.id}`).subscribe({
      next: () => {
        this.revokeBlobUrl();
        this.renderedVideo = null;
        this.rendered = false;
        this.notifications.success('Video supprimee');
      },
      error: () => this.notifications.error('Erreur lors de la suppression')
    });
    this.subscriptions.push(sub);
  }

  validateRenderedVideo(): void {
    this.revokeBlobUrl();
    this.renderedVideo = null;
    this.rendered = false;
    this.sourceFile = null;
    this.selectedTemplate = null;
    this.variableValues = {};
    this.imageFiles = {};
    this.revokeImagePreviews();
    this.imagePreviews = {};
    this.notifications.success('Video conservee dans la bibliotheque !');
  }

  private revokeBlobUrl(): void {
    if (this.rawBlobUrl) {
      URL.revokeObjectURL(this.rawBlobUrl);
      this.rawBlobUrl = null;
      this.renderedBlobUrl = null;
    }
  }

  getRenderLabel(): string {
    if (!this.isStandaloneTemplate && !this.sourceFile) return 'Choisissez une video';
    if (!this.selectedTemplate) return 'Choisissez un template';
    if (!this.isFormValid()) return 'Remplissez les champs requis';
    return 'Generer la video';
  }

  getRenderStatusText(): string {
    if (this.renderPhase === 'rendering') return `Rendu dans le navigateur: ${this.renderPercent}%`;
    if (this.renderPhase === 'uploading') return `Upload: ${this.renderPercent}%`;
    if (this.renderPhase === 'done') return 'Termine !';
    return '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
