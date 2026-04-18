/**
 * HotspotQrComponent
 *
 * Affiche un QR code WiFi sur la TV pour permettre au staff de rejoindre
 * le hotspot de secours du Pi quand le WiFi club est en panne.
 *
 * ADR-060 Phase 3 couche 2 — Résilience télécommande.
 *
 * Payload QR : fetched depuis `/api/hotspot/qr-payload` (route locale Pi).
 * Visible uniquement si le hotspot est activé (`configuration.json.hotspot.enabled`).
 *
 * Déclenchement (3 modes, non exclusifs) :
 * 1. URL param `?fallback=hotspot` (manuel, debug)
 * 2. Input `[visible]="true"` piloté par le parent TvComponent
 * 3. Auto si la Pi détecte perte internet > 2 min (non implémenté ici, piloté
 *    depuis tv.component.ts via internet-watchdog du sync-agent)
 */
import {
  Component,
  Input,
  ChangeDetectionStrategy,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import QRCode from 'qrcode';

interface HotspotStatus {
  ssid: string | null;
  active: boolean;
  updatedAt: string | null;
}

interface QrPayloadResponse {
  payload: string;
}

@Component({
  selector: 'app-hotspot-qr',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      *ngIf="visible && qrDataUrl && ssid"
      class="hotspot-qr-overlay"
      role="dialog"
      aria-label="Rejoindre le hotspot WiFi du Pi"
    >
      <div class="hotspot-qr-card">
        <h2>Pas de WiFi ? Rejoignez le hotspot du Pi</h2>
        <p class="ssid">Réseau : <strong>{{ ssid }}</strong></p>
        <img [src]="qrDataUrl" alt="QR code WiFi" class="qr" />
        <p class="hint">
          Scannez ce QR code depuis votre téléphone (Appareil photo iOS ou
          scanner Android) pour vous connecter automatiquement.
        </p>
        <p class="hint-small" *ngIf="updatedAt">
          Dernière rotation PSK :
          {{ updatedAt | date : 'dd/MM HH:mm' }}
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .hotspot-qr-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .hotspot-qr-card {
        background: #fff;
        color: #111;
        padding: 32px 40px;
        border-radius: 16px;
        max-width: 540px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      }
      .hotspot-qr-card h2 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      .ssid {
        font-size: 20px;
        margin: 0 0 20px;
      }
      .qr {
        width: 320px;
        height: 320px;
        image-rendering: pixelated;
      }
      .hint {
        margin: 20px 0 0;
        font-size: 15px;
        opacity: 0.8;
      }
      .hint-small {
        margin: 8px 0 0;
        font-size: 12px;
        opacity: 0.5;
      }
    `,
  ],
})
export class HotspotQrComponent implements OnChanges, OnDestroy {
  @Input() visible = false;
  /** Base URL du serveur Pi local (par défaut: même origine). */
  @Input() apiBase = '';

  qrDataUrl: string | null = null;
  ssid: string | null = null;
  updatedAt: string | null = null;

  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.refresh();
        // Re-fetch toutes les 60s tant que le composant est visible (rotation PSK sync-agent)
        this._pollTimer = setInterval(() => this.refresh(), 60_000);
      } else {
        this.stopPolling();
        this.qrDataUrl = null;
      }
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private refresh(): void {
    const base = this.apiBase || '';
    this.http.get<HotspotStatus>(`${base}/api/hotspot/status`).subscribe({
      next: (status) => {
        this.ssid = status.ssid;
        this.updatedAt = status.updatedAt;
        if (!status.active) {
          this.qrDataUrl = null;
          return;
        }
        this.http.get<QrPayloadResponse>(`${base}/api/hotspot/qr-payload`).subscribe({
          next: async (resp) => {
            try {
              this.qrDataUrl = await QRCode.toDataURL(resp.payload, {
                errorCorrectionLevel: 'M',
                width: 320,
                margin: 1,
              });
            } catch {
              this.qrDataUrl = null;
            }
          },
          error: () => {
            this.qrDataUrl = null;
          },
        });
      },
      error: () => {
        this.qrDataUrl = null;
        this.ssid = null;
      },
    });
  }
}
