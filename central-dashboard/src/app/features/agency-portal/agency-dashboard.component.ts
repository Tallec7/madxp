import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AgencyPortalService, AgencyDashboard, AgencySite } from '../../core/services/agency-portal.service';

@Component({
  selector: 'app-agency-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-container">
      <div class="header">
        <div class="agency-info" *ngIf="dashboard?.agency">
          <img *ngIf="dashboard?.agency?.logo_url"
               [src]="dashboard?.agency?.logo_url"
               [alt]="dashboard?.agency?.name"
               class="agency-logo">
          <div>
            <h1>{{ dashboard?.agency?.name }}</h1>
            <span class="badge" [class]="'badge-' + dashboard?.agency?.status">
              {{ dashboard?.agency?.status }}
            </span>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-header">
            <h3>Total Sites</h3>
            <span class="stat-icon">🖥️</span>
          </div>
          <div class="stat-value">{{ dashboard?.stats?.total_sites || 0 }}</div>
          <div class="stat-footer">Sites gérés</div>
        </div>

        <div class="stat-card stat-success">
          <div class="stat-header">
            <h3>En ligne</h3>
            <span class="stat-icon">✅</span>
          </div>
          <div class="stat-value">{{ dashboard?.stats?.online_sites || 0 }}</div>
          <div class="stat-footer">Sites connectés</div>
        </div>

        <div class="stat-card stat-secondary">
          <div class="stat-header">
            <h3>Hors ligne</h3>
            <span class="stat-icon">⚪</span>
          </div>
          <div class="stat-value">{{ dashboard?.stats?.offline_sites || 0 }}</div>
          <div class="stat-footer">Sites déconnectés</div>
        </div>

        <div class="stat-card stat-info">
          <div class="stat-header">
            <h3>Vidéos jouées</h3>
            <span class="stat-icon">🎬</span>
          </div>
          <div class="stat-value">{{ formatNumber(dashboard?.stats?.total_videos_played_30d) }}</div>
          <div class="stat-footer">30 derniers jours</div>
        </div>
      </div>

      <div class="content-grid">
        <div class="card sites-card">
          <div class="card-header">
            <h2>📍 Vos sites</h2>
          </div>
          <div class="sites-list">
            <div *ngFor="let site of sites" class="site-item" [routerLink]="['/agency/sites', site.site_id]">
              <span class="site-status" [class]="'status-' + site.status">●</span>
              <div class="site-info">
                <div class="site-name">{{ site.club_name }}</div>
                <div class="site-meta">
                  <span>{{ site.site_name }}</span>
                  <span class="separator">•</span>
                  <span>v{{ site.software_version || '?' }}</span>
                </div>
              </div>
              <div class="site-stats">
                <div class="stat-mini">
                  <span class="stat-label">Vidéos</span>
                  <span class="stat-num">{{ site.videos_played_30d }}</span>
                </div>
              </div>
              <span class="badge" [class]="'badge-' + site.status">{{ site.status }}</span>
            </div>
            <div *ngIf="sites.length === 0" class="empty-state">
              <p>Aucun site associé à votre agence</p>
            </div>
          </div>
        </div>

        <div class="card alerts-card">
          <div class="card-header">
            <h2>🚨 Alertes récentes</h2>
          </div>
          <div class="alerts-list">
            <div *ngFor="let alert of dashboard?.recent_alerts" class="alert-item" [class]="'alert-' + alert.severity">
              <div class="alert-icon">
                <span *ngIf="alert.severity === 'critical'">🔴</span>
                <span *ngIf="alert.severity === 'warning'">🟠</span>
                <span *ngIf="alert.severity === 'info'">🔵</span>
              </div>
              <div class="alert-info">
                <div class="alert-site">{{ alert.site_name }}</div>
                <div class="alert-message">{{ alert.message }}</div>
                <div class="alert-time">{{ formatDateTime(alert.created_at) }}</div>
              </div>
            </div>
            <div *ngIf="!dashboard?.recent_alerts?.length" class="empty-state">
              <p>✅ Aucune alerte active</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card status-overview">
        <h2>📊 Vue d'ensemble</h2>
        <div class="status-bars">
          <div class="status-bar-item">
            <div class="status-bar-label">
              <span>En ligne</span>
              <span>{{ dashboard?.stats?.online_sites || 0 }} / {{ dashboard?.stats?.total_sites || 0 }}</span>
            </div>
            <div class="status-bar">
              <div class="status-bar-fill success"
                   [style.width.%]="getPercentage(dashboard?.stats?.online_sites, dashboard?.stats?.total_sites)">
              </div>
            </div>
          </div>
          <div class="status-bar-item">
            <div class="status-bar-label">
              <span>Hors ligne</span>
              <span>{{ dashboard?.stats?.offline_sites || 0 }} / {{ dashboard?.stats?.total_sites || 0 }}</span>
            </div>
            <div class="status-bar">
              <div class="status-bar-fill secondary"
                   [style.width.%]="getPercentage(dashboard?.stats?.offline_sites, dashboard?.stats?.total_sites)">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      margin-bottom: 2rem;
    }

    .agency-info {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .agency-logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 12px;
      background: white;
      padding: 0.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #2563eb;
    }

    .stat-card.stat-success { border-left-color: #10b981; }
    .stat-card.stat-secondary { border-left-color: #64748b; }
    .stat-card.stat-info { border-left-color: #0ea5e9; }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .stat-header h3 {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }

    .stat-icon { font-size: 1.5rem; }
    .stat-value {
      font-size: 2.25rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-footer {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.5rem;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1024px) {
      .content-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card-header {
      margin-bottom: 1.5rem;
    }

    .card h2 {
      font-size: 1.25rem;
      margin: 0;
      color: #0f172a;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .site-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .site-item:hover {
      background: #f1f5f9;
      transform: translateX(4px);
    }

    .site-status { font-size: 0.75rem; }
    .status-online { color: #10b981; }
    .status-offline { color: #64748b; }
    .status-error { color: #ef4444; }

    .site-info { flex: 1; }
    .site-name {
      font-weight: 600;
      color: #0f172a;
    }

    .site-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .separator { margin: 0 0.5rem; }

    .stat-mini { text-align: right; }
    .stat-label {
      display: block;
      font-size: 0.65rem;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .stat-num {
      font-weight: 700;
      color: #0f172a;
    }

    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .alert-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: #fef2f2;
    }

    .alert-item.alert-warning { background: #fefce8; }
    .alert-item.alert-info { background: #eff6ff; }

    .alert-icon { font-size: 1.25rem; }
    .alert-info { flex: 1; }
    .alert-site {
      font-weight: 600;
      font-size: 0.875rem;
      color: #0f172a;
    }
    .alert-message {
      font-size: 0.75rem;
      color: #64748b;
      margin: 0.25rem 0;
    }
    .alert-time {
      font-size: 0.65rem;
      color: #94a3b8;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .status-overview h2 {
      margin-bottom: 1.5rem;
    }

    .status-bars {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .status-bar-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .status-bar-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      color: #64748b;
    }

    .status-bar {
      height: 24px;
      background: #f1f5f9;
      border-radius: 12px;
      overflow: hidden;
    }

    .status-bar-fill {
      height: 100%;
      border-radius: 12px;
      transition: width 0.3s ease;
    }

    .status-bar-fill.success { background: #10b981; }
    .status-bar-fill.secondary { background: #64748b; }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-active, .badge-online { background: #dcfce7; color: #166534; }
    .badge-inactive, .badge-offline { background: #f1f5f9; color: #475569; }
    .badge-suspended, .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-maintenance { background: #fef3c7; color: #92400e; }
  `]
})
export class AgencyDashboardComponent implements OnInit {
  private readonly agencyService = inject(AgencyPortalService);

  dashboard: AgencyDashboard | null = null;
  sites: AgencySite[] = [];

  ngOnInit(): void {
    this.loadDashboard();
    this.loadSites();
  }

  loadDashboard(): void {
    this.agencyService.getDashboard().subscribe({
      next: (response) => this.dashboard = response.data,
      error: (err) => console.error('Error loading dashboard:', err)
    });
  }

  loadSites(): void {
    this.agencyService.getSites().subscribe({
      next: (response) => this.sites = response.data.sites,
      error: (err) => console.error('Error loading sites:', err)
    });
  }

  formatNumber(value: number | undefined): string {
    if (!value) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  }

  formatDateTime(date: Date | string): string {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getPercentage(value: number | undefined, total: number | undefined): number {
    if (!value || !total) return 0;
    return (value / total) * 100;
  }
}
