import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import {
  SponsorAccessService,
  SponsorVerification,
  SponsorPortalStats,
  SponsorPortalBenchmark,
} from '../../core/services/sponsor-access.service';

// ============================================================================
// SITE SPONSOR PORTAL COMPONENT (P5 + PoC Proof of Play)
// Page publique accessible via magic link (/sponsor-access?token=xxx)
// Affiche les KPIs, tendances, benchmark, stats par vidéo, répartition période
// ============================================================================

Chart.register(...registerables);

const PERIOD_LABELS: Record<string, string> = {
  pre_match: 'Avant-match',
  halftime: 'Mi-temps',
  post_match: 'Après-match',
  loop: 'Boucle continue',
  other: 'Autre',
};

@Component({
  selector: 'app-site-sponsor-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="portal-container">
      <!-- Loading -->
      <div *ngIf="loading" class="portal-loading">
        <div class="spinner"></div>
        <p>Chargement de vos statistiques...</p>
      </div>

      <!-- Error / Invalid token -->
      <div *ngIf="!loading && error" class="portal-error">
        <div class="error-icon">&#x1f517;</div>
        <h2>Lien invalide ou expir&eacute;</h2>
        <p>{{ error }}</p>
        <p class="hint">Contactez votre club pour obtenir un nouveau lien d'acc&egrave;s.</p>
      </div>

      <!-- Portal content -->
      <div *ngIf="!loading && !error && verification?.valid" class="portal-content">
        <!-- Header -->
        <div class="portal-header">
          <h1>Statistiques de visibilit&eacute;</h1>
          <div class="portal-meta">
            <span class="sponsor-name">{{ verification?.sponsor?.name }}</span>
            <span class="separator">&middot;</span>
            <span class="club-name">{{ verification?.sponsor?.clubName }}</span>
          </div>
        </div>

        <!-- P3: Date Picker -->
        <div class="period-picker">
          <label>P&eacute;riode :</label>
          <input type="date" [(ngModel)]="periodFrom" (change)="onPeriodChange()" />
          <span class="period-sep">au</span>
          <input type="date" [(ngModel)]="periodTo" (change)="onPeriodChange()" />
          <button class="btn btn-sm btn-outline" (click)="setPeriodPreset('30d')">30j</button>
          <button class="btn btn-sm btn-outline" (click)="setPeriodPreset('90d')">90j</button>
          <button class="btn btn-sm btn-outline" (click)="setPeriodPreset('month')">Mois en cours</button>
        </div>

        <!-- Stats loading -->
        <div *ngIf="statsLoading" class="stats-loading">
          <div class="spinner small"></div>
          <p>Chargement des donn&eacute;es...</p>
        </div>

        <!-- P1: KPI Cards (avec completion_rate) -->
        <div *ngIf="stats && !statsLoading" class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-value">{{ formatNumber(stats.summary.total_impressions) }}</div>
            <div class="kpi-label">Passages</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ stats.summary.completion_rate | number:'1.0-0' }}%</div>
            <div class="kpi-label">Taux de compl&eacute;tion</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ formatNumber(stats.summary.estimated_reach) }}</div>
            <div class="kpi-label">Spectateurs estim&eacute;s</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ stats.summary.active_days }}</div>
            <div class="kpi-label">Jours actifs</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ formatDuration(stats.summary.total_screen_time_seconds) }}</div>
            <div class="kpi-label">Temps d'&eacute;cran total</div>
          </div>
        </div>

        <!-- Trends Chart -->
        <div *ngIf="stats?.daily_trends?.length && !statsLoading" class="section-card">
          <h3>Tendance des passages</h3>
          <div class="chart-container">
            <canvas #trendsCanvas></canvas>
          </div>
        </div>

        <!-- P5: Stats par vidéo -->
        <div *ngIf="stats?.video_stats?.length && !statsLoading" class="section-card">
          <h3>Performance par vid&eacute;o</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Vid&eacute;o</th>
                <th>Passages</th>
                <th>Compl&eacute;tion</th>
                <th>Dur&eacute;e moy.</th>
                <th>Temps &eacute;cran</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let v of stats!.video_stats">
                <td class="video-name-cell">{{ v.video_filename }}</td>
                <td>{{ v.impressions }}</td>
                <td>{{ v.completion_rate | number:'1.0-0' }}%</td>
                <td>{{ formatDuration(v.avg_duration_played) }}</td>
                <td>{{ formatDuration(v.screen_time_seconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- P6: Répartition par période de match -->
        <div *ngIf="stats?.period_breakdown?.length && !statsLoading" class="section-card">
          <h3>R&eacute;partition par p&eacute;riode</h3>
          <div class="period-grid">
            <div class="period-card" *ngFor="let p of stats!.period_breakdown">
              <div class="period-label">{{ getPeriodLabel(p.period) }}</div>
              <div class="period-value">{{ p.impressions }} passages</div>
              <div class="period-sub">{{ p.completion_rate | number:'1.0-0' }}% compl&eacute;tion &middot; {{ formatDuration(p.screen_time_seconds) }}</div>
            </div>
          </div>
        </div>

        <!-- P4: Benchmark intra-club -->
        <div *ngIf="benchmark && !statsLoading" class="section-card">
          <h3>Votre position dans le club</h3>
          <p class="benchmark-subtitle">Classement des {{ benchmark.total_sponsors }} sponsors actifs</p>
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sponsor</th>
                <th>Passages</th>
                <th>Compl&eacute;tion</th>
                <th>Jours actifs</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let entry of benchmark.sponsors"
                  [class.benchmark-highlight]="entry.site_sponsor_id === benchmark!.current_sponsor_id">
                <td class="rank-cell">{{ entry.rank }}</td>
                <td>
                  {{ entry.sponsor_name }}
                  <span class="you-badge" *ngIf="entry.site_sponsor_id === benchmark!.current_sponsor_id">VOUS</span>
                </td>
                <td>{{ entry.impressions | number }}</td>
                <td>{{ entry.completion_rate | number:'1.0-0' }}%</td>
                <td>{{ entry.active_days }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="avg-row">
                <td></td>
                <td><em>Moyenne</em></td>
                <td>{{ benchmark.averages.impressions | number:'1.0-0' }}</td>
                <td>{{ benchmark.averages.completion_rate | number:'1.0-0' }}%</td>
                <td>{{ benchmark.averages.active_days | number:'1.0-0' }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Actions: PDF + CSV -->
        <div class="portal-actions" *ngIf="!statsLoading">
          <a [href]="reportUrl" target="_blank" class="btn btn-primary" *ngIf="reportUrl">
            T&eacute;l&eacute;charger le rapport PDF
          </a>
          <a [href]="csvUrl" target="_blank" class="btn btn-outline" *ngIf="csvUrl">
            Exporter en CSV
          </a>
        </div>

        <!-- Footer -->
        <div class="portal-footer">
          <p>Propuls&eacute; par <strong>NEOPRO</strong> &middot; Syst&egrave;me de TV interactive pour clubs sportifs</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f5f7fa;
    }

    .portal-container {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 16px;
    }

    .portal-loading,
    .portal-error {
      text-align: center;
      padding: 80px 24px;
    }

    .portal-error {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .error-icon { font-size: 48px; margin-bottom: 16px; }
    .portal-error h2 { color: #1f2937; margin: 0 0 8px; }
    .portal-error p { color: #6b7280; margin: 4px 0; }
    .hint { font-size: 0.85rem; color: #9ca3af !important; margin-top: 16px !important; }

    .spinner {
      width: 40px; height: 40px;
      border: 3px solid #e5e7eb; border-top-color: #3b82f6;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    .spinner.small { width: 24px; height: 24px; border-width: 2px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .portal-header { text-align: center; margin-bottom: 24px; }
    .portal-header h1 { font-size: 1.5rem; color: #1f2937; margin: 0 0 8px; }
    .portal-meta { color: #6b7280; font-size: 1rem; }
    .sponsor-name { font-weight: 600; color: #1e3a8a; }
    .separator { margin: 0 8px; }

    /* P3: Date Picker */
    .period-picker {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; margin-bottom: 24px; flex-wrap: wrap;
    }
    .period-picker label { font-size: 0.85rem; color: #6b7280; font-weight: 500; }
    .period-picker input[type="date"] {
      padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 0.85rem; color: #374151;
    }
    .period-sep { font-size: 0.85rem; color: #9ca3af; }

    .stats-loading { text-align: center; padding: 40px; color: #6b7280; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin-bottom: 24px;
    }

    .kpi-card {
      background: white; border-radius: 12px; padding: 20px 14px;
      text-align: center; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }
    .kpi-value { font-size: 1.6rem; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; }
    .kpi-label {
      font-size: 0.75rem; color: #6b7280;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    .section-card {
      background: white; border-radius: 12px; padding: 24px;
      margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }
    .section-card h3 { font-size: 1rem; color: #1f2937; margin: 0 0 16px; }
    .chart-container { position: relative; height: 250px; width: 100%; }

    /* Data tables */
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 0.85rem;
    }
    .data-table th {
      text-align: left; padding: 8px 10px;
      border-bottom: 2px solid #e5e7eb; color: #6b7280;
      font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.3px;
    }
    .data-table td { padding: 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    .video-name-cell {
      max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Benchmark */
    .benchmark-subtitle { font-size: 0.8rem; color: #9ca3af; margin: -8px 0 12px; }
    .benchmark-highlight { background: #eff6ff; }
    .rank-cell { font-weight: 700; color: #1e3a8a; width: 30px; }
    .you-badge {
      background: #1e3a8a; color: white; padding: 1px 6px;
      border-radius: 3px; font-size: 0.65rem; font-weight: 700;
      margin-left: 6px; vertical-align: middle;
    }
    .avg-row td { font-style: italic; color: #9ca3af; border-top: 2px solid #e5e7eb; }

    /* Period breakdown */
    .period-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .period-card {
      background: #f9fafb; border-radius: 8px; padding: 16px;
      text-align: center;
    }
    .period-label { font-size: 0.8rem; font-weight: 600; color: #1e3a8a; margin-bottom: 6px; }
    .period-value { font-size: 1.1rem; font-weight: 700; color: #1f2937; }
    .period-sub { font-size: 0.75rem; color: #9ca3af; margin-top: 4px; }

    /* Actions */
    .portal-actions { text-align: center; margin: 28px 0; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
    .btn {
      display: inline-block; padding: 10px 20px; border-radius: 8px;
      font-weight: 600; text-decoration: none; cursor: pointer;
      font-size: 0.85rem; transition: background 0.2s; border: none;
    }
    .btn-sm { padding: 4px 10px; font-size: 0.8rem; border-radius: 5px; }
    .btn-primary { background: #1e3a8a; color: white; }
    .btn-primary:hover { background: #1e40af; }
    .btn-outline {
      background: white; color: #1e3a8a;
      border: 1px solid #1e3a8a;
    }
    .btn-outline:hover { background: #eff6ff; }

    .portal-footer { text-align: center; padding: 24px 0; color: #9ca3af; font-size: 0.8rem; }
    .portal-footer strong { color: #6b7280; }
  `],
})
export class SiteSponsorPortalComponent implements OnInit, OnDestroy {
  @ViewChild('trendsCanvas') trendsCanvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly sponsorAccessService = inject(SponsorAccessService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = true;
  error: string | null = null;
  verification: SponsorVerification | null = null;
  stats: SponsorPortalStats | null = null;
  benchmark: SponsorPortalBenchmark | null = null;
  statsLoading = false;
  reportUrl: string | null = null;
  csvUrl: string | null = null;

  // P3: Period selector
  periodFrom = '';
  periodTo = '';

  private trendsChart: Chart | null = null;
  private token: string | null = null;

  ngOnInit(): void {
    // Default period: last 30 days
    this.periodTo = new Date().toISOString().split('T')[0];
    this.periodFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.loading = false;
      this.error = 'Aucun token fourni dans le lien.';
      this.cdr.markForCheck();
      return;
    }

    this.sponsorAccessService.verifyToken(this.token).subscribe({
      next: (result) => {
        this.loading = false;
        if (result.valid) {
          this.verification = result;
          this.loadAllData();
        } else {
          this.error = result.error || 'Lien invalide ou expiré';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = 'Ce lien n\'est plus valide ou a expiré. Contactez votre club pour en obtenir un nouveau.';
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  // P3: Period change handler
  onPeriodChange(): void {
    if (this.periodFrom && this.periodTo && this.periodFrom <= this.periodTo) {
      this.loadAllData();
    }
  }

  setPeriodPreset(preset: string): void {
    const now = new Date();
    this.periodTo = now.toISOString().split('T')[0];

    if (preset === '30d') {
      this.periodFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    } else if (preset === '90d') {
      this.periodFrom = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    } else if (preset === 'month') {
      this.periodFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }

    this.loadAllData();
  }

  private loadAllData(): void {
    if (!this.token) return;

    this.statsLoading = true;
    this.cdr.markForCheck();

    // Update download URLs with current period
    this.reportUrl = this.sponsorAccessService.getReportUrl(this.token, this.periodFrom, this.periodTo);
    this.csvUrl = this.sponsorAccessService.getCsvUrl(this.token, this.periodFrom, this.periodTo);

    // Load stats + benchmark in parallel
    this.sponsorAccessService.getStats(this.token, this.periodFrom, this.periodTo).subscribe({
      next: (data) => {
        this.stats = data;
        this.statsLoading = false;
        this.cdr.markForCheck();
        setTimeout(() => this.renderTrendsChart(), 50);
      },
      error: () => {
        this.statsLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.sponsorAccessService.getBenchmark(this.token, this.periodFrom, this.periodTo).subscribe({
      next: (data) => {
        this.benchmark = data;
        this.cdr.markForCheck();
      },
      error: () => {
        this.benchmark = null;
        this.cdr.markForCheck();
      },
    });
  }

  getPeriodLabel(period: string): string {
    return PERIOD_LABELS[period] || period;
  }

  private renderTrendsChart(): void {
    if (!this.trendsCanvasRef || !this.stats?.daily_trends?.length) return;
    this.destroyChart();

    const trends = this.stats.daily_trends;
    const labels = trends.map(t => {
      const d = new Date(t.date);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
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
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { maxRotation: 45 } },
        },
      },
    };

    this.trendsChart = new Chart(ctx, config);
    this.cdr.markForCheck();
  }

  private destroyChart(): void {
    if (this.trendsChart) {
      this.trendsChart.destroy();
      this.trendsChart = null;
    }
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds < 1) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours}h${remainMinutes > 0 ? remainMinutes + 'min' : ''}`;
  }
}
