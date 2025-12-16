import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AnalyticsOverviewComponent } from './analytics-overview.component';
import { AnalyticsService } from '../../core/services/analytics.service';

describe('AnalyticsOverviewComponent', () => {
  let component: AnalyticsOverviewComponent;
  let fixture: ComponentFixture<AnalyticsOverviewComponent>;
  let analyticsService: jest.Mocked<AnalyticsService>;

  const mockOverviewData = {
    total_sites: 10,
    online_sites: 8,
    total_plays_today: 1500,
    total_plays_week: 10500,
    avg_availability: 95.5,
    sites_summary: [
      {
        site_id: 's1',
        club_name: 'Club Alpha',
        status: 'online',
        plays_today: 150,
        availability_24h: 99.5,
      },
      {
        site_id: 's2',
        club_name: 'Club Beta',
        status: 'online',
        plays_today: 120,
        availability_24h: 85.0,
      },
      {
        site_id: 's3',
        club_name: 'Club Gamma',
        status: 'offline',
        plays_today: 0,
        availability_24h: 45.0,
      },
    ],
  };

  beforeEach(async () => {
    const analyticsServiceMock = {
      getAnalyticsOverview: jest.fn().mockReturnValue(of(mockOverviewData)),
    };

    await TestBed.configureTestingModule({
      imports: [AnalyticsOverviewComponent, RouterTestingModule],
      providers: [
        { provide: AnalyticsService, useValue: analyticsServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsOverviewComponent);
    component = fixture.componentInstance;
    analyticsService = TestBed.inject(AnalyticsService) as jest.Mocked<AnalyticsService>;
  });

  afterEach(() => {
    // Clean up any pending subscriptions
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should start with loading false', () => {
      expect(component.loading).toBe(false);
    });

    it('should start with null data', () => {
      expect(component.data).toBeNull();
    });

    it('should load data on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(analyticsService.getAnalyticsOverview).toHaveBeenCalled();
      expect(component.data).toEqual(mockOverviewData);
      expect(component.lastUpdate).toBeTruthy();

      discardPeriodicTasks();
    }));

    it('should set up auto-refresh interval', fakeAsync(() => {
      fixture.detectChanges();
      analyticsService.getAnalyticsOverview.mockClear();

      // Fast-forward 60 seconds
      tick(60000);

      expect(analyticsService.getAnalyticsOverview).toHaveBeenCalled();

      discardPeriodicTasks();
    }));
  });

  describe('loadData', () => {
    it('should set loading to true while fetching', fakeAsync(() => {
      fixture.detectChanges();

      component.loadData();
      expect(component.loading).toBe(true);

      tick();
      expect(component.loading).toBe(false);

      discardPeriodicTasks();
    }));

    it('should update lastUpdate on success', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const beforeUpdate = component.lastUpdate;

      // Wait a bit and reload
      tick(100);
      component.loadData();
      tick();

      expect(component.lastUpdate).toBeTruthy();

      discardPeriodicTasks();
    }));

    it('should handle error gracefully', fakeAsync(() => {
      analyticsService.getAnalyticsOverview.mockReturnValue(
        throwError(() => new Error('API Error'))
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      fixture.detectChanges();
      tick();

      expect(component.loading).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      discardPeriodicTasks();
    }));
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from refresh interval', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      component.ngOnDestroy();
      analyticsService.getAnalyticsOverview.mockClear();

      // Fast-forward 60 seconds - should not trigger refresh
      tick(60000);

      expect(analyticsService.getAnalyticsOverview).not.toHaveBeenCalled();
    }));
  });

  describe('Template Rendering', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    it('should display KPI cards when data is loaded', () => {
      fixture.detectChanges();
      const kpiCards = fixture.nativeElement.querySelectorAll('.kpi-card');
      expect(kpiCards.length).toBe(4);
    });

    it('should display correct online sites count', () => {
      fixture.detectChanges();
      const kpiValues = fixture.nativeElement.querySelectorAll('.kpi-value');
      expect(kpiValues[0].textContent).toContain('8 / 10');
    });

    it('should display correct plays today', () => {
      fixture.detectChanges();
      const kpiValues = fixture.nativeElement.querySelectorAll('.kpi-value');
      expect(kpiValues[1].textContent).toContain('1500');
    });

    it('should display correct plays this week', () => {
      fixture.detectChanges();
      const kpiValues = fixture.nativeElement.querySelectorAll('.kpi-value');
      expect(kpiValues[2].textContent).toContain('10500');
    });

    it('should display average availability', () => {
      fixture.detectChanges();
      const kpiValues = fixture.nativeElement.querySelectorAll('.kpi-value');
      expect(kpiValues[3].textContent).toContain('95.5%');
    });

    it('should display sites summary table', () => {
      fixture.detectChanges();
      const tableRows = fixture.nativeElement.querySelectorAll('.data-table tbody tr');
      expect(tableRows.length).toBe(3);
    });

    it('should show loading overlay when loading with no data', () => {
      component.data = null;
      component.loading = true;
      fixture.detectChanges();

      const loadingOverlay = fixture.nativeElement.querySelector('.loading-overlay');
      expect(loadingOverlay).toBeTruthy();
    });

    it('should show no data message when sites_summary is empty', () => {
      component.data = { ...mockOverviewData, sites_summary: [] };
      fixture.detectChanges();

      const noData = fixture.nativeElement.querySelector('.no-data');
      expect(noData).toBeTruthy();
    });
  });

  describe('Data Binding', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    it('should display club name as link', () => {
      fixture.detectChanges();
      const clubLinks = fixture.nativeElement.querySelectorAll('.club-link');
      expect(clubLinks[0].textContent.trim()).toBe('Club Alpha');
    });

    it('should display status badge with correct class', () => {
      fixture.detectChanges();
      const statusBadges = fixture.nativeElement.querySelectorAll('.status-badge');

      expect(statusBadges[0].classList.contains('status-online')).toBe(true);
      expect(statusBadges[2].classList.contains('status-offline')).toBe(true);
    });

    it('should display availability with warning class when below 90%', () => {
      fixture.detectChanges();
      const availabilityFills = fixture.nativeElement.querySelectorAll('.availability-fill');

      expect(availabilityFills[1].classList.contains('warning')).toBe(true);
    });

    it('should display availability with critical class when below 50%', () => {
      fixture.detectChanges();
      const availabilityFills = fixture.nativeElement.querySelectorAll('.availability-fill');

      expect(availabilityFills[2].classList.contains('critical')).toBe(true);
    });
  });
});
