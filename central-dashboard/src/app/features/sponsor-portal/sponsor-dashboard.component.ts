import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SponsorPortalService, SponsorDashboard, SponsorSite, SponsorVideo } from '../../core/services/sponsor-portal.service';

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-container">
      <div class="header">
        <div class="sponsor-info" *ngIf="dashboard?.sponsor">
          <img *ngIf="dashboard.sponsor.logo_url"
               [src]="dashboard.sponsor.logo_url"
               [alt]="dashboard.sponsor.name"
               class="sponsor-logo">
          <div>
            <h1>{{ dashboard.sponsor.name }}</h1>
            <span class="badge" [class]="'badge-' + dashboard.sponsor.status">
              {{ dashboard.sponsor.status }}
            </span>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-header">
            <h3>Vidéos</h3>
            <span class="stat-icon">📹</span>
          </div>
          <div class="stat-value">{{ dashboard?.stats?.total_videos || 0 }}</div>
          <div class="stat-footer">Vidéos actives</div>
        </div>

        <div class="stat-card stat-primary">
          <div class="stat-header">
            <h3>Sites</h3>
            <span class="stat-icon">🖥️</span>
          </div>
          <div class="stat-value">{{ dashboard?.stats?.total_sites || 0 }}</div>
          <div class="stat-footer">Sites de diffusion</div>
        </div>

        <div class="stat-card stat-success">
          <div class="stat-header">
            <h3>Impressions</h3>
            <span class="stat-icon">👁️</span>
          </div>
          <div class="stat-value">{{ formatNumber(dashboard?.stats?.total_impressions_30d) }}</div>
          <div class="stat-footer">30 derniers jours</div>
        </div>

        <div class="stat-card stat-info">
          <div class="stat-header">
            <h3>Temps d'écran</h3>
            <span class="stat-icon">⏱️</span>
          </div>
          <div class="stat-value">{{ formatDuration(dashboard?.stats?.total_screen_time_30d) }}</div>
          <div class="stat-footer">30 derniers jours</div>
        </div>
      </div>

      <div class="content-grid">
        <div class="card">
          <div class="card-header">
            <h2>📍 Sites de diffusion</h2>
          </div>
          <div class="sites-list">
            <div *ngFor="let site of sites" class="site-item">
              <span class="site-status" [class]="'status-' + site.status">●</span>
              <div class="site-info">
                <div class="site-name">{{ site.club_name }}</div>
                <div class="site-meta">{{ site.site_name }}</div>
              </div>
              <div class="site-stats">
                <div class="stat-mini">
                  <span class="stat-label">Impressions</span>
                  <span class="stat-num">{{ site.impressions_30d }}</span>
                </div>
              </div>
            </div>
            <div *ngIf="sites.length === 0" class="empty-state">
              <p>Aucun site de diffusion configuré</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>🎬 Vos vidéos</h2>
          </div>
          <div class="videos-list">
            <div *ngFor="let video of videos" class="video-item">
              <div class="video-thumb">
                <img *ngIf="video.thumbnail_url" [src]="video.thumbnail_url" alt="">
                <div *ngIf="!video.thumbnail_url" class="video-placeholder">📹</div>
              </div>
              <div class="video-info">
                <div class="video-name">{{ video.filename }}</div>
                <div class="video-meta">
                  <span>{{ video.impressions_30d }} impressions</span>
                  <span class="separator">•</span>
                  <span>{{ video.completion_rate }}% complet</span>
                </div>
              </div>
            </div>
            <div *ngIf="videos.length === 0" class="empty-state">
              <p>Aucune vidéo associée</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card trends-card">
        <h2>📊 Tendances (7 derniers jours)</h2>
        <div class="trends-chart">
          <div *ngFor="let trend of dashboard?.trends" class="trend-bar-container">
            <div class="trend-bar"
                 [style.height.%]="getTrendHeight(trend.impressions)">
            </div>
            <div class="trend-label">{{ formatDate(trend.date) }}</div>
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

    .sponsor-info {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .sponsor-logo {
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
      border-left: 4px solid #64748b;
    }

    .stat-card.stat-primary { border-left-color: #2563eb; }
    .stat-card.stat-success { border-left-color: #10b981; }
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
      grid-template-columns: repeat(2, 1fr);
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

    .sites-list, .videos-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .site-item, .video-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .site-status {
      font-size: 0.75rem;
    }

    .status-online { color: #10b981; }
    .status-offline { color: #64748b; }
    .status-error { color: #ef4444; }

    .site-info, .video-info {
      flex: 1;
    }

    .site-name, .video-name {
      font-weight: 600;
      color: #0f172a;
    }

    .site-meta, .video-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .separator { margin: 0 0.5rem; }

    .stat-mini {
      text-align: right;
    }

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

    .video-thumb {
      width: 60px;
      height: 45px;
      border-radius: 6px;
      overflow: hidden;
      background: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .video-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-placeholder {
      font-size: 1.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .trends-card h2 {
      margin-bottom: 1.5rem;
    }

    .trends-chart {
      display: flex;
      justify-content: space-around;
      align-items: flex-end;
      height: 200px;
      gap: 1rem;
      padding: 1rem 0;
    }

    .trend-bar-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
    }

    .trend-bar {
      width: 100%;
      max-width: 40px;
      background: linear-gradient(to top, #2563eb, #3b82f6);
      border-radius: 4px 4px 0 0;
      min-height: 4px;
      margin-top: auto;
    }

    .trend-label {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 0.5rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-active { background: #dcfce7; color: #166534; }
    .badge-inactive { background: #f1f5f9; color: #475569; }
    .badge-paused { background: #fef3c7; color: #92400e; }
  `]
})
export class SponsorDashboardComponent implements OnInit {
  private readonly sponsorService = inject(SponsorPortalService);

  dashboard: SponsorDashboard | null = null;
  sites: SponsorSite[] = [];
  videos: SponsorVideo[] = [];
  maxImpressions = 1;

  ngOnInit(): void {
    this.loadDashboard();
    this.loadSites();
    this.loadVideos();
  }

  loadDashboard(): void {
    this.sponsorService.getDashboard().subscribe({
      next: (response) => {
        this.dashboard = response.data;
        this.maxImpressions = Math.max(...(response.data.trends?.map(t => t.impressions) || [1]));
      },
      error: (err) => console.error('Error loading dashboard:', err)
    });
  }

  loadSites(): void {
    this.sponsorService.getSites().subscribe({
      next: (response) => this.sites = response.data.sites,
      error: (err) => console.error('Error loading sites:', err)
    });
  }

  loadVideos(): void {
    this.sponsorService.getVideos().subscribe({
      next: (response) => this.videos = response.data.videos,
      error: (err) => console.error('Error loading videos:', err)
    });
  }

  formatNumber(value: number | undefined): string {
    if (!value) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  getTrendHeight(impressions: number): number {
    return (impressions / this.maxImpressions) * 100;
  }
}
