import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ClubEntry {
  site_id: string;
  club_name: string;
  plays_today: number;
  status: string;
  availability_24h: number;
}

@Component({
  selector: 'app-top-clubs-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="card fade-in">
      <div class="card-header-row">
        <h2>Top clubs actifs</h2>
        <span class="card-badge">Aujourd'hui</span>
      </div>
      <div class="ranked-list" *ngIf="clubs.length > 0; else noTopClubs">
        <a *ngFor="let club of clubs; let i = index"
           [routerLink]="['/sites', club.site_id, 'analytics']"
           class="ranked-item">
          <span class="rank" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2">{{ i + 1 }}</span>
          <div class="ranked-info">
            <span class="ranked-name">{{ club.club_name }}</span>
            <span class="ranked-stat">{{ club.plays_today }} lectures</span>
          </div>
          <div class="ranked-bar-container">
            <div class="ranked-bar" [style.width.%]="getClubBarWidth(club.plays_today)"></div>
          </div>
        </a>
      </div>
      <ng-template #noTopClubs>
        <div class="empty-state">Aucune lecture aujourd'hui</div>
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

    .ranked-list { display: flex; flex-direction: column; gap: 8px; }

    .ranked-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 8px; background: #f8fafc;
      text-decoration: none; color: inherit; transition: background 0.15s;
    }
    .ranked-item:hover { background: #f1f5f9; }

    .rank {
      width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; background: #e2e8f0; color: #475569; flex-shrink: 0;
    }
    .rank-gold { background: #fef3c7; color: #b45309; }
    .rank-silver { background: #f1f5f9; color: #475569; }
    .rank-bronze { background: #fed7aa; color: #9a3412; }

    .ranked-info { flex: 1; min-width: 0; }
    .ranked-name { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ranked-stat { font-size: 12px; color: #64748b; }

    .ranked-bar-container { width: 80px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
    .ranked-bar { height: 100%; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 3px; transition: width 0.3s; }

    .empty-state { text-align: center; padding: 32px; color: #94a3b8; font-size: 14px; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `]
})
export class TopClubsCardComponent {
  @Input() clubs: ClubEntry[] = [];

  getClubBarWidth(plays: number): number {
    if (!this.clubs.length) return 0;
    const max = this.clubs[0]?.plays_today || 1;
    return (plays / max) * 100;
  }
}
