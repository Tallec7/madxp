import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AnalyticsService, ClubHealthData, AvailabilityData, AlertData, UsageStats, ContentStats } from './analytics.service';
import { ApiService } from './api.service';
import { environment } from '@env/environment';
import { of } from 'rxjs';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

  const mockHealthData: ClubHealthData = {
    site_id: 'site-123',
    club_name: 'Test Club',
    status: 'online',
    current_metrics: {
      cpu_usage: 45.5,
      memory_usage: 60.2,
      temperature: 55.0,
      disk_usage: 30.0,
      uptime: 86400000,
      recorded_at: '2025-12-10T10:00:00Z'
    },
    availability_24h: 99.5,
    alerts_24h: 2,
    last_seen_at: '2025-12-10T10:00:00Z'
  };

  const mockAvailabilityData: AvailabilityData[] = [
    { date: '2025-12-10', total_minutes: 1440, online_minutes: 1430, availability_percent: 99.3 },
    { date: '2025-12-09', total_minutes: 1440, online_minutes: 1440, availability_percent: 100 }
  ];

  const mockAlerts: AlertData[] = [
    {
      id: 'alert-1',
      type: 'temperature',
      severity: 'warning',
      message: 'High temperature detected',
      resolved: true,
      created_at: '2025-12-10T08:00:00Z',
      resolved_at: '2025-12-10T08:30:00Z'
    }
  ];

  const mockUsageStats: UsageStats = {
    period: '30d',
    total_plays: 150,
    unique_videos: 25,
    total_duration: 45000,
    avg_completion_rate: 85.5,
    manual_triggers: 100,
    auto_plays: 50,
    daily_breakdown: [
      { date: '2025-12-10', plays: 10, duration: 3000 }
    ]
  };

  const mockContentStats: ContentStats = {
    top_videos: [
      { filename: 'sponsor1.mp4', category: 'sponsors', play_count: 50, total_duration: 1500, avg_completion: 95 }
    ],
    categories_breakdown: [
      { category: 'sponsors', play_count: 100, total_duration: 30000 }
    ]
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj('ApiService', ['get']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AnalyticsService,
        { provide: ApiService, useValue: apiServiceSpy }
      ]
    });

    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getClubHealth', () => {
    it('should call API with correct endpoint', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of(mockHealthData));

      service.getClubHealth(siteId).subscribe(result => {
        expect(result).toEqual(mockHealthData);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/health`);
    });
  });

  describe('getClubAvailability', () => {
    it('should call API with default days parameter', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of({ availability: mockAvailabilityData }));

      service.getClubAvailability(siteId).subscribe(result => {
        expect(result.availability).toEqual(mockAvailabilityData);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/availability`, { days: 7 });
    });

    it('should call API with custom days parameter', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of({ availability: mockAvailabilityData }));

      service.getClubAvailability(siteId, 30).subscribe();

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/availability`, { days: 30 });
    });
  });

  describe('getClubAlerts', () => {
    it('should call API with correct parameters', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of({ alerts: mockAlerts }));

      service.getClubAlerts(siteId, 14).subscribe(result => {
        expect(result.alerts).toEqual(mockAlerts);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/alerts`, { days: 14 });
    });
  });

  describe('getClubUsage', () => {
    it('should call API with correct endpoint and default days', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of(mockUsageStats));

      service.getClubUsage(siteId).subscribe(result => {
        expect(result).toEqual(mockUsageStats);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/usage`, { days: 30 });
    });
  });

  describe('getClubContent', () => {
    it('should call API with correct endpoint', () => {
      const siteId = 'site-123';
      apiServiceSpy.get.and.returnValue(of(mockContentStats));

      service.getClubContent(siteId, 60).subscribe(result => {
        expect(result).toEqual(mockContentStats);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/content`, { days: 60 });
    });
  });

  describe('getClubDashboard', () => {
    it('should call API with correct endpoint', () => {
      const siteId = 'site-123';
      const mockDashboard = {
        health: mockHealthData,
        usage: mockUsageStats,
        content: mockContentStats,
        recent_sessions: []
      };
      apiServiceSpy.get.and.returnValue(of(mockDashboard));

      service.getClubDashboard(siteId).subscribe(result => {
        expect(result).toEqual(mockDashboard);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith(`/analytics/clubs/${siteId}/dashboard`);
    });
  });

  describe('exportClubData', () => {
    it('should call HTTP with blob response type for CSV export', () => {
      const siteId = 'site-123';
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });

      service.exportClubData(siteId, 'csv', 30).subscribe(result => {
        expect(result).toEqual(mockBlob);
      });

      const req = httpMock.expectOne(
        req => req.url.includes(`/analytics/clubs/${siteId}/export`) &&
               req.params.get('format') === 'csv' &&
               req.params.get('days') === '30'
      );
      expect(req.request.responseType).toBe('blob');
      req.flush(mockBlob);
    });

    it('should call HTTP with blob response type for JSON export', () => {
      const siteId = 'site-123';
      const mockBlob = new Blob(['{"data": []}'], { type: 'application/json' });

      service.exportClubData(siteId, 'json', 7).subscribe();

      const req = httpMock.expectOne(
        req => req.url.includes(`/analytics/clubs/${siteId}/export`) &&
               req.params.get('format') === 'json'
      );
      req.flush(mockBlob);
    });
  });

  describe('getAnalyticsOverview', () => {
    it('should call API with correct endpoint', () => {
      const mockOverview = {
        total_sites: 10,
        online_sites: 8,
        total_plays_today: 100,
        total_plays_week: 500,
        avg_availability: 98.5,
        sites_summary: []
      };
      apiServiceSpy.get.and.returnValue(of(mockOverview));

      service.getAnalyticsOverview().subscribe(result => {
        expect(result).toEqual(mockOverview);
      });

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/analytics/overview');
    });
  });
});
