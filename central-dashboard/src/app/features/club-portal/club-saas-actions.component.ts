import { Component, Input, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import * as QRCode from 'qrcode';
import { environment } from '../../../environments/environment';

/**
 * Shared club SaaS quick actions: open TV / remote, QR codes, live preview.
 * Rendered on the club dashboard "Mon club" page as the main entry point.
 */
@Component({
  selector: 'app-club-saas-actions',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="actions-wrap" *ngIf="siteType === 'saas' && siteId">
      <div class="actions">
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

      <div class="qr-panel" *ngIf="showQrPanel">
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

      <div class="preview-panel" *ngIf="showPreview">
        <div class="preview-header">
          <span class="preview-label">🔴 {{ 'clubPortal.livePreview' | translate }}</span>
          <a class="preview-open" [href]="saasTvUrl" target="_blank" rel="noopener">↗ {{ 'clubPortal.openInTab' | translate }}</a>
        </div>
        <div class="preview-frame-wrap">
          <iframe [src]="safePreviewUrl" title="Preview TV" allow="autoplay" loading="lazy"></iframe>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .actions-wrap { margin-bottom: 1.5rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .btn-open {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.5rem 0.9rem; border-radius: 8px;
      background: var(--neo-hockey-dark, #2022E9); color: white;
      font-size: 0.875rem; font-weight: 500; text-decoration: none;
      transition: opacity 0.15s; border: none; cursor: pointer;
    }
    .btn-open:hover { opacity: 0.9; }
    .btn-open.btn-secondary {
      background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0;
    }
    .btn-open.btn-qr {
      background: white; color: #1e293b; border: 1px solid #e2e8f0;
    }
    .qr-panel {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem; margin-bottom: 1rem; padding: 1.5rem;
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
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
      background: #0f172a; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;
    }
    .preview-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.5rem 1rem; background: #1e293b; color: #f8fafc; font-size: 0.8125rem;
    }
    .preview-label { font-weight: 600; }
    .preview-open { color: #93c5fd; text-decoration: none; }
    .preview-open:hover { text-decoration: underline; }
    .preview-frame-wrap {
      position: relative; width: 100%; aspect-ratio: 16 / 9; background: black;
    }
    .preview-frame-wrap iframe {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    }
  `]
})
export class ClubSaasActionsComponent {
  private readonly sanitizer = inject(DomSanitizer);

  @Input() siteId = '';
  @Input() siteType = '';

  @ViewChild('tvQrCanvas') tvQrCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('remoteQrCanvas') remoteQrCanvas?: ElementRef<HTMLCanvasElement>;

  showQrPanel = false;
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

  toggleQrPanel(): void {
    this.showQrPanel = !this.showQrPanel;
    if (this.showQrPanel) {
      setTimeout(() => this.renderQrCodes(), 0);
    }
  }

  private async renderQrCodes(): Promise<void> {
    const opts: QRCode.QRCodeRenderersOptions = {
      width: 180, margin: 2, color: { dark: '#1e293b', light: '#ffffff' }
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
}
