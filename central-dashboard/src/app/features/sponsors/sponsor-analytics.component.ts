import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ApiService } from '../../core/services/api.service';

// Register Chart.js components
Chart.register(...registerables);

interface AnalyticsSummary {
  total_impressions: number;
  total_screen_time: number;
  avg_watch_duration: number;
  completion_rate: number;
  unique_sites: number;
  unique_videos: number;
}

interface VideoPerformance {
  video_id: string;
  video_title: string;
  impressions: number;
  total_screen_time: number;
  completion_rate: number;
  avg_watch_duration: number;
}

interface SitePerformance {
  site_id: string;
  site_name: string;
  impressions: number;
  total_screen_time: number;
  unique_videos: number;
}

interface DailyTrend {
  date: string;
  impressions: number;
  screen_time: number;
  completed_views: number;
}

interface Distribution {
  label: string;
  value: number;
  percentage: number;
}

@Component({
  selector: 'app-sponsor-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="analytics-container">
      <!-- Header -->
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          ← Retour au sponsor
        </button>

        <div class="header-content">
          <div class="title-section">
            <h1>📊 Analytics - {{ sponsorName }}</h1>
            <p class="subtitle">{{ periodLabel }}</p>
          </div>

          <div class="header-actions">
            <select class="period-select" [(ngModel)]="selectedPeriod" (change)="onPeriodChange()">
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">3 mois</option>
              <option value="custom">Période personnalisée</option>
            </select>

            <button class="btn btn-secondary" (click)="exportCSV()" [disabled]="exporting">
              {{ exporting ? 'Export...' : '📄 Export CSV' }}
            </button>

            <button class="btn btn-primary" (click)="downloadPDF()" [disabled]="generatingPDF">
              {{ generatingPDF ? 'Génération...' : '📥 Rapport PDF' }}
            </button>
          </div>
        </div>

        <!-- Custom Date Range -->
        <div class="custom-range" *ngIf="selectedPeriod === 'custom'">
          <div class="date-inputs">
            <div class="input-group">
              <label>Du :</label>
              <input type="date" [(ngModel)]="customFrom" (change)="loadAnalytics()"/>
            </div>
            <div class="input-group">
              <label>Au :</label>
              <input type="date" [(ngModel)]="customTo" (change)="loadAnalytics()"/>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement des analytics...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-message">
        <p>❌ {{ error }}</p>
        <button class="btn btn-primary" (click)="loadAnalytics()">Réessayer</button>
      </div>

      <!-- Analytics Content -->
      <div *ngIf="!loading && !error && summary" class="analytics-content">

        <!-- KPIs Cards -->
        <div class="kpis-grid">
          <div class="kpi-card">
            <div class="kpi-icon">👁️</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ summary.total_impressions?.toLocaleString() || 0 }}</span>
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
              <span class="kpi-value">{{ summary.completion_rate?.toFixed(1) || 0 }}%</span>
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

        <!-- Charts Row 1: Trends + Period Distribution -->
        <div class="charts-row">
          <div class="chart-card chart-large">
            <h3>📈 Tendances quotidiennes</h3>
            <canvas #trendsChart></canvas>
          </div>

          <div class="chart-card">
            <h3>🕐 Répartition par période</h3>
            <canvas #periodChart></canvas>
          </div>
        </div>

        <!-- Charts Row 2: Event Type + Top Videos Table -->
        <div class="charts-row">
          <div class="chart-card">
            <h3>🏆 Type d'événement</h3>
            <canvas #eventChart></canvas>
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
                    <td>{{ video.impressions?.toLocaleString() }}</td>
                    <td>{{ formatDuration(video.total_screen_time) }}</td>
                    <td>
                      <span class="completion-badge" [class.high]="video.completion_rate >= 80">
                        {{ video.completion_rate?.toFixed(0) }}%
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
                    <td>{{ site.impressions?.toLocaleString() }}</td>
                    <td>{{ formatDuration(site.total_screen_time) }}</td>
                    <td>{{ site.unique_videos }}</td>
                    <td>
                      <div class="progress-bar">
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
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;
      background: #f9fafb;
      min-height: 100vh;
    }

    /* Header */
    .header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.95rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
      transition: color 0.2s;
    }

    .back-btn:hover {
      color: #111827;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
      margin-bottom: 1rem;
    }

    .title-section h1 {
      margin: 0 0 0.25rem 0;
      font-size: 2rem;
      color: #111827;
    }

    .subtitle {
      margin: 0;
      color: #6b7280;
      font-size: 0.95rem;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .period-select {
      padding: 0.625rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
      background: white;
      cursor: pointer;
    }

    .custom-range {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
    }

    .date-inputs {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }

    .input-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .input-group label {
      font-size: 0.9rem;
      color: #6b7280;
      font-weight: 500;
    }

    .input-group input[type="date"] {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.9rem;
    }

    /* KPIs Grid */
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

    /* Charts */
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

    /* Tables */
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

    /* Progress Bar */
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

    /* Buttons */
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
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

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Loading & Error */
    .loading, .error-message {
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

    .error-message {
      color: #ef4444;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .chart-card.chart-large {
        grid-column: span 1;
      }
    }

    @media (max-width: 768px) {
      .analytics-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
      }

      .header-actions {
        flex-wrap: wrap;
        width: 100%;
      }

      .period-select, .btn {
        flex: 1;
      }

      .kpis-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .charts-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SponsorAnalyticsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendsChart') trendsChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('periodChart') periodChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('eventChart') eventChart!: ElementRef<HTMLCanvasElement>;

  sponsorId: string = '';
  sponsorName: string = '';

  summary: AnalyticsSummary | null = null;
  topVideos: VideoPerformance[] = [];
  topSites: SitePerformance[] = [];
  dailyTrends: DailyTrend[] = [];
  periodDistribution: Distribution[] = [];
  eventDistribution: Distribution[] = [];

  selectedPeriod: string = '30';
  customFrom: string = '';
  customTo: string = '';
  periodLabel: string = '';

  loading = false;
  error = '';
  exporting = false;
  generatingPDF = false;
  chartsReady = false;

  private trendsChartInstance: Chart | null = null;
  private periodChartInstance: Chart | null = null;
  private eventChartInstance: Chart | null = null;

  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadAnalytics();
  }

  ngAfterViewInit() {
    this.chartsReady = true;
    // Charts will be rendered after data is loaded
  }

  loadAnalytics() {
    this.loading = true;
    this.error = '';

    const { from, to } = this.getDateRange();
    this.updatePeriodLabel(from, to);

    this.api.get<any>(`/analytics/sponsors/${this.sponsorId}/stats`, {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    }).subscribe({
      next: (data) => {
        // Store sponsor name
        this.sponsorName = data.data.sponsor_name || 'Sponsor';

        // Store analytics data
        this.summary = data.data.summary;
        this.topVideos = data.data.by_video?.slice(0, 10) || [];
        this.topSites = data.data.by_site?.slice(0, 20) || [];
        this.dailyTrends = data.data.trends || [];
        this.periodDistribution = this.formatDistribution(data.data.by_period);
        this.eventDistribution = this.formatDistribution(data.data.by_event);

        // Render charts after data is loaded (wait for view to be ready)
        if (this.chartsReady) {
          setTimeout(() => this.renderCharts(), 100);
        }
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des analytics';
        console.error('Error loading sponsor data:', err);
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  getDateRange(): { from: Date; to: Date } {
    const to = new Date();
    let from = new Date();

    if (this.selectedPeriod === 'custom') {
      if (this.customFrom && this.customTo) {
        from = new Date(this.customFrom);
        to.setTime(new Date(this.customTo).getTime());
      }
    } else {
      const days = parseInt(this.selectedPeriod);
      from.setDate(to.getDate() - days);
    }

    return { from, to };
  }

  updatePeriodLabel(from: Date, to: Date) {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const fromStr = from.toLocaleDateString('fr-FR', options);
    const toStr = to.toLocaleDateString('fr-FR', options);
    this.periodLabel = `${fromStr} - ${toStr}`;
  }

  formatDistribution(data: any[]): Distribution[] {
    if (!data || data.length === 0) return [];

    const total = data.reduce((sum, item) => sum + (item.impressions || 0), 0);

    return data.map(item => ({
      label: this.formatLabel(item.period || item.event_type || 'Unknown'),
      value: item.impressions || 0,
      percentage: total > 0 ? ((item.impressions || 0) / total) * 100 : 0
    }));
  }

  formatLabel(key: string): string {
    const labels: Record<string, string> = {
      pre_match: 'Avant-match',
      halftime: 'Mi-temps',
      post_match: 'Après-match',
      loop: 'Boucle',
      match: 'Match',
      training: 'Entraînement',
      tournament: 'Tournoi',
      other: 'Autre'
    };
    return labels[key] || key;
  }

  renderCharts() {
    this.renderTrendsChart();
    this.renderPeriodChart();
    this.renderEventChart();
  }

  renderTrendsChart() {
    if (!this.trendsChart || !this.dailyTrends.length) return;

    // Destroy previous instance
    if (this.trendsChartInstance) {
      this.trendsChartInstance.destroy();
    }

    const ctx = this.trendsChart.nativeElement.getContext('2d');
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

  renderPeriodChart() {
    if (!this.periodChart || !this.periodDistribution.length) return;

    // Destroy previous instance
    if (this.periodChartInstance) {
      this.periodChartInstance.destroy();
    }

    const ctx = this.periodChart.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: this.periodDistribution.map(d => d.label),
        datasets: [{
          data: this.periodDistribution.map(d => d.value),
          backgroundColor: [
            '#3b82f6', // Pre-match (blue)
            '#10b981', // Halftime (green)
            '#f59e0b', // Post-match (orange)
            '#8b5cf6'  // Loop (purple)
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
                const total = context.dataset.data.reduce((a: number, b: any) => a + (b as number), 0);
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

  renderEventChart() {
    if (!this.eventChart || !this.eventDistribution.length) return;

    // Destroy previous instance
    if (this.eventChartInstance) {
      this.eventChartInstance.destroy();
    }

    const ctx = this.eventChart.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: this.eventDistribution.map(d => d.label),
        datasets: [{
          data: this.eventDistribution.map(d => d.value),
          backgroundColor: [
            '#ef4444', // Match (red)
            '#3b82f6', // Training (blue)
            '#f59e0b', // Tournament (orange)
            '#6b7280'  // Other (gray)
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
                const total = context.dataset.data.reduce((a: number, b: any) => a + (b as number), 0);
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

  onPeriodChange() {
    if (this.selectedPeriod !== 'custom') {
      this.loadAnalytics();
    }
  }

  exportCSV() {
    this.exporting = true;
    const { from, to } = this.getDateRange();

    this.api.get<any>(`/analytics/sponsors/${this.sponsorId}/export`, {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      format: 'csv'
    }).subscribe({
      next: (blob: any) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sponsor-${this.sponsorId}-${from.toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        alert('Erreur lors de l\'export');
        console.error('Export error:', err);
      },
      complete: () => {
        this.exporting = false;
      }
    });
  }

  downloadPDF() {
    this.generatingPDF = true;
    const { from, to } = this.getDateRange();

    this.api.get<any>(`/analytics/sponsors/${this.sponsorId}/report/pdf`, {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    }).subscribe({
      next: (blob: any) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport-sponsor-${this.sponsorId}-${from.toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        alert('Erreur lors de la génération du PDF');
        console.error('PDF error:', err);
      },
      complete: () => {
        this.generatingPDF = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/sponsors', this.sponsorId]);
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

  ngOnDestroy() {
    // Cleanup chart instances
    if (this.trendsChartInstance) {
      this.trendsChartInstance.destroy();
    }
    if (this.periodChartInstance) {
      this.periodChartInstance.destroy();
    }
    if (this.eventChartInstance) {
      this.eventChartInstance.destroy();
    }
  }
}
