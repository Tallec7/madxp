import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { environment } from '../../../../environments/environment';

export type QrCodeMode = 'local' | 'cloud';

@Component({
  selector: 'app-qr-code-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="qr-modal-backdrop" (click)="close()">
      <div class="qr-modal" (click)="$event.stopPropagation()">
        <button class="close-btn" (click)="close()">&times;</button>

        <!-- Mode selector -->
        <div class="mode-selector">
          <button
            class="mode-btn"
            [class.active]="mode === 'local'"
            (click)="setMode('local')"
            title="Nécessite d'être connecté au hotspot WiFi du boîtier">
            <span class="mode-icon">📶</span>
            <span class="mode-label">Local (Hotspot)</span>
          </button>
          <button
            class="mode-btn"
            [class.active]="mode === 'cloud'"
            (click)="setMode('cloud')"
            [disabled]="!siteId"
            title="Fonctionne depuis n'importe quel réseau avec Internet">
            <span class="mode-icon">☁️</span>
            <span class="mode-label">Cloud</span>
          </button>
        </div>

        <div class="qr-content" #printArea>
          <h2 class="club-name">{{ clubName }}</h2>
          <div class="divider"></div>

          <canvas #qrCanvas class="qr-canvas"></canvas>

          <p class="scan-text">Scannez pour la remote</p>

          <!-- Instructions locales -->
          <div class="instructions" *ngIf="mode === 'local'">
            <div class="step">
              <span class="step-number">1</span>
              <span>Connectez-vous au WiFi</span>
            </div>
            <div class="wifi-name">"{{ wifiSsid }}"</div>
            <div class="step">
              <span class="step-number">2</span>
              <span>Scannez ce QR code</span>
            </div>
          </div>

          <!-- Instructions cloud -->
          <div class="instructions cloud-instructions" *ngIf="mode === 'cloud'">
            <div class="cloud-badge">
              <span class="cloud-icon">☁️</span>
              <span>Mode Cloud</span>
            </div>
            <p class="cloud-info">
              Fonctionne depuis n'importe quel réseau WiFi avec Internet.
              <br>
              <small>Idéal pour les réseaux avec isolation client (mesh WiFi).</small>
            </p>
            <div class="step">
              <span class="step-number">1</span>
              <span>Connectez-vous à un WiFi avec Internet</span>
            </div>
            <div class="step">
              <span class="step-number">2</span>
              <span>Scannez ce QR code</span>
            </div>
            <div class="step">
              <span class="step-number">3</span>
              <span>Connectez-vous avec votre compte Neopro</span>
            </div>
          </div>

          <img src="assets/neopro-logo.png" alt="Neopro" class="logo-img" />
        </div>

        <div class="actions">
          <button class="btn btn-primary" (click)="downloadPng()">
            Telecharger PNG
          </button>
          <button class="btn btn-secondary" (click)="print()">
            Imprimer
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .qr-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .qr-modal {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      max-width: 400px;
      width: 90%;
      position: relative;
    }

    .close-btn {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #64748b;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    .close-btn:hover {
      background: #f1f5f9;
    }

    .qr-content {
      text-align: center;
      padding: 1.5rem;
      border: 2px dashed #e2e8f0;
      border-radius: 12px;
      background: #fafafa;
    }

    .club-name {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .divider {
      width: 60px;
      height: 3px;
      background: #2563eb;
      margin: 0.75rem auto;
      border-radius: 2px;
    }

    .qr-canvas {
      display: block;
      margin: 1.5rem auto;
      max-width: 200px;
    }

    .scan-text {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #1e293b;
    }

    .instructions {
      margin-top: 1.5rem;
      text-align: left;
      background: white;
      padding: 1rem;
      border-radius: 8px;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9375rem;
      color: #475569;
      margin-bottom: 0.5rem;
    }

    .step-number {
      width: 24px;
      height: 24px;
      background: #2563eb;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8125rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .wifi-name {
      font-family: monospace;
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
      background: #f1f5f9;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      margin: 0.5rem 0 1rem 0;
      text-align: center;
    }

    .logo-img {
      margin-top: 1.5rem;
      height: 32px;
      width: auto;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    /* Mode selector */
    .mode-selector {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0.25rem;
      background: #f1f5f9;
      border-radius: 10px;
    }

    .mode-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      color: #64748b;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .mode-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.5);
    }

    .mode-btn.active {
      background: white;
      color: #1e293b;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .mode-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .mode-icon {
      font-size: 1rem;
    }

    .mode-label {
      white-space: nowrap;
    }

    /* Cloud instructions */
    .cloud-instructions {
      text-align: center;
    }

    .cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      padding: 0.375rem 0.75rem;
      border-radius: 20px;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }

    .cloud-icon {
      font-size: 0.875rem;
    }

    .cloud-info {
      margin: 0 0 1rem 0;
      font-size: 0.8125rem;
      color: #64748b;
      line-height: 1.5;
    }

    .cloud-info small {
      color: #94a3b8;
    }

    .cloud-instructions .step {
      justify-content: flex-start;
      text-align: left;
    }

    @media print {
      .qr-modal-backdrop {
        position: static;
        background: none;
      }

      .qr-modal {
        box-shadow: none;
        padding: 0;
      }

      .close-btn,
      .actions,
      .mode-selector {
        display: none !important;
      }

      .qr-content {
        border: 2px solid #000;
        padding: 2rem;
      }
    }
  `]
})
export class QrCodeGeneratorComponent implements OnInit, OnChanges {
  @Input() clubName: string = '';
  @Input() wifiSsid: string = '';
  @Input() siteId: string = '';  // Required for cloud mode
  @Input() visible: boolean = false;
  @Input() defaultMode: QrCodeMode = 'local';  // Allow parent to set default mode
  @Output() visibleChange = new EventEmitter<boolean>();

  @ViewChild('qrCanvas', { static: false }) qrCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('printArea', { static: false }) printArea!: ElementRef<HTMLDivElement>;

  mode: QrCodeMode = 'local';

  private readonly localRemoteUrl = 'http://neopro.local/remote';
  private readonly logoUrl = 'assets/neopro-logo.png';

  /**
   * Returns the URL for the current mode
   */
  get remoteUrl(): string {
    if (this.mode === 'cloud' && this.siteId) {
      // Use dashboard URL from environment for cloud mode
      return `${environment.dashboardUrl}/remote/${this.siteId}`;
    }
    return this.localRemoteUrl;
  }

  ngOnInit(): void {
    this.mode = this.defaultMode;
    this.generateQrCode();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      // Reset to default mode when opening
      this.mode = this.defaultMode;
      setTimeout(() => this.generateQrCode(), 0);
    }
    if (changes['defaultMode'] && !changes['defaultMode'].firstChange) {
      this.mode = this.defaultMode;
      this.generateQrCode();
    }
  }

  /**
   * Switch between local and cloud mode
   */
  setMode(newMode: QrCodeMode): void {
    if (newMode === 'cloud' && !this.siteId) {
      return; // Cannot switch to cloud without siteId
    }
    this.mode = newMode;
    this.generateQrCode();
  }

  private async generateQrCode(): Promise<void> {
    if (!this.qrCanvas?.nativeElement) return;

    try {
      await QRCode.toCanvas(this.qrCanvas.nativeElement, this.remoteUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        }
      });
    } catch (error) {
      console.error('QR code generation error:', error);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async downloadPng(): Promise<void> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dimensions - cloud mode needs more height for 3 steps
    const width = 624;
    const height = this.mode === 'cloud' ? 540 : 500;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Club name
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.clubName.toUpperCase(), width / 2, 70);

    // Divider
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(width / 2 - 40, 85, 80, 4);

    // QR Code
    const qrSize = 180;
    const qrX = width / 2 - qrSize / 2;
    const qrY = 110;

    try {
      const qrDataUrl = await QRCode.toDataURL(this.remoteUrl, {
        width: qrSize,
        margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' }
      });

      const qrImg = new Image();
      await new Promise<void>((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
          resolve();
        };
        qrImg.src = qrDataUrl;
      });
    } catch (error) {
      console.error('QR generation error:', error);
    }

    // Scan text
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Scannez pour la telecommande', width / 2, 320);

    if (this.mode === 'cloud') {
      // Cloud mode badge
      const badgeText = '☁️ Mode Cloud';
      ctx.font = 'bold 12px Arial, sans-serif';
      const badgeWidth = ctx.measureText(badgeText).width + 20;
      const badgeX = width / 2 - badgeWidth / 2;

      // Badge background (gradient-like with solid color)
      ctx.fillStyle = '#6366f1';
      this.roundRect(ctx, badgeX, 330, badgeWidth, 24, 12);
      ctx.fill();

      // Badge text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, width / 2, 346);

      // Instructions background (taller for 3 steps)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(80, 360, width - 160, 120);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(80, 360, width - 160, 120);

      // Step 1
      ctx.fillStyle = '#475569';
      ctx.font = '14px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('1. Connectez-vous a un WiFi avec Internet', 110, 388);

      // Step 2
      ctx.fillText('2. Scannez ce QR code', 110, 418);

      // Step 3
      ctx.fillText('3. Connectez-vous avec votre compte Neopro', 110, 448);

      // Logo position adjusted
      await this.drawLogo(ctx, width, 495);
    } else {
      // Local mode - original layout
      // Instructions background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(80, 340, width - 160, 100);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(80, 340, width - 160, 100);

      // Step 1
      ctx.fillStyle = '#475569';
      ctx.font = '14px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('1. Connectez-vous au WiFi', 110, 370);

      // WiFi name
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`"${this.wifiSsid}"`, width / 2, 395);

      // Step 2
      ctx.fillStyle = '#475569';
      ctx.font = '14px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('2. Scannez ce QR code', 110, 425);

      // Logo
      await this.drawLogo(ctx, width, 458);
    }

    // Download
    const link = document.createElement('a');
    const safeName = this.clubName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const modePrefix = this.mode === 'cloud' ? 'cloud-' : '';
    link.download = `qr-${modePrefix}remote-${safeName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  /**
   * Helper to draw rounded rectangle
   */
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Helper to draw logo
   */
  private async drawLogo(ctx: CanvasRenderingContext2D, width: number, yPos: number): Promise<void> {
    try {
      const logoImg = new Image();
      await new Promise<void>((resolve) => {
        logoImg.onload = () => {
          const logoHeight = 28;
          const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
          ctx.drawImage(logoImg, width / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
          resolve();
        };
        logoImg.onerror = () => {
          ctx.fillStyle = '#2563eb';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('NEOPRO', width / 2, yPos + 17);
          resolve();
        };
        logoImg.src = this.logoUrl;
      });
    } catch {
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEOPRO', width / 2, yPos + 17);
    }
  }

  print(): void {
    const printContent = this.printArea.nativeElement.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - ${this.clubName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 2rem;
            display: flex;
            justify-content: center;
          }
          .qr-content {
            text-align: center;
            padding: 2rem;
            border: 2px solid #000;
            border-radius: 12px;
            max-width: 300px;
          }
          .club-name {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 700;
            text-transform: uppercase;
          }
          .divider {
            width: 60px;
            height: 3px;
            background: #2563eb;
            margin: 0.75rem auto;
          }
          .qr-canvas {
            display: block;
            margin: 1.5rem auto;
            max-width: 180px;
          }
          .scan-text {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 600;
          }
          .instructions {
            margin-top: 1.5rem;
            text-align: left;
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 8px;
          }
          .step {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.5rem;
          }
          .step-number {
            width: 24px;
            height: 24px;
            background: #2563eb;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            font-weight: 600;
          }
          .wifi-name {
            font-family: monospace;
            font-weight: 600;
            background: #e5e5e5;
            padding: 0.5rem;
            border-radius: 6px;
            margin: 0.5rem 0 1rem;
            text-align: center;
          }
          .logo-img {
            margin-top: 1.5rem;
            height: 28px;
            width: auto;
          }
        </style>
      </head>
      <body>
        <div class="qr-content">
          ${printContent}
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}
