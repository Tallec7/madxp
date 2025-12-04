import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SitesService } from '../../core/services/sites.service';
import { SiteStats, Site } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-container">
      <h1>Dashboard</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-header">
            <h3>Total Sites</h3>
            <span class="stat-icon">🖥️</span>
          </div>
          <div class="stat-value">{{ stats?.total_sites || 0 }}</div>
          <div class="stat-footer">Tous les sites enregistrés</div>
        </div>

        <div class="stat-card stat-success">
          <div class="stat-header">
            <h3>Online</h3>
            <span class="stat-icon">✅</span>
          </div>
          <div class="stat-value">{{ stats?.online || 0 }}</div>
          <div class="stat-footer">Sites connectés</div>
        </div>

        <div class="stat-card stat-secondary">
          <div class="stat-header">
            <h3>Offline</h3>
            <span class="stat-icon">⚪</span>
          </div>
          <div class="stat-value">{{ stats?.offline || 0 }}</div>
          <div class="stat-footer">Sites déconnectés</div>
        </div>

        <div class="stat-card stat-danger">
          <div class="stat-header">
            <h3>Erreurs</h3>
            <span class="stat-icon">❌</span>
          </div>
          <div class="stat-value">{{ stats?.error || 0 }}</div>
          <div class="stat-footer">Sites en erreur</div>
        </div>
      </div>

      <div class="content-grid">
        <div class="card recent-sites">
          <div class="card-header">
            <h2>Sites récents</h2>
            <a routerLink="/sites" class="btn btn-secondary btn-sm">Voir tout</a>
          </div>
          <div class="sites-list">
            <div *ngFor="let site of recentSites" class="site-item" [routerLink]="['/sites', site.id]">
              <span class="site-status" [class]="'status-' + site.status">●</span>
              <div class="site-info">
                <div class="site-name">{{ site.club_name }}</div>
                <div class="site-meta">
                  <span>{{ site.location?.city }}</span>
                  <span class="separator">•</span>
                  <span>v{{ site.software_version }}</span>
                </div>
              </div>
              <span class="badge" [class]="'badge-' + getStatusBadge(site.status)">
                {{ site.status }}
              </span>
            </div>
            <div *ngIf="recentSites.length === 0" class="empty-state">
              <p>Aucun site enregistré</p>
              <a routerLink="/sites" class="btn btn-primary">Ajouter un site</a>
            </div>
          </div>
        </div>

        <div class="card quick-actions">
          <h2>Actions rapides</h2>
          <div class="actions-list">
            <button class="action-btn" routerLink="/sites">
              <span class="action-icon">🖥️</span>
              <div class="action-content">
                <div class="action-title">Gérer les sites</div>
                <div class="action-desc">Ajouter, modifier ou supprimer des sites</div>
              </div>
            </button>
            <button class="action-btn" routerLink="/groups">
              <span class="action-icon">👥</span>
              <div class="action-content">
                <div class="action-title">Gérer les groupes</div>
                <div class="action-desc">Organiser les sites par groupes</div>
              </div>
            </button>
            <button class="action-btn" routerLink="/content">
              <span class="action-icon">📹</span>
              <div class="action-content">
                <div class="action-title">Distribuer du contenu</div>
                <div class="action-desc">Déployer des vidéos vers les sites</div>
              </div>
            </button>
            <button class="action-btn" routerLink="/updates">
              <span class="action-icon">🔄</span>
              <div class="action-content">
                <div class="action-title">Mettre à jour</div>
                <div class="action-desc">Déployer des mises à jour logicielles</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="card distribution-chart">
        <h2>Distribution des sites</h2>
        <div class="distribution-grid">
          <div class="distribution-item">
            <div class="distribution-bar">
              <div class="distribution-fill stat-success"
                   [style.width.%]="getPercentage(stats?.online)"></div>
            </div>
            <div class="distribution-label">
              <span class="distribution-name">Online</span>
              <span class="distribution-value">{{ stats?.online || 0 }}</span>
            </div>
          </div>
          <div class="distribution-item">
            <div class="distribution-bar">
              <div class="distribution-fill stat-secondary"
                   [style.width.%]="getPercentage(stats?.offline)"></div>
            </div>
            <div class="distribution-label">
              <span class="distribution-name">Offline</span>
              <span class="distribution-value">{{ stats?.offline || 0 }}</span>
            </div>
          </div>
          <div class="distribution-item">
            <div class="distribution-bar">
              <div class="distribution-fill stat-warning"
                   [style.width.%]="getPercentage(stats?.maintenance)"></div>
            </div>
            <div class="distribution-label">
              <span class="distribution-name">Maintenance</span>
              <span class="distribution-value">{{ stats?.maintenance || 0 }}</span>
            </div>
          </div>
          <div class="distribution-item">
            <div class="distribution-bar">
              <div class="distribution-fill stat-danger"
                   [style.width.%]="getPercentage(stats?.error)"></div>
            </div>
            <div class="distribution-label">
              <span class="distribution-name">Erreur</span>
              <span class="distribution-value">{{ stats?.error || 0 }}</span>
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

    h1 {
      font-size: 2rem;
      margin-bottom: 2rem;
      color: #0f172a;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #2563eb;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .stat-card.stat-success { border-left-color: #10b981; }
    .stat-card.stat-danger { border-left-color: #ef4444; }
    .stat-card.stat-secondary { border-left-color: #64748b; }

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
      letter-spacing: 0.5px;
    }

    .stat-icon {
      font-size: 1.5rem;
      opacity: 0.8;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .stat-footer {
      font-size: 0.75rem;
      color: #94a3b8;
    }

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

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .card h2 {
      font-size: 1.25rem;
      margin: 0 0 1.5rem 0;
      color: #0f172a;
    }

    .card-header h2 {
      margin: 0;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .site-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: #f8fafc;
      cursor: pointer;
      transition: all 0.2s;
    }

    .site-item:hover {
      background: #f1f5f9;
      transform: translateX(4px);
    }

    .site-status {
      font-size: 0.75rem;
    }

    .site-info {
      flex: 1;
      min-width: 0;
    }

    .site-name {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .site-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
    }

    .separator {
      color: #cbd5e1;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
    }

    .empty-state p {
      margin-bottom: 1rem;
    }

    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      transform: translateX(4px);
    }

    .action-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .action-content {
      flex: 1;
    }

    .action-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .action-desc {
      font-size: 0.875rem;
      color: #64748b;
    }

    .distribution-grid {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .distribution-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .distribution-bar {
      height: 24px;
      background: #f1f5f9;
      border-radius: 12px;
      overflow: hidden;
    }

    .distribution-fill {
      height: 100%;
      border-radius: 12px;
      transition: width 0.3s ease;
    }

    .distribution-fill.stat-success { background: #10b981; }
    .distribution-fill.stat-secondary { background: #64748b; }
    .distribution-fill.stat-warning { background: #f59e0b; }
    .distribution-fill.stat-danger { background: #ef4444; }

    .distribution-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .distribution-name {
      color: #64748b;
    }

    .distribution-value {
      font-weight: 600;
      color: #0f172a;
    }
  `]
})
export class DashboardComponent implements OnInit {
  stats: SiteStats | null = null;
  recentSites: Site[] = [];

  constructor(private sitesService: SitesService) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadRecentSites();
  }

  loadStats(): void {
    this.sitesService.loadStats().subscribe(stats => {
      this.stats = stats;
    });
  }

  loadRecentSites(): void {
    this.sitesService.loadSites().subscribe(response => {
      this.recentSites = response.sites.slice(0, 5);
    });
  }

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      online: 'success',
      offline: 'secondary',
      error: 'danger',
      maintenance: 'warning'
    };
    return badges[status] || 'secondary';
  }

  getPercentage(value: number | undefined): number {
    if (!value || !this.stats?.total_sites) return 0;
    return (value / this.stats.total_sites) * 100;
  }
}
