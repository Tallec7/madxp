import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { ApiService, UploadProgress } from '../../core/services/api.service';
import { VideoDeleteService } from '../../core/services/video-delete.service';
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
  templateUrl: './lottie-templates.component.html',
  styleUrls: ['./lottie-templates.component.scss'],
})
export class LottieTemplatesComponent implements OnInit, OnDestroy {
  private readonly sitesService = inject(SitesService);
  private readonly notifications = inject(NotificationService);
  private readonly api = inject(ApiService);
  private readonly videoDeleteService = inject(VideoDeleteService);
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

    // Send logo to iframe preview for standalone templates
    if (key === 'logo' && this.isStandaloneTemplate) {
      const reader = new FileReader();
      reader.onload = () => {
        this.postToIframe({ action: 'update', variables: this.variableValues, logoSrc: reader.result });
      };
      reader.readAsDataURL(file);
    }
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

  onVariableChange(): void {
    if (this.isStandaloneTemplate) {
      this.postToIframe({ action: 'update', variables: this.variableValues });
    }
  }

  private postToIframe(msg: Record<string, unknown>): void {
    const iframe = this.standaloneIframeRef?.nativeElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(msg, '*');
    }
  }

  private async renderStandalone(): Promise<void> {
    if (!this.selectedTemplate?.assets) return;

    this.rendering = true;
    this.rendered = false;
    this.renderedVideo = null;
    this.renderPhase = 'rendering';
    this.renderPercent = 0;

    const variables = { ...this.variableValues };

    // Inject logo image data URI
    if (this.imageFiles['logo']) {
      try {
        variables['_image_logo'] = await this.readImageAsDataUri(this.imageFiles['logo']);
      } catch { /* skip */ }
    }

    try {
      const blob = await this.browserRenderer.renderStandalone(
        { templateId: this.selectedTemplate.id, variables },
        this.selectedTemplate.assets,
        (p) => {
          this.renderPhase = p.phase === 'done' ? 'uploading' : 'rendering';
          this.renderPercent = p.progress;
        },
      );

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
    } catch (err) {
      this.rendering = false;
      this.renderPhase = 'idle';
      this.notifications.error(`Erreur rendu: ${(err as Error).message || 'Erreur inconnue'}`);
    }
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
    const sub = this.videoDeleteService
      .deleteVideoWithCascade(this.renderedVideo.id, this.renderedVideo.title)
      .subscribe({
        next: deleted => {
          if (!deleted) return;
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
