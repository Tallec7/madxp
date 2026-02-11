import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { Configuration } from '../interfaces/configuration.interface';
import { Category } from '../interfaces/category.interface';
import { LoopVideo } from '../interfaces/sponsor.interface';

/** Helper pour créer une configuration de test typée */
function makeConfig(auth?: Configuration['auth']): Configuration {
  return {
    remote: { title: 'Test' },
    version: '1.0',
    categories: [] as Category[],
    sponsors: [] as LoopVideo[],
    ...(auth !== undefined ? { auth } : {}),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => { delete localStorageMock[key]; });

    // Empêcher le setInterval du constructeur
    spyOn(window, 'setInterval');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Le constructeur lance un GET /configuration.json async.
    // On flush tout ce qui reste pour éviter les erreurs verify().
    httpMock.match(() => true);
  });

  /**
   * Helper : flush la requête config du constructeur + microtask pour que
   * le async loadConfiguration() s'achève complètement.
   */
  function flushConfig(config: Configuration): void {
    httpMock.expectOne('/configuration.json').flush(config);
  }

  function flushConfigError(): void {
    httpMock.expectOne('/configuration.json').error(new ProgressEvent('error'));
  }

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Configuration loading
  // ---------------------------------------------------------------------------

  it('should load configuration from configuration.json', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'secret', clubName: 'TestClub' }));
    tick();
    // Le service a chargé la config sans erreur
    expect(service.needsSetup()).toBe(false);
  }));

  it('should set requiresSetup when no password in config', fakeAsync(() => {
    flushConfig(makeConfig({}));
    tick();

    expect(service.needsSetup()).toBe(true);
  }));

  it('should set requiresSetup when no auth section', fakeAsync(() => {
    flushConfig(makeConfig());
    tick();

    expect(service.needsSetup()).toBe(true);
  }));

  it('should set requiresSetup on config load error', fakeAsync(() => {
    flushConfigError();
    tick();

    expect(service.needsSetup()).toBe(true);
  }));

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------

  it('should login successfully with correct password', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'mypass' }));
    tick();

    const result = service.login('mypass');
    expect(result).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
  }));

  it('should reject login with wrong password', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'correct' }));
    tick();

    const result = service.login('wrong');
    expect(result).toBe(false);
  }));

  it('should reject login when no password configured', fakeAsync(() => {
    flushConfigError();
    tick();

    const result = service.login('anything');
    expect(result).toBe(false);
  }));

  it('should save auth token to localStorage on login', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'pass' }));
    tick();

    service.login('pass');

    expect(localStorage.setItem).toHaveBeenCalledWith('neopro_auth_token', jasmine.any(String));
  }));

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------

  it('should logout and remove token', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'pass' }));
    tick();

    service.login('pass');

    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.removeItem).toHaveBeenCalledWith('neopro_auth_token');
  }));

  // ---------------------------------------------------------------------------
  // isAuthenticated
  // ---------------------------------------------------------------------------

  it('should return false when no token', fakeAsync(() => {
    flushConfigError();
    tick();
    expect(service.isAuthenticated()).toBe(false);
  }));

  it('should return false when token is expired', fakeAsync(() => {
    const expiredToken = JSON.stringify({ authenticated: true, expiresAt: Date.now() - 1000 });
    localStorageMock['neopro_auth_token'] = expiredToken;

    flushConfigError();
    tick();
    expect(service.isAuthenticated()).toBe(false);
  }));

  it('should return true when token is valid', fakeAsync(() => {
    const validToken = JSON.stringify({ authenticated: true, expiresAt: Date.now() + 3600000 });
    localStorageMock['neopro_auth_token'] = validToken;

    flushConfigError();
    tick();
    expect(service.isAuthenticated()).toBe(true);
  }));

  // ---------------------------------------------------------------------------
  // getTimeRemaining
  // ---------------------------------------------------------------------------

  it('should return 0 when no token', fakeAsync(() => {
    flushConfigError();
    tick();
    expect(service.getTimeRemaining()).toBe(0);
  }));

  it('should return remaining time for valid token', fakeAsync(() => {
    const future = Date.now() + 3600000;
    localStorageMock['neopro_auth_token'] = JSON.stringify({ authenticated: true, expiresAt: future });

    flushConfigError();
    tick();

    const remaining = service.getTimeRemaining();
    expect(remaining).toBeGreaterThan(3500000);
    expect(remaining).toBeLessThanOrEqual(3600000);
  }));

  it('should return 0 for expired token', fakeAsync(() => {
    localStorageMock['neopro_auth_token'] = JSON.stringify({ authenticated: true, expiresAt: Date.now() - 1000 });

    flushConfigError();
    tick();
    expect(service.getTimeRemaining()).toBe(0);
  }));

  // ---------------------------------------------------------------------------
  // setInitialPassword
  // ---------------------------------------------------------------------------

  it('should set initial password via server', fakeAsync(() => {
    flushConfigError();
    tick();

    const resultPromise = service.setInitialPassword('newpass');

    const req = httpMock.expectOne(r => r.url.includes('/api/auth/setup'));
    expect(req.request.body).toEqual({ password: 'newpass' });
    req.flush({ success: true });
    tick();

    resultPromise.then(result => {
      expect(result.success).toBe(true);
      expect(service.needsSetup()).toBe(false);
    });
    tick();
  }));

  it('should handle server error on setInitialPassword', fakeAsync(() => {
    flushConfigError();
    tick();

    const resultPromise = service.setInitialPassword('newpass');

    const req = httpMock.expectOne(r => r.url.includes('/api/auth/setup'));
    req.error(new ProgressEvent('error'));
    tick();

    resultPromise.then(result => {
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    tick();
  }));

  // ---------------------------------------------------------------------------
  // isAuthenticated$ observable
  // ---------------------------------------------------------------------------

  it('should emit authentication state changes', fakeAsync(() => {
    flushConfig(makeConfig({ password: 'pass' }));
    tick();

    const states: boolean[] = [];

    service.isAuthenticated$.subscribe(state => {
      states.push(state);
    });

    service.login('pass');
    tick();

    expect(states).toContain(true);
  }));
});
