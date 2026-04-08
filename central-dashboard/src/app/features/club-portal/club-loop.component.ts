import { Component, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import * as QRCode from 'qrcode';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { SiteContentTabComponent } from '../sites/components/site-content-tab/site-content-tab.component';
import { ClubHelpModalComponent } from './club-help-modal.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-club-loop',
  standalone: true,
  imports: [CommonModule, TranslateModule, SiteContentTabComponent, ClubHelpModalComponent],
  template: `
    <div class="club-loop">
      <div class="page-header">
        <div class="header-text">
          <h1>{{ 'nav.clubLoop' | translate }}</h1>
          <p class="subtitle">{{ 'clubPortal.loopDescription' | translate }}</p>
        </div>
        <div class="header-actions" *ngIf="siteType === 'saas' && siteId">
          <a class="btn-open" [href]="saasTvUrl" target="_blank" rel="noopener">
            📺 {{ 'clubPortal.openTv' | translate }}
          </a>
          <a class="btn-open btn-secondary" [href]="saasRemoteUrl" target="_blank" rel="noopener">
            🎮 {{ 'clubPortal.openRemote' | translate }}
          </a>
          <button class="btn-open btn-qr" type="button" (click)="toggleQrPanel()">
            📱 {{ 'clubPortal.qrCodes' | translate }}
          </button>
          <button class="btn-open btn-qr" type="button" (click)="showPreview = !showPreview">
            👁️ {{ (showPreview ? 'clubPortal.hidePreview' : 'clubPortal.showPreview') | translate }}
          </button>
        </div>
        <div class="header-help">
          <button class="btn-help" type="button" (click)="showHelp = true" title="Aide">
            ❓ {{ 'clubPortal.help' | translate }}
          </button>
        </div>
      </div>

      <app-club-help-modal [(visible)]="showHelp" [isSaas]="siteType === 'saas'"></app-club-help-modal>

      <!-- QR code panel SaaS -->
      <div class="qr-panel" *ngIf="showQrPanel && siteType === 'saas'">
        <div class="qr-card">
          <h4>📺 {{ 'clubPortal.openTv' | translate }}</h4>
          <canvas #tvQrCanvas></canvas>
          <p class="qr-hint">{{ 'clubPortal.scanTv' | translate }}</p>
          <a class="qr-link" [href]="saasTvUrl" target="_blank" rel="noopener">{{ saasTvUrl }}</a>
        </div>
        <div class="qr-card">
          <h4>🎮 {{ 'clubPortal.openRemote' | translate }}</h4>
          <canvas #remoteQrCanvas></canvas>
          <p class="qr-hint">{{ 'clubPortal.scanRemote' | translate }}</p>
          <a class="qr-link" [href]="saasRemoteUrl" target="_blank" rel="noopener">{{ saasRemoteUrl }}</a>
        </div>
      </div>

      <!-- Live preview iframe (SaaS only) -->
      <div class="preview-panel" *ngIf="showPreview && siteType === 'saas' && siteId">
        <div class="preview-header">
          <span class="preview-label">🔴 {{ 'clubPortal.livePreview' | translate }}</span>
          <a class="preview-open" [href]="saasTvUrl" target="_blank" rel="noopener">↗ {{ 'clubPortal.openInTab' | translate }}</a>
        </div>
        <div class="preview-frame-wrap">
          <iframe [src]="safePreviewUrl" title="Preview TV" allow="autoplay" loading="lazy"></iframe>
        </div>
      </div>

      <!-- Reuses the full content tab which includes the loop manager -->
      <app-site-content-tab
        *ngIf="siteId"
        [siteId]="siteId"
        [siteName]="siteName"
        [siteType]="siteType"
        [isConnected]="isConnected"
        (configDeployed)="onConfigDeployed()">
      </app-site-content-tab>

      <div class="loading" *ngIf="!siteId">
        <div class="spinner"></div>
      </div>
    </div>
  `,
  styles: [`
    .club-loop { padding: 2rem; max-width: 1400px; }
    .page-header {
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      h1 { font-size: 1.5rem; margin: 0; }
      .subtitle { color: var(--text-secondary, #64748b); margin: 0.25rem 0 0; font-size: 0.875rem; }
    }
    .header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .btn-open {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.5rem 0.9rem; border-radius: 8px;
      background: var(--neo-hockey-dark, #2022E9); color: white;
      font-size: 0.875rem; font-weight: 500; text-decoration: none;
      transition: opacity 0.15s;
      border: none; cursor: pointer;
    }
    .btn-open:hover { opacity: 0.9; }
    .btn-open.btn-secondary {
      background: #f1f5f9; color: #1e293b;
      border: 1px solid #e2e8f0;
    }
    .btn-open.btn-qr {
      background: white; color: #1e293b;
      border: 1px solid #e2e8f0;
    }
    .header-help { display: flex; align-items: center; }
    .btn-help {
      padding: 0.5rem 0.9rem; border-radius: 8px;
      background: transparent; color: #64748b;
      border: 1px solid #e2e8f0;
      font-size: 0.8125rem; font-weight: 500; cursor: pointer;
      transition: all 0.15s;
    }
    .btn-help:hover { background: #f8fafc; color: #1e293b; }
    .qr-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding: 1.5rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    .qr-card {
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
      text-align: center;
      h4 { margin: 0; font-size: 0.9375rem; color: #1e293b; }
    }
    .qr-card canvas { border-radius: 8px; }
    .qr-hint { margin: 0; font-size: 0.8125rem; color: #64748b; }
    .qr-link {
      font-size: 0.75rem; color: var(--neo-hockey-dark, #2022E9);
      word-break: break-all; max-width: 240px;
    }
    .preview-panel {
      margin-bottom: 1.5rem;
      background: #0f172a;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #1e293b;
    }
    .preview-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.5rem 1rem; background: #1e293b; color: #f8fafc;
      font-size: 0.8125rem;
    }
    .preview-label { font-weight: 600; }
    .preview-open { color: #93c5fd; text-decoration: none; }
    .preview-open:hover { text-decoration: underline; }
    .preview-frame-wrap {
      position: relative; width: 100%;
      aspect-ratio: 16 / 9; background: black;
    }
    .preview-frame-wrap iframe {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    }
    .loading { text-align: center; padding: 3rem; }
    .spinner {
      width: 32px; height: 32px; margin: 0 auto;
      border: 3px solid #e2e8f0; border-top-color: var(--neo-hockey-dark, #2022E9);
      border-radius: 50%; animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ClubLoopComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('tvQrCanvas') tvQrCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('remoteQrCanvas') remoteQrCanvas?: ElementRef<HTMLCanvasElement>;

  siteId = '';
  siteName = '';
  siteType = '';
  isConnected = false;
  showQrPanel = false;
  showHelp = false;
  showPreview = false;

  get saasTvUrl(): string {
    return `${environment.saasBaseUrl}/?site=${encodeURIComponent(this.siteId)}`;
  }

  get saasRemoteUrl(): string {
    return `${environment.saasBaseUrl}/remote?site=${encodeURIComponent(this.siteId)}`;
  }

  get safePreviewUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.saasTvUrl);
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.site_id) {
      this.siteId = user.site_id;
      this.loadSiteInfo();
    }
  }

  toggleQrPanel(): void {
    this.showQrPanel = !this.showQrPanel;
    if (this.showQrPanel) {
      // Wait for *ngIf to render canvases
      setTimeout(() => this.renderQrCodes(), 0);
    }
  }

  private async renderQrCodes(): Promise<void> {
    const opts: QRCode.QRCodeRenderersOptions = {
      width: 180,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' }
    };
    try {
      if (this.tvQrCanvas?.nativeElement) {
        await QRCode.toCanvas(this.tvQrCanvas.nativeElement, this.saasTvUrl, opts);
      }
      if (this.remoteQrCanvas?.nativeElement) {
        await QRCode.toCanvas(this.remoteQrCanvas.nativeElement, this.saasRemoteUrl, opts);
      }
    } catch (error) {
      console.error('QR code generation error:', error);
    }
  }

  private loadSiteInfo(): void {
    this.api.get<{ site_name: string; club_name: string; status: string; site_type: string }>(`/sites/${this.siteId}`).subscribe({
      next: (site) => {
        this.siteName = site.site_name || site.club_name;
        this.siteType = site.site_type || '';
        this.isConnected = site.status === 'online';
      }
    });
  }

  onConfigDeployed(): void {
    this.loadSiteInfo();
  }
}
