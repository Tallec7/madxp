import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslationService } from '../../core/services/translation.service';
import { User } from '../../core/models';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, LanguageSelectorComponent],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ],
  template: `
    <!-- Skip link pour navigation clavier -->
    <a href="#main-content" class="skip-link">{{ 'nav.skipToContent' | translate }}</a>

    <div class="layout">
      <aside class="sidebar" role="complementary" [attr.aria-label]="'nav.dashboard' | translate">
        <div class="sidebar-header">
          <img src="assets/neopro-logo-white.png" alt="Neopro Dashboard Central" class="sidebar-logo" />
          <span
            class="connection-status"
            [class.connected]="isConnected"
            role="status"
            [attr.aria-label]="isConnected ? ('status.connected' | translate) : ('status.disconnected' | translate)"
          >
            <span class="status-dot" aria-hidden="true"></span>
            {{ isConnected ? ('status.connected' | translate) : ('status.disconnected' | translate) }}
          </span>
        </div>

        <nav class="sidebar-nav" [attr.aria-label]="'nav.dashboard' | translate">
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item" [attr.aria-label]="'nav.dashboard' | translate">
            <span class="icon" aria-hidden="true">📊</span>
            <span>{{ 'nav.dashboard' | translate }}</span>
          </a>
          <a routerLink="/sites" routerLinkActive="active" class="nav-item" [attr.aria-label]="'nav.sites' | translate">
            <span class="icon" aria-hidden="true">🖥️</span>
            <span>{{ 'nav.sites' | translate }}</span>
          </a>
          <a routerLink="/groups" routerLinkActive="active" class="nav-item" [attr.aria-label]="'nav.groups' | translate">
            <span class="icon" aria-hidden="true">👥</span>
            <span>{{ 'nav.groups' | translate }}</span>
          </a>
          <a routerLink="/sponsors" routerLinkActive="active" class="nav-item" [attr.aria-label]="'nav.sponsors' | translate">
            <span class="icon" aria-hidden="true">💼</span>
            <span>{{ 'nav.sponsors' | translate }}</span>
          </a>
          <a routerLink="/content" routerLinkActive="active" class="nav-item" *ngIf="canManageContent()" [attr.aria-label]="'nav.content' | translate">
            <span class="icon" aria-hidden="true">📹</span>
            <span>{{ 'nav.content' | translate }}</span>
          </a>
          <a routerLink="/updates" routerLinkActive="active" class="nav-item" *ngIf="canManageContent()" [attr.aria-label]="'nav.updates' | translate">
            <span class="icon" aria-hidden="true">🔄</span>
            <span>{{ 'nav.updates' | translate }}</span>
          </a>
          <a routerLink="/analytics" routerLinkActive="active" class="nav-item" *ngIf="canManageContent()" [attr.aria-label]="'nav.analytics' | translate">
            <span class="icon" aria-hidden="true">📈</span>
            <span>{{ 'nav.analytics' | translate }}</span>
          </a>

          <div class="nav-section" *ngIf="isAdmin()" role="group" [attr.aria-label]="'nav.administration' | translate">
            <div class="nav-section-title" id="admin-section">{{ 'nav.administration' | translate }}</div>
            <a routerLink="/admin/users" routerLinkActive="active" class="nav-item" aria-describedby="admin-section" [attr.aria-label]="'nav.users' | translate">
              <span class="icon" aria-hidden="true">👤</span>
              <span>{{ 'nav.users' | translate }}</span>
            </a>
            <a routerLink="/admin/agencies" routerLinkActive="active" class="nav-item" aria-describedby="admin-section" [attr.aria-label]="'nav.agencies' | translate">
              <span class="icon" aria-hidden="true">🏢</span>
              <span>{{ 'nav.agencies' | translate }}</span>
            </a>
            <a routerLink="/admin/analytics-categories" routerLinkActive="active" class="nav-item" aria-describedby="admin-section" [attr.aria-label]="'nav.analyticsCategories' | translate">
              <span class="icon" aria-hidden="true">🏷️</span>
              <span>{{ 'nav.analyticsCategories' | translate }}</span>
            </a>
            <a routerLink="/admin/local" routerLinkActive="active" class="nav-item" aria-describedby="admin-section" [attr.aria-label]="'nav.localConsole' | translate">
              <span class="icon" aria-hidden="true">🛠️</span>
              <span>{{ 'nav.localConsole' | translate }}</span>
            </a>
          </div>
        </nav>

        <div class="sidebar-footer" role="contentinfo">
          <app-language-selector></app-language-selector>
          <div class="user-info">
            <div class="user-avatar" aria-hidden="true">{{ getUserInitials() }}</div>
            <div class="user-details">
              <div class="user-name">{{ currentUser?.full_name || currentUser?.email }}</div>
              <div class="user-role">{{ getRoleLabel() }}</div>
            </div>
          </div>
          <button
            class="btn-logout"
            (click)="logout()"
            [attr.aria-label]="'auth.logout' | translate"
            [title]="'auth.logout' | translate"
          >
            <span aria-hidden="true">🚪</span>
          </button>
        </div>
      </aside>

      <main id="main-content" class="main-content" role="main">
        <div
          class="notifications"
          *ngIf="notifications.length > 0"
          role="region"
          aria-live="polite"
        >
          <div
            *ngFor="let notification of notifications; trackBy: trackNotification"
            [class]="'notification notification-' + notification.type"
            role="alert"
            [@slideIn]
          >
            <span class="notification-icon" aria-hidden="true">{{ getNotificationIcon(notification.type) }}</span>
            <span class="notification-message">{{ notification.message }}</span>
            <button
              class="notification-close"
              (click)="dismissNotification(notification)"
              [attr.aria-label]="'notifications.closeNotification' | translate"
            >×</button>
          </div>
        </div>

        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .layout {
      display: flex;
      min-height: 100vh;
      background: var(--bg-color);
    }

    .sidebar {
      width: 260px;
      background: var(--neo-black, #000000);
      color: white;
      display: flex;
      flex-direction: column;
      box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
    }

    .sidebar-header {
      padding: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .sidebar-logo {
      max-width: 140px;
      height: auto;
      margin-bottom: 0.5rem;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      animation: pulse 2s infinite;
    }

    .connection-status.connected .status-dot {
      background: var(--neo-hand-light, #51B28B);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .sidebar-nav {
      flex: 1;
      padding: 1rem 0;
    }

    .nav-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .nav-section-title {
      padding: 0.5rem 1.5rem;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 600;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1.5rem;
      color: #cbd5e1;
      text-decoration: none;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: white;
    }

    .nav-item.active {
      background: rgba(32, 34, 233, 0.2);
      border-left-color: var(--neo-hockey-dark, #2022E9);
      color: white;
    }

    .nav-item .icon {
      font-size: 1.25rem;
    }

    .sidebar-footer {
      padding: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--neo-hockey-dark, #2022E9) 0%, var(--neo-purple-dark, #3A0686) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .user-details {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: capitalize;
    }

    .btn-logout {
      background: rgba(239, 68, 68, 0.1);
      border: none;
      color: #ef4444;
      padding: 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1.25rem;
    }

    .btn-logout:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
      position: relative;
    }

    .notifications {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 400px;
    }

    .notification {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-left: 4px solid;
    }

    .notification-success { border-left-color: var(--neo-hand-light, #51B28B); }
    .notification-error { border-left-color: var(--neo-futsal-light, #FE5949); }
    .notification-warning { border-left-color: var(--neo-volley-dark, #FDBE00); }
    .notification-info { border-left-color: var(--neo-hockey-dark, #2022E9); }

    .notification-icon {
      font-size: 1.25rem;
    }

    .notification-message {
      flex: 1;
      font-size: 0.875rem;
    }

    .notification-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notification-close:hover {
      color: #64748b;
    }

    @media (max-width: 768px) {
      .sidebar {
        width: 70px;
      }

      .sidebar-header h1,
      .connection-status,
      .nav-item span:not(.icon),
      .user-details,
      .btn-logout {
        display: none;
      }

      .sidebar-header {
        padding: 1rem;
        text-align: center;
      }

      .nav-item {
        justify-content: center;
        padding: 1rem;
      }

      .user-info {
        justify-content: center;
      }
    }

    /* WCAG AA Accessibility */
    .skip-link {
      position: absolute;
      top: -100%;
      left: 0;
      background: var(--neo-hockey-dark, #2022E9);
      color: white;
      padding: 1rem;
      z-index: 9999;
      text-decoration: none;
      font-weight: 600;
    }

    .skip-link:focus {
      top: 0;
    }

    /* Focus visible styles pour navigation clavier */
    .nav-item:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -3px;
      background: rgba(255, 255, 255, 0.1);
    }

    .btn-logout:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
    }

    .notification-close:focus-visible {
      outline: 2px solid var(--neo-hockey-dark, #2022E9);
      outline-offset: 2px;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .nav-item.active {
        border-left-width: 5px;
      }
      .status-dot {
        border: 2px solid currentColor;
      }
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .status-dot {
        animation: none;
      }
    }
  `]
})
export class LayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly socketService = inject(SocketService);
  private readonly notificationService = inject(NotificationService);
  private readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  currentUser: User | null = null;
  isConnected = false;
  notifications: Array<{id: number; type: string; message: string}> = [];
  private notificationId = 0;
  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.authService.currentUser$.subscribe(user => {
        this.currentUser = user;
        // Connecter le WebSocket quand l'utilisateur est authentifié
        if (user) {
          const token = this.authService.getSseToken();
          if (token && !this.socketService.isConnected()) {
            this.socketService.connect(token);
          }
        }
      })
    );

    this.subscriptions.add(
      this.notificationService.notification$.subscribe(notification => {
        this.showNotification(notification.type, notification.message);
      })
    );

    this.subscriptions.add(
      this.socketService.events$.subscribe(event => {
      switch (event.type) {
        case 'connected':
          this.isConnected = true;
          break;
        case 'disconnected':
          this.isConnected = false;
          break;
        case 'command_completed':
          this.showNotification('success', 'Commande exécutée avec succès');
          break;
        case 'deploy_progress':
          if (event.data.progress === 100) {
            this.showNotification('success', 'Déploiement terminé');
          }
          break;
        case 'alert_created':
          this.showNotification('warning', event.data.message);
          break;
      }
    }));

    this.isConnected = this.socketService.isConnected();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  canManageContent(): boolean {
    return this.authService.hasRole('admin', 'operator');
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin');
  }

  getUserInitials(): string {
    if (!this.currentUser) return '?';
    const name = this.currentUser.full_name || this.currentUser.email;
    return name.substring(0, 2).toUpperCase();
  }

  getRoleLabel(): string {
    if (!this.currentUser) return '';
    return this.translationService.instant(`roles.${this.currentUser.role}`);
  }

  showNotification(type: string, message: string): void {
    const id = this.notificationId++;
    this.notifications.push({ id, type, message });

    setTimeout(() => {
      this.notifications = this.notifications.filter(n => n.id !== id);
    }, 5000);
  }

  dismissNotification(notification: {id: number; type: string; message: string}): void {
    this.notifications = this.notifications.filter(n => n.id !== notification.id);
  }

  trackNotification(index: number, notification: {id: number; type: string; message: string}): number {
    return notification.id;
  }

  getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  logout(): void {
    if (confirm(this.translationService.instant('auth.logoutConfirm'))) {
      this.socketService.disconnect();
      this.authService.logout();
    }
  }
}
