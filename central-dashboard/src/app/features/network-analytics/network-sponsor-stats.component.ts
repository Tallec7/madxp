import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef,
  inject, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SiteSponsorService } from '../../core/services/site-sponsor.service';
import {
  NetworkSponsorStatsResponse,
  NetworkSponsorSiteBreakdown,
  NetworkSponsorDailyTrend,
  NetworkSponsorEventType,
} from '../../core/models';

Chart.register(...registerables);

@Component({
  selector: 'app-network-sponsor-stats',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Loading -->
    <div class="loading-container" *ngIf="loading">
      <div class="spinner"></div>
      <p>Chargement des statistiques réseau...</p>
    </div>

    <!-- Error -->
    <div class="error-banner" *ngIf="error">
      <span>{{ error }}</span>
      <button class="btn btn-sm" (click)="loadData()">Réessayer</button>
    </div>

    <!-- Content -->
    <div class="network-stats" *ngIf="!loading && data">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h2>Stats Réseau Annonceur</h2>
          <p class="subtitle">
            Performance cross-club &mdash;
            {{ data.period.from | date:'dd/MM/yyyy' }} au {{ data.period.to | date:'dd/MM/yyyy' }}
          </p>
        </div>
        <a class="btn btn-secondary" routerLink="/advertisers">Retour aux annonceurs</a>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card accent-blue">
          <div class="kpi-value">{{ data.summary.total_impressions | number }}</div>
          <div class="kpi-label">Passages totaux</div>
        </div>
        <div class="kpi-card accent-green">
          <div class="kpi-value">{{ data.summary.estimated_reach | number }}</div>
          <div class="kpi-label">Audience estimee</div>
        </div>
        <div class="kpi-card accent-purple">
          <div class="kpi-value">{{ data.summary.active_sites }}</div>
          <div class="kpi-label">Clubs actifs</div>
        </div>
        <div class="kpi-card accent-orange">
          <div class="kpi-value">{{ formatScreenTime(data.summary.total_screen_time_seconds) }}</div>
          <div class="kpi-label">Temps d'écran total</div>
        </div>
        <div class="kpi-card accent-slate">
          <div class="kpi-value">{{ data.summary.active_days }}</div>
          <div class="kpi-label">Jours actifs</div>
        </div>
        <div class="kpi-card accent-teal" *ngIf="data.summary.cpi !== null">
          <div class="kpi-value">{{ data.summary.cpi | number:'1.2-2' }} &euro;</div>
          <div class="kpi-label">CPI réseau</div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="charts-row">
        <!-- Trends chart -->
        <div class="chart-card" *ngIf="data.daily_trends.length">
          <h3>Tendance quotidienne</h3>
          <canvas #trendsCanvas></canvas>
        </div>

        <!-- Event type doughnut -->
        <div class="chart-card chart-card-sm" *ngIf="data.by_event_type.length">
          <h3>Répartition par type</h3>
          <canvas #eventTypeCanvas></canvas>
        </div>
      </div>

      <!-- Site breakdown table -->
      <div class="table-card" *ngIf="data.by_site.length">
        <h3>Performance par club</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Club</th>
              <th>Passages</th>
              <th>Temps écran</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let site of data.by_site">
              <td>
                <strong>{{ site.club_name }}</strong>
                <span class="site-sub">{{ site.site_name }}</span>
              </td>
              <td>{{ site.impressions | number }}</td>
              <td>{{ formatScreenTime(site.screen_time_seconds) }}</td>
              <td>{{ site.completion_rate | number:'1.0-0' }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4rem;
      color: #64748b;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-banner {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      border-radius: 8px;
      padding: 1rem;
      color: #991b1b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 1rem;
    }

    .network-stats { padding: 1.5rem; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }
    .page-header h2 { margin: 0; font-size: 1.5rem; color: #0f172a; }
    .subtitle { color: #64748b; font-size: 0.9rem; margin: 0.25rem 0 0; }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .kpi-card {
      padding: 1.25rem;
      background: white;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #e2e8f0;
    }
    .kpi-card.accent-blue { border-left-color: #3b82f6; }
    .kpi-card.accent-green { border-left-color: #22c55e; }
    .kpi-card.accent-purple { border-left-color: #8b5cf6; }
    .kpi-card.accent-orange { border-left-color: #f59e0b; }
    .kpi-card.accent-slate { border-left-color: #64748b; }
    .kpi-card.accent-teal { border-left-color: #14b8a6; }
    .kpi-value {
      font-size: 1.75rem;
      font-weight: 800;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 0.15rem;
    }

    /* Charts */
    .charts-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 768px) {
      .charts-row { grid-template-columns: 1fr; }
    }
    .chart-card {
      background: white;
      border-radius: 10px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .chart-card h3 { margin: 0 0 1rem; font-size: 1rem; color: #334155; }
    .chart-card canvas { max-height: 280px; }
    .chart-card-sm canvas { max-height: 220px; }

    /* Table */
    .table-card {
      background: white;
      border-radius: 10px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .table-card h3 { margin: 0 0 1rem; font-size: 1rem; color: #334155; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table th {
      padding: 0.6rem 0.75rem;
      text-align: left;
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.875rem;
    }
    .data-table tbody tr:hover { background: #f8fafc; }
    .site-sub {
      display: block;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      border: 1px solid transparent;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn-secondary { background: #f1f5f9; color: #475569; border-color: #d1d5db; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
  `],
})
export class NetworkSponsorStatsComponent implements OnInit, OnDestroy {
  @ViewChild('trendsCanvas') trendsCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('eventTypeCanvas') eventTypeCanvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly sponsorService = inject(SiteSponsorService);
  private readonly cdr = inject(ChangeDetectorRef);

  advertiserId = '';
  loading = true;
  error = '';
  data: NetworkSponsorStatsResponse | null = null;

  private trendsChart: Chart | null = null;
  private eventTypeChart: Chart | null = null;

  ngOnInit(): void {
    this.advertiserId = this.route.snapshot.paramMap.get('id') || '';
    if (this.advertiserId) {
      this.loadData();
    } else {
      this.error = 'Identifiant annonceur manquant';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.sponsorService.getNetworkSponsorStats(this.advertiserId).subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
        this.cdr.markForCheck();
        setTimeout(() => this.renderCharts(), 50);
      },
      error: () => {
        this.error = 'Impossible de charger les statistiques réseau';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Charts
  // =========================================================================

  private renderCharts(): void {
    this.renderTrendsChart();
    this.renderEventTypeChart();
  }

  private renderTrendsChart(): void {
    if (!this.trendsCanvasRef || !this.data?.daily_trends.length) return;

    const trends = this.data.daily_trends;
    const labels = trends.map(t => {
      const d = new Date(t.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });

    const ctx = this.trendsCanvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Passages',
          data: trends.map(t => t.impressions),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    };

    this.trendsChart = new Chart(ctx, config);
  }

  private renderEventTypeChart(): void {
    if (!this.eventTypeCanvasRef || !this.data?.by_event_type.length) return;

    const eventTypes = this.data.by_event_type;
    const colorMap: Record<string, string> = {
      match: '#3b82f6',
      training: '#22c55e',
      tournament: '#f59e0b',
      other: '#94a3b8',
    };

    const ctx = this.eventTypeCanvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: eventTypes.map(e => e.event_type),
        datasets: [{
          data: eventTypes.map(e => e.count),
          backgroundColor: eventTypes.map(e => colorMap[e.event_type] || '#cbd5e1'),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 } },
          },
        },
      },
    };

    this.eventTypeChart = new Chart(ctx, config);
  }

  private destroyCharts(): void {
    if (this.trendsChart) {
      this.trendsChart.destroy();
      this.trendsChart = null;
    }
    if (this.eventTypeChart) {
      this.eventTypeChart.destroy();
      this.eventTypeChart = null;
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  formatScreenTime(seconds: number): string {
    if (!seconds) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  }
}
