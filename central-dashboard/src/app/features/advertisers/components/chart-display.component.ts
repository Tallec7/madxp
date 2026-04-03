import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { TranslateModule } from '@ngx-translate/core';
import {
  AnalyticsSummary,
  DailyTrend,
  Distribution,
  KpisResponse,
  SitePerformance,
  VideoPerformance
} from '../models/analytics.models';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-display',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <!-- KPIs Cards -->
    <div class="kpis-grid">
      <div class="kpi-card">
        <div class="kpi-icon">👁️</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ summary.total_impressions.toLocaleString() || 0 }}</span>
          <span class="kpi-label">Impressions totales</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon">⏱️</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ formatDuration(summary.total_screen_time || 0) }}</span>
          <span class="kpi-label">Temps écran total</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon">✅</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ summary.completion_rate.toFixed(1) || 0 }}%</span>
          <span class="kpi-label">Taux de complétion</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon">🎬</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ summary.unique_videos || 0 }}</span>
          <span class="kpi-label">Vidéos diffusées</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon">📍</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ summary.unique_sites || 0 }}</span>
          <span class="kpi-label">Sites actifs</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon">⏰</div>
        <div class="kpi-content">
          <span class="kpi-value">{{ formatDuration(summary.avg_watch_duration || 0) }}</span>
          <span class="kpi-label">Durée moy. visionnage</span>
        </div>
      </div>
    </div>

    <!-- KPIs Avancés -->
    <div *ngIf="kpisData" class="kpis-advanced">
      <h2 class="section-title">KPIs Sponsors Avancés</h2>
      <div class="kpis-grid">
        <div class="kpi-card kpi-verified">
          <div class="kpi-icon">✓</div>
          <div class="kpi-content">
            <span class="kpi-value">{{ kpisData.kpis.verified_impressions.toLocaleString() }}</span>
            <span class="kpi-label">Impressions vérifiées (TV on)</span>
            <span class="kpi-badge badge-blue">{{ kpisData.kpis.tv_on_rate.toFixed(1) }}% TV allumée</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon">🏟️</div>
          <div class="kpi-content">
            <span class="kpi-value">{{ kpisData.kpis.match_day_impressions.toLocaleString() }}</span>
            <span class="kpi-label">Impressions match day</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon">⚖️</div>
          <div class="kpi-content">
            <span class="kpi-value">{{ (kpisData.kpis.rotation_fairness * 100).toFixed(0) }}%</span>
            <span class="kpi-label">Equité de rotation</span>
          </div>
        </div>

        <div class="kpi-card" [ngClass]="getRenewalScoreClass(kpisData.kpis.renewal_score)">
          <div class="kpi-icon">{{ getRenewalScoreIcon(kpisData.kpis.renewal_score) }}</div>
          <div class="kpi-content">
            <span class="kpi-value">{{ (kpisData.kpis.renewal_score * 100).toFixed(0) }}/100</span>
            <span class="kpi-label">Score renouvellement</span>
            <span class="kpi-badge" [ngClass]="getRenewalBadgeClass(kpisData.kpis.renewal_score)">
              {{ getRenewalScoreLabel(kpisData.kpis.renewal_score) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Peak Hours Chart -->
      <div class="charts-row" style="margin-top: 1.25rem;">
        <div class="chart-card full-width">
          <h3>📊 Heures de forte visibilité (24h)</h3>
          <canvas #peakHoursChart role="img" aria-label="Heatmap des heures de diffusion"></canvas>
        </div>
      </div>
    </div>

    <!-- Charts Row 1: Trends + Period Distribution -->
    <div class="charts-row">
      <div class="chart-card chart-large">
        <h3>📈 Tendances quotidiennes</h3>
        <p class="sr-only">{{ 'sponsors.trendsChartSummary' | translate }}</p>
        <canvas #trendsChart role="img" [attr.aria-label]="'sponsors.trendsChartLabel' | translate"></canvas>
      </div>

      <div class="chart-card">
        <h3>🕐 Répartition par période</h3>
        <p class="sr-only">{{ 'sponsors.periodChartSummary' | translate }}</p>
        <canvas #periodChart role="img" [attr.aria-label]="'sponsors.periodChartLabel' | translate"></canvas>
      </div>
    </div>

    <!-- Charts Row 2: Event Type + Top Videos Table -->
    <div class="charts-row">
      <div class="chart-card">
        <h3>🏆 Type d'événement</h3>
        <p class="sr-only">{{ 'sponsors.eventChartSummary' | translate }}</p>
        <canvas #eventChart role="img" [attr.aria-label]="'sponsors.eventChartLabel' | translate"></canvas>
      </div>

      <div class="chart-card chart-large">
        <h3>🎥 Top 10 Vidéos</h3>
        <div class="table-container">
          <table class="analytics-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vidéo</th>
                <th>Impressions</th>
                <th>Temps écran</th>
                <th>Complétion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let video of topVideos; let i = index">
                <td>{{ i + 1 }}</td>
                <td class="video-name">{{ video.video_title }}</td>
                <td>{{ video.impressions.toLocaleString() }}</td>
                <td>{{ formatDuration(video.total_screen_time) }}</td>
                <td>
                  <span class="completion-badge" [class.high]="video.completion_rate >= 80">
                    {{ video.completion_rate.toFixed(0) }}%
                  </span>
                </td>
              </tr>
              <tr *ngIf="topVideos.length === 0">
                <td colspan="5" class="empty-cell">Aucune donnée disponible</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Charts Row 3: Top Sites Table -->
    <div class="charts-row">
      <div class="chart-card full-width">
        <h3>📍 Performance par site/club</h3>
        <div class="table-container">
          <table class="analytics-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Site / Club</th>
                <th>Impressions</th>
                <th>Temps écran</th>
                <th>Vidéos uniques</th>
                <th>Part du total</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let site of topSites; let i = index">
                <td>{{ i + 1 }}</td>
                <td class="site-name">{{ site.site_name }}</td>
                <td>{{ site.impressions.toLocaleString() }}</td>
                <td>{{ formatDuration(site.total_screen_time) }}</td>
                <td>{{ site.unique_videos }}</td>
                <td>
                  <div class="progress-bar"
                       role="progressbar"
                       [attr.aria-valuenow]="calculatePercentage(site.impressions, summary.total_impressions)"
                       aria-valuemin="0"
                       aria-valuemax="100"
                       [attr.aria-label]="('analytics.shareOfTotal' | translate) + ': ' + calculatePercentage(site.impressions, summary.total_impressions).toFixed(1) + '%'">
                    <div
                      class="progress-fill"
                      [style.width.%]="calculatePercentage(site.impressions, summary.total_impressions)"
                    ></div>
                    <span class="progress-label">
                      {{ calculatePercentage(site.impressions, summary.total_impressions).toFixed(1) }}%
                    </span>
                  </div>
                </td>
              </tr>
              <tr *ngIf="topSites.length === 0">
                <td colspan="6" class="empty-cell">Aucune donnée disponible</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kpis-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      gap: 1rem;
      align-items: center;
      transition: box-shadow 0.2s;
    }

    .kpi-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .kpi-icon {
      font-size: 2rem;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eff6ff;
      border-radius: 8px;
    }

    .kpi-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .kpi-value {
      font-size: 1.75rem;
      font-weight: 600;
      color: #111827;
    }

    .kpi-label {
      font-size: 0.85rem;
      color: #6b7280;
    }

    .charts-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .chart-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
    }

    .chart-card.chart-large {
      grid-column: span 2;
    }

    .chart-card.full-width {
      grid-column: 1 / -1;
    }

    .chart-card h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .chart-card canvas {
      max-height: 300px;
    }

    .table-container {
      overflow-x: auto;
    }

    .analytics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .analytics-table thead {
      background: #f9fafb;
    }

    .analytics-table th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }

    .analytics-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
    }

    .analytics-table tr:hover {
      background: #f9fafb;
    }

    .video-name, .site-name {
      font-weight: 500;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .completion-badge {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
      background: #fef3c7;
      color: #92400e;
    }

    .completion-badge.high {
      background: #d1fae5;
      color: #065f46;
    }

    .empty-cell {
      text-align: center;
      color: #9ca3af;
      padding: 2rem !important;
    }

    .progress-bar {
      position: relative;
      width: 100%;
      height: 24px;
      background: #f3f4f6;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #2563eb);
      transition: width 0.3s;
    }

    .progress-label {
      position: relative;
      display: block;
      line-height: 24px;
      padding: 0 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #111827;
      z-index: 1;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 1rem 0;
    }

    .kpis-advanced {
      margin-bottom: 2rem;
      padding-top: 1.5rem;
      border-top: 2px solid #e5e7eb;
    }

    .kpi-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 500;
      margin-top: 0.25rem;
    }

    .badge-blue {
      background: #dbeafe;
      color: #1e40af;
    }

    .badge-green {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-yellow {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-red {
      background: #fee2e2;
      color: #991b1b;
    }

    .kpi-card.renewal-green {
      border-left: 4px solid #10b981;
    }

    .kpi-card.renewal-yellow {
      border-left: 4px solid #f59e0b;
    }

    .kpi-card.renewal-red {
      border-left: 4px solid #ef4444;
    }

    @media (max-width: 1200px) {
      .chart-card.chart-large {
        grid-column: span 1;
      }
    }

    @media (max-width: 768px) {
      .kpis-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .charts-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ChartDisplayComponent implements OnChanges, OnDestroy {
  @ViewChild('trendsChart') trendsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('periodChart') periodChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('eventChart') eventChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('peakHoursChart') peakHoursChartRef!: ElementRef<HTMLCanvasElement>;

  @Input() summary!: AnalyticsSummary;
  @Input() kpisData: KpisResponse | null = null;
  @Input() topVideos: VideoPerformance[] = [];
  @Input() topSites: SitePerformance[] = [];
  @Input() dailyTrends: DailyTrend[] = [];
  @Input() periodDistribution: Distribution[] = [];
  @Input() eventDistribution: Distribution[] = [];

  private trendsChartInstance: Chart | null = null;
  private periodChartInstance: Chart | null = null;
  private eventChartInstance: Chart | null = null;
  private peakHoursChartInstance: Chart | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dailyTrends'] || changes['periodDistribution'] || changes['eventDistribution']) {
      setTimeout(() => this.renderCharts(), 100);
    }
    if (changes['kpisData']) {
      setTimeout(() => this.renderPeakHoursChart(), 150);
    }
  }

  renderCharts(): void {
    this.renderTrendsChart();
    this.renderPeriodChart();
    this.renderEventChart();
  }

  renderTrendsChart(): void {
    if (!this.trendsChartRef || !this.dailyTrends.length) return;

    if (this.trendsChartInstance) {
      this.trendsChartInstance.destroy();
    }

    const ctx = this.trendsChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.dailyTrends.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Impressions',
            data: this.dailyTrends.map(d => d.impressions),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Vues complètes',
            data: this.dailyTrends.map(d => d.completed_views),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                return `${context.dataset.label}: ${value !== null ? value.toLocaleString() : '0'}`;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            ticks: {
              callback: (value) => value.toLocaleString()
            }
          }
        }
      }
    };

    this.trendsChartInstance = new Chart(ctx, config);
  }

  renderPeriodChart(): void {
    if (!this.periodChartRef || !this.periodDistribution.length) return;

    if (this.periodChartInstance) {
      this.periodChartInstance.destroy();
    }

    const ctx = this.periodChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: this.periodDistribution.map(d => d.label),
        datasets: [{
          data: this.periodDistribution.map(d => d.value),
          backgroundColor: [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#8b5cf6'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a: number, b) => a + (b as number), 0);
                const value = context.parsed as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.periodChartInstance = new Chart(ctx, config);
  }

  renderEventChart(): void {
    if (!this.eventChartRef || !this.eventDistribution.length) return;

    if (this.eventChartInstance) {
      this.eventChartInstance.destroy();
    }

    const ctx = this.eventChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: this.eventDistribution.map(d => d.label),
        datasets: [{
          data: this.eventDistribution.map(d => d.value),
          backgroundColor: [
            '#ef4444',
            '#3b82f6',
            '#f59e0b',
            '#6b7280'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a: number, b) => a + (b as number), 0);
                const value = context.parsed as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.eventChartInstance = new Chart(ctx, config);
  }

  renderPeakHoursChart(): void {
    if (!this.peakHoursChartRef || !this.kpisData?.peak_hours?.hourly_heatmap) return;

    if (this.peakHoursChartInstance) {
      this.peakHoursChartInstance.destroy();
    }

    const ctx = this.peakHoursChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const heatmap = this.kpisData.peak_hours.hourly_heatmap;
    const maxVal = Math.max(...heatmap, 1);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: heatmap.map((_, i) => `${i}h`),
        datasets: [{
          label: 'Impressions',
          data: heatmap,
          backgroundColor: heatmap.map(v => {
            const intensity = v / maxVal;
            if (intensity >= 0.75) return '#1d4ed8';
            if (intensity >= 0.5) return '#3b82f6';
            if (intensity >= 0.25) return '#93c5fd';
            return '#dbeafe';
          }),
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${items[0].label} - ${parseInt(items[0].label) + 1}h`,
              label: (context) => `${(context.parsed.y ?? 0).toLocaleString()} impressions`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => value.toLocaleString() }
          }
        }
      }
    };

    this.peakHoursChartInstance = new Chart(ctx, config);
  }

  getRenewalScoreClass(score: number): string {
    if (score >= 0.7) return 'renewal-green';
    if (score >= 0.4) return 'renewal-yellow';
    return 'renewal-red';
  }

  getRenewalScoreIcon(score: number): string {
    if (score >= 0.7) return '🟢';
    if (score >= 0.4) return '🟡';
    return '🔴';
  }

  getRenewalScoreLabel(score: number): string {
    if (score >= 0.7) return 'Excellent';
    if (score >= 0.4) return 'Moyen';
    return 'A risque';
  }

  getRenewalBadgeClass(score: number): string {
    if (score >= 0.7) return 'badge-green';
    if (score >= 0.4) return 'badge-yellow';
    return 'badge-red';
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  calculatePercentage(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
  }

  ngOnDestroy(): void {
    if (this.trendsChartInstance) {
      this.trendsChartInstance.destroy();
    }
    if (this.periodChartInstance) {
      this.periodChartInstance.destroy();
    }
    if (this.eventChartInstance) {
      this.eventChartInstance.destroy();
    }
    if (this.peakHoursChartInstance) {
      this.peakHoursChartInstance.destroy();
    }
  }
}
