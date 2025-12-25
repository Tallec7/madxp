import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { User, AuthResponse } from '../models';

/**
 * Tests for AuthService with HttpOnly cookie-based authentication.
 *
 * Note: With HttpOnly cookies, the token is no longer stored in localStorage.
 * Authentication state is determined by the presence of a user from /auth/me.
 */
describe('AuthService', () => {
  let service: AuthService;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'admin',
    created_at: new Date(),
    last_login_at: new Date()
  };

  const mockAuthResponse: AuthResponse = {
    token: 'test-token-123', // Still returned for SSE compatibility
    user: mockUser
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj('ApiService', ['get', 'post']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    // Default: not authenticated
    apiServiceSpy.get.and.returnValue(throwError(() => new Error('Unauthorized')));

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiService, useValue: apiServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(AuthService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should check authentication status via API on init', fakeAsync(() => {
      tick();
      expect(apiServiceSpy.get).toHaveBeenCalledWith('/auth/me');
    }));

    it('should load current user if cookie session is valid', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AuthService,
          { provide: ApiService, useValue: apiServiceSpy },
          { provide: Router, useValue: routerSpy }
        ]
      });

      const newService = TestBed.inject(AuthService);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/auth/me');
      expect(newService.getCurrentUser()).toEqual(mockUser);
      expect(newService.isAuthenticated()).toBeTrue();
    }));

    it('should set user to null if session is invalid', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(throwError(() => new Error('Unauthorized')));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AuthService,
          { provide: ApiService, useValue: apiServiceSpy },
          { provide: Router, useValue: routerSpy }
        ]
      });

      const newService = TestBed.inject(AuthService);
      tick();

      expect(newService.getCurrentUser()).toBeNull();
      expect(newService.isAuthenticated()).toBeFalse();
    }));
  });

  describe('login', () => {
    it('should update current user on successful login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      let result: AuthResponse | undefined;
      service.login('test@example.com', 'password123').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        mfaCode: undefined
      });
      expect(service.getCurrentUser()).toEqual(mockUser);
      expect(result).toEqual(mockAuthResponse);
    }));

    it('should pass MFA code when provided', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      service.login('test@example.com', 'password123', '123456').subscribe();
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        mfaCode: '123456'
      });
    }));

    it('should store SSE token in memory (not localStorage)', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(service.getSseToken()).toBe('test-token-123');
      // Token should NOT be in localStorage
      expect(localStorage.getItem('neopro_token')).toBeNull();
    }));

    it('should emit user through currentUser$ observable', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      let emittedUser: User | null = null;
      service.currentUser$.subscribe(u => emittedUser = u);

      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(emittedUser).toEqual(mockUser as any);
    }));

    it('should not update user on failed login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(throwError(() => new Error('Invalid credentials')));

      service.login('test@example.com', 'wrong-password').subscribe({
        error: () => {}
      });
      tick();

      expect(service.getCurrentUser()).toBeNull();
      expect(service.getSseToken()).toBeNull();
    }));
  });

  describe('logout', () => {
    beforeEach(fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();

      // Reset for logout call
      apiServiceSpy.post.and.returnValue(of({ success: true }));
    }));

    it('should call logout API', fakeAsync(() => {
      service.logout();
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/auth/logout', {});
    }));

    it('should clear SSE token', fakeAsync(() => {
      service.logout();
      tick();

      expect(service.getSseToken()).toBeNull();
    }));

    it('should set current user to null', fakeAsync(() => {
      service.logout();
      tick();

      expect(service.getCurrentUser()).toBeNull();
    }));

    it('should navigate to login page', fakeAsync(() => {
      service.logout();
      tick();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    }));

    it('should logout locally even if API call fails', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(throwError(() => new Error('Network error')));

      service.logout();
      tick();

      expect(service.getCurrentUser()).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    }));
  });

  describe('isAuthenticated', () => {
    it('should return false when no user is loaded', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('should return true when user is loaded', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(service.isAuthenticated()).toBeTrue();
    }));
  });

  describe('checkAuthentication', () => {
    it('should return true when already authenticated', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();

      // Simulate auth check completing
      (service as any).authChecked = true;

      let result: boolean | undefined;
      service.checkAuthentication().subscribe(r => result = r);
      tick();

      expect(result).toBeTrue();
    }));

    it('should verify via API when not yet checked', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockUser));

      let result: boolean | undefined;
      service.checkAuthentication().subscribe(r => result = r);
      tick();

      expect(result).toBeTrue();
      expect(service.getCurrentUser()).toEqual(mockUser);
    }));

    it('should return false when API returns error', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(throwError(() => new Error('Unauthorized')));

      let result: boolean | undefined;
      service.checkAuthentication().subscribe(r => result = r);
      tick();

      expect(result).toBeFalse();
    }));
  });

  describe('getSseToken', () => {
    it('should return null when not logged in', () => {
      expect(service.getSseToken()).toBeNull();
    });

    it('should return token after login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(service.getSseToken()).toBe('test-token-123');
    }));
  });

  describe('hasRole', () => {
    beforeEach(fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();
    }));

    it('should return true if user has the required role', () => {
      expect(service.hasRole('admin')).toBeTrue();
    });

    it('should return true if user has one of the required roles', () => {
      expect(service.hasRole('operator', 'admin', 'viewer')).toBeTrue();
    });

    it('should return false if user does not have the required role', () => {
      expect(service.hasRole('operator')).toBeFalse();
    });

    it('should return false if no user is logged in', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of({ success: true }));
      service.logout();
      tick();

      expect(service.hasRole('admin')).toBeFalse();
    }));
  });

  describe('refreshCurrentUser', () => {
    it('should update current user from API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockUser));

      let result: User | null | undefined;
      service.refreshCurrentUser().subscribe(r => result = r);
      tick();

      expect(result).toEqual(mockUser);
      expect(service.getCurrentUser()).toEqual(mockUser);
    }));

    it('should set user to null on API error', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(throwError(() => new Error('Unauthorized')));

      let result: User | null | undefined;
      service.refreshCurrentUser().subscribe(r => result = r);
      tick();

      expect(result).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
    }));
  });
});
