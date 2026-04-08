import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ClubSaasActionsComponent } from './club-saas-actions.component';
import { ClubHelpModalComponent } from './club-help-modal.component';

interface SaasDailyPoint {
  day: string;
  videosPlayed: number;
  screenTimeSeconds: number;
}
interface SaasTopVideo {
  filename: string;
  category: string;
  plays: number;
  avgCompletion: number;
}
interface SaasActiveProfile {
  id: string;
  name: string;
  displayName: string | null;
  loopVideoCount: number;
  sponsorCount: number;
}
interface SaasActiveSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  videoCount: number;
  totalImpressions: number;
}
interface SaasMetrics {
  connectedClients: number;
  todayVideosPlayed: number;
  todayScreenTime: number;
  todaySessions: number;
  weekVideosPlayed: number;
  weekScreenTime: number;
  weekCompletionRate: number;
  weekSponsorsDisplayed: number;
  yesterdayVideosPlayed?: number;
  yesterdayScreenTime?: number;
  previousWeekCompletionRate?: number;
  previousWeekVideosPlayed?: number;
  dailySparkline?: SaasDailyPoint[];
  topVideos?: SaasTopVideo[];
  activeProfile?: SaasActiveProfile | null;
  activeSponsors?: SaasActiveSponsor[];
  lastOtaDeployment?: {
    version: string;
    status: string;
    completedAt: string | null;
    createdAt: string;
  } | null;
  activeAlertsCount?: number;
}

interface SiteDashboard {
  site: {
    id: string;
    site_name: string;
    club_name: string;
    site_type?: string;
    status?: string;
    last_seen_at?: string | null;
    software_version?: string | null;
  };
  connection: {
    isConnected: boolean;
    lastSeen?: string | null;
    lastSeenAt?: string | null;
  };
  metrics: {
    storage_used: number;
    storage_total: number;
    storage_percent: number;
    video_count: number;
    last_video_sync: string | null;
  } | null;
  saasMetrics?: SaasMetrics | null;
}

