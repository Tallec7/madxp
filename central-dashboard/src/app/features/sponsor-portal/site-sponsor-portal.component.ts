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
import { ActivatedRoute } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SponsorAccessService, SponsorVerification, SponsorPortalStats } from '../../core/services/sponsor-access.service';

// ============================================================================
// SITE SPONSOR PORTAL COMPONENT (P5)
// Page publique accessible via magic link (/sponsor-access?token=xxx)
// Affiche les KPIs et tendances du sponsor sans authentification JWT
// ============================================================================

Chart.register(...registerables);

@Component({
  selector: 'app-site-sponsor-portal',
  standalone: true,
  imports: [CommonModule],
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
        <div class="error-icon">🔗</div>
        <h2>Lien invalide ou expiré</h2>
        <p>{{ error }}</p>
        <p class="hint">Contactez votre club pour obtenir un nouveau lien d'accès.</p>
      </div>

      <!-- Portal content -->
      <div *ngIf="!loading && !error && verification?.valid" class="portal-content">
        <!-- Header -->
        <div class="portal-header">
          <h1>📊 Statistiques de visibilité</h1>
          <div class="portal-meta">
            <span class="sponsor-name">{{ verification?.sponsor?.name }}</span>
            <span class="separator">·</span>
            <span class="club-name">{{ verification?.sponsor?.clubName }}</span>
          </div>
        </div>

        <!-- Stats loading -->
        <div *ngIf="statsLoading" class="stats-loading">
          <div class="spinner small"></div>
          <p>Chargement des données...</p>
        </div>

        <!-- KPI Cards -->
        <div *ngIf="stats" class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-value">{{ formatNumber(stats.summary.total_impressions) }}</div>
            <div class="kpi-label">Passages</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ formatNumber(stats.summary.estimated_reach) }}</div>
            <div class="kpi-label">Spectateurs estimés</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ stats.summary.active_days }}</div>
            <div class="kpi-label">Jours actifs</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">{{ formatDuration(stats.summary.total_screen_time_seconds) }}</div>
            <div class="kpi-label">Temps d'écran total</div>
          </div>
        </div>

        <!-- Trends Chart -->
        <div *ngIf="stats?.daily_trends?.length" class="chart-section">
          <h3>Tendance sur 30 jours</h3>
          <canvas #trendsCanvas width="600" height="250"></canvas>
        </div>

        <!-- Videos -->
        <div *ngIf="stats?.videos?.length" class="videos-section">
          <h3>Vidéos associées</h3>
          <div class="video-list">
            <div *ngFor="let v of stats?.videos" class="video-item">
              <span class="video-icon">🎬</span>
              <span class="video-name">{{ v.video_filename }}</span>
              <span *ngIf="v.is_primary" class="primary-badge">Principal</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="portal-actions">
          <a
            [href]="reportUrl"
            target="_blank"
            class="btn btn-primary"
            *ngIf="reportUrl"
          >
            📥 Télécharger le rapport PDF
          </a>
        </div>

        <!-- Footer -->
        <div class="portal-footer">
          <p>Propulsé par <strong>NEOPRO</strong> · Système de TV interactive pour clubs sportifs</p>
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
      max-width: 800px;
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

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .portal-error h2 {
      color: #1f2937;
      margin: 0 0 8px;
    }

    .portal-error p {
      color: #6b7280;
      margin: 4px 0;
    }

    .hint {
      font-size: 0.85rem;
      color: #9ca3af !important;
      margin-top: 16px !important;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    .spinner.small {
      width: 24px;
      height: 24px;
      border-width: 2px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .portal-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .portal-header h1 {
      font-size: 1.5rem;
      color: #1f2937;
      margin: 0 0 8px;
    }

    .portal-meta {
      color: #6b7280;
      font-size: 1rem;
    }

    .sponsor-name {
      font-weight: 600;
      color: #1e3a8a;
    }

    .separator {
      margin: 0 8px;
    }

    .stats-loading {
      text-align: center;
      padding: 40px;
      color: #6b7280;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .kpi-card {
      background: white;
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }

    .kpi-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 4px;
    }

    .kpi-label {
      font-size: 0.8rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .chart-section,
    .videos-section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }

    .chart-section h3,
    .videos-section h3 {
      font-size: 1rem;
      color: #1f2937;
      margin: 0 0 16px;
    }

    .video-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .video-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 0.85rem;
    }

    .video-name {
      flex: 1;
      color: #374151;
    }

    .primary-badge {
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .portal-actions {
      text-align: center;
      margin: 32px 0;
    }

    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
    }

    .btn-primary {
      background: #1e3a8a;
      color: white;
    }

    .btn-primary:hover {
      background: #1e40af;
    }

    .portal-footer {
      text-align: center;
      padding: 24px 0;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    .portal-footer strong {
      color: #6b7280;
    }
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
  statsLoading = false;
  reportUrl: string | null = null;

  private trendsChart: Chart | null = null;
  private token: string | null = null;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.loading = false;
      this.error = 'Aucun token fourni dans le lien.';
      this.cdr.markForCheck();
      return;
    }

    // Verify token
    this.sponsorAccessService.verifyToken(this.token).subscribe({
      next: (result) => {
        this.loading = false;
        if (result.valid) {
          this.verification = result;
          this.loadStats();
          this.reportUrl = this.sponsorAccessService.getReportUrl(this.token!);
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

  private loadStats(): void {
    if (!this.token) return;

    this.statsLoading = true;
    this.cdr.markForCheck();

    this.sponsorAccessService.getStats(this.token).subscribe({
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
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours}h${remainMinutes > 0 ? remainMinutes + 'min' : ''}`;
  }
}
