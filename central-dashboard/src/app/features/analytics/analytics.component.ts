import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SiteStatus {
  id: string;
  site_name: string;
  club_name: string;
  status: 'online' | 'offline' | 'warning';
  last_seen_at: string | null;
  cpu?: number;
  memory?: number;
  temperature?: number;
  disk?: number;
}

interface FleetStats {
  total: number;
  online: number;
  offline: number;
  warning: number;
  avgCpu: number;
  avgMemory: number;
  avgTemperature: number;
  avgDisk: number;
}

interface RecentActivity {
  type: 'connection' | 'disconnection' | 'video_play' | 'config_update' | 'alert';
  site_name: string;
  site_id: string;
  message: string;
  timestamp: string;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="analytics-container">
      <div class="page-header">
        <div class="header-content">
          <h1>📈 Analytics</h1>
          <p class="subtitle">Vue d'ensemble de la flotte - {{ stats.total }} sites</p>
        </div>
        <div class="header-actions">
          <span class="last-update" *ngIf="lastUpdate">
            Mis à jour: {{ lastUpdate | date:'HH:mm:ss' }}
          </span>
          <button class="btn btn-secondary btn-sm" (click)="loadData()" [disabled]="loading">
            {{ loading ? '⏳' : '🔄' }} Actualiser
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card" [routerLink]="['/sites']">
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
            <div class="stat-percent">{{ getPercent(stats.online) }}%</div>
          </div>
        </div>

