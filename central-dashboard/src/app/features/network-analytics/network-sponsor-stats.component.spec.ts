import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NetworkSponsorStatsComponent } from './network-sponsor-stats.component';
import { SiteSponsorService } from '../../core/services/site-sponsor.service';
import { NetworkSponsorStatsResponse } from '../../core/models';

describe('NetworkSponsorStatsComponent', () => {
  let component: NetworkSponsorStatsComponent;
  let fixture: ComponentFixture<NetworkSponsorStatsComponent>;
  let sitesService: jasmine.SpyObj<SiteSponsorService>;

  const mockResponse: NetworkSponsorStatsResponse = {
    advertiser_id: 'adv-1',
    period: { from: '2024-01-01', to: '2024-01-31' },
    summary: {
      total_impressions: 5000,
      total_screen_time_seconds: 12000,
      completion_rate: 92,
      estimated_reach: 1500,
      active_sites: 3,
      active_days: 28,
      cpi: 0.02,
    },
    by_site: [
      { site_id: 's1', site_name: 'Site A', club_name: 'Club A', impressions: 3000, screen_time_seconds: 7200, completion_rate: 94 },
      { site_id: 's2', site_name: 'Site B', club_name: 'Club B', impressions: 2000, screen_time_seconds: 4800, completion_rate: 90 },
    ],
    daily_trends: [
      { date: '2024-01-01', impressions: 160, screen_time: 400 },
      { date: '2024-01-02', impressions: 180, screen_time: 430 },
    ],
    by_event_type: [
      { event_type: 'match', count: 3500, total_screen_time: 8000 },
      { event_type: 'training', count: 1500, total_screen_time: 4000 },
    ],
  };

  beforeEach(async () => {
    const sitesServiceMock = jasmine.createSpyObj('SiteSponsorService', ['getNetworkSponsorStats']);
    sitesServiceMock.getNetworkSponsorStats.and.returnValue(of(mockResponse));

    await TestBed.configureTestingModule({
      imports: [NetworkSponsorStatsComponent],
      providers: [
        { provide: SiteSponsorService, useValue: sitesServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'adv-1' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkSponsorStatsComponent);
    component = fixture.componentInstance;
    sitesService = TestBed.inject(SiteSponsorService) as jasmine.SpyObj<SiteSponsorService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init', fakeAsync(() => {
    fixture.detectChanges();
    tick(100);

    expect(sitesService.getNetworkSponsorStats).toHaveBeenCalledWith('adv-1');
    expect(component.data).toEqual(mockResponse);
    expect(component.loading).toBe(false);
  }));

  it('should handle error', fakeAsync(() => {
    sitesService.getNetworkSponsorStats.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    expect(component.error).toBeTruthy();
    expect(component.loading).toBe(false);
  }));

  it('should show missing advertiser error when id is empty', () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.paramMap.get = () => '';

    component.ngOnInit();

    expect(component.error).toContain('manquant');
    expect(component.loading).toBe(false);
  });

  it('should format screen time correctly', () => {
    expect(component.formatScreenTime(0)).toBe('0 min');
    expect(component.formatScreenTime(120)).toBe('2 min');
    expect(component.formatScreenTime(3661)).toBe('1h 1m');
  });
});
