import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { environment } from '../../../environments/environment';
import { CacheService } from '../../core/services/cache.service';
import { AnalyticsService, TractionMetrics, EngagementMonthlyEntry } from '../../core/services/analytics.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../core/services/logger.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsNavComponent } from './analytics-nav.component';

Chart.register(...registerables);

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

interface OverviewResponse {
  total_sites: number;
  online_sites: number;
  total_plays_today: number;
  total_plays_week: number;
  avg_availability: number;
  sites_summary: {
    site_id: string;
    club_name: string;
    status: string;
    plays_today: number;
    availability_24h: number;
  }[];
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
  imports: [CommonModule, RouterModule, TranslateModule, AnalyticsNavComponent],
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

      <!-- Skeleton Content -->
      <div class="content-grid" *ngIf="loading && !lastUpdate">
        <div class="card" style="grid-column: 1 / -1;">
          <div class="skeleton-shimmer skeleton-text" style="width: 40%; height: 18px; margin-bottom: 20px;"></div>
          <div class="skeleton-shimmer" style="height: 250px; border-radius: 8px;"></div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="content-grid" *ngIf="!loading || lastUpdate">
        <!-- Engagement Chart -->
        <div class="card chart-card fade-in">
          <h2>Engagement mensuel</h2>
          <div class="chart-container">
            <canvas #engagementChart></canvas>
          </div>
          <p class="no-data" *ngIf="!hasEngagementData">Pas de donnees d'engagement</p>
        </div>

        <!-- Top Clubs -->
        <div class="card fade-in">
          <div class="card-header-row">
            <h2>Top clubs actifs</h2>
            <span class="card-badge">Aujourd'hui</span>
          </div>
          <div class="ranked-list" *ngIf="topClubs.length > 0; else noTopClubs">
            <a *ngFor="let club of topClubs; let i = index"
               [routerLink]="['/sites', club.site_id, 'analytics']"
               class="ranked-item">
              <span class="rank" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2">{{ i + 1 }}</span>
              <div class="ranked-info">
                <span class="ranked-name">{{ club.club_name }}</span>
                <span class="ranked-stat">{{ club.plays_today }} lectures</span>
              </div>
              <div class="ranked-bar-container">
                <div class="ranked-bar" [style.width.%]="getClubBarWidth(club.plays_today)"></div>
              </div>
            </a>
          </div>
          <ng-template #noTopClubs>
            <div class="empty-state">Aucune lecture aujourd'hui</div>
          </ng-template>
        </div>

        <!-- Clubs a relancer -->
        <div class="card fade-in">
          <div class="card-header-row">
            <h2>Clubs a relancer</h2>
            <span class="card-badge badge-warning" *ngIf="dormantClubs.length > 0">{{ dormantClubs.length }}</span>
          </div>
          <div class="alert-list" *ngIf="dormantClubs.length > 0; else noDormant">
            <a *ngFor="let club of dormantClubs"
               [routerLink]="['/sites', club.site_id]"
               class="alert-item">
              <div class="alert-indicator" [class.offline]="club.status === 'offline'" [class.dormant]="club.status !== 'offline'"></div>
              <div class="alert-info">
                <span class="alert-name">{{ club.club_name }}</span>
                <span class="alert-reason" *ngIf="club.status === 'offline'">Hors ligne</span>
                <span class="alert-reason" *ngIf="club.status !== 'offline'">0 lecture aujourd'hui</span>
              </div>
              <span class="alert-avail" [class.low]="club.availability_24h < 80">{{ club.availability_24h?.toFixed(0) || 0 }}% dispo</span>
            </a>
          </div>
          <ng-template #noDormant>
            <div class="empty-state success">Tous les clubs sont actifs</div>
          </ng-template>
        </div>

        <!-- Sponsors Resume -->
        <div class="card fade-in" *ngIf="traction?.advertiserMetrics">
          <h2>Sponsors</h2>
          <div class="sponsor-stats">
            <div class="sponsor-stat">
              <div class="sponsor-stat-value">{{ traction?.advertiserMetrics?.active_advertisers || '0' }}</div>
              <div class="sponsor-stat-label">Annonceurs actifs</div>
            </div>
            <div class="sponsor-stat">
              <div class="sponsor-stat-value">{{ traction?.advertiserMetrics?.videos_diffused || '0' }}</div>
              <div class="sponsor-stat-label">Videos diffusees</div>
            </div>
            <div class="sponsor-stat">
              <div class="sponsor-stat-value">{{ traction?.advertiserMetrics?.sites_reached || '0' }}</div>
              <div class="sponsor-stat-label">Clubs touches</div>
            </div>
            <div class="sponsor-stat">
              <div class="sponsor-stat-value">{{ traction?.advertiserMetrics?.completion_rate || '0' }}%</div>
              <div class="sponsor-stat-label">Completion</div>
            </div>
          </div>
          <a routerLink="/advertisers" class="see-more">Voir les annonceurs &rarr;</a>
        </div>

