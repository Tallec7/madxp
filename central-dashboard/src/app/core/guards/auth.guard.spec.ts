import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard, roleGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('Auth Guards', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let mockRoute: ActivatedRouteSnapshot;
  let mockState: RouterStateSnapshot;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'hasRole']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    mockRoute = {} as ActivatedRouteSnapshot;
    mockState = { url: '/dashboard' } as RouterStateSnapshot;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  describe('authGuard', () => {
    it('should allow access when authenticated', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      expect(result).toBeTrue();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should redirect to login when not authenticated', () => {
      authServiceSpy.isAuthenticated.and.returnValue(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    });

    it('should pass current URL as returnUrl', () => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      mockState = { url: '/sites/123/edit' } as RouterStateSnapshot;

      TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/sites/123/edit' }
      });
    });
  });

  describe('roleGuard', () => {
    it('should allow access when user has required role', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);
      authServiceSpy.hasRole.and.returnValue(true);
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeTrue();
      expect(authServiceSpy.hasRole).toHaveBeenCalledWith('admin');
    });

    it('should allow access when user has one of multiple required roles', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);
      authServiceSpy.hasRole.and.returnValue(true);
      mockRoute = { data: { roles: ['admin', 'operator'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeTrue();
      expect(authServiceSpy.hasRole).toHaveBeenCalledWith('admin', 'operator');
    });

    it('should redirect to login when not authenticated', () => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    });

    it('should redirect to forbidden when user lacks required role', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);
      authServiceSpy.hasRole.and.returnValue(false);
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/forbidden']);
    });

    it('should allow access when no roles are required', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);
      mockRoute = { data: {} } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeTrue();
      expect(authServiceSpy.hasRole).not.toHaveBeenCalled();
    });

    it('should allow access when roles array is undefined', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);
      mockRoute = { data: { roles: undefined } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      expect(result).toBeTrue();
    });
  });
});
