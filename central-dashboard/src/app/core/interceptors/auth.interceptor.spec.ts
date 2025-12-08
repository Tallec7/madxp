import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    localStorage.clear();

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
    localStorage.clear();
  });

  it('should pass through successful requests', () => {
    let response: any;
    httpClient.get('/api/test').subscribe(r => response = r);

    const req = httpMock.expectOne('/api/test');
    req.flush({ data: 'success' });

    expect(response).toEqual({ data: 'success' });
  });

  it('should pass through non-401 errors', () => {
    let error: any;
    httpClient.get('/api/test').subscribe({
      error: e => error = e
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(error.status).toBe(404);
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('should redirect to login on 401 error', () => {
    localStorage.setItem('neopro_token', 'test-token');

    httpClient.get('/api/test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should remove token on 401 error', () => {
    localStorage.setItem('neopro_token', 'test-token');

    httpClient.get('/api/test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem('neopro_token')).toBeNull();
  });

  it('should propagate the error after handling 401', () => {
    let error: any;
    httpClient.get('/api/test').subscribe({
      error: e => error = e
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(error.status).toBe(401);
  });

  it('should handle 500 errors without redirect', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Server Error', { status: 500, statusText: 'Server Error' });

    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('neopro_token')).toBeNull(); // was already null
  });

  it('should handle 403 errors without redirect to login', () => {
    localStorage.setItem('neopro_token', 'test-token');

    httpClient.get('/api/test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('neopro_token')).toBe('test-token'); // Token not removed for 403
  });
});
