import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SponsorAnalyticsService, SponsorImpression } from './sponsor-analytics.service';
import { RecordingStateService } from './recording-state.service';
import { Video } from '../interfaces/video.interface';

describe('SponsorAnalyticsService', () => {
  let service: SponsorAnalyticsService;
  let httpMock: HttpTestingController;
  let mockRecording: { isRecording: boolean };
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });

    spyOn(window, 'setInterval');
    spyOn(window, 'addEventListener');

    mockRecording = { isRecording: true };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RecordingStateService, useValue: mockRecording },
      ],
    });

    service = TestBed.inject(SponsorAnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true);
  });

  const sponsorVideo: Video = { name: 'sponsor.mp4', type: 'video/mp4', path: '/sponsors/sponsor.mp4', id: 'vid-1' };

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Configuration setters
  // ---------------------------------------------------------------------------

  it('should set site ID', () => {
    service.setSiteId('site-123');
    // Vérifié indirectement via trackSponsorStart
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);
    expect(service.getBuffer()[0].site_id).toBe('site-123');
  });

  it('should set event type', () => {
    service.setEventType('match');
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);
    expect(service.getBuffer()[0].event_type).toBe('match');
  });

  it('should set period', () => {
    service.setPeriod('halftime');
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);
    expect(service.getBuffer()[0].period).toBe('halftime');
  });

  it('should set audience estimate', () => {
    service.setAudienceEstimate(200);
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);
    expect(service.getBuffer()[0].audience_estimate).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // trackSponsorStart / trackSponsorEnd
  // ---------------------------------------------------------------------------

  it('should track sponsor start and end', () => {
    service.trackSponsorStart(sponsorVideo, 'auto', 30);
    service.trackSponsorEnd(true);

    const buffer = service.getBuffer();
    expect(buffer.length).toBe(1);
    expect(buffer[0].video_filename).toBe('sponsor.mp4');
    expect(buffer[0].completed).toBe(true);
    expect(buffer[0].video_duration).toBe(30);
    expect(buffer[0].trigger_type).toBe('auto');
  });

  it('should track manual trigger', () => {
    service.trackSponsorStart(sponsorVideo, 'manual');
    service.trackSponsorEnd(true);
    expect(service.getBuffer()[0].trigger_type).toBe('manual');
  });

  it('should NOT track when recording is OFF', () => {
    mockRecording.isRecording = false;
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);
    expect(service.getBuffer().length).toBe(0);
  });

  it('should end previous impression when starting new one', () => {
    service.trackSponsorStart(sponsorVideo);
    const video2: Video = { name: 'other.mp4', type: 'video/mp4', path: '/sponsors/other.mp4' };
    service.trackSponsorStart(video2);

    const buffer = service.getBuffer();
    expect(buffer.length).toBe(1);
    expect(buffer[0].video_filename).toBe('sponsor.mp4');
    expect(buffer[0].completed).toBe(false);
  });

  it('should reset internal state when recording turns OFF during end', () => {
    service.trackSponsorStart(sponsorVideo);
    mockRecording.isRecording = false;
    service.trackSponsorEnd(true);
    expect(service.getBuffer().length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // updateCurrentImpression
  // ---------------------------------------------------------------------------

  it('should update current impression with new data', () => {
    service.trackSponsorStart(sponsorVideo);
    service.updateCurrentImpression({ period: 'post_match' });
    service.trackSponsorEnd(true);

    expect(service.getBuffer()[0].period).toBe('post_match');
  });

  it('should do nothing if no current impression', () => {
    expect(() => service.updateCurrentImpression({ period: 'halftime' })).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Buffer management
  // ---------------------------------------------------------------------------

  it('should persist buffer to localStorage', () => {
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'neopro_sponsor_impressions',
      jasmine.any(String)
    );
  });

  it('should load buffer from localStorage on creation', () => {
    // Pré-remplir localStorage AVANT la création du service
    const stored: SponsorImpression[] = [{
      video_filename: 'stored.mp4',
      played_at: new Date().toISOString(),
      duration_played: 15,
      video_duration: 30,
      completed: true,
      event_type: 'match',
      period: 'halftime',
      trigger_type: 'auto',
    }];
    localStorageMock['neopro_sponsor_impressions'] = JSON.stringify(stored);

    // Recréer via TestBed pour respecter le contexte d'injection Angular
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RecordingStateService, useValue: mockRecording },
      ],
    });

    const newService = TestBed.inject(SponsorAnalyticsService);
    expect(newService.getBuffer().length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Buffer stats
  // ---------------------------------------------------------------------------

  it('should return buffer stats', () => {
    expect(service.getBufferStats()).toEqual({ count: 0, oldestImpression: null });

    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);

    const stats = service.getBufferStats();
    expect(stats.count).toBe(1);
    expect(stats.oldestImpression).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // HTTP send
  // ---------------------------------------------------------------------------

  it('should send impression to server immediately', () => {
    service.trackSponsorStart(sponsorVideo);
    service.trackSponsorEnd(true);

    const req = httpMock.expectOne(req => req.url.includes('/api/sync/sponsor-impressions'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.impressions.length).toBe(1);
    req.flush({ success: true, received: 1, queued: 1 });
  });

  // ---------------------------------------------------------------------------
  // setConfiguration
  // ---------------------------------------------------------------------------

  it('should set configuration without error', () => {
    expect(() => service.setConfiguration({
      remote: { title: 'Test' },
      version: '1.0',
      categories: [],
      sponsors: [],
      sync: { siteName: 'TestSite', clubName: 'Club' },
    })).not.toThrow();
  });
});
