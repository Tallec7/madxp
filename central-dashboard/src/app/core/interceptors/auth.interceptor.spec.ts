import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';

/**
 * Tests for authInterceptor with HttpOnly cookie-based authentication.
 *
 * Note: With HttpOnly cookies, the token is managed by the browser.
 * - No localStorage cleanup on 401 (cookie is cleared by server)
 * - Interceptor only handles redirect to login on authentication errors
 */
describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy }
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('successful requests', () => {
    it('should pass through successful requests', () => {
      let response: any;
      httpClient.get('/api/test').subscribe(r => response = r);

      const req = httpMock.expectOne('/api/test');
      req.flush({ data: 'success' });

      expect(response).toEqual({ data: 'success' });
    });

    it('should not redirect on success', () => {
      httpClient.get('/api/test').subscribe();

      const req = httpMock.expectOne('/api/test');
      req.flush({ data: 'success' });

      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });

  describe('401 Unauthorized errors', () => {
    it('should redirect to login on 401 error', () => {
      httpClient.get('/api/test').subscribe({
        error: () => {}
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should propagate the error after redirecting on 401', () => {
      let error: any;
      httpClient.get('/api/test').subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(error.status).toBe(401);
    });

    it('should redirect on 401 for POST requests', () => {
      httpClient.post('/api/test', {}).subscribe({
        error: () => {}
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('non-401 errors', () => {
    it('should pass through 404 errors without redirect', () => {
      let error: any;
      httpClient.get('/api/test').subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });

      expect(error.status).toBe(404);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should pass through 403 Forbidden errors without redirect', () => {
      let error: any;
      httpClient.get('/api/test').subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      expect(error.status).toBe(403);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should pass through 500 errors without redirect', () => {
      let error: any;
      httpClient.get('/api/test').subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Server Error', { status: 500, statusText: 'Server Error' });

      expect(error.status).toBe(500);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should pass through 400 Bad Request errors without redirect', () => {
      let error: any;
      httpClient.post('/api/test', {}).subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne('/api/test');
      req.flush({ message: 'Invalid data' }, { status: 400, statusText: 'Bad Request' });

      expect(error.status).toBe(400);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });
});
