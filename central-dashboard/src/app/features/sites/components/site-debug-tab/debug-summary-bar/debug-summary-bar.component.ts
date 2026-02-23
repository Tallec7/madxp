import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

interface ConnectionHealth {
  isHealthy: boolean;
  lastPongAgeMs: number | null;
  socketInMap: boolean;
  reason: string;
}

interface HealthStatus {
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

interface NetworkInfo {
  internet?: { reachable: boolean };
}

interface HotspotInfo {
  isActive: boolean;
  clients: number;
}

interface BufferStatus {
  analytics?: { event_count: number };
}

@Component({
  selector: 'app-debug-summary-bar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="summary-bar">
      <div class="summary-pill"
        [class.pill-ok]="isConnected && isConnectionHealthy()"
        [class.pill-error]="!isConnected"
        [class.pill-warning]="isConnected && !isConnectionHealthy()">
        <span class="pill-icon">{{ isConnected ? (isConnectionHealthy() ? '🟢' : '🟡') : '🔴' }}</span>
        <span class="pill-label">{{ getConnectionLabel() }}</span>
      </div>
      <div class="summary-pill" *ngIf="healthStatus"
        [class.pill-ok]="healthStatus.healthStatus === 'healthy'"
        [class.pill-warning]="healthStatus.healthStatus === 'degraded'"
        [class.pill-error]="healthStatus.healthStatus === 'critical'">
        <span class="pill-icon">🩺</span>
        <span class="pill-label">{{ healthStatus.healthScore }}%</span>
      </div>
      <div class="summary-pill" [class.pill-ok]="filesCount > 0" [class.pill-warning]="filesCount === 0">
        <span class="pill-icon">📂</span>
        <span class="pill-label">{{ filesCount }} {{ 'debug.summaryFiles' | translate }}</span>
      </div>
      <div class="summary-pill" *ngIf="networkInfo"
        [class.pill-ok]="networkInfo.internet?.reachable"
        [class.pill-error]="!networkInfo.internet?.reachable">
        <span class="pill-icon">🌐</span>
        <span class="pill-label">{{ networkInfo.internet?.reachable ? ('debug.summaryInternetOk' | translate) : ('debug.summaryNoInternet' | translate) }}</span>
      </div>
      <div class="summary-pill" *ngIf="hotspotInfo"
        [class.pill-ok]="hotspotInfo.isActive"
        [class.pill-error]="!hotspotInfo.isActive">
        <span class="pill-icon">📡</span>
        <span class="pill-label">{{ hotspotInfo.isActive ? ('debug.summaryHotspotActive' | translate) : ('debug.summaryHotspotInactive' | translate) }}</span>
        <span class="pill-detail" *ngIf="hotspotInfo.clients > 0">👥 {{ hotspotInfo.clients }}</span>
      </div>
      <div class="summary-pill" *ngIf="bufferStatus">
        <span class="pill-icon">📊</span>
        <span class="pill-label">{{ bufferStatus.analytics?.event_count || 0 }} {{ 'debug.summaryEvents' | translate }}</span>
      </div>
    </div>
  `,
  styles: [`
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .summary-pill {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .summary-pill.pill-ok {
      background: #f0fdf4;
      color: #166534;
      border-color: #bbf7d0;
    }

    .summary-pill.pill-warning {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }

    .summary-pill.pill-error {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .pill-icon {
      font-size: 0.8125rem;
    }

    .pill-detail {
      font-size: 0.6875rem;
      opacity: 0.8;
    }
  `]
})
export class DebugSummaryBarComponent {
  @Input() isConnected: boolean = false;
  @Input() connectionHealth: ConnectionHealth | null = null;
  @Input() healthStatus: HealthStatus | null = null;
  @Input() filesCount: number = 0;
  @Input() networkInfo: NetworkInfo | null = null;
  @Input() hotspotInfo: HotspotInfo | null = null;
  @Input() bufferStatus: BufferStatus | null = null;

  isConnectionHealthy(): boolean {
    if (!this.connectionHealth) return this.isConnected;
    return this.connectionHealth.isHealthy;
  }

  getConnectionLabel(): string {
    if (!this.isConnected) return '○ Déconnecté';
    if (this.connectionHealth && !this.connectionHealth.isHealthy) return '⚠ Instable';
    return '● Connecté';
  }
}
