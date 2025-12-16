import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, Subject } from 'rxjs';
import { LayoutComponent } from './layout.component';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { Router } from '@angular/router';

describe('LayoutComponent', () => {
  let component: LayoutComponent;
  let fixture: ComponentFixture<LayoutComponent>;
  let authService: jest.Mocked<AuthService>;
  let socketService: jest.Mocked<SocketService>;
  let notificationService: jest.Mocked<NotificationService>;
  let router: jest.Mocked<Router>;

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
    const authServiceMock = {
      currentUser$: currentUserSubject.asObservable(),
      hasRole: jest.fn().mockReturnValue(true),
      logout: jest.fn(),
    };

    const socketServiceMock = {
      events$: eventsSubject.asObservable(),
      isConnected: jest.fn().mockReturnValue(true),
    };

    const notificationServiceMock = {
      notification$: notificationSubject.asObservable(),
    };

    const routerMock = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LayoutComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: SocketService, useValue: socketServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as jest.Mocked<AuthService>;
    socketService = TestBed.inject(SocketService) as jest.Mocked<SocketService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
    router = TestBed.inject(Router) as jest.Mocked<Router>;
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

      expect(component.currentUser).toEqual(mockUser);
    }));

    it('should check socket connection status', () => {
      fixture.detectChanges();

      expect(socketService.isConnected).toHaveBeenCalled();
      expect(component.isConnected).toBe(true);
    });

    it('should start with empty notifications', () => {
      fixture.detectChanges();
      expect(component.notifications).toHaveLength(0);
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

    it('should show notification on command_completed', () => {
      eventsSubject.next({ type: 'command_completed' });

      expect(component.notifications).toHaveLength(1);
      expect(component.notifications[0].type).toBe('success');
    });

    it('should show notification on deploy_progress at 100%', () => {
      eventsSubject.next({ type: 'deploy_progress', data: { progress: 100 } });

      expect(component.notifications).toHaveLength(1);
    });

    it('should not show notification on deploy_progress below 100%', () => {
      eventsSubject.next({ type: 'deploy_progress', data: { progress: 50 } });

      expect(component.notifications).toHaveLength(0);
    });

    it('should show warning on alert_created', () => {
      eventsSubject.next({ type: 'alert_created', data: { message: 'Alert!' } });

      expect(component.notifications).toHaveLength(1);
      expect(component.notifications[0].type).toBe('warning');
    });
  });

  describe('Notification Handling', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should add notification from service', () => {
      notificationSubject.next({ type: 'info', message: 'Test message' });

      expect(component.notifications).toHaveLength(1);
      expect(component.notifications[0].message).toBe('Test message');
    });

    it('should auto-dismiss notification after 5 seconds', fakeAsync(() => {
      component.showNotification('info', 'Test');
      expect(component.notifications).toHaveLength(1);

      tick(5000);
      expect(component.notifications).toHaveLength(0);
    }));

    it('should dismiss notification manually', () => {
      component.showNotification('info', 'Test');
      const notification = component.notifications[0];

      component.dismissNotification(notification);

      expect(component.notifications).toHaveLength(0);
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
    it('should call authService.hasRole with admin and operator', () => {
      component.canManageContent();

      expect(authService.hasRole).toHaveBeenCalledWith('admin', 'operator');
    });

    it('should return true when user has role', () => {
      authService.hasRole.mockReturnValue(true);
      expect(component.canManageContent()).toBe(true);
    });

    it('should return false when user lacks role', () => {
      authService.hasRole.mockReturnValue(false);
      expect(component.canManageContent()).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should call authService.hasRole with admin', () => {
      component.isAdmin();

      expect(authService.hasRole).toHaveBeenCalledWith('admin');
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
    it('should call authService.logout on confirm', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);

      component.logout();

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should not logout on cancel', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      component.logout();

      expect(authService.logout).not.toHaveBeenCalled();
    });
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
      expect(connectionStatus.textContent).toContain('Connecté');
    });

    it('should show disconnected when not connected', () => {
      component.isConnected = false;
      fixture.detectChanges();

      const connectionStatus = fixture.nativeElement.querySelector('.connection-status');
      expect(connectionStatus.textContent).toContain('Déconnecté');
    });

    it('should display notifications when present', () => {
      component.showNotification('success', 'Test notification');
      fixture.detectChanges();

      const notification = fixture.nativeElement.querySelector('.notification');
      expect(notification).toBeTruthy();
    });
  });
});
