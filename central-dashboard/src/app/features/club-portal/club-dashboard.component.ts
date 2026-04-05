import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

interface SiteDashboard {
  site: {
    id: string;
    site_name: string;
    club_name: string;
    status: string;
    last_seen_at: string | null;
    software_version: string | null;
  };
  connection: {
    isConnected: boolean;
    lastSeen: string | null;
  };
  metrics: {
    storage_used: number;
    storage_total: number;
    storage_percent: number;
    video_count: number;
    last_video_sync: string | null;
  } | null;
}

@Component({
  selector: 'app-club-dashboard',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="club-dashboard">
      <div class="page-header">
        <h1>{{ siteDashboard?.site?.club_name || 'Mon club' }}</h1>
        <span class="site-name" *ngIf="siteDashboard?.site?.site_name">{{ siteDashboard?.site?.site_name }}</span>
      </div>

      <div class="status-cards" *ngIf="siteDashboard">
        <!-- Connection Status -->
        <div class="card status-card" [class.online]="siteDashboard.connection?.isConnected" [class.offline]="!siteDashboard.connection?.isConnected">
          <div class="card-icon">
            <span class="status-dot" [class.online]="siteDashboard.connection?.isConnected"></span>
          </div>
          <div class="card-content">
            <h3>{{ 'clubPortal.connectionStatus' | translate }}</h3>
            <p class="status-text">
              {{ siteDashboard.connection?.isConnected ? ('status.online' | translate) : ('status.offline' | translate) }}
            </p>
            <p class="status-detail" *ngIf="siteDashboard.connection?.lastSeen">
              {{ 'clubPortal.lastSeen' | translate }}: {{ siteDashboard.connection.lastSeen | date:'dd/MM/yyyy HH:mm' }}
            </p>
          </div>
        </div>

        <!-- Storage -->
        <div class="card" *ngIf="siteDashboard.metrics">
          <div class="card-icon">📦</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.storage' | translate }}</h3>
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="siteDashboard.metrics.storage_percent"
                   [class.warning]="siteDashboard.metrics.storage_percent > 80"
                   [class.danger]="siteDashboard.metrics.storage_percent > 95">
              </div>
            </div>
            <p class="status-detail">
              {{ formatBytes(siteDashboard.metrics.storage_used) }} / {{ formatBytes(siteDashboard.metrics.storage_total) }}
            </p>
          </div>
        </div>

        <!-- Video Count -->
        <div class="card" *ngIf="siteDashboard.metrics">
          <div class="card-icon">🎬</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.videoCount' | translate }}</h3>
            <p class="stat-number">{{ siteDashboard.metrics.video_count }}</p>
            <p class="status-detail" *ngIf="siteDashboard.metrics.last_video_sync">
              {{ 'clubPortal.lastSync' | translate }}: {{ siteDashboard.metrics.last_video_sync | date:'dd/MM/yyyy HH:mm' }}
            </p>
          </div>
        </div>

        <!-- Software Version -->
        <div class="card">
          <div class="card-icon">⚙️</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.version' | translate }}</h3>
            <p class="stat-number">{{ siteDashboard.site?.software_version || '-' }}</p>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div class="loading" *ngIf="loading">
        <div class="spinner"></div>
        <p>{{ 'common.loading' | translate }}</p>
      </div>

      <!-- Error state -->
      <div class="error-banner" *ngIf="error">
        <p>{{ error }}</p>
      </div>
    </div>
  `,
  styles: [`
    .club-dashboard { padding: 2rem; max-width: 1200px; }

    .page-header {
      margin-bottom: 2rem;
      h1 { font-size: 1.75rem; margin: 0; color: var(--text-primary); }
      .site-name { color: var(--text-secondary, #64748b); font-size: 0.875rem; }
    }

    .status-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.5rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }

    .card-icon { font-size: 1.5rem; }
    .card-content { flex: 1; }
    .card-content h3 { margin: 0 0 0.5rem; font-size: 0.875rem; color: var(--text-secondary, #64748b); text-transform: uppercase; letter-spacing: 0.05em; }

    .status-card { border-left: 4px solid #94a3b8; }
    .status-card.online { border-left-color: #22c55e; }
    .status-card.offline { border-left-color: #ef4444; }

    .status-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #94a3b8;
      &.online { background: #22c55e; animation: pulse 2s infinite; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .status-text { font-size: 1.25rem; font-weight: 600; margin: 0; }
    .status-detail { font-size: 0.8rem; color: var(--text-secondary, #94a3b8); margin: 0.25rem 0 0; }
    .stat-number { font-size: 1.5rem; font-weight: 700; margin: 0; color: var(--text-primary); }

    .progress-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.25rem;
    }
    .progress-fill {
      height: 100%;
      background: var(--neo-hockey-dark, #2022E9);
      border-radius: 4px;
      transition: width 0.3s;
      &.warning { background: #f59e0b; }
      &.danger { background: #ef4444; }
    }

    .loading { text-align: center; padding: 3rem; }
    .spinner {
      width: 32px; height: 32px; margin: 0 auto 1rem;
      border: 3px solid #e2e8f0; border-top-color: var(--neo-hockey-dark, #2022E9);
      border-radius: 50%; animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-banner { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 8px; }
  `]
})
export class ClubDashboardComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  siteDashboard: SiteDashboard | null = null;
  loading = true;
  error = '';

  private pollingSubscription?: Subscription;

  ngOnInit(): void {
    this.loadDashboard();
    // Poll every 30 seconds
    this.pollingSubscription = interval(30000).pipe(
      switchMap(() => this.fetchDashboard())
    ).subscribe({
      next: (data) => { this.siteDashboard = data; },
    });
  }

  ngOnDestroy(): void {
    this.pollingSubscription?.unsubscribe();
  }

  private loadDashboard(): void {
    this.loading = true;
    this.fetchDashboard().subscribe({
      next: (data) => {
        this.siteDashboard = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur de chargement';
        this.loading = false;
      }
    });
  }

  private fetchDashboard() {
    const siteId = this.authService.getCurrentUser()?.site_id;
    return this.api.get<SiteDashboard>(`/sites/${siteId}/dashboard`);
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}
