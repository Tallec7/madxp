import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '@env/environment';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { SitesService } from '../../core/services/sites.service';
import { Site } from '../../core/models';

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplatePropDef {
  key: string;
  label: string;
  type: 'text' | 'image' | 'number';
  required: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface RemotionTemplate {
  id: string;
  name: string;
  composition_id: string;
  description: string;
  props_schema: TemplatePropDef[];
  default_props: Record<string, unknown>;
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

      <!-- Panneau personnalisation + preview + render -->
      <div class="render-panel" *ngIf="selectedTemplate">
        <div class="render-panel-header">
          <h2>{{ selectedTemplate.name }}</h2>
          <button class="btn-close" (click)="selectedTemplate = null">✕</button>
        </div>

        <div class="render-panel-body">

          <!-- Colonne 1 : Formulaire props -->
          <div class="props-form">
            <h3 class="section-title">Personnalisation</h3>

            <div *ngFor="let prop of selectedTemplate.props_schema" class="form-field">
              <label [for]="prop.key">
                {{ prop.label }}
                <span class="required" *ngIf="prop.required">*</span>
              </label>

              <!-- Champ texte -->
              <input *ngIf="prop.type === 'text'"
                     [id]="prop.key"
                     type="text"
                     [ngModel]="propValues[prop.key]"
                     (ngModelChange)="onPropChange(prop.key, $event)"
                     [placeholder]="prop.placeholder || ''"
                     class="form-input" />

              <!-- Champ nombre + slider -->
              <div *ngIf="prop.type === 'number'" class="number-field">
                <input type="range"
                       [id]="prop.key"
                       [min]="prop.min ?? 100"
                       [max]="prop.max ?? 1000"
                       [step]="prop.step ?? 10"
                       [ngModel]="propValues[prop.key]"
                       (ngModelChange)="onPropChange(prop.key, +$event)"
                       class="range-input" />
                <input type="number"
                       [min]="prop.min ?? 100"
                       [max]="prop.max ?? 1000"
                       [ngModel]="propValues[prop.key]"
                       (ngModelChange)="onPropChange(prop.key, +$event)"
                       class="form-input number-input" />
              </div>

              <!-- Champ image -->
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

            <!-- Titre + Site -->
            <div class="form-field">
              <label for="videoTitle">Titre de la vidéo</label>
              <input id="videoTitle" type="text" [(ngModel)]="videoTitle"
                     [placeholder]="selectedTemplate.name" class="form-input" />
            </div>

            <div class="form-field" *ngIf="isAdmin">
              <label>Site cible (optionnel)</label>
              <select [(ngModel)]="selectedSiteId" class="form-input">
                <option value="">-- Aucun site --</option>
                <option *ngFor="let site of sites" [value]="site.id">
                  {{ site.club_name }}
                </option>
              </select>
            </div>

            <!-- Render -->
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

          <!-- Colonne 2 : Preview live iframe -->
          <div class="preview-panel">
            <h3 class="section-title">
              Aperçu en direct
              <span class="preview-badge">Live</span>
            </h3>
            <div class="preview-frame-wrapper">
              <iframe #previewFrame
                      [src]="previewUrl"
                      class="preview-frame"
                      frameborder="0"
                      allow="autoplay">
              </iframe>
            </div>
            <p class="preview-hint">
              L'aperçu se met à jour instantanément. Ajustez les valeurs à gauche.
            </p>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1400px; }
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

    /* Layout 2 colonnes : formulaire | preview */
    .render-panel-body { display: grid; grid-template-columns: 320px 1fr; gap: 32px; align-items: start; }

    .section-title { font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 16px; }

    .props-form { display: flex; flex-direction: column; gap: 14px; }
    .form-field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #374151; }
    .required { color: #ef4444; margin-left: 2px; }
    .form-input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; }

    /* Slider + nombre */
    .number-field { display: flex; align-items: center; gap: 10px; }
    .range-input { flex: 1; cursor: pointer; accent-color: #8b5cf6; }
    .number-input { width: 80px; flex: none; }

    .image-field { }
    .image-preview { position: relative; display: inline-block; }
    .image-preview img { height: 80px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .btn-remove { position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 11px; cursor: pointer; }
    .image-upload-btn { display: inline-block; padding: 8px 16px; border: 1px dashed #d1d5db; border-radius: 8px; cursor: pointer; font-size: 13px; color: #6b7280; }

    .btn-render { padding: 12px 24px; font-size: 15px; font-weight: 600; width: 100%; margin-top: 4px; }
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

    /* Preview iframe */
    .preview-panel { display: flex; flex-direction: column; gap: 8px; }
    .preview-badge { background: #fee2e2; color: #b91c1c; font-size: 10px; padding: 1px 6px; border-radius: 8px; vertical-align: middle; margin-left: 6px; font-weight: 600; text-transform: uppercase; }
    .preview-frame-wrapper { position: relative; width: 100%; padding-top: 56.25%; /* 16:9 */ background: #111; border-radius: 10px; overflow: hidden; }
    .preview-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
    .preview-hint { font-size: 12px; color: #9ca3af; margin: 0; }

    .loading-state, .empty-state { color: #6b7280; padding: 48px 0; text-align: center; }

    @media (max-width: 900px) { .render-panel-body { grid-template-columns: 1fr; } }
  `],
})
export class RemotionTemplatesComponent implements OnInit, OnDestroy {
  @ViewChild('previewFrame') previewFrameRef!: ElementRef<HTMLIFrameElement>;

  private api = inject(ApiService);
  private notifications = inject(NotificationService);
  private authService = inject(AuthService);
  private sitesService = inject(SitesService);
  private sanitizer = inject(DomSanitizer);

  templates: RemotionTemplate[] = [];
  selectedTemplate: RemotionTemplate | null = null;
  sites: Site[] = [];
  selectedSiteId = '';
  loading = true;

  propValues: Record<string, unknown> = {};
  imageUrls: Record<string, string> = {};
  imageFiles: Record<string, File> = {};
  videoTitle = '';

  rendering = false;
  renderProgress = 0;
  renderStatusMessage = 'Démarrage du render...';
  lastResult: RenderResult | null = null;

  // URL de l'iframe preview — SafeResourceUrl pour éviter NG0904
  previewUrl: SafeResourceUrl = '';

  // Debounce postMessage pour ne pas spammer l'iframe à chaque frappe
  private postMessageTimer: ReturnType<typeof setTimeout> | null = null;

  get isAdmin(): boolean {
    const role = this.authService.getCurrentUser()?.role;
    return role === 'admin' || role === 'super_admin';
  }

  ngOnInit() {
    this.loadTemplates();
    this.loadSites();
  }

  ngOnDestroy() {
    if (this.postMessageTimer) clearTimeout(this.postMessageTimer);
  }

  private loadTemplates() {
    this.loading = true;
    this.api.get<RemotionTemplate[]>('/remotion-templates').subscribe({
      next: (templates) => { this.templates = templates; this.loading = false; },
      error: () => { this.notifications.error('Impossible de charger les templates'); this.loading = false; },
    });
  }

  private loadSites() {
    this.sitesService.loadSites().subscribe({
      next: (result) => { this.sites = result.sites; },
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

    // Construire l'URL de l'iframe avec la composition et les props initiales
    this.previewUrl = this.buildPreviewUrl(tpl.composition_id, this.propValues);
  }

  /** Appelé à chaque changement de prop — met à jour le preview via postMessage */
  onPropChange(key: string, value: unknown) {
    this.propValues = { ...this.propValues, [key]: value };
    this.sendPropsToPreview();
  }

  onImageSelect(event: Event, key: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imageFiles[key] = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.imageUrls[key] = dataUrl;
      // Envoyer le dataUrl directement comme prop — ButSimple accepte data: URLs
      this.onPropChange(key, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  removeImage(key: string) {
    delete this.imageUrls[key];
    delete this.imageFiles[key];
    const defaultVal = this.selectedTemplate?.default_props[key] ?? '';
    this.onPropChange(key, defaultVal);
  }

  /** Envoie les props courantes à l'iframe via postMessage (debounced 150ms) */
  private sendPropsToPreview() {
    if (this.postMessageTimer) clearTimeout(this.postMessageTimer);
    this.postMessageTimer = setTimeout(() => {
      const iframe = this.previewFrameRef?.nativeElement;
      if (!iframe?.contentWindow || !this.selectedTemplate) return;
      iframe.contentWindow.postMessage({
        type: 'remotion-props-update',
        compositionId: this.selectedTemplate.composition_id,
        props: this.propValues,
      }, '*');
    }, 150);
  }

  /** Construit l'URL absolue de l'iframe — le dashboard est sur Hostinger,
   *  le preview est servi par le central-server (Railway). Une URL relative
   *  pointerait vers Hostinger → 404. On dérive l'URL depuis environment.apiUrl. */
  private buildPreviewUrl(compositionId: string, props: Record<string, unknown>): SafeResourceUrl {
    // environment.apiUrl = 'https://...railway.app/api' → on remplace '/api' par '/remotion-preview'
    const serverBase = environment.apiUrl.replace(/\/api$/, '');
    const params = new URLSearchParams({
      composition: compositionId,
      props: encodeURIComponent(JSON.stringify(props)),
    });
    const url = `${serverBase}/remotion-preview/?${params.toString()}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  canRender(): boolean {
    if (!this.selectedTemplate) return false;
    return this.selectedTemplate.props_schema
      .filter(p => p.required && p.type === 'text')
      .every(p => !!(this.propValues[p.key] as string)?.trim());
  }

  togglePublish(tpl: RemotionTemplate) {
    this.api.patch<RemotionTemplate>(`/remotion-templates/${tpl.id}/publish`, { published: !tpl.published }).subscribe({
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

    // Remplacer les images par leur dataUrl pour les props finales
    const props: Record<string, unknown> = { ...this.propValues };
    for (const [key, file] of Object.entries(this.imageFiles)) {
      props[key] = await this.fileToDataUrl(file);
    }

    this.renderProgress = 15;
    this.renderStatusMessage = 'Render Remotion en cours (~2 min)...';

    this.api.post<RenderResult>(`/remotion-templates/${this.selectedTemplate.id}/render`, {
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
