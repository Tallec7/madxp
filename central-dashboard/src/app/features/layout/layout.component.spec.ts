import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { LayoutComponent } from './layout.component';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { TranslationService } from '../../core/services/translation.service';
import { Router } from '@angular/router';

describe('LayoutComponent', () => {
  let component: LayoutComponent;
  let fixture: ComponentFixture<LayoutComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let socketService: jasmine.SpyObj<SocketService>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let confirmDialogService: jasmine.SpyObj<ConfirmDialogService>;
  let translationService: jasmine.SpyObj<TranslationService>;
  let router: Router;

  const mockUser = {
    id: '1',
    email: 'admin@test.com',
    full_name: 'Admin User',
    role: 'admin' as const,
  };

  const currentUserSubject = new BehaviorSubject<any>(mockUser);
  const notificationSubject = new Subject<{ type: string; message: string }>();
  const eventsSubject = new Subject<{ type: string; data?: any }>();

  beforeEach(async () => {
    const authServiceMock = jasmine.createSpyObj('AuthService', ['hasRole', 'logout', 'getSseToken'], {
      currentUser$: currentUserSubject.asObservable()
    });
    authServiceMock.hasRole.and.returnValue(true);
    authServiceMock.getSseToken.and.returnValue(null);

    const socketServiceMock = jasmine.createSpyObj('SocketService', ['isConnected', 'connect', 'disconnect'], {
      events$: eventsSubject.asObservable()
    });
    socketServiceMock.isConnected.and.returnValue(true);

    const notificationServiceMock = jasmine.createSpyObj('NotificationService', [], {
      notification$: notificationSubject.asObservable()
    });

    const confirmDialogServiceMock = jasmine.createSpyObj('ConfirmDialogService', ['confirm'], {
      dialog$: new Subject<any>().asObservable()
    });
    confirmDialogServiceMock.confirm.and.returnValue(Promise.resolve(true));

    const translationServiceMock = jasmine.createSpyObj('TranslationService', ['instant', 'initializeLanguage', 'setLanguage', 'getCurrentLanguage', 'getLanguageOption'], {
      currentLang$: new BehaviorSubject('fr').asObservable(),
      supportedLanguages: [
        { code: 'fr', label: 'Français', flag: '🇫🇷' },
        { code: 'en', label: 'English', flag: '🇬🇧' }
      ]
    });
    translationServiceMock.instant.and.callFake((key: string) => {
      const translations: Record<string, string> = {
        'roles.admin': 'Administrateur',
        'roles.operator': 'Opérateur',
        'roles.viewer': 'Observateur',
        'roles.super_admin': 'Super Admin',
        'auth.logoutConfirm': 'Voulez-vous vous déconnecter ?',
        'auth.logout': 'Déconnexion',
        'status.connected': 'Connecté',
        'status.disconnected': 'Déconnecté',
        'nav.dashboard': 'Dashboard',
        'nav.sites': 'Sites',
        'nav.groups': 'Groupes',
        'nav.advertisers': 'Annonceurs',
        'nav.content': 'Contenu',
        'nav.updates': 'Mises à jour',
        'nav.administration': 'Administration',
        'nav.users': 'Utilisateurs',
        'nav.agencies': 'Agences',
        'nav.localConsole': 'Console locale',
        'nav.skipToContent': 'Aller au contenu',
        'notifications.closeNotification': 'Fermer',
        'language.select': 'Langue',
      };
      return translations[key] || key;
    });
    translationServiceMock.getLanguageOption.and.callFake((code: string) => {
      const langs = [
        { code: 'fr', label: 'Français', flag: '🇫🇷' },
        { code: 'en', label: 'English', flag: '🇬🇧' }
      ];
      return langs.find(l => l.code === code);
    });

    await TestBed.configureTestingModule({
      imports: [LayoutComponent, RouterTestingModule, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: SocketService, useValue: socketServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: ConfirmDialogService, useValue: confirmDialogServiceMock },
        { provide: TranslationService, useValue: translationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    socketService = TestBed.inject(SocketService) as jasmine.SpyObj<SocketService>;
    notificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    confirmDialogService = TestBed.inject(ConfirmDialogService) as jasmine.SpyObj<ConfirmDialogService>;
    translationService = TestBed.inject(TranslationService) as jasmine.SpyObj<TranslationService>;
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should subscribe to currentUser', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.currentUser).toEqual(mockUser as any);
    }));

    it('should check socket connection status', () => {
      fixture.detectChanges();

      expect(socketService.isConnected).toHaveBeenCalled();
      expect(component.isConnected).toBe(true);
    });

    it('should start with empty notifications', () => {
      fixture.detectChanges();
      expect(component.notifications.length).toBe(0);
    });
  });

  describe('Socket Events', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should set isConnected to true on connected event', () => {
      component.isConnected = false;

      eventsSubject.next({ type: 'connected' });

      expect(component.isConnected).toBe(true);
    });

    it('should set isConnected to false on disconnected event', () => {
      component.isConnected = true;

      eventsSubject.next({ type: 'disconnected' });

      expect(component.isConnected).toBe(false);
    });

    it('should not show notification on command_completed', () => {
      eventsSubject.next({ type: 'command_completed' });

      // command_completed no longer triggers a global notification
      // (handled by the component that sent the command)
      expect(component.notifications.length).toBe(0);
    });

    it('should not show notification on deploy_progress at 100%', () => {
      eventsSubject.next({ type: 'deploy_progress', data: { progress: 100 } });

      // deploy_progress no longer triggers a global notification
      // (handled by site-content-tab component)
      expect(component.notifications.length).toBe(0);
    });

    it('should not show notification on deploy_progress below 100%', () => {
      eventsSubject.next({ type: 'deploy_progress', data: { progress: 50 } });

      expect(component.notifications.length).toBe(0);
    });

    it('should show warning on alert_created', () => {
      eventsSubject.next({ type: 'alert_created', data: { message: 'Alert!' } });

      expect(component.notifications.length).toBe(1);
      expect(component.notifications[0].type).toBe('warning');
    });
  });

  describe('Notification Handling', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should add notification from service', () => {
      notificationSubject.next({ type: 'info', message: 'Test message' });

      expect(component.notifications.length).toBe(1);
      expect(component.notifications[0].message).toBe('Test message');
    });

    it('should auto-dismiss notification after 5 seconds', fakeAsync(() => {
      component.showNotification('info', 'Test');
      expect(component.notifications.length).toBe(1);

      tick(5000);
      expect(component.notifications.length).toBe(0);
    }));

    it('should dismiss notification manually', () => {
      component.showNotification('info', 'Test');
      const notification = component.notifications[0];

      component.dismissNotification(notification);

      expect(component.notifications.length).toBe(0);
    });

    it('should increment notification id', () => {
      component.showNotification('info', 'Test 1');
      component.showNotification('info', 'Test 2');

      expect(component.notifications[0].id).not.toBe(component.notifications[1].id);
    });
  });

  describe('getNotificationIcon', () => {
    it('should return correct icons', () => {
      expect(component.getNotificationIcon('success')).toBe('✅');
      expect(component.getNotificationIcon('error')).toBe('❌');
      expect(component.getNotificationIcon('warning')).toBe('⚠️');
      expect(component.getNotificationIcon('info')).toBe('ℹ️');
    });

    it('should return info icon for unknown type', () => {
      expect(component.getNotificationIcon('unknown')).toBe('ℹ️');
    });
  });

  describe('canManageContent', () => {
    it('should call authService.hasRole with admin, super_admin and operator', () => {
      component.canManageContent();

      expect(authService.hasRole).toHaveBeenCalledWith('admin', 'super_admin', 'operator');
    });

    it('should return true when user has role', () => {
      authService.hasRole.and.returnValue(true);
      expect(component.canManageContent()).toBe(true);
    });

    it('should return false when user lacks role', () => {
      authService.hasRole.and.returnValue(false);
      expect(component.canManageContent()).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should call authService.hasRole with admin and super_admin', () => {
      component.isAdmin();

      expect(authService.hasRole).toHaveBeenCalledWith('admin', 'super_admin');
    });
  });

  describe('getUserInitials', () => {
    it('should return first two characters of full_name', () => {
      component.currentUser = mockUser as any;
      expect(component.getUserInitials()).toBe('AD');
    });

    it('should return first two characters of email when no full_name', () => {
      component.currentUser = { ...mockUser, full_name: '' } as any;
      expect(component.getUserInitials()).toBe('AD');
    });

    it('should return ? when no user', () => {
      component.currentUser = null;
      expect(component.getUserInitials()).toBe('?');
    });
  });

  describe('getRoleLabel', () => {
    it('should return Administrateur for admin', () => {
      component.currentUser = { ...mockUser, role: 'admin' } as any;
      expect(component.getRoleLabel()).toBe('Administrateur');
    });

    it('should return Opérateur for operator', () => {
      component.currentUser = { ...mockUser, role: 'operator' } as any;
      expect(component.getRoleLabel()).toBe('Opérateur');
    });

    it('should return Observateur for viewer', () => {
      component.currentUser = { ...mockUser, role: 'viewer' } as any;
      expect(component.getRoleLabel()).toBe('Observateur');
    });

    it('should return empty string when no user', () => {
      component.currentUser = null;
      expect(component.getRoleLabel()).toBe('');
    });
  });

  describe('logout', () => {
    it('should call authService.logout on confirm', fakeAsync(() => {
      confirmDialogService.confirm.and.returnValue(Promise.resolve(true));

      component.logout();
      tick();

      expect(socketService.disconnect).toHaveBeenCalled();
      expect(authService.logout).toHaveBeenCalled();
    }));

    it('should not logout on cancel', fakeAsync(() => {
      confirmDialogService.confirm.and.returnValue(Promise.resolve(false));

      component.logout();
      tick();

      expect(authService.logout).not.toHaveBeenCalled();
    }));
  });

  describe('Template', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should display sidebar with navigation', () => {
      const navItems = fixture.nativeElement.querySelectorAll('.nav-item');
      expect(navItems.length).toBeGreaterThan(0);
    });

    it('should display user info in footer', () => {
      const userAvatar = fixture.nativeElement.querySelector('.user-avatar');
      expect(userAvatar.textContent.trim()).toBe('AD');
    });

    it('should display connection status', () => {
      const connectionStatus = fixture.nativeElement.querySelector('.connection-status');
      expect(connectionStatus).toBeTruthy();
    });

    it('should show disconnected when not connected', () => {
      component.isConnected = false;
      fixture.detectChanges();

      const connectionStatus = fixture.nativeElement.querySelector('.connection-status');
      expect(connectionStatus).toBeTruthy();
      expect(connectionStatus.classList.contains('connected')).toBeFalse();
    });

    it('should display notifications when present', () => {
      component.showNotification('success', 'Test notification');
      fixture.detectChanges();

      const notification = fixture.nativeElement.querySelector('.notification');
      expect(notification).toBeTruthy();
    });
  });
});
