import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SiteSponsorPortalComponent } from './site-sponsor-portal.component';
import { SponsorAccessService } from '../../core/services/sponsor-access.service';

describe('SiteSponsorPortalComponent', () => {
  let component: SiteSponsorPortalComponent;
  let fixture: ComponentFixture<SiteSponsorPortalComponent>;
  let mockSponsorAccessService: jasmine.SpyObj<SponsorAccessService>;
  let mockActivatedRoute: { snapshot: { queryParamMap: { get: jasmine.Spy } } };

  const mockVerification = {
    valid: true,
    sponsor: {
      id: 'sponsor-1',
      name: 'Sponsor Test',
      siteId: 'site-1',
      clubName: 'Club FC',
    },
  };

  const mockStats = {
    sponsor: { id: 'sponsor-1', name: 'Sponsor Test', clubName: 'Club FC' },
    period: { from: '2026-01-01', to: '2026-01-31' },
    summary: {
      total_impressions: 150,
      total_screen_time_seconds: 4500,
      completion_rate: 92.0,
      estimated_reach: 800,
      active_days: 15,
    },
    daily_trends: [
      { date: '2026-01-15', impressions: 10, screen_time: 300 },
    ],
    videos: [
      { id: 'v-1', video_filename: 'pub-sponsor.mp4', is_primary: true },
    ],
  };

  beforeEach(async () => {
    mockSponsorAccessService = jasmine.createSpyObj('SponsorAccessService', [
      'verifyToken', 'getStats', 'getReportUrl',
    ]);
    mockSponsorAccessService.getReportUrl.and.returnValue('http://localhost/api/sponsor-portal/report?token=abc');

    mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: jasmine.createSpy('get').and.returnValue('test-token-abc'),
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [SiteSponsorPortalComponent],
      providers: [
        { provide: SponsorAccessService, useValue: mockSponsorAccessService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiteSponsorPortalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    mockSponsorAccessService.verifyToken.and.returnValue(of(mockVerification));
    mockSponsorAccessService.getStats.and.returnValue(of(mockStats));
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show error when no token in URL', () => {
    mockActivatedRoute.snapshot.queryParamMap.get.and.returnValue(null);
    fixture.detectChanges();
    expect(component.loading).toBe(false);
    expect(component.error).toContain('token');
  });

  it('should show error on invalid token', () => {
    mockSponsorAccessService.verifyToken.and.returnValue(of({
      valid: false,
      error: 'Lien invalide ou expiré',
    }));
    fixture.detectChanges();
    expect(component.loading).toBe(false);
    expect(component.error).toBeTruthy();
  });

  it('should show error on network error', () => {
    mockSponsorAccessService.verifyToken.and.returnValue(throwError(() => new Error('Network error')));
    fixture.detectChanges();
    expect(component.loading).toBe(false);
    expect(component.error).toBeTruthy();
  });

  it('should load stats after successful verification', () => {
    mockSponsorAccessService.verifyToken.and.returnValue(of(mockVerification));
    mockSponsorAccessService.getStats.and.returnValue(of(mockStats));
    fixture.detectChanges();
    expect(component.verification).toEqual(mockVerification);
    expect(component.stats).toEqual(mockStats);
    expect(component.reportUrl).toBeTruthy();
  });

  it('should set reportUrl from service', () => {
    mockSponsorAccessService.verifyToken.and.returnValue(of(mockVerification));
    mockSponsorAccessService.getStats.and.returnValue(of(mockStats));
    fixture.detectChanges();
    expect(mockSponsorAccessService.getReportUrl).toHaveBeenCalledWith('test-token-abc');
    expect(component.reportUrl).toContain('report');
  });

  it('should format numbers correctly', () => {
    expect(component.formatNumber(500)).toBe('500');
    expect(component.formatNumber(1500)).toBe('1.5k');
    expect(component.formatNumber(1500000)).toBe('1.5M');
  });

  it('should format duration correctly', () => {
    expect(component.formatDuration(30)).toBe('30s');
    expect(component.formatDuration(120)).toBe('2min');
    expect(component.formatDuration(3600)).toBe('1h');
    expect(component.formatDuration(3900)).toBe('1h5min');
  });
});
