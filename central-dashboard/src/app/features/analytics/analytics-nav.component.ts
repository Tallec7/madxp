import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { take } from 'rxjs/operators';

interface NavTab {
  path: string;
  label: string;
  icon: string;
  adminOnly: boolean;
}

@Component({
  selector: 'app-analytics-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="analytics-nav" role="tablist">
      <ng-container *ngFor="let tab of visibleTabs">
        <a
          [routerLink]="tab.path"
          routerLinkActive="active"
          #rla="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: tab.path === '/analytics' }"
          class="nav-tab"
          role="tab"
          [attr.aria-selected]="rla.isActive"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </a>
      </ng-container>
    </nav>
  `,
  styles: [`
    .analytics-nav {
      display: flex;
      gap: 4px;
      padding: 4px;
      background: #f1f5f9;
      border-radius: 10px;
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }

    .nav-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #64748b;
      text-decoration: none;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .nav-tab:hover {
      color: #334155;
      background: #e2e8f0;
    }

    .nav-tab.active {
      color: #0f172a;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .tab-icon {
      font-size: 1rem;
    }

    .tab-label {
      display: inline;
    }

    @media (max-width: 640px) {
      .tab-label {
        display: none;
      }

      .nav-tab {
        padding: 8px 12px;
      }
    }
  `]
})
export class AnalyticsNavComponent {
  private readonly authService = inject(AuthService);

  private readonly allTabs: NavTab[] = [
    { path: '/analytics', label: 'Flotte', icon: '🖥️', adminOnly: false },
    { path: '/analytics/traction', label: 'Traction', icon: '📈', adminOnly: true },
    { path: '/analytics/comparison', label: 'Comparaison', icon: '📊', adminOnly: true },
    { path: '/analytics/realtime', label: 'Temps reel', icon: '⚡', adminOnly: true },
  ];

  visibleTabs: NavTab[] = [];

  constructor() {
    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
      this.visibleTabs = this.allTabs.filter(tab => !tab.adminOnly || isAdmin);
    });
  }
}
