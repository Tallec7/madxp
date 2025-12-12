import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { environment } from '@env/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService]
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('GET requests', () => {
    it('should make GET request to correct URL', () => {
      service.get('/test').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('should include Content-Type header', () => {
      service.get('/test').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush({});
    });

    it('should include Authorization header when token exists', () => {
      localStorage.setItem('neopro_token', 'test-token');

      service.get('/test').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
      req.flush({});
    });

    it('should not include Authorization header when no token', () => {
      service.get('/test').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush({});
    });

    it('should pass query params', () => {
      service.get('/test', { page: 1, limit: 10 }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test?page=1&limit=10`);
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('10');
      req.flush({});
    });

    it('should return typed response', () => {
      interface TestResponse {
        id: number;
        name: string;
      }

      let result: TestResponse | undefined;
      service.get<TestResponse>('/test').subscribe(r => result = r);

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      req.flush({ id: 1, name: 'Test' });

      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should send requests with credentials for cookies', () => {
      service.get('/test').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.withCredentials).toBeTrue();
      req.flush({});
    });
  });

  describe('POST requests', () => {
    it('should make POST request to correct URL', () => {
      service.post('/test', { data: 'value' }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });

    it('should send body data', () => {
      const body = { email: 'test@example.com', password: 'secret' };
      service.post('/auth/login', body).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('should include Authorization header when token exists', () => {
      localStorage.setItem('neopro_token', 'test-token');

      service.post('/test', {}).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
      req.flush({});
    });

    it('should send POST requests with credentials', () => {
      service.post('/test', {}).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      expect(req.request.withCredentials).toBeTrue();
      req.flush({});
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request to correct URL', () => {
      service.put('/test/1', { data: 'updated' }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test/1`);
      expect(req.request.method).toBe('PUT');
      req.flush({});
    });

    it('should send body data', () => {
      const body = { name: 'Updated Name' };
      service.put('/sites/123', body).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/sites/123`);
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('should send PUT requests with credentials', () => {
      service.put('/test/1', {}).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test/1`);
      expect(req.request.withCredentials).toBeTrue();
      req.flush({});
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request to correct URL', () => {
      service.delete('/test/1').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/test/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });

    it('should include Authorization header when token exists', () => {
      localStorage.setItem('neopro_token', 'test-token');

      service.delete('/sites/123').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/sites/123`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
      req.flush({});
    });

    it('should send DELETE requests with credentials', () => {
      service.delete('/sites/123').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/sites/123`);
      expect(req.request.withCredentials).toBeTrue();
      req.flush({});
    });
  });

  describe('upload', () => {
    it('should make POST request with FormData', () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');

      service.upload('/upload', formData).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/upload`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(formData);
      req.flush({});
    });

    it('should not set Content-Type header for uploads', () => {
      const formData = new FormData();
      service.upload('/upload', formData).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/upload`);
      // Content-Type should not be set (browser sets it with boundary)
      expect(req.request.headers.has('Content-Type')).toBeFalse();
      req.flush({});
    });

    it('should include Authorization header when token exists', () => {
      localStorage.setItem('neopro_token', 'test-token');
      const formData = new FormData();

      service.upload('/upload', formData).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/upload`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
      req.flush({});
    });

    it('should send upload requests with credentials', () => {
      const formData = new FormData();
      service.upload('/upload', formData).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/upload`);
      expect(req.request.withCredentials).toBeTrue();
      req.flush({});
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP errors', () => {
      let error: any;
      service.get('/test').subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });

      expect(error.status).toBe(404);
    });

    it('should propagate server errors', () => {
      let error: any;
      service.post('/test', {}).subscribe({
        error: e => error = e
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/test`);
      req.flush({ message: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });

      expect(error.status).toBe(500);
    });
  });
});