@Component({
  selector: 'app-club-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ClubSaasActionsComponent, ClubHelpModalComponent],
  template: `
    <div class="club-dashboard">
      <div class="page-header">
        <div class="header-text">
          <h1>{{ siteDashboard?.site?.club_name || 'Mon club' }}</h1>
          <span class="site-name" *ngIf="siteDashboard?.site?.site_name">{{ siteDashboard?.site?.site_name }}</span>
        </div>
        <button class="btn-help" type="button" (click)="showHelp = true" title="Aide">
          ❓ {{ 'clubPortal.help' | translate }}
        </button>
      </div>

      <app-club-help-modal [(visible)]="showHelp" [isSaas]="isSaas"></app-club-help-modal>

      <!-- SaaS quick actions: TV, remote, QR, preview -->
      <app-club-saas-actions
        *ngIf="siteDashboard?.site?.id && isSaas"
        [siteId]="siteDashboard!.site.id"
        [siteType]="siteDashboard!.site.site_type || ''">
      </app-club-saas-actions>

      <!-- Pi site dashboard -->
      <div class="status-cards" *ngIf="siteDashboard && !isSaas">
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
            <p class="status-detail" *ngIf="getLastSeen()">
              {{ 'clubPortal.lastSeen' | translate }}: {{ getLastSeen() | date:'dd/MM/yyyy HH:mm' }}
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

        <!-- Software Version + Last OTA -->
        <div class="card">
          <div class="card-icon">⚙️</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.version' | translate }}</h3>
            <p class="stat-number">{{ siteDashboard.site?.software_version || '-' }}</p>
            <p class="status-detail" *ngIf="siteDashboard.saasMetrics?.lastOtaDeployment as ota">
              <ng-container [ngSwitch]="ota.status">
                <span *ngSwitchCase="'completed'" class="ota-badge ota-ok">✓ {{ ota.version }}</span>
                <span *ngSwitchCase="'failed'" class="ota-badge ota-err">✕ {{ ota.version }}</span>
                <span *ngSwitchCase="'rolled_back'" class="ota-badge ota-err">↺ {{ ota.version }}</span>
                <span *ngSwitchDefault class="ota-badge ota-pending">⋯ {{ ota.version }}</span>
              </ng-container>
              · {{ (ota.completedAt || ota.createdAt) | date:'dd/MM HH:mm' }}
            </p>
          </div>
        </div>

        <!-- Active alerts (Pi only) -->
        <div class="card" *ngIf="(siteDashboard.saasMetrics?.activeAlertsCount || 0) > 0">
          <div class="card-icon">🚨</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.activeAlerts' | translate }}</h3>
            <p class="stat-number alert-count">{{ siteDashboard.saasMetrics?.activeAlertsCount }}</p>
            <p class="status-detail">{{ 'clubPortal.activeAlertsHint' | translate }}</p>
          </div>
        </div>
      </div>

      <!-- Pi engagement row: vidéos jouées + temps écran + complétion -->
      <div class="status-cards" *ngIf="siteDashboard && !isSaas && siteDashboard.saasMetrics">
        <div class="card">
          <div class="card-icon">🎬</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.videosPlayedToday' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ siteDashboard.saasMetrics?.todayVideosPlayed || 0 }}</p>
              <span class="trend-badge" *ngIf="getVideosTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">
              {{ siteDashboard.saasMetrics?.todaySessions || 0 }} {{ 'clubPortal.saas.sessionsLabel' | translate }}
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-icon">⏱️</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.todayScreenTime' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ formatDuration(siteDashboard.saasMetrics?.todayScreenTime || 0) }}</p>
              <span class="trend-badge" *ngIf="getScreenTimeTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">{{ 'clubPortal.saas.sinceMidnight' | translate }}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-icon">📊</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.weekPerformance' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ (siteDashboard.saasMetrics?.weekCompletionRate || 0) | number:'1.0-0' }}%</p>
              <span class="trend-badge" *ngIf="getCompletionTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">
              {{ 'clubPortal.saas.completionLabel' | translate }} · {{ siteDashboard.saasMetrics?.weekSponsorsDisplayed || 0 }} {{ 'clubPortal.saas.sponsorsShownLabel' | translate }}
            </p>
          </div>
        </div>
      </div>

      <!-- SaaS site dashboard -->
      <div class="status-cards" *ngIf="siteDashboard && isSaas">
        <!-- Connected clients (live) -->
        <div class="card status-card" [class.online]="(siteDashboard.saasMetrics?.connectedClients || 0) > 0">
          <div class="card-icon">
            <span class="status-dot" [class.online]="(siteDashboard.saasMetrics?.connectedClients || 0) > 0"></span>
          </div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.connectedClients' | translate }}</h3>
            <p class="status-text">{{ siteDashboard.saasMetrics?.connectedClients || 0 }}</p>
            <p class="status-detail">{{ 'clubPortal.saas.connectedClientsHint' | translate }}</p>
          </div>
        </div>

        <!-- Today videos played (primary) + sessions (secondary) -->
        <div class="card">
          <div class="card-icon">🎬</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.videosPlayedToday' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ siteDashboard.saasMetrics?.todayVideosPlayed || 0 }}</p>
              <span class="trend-badge" *ngIf="getVideosTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">
              {{ siteDashboard.saasMetrics?.todaySessions || 0 }} {{ 'clubPortal.saas.sessionsLabel' | translate }}
            </p>
          </div>
        </div>

        <!-- Today screen time -->
        <div class="card">
          <div class="card-icon">⏱️</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.todayScreenTime' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ formatDuration(siteDashboard.saasMetrics?.todayScreenTime || 0) }}</p>
              <span class="trend-badge" *ngIf="getScreenTimeTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">{{ 'clubPortal.saas.sinceMidnight' | translate }}</p>
          </div>
        </div>

        <!-- Week completion rate (primary) + sponsors (secondary) -->
        <div class="card">
          <div class="card-icon">📊</div>
          <div class="card-content">
            <h3>{{ 'clubPortal.saas.weekPerformance' | translate }}</h3>
            <div class="stat-row">
              <p class="stat-number">{{ (siteDashboard.saasMetrics?.weekCompletionRate || 0) | number:'1.0-0' }}%</p>
              <span class="trend-badge" *ngIf="getCompletionTrend() as trend" [ngClass]="trend.cls">
                {{ trend.icon }} {{ trend.label }}
              </span>
            </div>
            <p class="status-detail">
              {{ 'clubPortal.saas.completionLabel' | translate }} · {{ siteDashboard.saasMetrics?.weekSponsorsDisplayed || 0 }} {{ 'clubPortal.saas.sponsorsShownLabel' | translate }}
            </p>
          </div>
        </div>
      </div>

      <!-- Sparkline 7 jours (#2) -->
      <div class="sparkline-card" *ngIf="siteDashboard && hasSparklineData()">
        <div class="sparkline-header">
          <h3>{{ 'clubPortal.saas.last7DaysTitle' | translate }}</h3>
          <span class="sparkline-sub">{{ siteDashboard.saasMetrics?.weekVideosPlayed || 0 }} {{ 'clubPortal.saas.videosTotal' | translate }}</span>
        </div>
        <svg class="sparkline-svg" [attr.viewBox]="'0 0 ' + sparklineWidth + ' ' + sparklineHeight" preserveAspectRatio="none">
          <polyline
            [attr.points]="getSparklinePoints()"
            fill="none"
            stroke="var(--neo-hockey-dark, #2022E9)"
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round" />
          <polyline
            [attr.points]="getSparklineArea()"
            fill="url(#sparkline-gradient)"
            stroke="none"
            opacity="0.2" />
          <defs>
            <linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--neo-hockey-dark, #2022E9)" stop-opacity="0.5" />
              <stop offset="100%" stop-color="var(--neo-hockey-dark, #2022E9)" stop-opacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div class="sparkline-labels">
          <span *ngFor="let pt of siteDashboard.saasMetrics?.dailySparkline">
            {{ formatSparklineDay(pt.day) }}
          </span>
        </div>
      </div>

      <!-- Profil actif (#4) + Top vidéos (#3) -->
      <div class="insights-grid" *ngIf="siteDashboard && siteDashboard.saasMetrics">
        <!-- #4 Profil actif -->
        <div class="insight-card" *ngIf="siteDashboard.saasMetrics?.activeProfile as profile">
          <div class="insight-header">
            <span class="insight-icon">🎞️</span>
            <h3>{{ 'clubPortal.saas.activeProfileTitle' | translate }}</h3>
          </div>
          <div class="profile-body">
            <div class="profile-name">{{ profile.displayName || profile.name }}</div>
            <div class="profile-meta">
              <span>{{ profile.loopVideoCount }} {{ 'clubPortal.saas.profileVideos' | translate }}</span>
              <span class="dot">·</span>
              <span>{{ profile.sponsorCount }} {{ 'clubPortal.saas.profileSponsors' | translate }}</span>
            </div>
            <a routerLink="/club/loop" class="profile-link">
              {{ 'clubPortal.saas.editProfile' | translate }} →
            </a>
          </div>
        </div>

        <!-- #3 Top vidéos de la semaine -->
        <div class="insight-card" *ngIf="(siteDashboard.saasMetrics?.topVideos?.length || 0) > 0">
          <div class="insight-header">
            <span class="insight-icon">🏆</span>
            <h3>{{ 'clubPortal.saas.topVideosTitle' | translate }}</h3>
          </div>
          <ol class="top-videos-list">
            <li *ngFor="let v of siteDashboard.saasMetrics?.topVideos; let i = index">
              <span class="rank">{{ i + 1 }}</span>
              <div class="video-info">
                <span class="video-name" [title]="v.filename">{{ formatVideoName(v.filename) }}</span>
                <span class="video-stats">
                  {{ v.plays }} {{ 'clubPortal.saas.playsShort' | translate }} · {{ v.avgCompletion }}%
                </span>
              </div>
            </li>
          </ol>
        </div>
      </div>

      <!-- #5 Sponsors actifs -->
      <div class="sponsors-card" *ngIf="siteDashboard && (siteDashboard.saasMetrics?.activeSponsors?.length || 0) > 0">
        <div class="sponsors-header">
          <span class="insight-icon">💼</span>
          <h3>{{ 'clubPortal.saas.activeSponsorsTitle' | translate }}</h3>
        </div>
        <div class="sponsors-list">
          <div class="sponsor-item" *ngFor="let s of siteDashboard.saasMetrics?.activeSponsors">
            <div class="sponsor-logo">
              <img *ngIf="s.logoUrl" [src]="s.logoUrl" [alt]="s.name" />
              <span *ngIf="!s.logoUrl" class="sponsor-logo-placeholder">{{ s.name.charAt(0) }}</span>
            </div>
            <div class="sponsor-info">
              <span class="sponsor-name">{{ s.name }}</span>
              <span class="sponsor-stats">
                {{ s.videoCount }} {{ 'clubPortal.saas.sponsorVideos' | translate }}
                · {{ s.totalImpressions | number }} {{ 'clubPortal.saas.sponsorImpressions' | translate }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state hint when no activity -->
      <div class="empty-state-hint" *ngIf="siteDashboard && showEmptyStateHint()">
        <span class="hint-icon">💡</span>
        <span class="hint-text">{{ 'clubPortal.saas.emptyStateHint' | translate }}</span>
      </div>

      <!-- Quick action: manage loop -->
      <div class="quick-actions" *ngIf="siteDashboard && siteDashboard.saasMetrics">
        <a routerLink="/club/loop" class="action-link">
          <span class="action-icon">🎞️</span>
          <div class="action-text">
            <strong>{{ 'clubPortal.saas.manageLoopTitle' | translate }}</strong>
            <span>{{ 'clubPortal.saas.manageLoopHint' | translate }}</span>
          </div>
          <span class="action-arrow">→</span>
        </a>
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
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      h1 { font-size: 1.75rem; margin: 0; color: var(--text-primary); }
      .site-name { color: var(--text-secondary, #64748b); font-size: 0.875rem; }
    }
    .btn-help {
      padding: 0.5rem 0.9rem; border-radius: 8px;
      background: transparent; color: #64748b;
      border: 1px solid #e2e8f0;
      font-size: 0.8125rem; font-weight: 500; cursor: pointer;
      transition: all 0.15s;
    }
    .btn-help:hover { background: #f8fafc; color: #1e293b; }

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

    .empty-state-hint {
      margin-top: 1.5rem;
      padding: 0.875rem 1.125rem;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 10px;
      color: #92400e;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      .hint-icon { font-size: 1.125rem; }
    }

    .quick-actions {
      margin-top: 1.5rem;
    }
    .action-link {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.125rem 1.25rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      text-decoration: none;
      color: inherit;
      transition: all 0.15s;
      &:hover {
        border-color: var(--neo-hockey-dark, #2022E9);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .action-icon { font-size: 1.5rem; }
      .action-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        strong { font-size: 0.9375rem; color: var(--text-primary); }
        span { font-size: 0.8125rem; color: var(--text-secondary, #64748b); margin-top: 0.125rem; }
      }
      .action-arrow {
        font-size: 1.25rem;
        color: var(--neo-hockey-dark, #2022E9);
        font-weight: 600;
      }
    }

    /* #1 — Trend badges */
    .stat-row {
      display: flex;
      align-items: baseline;
      gap: 0.625rem;
      flex-wrap: wrap;
      .stat-number { margin: 0; }
    }
    .trend-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.1875rem 0.5rem;
      border-radius: 999px;
      white-space: nowrap;
    }
    .trend-up { background: #dcfce7; color: #166534; }
    .trend-down { background: #fee2e2; color: #991b1b; }
    .trend-flat { background: #f1f5f9; color: #64748b; }

    /* OTA badge inline (Pi version card) */
    .ota-badge {
      display: inline-block;
      font-weight: 600;
      font-size: 0.7rem;
      padding: 0.125rem 0.4rem;
      border-radius: 999px;
      margin-right: 0.25rem;
    }
    .ota-ok { background: #dcfce7; color: #166534; }
    .ota-err { background: #fee2e2; color: #991b1b; }
    .ota-pending { background: #fef3c7; color: #92400e; }

    /* Alert count highlight */
    .alert-count { color: #dc2626; }

    /* #2 — Sparkline */
    .sparkline-card {
      margin-top: 1.5rem;
      background: white;
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .sparkline-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.75rem;
      h3 {
        margin: 0;
        font-size: 0.875rem;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .sparkline-sub {
        font-size: 0.8125rem;
        color: var(--text-primary);
        font-weight: 600;
      }
    }
    .sparkline-svg {
      width: 100%;
      height: 80px;
      display: block;
    }
    .sparkline-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 0.375rem;
      font-size: 0.6875rem;
      color: #94a3b8;
      text-transform: capitalize;
    }

    /* #3 & #4 — Insights grid */
    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
      margin-top: 1.5rem;
    }
    .insight-card {
      background: white;
      border-radius: 12px;
      padding: 1.25rem 1.375rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .insight-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.875rem;
      .insight-icon { font-size: 1.125rem; }
      h3 {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }

    /* #4 — Active profile */
    .profile-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .profile-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    .profile-meta {
      font-size: 0.8125rem;
      color: var(--text-secondary, #64748b);
      display: flex;
      gap: 0.375rem;
      align-items: center;
      .dot { opacity: 0.5; }
    }
    .profile-link {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }

    /* #3 — Top videos list */
    .top-videos-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .rank {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        background: #f1f5f9;
        color: #475569;
        font-size: 0.75rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      li:first-child .rank { background: #fef3c7; color: #92400e; }
      .video-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .video-name {
        font-size: 0.875rem;
        color: var(--text-primary);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .video-stats {
        font-size: 0.75rem;
        color: var(--text-secondary, #64748b);
      }
    }

    /* #5 — Active sponsors */
    .sponsors-card {
      margin-top: 1.5rem;
      background: white;
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .sponsors-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      .insight-icon { font-size: 1.125rem; }
      h3 {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }
    .sponsors-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.875rem;
    }
    .sponsor-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
    }
    .sponsor-logo {
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 8px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    }
    .sponsor-logo-placeholder {
      font-size: 1rem;
      font-weight: 700;
      color: #64748b;
    }
    .sponsor-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      .sponsor-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sponsor-stats {
        font-size: 0.75rem;
        color: var(--text-secondary, #64748b);
      }
    }
  `]
})
export class ClubDashboardComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  siteDashboard: SiteDashboard | null = null;
  loading = true;
  error = '';
  showHelp = false;

  get isSaas(): boolean {
    return this.siteDashboard?.site?.site_type === 'saas';
  }

  // Sparkline SVG dimensions (viewBox coordinates — responsive via CSS)
  readonly sparklineWidth = 600;
  readonly sparklineHeight = 100;

  showEmptyStateHint(): boolean {
    const m = this.siteDashboard?.saasMetrics;
    if (!m) return false;
    // SaaS : pas de client connecté + pas d'activité
    // Pi : pas d'activité sur 7 jours (connectedClients non pertinent)
    if (this.isSaas) {
      return (m.connectedClients || 0) === 0 && (m.todayVideosPlayed || 0) === 0;
    }
    return (m.todayVideosPlayed || 0) === 0 && (m.weekVideosPlayed || 0) === 0;
  }

  // ============================================================
  // #1 Trends (↑↓)
  // ============================================================
  private computeTrend(current: number, previous: number): { icon: string; label: string; cls: string } | null {
    if (!current && !previous) return null;
    if (previous === 0) {
      return current > 0 ? { icon: '↑', label: 'Nouveau', cls: 'trend-up' } : null;
    }
    const delta = ((current - previous) / previous) * 100;
    const rounded = Math.round(delta);
    if (Math.abs(rounded) < 3) return { icon: '→', label: 'stable', cls: 'trend-flat' };
    if (rounded > 0) return { icon: '↑', label: `+${rounded}%`, cls: 'trend-up' };
    return { icon: '↓', label: `${rounded}%`, cls: 'trend-down' };
  }

  getVideosTrend() {
    const m = this.siteDashboard?.saasMetrics;
    if (!m || m.yesterdayVideosPlayed === undefined) return null;
    return this.computeTrend(m.todayVideosPlayed, m.yesterdayVideosPlayed);
  }

  getScreenTimeTrend() {
    const m = this.siteDashboard?.saasMetrics;
    if (!m || m.yesterdayScreenTime === undefined) return null;
    return this.computeTrend(m.todayScreenTime, m.yesterdayScreenTime);
  }

  getCompletionTrend() {
    const m = this.siteDashboard?.saasMetrics;
    if (!m || m.previousWeekCompletionRate === undefined) return null;
    // pour la complétion on compare en points de pourcentage, pas en %
    const delta = m.weekCompletionRate - m.previousWeekCompletionRate;
    if (Math.abs(delta) < 2) return { icon: '→', label: 'stable', cls: 'trend-flat' };
    if (delta > 0) return { icon: '↑', label: `+${delta}pts`, cls: 'trend-up' };
    return { icon: '↓', label: `${delta}pts`, cls: 'trend-down' };
  }

  // ============================================================
  // #2 Sparkline
  // ============================================================
  hasSparklineData(): boolean {
    const s = this.siteDashboard?.saasMetrics?.dailySparkline;
    return !!s && s.length > 1;
  }

  private getSparklineMax(): number {
    const s = this.siteDashboard?.saasMetrics?.dailySparkline || [];
    return Math.max(1, ...s.map((d) => d.videosPlayed));
  }

  getSparklinePoints(): string {
    const series = this.siteDashboard?.saasMetrics?.dailySparkline || [];
    if (series.length === 0) return '';
    const max = this.getSparklineMax();
    const pad = 4;
    const usableW = this.sparklineWidth - pad * 2;
    const usableH = this.sparklineHeight - pad * 2;
    const step = series.length > 1 ? usableW / (series.length - 1) : 0;
    return series
      .map((d, i) => {
        const x = pad + i * step;
        const y = pad + usableH - (d.videosPlayed / max) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  getSparklineArea(): string {
    const pts = this.getSparklinePoints();
    if (!pts) return '';
    const series = this.siteDashboard?.saasMetrics?.dailySparkline || [];
    const pad = 4;
    const lastX = pad + (series.length - 1) * ((this.sparklineWidth - pad * 2) / Math.max(1, series.length - 1));
    const bottomY = this.sparklineHeight - pad;
    return `${pad},${bottomY} ${pts} ${lastX.toFixed(1)},${bottomY}`;
  }

  formatSparklineDay(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  }

  // ============================================================
  // #3 Top videos
  // ============================================================
  formatVideoName(filename: string): string {
    if (!filename) return '';
    // Retire le chemin, l'extension et les préfixes numériques style "07_"
    const base = filename.split('/').pop() || filename;
    return base
      .replace(/\.[^.]+$/, '')
      .replace(/^\d+_/, '')
      .replace(/_/g, ' ');
  }

  getLastSeen(): string | null | undefined {
    return this.siteDashboard?.connection?.lastSeen ?? this.siteDashboard?.connection?.lastSeenAt;
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds < 60) return `${seconds || 0}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${minutes.toString().padStart(2, '0')}`;
    return `${minutes}min`;
  }

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
