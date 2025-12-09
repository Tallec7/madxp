import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AnalyticsService } from '../../core/services/analytics.service';

interface SiteSummary {
  site_id: string;
  club_name: string;
  status: string;
  plays_today: number;
  availability_24h: number;
}

interface OverviewData {
  total_sites: number;
  online_sites: number;
  total_plays_today: number;
  total_plays_week: number;
  avg_availability: number;
  sites_summary: SiteSummary[];
}

@Component({
  selector: 'app-analytics-overview',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Analytics - Vue d'ensemble</h1>
        <div class="header-info">
          <span class="last-update" *ngIf="lastUpdate">
            Dernière mise à jour: {{ lastUpdate | date:'HH:mm:ss' }}
          </span>
        </div>
      </div>

      <!-- Global KPIs -->
      <div class="kpi-grid" *ngIf="data">
        <div class="kpi-card">
          <div class="kpi-icon online">🟢</div>
          <div class="kpi-content">
            <div class="kpi-value">{{ data.online_sites }} / {{ data.total_sites }}</div>
            <div class="kpi-label">Sites en ligne</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon">▶️</div>
          <div class="kpi-content">
            <div class="kpi-value">{{ data.total_plays_today }}</div>
            <div class="kpi-label">Lectures aujourd'hui</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon">📊</div>
          <div class="kpi-content">
            <div class="kpi-value">{{ data.total_plays_week }}</div>
            <div class="kpi-label">Lectures cette semaine</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon">✅</div>
          <div class="kpi-content">
            <div class="kpi-value">{{ data.avg_availability.toFixed(1) }}%</div>
            <div class="kpi-label">Disponibilité moyenne</div>
          </div>
        </div>
      </div>

      <!-- Sites Summary Table -->
      <div class="card">
        <h3>Résumé par site</h3>
        <table class="data-table" *ngIf="data?.sites_summary?.length; else noData">
          <thead>
            <tr>
              <th>Club</th>
              <th>Statut</th>
              <th>Lectures (24h)</th>
              <th>Disponibilité (24h)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let site of data?.sites_summary">
              <td>
                <a [routerLink]="['/sites', site.site_id]" class="club-link">
                  {{ site.club_name }}
                </a>
              </td>
              <td>
                <span class="status-badge" [class]="'status-' + site.status">
                  {{ site.status }}
                </span>
              </td>
              <td>{{ site.plays_today }}</td>
              <td>
                <div class="availability-bar">
                  <div
                    class="availability-fill"
                    [style.width.%]="site.availability_24h"
                    [class.warning]="site.availability_24h < 90"
                    [class.critical]="site.availability_24h < 50"
                  ></div>
                  <span class="availability-text">{{ site.availability_24h.toFixed(1) }}%</span>
                </div>
              </td>
              <td>
                <button
                  class="btn btn-small btn-secondary"
                  [routerLink]="['/sites', site.site_id, 'analytics']"
                >
                  Détails
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <ng-template #noData>
          <p class="no-data">Aucune donnée disponible</p>
        </ng-template>
      </div>

      <!-- Loading -->
      <div class="loading-overlay" *ngIf="loading && !data">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .last-update {
      font-size: 0.875rem;
      color: #64748b;
    }

    /* KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .kpi-icon {
      font-size: 2rem;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border-radius: 12px;
    }

    .kpi-icon.online {
      background: #ecfdf5;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .kpi-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    /* Card */
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.125rem;
      color: #0f172a;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e2e8f0;
    }

    /* Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }

    .data-table th,
    .data-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }

    .data-table th {
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #f8fafc;
    }

    .data-table td {
      color: #0f172a;
    }

    .data-table tbody tr:hover {
      background: #f8fafc;
    }

    .club-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
    }

    .club-link:hover {
      text-decoration: underline;
    }

    /* Status Badge */
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-online {
      background: #ecfdf5;
      color: #065f46;
    }

    .status-offline {
      background: #f1f5f9;
      color: #64748b;
    }

    .status-error {
      background: #fef2f2;
      color: #b91c1c;
    }

    /* Availability Bar */
    .availability-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .availability-fill {
      height: 8px;
      background: linear-gradient(90deg, #10b981, #34d399);
      border-radius: 4px;
      width: 80px;
      transition: width 0.3s;
    }

    .availability-fill.warning {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }

    .availability-fill.critical {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }

    .availability-text {
      font-size: 0.875rem;
      font-weight: 500;
      min-width: 45px;
    }

    /* Button */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .btn-small {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #cbd5e1;
    }

    /* Loading */
    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: 1rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #94a3b8;
    }

    @media (max-width: 768px) {
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class AnalyticsOverviewComponent implements OnInit, OnDestroy {
  data: OverviewData | null = null;
  loading = false;
  lastUpdate: Date | null = null;

  private readonly analyticsService = inject(AnalyticsService);
  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.loadData();

    // Auto-refresh toutes les 60 secondes
    this.refreshSubscription = interval(60000).subscribe(() => {
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    this.loading = true;
    this.analyticsService.getAnalyticsOverview().subscribe({
      next: (data) => {
        this.data = data;
        this.lastUpdate = new Date();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading analytics overview:', err);
        this.loading = false;
      }
    });
  }
}
