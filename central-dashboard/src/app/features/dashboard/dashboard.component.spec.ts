import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { SitesService } from '../../core/services/sites.service';
import { AuthService } from '../../core/services/auth.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let sitesService: jasmine.SpyObj<SitesService>;

  const mockStats = {
    total_sites: 20,
    online: 15,
    offline: 3,
    error: 1,
    maintenance: 1,
  };

  const mockSites = [
    {
      id: '1',
      site_name: 'Site 1',
      club_name: 'Club A',
      status: 'online',
      software_version: '1.0.0',
      location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
      sports: ['football'],
      last_seen_at: new Date(),
    },
    {
      id: '2',
      site_name: 'Site 2',
      club_name: 'Club B',
      status: 'offline',
      software_version: '1.0.1',
      location: { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' },
      sports: ['rugby'],
      last_seen_at: new Date(),
    },
  ];

  // Connection status response that matches stats structure
  const mockConnectionStatus = {
    sites: [
      { siteId: '1', siteName: 'Site 1', clubName: 'Club A', isConnected: true, displayStatus: 'online' as const, lastSeenAt: new Date(), secondsSinceLastSeen: 0, localIp: null },
      { siteId: '2', siteName: 'Site 2', clubName: 'Club B', isConnected: false, displayStatus: 'offline' as const, lastSeenAt: new Date(), secondsSinceLastSeen: 3600, localIp: null },
    ],
    stats: { total: 20, online: 15, warning: 0, offline: 3, unknown: 2 },
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    const sitesServiceMock = jasmine.createSpyObj('SitesService', ['loadStats', 'loadSites', 'getAllConnectionStatus']);
    sitesServiceMock.loadStats.and.returnValue(of(mockStats));
    sitesServiceMock.loadSites.and.returnValue(of({ sites: mockSites, total: 2, page: 1, totalPages: 1 }));
    sitesServiceMock.getAllConnectionStatus.and.returnValue(of(mockConnectionStatus));

    const authServiceMock = jasmine.createSpyObj('AuthService', ['getCurrentUser', 'hasRole']);
    authServiceMock.getCurrentUser.and.returnValue({ id: '1', email: 'admin@test.com', role: 'admin' });

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    sitesService = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should have null stats initially', () => {
      expect(component.stats).toBeNull();
    });

    it('should have empty recentSites array initially', () => {
      expect(component.recentSites).toEqual([]);
    });

    it('should load stats on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.loadStats).toHaveBeenCalled();
      // After init, loadConnectionStatus overwrites stats
      expect(component.stats).toBeTruthy();
      discardPeriodicTasks();
    }));

    it('should load recent sites on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.loadSites).toHaveBeenCalled();
      expect(component.recentSites.length).toBe(2);
      discardPeriodicTasks();
    }));

    it('should limit recent sites to 5', fakeAsync(() => {
      const manySites = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: String(i),
          site_name: `Site ${i}`,
          club_name: `Club ${i}`,
          status: 'online',
          software_version: '1.0.0',
          location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
          sports: [],
          last_seen_at: new Date(),
        })) as any;

      sitesService.loadSites.and.returnValue(of({ sites: manySites, total: 10, page: 1, totalPages: 1 }));

      fixture.detectChanges();
      tick();

      expect(component.recentSites.length).toBe(5);
      discardPeriodicTasks();
    }));
  });

  describe('loadStats', () => {
    it('should update stats from service', fakeAsync(() => {
      component.loadStats();
      tick();

      expect(component.stats).toEqual(mockStats);
    }));
  });

  describe('loadRecentSites', () => {
    it('should update recentSites from service', fakeAsync(() => {
      component.loadRecentSites();
      tick();

      expect(component.recentSites.length).toBe(2);
      expect(component.recentSites[0].club_name).toBe('Club A');
    }));
  });

  describe('getStatusBadge', () => {
    it('should return success for online status', () => {
      expect(component.getStatusBadge('online')).toBe('success');
    });

    it('should return secondary for offline status', () => {
      expect(component.getStatusBadge('offline')).toBe('secondary');
    });

    it('should return danger for error status', () => {
      expect(component.getStatusBadge('error')).toBe('danger');
    });

    it('should return warning for maintenance status', () => {
      expect(component.getStatusBadge('maintenance')).toBe('warning');
    });

    it('should return secondary for unknown status', () => {
      expect(component.getStatusBadge('unknown')).toBe('secondary');
    });
  });

  describe('getRealTimeStatus', () => {
    it('should return online when connection status map has online status', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const status = component.getRealTimeStatus(mockSites[0] as any);
      expect(status).toBe('online');
      discardPeriodicTasks();
    }));

    it('should return offline when connection status map has offline status', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const status = component.getRealTimeStatus(mockSites[1] as any);
      expect(status).toBe('offline');
      discardPeriodicTasks();
    }));

    it('should load connection status on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.getAllConnectionStatus).toHaveBeenCalled();
      discardPeriodicTasks();
    }));
  });

  describe('getPercentage', () => {
    it('should calculate correct percentage', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      // After loadConnectionStatus, stats.total_sites = 20 (from mockConnectionStatus.stats.total)
      expect(component.getPercentage(15)).toBe(75); // 15/20 * 100
      discardPeriodicTasks();
    }));

    it('should return 0 for undefined value', () => {
      component.stats = { ...mockStats };
      expect(component.getPercentage(undefined)).toBe(0);
    });

    it('should return 0 for zero value', () => {
      component.stats = { ...mockStats };
      expect(component.getPercentage(0)).toBe(0);
    });

    it('should return 0 if total_sites is 0', () => {
      component.stats = { ...mockStats, total_sites: 0 };
      expect(component.getPercentage(5)).toBe(0);
    });

    it('should return 0 if stats is null', () => {
      component.stats = null;
      expect(component.getPercentage(5)).toBe(0);
    });
  });

  describe('Template', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    afterEach(fakeAsync(() => {
      discardPeriodicTasks();
    }));

    it('should display total sites count', () => {
      fixture.detectChanges();
      const statValue = fixture.nativeElement.querySelector('.stat-card .stat-value');
      expect(statValue?.textContent).toContain('20');
    });

    it('should display online sites count', () => {
      fixture.detectChanges();
      const statCards = fixture.nativeElement.querySelectorAll('.stat-card');
      const onlineCard = statCards[1];
      expect(onlineCard?.textContent).toContain('15');
    });

    it('should display recent sites', () => {
      fixture.detectChanges();
      const siteItems = fixture.nativeElement.querySelectorAll('.site-item');
      expect(siteItems.length).toBe(2);
    });

    it('should display site club name', () => {
      fixture.detectChanges();
      const siteName = fixture.nativeElement.querySelector('.site-name');
      expect(siteName?.textContent).toContain('Club A');
    });

    it('should show empty state when no sites', fakeAsync(() => {
      sitesService.loadSites.and.returnValue(of({ sites: [], total: 0, page: 1, totalPages: 0 }));
      component.recentSites = [];
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState?.textContent).toContain('Aucun site enregistré');
    }));
  });
});
