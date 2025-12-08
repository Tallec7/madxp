import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { User, AuthResponse } from '../models';

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
    token: 'test-token-123',
    user: mockUser
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj('ApiService', ['get', 'post']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    // Default: no token, no user loaded
    localStorage.clear();
    apiServiceSpy.get.and.returnValue(throwError(() => new Error('No token')));

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiService, useValue: apiServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should not be authenticated initially without token', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('should load current user if token exists', fakeAsync(() => {
      localStorage.setItem('neopro_token', 'existing-token');
      apiServiceSpy.get.and.returnValue(of(mockUser));

      // Recreate service to trigger loadCurrentUser
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
    }));

    it('should clear token if loadCurrentUser fails', fakeAsync(() => {
      localStorage.setItem('neopro_token', 'invalid-token');
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

      expect(localStorage.getItem('neopro_token')).toBeNull();
      expect(newService.getCurrentUser()).toBeNull();
    }));
  });

  describe('login', () => {
    it('should store token and update user on successful login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      let result: AuthResponse | undefined;
      service.login('test@example.com', 'password123').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123'
      });
      expect(localStorage.getItem('neopro_token')).toBe('test-token-123');
      expect(service.getCurrentUser()).toEqual(mockUser);
      expect(result).toEqual(mockAuthResponse);
    }));

    it('should emit user through currentUser$ observable', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));

      let emittedUser: User | null = null;
      service.currentUser$.subscribe(u => emittedUser = u);

      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(emittedUser).toEqual(mockUser as any);
    }));

    it('should not store token on failed login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(throwError(() => new Error('Invalid credentials')));

      service.login('test@example.com', 'wrong-password').subscribe({
        error: () => {}
      });
      tick();

      expect(localStorage.getItem('neopro_token')).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
    }));
  });

  describe('logout', () => {
    beforeEach(fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();
    }));

    it('should remove token from localStorage', () => {
      service.logout();
      expect(localStorage.getItem('neopro_token')).toBeNull();
    });

    it('should set current user to null', () => {
      service.logout();
      expect(service.getCurrentUser()).toBeNull();
    });

    it('should navigate to login page', () => {
      service.logout();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should emit null through currentUser$ observable', fakeAsync(() => {
      let emittedUser: User | null = mockUser;
      service.currentUser$.subscribe(u => emittedUser = u);

      service.logout();
      tick();

      expect(emittedUser).toBeNull();
    }));
  });

  describe('getToken', () => {
    it('should return null if no token exists', () => {
      expect(service.getToken()).toBeNull();
    });

    it('should return token if it exists', () => {
      localStorage.setItem('neopro_token', 'my-token');
      expect(service.getToken()).toBe('my-token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false if no token', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('should return true if token exists', () => {
      localStorage.setItem('neopro_token', 'some-token');
      expect(service.isAuthenticated()).toBeTrue();
    });
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

    it('should return false if no user is logged in', () => {
      service.logout();
      expect(service.hasRole('admin')).toBeFalse();
    });
  });

  describe('getCurrentUser', () => {
    it('should return null if not logged in', () => {
      expect(service.getCurrentUser()).toBeNull();
    });

    it('should return user after login', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123').subscribe();
      tick();

      expect(service.getCurrentUser()).toEqual(mockUser);
    }));
  });
});
