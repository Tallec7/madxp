import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site } from '../../core/models';
import { AnalyticsNavComponent } from './analytics-nav.component';

// Register Chart.js components
Chart.register(...registerables);

interface ComparisonSite {
  id: string;
  site_name: string;
  club_name: string;
  days_active: number;
  total_videos: number;
  total_screen_time: number;
  total_screen_time_formatted: string;
  avg_completion: number;
}

interface ComparisonData {
  period_days: number;
  totals: {
    total_sites: number;
    total_videos: number;
    total_screen_time: number;
    avg_days_active: number;
  };
  sites: ComparisonSite[];
}

@Component({
  selector: 'app-analytics-comparison',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, AnalyticsNavComponent],
  template: `
    <div class="page-container">
      <app-analytics-nav></app-analytics-nav>

      <!-- Header -->
      <div class="page-header">
        <h1>Comparaison multi-sites</h1>
        <div class="header-actions">
          <select [(ngModel)]="selectedPeriod" (change)="loadComparison()" class="period-select">
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </div>
      </div>

      <!-- Site Selection -->
      <div class="card selection-card">
        <h3>Sélectionner les sites à comparer (max 10)</h3>
        <div class="sites-selector">
          <div class="selected-sites" *ngIf="selectedSites.length > 0">
            <span *ngFor="let site of selectedSites" class="site-tag">
              {{ site.club_name }}
              <button class="remove-btn" (click)="removeSite(site)">×</button>
            </span>
          </div>
          <div class="site-dropdown">
            <select
              [(ngModel)]="siteToAdd"
              (change)="addSite()"
              [disabled]="selectedSites.length >= 10"
              class="site-select"
            >
              <option value="">+ Ajouter un site...</option>
              <option *ngFor="let site of availableSites" [ngValue]="site">
                {{ site.club_name }} ({{ site.site_name }})
              </option>
            </select>
          </div>
        </div>
        <button
          class="btn btn-primary compare-btn"
          (click)="loadComparison()"
          [disabled]="selectedSites.length < 2 || loading"
        >
          {{ loading ? 'Chargement...' : 'Comparer' }}
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement de la comparaison...</p>
      </div>

      <!-- Comparison Results -->
      <div *ngIf="!loading && comparisonData" class="comparison-results">
        <!-- KPIs -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon">📍</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ comparisonData.totals.total_sites }}</span>
              <span class="kpi-label">Sites comparés</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">🎬</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ comparisonData.totals.total_videos | number }}</span>
              <span class="kpi-label">Vidéos totales</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">⏱️</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ formatDuration(comparisonData.totals.total_screen_time) }}</span>
              <span class="kpi-label">Temps écran total</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">📅</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ comparisonData.totals.avg_days_active }}</span>
              <span class="kpi-label">Jours actifs (moy.)</span>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div class="card chart-card">
          <h3>📈 Comparaison des vidéos jouées</h3>
          <p class="sr-only">{{ 'analytics.comparisonChartSummary' | translate }}</p>
          <div class="chart-container">
            <canvas #comparisonChart role="img" [attr.aria-label]="'analytics.comparisonChartLabel' | translate"></canvas>
          </div>
        </div>

        <!-- Data Table -->
        <div class="card">
          <h3>📋 Détail par site</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  <th>Vidéos</th>
                  <th>Temps écran</th>
                  <th>Jours actifs</th>
                  <th>Complétion</th>
                  <th>Part du total</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let site of comparisonData.sites; let i = index">
                  <td>{{ i + 1 }}</td>
                  <td class="club-name">{{ site.club_name }}</td>
                  <td>{{ site.total_videos | number }}</td>
                  <td>{{ site.total_screen_time_formatted }}</td>
                  <td>{{ site.days_active }} / {{ comparisonData.period_days }}</td>
                  <td>
                    <span class="completion-badge" [class.high]="site.avg_completion >= 80">
                      {{ site.avg_completion.toFixed(0) }}%
                    </span>
                  </td>
                  <td>
                    <div class="progress-bar"
                         role="progressbar"
                         [attr.aria-valuenow]="calculatePercentage(site.total_videos, comparisonData.totals.total_videos)"
                         aria-valuemin="0"
                         aria-valuemax="100"
                         [attr.aria-label]="('analytics.shareOfTotal' | translate) + ': ' + calculatePercentage(site.total_videos, comparisonData.totals.total_videos).toFixed(1) + '%'">
                      <div
                        class="progress-fill"
                        [style.width.%]="calculatePercentage(site.total_videos, comparisonData.totals.total_videos)"
                      ></div>
                      <span class="progress-label">
                        {{ calculatePercentage(site.total_videos, comparisonData.totals.total_videos).toFixed(1) }}%
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && !comparisonData && selectedSites.length < 2" class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>Sélectionnez au moins 2 sites</h3>
        <p>Utilisez le menu ci-dessus pour ajouter des sites à comparer.</p>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      background: #f9fafb;
      min-height: 100vh;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      gap: 0.5rem;
    }

    .page-header h1 {
      flex: 1;
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .period-select, .site-select {
      padding: 0.5rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
      background: white;
      cursor: pointer;
      min-width: 200px;
    }

    /* Selection Card */
    .selection-card {
      margin-bottom: 2rem;
    }

    .selection-card h3 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #374151;
    }

    .sites-selector {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1rem;
    }

    .selected-sites {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .site-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 16px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .remove-btn {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      padding: 0;
      margin-left: 0.25rem;
    }

    .remove-btn:hover {
      color: #ef4444;
    }

    .compare-btn {
      margin-top: 1rem;
    }

    /* KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
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

    /* Cards */
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .card h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.1rem;
      color: #111827;
    }

    /* Chart */
    .chart-card {
      min-height: 350px;
    }

    .chart-container {
      height: 300px;
      position: relative;
    }

    /* Tables */
    .table-container {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .data-table thead {
      background: #f9fafb;
    }

    .data-table th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }

    .data-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
    }

    .data-table tr:hover {
      background: #f9fafb;
    }

    .club-name {
      font-weight: 500;
      max-width: 200px;
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

    /* Progress Bar */
    .progress-bar {
      position: relative;
      width: 100%;
      height: 24px;
      background: #f3f4f6;
      border-radius: 4px;
      overflow: hidden;
      min-width: 100px;
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

    /* Buttons */
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Loading & Empty */
    .loading, .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #6b7280;
    }

    .spinner {
      border: 3px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: #374151;
    }

    .empty-state p {
      margin: 0;
      color: #9ca3af;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .page-container {
        padding: 1rem;
      }

      .page-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
      }

      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class AnalyticsComparisonComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('comparisonChart') comparisonChartRef!: ElementRef<HTMLCanvasElement>;

  // Site selection
  allSites: Site[] = [];
  selectedSites: Site[] = [];
  siteToAdd: Site | null = null;
  selectedPeriod = '30';

  // Data
  comparisonData: ComparisonData | null = null;
  loading = false;
  chartsReady = false;

  // Chart instance
  private comparisonChart: Chart | null = null;

  private api = inject(ApiService);
  private sitesService = inject(SitesService);
  private notificationService = inject(NotificationService);

  get availableSites(): Site[] {
    const selectedIds = new Set(this.selectedSites.map(s => s.id));
    return this.allSites.filter(s => !selectedIds.has(s.id));
  }

  ngOnInit(): void {
    this.loadAllSites();
  }

  ngAfterViewInit(): void {
    this.chartsReady = true;
  }

  ngOnDestroy(): void {
    this.comparisonChart?.destroy();
  }

  loadAllSites(): void {
    this.sitesService.loadSites({ limit: 200 }).subscribe({
      next: (response: { total: number; sites: Site[] }) => {
        this.allSites = response.sites || [];
      },
      error: () => {
        this.notificationService.error('Erreur lors du chargement des sites');
      }
    });
  }

  addSite(): void {
    if (this.siteToAdd && this.selectedSites.length < 10) {
      this.selectedSites.push(this.siteToAdd);
      this.siteToAdd = null;
    }
  }

  removeSite(site: Site): void {
    this.selectedSites = this.selectedSites.filter(s => s.id !== site.id);
  }

  loadComparison(): void {
    if (this.selectedSites.length < 2) return;

    this.loading = true;
    const siteIds = this.selectedSites.map(s => s.id).join(',');

    this.api.get<any>(`/analytics/comparison`, {
      site_ids: siteIds,
      days: this.selectedPeriod
    }).subscribe({
      next: (response) => {
        this.comparisonData = response.data;
        this.loading = false;

        if (this.chartsReady) {
          setTimeout(() => this.renderChart(), 100);
        }
      },
      error: () => {
        this.notificationService.error('Erreur lors de la comparaison');
        this.loading = false;
      }
    });
  }

  renderChart(): void {
    if (!this.comparisonChartRef || !this.comparisonData?.sites.length) return;

    // Destroy previous instance
    if (this.comparisonChart) {
      this.comparisonChart.destroy();
    }

    const ctx = this.comparisonChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.comparisonData.sites.map(s => s.club_name);
    const videosData = this.comparisonData.sites.map(s => s.total_videos);
    const daysData = this.comparisonData.sites.map(s => s.days_active);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Vidéos jouées',
            data: videosData,
            backgroundColor: 'rgba(37, 99, 235, 0.8)',
            borderColor: '#2563eb',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: 'Jours actifs',
            data: daysData,
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
                if (value === null || value === undefined) return '';
                if (context.dataset.label === 'Vidéos jouées') {
                  return `${context.dataset.label}: ${value.toLocaleString()}`;
                }
                return `${context.dataset.label}: ${value} jours`;
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
            title: {
              display: true,
              text: 'Vidéos'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            max: parseInt(this.selectedPeriod),
            title: {
              display: true,
              text: 'Jours actifs'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    };

    this.comparisonChart = new Chart(ctx, config);
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  calculatePercentage(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
  }
}
