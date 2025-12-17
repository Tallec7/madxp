import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionStatusService } from '../../services/connection-status.service';

@Component({
  selector: 'app-connection-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="connection-indicator" [class.online]="isOnline()" [class.offline]="!isOnline()">
      <span class="status-dot"></span>
      <span class="status-text">{{ statusText() }}</span>
      @if (lastSyncText()) {
        <span class="last-sync">{{ lastSyncText() }}</span>
      }
    </div>
  `,
  styles: [`
    .connection-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.3s ease;
    }

    .connection-indicator.online {
      background: rgba(34, 197, 94, 0.15);
      color: #16a34a;
    }

    .connection-indicator.offline {
      background: rgba(239, 68, 68, 0.15);
      color: #dc2626;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .online .status-dot {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }

    .offline .status-dot {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }

    .status-text {
      white-space: nowrap;
    }

    .last-sync {
      opacity: 0.7;
      font-size: 10px;
      white-space: nowrap;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  `]
})
export class ConnectionIndicatorComponent {
  isOnline = computed(() => this.connectionService.isOnline());

  statusText = computed(() => {
    const status = this.connectionService.status();

    if (status.isOnline) {
      return 'Connecte au central';
    }

    if (!status.localServerConnected) {
      return 'Serveur local hors ligne';
    }

    return 'Mode hors ligne';
  });

  lastSyncText = computed(() => {
    const lastSync = this.connectionService.lastSync();
    if (!lastSync) return null;

    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Sync: maintenant';
    if (diffMins < 60) return `Sync: il y a ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Sync: il y a ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Sync: il y a ${diffDays}j`;
  });

  constructor(private connectionService: ConnectionStatusService) {}
}
