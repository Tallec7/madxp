import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { SitesService } from '../../core/services/sites.service';
import { FleetHealthData, FleetHealthSite } from '../../core/models';

@Component({
  selector: 'app-fleet-health',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="fleet-health-container">
      <div class="page-header">
        <h1>🏥 Santé de la Flotte</h1>
        <p class="subtitle">Vue d'ensemble de l'état de vos {{ stats.total }} boîtiers</p>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card stat-primary">
          <div class="stat-icon">🖥️</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">Sites Total</div>
          </div>
        </div>

        <div class="stat-card stat-success" [routerLink]="['/sites']" [queryParams]="{status: 'online'}">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.online }}</div>
            <div class="stat-label">En ligne</div>
            <div class="stat-percent">{{ getPercentage(stats.online) }}%</div>
          </div>
        </div>

        <div class="stat-card stat-warning" [routerLink]="['/sites']" [queryParams]="{status: 'warning'}">
          <div class="stat-icon">⚠️</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.warning }}</div>
            <div class="stat-label">Instables</div>
            <div class="stat-percent">{{ getPercentage(stats.warning) }}%</div>
          </div>
        </div>

        <div class="stat-card stat-danger" [routerLink]="['/sites']" [queryParams]="{status: 'offline'}">
          <div class="stat-icon">❌</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.offline }}</div>
            <div class="stat-label">Hors ligne</div>
            <div class="stat-percent">{{ getPercentage(stats.offline) }}%</div>
          </div>
        </div>
      </div>

      <!-- Main Content Grid -->
      <div class="content-grid">
        <!-- Health Metrics Card -->
        <div class="card metrics-card">
          <h2>📊 Métriques Moyennes</h2>
          <div class="metrics-grid">
            <div class="metric-item">
              <div class="metric-header">
                <span class="metric-icon">🔥</span>
                <span class="metric-label">CPU</span>
              </div>
              <div class="metric-bar">
                <div class="metric-fill"
                     [class.good]="health.avg_cpu < 50"
                     [class.warning]="health.avg_cpu >= 50 && health.avg_cpu < 80"
                     [class.danger]="health.avg_cpu >= 80"
                     [style.width.%]="health.avg_cpu"></div>
              </div>
              <div class="metric-value">{{ health.avg_cpu | number:'1.0-0' }}%</div>
            </div>

            <div class="metric-item">
              <div class="metric-header">
                <span class="metric-icon">💾</span>
                <span class="metric-label">RAM</span>
              </div>
              <div class="metric-bar">
                <div class="metric-fill"
                     [class.good]="health.avg_memory < 60"
                     [class.warning]="health.avg_memory >= 60 && health.avg_memory < 85"
                     [class.danger]="health.avg_memory >= 85"
                     [style.width.%]="health.avg_memory"></div>
              </div>
              <div class="metric-value">{{ health.avg_memory | number:'1.0-0' }}%</div>
            </div>

            <div class="metric-item">
              <div class="metric-header">
                <span class="metric-icon">🌡️</span>
                <span class="metric-label">Température</span>
              </div>
              <div class="metric-bar">
                <div class="metric-fill"
                     [class.good]="health.avg_temperature < 60"
                     [class.warning]="health.avg_temperature >= 60 && health.avg_temperature < 75"
                     [class.danger]="health.avg_temperature >= 75"
                     [style.width.%]="health.avg_temperature"></div>
              </div>
              <div class="metric-value">{{ health.avg_temperature | number:'1.0-0' }}°C</div>
            </div>
          </div>

          <!-- Alerts Summary -->
          <div class="alerts-summary" *ngIf="health.sites_high_temp > 0 || health.sites_low_disk > 0">
            <h3>⚠️ Alertes Actives</h3>
            <div class="alert-items">
              <div class="alert-item danger" *ngIf="health.sites_high_temp > 0">
                <span class="alert-icon">🔥</span>
                <span>{{ health.sites_high_temp }} site(s) en surchauffe (&gt;75°C)</span>
              </div>
              <div class="alert-item warning" *ngIf="health.sites_low_disk > 0">
                <span class="alert-icon">💽</span>
                <span>{{ health.sites_low_disk }} site(s) disque faible (&lt;10%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Version Distribution -->
        <div class="card versions-card">
          <h2>📦 Distribution des Versions</h2>
          <div class="versions-list">
            <div class="version-item" *ngFor="let v of versionDistribution">
              <div class="version-header">
                <span class="version-name">v{{ v.version }}</span>
                <span class="version-count">{{ v.count }} site(s)</span>
              </div>
              <div class="version-bar">
                <div class="version-fill" [style.width.%]="v.percentage"></div>
              </div>
            </div>
            <div class="empty-state" *ngIf="versionDistribution.length === 0">
              <p>Aucune donnée de version disponible</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sites At Risk -->
      <div class="card at-risk-card" *ngIf="atRiskSites.length > 0">
        <h2>🚨 Sites à Surveiller</h2>
        <p class="card-subtitle">Sites nécessitant une attention particulière</p>

        <div class="sites-table">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Statut</th>
                <th>Dernière connexion</th>
                <th>CPU</th>
                <th>Temp</th>
                <th>Raison</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let site of atRiskSites" [class]="'status-' + site.displayStatus">
                <td class="site-name">
                  <strong>{{ site.clubName }}</strong>
                  <span class="site-location" *ngIf="site.location?.city">{{ site.location?.city }}</span>
                </td>
                <td>
                  <span class="status-badge" [class]="'badge-' + site.displayStatus">
                    {{ getStatusLabel(site.displayStatus) }}
                  </span>
                </td>
                <td>{{ formatLastSeen(site.secondsSinceLastSeen) }}</td>
                <td [class.danger]="(site.metrics?.cpu_percent || 0) > 80">
                  {{ site.metrics?.cpu_percent ?? '-' }}%
                </td>
                <td [class.danger]="(site.metrics?.temperature || 0) > 75">
                  {{ site.metrics?.temperature ?? '-' }}°C
                </td>
                <td>
                  <span class="risk-reason">{{ getRiskReason(site) }}</span>
                </td>
                <td>
                  <a [routerLink]="['/sites', site.id]" class="btn btn-sm">
                    Voir →
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- All Sites Map Placeholder -->
      <div class="card map-card">
        <h2>🗺️ Répartition Géographique</h2>
        <div class="map-placeholder">
          <div class="map-legend">
            <div class="legend-item">
              <span class="legend-dot online"></span>
              <span>En ligne ({{ stats.online }})</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot warning"></span>
              <span>Instable ({{ stats.warning }})</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot offline"></span>
              <span>Hors ligne ({{ stats.offline }})</span>
            </div>
          </div>
          <div class="sites-by-region">
            <div class="region-item" *ngFor="let region of sitesByRegion">
              <div class="region-name">{{ region.name }}</div>
              <div class="region-stats">
                <span class="online">{{ region.online }}</span>
                <span class="separator">/</span>
                <span class="total">{{ region.total }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card actions-card">
        <h2>⚡ Actions Rapides</h2>
        <div class="actions-grid">
          <button class="action-btn" [routerLink]="['/sites']" [queryParams]="{status: 'offline'}">
            <span class="action-icon">🔌</span>
            <span class="action-label">Sites Offline</span>
            <span class="action-count" *ngIf="stats.offline > 0">{{ stats.offline }}</span>
          </button>
          <button class="action-btn" [routerLink]="['/updates']">
            <span class="action-icon">🔄</span>
            <span class="action-label">Mises à jour</span>
          </button>
          <button class="action-btn" [routerLink]="['/subscriptions']">
            <span class="action-icon">💳</span>
            <span class="action-label">Abonnements</span>
          </button>
          <button class="action-btn" (click)="refreshData()">
            <span class="action-icon">🔃</span>
            <span class="action-label">Actualiser</span>
          </button>
        </div>
      </div>

      <!-- Last Update -->
      <div class="last-update">
        Dernière mise à jour : {{ lastUpdate | date:'HH:mm:ss' }}
        <span class="auto-refresh">(actualisation auto toutes les 30s)</span>
      </div>
    </div>
  `,
  styles: [`
    .fleet-health-container {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 2rem;
    }

    .page-header h1 {
      font-size: 2rem;
      color: #0f172a;
      margin: 0 0 0.5rem 0;
    }

    .subtitle {
      color: #64748b;
      margin: 0;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1200px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 600px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: all 0.2s;
      cursor: pointer;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .stat-icon {
      font-size: 2.5rem;
      width: 60px;
      height: 60px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-primary .stat-icon { background: #eff6ff; }
    .stat-success .stat-icon { background: #f0fdf4; }
    .stat-warning .stat-icon { background: #fffbeb; }
    .stat-danger .stat-icon { background: #fef2f2; }

    .stat-content {
      flex: 1;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    .stat-percent {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* Content Grid */
    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Cards */
    .card {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 1.5rem;
    }

    .card h2 {
      font-size: 1.25rem;
      color: #0f172a;
      margin: 0 0 1rem 0;
    }

    .card-subtitle {
      color: #64748b;
      font-size: 0.875rem;
      margin: -0.5rem 0 1rem 0;
    }

    /* Metrics */
    .metrics-grid {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .metric-item {
      display: grid;
      grid-template-columns: 120px 1fr 50px;
      align-items: center;
      gap: 1rem;
    }

    .metric-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .metric-icon {
      font-size: 1.25rem;
    }

    .metric-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    .metric-bar {
      height: 12px;
      background: #f1f5f9;
      border-radius: 6px;
      overflow: hidden;
    }

    .metric-fill {
      height: 100%;
      border-radius: 6px;
      transition: width 0.3s ease;
    }

    .metric-fill.good { background: #10b981; }
    .metric-fill.warning { background: #f59e0b; }
    .metric-fill.danger { background: #ef4444; }

    .metric-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #0f172a;
      text-align: right;
    }

    /* Alerts */
    .alerts-summary {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .alerts-summary h3 {
      font-size: 1rem;
      margin: 0 0 1rem 0;
      color: #0f172a;
    }

    .alert-items {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .alert-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .alert-item.danger {
      background: #fef2f2;
      color: #dc2626;
    }

    .alert-item.warning {
      background: #fffbeb;
      color: #d97706;
    }

    /* Versions */
    .versions-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .version-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .version-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .version-name {
      font-weight: 600;
      color: #0f172a;
    }

    .version-count {
      color: #64748b;
    }

    .version-bar {
      height: 8px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
    }

    .version-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
      border-radius: 4px;
    }

    /* Sites Table */
    .sites-table {
      overflow-x: auto;
    }

    .sites-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .sites-table th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }

    .sites-table td {
      padding: 1rem;
      font-size: 0.875rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .sites-table tr:hover {
      background: #f8fafc;
    }

    .site-name strong {
      display: block;
      color: #0f172a;
    }

    .site-location {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-online { background: #dcfce7; color: #16a34a; }
    .badge-warning { background: #fef3c7; color: #d97706; }
    .badge-offline { background: #fee2e2; color: #dc2626; }
    .badge-unknown { background: #f1f5f9; color: #64748b; }

    td.danger {
      color: #dc2626;
      font-weight: 600;
    }

    .risk-reason {
      font-size: 0.75rem;
      color: #64748b;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      background: #f1f5f9;
      border: none;
      border-radius: 6px;
      color: #2563eb;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }

    .btn-sm:hover {
      background: #e2e8f0;
    }

    /* Map Placeholder */
    .map-placeholder {
      min-height: 200px;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .map-legend {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .legend-dot.online { background: #10b981; }
    .legend-dot.warning { background: #f59e0b; }
    .legend-dot.offline { background: #ef4444; }

    .sites-by-region {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .region-item {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .region-name {
      font-size: 0.875rem;
      color: #0f172a;
    }

    .region-stats {
      font-size: 0.875rem;
    }

    .region-stats .online { color: #10b981; font-weight: 600; }
    .region-stats .separator { color: #cbd5e1; }
    .region-stats .total { color: #64748b; }

    /* Actions */
    .actions-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    @media (max-width: 768px) {
      .actions-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .action-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: inherit;
    }

    .action-btn:hover {
      background: white;
      border-color: #2563eb;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
    }

    .action-icon {
      font-size: 1.5rem;
    }

    .action-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #0f172a;
    }

    .action-count {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      background: #ef4444;
      color: white;
      border-radius: 999px;
    }

    /* Last Update */
    .last-update {
      text-align: center;
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 2rem;
    }

    .auto-refresh {
      opacity: 0.7;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }
  `]
})
export class FleetHealthComponent implements OnInit, OnDestroy {
  private readonly sitesService = inject(SitesService);

  stats = { total: 0, online: 0, offline: 0, warning: 0, unknown: 0 };
  health = { avg_cpu: 0, avg_memory: 0, avg_temperature: 0, sites_high_temp: 0, sites_low_disk: 0 };
  versionDistribution: { version: string; count: number; percentage: number }[] = [];
  atRiskSites: FleetHealthSite[] = [];
  sitesByRegion: { name: string; total: number; online: number }[] = [];
  lastUpdate = new Date();

  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.loadData();
    // Refresh every 30 seconds
    this.refreshSubscription = interval(30000).subscribe(() => {
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    this.sitesService.getFleetHealthData().subscribe({
      next: (data: FleetHealthData) => {
        this.stats = data.stats;
        this.health = data.health;
        this.versionDistribution = data.versionDistribution;
        this.atRiskSites = data.atRiskSites;
        this.sitesByRegion = data.sitesByRegion;
        this.lastUpdate = new Date();
      },
      error: () => {
        // Silent error - handled by interceptor
      }
    });
  }

  refreshData(): void {
    this.loadData();
  }

  getPercentage(value: number): string {
    if (!this.stats.total) return '0';
    return ((value / this.stats.total) * 100).toFixed(0);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      online: 'En ligne',
      offline: 'Hors ligne',
      warning: 'Instable',
      unknown: 'Inconnu'
    };
    return labels[status] || status;
  }

  getRiskReason(site: FleetHealthSite): string {
    if (site.displayStatus === 'offline') return 'Hors ligne';
    if (site.metrics?.temperature && site.metrics.temperature > 75) return 'Surchauffe';
    if (site.metrics?.cpu_percent && site.metrics.cpu_percent > 90) return 'CPU saturé';
    if (site.metrics?.disk_percent && site.metrics.disk_percent > 90) return 'Disque plein';
    if (site.displayStatus === 'warning') return 'Connexion instable';
    return 'À surveiller';
  }

  formatLastSeen(seconds: number | null): string {
    if (seconds === null) return 'Jamais';
    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    return `Il y a ${Math.floor(seconds / 86400)}j`;
  }
}
