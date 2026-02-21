import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslationService } from '../../core/services/translation.service';
import { User } from '../../core/models';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, LanguageSelectorComponent, ConfirmDialogComponent],
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
      <!-- Mobile hamburger toggle -->
      <button class="hamburger-toggle" (click)="toggleSidebar()" [attr.aria-label]="'nav.toggleMenu' | translate" [attr.aria-expanded]="sidebarOpen">
        <span class="hamburger-icon" [class.open]="sidebarOpen">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      <!-- Mobile overlay backdrop -->
      <div class="sidebar-overlay" [class.visible]="sidebarOpen" (click)="closeSidebar()"></div>

      <aside class="sidebar" [class.sidebar-open]="sidebarOpen" role="complementary" [attr.aria-label]="'nav.dashboard' | translate">
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
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" [attr.aria-label]="'nav.dashboard' | translate">
            <span class="icon" aria-hidden="true">🏠</span>
            <span>{{ 'nav.dashboard' | translate }}</span>
          </a>
          <a routerLink="/analytics" routerLinkActive="active" class="nav-item" (click)="closeSidebar()">
            <span class="icon" aria-hidden="true">📈</span>
            <span>Analytics</span>
          </a>
          <a routerLink="/sites" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" [attr.aria-label]="'nav.sites' | translate">
            <span class="icon" aria-hidden="true">🖥️</span>
            <span>{{ 'nav.sites' | translate }}</span>
          </a>
          <a routerLink="/groups" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" [attr.aria-label]="'nav.groups' | translate">
            <span class="icon" aria-hidden="true">👥</span>
            <span>{{ 'nav.groups' | translate }}</span>
          </a>
          <a routerLink="/advertisers" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="nav-item" (click)="closeSidebar()" [attr.aria-label]="'nav.advertisers' | translate">
            <span class="icon" aria-hidden="true">💼</span>
            <span>{{ 'nav.advertisers' | translate }}</span>
          </a>
          <a routerLink="/advertisers/health" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" *ngIf="canManageContent()" aria-label="Sante Annonceurs">
            <span class="icon" aria-hidden="true">🩺</span>
            <span>Sante Annonceurs</span>
          </a>

          <!-- Portals section for admin users -->
          <div class="nav-section" *ngIf="isAdmin()" role="group" aria-label="Portails">
            <div class="nav-section-title" id="portals-section">Portails</div>
            <a routerLink="/advertiser-portal" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="portals-section">
              <span class="icon" aria-hidden="true">🎯</span>
              <span>Portail Annonceur</span>
            </a>
            <a routerLink="/agency-portal" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="portals-section">
              <span class="icon" aria-hidden="true">🏢</span>
              <span>Portail Agence</span>
            </a>
          </div>

          <a routerLink="/content" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" *ngIf="canManageContent()" [attr.aria-label]="'nav.content' | translate">
            <span class="icon" aria-hidden="true">📹</span>
            <span>{{ 'nav.content' | translate }}</span>
          </a>
          <a routerLink="/updates" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" *ngIf="canManageContent()" [attr.aria-label]="'nav.updates' | translate">
            <span class="icon" aria-hidden="true">🔄</span>
            <span>{{ 'nav.updates' | translate }}</span>
          </a>

          <div class="nav-section" *ngIf="isAdmin()" role="group" [attr.aria-label]="'nav.administration' | translate">
            <div class="nav-section-title" id="admin-section">{{ 'nav.administration' | translate }}</div>
            <a routerLink="/subscriptions" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="admin-section">
              <span class="icon" aria-hidden="true">💳</span>
              <span>Abonnements</span>
            </a>
            <a routerLink="/admin/users" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="admin-section" [attr.aria-label]="'nav.users' | translate">
              <span class="icon" aria-hidden="true">👤</span>
              <span>{{ 'nav.users' | translate }}</span>
            </a>
            <a routerLink="/admin/agencies" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="admin-section" [attr.aria-label]="'nav.agencies' | translate">
              <span class="icon" aria-hidden="true">🏢</span>
              <span>{{ 'nav.agencies' | translate }}</span>
            </a>
            <a routerLink="/admin/local" routerLinkActive="active" class="nav-item" (click)="closeSidebar()" aria-describedby="admin-section" [attr.aria-label]="'nav.localConsole' | translate">
              <span class="icon" aria-hidden="true">🛠️</span>
              <span>{{ 'nav.localConsole' | translate }}</span>
            </a>
          </div>
        </nav>

        <div class="sidebar-footer" role="contentinfo">
          <div class="footer-top">
            <app-language-selector></app-language-selector>
          </div>
          <div class="footer-user">
            <div class="user-avatar" aria-hidden="true">{{ getUserInitials() }}</div>
            <div class="user-details">
              <div class="user-name">{{ currentUser?.full_name || currentUser?.email }}</div>
              <div class="user-role">{{ getRoleLabel() }}</div>
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

    <!-- Global confirm dialog (replaces native window.confirm) -->
    <app-confirm-dialog></app-confirm-dialog>
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
      flex-direction: column;
      gap: 0.75rem;
    }

    .footer-top {
      display: flex;
      justify-content: flex-start;
    }

    .footer-user {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 10px;
    }

    .user-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--neo-hockey-dark, #2022E9) 0%, var(--neo-purple-dark, #3A0686) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.8rem;
      flex-shrink: 0;
    }

    .user-details {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 0.8125rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    .user-role {
      font-size: 0.6875rem;
      color: rgba(255, 255, 255, 0.6);
      text-transform: capitalize;
      line-height: 1.3;
    }

    .btn-logout {
      background: rgba(239, 68, 68, 0.15);
      border: none;
      color: #f87171;
      padding: 0.5rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .btn-logout:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
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

    /* ── Hamburger toggle button ── */
    .hamburger-toggle {
      display: none;
      position: fixed;
      top: 0.75rem;
      left: 0.75rem;
      z-index: 1100;
      background: var(--neo-black, #000000);
      border: none;
      border-radius: 8px;
      padding: 0.625rem;
      cursor: pointer;
      width: 44px;
      height: 44px;
      align-items: center;
      justify-content: center;
    }

    .hamburger-icon {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 5px;
      width: 22px;
      height: 22px;
      position: relative;
    }

    .hamburger-icon span {
      display: block;
      width: 22px;
      height: 2px;
      background: white;
      border-radius: 2px;
      transition: transform 0.3s ease, opacity 0.3s ease;
      transform-origin: center;
    }

    .hamburger-icon.open span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .hamburger-icon.open span:nth-child(2) {
      opacity: 0;
    }

    .hamburger-icon.open span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    /* ── Overlay backdrop ── */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .sidebar-overlay.visible {
      opacity: 1;
    }

    /* ── Mobile responsive: hamburger + drawer ── */
    @media (max-width: 768px) {
      .hamburger-toggle {
        display: flex;
      }

      .sidebar-overlay {
        display: block;
        pointer-events: none;
      }

      .sidebar-overlay.visible {
        pointer-events: auto;
      }

      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 280px;
        z-index: 1000;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        overflow-y: auto;
      }

      .sidebar.sidebar-open {
        transform: translateX(0);
      }

      .main-content {
        margin-left: 0;
        width: 100%;
      }
    }

    /* ── iPhone / small mobile ── */
    @media (max-width: 375px) {
      .sidebar {
        width: 100%;
      }

      .hamburger-toggle {
        top: 0.5rem;
        left: 0.5rem;
      }
    }

    /* ── Reduced motion ── */
    @media (prefers-reduced-motion: reduce) {
      .sidebar {
        transition: none;
      }

      .sidebar-overlay {
        transition: none;
      }

      .hamburger-icon span {
        transition: none;
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

    .hamburger-toggle:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
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
  sidebarOpen = false;
  private notificationId = 0;
  private subscriptions = new Subscription();

  private static readonly MOBILE_BREAKPOINT = 768;

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
          // Ne pas afficher de notification globale ici -
          // le composant qui a lancé la commande gère son propre feedback
          break;
        case 'deploy_progress':
          // Ne pas afficher de notification globale ici -
          // le composant site-content-tab gère son propre feedback avec le nom du fichier
          break;
        case 'alert_created':
          this.showNotification('warning', event.data.message);
          break;
      }
    }));

    this.isConnected = this.socketService.isConnected();

    // Close mobile sidebar on route navigation
    this.subscriptions.add(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.closeSidebar();
      })
    );
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth > LayoutComponent.MOBILE_BREAKPOINT && this.sidebarOpen) {
      this.closeSidebar();
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  canManageContent(): boolean {
    return this.authService.hasRole('admin', 'super_admin', 'operator');
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin', 'super_admin');
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

  private readonly confirmDialog = inject(ConfirmDialogService);

  async logout(): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      this.translationService.instant('auth.logoutConfirm'),
      { title: 'Déconnexion', confirmLabel: 'Se déconnecter', confirmStyle: 'primary' },
    );
    if (!ok) return;
    this.socketService.disconnect();
    this.authService.logout();
  }
}
