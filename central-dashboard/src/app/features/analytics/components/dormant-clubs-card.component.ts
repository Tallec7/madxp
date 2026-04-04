import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface DormantClubEntry {
  site_id: string;
  club_name: string;
  status: string;
  plays_today: number;
  availability_24h: number;
}

@Component({
  selector: 'app-dormant-clubs-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="card fade-in">
      <div class="card-header-row">
        <h2>Clubs a relancer</h2>
        <span class="card-badge badge-warning" *ngIf="clubs.length > 0">{{ clubs.length }}</span>
      </div>
      <div class="alert-list" *ngIf="clubs.length > 0; else noDormant">
        <a *ngFor="let club of clubs"
           [routerLink]="['/sites', club.site_id]"
           class="alert-item">
          <div class="alert-indicator" [class.offline]="club.status === 'offline'" [class.dormant]="club.status !== 'offline'"></div>
          <div class="alert-info">
            <span class="alert-name">{{ club.club_name }}</span>
            <span class="alert-reason" *ngIf="club.status === 'offline'">Hors ligne</span>
            <span class="alert-reason" *ngIf="club.status !== 'offline'">0 lecture aujourd'hui</span>
          </div>
          <span class="alert-avail" [class.low]="club.availability_24h < 80">{{ club.availability_24h.toFixed(0) || 0 }}% dispo</span>
        </a>
      </div>
      <ng-template #noDormant>
        <div class="empty-state success">Tous les clubs sont actifs</div>
      </ng-template>
    </div>
  `,
  styles: [`
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }

    .card h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }

    .card-header-row { display: flex; justify-content: space-between; align-items: center; }
    .card-badge { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: #eff6ff; color: #2563eb; font-weight: 500; }
    .badge-warning { background: #fef3c7; color: #b45309; }

    .alert-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }

    .alert-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.15s;
    }
    .alert-item:hover { background: #f8fafc; }

    .alert-indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .alert-indicator.offline { background: #ef4444; }
    .alert-indicator.dormant { background: #f59e0b; }

    .alert-info { flex: 1; min-width: 0; }
    .alert-name { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alert-reason { font-size: 12px; color: #94a3b8; }

    .alert-avail { font-size: 12px; color: #64748b; flex-shrink: 0; }
    .alert-avail.low { color: #ef4444; font-weight: 500; }

    .empty-state { text-align: center; padding: 32px; color: #94a3b8; font-size: 14px; }
    .empty-state.success { color: #059669; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `]
})
export class DormantClubsCardComponent {
  @Input() clubs: DormantClubEntry[] = [];
}