        <!-- Sante Flotte (condensee) -->
        <div class="card card-compact fade-in">
          <div class="card-header-row clickable" (click)="healthExpanded = !healthExpanded">
            <h2>Sante flotte</h2>
            <span class="expand-icon">{{ healthExpanded ? '−' : '+' }}</span>
          </div>
          <div class="health-summary">
            <div class="health-pill" [class.ok]="connectionStats.online > 0">
              <span class="pill-value">{{ connectionStats.online }}</span>
              <span class="pill-label">en ligne</span>
            </div>
            <div class="health-pill" [class.warn]="connectionStats.warning > 0">
              <span class="pill-value">{{ connectionStats.warning }}</span>
              <span class="pill-label">instables</span>
            </div>
            <div class="health-pill" [class.danger]="connectionStats.offline > 0">
              <span class="pill-value">{{ connectionStats.offline }}</span>
              <span class="pill-label">hors ligne</span>
            </div>
          </div>
          <div class="health-detail" *ngIf="healthExpanded">
            <div class="metric-row-compact">
              <span class="metric-name">CPU</span>
              <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgCpu < 50" [class.warning]="avgCpu >= 50 && avgCpu < 80" [class.danger]="avgCpu >= 80" [style.width.%]="avgCpu"></div></div>
              <span class="metric-val">{{ avgCpu | number:'1.0-0' }}%</span>
            </div>
            <div class="metric-row-compact">
              <span class="metric-name">RAM</span>
              <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgMemory < 60" [class.warning]="avgMemory >= 60 && avgMemory < 85" [class.danger]="avgMemory >= 85" [style.width.%]="avgMemory"></div></div>
              <span class="metric-val">{{ avgMemory | number:'1.0-0' }}%</span>
            </div>
            <div class="metric-row-compact">
              <span class="metric-name">Temp</span>
              <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgTemperature < 60" [class.warning]="avgTemperature >= 60 && avgTemperature < 75" [class.danger]="avgTemperature >= 75" [style.width.%]="Math.min(avgTemperature, 100)"></div></div>
              <span class="metric-val">{{ avgTemperature | number:'1.0-0' }}°C</span>
            </div>
          </div>
        </div>
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

    /* KPI Grid */
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

    /* Content Grid */
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

