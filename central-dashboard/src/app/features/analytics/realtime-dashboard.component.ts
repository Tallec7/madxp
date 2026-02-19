import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, interval, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AnalyticsNavComponent } from './analytics-nav.component';

interface RealtimeStats {
  timestamp: string;
  sites: {
    total: number;
    online: number;
    offline: number;
    warning: number;
  };
  activity: {
    videos_last_hour: number;
    videos_last_minute: number;
    impressions_last_hour: number;
    active_sessions: number;
  };
  top_content: {
    video_name: string;
    category: string;
    plays_last_hour: number;
  } | null;
  health: {
    avg_cpu: number;
    avg_memory: number;
    avg_temperature: number;
    sites_with_alerts: number;
  };
  trends: {
    videos_trend: 'up' | 'down' | 'stable';
    videos_change_percent: number;
  };
}

@Component({
  selector: 'app-realtime-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, AnalyticsNavComponent],
  template: `
    <div class="realtime-dashboard">
      <app-analytics-nav></app-analytics-nav>

      <header class="dashboard-header">
        <div class="header-left">
          <h1>Temps Reel</h1>
        </div>
        <div class="header-right">
          <span class="live-indicator" [class.connected]="isConnected">
            <span class="pulse"></span>
            {{ isConnected ? 'LIVE' : 'Connexion...' }}
          </span>
          <span class="last-update" *ngIf="stats">
            Mis à jour: {{ getTimeAgo(stats.timestamp) }}
          </span>
        </div>
      </header>

      <div class="stats-grid" *ngIf="stats">
        <!-- Sites Status -->
        <div class="stat-card sites-card">
          <div class="card-header">
            <span class="card-icon">📍</span>
            <span class="card-title">Sites</span>
          </div>
          <div class="sites-stats">
            <div class="site-stat online">
              <span class="stat-value">{{ stats.sites.online }}</span>
              <span class="stat-label">En ligne</span>
            </div>
            <div class="site-stat warning" *ngIf="stats.sites.warning > 0">
              <span class="stat-value">{{ stats.sites.warning }}</span>
              <span class="stat-label">Attention</span>
            </div>
            <div class="site-stat offline">
              <span class="stat-value">{{ stats.sites.offline }}</span>
              <span class="stat-label">Hors ligne</span>
            </div>
          </div>
          <div class="card-footer">
            Total: {{ stats.sites.total }} sites
          </div>
        </div>

        <!-- Activity Now -->
        <div class="stat-card activity-card highlight">
          <div class="card-header">
            <span class="card-icon">🎬</span>
            <span class="card-title">Activité</span>
            <span class="trend-badge" [class]="stats.trends.videos_trend">
              {{ getTrendIcon(stats.trends.videos_trend) }}
              {{ stats.trends.videos_change_percent > 0 ? '+' : '' }}{{ stats.trends.videos_change_percent }}%
            </span>
          </div>
          <div class="activity-stats">
            <div class="activity-main">
              <span class="big-number">{{ stats.activity.videos_last_minute }}</span>
              <span class="big-label">vidéos/min</span>
            </div>
            <div class="activity-secondary">
              <div class="secondary-stat">
                <span class="value">{{ stats.activity.videos_last_hour }}</span>
                <span class="label">vidéos/heure</span>
              </div>
              <div class="secondary-stat">
                <span class="value">{{ stats.activity.active_sessions }}</span>
                <span class="label">sessions actives</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Impressions Sponsors -->
        <div class="stat-card impressions-card">
          <div class="card-header">
            <span class="card-icon">📊</span>
            <span class="card-title">Impressions Sponsors</span>
          </div>
          <div class="impressions-content">
            <span class="big-number">{{ formatNumber(stats.activity.impressions_last_hour) }}</span>
            <span class="big-label">cette heure</span>
          </div>
          <div class="card-footer">
            ~{{ Math.round(stats.activity.impressions_last_hour / 60) }}/min
          </div>
        </div>

        <!-- Top Content -->
        <div class="stat-card top-content-card" *ngIf="stats.top_content">
          <div class="card-header">
            <span class="card-icon">🏆</span>
            <span class="card-title">Top Vidéo</span>
          </div>
          <div class="top-content">
            <div class="video-name">{{ truncate(stats.top_content.video_name, 30) }}</div>
            <div class="video-category">{{ stats.top_content.category }}</div>
            <div class="video-plays">
              <span class="plays-value">{{ stats.top_content.plays_last_hour }}</span>
              <span class="plays-label">lectures cette heure</span>
            </div>
          </div>
        </div>

        <!-- Fleet Health -->
        <div class="stat-card health-card">
          <div class="card-header">
            <span class="card-icon">💓</span>
            <span class="card-title">Santé Flotte</span>
            <span class="alert-badge" *ngIf="stats.health.sites_with_alerts > 0">
              {{ stats.health.sites_with_alerts }} alerte(s)
            </span>
          </div>
          <div class="health-metrics">
            <div class="metric">
              <div class="metric-label">CPU moyen</div>
              <div class="metric-bar">
                <div class="bar-fill" [style.width.%]="stats.health.avg_cpu"
                     [class.warning]="stats.health.avg_cpu > 70"
                     [class.danger]="stats.health.avg_cpu > 90"></div>
              </div>
              <div class="metric-value">{{ stats.health.avg_cpu | number:'1.0-0' }}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Mémoire moyenne</div>
              <div class="metric-bar">
                <div class="bar-fill" [style.width.%]="stats.health.avg_memory"
                     [class.warning]="stats.health.avg_memory > 70"
                     [class.danger]="stats.health.avg_memory > 90"></div>
              </div>
              <div class="metric-value">{{ stats.health.avg_memory | number:'1.0-0' }}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Température moyenne</div>
              <div class="metric-bar">
                <div class="bar-fill temp" [style.width.%]="(stats.health.avg_temperature / 85) * 100"
                     [class.warning]="stats.health.avg_temperature > 60"
                     [class.danger]="stats.health.avg_temperature > 75"></div>
              </div>
              <div class="metric-value">{{ stats.health.avg_temperature | number:'1.0-0' }}°C</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="!stats && !error">
        <div class="spinner"></div>
        <p>Chargement des statistiques temps réel...</p>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="error">
        <span class="error-icon">⚠️</span>
        <p>{{ error }}</p>
        <button (click)="retryConnection()" class="retry-btn">Réessayer</button>
      </div>
    </div>
  `,
  styles: [`
    .realtime-dashboard {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6b7280;
      text-decoration: none;
      font-size: 14px;
      padding: 8px 12px;
      border-radius: 8px;
      background: #f3f4f6;
      transition: all 0.2s;
    }

    .back-link:hover {
      background: #e5e7eb;
      color: #374151;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #fee2e2;
      color: #dc2626;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .live-indicator.connected {
      background: #dcfce7;
      color: #16a34a;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .last-update {
      font-size: 12px;
      color: #9ca3af;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .stat-card.highlight {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .card-icon {
      font-size: 20px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
    }

    .highlight .card-title {
      color: rgba(255,255,255,0.8);
    }

    .trend-badge {
      margin-left: auto;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .trend-badge.up {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }

    .trend-badge.down {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .trend-badge.stable {
      background: rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.9);
    }

    .highlight .trend-badge.up {
      background: rgba(255,255,255,0.2);
      color: #10b981;
    }

    .sites-stats {
      display: flex;
      gap: 16px;
      justify-content: space-around;
    }

    .site-stat {
      text-align: center;
    }

    .site-stat .stat-value {
      display: block;
      font-size: 32px;
      font-weight: 700;
    }

    .site-stat.online .stat-value { color: #10b981; }
    .site-stat.warning .stat-value { color: #f59e0b; }
    .site-stat.offline .stat-value { color: #ef4444; }

    .site-stat .stat-label {
      font-size: 12px;
      color: #6b7280;
    }

    .card-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
    }

    .highlight .card-footer {
      border-top-color: rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.7);
    }

    .activity-stats {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .activity-main {
      text-align: center;
    }

    .big-number {
      display: block;
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
    }

    .big-label {
      font-size: 14px;
      opacity: 0.8;
    }

    .activity-secondary {
      display: flex;
      justify-content: space-around;
    }

    .secondary-stat {
      text-align: center;
    }

    .secondary-stat .value {
      display: block;
      font-size: 24px;
      font-weight: 600;
    }

    .secondary-stat .label {
      font-size: 11px;
      opacity: 0.7;
    }

    .impressions-content {
      text-align: center;
      padding: 20px 0;
    }

    .top-content {
      text-align: center;
    }

    .video-name {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .video-category {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
    }

    .video-plays {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 8px;
    }

    .plays-value {
      font-size: 24px;
      font-weight: 700;
      color: #3b82f6;
    }

    .plays-label {
      display: block;
      font-size: 11px;
      color: #6b7280;
    }

    .alert-badge {
      margin-left: auto;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: #fee2e2;
      color: #dc2626;
    }

    .health-metrics {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .metric {
      display: grid;
      grid-template-columns: 100px 1fr 50px;
      align-items: center;
      gap: 12px;
    }

    .metric-label {
      font-size: 12px;
      color: #6b7280;
    }

    .metric-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: #10b981;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .bar-fill.warning { background: #f59e0b; }
    .bar-fill.danger { background: #ef4444; }

    .metric-value {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      text-align: right;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .retry-btn {
      margin-top: 16px;
      padding: 8px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .retry-btn:hover {
      background: #2563eb;
    }

    @media (max-width: 768px) {
      .realtime-dashboard {
        padding: 16px;
      }

      .stats-grid {
        grid-template-columns: 1fr;
      }

      .dashboard-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-right {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class RealtimeDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  private apiUrl = environment.apiUrl;

  stats: RealtimeStats | null = null;
  isConnected = false;
  error: string | null = null;

  // Expose Math to template
  Math = Math;

  ngOnInit(): void {
    this.fetchStats();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startPolling(): void {
    // Poll every 10 seconds
    interval(10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchStats();
      });
  }

  private fetchStats(): void {
    this.http.get<{ success: boolean; data: RealtimeStats }>(`${this.apiUrl}/analytics/realtime`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.stats = response.data;
            this.isConnected = true;
            this.error = null;
          }
        },
        error: (err) => {
          this.isConnected = false;
          this.error = 'Impossible de charger les statistiques temps réel';
        }
      });
  }

  retryConnection(): void {
    this.error = null;
    this.fetchStats();
  }

  getTimeAgo(timestamp: string): string {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 10) return 'à l\'instant';
    if (seconds < 60) return `il y a ${seconds}s`;
    return `il y a ${Math.floor(seconds / 60)}min`;
  }

  getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      default: return '→';
    }
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat('fr-FR').format(num);
  }

  truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
