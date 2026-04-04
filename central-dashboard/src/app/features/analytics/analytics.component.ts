import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CacheService } from '../../core/services/cache.service';
import { AnalyticsService, TractionMetrics, EngagementMonthlyEntry } from '../../core/services/analytics.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../core/services/logger.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsNavComponent } from './analytics-nav.component';
import { AnalyticsKpiGridComponent } from './components/analytics-kpi-grid.component';
import { EngagementChartComponent } from './components/engagement-chart.component';
import { TopClubsCardComponent } from './components/top-clubs-card.component';
import { DormantClubsCardComponent } from './components/dormant-clubs-card.component';
import { SponsorSummaryCardComponent } from './components/sponsor-summary-card.component';
import { FleetHealthCardComponent } from './components/fleet-health-card.component';

interface ConnectionStatusResponse {
  sites: Array<{
    siteId: string;
    siteName: string;
    clubName: string;
    displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    lastSeenAt: string | null;
  }>;
  stats: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    unknown: number;
  };
}

interface SiteSummary {
  site_id: string;
  club_name: string;
  status: string;
  plays_today: number;
  availability_24h: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule, RouterModule, TranslateModule,
    AnalyticsNavComponent,
    AnalyticsKpiGridComponent,
    EngagementChartComponent,
    TopClubsCardComponent,
    DormantClubsCardComponent,
    SponsorSummaryCardComponent,
    FleetHealthCardComponent,
  ],
  template: `
    <div class="analytics-container">
      <app-analytics-nav></app-analytics-nav>

      <div class="page-header">
        <div class="header-content">
          <h1>Vue d'ensemble</h1>
          <p class="subtitle">Pilotage business — {{ connectionStats.total }} sites deployes</p>
        </div>
        <div class="header-actions">
          <span class="last-update" *ngIf="lastUpdate">
            Mis a jour: {{ lastUpdate | date:'HH:mm:ss' }}
          </span>
          <button class="btn btn-secondary btn-sm" (click)="loadData()" [disabled]="loading">
            Actualiser
          </button>
        </div>
      </div>

      <app-analytics-kpi-grid
        [loading]="loading"
        [lastUpdate]="lastUpdate"
        [totalPlays]="totalPlays"
        [playsToday]="playsToday"
        [screenTimeHours]="screenTimeHours"
        [avgCompletion]="avgCompletion"
        [totalImpressions]="totalImpressions"
        [activeAdvertisers]="activeAdvertisers"
        [fleetOnlinePercent]="fleetOnlinePercent"
        [connectionStats]="connectionStats">
      </app-analytics-kpi-grid>

      <!-- Skeleton Content -->
      <div class="content-grid" *ngIf="loading && !lastUpdate">
        <div class="card" style="grid-column: 1 / -1;">
          <div class="skeleton-shimmer skeleton-text" style="width: 40%; height: 18px; margin-bottom: 20px;"></div>
          <div class="skeleton-shimmer" style="height: 250px; border-radius: 8px;"></div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="content-grid" *ngIf="!loading || lastUpdate">
        <app-engagement-chart
          [monthlyData]="engagementMonthly"
          [hasData]="hasEngagementData">
        </app-engagement-chart>

        <app-top-clubs-card [clubs]="topClubs"></app-top-clubs-card>

        <app-dormant-clubs-card [clubs]="dormantClubs"></app-dormant-clubs-card>

        <app-sponsor-summary-card
          [metrics]="traction?.advertiserMetrics || null">
        </app-sponsor-summary-card>

        <app-fleet-health-card
          [connectionStats]="connectionStats"
          [avgCpu]="avgCpu"
          [avgMemory]="avgMemory"
          [avgTemperature]="avgTemperature">
        </app-fleet-health-card>
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-content h1 { margin: 0 0 4px 0; font-size: 28px; font-weight: 600; }
    .subtitle { margin: 0; color: #64748b; font-size: 14px; }

    .header-actions { display: flex; align-items: center; gap: 12px; }
    .last-update { font-size: 12px; color: #94a3b8; }

    .btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-sm { padding: 6px 12px; font-size: 13px; }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }

    .skeleton-shimmer {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .skeleton-text { height: 14px; margin-bottom: 8px; }

    @media (max-width: 1200px) {
      .content-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      .analytics-container { padding: 16px; }
      .page-header { flex-direction: column; gap: 12px; }
    }
  `]
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private cache = inject(CacheService);
  private analyticsService = inject(AnalyticsService);
  private authService = inject(AuthService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);
  private refreshSubscription?: Subscription;

  loading = false;
  lastUpdate: Date | null = null;

  // Business KPIs
  totalPlays = 0;
  playsToday = 0;
  screenTimeHours = '0';
  avgCompletion = '';
  totalImpressions = 0;
  activeAdvertisers = 0;
  fleetOnlinePercent = 0;

  // Fleet health
  avgCpu = 0;
  avgMemory = 0;
  avgTemperature = 0;
  connectionStats = { total: 0, online: 0, offline: 0, warning: 0 };

  // Lists
  topClubs: SiteSummary[] = [];
  dormantClubs: SiteSummary[] = [];
  hasEngagementData = false;
  engagementMonthly: EngagementMonthlyEntry[] = [];

  // Traction
  traction: TractionMetrics | null = null;

  ngOnInit(): void {
    this.loadData();
    this.refreshSubscription = interval(60000).subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    this.loading = true;

    forkJoin({
      connectionStatus: this.cache.get<ConnectionStatusResponse>(
        'analytics:connection-status',
        () => this.http.get<ConnectionStatusResponse>(`${environment.apiUrl}/sites/connection-status`),
        30000
      ),
      fleetMetrics: this.cache.get<{ avgCpu?: number; avgMemory?: number; avgTemperature?: number; avgDisk?: number }>(
        'analytics:fleet-metrics',
        () => this.http.get<{ avgCpu?: number; avgMemory?: number; avgTemperature?: number; avgDisk?: number }>(`${environment.apiUrl}/sites/fleet-metrics`),
        30000
      )
    }).subscribe({
      next: ({ connectionStatus, fleetMetrics }) => {
        this.connectionStats = {
          total: connectionStatus.stats?.total || 0,
          online: connectionStatus.stats?.online || 0,
          offline: connectionStatus.stats?.offline || 0,
          warning: connectionStatus.stats?.warning || 0
        };

        this.fleetOnlinePercent = this.connectionStats.total > 0
          ? Math.round((this.connectionStats.online / this.connectionStats.total) * 100)
          : 0;

        this.avgCpu = fleetMetrics?.avgCpu || 0;
        this.avgMemory = fleetMetrics?.avgMemory || 0;
        this.avgTemperature = fleetMetrics?.avgTemperature || 0;

        this.lastUpdate = new Date();
        this.loading = false;
      },
      error: (err) => {
        this.logger.warn('Failed to load fleet data', { error: err?.message || err });
        this.notificationService.error('Erreur lors du chargement des donnees');
        this.loading = false;
      }
    });

    // Load business metrics (traction + overview)
    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'operator') {
        this.analyticsService.getAnalyticsOverview().subscribe({
          next: (overview) => {
            this.playsToday = overview.total_plays_today || 0;

            const sorted = [...(overview.sites_summary || [])].sort((a, b) => b.plays_today - a.plays_today);
            this.topClubs = sorted.filter(s => s.plays_today > 0).slice(0, 8);
            this.dormantClubs = sorted
              .filter(s => s.plays_today === 0 || s.status === 'offline')
              .sort((a, b) => {
                if (a.status === 'offline' && b.status !== 'offline') return -1;
                if (a.status !== 'offline' && b.status === 'offline') return 1;
                return (a.availability_24h || 0) - (b.availability_24h || 0);
              })
              .slice(0, 10);
          },
          error: () => { /* non-critical */ }
        });
      }

      if (user?.role === 'super_admin' || user?.role === 'admin') {
        this.analyticsService.getTractionMetrics().subscribe({
          next: (data) => {
            this.traction = data;

            this.totalPlays = parseInt(data.engagementTotals?.total_plays || '0', 10);
            this.screenTimeHours = data.engagementTotals?.screen_time_hours || '0';
            this.avgCompletion = data.engagementTotals?.avg_completion || '';
            this.totalImpressions = parseInt(data.advertiserMetrics?.total_impressions || '0', 10);
            this.activeAdvertisers = parseInt(data.advertiserMetrics?.active_advertisers || '0', 10);

            if (data.engagementMonthly?.length) {
              this.hasEngagementData = true;
              this.engagementMonthly = data.engagementMonthly;
            }
          },
          error: () => { /* non-critical */ }
        });
      }
    });
  }
}
