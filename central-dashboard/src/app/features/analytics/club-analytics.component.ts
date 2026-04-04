import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Chart } from 'chart.js';
import {
  AnalyticsService,
  ClubHealthData,
  UsageStats,
  ContentStats,
  AvailabilityData,
  AlertData
} from '../../core/services/analytics.service';
import { SitesService } from '../../core/services/sites.service';
import { SiteSponsorService } from '../../core/services/site-sponsor.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { Site, SiteSponsorBenchmarkResponse } from '../../core/models';
import { ClubAnalyticsChartService } from './club-analytics-chart.service';
import { ClubExportService } from './club-export.service';
import {
  computePlaysTrend,
  formatDuration,
  formatDate,
  getVideoName,
  getCategoryPercent,
  getCategoryColor,
  getSeverityIcon,
} from './club-analytics.utils';

@Component({
  selector: 'app-club-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  template: `
    <div class="page-container" *ngIf="site; else loadingTpl">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a class="back-link" [routerLink]="['/sites', siteId]">&larr; {{ site.club_name }}</a>
        </div>
        <div class="header-actions">
          <select [(ngModel)]="selectedPeriod" (change)="onPeriodChange()" class="period-select">
            <option value="7">7 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
          </select>
          <button class="btn btn-outline" (click)="exportData()" [disabled]="exporting">
            {{ exporting ? 'Export...' : 'CSV' }}
          </button>
          <button class="btn btn-primary" (click)="downloadPdf()" [disabled]="exportingPdf">
            {{ exportingPdf ? 'Generation...' : 'PDF' }}
          </button>
        </div>
      </div>

      <!-- Business KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-accent accent-blue"></div>
          <div class="kpi-body">
            <div class="kpi-value">{{ usage?.total_plays || 0 }}</div>
            <div class="kpi-label">Videos diffusees</div>
            <div class="kpi-trend" *ngIf="playsTrend !== null" [class.up]="playsTrend > 0" [class.down]="playsTrend < 0">
              {{ playsTrend > 0 ? '+' : '' }}{{ playsTrend }}% vs periode prec.
            </div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-accent accent-purple"></div>
          <div class="kpi-body">
            <div class="kpi-value">{{ formatDuration(usage?.total_duration || 0) }}</div>
            <div class="kpi-label">Temps d'ecran</div>
            <div class="kpi-sub">{{ usage?.unique_videos || 0 }} videos uniques</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-accent accent-orange"></div>
          <div class="kpi-body">
            <div class="kpi-value">{{ sponsorBenchmark?.sponsors?.length || 0 }}</div>
            <div class="kpi-label">Sponsors actifs</div>
            <div class="kpi-sub" *ngIf="totalSponsorImpressions > 0">{{ totalSponsorImpressions }} impressions</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-accent" [class.accent-green]="(health?.availability_24h || 0) >= 90" [class.accent-red]="(health?.availability_24h || 0) < 90"></div>
          <div class="kpi-body">
            <div class="kpi-value">{{ (health?.availability_24h || 0).toFixed(0) }}%</div>
            <div class="kpi-label">Disponibilite 24h</div>
            <div class="kpi-sub">{{ health?.status === 'online' ? 'En ligne' : 'Hors ligne' }}</div>
          </div>
        </div>
      </div>

      <!-- Engagement Chart -->
      <div class="card chart-section">
        <div class="card-header-row">
          <h2>Engagement ({{ selectedPeriod }} jours)</h2>
        </div>
        <div class="chart-container" *ngIf="usage?.daily_breakdown?.length">
          <canvas #dailyChart></canvas>
        </div>
        <p class="no-data" *ngIf="!usage?.daily_breakdown?.length">Pas de donnees sur cette periode</p>
      </div>

      <!-- Two columns: Content + Sponsors -->
      <div class="two-col">
        <!-- Top Content -->
        <div class="card">
          <h2>Top contenus</h2>
          <div class="content-list" *ngIf="content?.top_videos?.length; else noContent">
            <div *ngFor="let video of content?.top_videos?.slice(0, 8)" class="content-item">
              <div class="content-rank">
                <span class="category-dot" [style.background]="getCategoryColor(video.category)"></span>
              </div>
              <div class="content-info">
                <span class="content-name">{{ getVideoName(video.filename) }}</span>
                <span class="content-cat">{{ video.category || 'Non categorise' }}</span>
              </div>
              <div class="content-stats">
                <span class="content-plays">{{ video.play_count }}</span>
                <span class="content-duration">{{ formatDuration(video.total_duration) }}</span>
              </div>
            </div>
          </div>
          <ng-template #noContent>
            <div class="empty-state">Aucune video jouee</div>
          </ng-template>

          <!-- Categories summary -->
          <div class="categories-summary" *ngIf="content?.categories_breakdown?.length">
            <h3>Par categorie</h3>
            <div *ngFor="let cat of content?.categories_breakdown?.slice(0, 5)" class="cat-row">
              <span class="cat-name">
                <span class="category-dot" [style.background]="getCategoryColor(cat.category)"></span>
                {{ cat.category || 'Autre' }}
              </span>
              <div class="cat-bar-bg">
                <div class="cat-bar-fill" [style.width.%]="getCategoryPercent(cat.play_count)" [style.background]="getCategoryColor(cat.category)"></div>
              </div>
              <span class="cat-count">{{ cat.play_count }}</span>
            </div>
          </div>
        </div>

        <!-- Sponsors -->
        <div class="card">
          <h2>Sponsors ce club</h2>
          <div class="sponsor-list" *ngIf="sponsorBenchmark?.sponsors?.length; else noSponsors">
            <div *ngFor="let sponsor of sponsorBenchmark?.sponsors" class="sponsor-item">
              <div class="sponsor-info">
                <span class="sponsor-name">{{ sponsor.sponsor_name }}</span>
                <span class="sponsor-meta">{{ sponsor.active_days }}j actif · Rang #{{ sponsor.rank }}</span>
              </div>
              <div class="sponsor-metrics">
                <div class="sponsor-metric">
                  <span class="sm-value">{{ sponsor.impressions }}</span>
                  <span class="sm-label">imp.</span>
                </div>
                <div class="sponsor-metric">
                  <span class="sm-value" [class.good]="sponsor.completion_rate >= 80" [class.warn]="sponsor.completion_rate >= 50 && sponsor.completion_rate < 80" [class.bad]="sponsor.completion_rate < 50">
                    {{ sponsor.completion_rate.toFixed(0) || 0 }}%
                  </span>
                  <span class="sm-label">compl.</span>
                </div>
                <div class="sponsor-metric" *ngIf="sponsor.cpi !== null">
                  <span class="sm-value">{{ sponsor.cpi.toFixed(2) }}&euro;</span>
                  <span class="sm-label">CPI</span>
                </div>
              </div>
            </div>

            <!-- Averages -->
            <div class="sponsor-averages" *ngIf="sponsorBenchmark?.averages">
              <span class="avg-label">Moy. club</span>
              <span class="avg-stat">{{ sponsorBenchmark?.averages?.impressions?.toFixed(0) || 0 }} imp.</span>
              <span class="avg-stat">{{ sponsorBenchmark?.averages?.completion_rate?.toFixed(0) || 0 }}% compl.</span>
              <span class="avg-stat" *ngIf="sponsorBenchmark?.averages?.cpi !== null">{{ sponsorBenchmark?.averages?.cpi?.toFixed(2) || '-' }}&euro; CPI</span>
            </div>
          </div>
          <ng-template #noSponsors>
            <div class="empty-state">Aucun sponsor associe a ce club</div>
          </ng-template>
        </div>
      </div>

      <!-- Sante systeme (accordeon) -->
      <div class="card card-collapsible">
        <div class="card-header-row clickable" (click)="healthExpanded = !healthExpanded">
          <h2>Sante systeme</h2>
          <div class="health-pills">
            <span class="pill" [class.ok]="health?.status === 'online'" [class.off]="health?.status !== 'online'">
              {{ health?.status === 'online' ? 'En ligne' : 'Hors ligne' }}
            </span>
            <span class="pill" *ngIf="health?.current_metrics">
              CPU {{ (health?.current_metrics?.cpu_usage || 0).toFixed(0) }}%
            </span>
            <span class="pill" *ngIf="health?.current_metrics">
              {{ (health?.current_metrics?.temperature || 0).toFixed(0) }}°C
            </span>
          </div>
          <span class="expand-toggle">{{ healthExpanded ? '−' : '+' }}</span>
        </div>

        <div class="health-expanded" *ngIf="healthExpanded">
          <!-- Metrics -->
          <div class="metrics-compact" *ngIf="health?.current_metrics as metrics">
            <div class="mc-item" [class.warn]="(metrics.cpu_usage || 0) > 80">
              <span class="mc-label">CPU</span>
              <div class="mc-bar"><div class="mc-fill" [style.width.%]="metrics.cpu_usage || 0"></div></div>
              <span class="mc-val">{{ (metrics.cpu_usage || 0).toFixed(0) }}%</span>
            </div>
            <div class="mc-item" [class.warn]="(metrics.memory_usage || 0) > 80">
              <span class="mc-label">RAM</span>
              <div class="mc-bar"><div class="mc-fill" [style.width.%]="metrics.memory_usage || 0"></div></div>
              <span class="mc-val">{{ (metrics.memory_usage || 0).toFixed(0) }}%</span>
            </div>
            <div class="mc-item" [class.warn]="(metrics.temperature || 0) > 70">
              <span class="mc-label">Temp</span>
              <div class="mc-bar"><div class="mc-fill" [style.width.%]="Math.min(metrics.temperature || 0, 100)"></div></div>
              <span class="mc-val">{{ (metrics.temperature || 0).toFixed(0) }}°C</span>
            </div>
            <div class="mc-item" [class.warn]="(metrics.disk_usage || 0) > 80">
              <span class="mc-label">Disk</span>
              <div class="mc-bar"><div class="mc-fill" [style.width.%]="metrics.disk_usage || 0"></div></div>
              <span class="mc-val">{{ (metrics.disk_usage || 0).toFixed(0) }}%</span>
            </div>
          </div>

          <!-- Recent alerts -->
          <div class="alerts-compact" *ngIf="recentAlerts?.length">
            <h3>Alertes recentes</h3>
            <div *ngFor="let alert of recentAlerts.slice(0, 5)" class="alert-row" [class.resolved]="alert.resolved">
              <span class="alert-sev">{{ getSeverityIcon(alert.severity) }}</span>
              <span class="alert-msg">{{ alert.message }}</span>
              <span class="alert-time">{{ formatDate(alert.created_at) }}</span>
              <span class="alert-badge" [class.resolved]="alert.resolved">{{ alert.resolved ? 'Resolu' : 'Actif' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #loadingTpl>
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Chargement des analytics...</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container { padding: 2rem; max-width: 1400px; margin: 0 auto; }

    /* Header */
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .back-link { font-size: 1rem; color: #2563eb; text-decoration: none; font-weight: 500; }
    .back-link:hover { text-decoration: underline; }
    .header-actions { display: flex; gap: 0.5rem; align-items: center; }

    .period-select { padding: 0.4rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; background: white; }

    .btn { padding: 0.4rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; font-size: 0.875rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-outline { background: white; color: #475569; border: 1px solid #e2e8f0; }
    .btn-outline:hover:not(:disabled) { background: #f8fafc; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* KPI Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }

    .kpi-card {
      background: white; border-radius: 12px; display: flex; overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;
    }

    .kpi-accent { width: 4px; flex-shrink: 0; }
    .accent-blue { background: #2563eb; }
    .accent-purple { background: #7c3aed; }
    .accent-orange { background: #f59e0b; }
    .accent-green { background: #10b981; }
    .accent-red { background: #ef4444; }

    .kpi-body { padding: 16px 20px; }
    .kpi-value { font-size: 26px; font-weight: 700; color: #0f172a; line-height: 1.2; }
    .kpi-label { font-size: 13px; color: #64748b; margin-top: 2px; }
    .kpi-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }
    .kpi-trend { font-size: 12px; margin-top: 3px; font-weight: 500; }
    .kpi-trend.up { color: #059669; }
    .kpi-trend.down { color: #dc2626; }

    /* Cards */
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; margin-bottom: 20px; }
    .card h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }
    .card h3 { margin: 16px 0 10px; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }

    .card-header-row { display: flex; justify-content: space-between; align-items: center; }
    .card-header-row.clickable { cursor: pointer; }

    /* Chart */
    .chart-section { margin-bottom: 20px; }
    .chart-container { height: 260px; position: relative; }

    /* Two columns */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .two-col .card { margin-bottom: 0; }

    /* Content List */
    .content-list { display: flex; flex-direction: column; gap: 6px; }

    .content-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; transition: background 0.15s; }
    .content-item:hover { background: #f8fafc; }

    .content-rank { flex-shrink: 0; }
    .category-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

    .content-info { flex: 1; min-width: 0; }
    .content-name { display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .content-cat { font-size: 11px; color: #94a3b8; }

    .content-stats { text-align: right; flex-shrink: 0; }
    .content-plays { display: block; font-size: 14px; font-weight: 600; color: #0f172a; }
    .content-duration { font-size: 11px; color: #94a3b8; }

    /* Categories */
    .categories-summary { border-top: 1px solid #f1f5f9; padding-top: 8px; margin-top: 12px; }

    .cat-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .cat-name { width: 120px; font-size: 13px; color: #475569; display: flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cat-bar-bg { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .cat-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .cat-count { width: 40px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; flex-shrink: 0; }

    /* Sponsors */
    .sponsor-list { display: flex; flex-direction: column; gap: 10px; }

    .sponsor-item { padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #f59e0b; }
    .sponsor-info { margin-bottom: 8px; }
    .sponsor-name { display: block; font-weight: 600; font-size: 14px; color: #0f172a; }
    .sponsor-meta { font-size: 11px; color: #94a3b8; }

    .sponsor-metrics { display: flex; gap: 16px; }
    .sponsor-metric { text-align: center; }
    .sm-value { display: block; font-size: 16px; font-weight: 700; color: #0f172a; }
    .sm-value.good { color: #059669; }
    .sm-value.warn { color: #d97706; }
    .sm-value.bad { color: #dc2626; }
    .sm-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; }

    .sponsor-averages { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #eff6ff; border-radius: 6px; margin-top: 8px; }
    .avg-label { font-size: 12px; font-weight: 600; color: #2563eb; }
    .avg-stat { font-size: 12px; color: #475569; }

    /* Health Collapsible */
    .card-collapsible { padding: 16px 20px; }
    .card-collapsible h2 { margin-bottom: 0; }

    .health-pills { display: flex; gap: 8px; flex: 1; justify-content: flex-end; margin-right: 12px; }
    .pill { font-size: 12px; padding: 3px 10px; border-radius: 12px; background: #f1f5f9; color: #64748b; }
    .pill.ok { background: #ecfdf5; color: #059669; }
    .pill.off { background: #fef2f2; color: #dc2626; }
    .expand-toggle { font-size: 18px; color: #94a3b8; font-weight: 600; width: 24px; text-align: center; cursor: pointer; }

    .health-expanded { margin-top: 16px; }

    .metrics-compact { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .mc-item { display: flex; align-items: center; gap: 8px; }
    .mc-item.warn .mc-fill { background: #f59e0b !important; }
    .mc-label { width: 36px; font-size: 12px; color: #64748b; font-weight: 500; }
    .mc-bar { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .mc-fill { height: 100%; background: #2563eb; border-radius: 3px; transition: width 0.3s; }
    .mc-val { width: 40px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; }

    /* Alerts compact */
    .alerts-compact { margin-top: 16px; }
    .alerts-compact h3 { margin: 0 0 8px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }

    .alert-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f8fafc; }
    .alert-row.resolved { opacity: 0.5; }
    .alert-sev { flex-shrink: 0; }
    .alert-msg { flex: 1; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alert-time { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
    .alert-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #fef2f2; color: #b91c1c; flex-shrink: 0; }
    .alert-badge.resolved { background: #ecfdf5; color: #065f46; }

    /* Empty / loading */
    .empty-state { text-align: center; padding: 24px; color: #94a3b8; font-size: 14px; }
    .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }

    .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 1rem; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Responsive */
    @media (max-width: 1100px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .two-col { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      .page-container { padding: 1rem; }
      .page-header { flex-direction: column; align-items: flex-start; }
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .metrics-compact { grid-template-columns: 1fr; }
    }
  `]
})
export class ClubAnalyticsComponent implements OnInit, OnDestroy {
  @ViewChild('dailyChart') dailyChartRef!: ElementRef<HTMLCanvasElement>;

  siteId!: string;
  site: Site | null = null;
  selectedPeriod = '30';
  exporting = false;
  exportingPdf = false;
  healthExpanded = false;
  Math = Math;

  // Data
  health: ClubHealthData | null = null;
  usage: UsageStats | null = null;
  previousUsage: UsageStats | null = null;
  content: ContentStats | null = null;
  availability: AvailabilityData[] = [];
  recentAlerts: AlertData[] = [];
  sponsorBenchmark: SiteSponsorBenchmarkResponse | null = null;

  // Computed
  playsTrend: number | null = null;
  totalSponsorImpressions = 0;

  private readonly route = inject(ActivatedRoute);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly sitesService = inject(SitesService);
  private readonly sponsorService = inject(SiteSponsorService);
  private readonly chartService = inject(ClubAnalyticsChartService);
  private readonly exportService = inject(ClubExportService);
  private readonly logger = inject(LoggerService);
  private refreshSubscription?: Subscription;
  private dailyChart: Chart | null = null;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadData();
    this.refreshSubscription = interval(60000).subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.chartService.destroyChart(this.dailyChart);
  }

  loadData(): void {
    const days = parseInt(this.selectedPeriod, 10);

    this.sitesService.getSite(this.siteId).subscribe({
      next: (site) => this.site = site,
      error: (err) => this.logger.warn('Failed to load site', { error: ErrorExtractor.getMessage(err), siteId: this.siteId })
    });

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    forkJoin({
      health: this.analyticsService.getClubHealth(this.siteId),
      usage: this.analyticsService.getClubUsage(this.siteId, days),
      previousUsage: this.analyticsService.getClubUsage(this.siteId, days * 2).pipe(catchError(() => of(null))),
      content: this.analyticsService.getClubContent(this.siteId, days),
      availability: this.analyticsService.getClubAvailability(this.siteId, days),
      alerts: this.analyticsService.getClubAlerts(this.siteId, days),
      sponsors: this.sponsorService.getSiteSponsorBenchmark(this.siteId, fromStr, toStr).pipe(catchError(() => of(null)))
    }).subscribe({
      next: (data) => {
        this.health = data.health;
        this.usage = data.usage;
        this.previousUsage = data.previousUsage;
        this.content = data.content;
        this.availability = data.availability.availability;
        this.recentAlerts = data.alerts.alerts;
        this.sponsorBenchmark = data.sponsors;

        this.playsTrend = computePlaysTrend(
          data.usage?.total_plays || 0,
          data.previousUsage?.total_plays || 0
        );

        this.totalSponsorImpressions = data.sponsors?.sponsors?.reduce((sum, s) => sum + (s.impressions || 0), 0) || 0;

        setTimeout(() => this.renderDailyChart(), 0);
      },
      error: (err) => {
        this.logger.error('Failed to load club analytics', { error: ErrorExtractor.getMessage(err), siteId: this.siteId });
      }
    });
  }

  onPeriodChange(): void {
    this.chartService.destroyChart(this.dailyChart);
    this.dailyChart = null;
    this.loadData();
  }

  private renderDailyChart(): void {
    if (!this.dailyChartRef?.nativeElement || !this.usage?.daily_breakdown?.length) return;
    this.chartService.destroyChart(this.dailyChart);
    this.dailyChart = this.chartService.renderDailyChart(this.dailyChartRef.nativeElement, this.usage.daily_breakdown);
  }

  exportData(): void {
    const days = parseInt(this.selectedPeriod, 10);
    this.exportService.exportCsv(
      this.siteId, this.site?.club_name || this.siteId, days,
      () => { this.exporting = true; },
      () => { this.exporting = false; }
    );
  }

  downloadPdf(): void {
    const days = parseInt(this.selectedPeriod, 10);
    this.exportService.exportPdf(
      this.siteId, this.site?.club_name || this.siteId, days,
      () => { this.exportingPdf = true; },
      () => { this.exportingPdf = false; }
    );
  }

  // ── Template helpers (delegate to pure functions) ──

  formatDuration(seconds: number): string { return formatDuration(seconds); }
  formatDate(date: string): string { return formatDate(date); }
  getVideoName(filename: string): string { return getVideoName(filename); }
  getCategoryColor(category: string): string { return getCategoryColor(category); }
  getSeverityIcon(severity: string): string { return getSeverityIcon(severity); }

  getCategoryPercent(playCount: number): number {
    return getCategoryPercent(playCount, this.content?.categories_breakdown);
  }
}
