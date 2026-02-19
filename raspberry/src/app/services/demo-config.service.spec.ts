import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoConfigService, ClubInfo } from './demo-config.service';
import { Configuration } from '../interfaces/configuration.interface';

describe('DemoConfigService', () => {
  let service: DemoConfigService;
  let httpMock: HttpTestingController;
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => { delete localStorageMock[key]; });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(DemoConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // isDemoMode
  // ---------------------------------------------------------------------------

  it('should return demoMode from environment', () => {
    // environment.demoMode est true dans l'env de test
    expect(typeof service.isDemoMode()).toBe('boolean');
  });

  // ---------------------------------------------------------------------------
  // getAvailableClubs
  // ---------------------------------------------------------------------------

  it('should fetch clubs list', () => {
    const clubs: ClubInfo[] = [
      { id: 'club1', name: 'FC Test', city: 'Paris', sport: 'football' },
    ];

    service.getAvailableClubs().subscribe(result => {
      expect(result).toEqual(clubs);
    });

    const req = httpMock.expectOne('/demo-configs/clubs.json');
    expect(req.request.method).toBe('GET');
    req.flush(clubs);
  });

  it('should cache clubs list (shareReplay)', () => {
    const clubs: ClubInfo[] = [{ id: 'c1', name: 'Club', city: 'City', sport: 'football' }];

    // Premier appel
    service.getAvailableClubs().subscribe();
    const req = httpMock.expectOne('/demo-configs/clubs.json');
    req.flush(clubs);

    // Deuxi\u00e8me appel -> pas de nouvelle requ\u00eate
    service.getAvailableClubs().subscribe(result => {
      expect(result).toEqual(clubs);
    });
    httpMock.expectNone('/demo-configs/clubs.json');
  });

  // ---------------------------------------------------------------------------
  // loadClubConfiguration
  // ---------------------------------------------------------------------------

  it('should load club config and save to localStorage', () => {
    const config: Partial<Configuration> = {
      remote: { title: 'Test Club' },
      version: '1.0',
      categories: [],
      sponsors: [],
    };

    service.loadClubConfiguration('club1').subscribe(result => {
      expect(result.remote.title).toBe('Test Club');
    });

    const req = httpMock.expectOne('/demo-configs/club1.json');
    req.flush(config);

    expect(localStorage.setItem).toHaveBeenCalledWith('neopro_demo_selected_club', 'club1');
  });

  // ---------------------------------------------------------------------------
  // getSelectedConfiguration
  // ---------------------------------------------------------------------------

  it('should return null when no club selected', () => {
    expect(service.getSelectedConfiguration()).toBeNull();
  });

  it('should return in-memory config after loadClubConfiguration', () => {
    const config: Partial<Configuration> = {
      remote: { title: 'Cached' },
      version: '1.0',
      categories: [],
      sponsors: [],
    };

    service.loadClubConfiguration('club1').subscribe();
    httpMock.expectOne('/demo-configs/club1.json').flush(config);

    const selected$ = service.getSelectedConfiguration();
    expect(selected$).not.toBeNull();
    selected$!.subscribe(result => {
      expect(result.remote.title).toBe('Cached');
    });
  });

  it('should reload from localStorage if not in memory', () => {
    localStorageMock['neopro_demo_selected_club'] = 'club2';

    const config: Partial<Configuration> = {
      remote: { title: 'FromStorage' },
      version: '1.0',
      categories: [],
      sponsors: [],
    };

    const selected$ = service.getSelectedConfiguration();
    expect(selected$).not.toBeNull();

    selected$!.subscribe(result => {
      expect(result.remote.title).toBe('FromStorage');
    });

    httpMock.expectOne('/demo-configs/club2.json').flush(config);
  });

  // ---------------------------------------------------------------------------
  // setSelectedConfiguration
  // ---------------------------------------------------------------------------

  it('should set configuration and save clubId', () => {
    const config = { remote: { title: 'Set' }, version: '1.0', categories: [], sponsors: [] } as Configuration;
    service.setSelectedConfiguration(config, 'club3');

    expect(localStorage.setItem).toHaveBeenCalledWith('neopro_demo_selected_club', 'club3');

    const selected$ = service.getSelectedConfiguration();
    expect(selected$).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // clearSelection
  // ---------------------------------------------------------------------------

  it('should clear selected configuration', () => {
    const config = { remote: { title: 'Clear' }, version: '1.0', categories: [], sponsors: [] } as Configuration;
    service.setSelectedConfiguration(config, 'club4');

    service.clearSelection();

    expect(localStorage.removeItem).toHaveBeenCalledWith('neopro_demo_selected_club');
    expect(service.getSelectedConfiguration()).toBeNull();
  });
});
