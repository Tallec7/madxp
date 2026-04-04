import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-analytics-kpi-grid',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Skeleton KPIs -->
    <div class="kpi-grid" *ngIf="loading && !lastUpdate">
      <div class="kpi-card skeleton-shimmer skeleton-card" *ngFor="let i of [1,2,3,4]">
        <div class="kpi-body">
          <div class="skeleton-shimmer skeleton-text" style="width: 50%; height: 32px;"></div>
          <div class="skeleton-shimmer skeleton-text skeleton-text-short" style="margin-top: 6px;"></div>
        </div>
      </div>
    </div>

    <!-- Business KPIs -->
    <div class="kpi-grid" *ngIf="!loading || lastUpdate">
      <div class="kpi-card fade-in">
        <div class="kpi-accent accent-blue"></div>
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(totalPlays) }}</div>
          <div class="kpi-label">Videos diffusees</div>
          <div class="kpi-sub" *ngIf="playsToday > 0">{{ playsToday }} aujourd'hui</div>
        </div>
      </div>

      <div class="kpi-card fade-in">
        <div class="kpi-accent accent-purple"></div>
        <div class="kpi-body">
          <div class="kpi-value">{{ screenTimeHours }}h</div>
          <div class="kpi-label">Temps d'ecran</div>
          <div class="kpi-sub" *ngIf="avgCompletion">{{ avgCompletion }}% completion</div>
        </div>
      </div>

      <div class="kpi-card fade-in">
        <div class="kpi-accent accent-orange"></div>
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(totalImpressions) }}</div>
          <div class="kpi-label">Impressions sponsors</div>
          <div class="kpi-sub" *ngIf="activeAdvertisers > 0">{{ activeAdvertisers }} annonceurs actifs</div>
        </div>
      </div>

      <div class="kpi-card fade-in" [routerLink]="['/sites']">
        <div class="kpi-accent" [class.accent-green]="fleetOnlinePercent >= 90" [class.accent-red]="fleetOnlinePercent < 90"></div>
        <div class="kpi-body">
          <div class="kpi-value">{{ fleetOnlinePercent }}%</div>
          <div class="kpi-label">Flotte en ligne</div>
          <div class="kpi-sub">{{ connectionStats.online }}/{{ connectionStats.total }} sites</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: white;
      border-radius: 12px;
      display: flex;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
      transition: all 0.2s;
    }

    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

    .kpi-accent { width: 4px; flex-shrink: 0; }
    .accent-blue { background: #2563eb; }
    .accent-purple { background: #7c3aed; }
    .accent-orange { background: #f59e0b; }
    .accent-green { background: #10b981; }
    .accent-red { background: #ef4444; }

    .kpi-body { padding: 20px; flex: 1; }
    .kpi-value { font-size: 28px; font-weight: 700; line-height: 1.2; color: #0f172a; }
    .kpi-label { font-size: 13px; color: #64748b; margin-top: 2px; }
    .kpi-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }

    /* Skeleton */
    .skeleton-shimmer {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .skeleton-text { height: 14px; margin-bottom: 8px; }
    .skeleton-text-short { width: 60%; }
    .skeleton-card { padding: 20px; min-height: 100px; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    @media (max-width: 1200px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 768px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class AnalyticsKpiGridComponent {
  @Input() loading = false;
  @Input() lastUpdate: Date | null = null;
  @Input() totalPlays = 0;
  @Input() playsToday = 0;
  @Input() screenTimeHours = '0';
  @Input() avgCompletion = '';
  @Input() totalImpressions = 0;
  @Input() activeAdvertisers = 0;
  @Input() fleetOnlinePercent = 0;
  @Input() connectionStats: { total: number; online: number; offline: number; warning: number } = { total: 0, online: 0, offline: 0, warning: 0 };

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }
}