    .card h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }

    .chart-card { grid-column: 1 / -1; }
    .chart-container { height: 280px; position: relative; }

    .card-header-row { display: flex; justify-content: space-between; align-items: center; }
    .card-header-row.clickable { cursor: pointer; }
    .card-badge { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: #eff6ff; color: #2563eb; font-weight: 500; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .expand-icon { font-size: 18px; color: #94a3b8; font-weight: 600; width: 24px; text-align: center; }

    /* Top Clubs */
    .ranked-list { display: flex; flex-direction: column; gap: 8px; }

    .ranked-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 8px; background: #f8fafc;
      text-decoration: none; color: inherit; transition: background 0.15s;
    }
    .ranked-item:hover { background: #f1f5f9; }

    .rank {
      width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; background: #e2e8f0; color: #475569; flex-shrink: 0;
    }
    .rank-gold { background: #fef3c7; color: #b45309; }
    .rank-silver { background: #f1f5f9; color: #475569; }
    .rank-bronze { background: #fed7aa; color: #9a3412; }

    .ranked-info { flex: 1; min-width: 0; }
    .ranked-name { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ranked-stat { font-size: 12px; color: #64748b; }

    .ranked-bar-container { width: 80px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
    .ranked-bar { height: 100%; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 3px; transition: width 0.3s; }

    /* Clubs a relancer */
    .alert-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }

    .alert-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.15s;
    }
    .alert-item:hover { background: #f8fafc; }

    .alert-indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .alert-indicator.offline { background: #ef4444; }
    .alert-indicator.dormant { background: #f59e0b; }

    .alert-info { flex: 1; min-width: 0; }
    .alert-name { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alert-reason { font-size: 12px; color: #94a3b8; }

    .alert-avail { font-size: 12px; color: #64748b; flex-shrink: 0; }
    .alert-avail.low { color: #ef4444; font-weight: 500; }

    /* Sponsors */
    .sponsor-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 12px; }
    .sponsor-stat { text-align: center; padding: 12px; background: #f8fafc; border-radius: 8px; }
    .sponsor-stat-value { font-size: 22px; font-weight: 700; color: #0f172a; }
    .sponsor-stat-label { font-size: 11px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; }

    .see-more { display: block; text-align: center; font-size: 13px; color: #2563eb; text-decoration: none; font-weight: 500; padding-top: 8px; }
    .see-more:hover { text-decoration: underline; }

    /* Sante Flotte */
    .card-compact { padding: 16px 20px; }

    .health-summary { display: flex; gap: 12px; margin-top: 12px; }
    .health-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px; background: #f1f5f9; font-size: 13px;
    }
    .health-pill.ok { background: #ecfdf5; }
    .health-pill.ok .pill-value { color: #059669; }
    .health-pill.warn { background: #fffbeb; }
    .health-pill.warn .pill-value { color: #d97706; }
    .health-pill.danger { background: #fef2f2; }
    .health-pill.danger .pill-value { color: #dc2626; }
    .pill-value { font-weight: 700; }
    .pill-label { color: #64748b; }

    .health-detail { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }

    .metric-row-compact { display: flex; align-items: center; gap: 10px; }
    .metric-name { width: 40px; font-size: 12px; color: #64748b; font-weight: 500; }
    .metric-bar-bg { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .metric-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .metric-bar-fill.good { background: #10b981; }
    .metric-bar-fill.warning { background: #f59e0b; }
    .metric-bar-fill.danger { background: #ef4444; }
    .metric-val { width: 40px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; }

    /* Empty / No data */
    .empty-state { text-align: center; padding: 32px; color: #94a3b8; font-size: 14px; }
    .empty-state.success { color: #059669; }
    .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }

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

    /* Responsive */
    @media (max-width: 1200px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .content-grid { grid-template-columns: 1fr; }
      .chart-card { grid-column: 1; }
    }

    @media (max-width: 768px) {
      .analytics-container { padding: 16px; }
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .page-header { flex-direction: column; gap: 12px; }
      .sponsor-stats { grid-template-columns: 1fr 1fr; }
      .health-summary { flex-wrap: wrap; }
    }
  `]
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  @ViewChild('engagementChart') engagementChartRef!: ElementRef<HTMLCanvasElement>;

  private http = inject(HttpClient);
  private cache = inject(CacheService);
  private analyticsService = inject(AnalyticsService);
  private authService = inject(AuthService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);
  private refreshSubscription?: Subscription;
  private engagementChart: Chart | null = null;

  Math = Math;

  loading = false;
  lastUpdate: Date | null = null;
  healthExpanded = false;

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

  // Traction
  traction: TractionMetrics | null = null;

  ngOnInit(): void {
    this.loadData();
    this.refreshSubscription = interval(60000).subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.engagementChart?.destroy();
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
              setTimeout(() => this.renderEngagementChart(data.engagementMonthly), 0);
            }
          },
          error: () => { /* non-critical */ }
        });
      }
    });
  }

  renderEngagementChart(monthly: EngagementMonthlyEntry[]): void {
    if (!this.engagementChartRef?.nativeElement) return;
    this.engagementChart?.destroy();

    const labels = monthly.map(m => {
      const d = new Date(m.month);
      return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Lectures',
            data: monthly.map(m => parseInt(m.plays, 10)),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Sites actifs',
            data: monthly.map(m => parseInt(m.active_sites, 10)),
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 3,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 13 },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Lectures', font: { size: 11 } },
            grid: { color: '#f1f5f9' },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: { display: true, text: 'Sites actifs', font: { size: 11 } },
            grid: { display: false },
          }
        }
      }
    };

    this.engagementChart = new Chart(this.engagementChartRef.nativeElement, config);
  }

  getClubBarWidth(plays: number): number {
    if (!this.topClubs.length) return 0;
    const max = this.topClubs[0]?.plays_today || 1;
    return (plays / max) * 100;
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }
}
