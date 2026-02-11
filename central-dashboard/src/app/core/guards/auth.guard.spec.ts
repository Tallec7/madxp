import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authGuard, roleGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('Auth Guards', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let mockRoute: ActivatedRouteSnapshot;
  let mockState: RouterStateSnapshot;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'hasRole', 'checkAuthentication']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    mockRoute = {} as ActivatedRouteSnapshot;
    mockState = { url: '/dashboard' } as RouterStateSnapshot;

    // Default: not authenticated in memory, checkAuthentication returns false
    authServiceSpy.isAuthenticated.and.returnValue(false);
    authServiceSpy.checkAuthentication.and.returnValue(of(false));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  describe('authGuard', () => {
    it('should allow access when authenticated in memory', () => {
      authServiceSpy.isAuthenticated.and.returnValue(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      // When isAuthenticated() returns true, guard returns true synchronously
      expect(result).toBeTrue();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should allow access when checkAuthentication returns true', fakeAsync(() => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      authServiceSpy.checkAuthentication.and.returnValue(of(true));

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      // Result is an Observable when not authenticated in memory
      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeTrue();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    }));

    it('should redirect to login when not authenticated', fakeAsync(() => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      authServiceSpy.checkAuthentication.and.returnValue(of(false));

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    }));

    it('should pass current URL as returnUrl', fakeAsync(() => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      authServiceSpy.checkAuthentication.and.returnValue(of(false));
      mockState = { url: '/sites/123/edit' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/sites/123/edit' }
      });
    }));

    it('should redirect to login when checkAuthentication errors', fakeAsync(() => {
      authServiceSpy.isAuthenticated.and.returnValue(false);
      authServiceSpy.checkAuthentication.and.returnValue(throwError(() => new Error('Network error')));

      const result = TestBed.runInInjectionContext(() =>
        authGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    }));
  });

  describe('roleGuard', () => {
    it('should allow access when user has required role', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(true));
      authServiceSpy.hasRole.and.returnValue(true);
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeTrue();
      expect(authServiceSpy.hasRole).toHaveBeenCalledWith('admin');
    }));

    it('should allow access when user has one of multiple required roles', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(true));
      authServiceSpy.hasRole.and.returnValue(true);
      mockRoute = { data: { roles: ['admin', 'operator'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeTrue();
      expect(authServiceSpy.hasRole).toHaveBeenCalledWith('admin', 'operator');
    }));

    it('should redirect to login when not authenticated', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(false));
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    }));

    it('should redirect to forbidden when user lacks required role', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(true));
      authServiceSpy.hasRole.and.returnValue(false);
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/forbidden']);
    }));

    it('should allow access when no roles are required', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(true));
      mockRoute = { data: {} } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeTrue();
      expect(authServiceSpy.hasRole).not.toHaveBeenCalled();
    }));

    it('should allow access when roles array is undefined', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(of(true));
      mockRoute = { data: { roles: undefined } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeTrue();
    }));

    it('should redirect to login when checkAuthentication errors', fakeAsync(() => {
      authServiceSpy.checkAuthentication.and.returnValue(throwError(() => new Error('Network')));
      mockRoute = { data: { roles: ['admin'] } } as any;

      const result = TestBed.runInInjectionContext(() =>
        roleGuard(mockRoute, mockState)
      );

      let resolvedValue: boolean | undefined;
      (result as any).subscribe((val: boolean) => resolvedValue = val);
      tick();

      expect(resolvedValue).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    }));
  });
});