        <div class="stat-card stat-warning" [routerLink]="['/sites']" [queryParams]="{status: 'warning'}">
          <div class="stat-icon">⚠️</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.warning }}</div>
            <div class="stat-label">Instables</div>
            <div class="stat-percent">{{ getPercent(stats.warning) }}%</div>
          </div>
        </div>

        <div class="stat-card stat-danger" [routerLink]="['/sites']" [queryParams]="{status: 'offline'}">
          <div class="stat-icon">❌</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.offline }}</div>
            <div class="stat-label">Hors ligne</div>
            <div class="stat-percent">{{ getPercent(stats.offline) }}%</div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="content-grid">
        <!-- Fleet Metrics -->
        <div class="card metrics-card">
          <h2>📊 Métriques Moyennes de la Flotte</h2>
          <div class="metrics-list">
            <div class="metric-row">
              <span class="metric-label">🔥 CPU</span>
              <div class="metric-bar-container">
                <div class="metric-bar"
                     [class.good]="stats.avgCpu < 50"
                     [class.warning]="stats.avgCpu >= 50 && stats.avgCpu < 80"
                     [class.danger]="stats.avgCpu >= 80"
                     [style.width.%]="stats.avgCpu">
                </div>
              </div>
              <span class="metric-value">{{ stats.avgCpu | number:'1.0-0' }}%</span>
            </div>

            <div class="metric-row">
              <span class="metric-label">💾 RAM</span>
              <div class="metric-bar-container">
                <div class="metric-bar"
                     [class.good]="stats.avgMemory < 60"
                     [class.warning]="stats.avgMemory >= 60 && stats.avgMemory < 85"
                     [class.danger]="stats.avgMemory >= 85"
                     [style.width.%]="stats.avgMemory">
                </div>
              </div>
              <span class="metric-value">{{ stats.avgMemory | number:'1.0-0' }}%</span>
            </div>

            <div class="metric-row">
              <span class="metric-label">🌡️ Temp</span>
              <div class="metric-bar-container">
                <div class="metric-bar"
                     [class.good]="stats.avgTemperature < 60"
                     [class.warning]="stats.avgTemperature >= 60 && stats.avgTemperature < 75"
                     [class.danger]="stats.avgTemperature >= 75"
                     [style.width.%]="Math.min(stats.avgTemperature, 100)">
                </div>
              </div>
              <span class="metric-value">{{ stats.avgTemperature | number:'1.0-0' }}°C</span>
            </div>

            <div class="metric-row">
              <span class="metric-label">💿 Disque</span>
              <div class="metric-bar-container">
                <div class="metric-bar"
                     [class.good]="stats.avgDisk < 70"
                     [class.warning]="stats.avgDisk >= 70 && stats.avgDisk < 90"
                     [class.danger]="stats.avgDisk >= 90"
                     [style.width.%]="stats.avgDisk">
                </div>
              </div>
              <span class="metric-value">{{ stats.avgDisk | number:'1.0-0' }}%</span>
            </div>
          </div>
        </div>

        <!-- Sites List with Issues -->
        <div class="card sites-card">
          <h2>🚨 Sites nécessitant attention</h2>
          <div class="sites-list" *ngIf="problemSites.length > 0; else noProblems">
            <a *ngFor="let site of problemSites"
               [routerLink]="['/sites', site.id]"
               class="site-row"
               [class.offline]="site.status === 'offline'"
               [class.warning]="site.status === 'warning'">
              <div class="site-status-indicator" [class]="site.status"></div>
              <div class="site-info">
                <span class="site-name">{{ site.site_name }}</span>
                <span class="site-club">{{ site.club_name }}</span>
              </div>
              <div class="site-issue">
                <span *ngIf="site.status === 'offline'">Hors ligne</span>
                <span *ngIf="site.status === 'warning'">Connexion instable</span>
                <span *ngIf="site.temperature && site.temperature > 75" class="issue-temp">🌡️ {{ site.temperature }}°C</span>
                <span *ngIf="site.cpu && site.cpu > 80" class="issue-cpu">🔥 CPU {{ site.cpu }}%</span>
                <span *ngIf="site.disk && site.disk > 90" class="issue-disk">💿 Disque {{ site.disk }}%</span>
              </div>
              <span class="site-arrow">→</span>
            </a>
          </div>
          <ng-template #noProblems>
            <div class="no-problems">
              <span class="no-problems-icon">✅</span>
              <span>Tous les sites fonctionnent normalement</span>
            </div>
          </ng-template>
        </div>

        <!-- Recent Activity -->
        <div class="card activity-card">
          <h2>📋 Activité Récente</h2>
          <div class="activity-list" *ngIf="recentActivity.length > 0; else noActivity">
            <div *ngFor="let activity of recentActivity" class="activity-row" [class]="activity.type">
              <span class="activity-icon">
                <ng-container [ngSwitch]="activity.type">
                  <span *ngSwitchCase="'connection'">🟢</span>
                  <span *ngSwitchCase="'disconnection'">🔴</span>
                  <span *ngSwitchCase="'video_play'">▶️</span>
                  <span *ngSwitchCase="'config_update'">⚙️</span>
                  <span *ngSwitchCase="'alert'">🚨</span>
                  <span *ngSwitchDefault>📌</span>
                </ng-container>
              </span>
              <div class="activity-content">
                <a [routerLink]="['/sites', activity.site_id]" class="activity-site">{{ activity.site_name }}</a>
                <span class="activity-message">{{ activity.message }}</span>
              </div>
              <span class="activity-time">{{ formatTime(activity.timestamp) }}</span>
            </div>
          </div>
          <ng-template #noActivity>
            <div class="no-activity">
              <span>Aucune activité récente</span>
            </div>
          </ng-template>
        </div>

        <!-- Online Sites -->
        <div class="card online-sites-card">
          <h2>🟢 Sites en ligne ({{ stats.online }})</h2>
          <div class="sites-grid" *ngIf="onlineSites.length > 0; else noOnlineSites">
            <a *ngFor="let site of onlineSites.slice(0, 12)"
               [routerLink]="['/sites', site.id]"
               class="site-tile">
              <span class="site-tile-name">{{ site.site_name }}</span>
              <div class="site-tile-metrics" *ngIf="site.cpu !== undefined">
                <span [class.warning]="site.cpu > 70">{{ site.cpu | number:'1.0-0' }}%</span>
                <span [class.warning]="site.temperature && site.temperature > 65">{{ site.temperature | number:'1.0-0' }}°</span>
              </div>
            </a>
            <a *ngIf="onlineSites.length > 12" [routerLink]="['/sites']" [queryParams]="{status: 'online'}" class="site-tile more-tile">
              +{{ onlineSites.length - 12 }} autres
            </a>
          </div>
          <ng-template #noOnlineSites>
            <div class="no-sites">Aucun site en ligne</div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-content h1 {
      margin: 0 0 4px 0;
      font-size: 28px;
      font-weight: 600;
    }

    .subtitle {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .last-update {
      font-size: 12px;
      color: #94a3b8;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid #e2e8f0;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .stat-icon {
      font-size: 32px;
    }

    .stat-content {
      flex: 1;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 13px;
      color: #64748b;
    }

    .stat-percent {
      font-size: 12px;
      color: #94a3b8;
    }

    .stat-success { border-left: 4px solid #10b981; }
    .stat-warning { border-left: 4px solid #f59e0b; }
    .stat-danger { border-left: 4px solid #ef4444; }

    /* Content Grid */
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
    }

    .card h2 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
    }

    /* Metrics Card */
    .metrics-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .metric-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .metric-label {
      width: 80px;
      font-size: 14px;
      color: #475569;
    }

    .metric-bar-container {
      flex: 1;
      height: 8px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
    }

    .metric-bar {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .metric-bar.good { background: #10b981; }
    .metric-bar.warning { background: #f59e0b; }
    .metric-bar.danger { background: #ef4444; }

    .metric-value {
      width: 50px;
      text-align: right;
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }

    /* Sites List */
    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .site-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s;
    }

    .site-row:hover {
      background: #f1f5f9;
    }

    .site-row.offline {
      background: #fef2f2;
    }

    .site-row.warning {
      background: #fffbeb;
    }

    .site-status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .site-status-indicator.online { background: #10b981; }
    .site-status-indicator.offline { background: #ef4444; }
    .site-status-indicator.warning { background: #f59e0b; }

    .site-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .site-name {
      font-weight: 500;
      font-size: 14px;
    }

    .site-club {
      font-size: 12px;
      color: #64748b;
    }

    .site-issue {
      display: flex;
      gap: 8px;
      font-size: 12px;
      color: #64748b;
    }

    .site-issue .issue-temp { color: #ef4444; }
    .site-issue .issue-cpu { color: #f59e0b; }
    .site-issue .issue-disk { color: #8b5cf6; }

    .site-arrow {
      color: #94a3b8;
    }

    .no-problems, .no-activity, .no-sites {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 40px;
      color: #64748b;
      font-size: 14px;
    }

    .no-problems-icon {
      font-size: 24px;
    }

    /* Activity List */
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .activity-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: #f8fafc;
      border-radius: 8px;
    }

    .activity-icon {
      font-size: 16px;
    }

    .activity-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .activity-site {
      font-weight: 500;
      font-size: 13px;
      color: #2563eb;
      text-decoration: none;
    }

    .activity-site:hover {
      text-decoration: underline;
    }

    .activity-message {
      font-size: 12px;
      color: #64748b;
    }

    .activity-time {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
    }

    /* Online Sites Grid */
    .sites-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .site-tile {
      padding: 12px;
      background: #f0fdf4;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      text-align: center;
      transition: all 0.2s;
      border: 1px solid #bbf7d0;
    }

    .site-tile:hover {
      background: #dcfce7;
      transform: scale(1.02);
    }

    .site-tile-name {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #166534;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .site-tile-metrics {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
      font-size: 10px;
      color: #15803d;
    }

    .site-tile-metrics .warning {
      color: #f59e0b;
    }

    .more-tile {
      background: #e2e8f0;
      border-color: #cbd5e1;
      color: #475569;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .more-tile:hover {
      background: #cbd5e1;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .content-grid {
        grid-template-columns: 1fr;
      }
      .sites-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .analytics-container {
        padding: 16px;
      }
      .stats-grid {
        grid-template-columns: 1fr 1fr;
      }
      .page-header {
        flex-direction: column;
        gap: 12px;
      }
      .sites-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private refreshSubscription?: Subscription;

  Math = Math; // Expose Math to template

  loading = false;
  lastUpdate: Date | null = null;

  stats: FleetStats = {
    total: 0,
    online: 0,
    offline: 0,
    warning: 0,
    avgCpu: 0,
    avgMemory: 0,
    avgTemperature: 0,
    avgDisk: 0
  };

  allSites: SiteStatus[] = [];
  problemSites: SiteStatus[] = [];
  onlineSites: SiteStatus[] = [];
  recentActivity: RecentActivity[] = [];

  ngOnInit(): void {
    this.loadData();
    // Refresh every 60 seconds (reduced from 30s to avoid rate limiting)
    this.refreshSubscription = interval(60000).subscribe(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    this.loading = true;

    forkJoin({
      connectionStatus: this.http.get<{ data: SiteStatus[] }>(`${environment.apiUrl}/sites/connection-status`),
      fleetHealth: this.http.get<{ data: { sites: SiteStatus[], stats: { total: number, online: number, offline: number, warning: number }, health: { avg_cpu: number, avg_memory: number, avg_temperature: number, avg_disk: number } } }>(`${environment.apiUrl}/sites/fleet-health`)
    }).subscribe({
      next: (results) => {
        // Process fleet health data
        const fleetData = results.fleetHealth.data;

        this.stats = {
          total: fleetData.stats.total,
          online: fleetData.stats.online,
          offline: fleetData.stats.offline,
          warning: fleetData.stats.warning,
          avgCpu: fleetData.health.avg_cpu || 0,
          avgMemory: fleetData.health.avg_memory || 0,
          avgTemperature: fleetData.health.avg_temperature || 0,
          avgDisk: fleetData.health.avg_disk || 0
        };

        this.allSites = fleetData.sites || [];

        // Filter problem sites (offline, warning, or resource issues)
        this.problemSites = this.allSites.filter(site =>
          site.status === 'offline' ||
          site.status === 'warning' ||
          (site.temperature && site.temperature > 75) ||
          (site.cpu && site.cpu > 80) ||
          (site.disk && site.disk > 90)
        ).slice(0, 10);

        // Filter online sites
        this.onlineSites = this.allSites.filter(site => site.status === 'online');

        // Generate recent activity from sites data
        this.generateRecentActivity();

        this.lastUpdate = new Date();
        this.loading = false;
      },
      error: (_err) => {
        // Fallback to just connection status
        this.http.get<{ data: SiteStatus[] }>(`${environment.apiUrl}/sites/connection-status`).subscribe({
          next: (result) => {
            this.allSites = result.data || [];
            this.stats.total = this.allSites.length;
            this.stats.online = this.allSites.filter(s => s.status === 'online').length;
            this.stats.offline = this.allSites.filter(s => s.status === 'offline').length;
            this.stats.warning = this.allSites.filter(s => s.status === 'warning').length;

            this.problemSites = this.allSites.filter(site =>
              site.status === 'offline' || site.status === 'warning'
            ).slice(0, 10);

            this.onlineSites = this.allSites.filter(site => site.status === 'online');

            this.lastUpdate = new Date();
            this.loading = false;
          },
          error: () => {
            this.loading = false;
          }
        });
      }
    });
  }

  generateRecentActivity(): void {
    // Generate activity based on site status changes
    const activities: RecentActivity[] = [];

    // Recently connected (last_seen_at within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    this.allSites.forEach(site => {
      if (site.status === 'online' && site.last_seen_at) {
        const lastSeen = new Date(site.last_seen_at);
        if (lastSeen > fiveMinutesAgo) {
          activities.push({
            type: 'connection',
            site_name: site.site_name,
            site_id: site.id,
            message: 'Connexion établie',
            timestamp: site.last_seen_at
          });
        }
      }

      if (site.status === 'offline' && site.last_seen_at) {
        activities.push({
          type: 'disconnection',
          site_name: site.site_name,
          site_id: site.id,
          message: 'Déconnecté',
          timestamp: site.last_seen_at
        });
      }
    });

    // Sort by timestamp desc and take first 10
    this.recentActivity = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }

  getPercent(value: number): number {
    if (this.stats.total === 0) return 0;
    return Math.round((value / this.stats.total) * 100);
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins}min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Il y a ${diffDays}j`;
  }
}
