import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SitesService } from '../../core/services/sites.service';
import { ConnectionDisplayStatus, SiteConnectionStatus } from '../../core/models';
import { Subscription, interval, startWith, switchMap, catchError, of, tap } from 'rxjs';

@Component({
  selector: 'app-connection-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="connection-indicator" [class]="'status-' + displayStatus" [title]="tooltip">
      <span class="indicator-dot"></span>
      <span class="indicator-text" *ngIf="showText">{{ statusText }}</span>
      <span class="indicator-details" *ngIf="showDetails && connectionStatus">
        <span class="uptime" *ngIf="connectionStatus.statistics.uptime24h !== undefined">
          {{ connectionStatus.statistics.uptime24h.toFixed(1) }}% uptime
        </span>
        <span class="last-seen" *ngIf="connectionStatus.connection.lastSeenAt">
          {{ formatLastSeen(connectionStatus.connection.secondsSinceLastSeen) }}
        </span>
      </span>
    </div>
  `,
  styles: [`
    .connection-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      background: var(--bg-secondary, #f5f5f5);
    }

    .indicator-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-online .indicator-dot {
      background: #22c55e;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
    }

    .status-warning .indicator-dot {
      background: #f59e0b;
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3);
      animation: pulse-warning 1s infinite;
    }

    .status-offline .indicator-dot {
      background: #ef4444;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
      animation: none;
    }

    .status-unknown .indicator-dot {
      background: #9ca3af;
      box-shadow: 0 0 0 2px rgba(156, 163, 175, 0.3);
      animation: none;
    }

    .indicator-text {
      font-weight: 500;
    }

    .status-online .indicator-text { color: #16a34a; }
    .status-warning .indicator-text { color: #d97706; }
    .status-offline .indicator-text { color: #dc2626; }
    .status-unknown .indicator-text { color: #6b7280; }

    .indicator-details {
      display: flex;
      gap: 0.5rem;
      color: #6b7280;
      font-size: 0.75rem;
    }

    .indicator-details .uptime,
    .indicator-details .last-seen {
      padding: 0.125rem 0.375rem;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 0.25rem;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    @keyframes pulse-warning {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
  `]
})
export class ConnectionIndicatorComponent implements OnInit, OnDestroy {
  private readonly sitesService = inject(SitesService);

  @Input() siteId!: string;
  @Input() showText = true;
  @Input() showDetails = false;
  @Input() refreshInterval = 30000; // 30 secondes par defaut

  connectionStatus: SiteConnectionStatus | null = null;
  displayStatus: ConnectionDisplayStatus = 'unknown';
  private subscription: Subscription | null = null;
  private errorCount = 0;

  ngOnInit(): void {
    if (this.siteId) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.subscription = interval(this.refreshInterval).pipe(
      startWith(0),
      switchMap(() => this.sitesService.getConnectionStatus(this.siteId).pipe(
        tap(() => {
          // Reset error count on success
          this.errorCount = 0;
        }),
        catchError((error) => {
          this.errorCount++;
          // Only log first few errors to avoid spam
          if (this.errorCount <= 3) {
            console.warn(`[ConnectionIndicator] Failed to get status for site ${this.siteId}:`, error?.message || error);
          }
          return of(null);
        })
      ))
    ).subscribe(status => {
      if (status) {
        this.connectionStatus = status;
        this.displayStatus = status.connection.displayStatus;
      } else if (this.errorCount > 0 && !this.connectionStatus) {
        // If we never got a successful response, show a more helpful status
        // The actual status will be determined once the API responds successfully
        this.displayStatus = 'unknown';
      }
    });
  }

  private stopPolling(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  get statusText(): string {
    switch (this.displayStatus) {
      case 'online': return 'Connecte';
      case 'warning': return 'Connexion instable';
      case 'offline': return 'Hors ligne';
      case 'unknown': return 'Inconnu';
      default: return 'Inconnu';
    }
  }

  get tooltip(): string {
    if (!this.connectionStatus) {
      return 'Chargement...';
    }
    const s = this.connectionStatus.statistics;
    return `Statut: ${this.statusText}
Uptime 24h: ${s.uptime24h.toFixed(1)}%
Heartbeats 24h: ${s.heartbeats24h}`;
  }

  formatLastSeen(seconds: number | null): string {
    if (seconds === null) return 'Jamais';
    if (seconds < 60) return 'Il y a moins d\'une minute';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)} h`;
    return `Il y a ${Math.floor(seconds / 86400)} j`;
  }
}
