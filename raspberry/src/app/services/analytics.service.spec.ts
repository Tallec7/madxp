import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AnalyticsService, VideoPlayEvent } from './analytics.service';
import { HdmiStatusService } from './hdmi-status.service';
import { RecordingStateService } from './recording-state.service';
import { Video } from '../interfaces/video.interface';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;
  let mockHdmi: { getTvStatusForAnalytics: jasmine.Spy; isTvOn: jasmine.Spy };
  let mockRecording: { isRecording: boolean };
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => { delete localStorageMock[key]; });

    // Empêcher les timers
    spyOn(window, 'setInterval');
    spyOn(window, 'addEventListener');

    mockHdmi = {
      getTvStatusForAnalytics: jasmine.createSpy('getTvStatusForAnalytics').and.returnValue('on'),
      isTvOn: jasmine.createSpy('isTvOn').and.returnValue(true),
    };

    mockRecording = { isRecording: true };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HdmiStatusService, useValue: mockHdmi },
        { provide: RecordingStateService, useValue: mockRecording },
      ],
    });

    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true); // flush pending
  });

  const testVideo: Video = { name: 'test.mp4', type: 'video/mp4', path: '/videos/test.mp4' };

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  it('should start a session with unique ID', () => {
    service.startSession();
    // L'ID est interne, on vérifie qu'il ne throw pas
    expect(() => service.startSession()).not.toThrow();
  });

  it('should end session', () => {
    service.startSession();
    service.endSession();
    // Pas d'erreur
    expect(() => service.endSession()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // trackVideoStart / trackVideoEnd
  // ---------------------------------------------------------------------------

  it('should track video start and end', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    const buffer = service.getBuffer();
    expect(buffer.length).toBe(1);
    expect(buffer[0].video_filename).toBe('test.mp4');
    expect(buffer[0].completed).toBe(true);
    expect(buffer[0].trigger_type).toBe('auto');
    expect(buffer[0].tv_status).toBe('on');
  });

  it('should track manual trigger type', () => {
    service.trackVideoStart(testVideo, 'manual');
    service.trackVideoEnd(true);

    expect(service.getBuffer()[0].trigger_type).toBe('manual');
  });

  it('should include video_id and sponsor_id if available', () => {
    const video: Video = { ...testVideo, video_id: 'vid-123', sponsor_id: 'sp-456' };
    service.trackVideoStart(video);
    service.trackVideoEnd(true);

    const event = service.getBuffer()[0];
    expect(event.video_id).toBe('vid-123');
    expect(event.sponsor_id).toBe('sp-456');
  });

  it('should NOT track when recording is OFF', () => {
    mockRecording.isRecording = false;

    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    expect(service.getBuffer().length).toBe(0);
  });

  it('should skip events when TV is in standby', () => {
    mockHdmi.getTvStatusForAnalytics.and.returnValue('standby');

    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    expect(service.getBuffer().length).toBe(0);
  });

  it('should skip events when TV is disconnected', () => {
    mockHdmi.getTvStatusForAnalytics.and.returnValue('disconnected');

    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    expect(service.getBuffer().length).toBe(0);
  });

  it('should track events when TV status is unknown', () => {
    mockHdmi.getTvStatusForAnalytics.and.returnValue('unknown');

    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    expect(service.getBuffer().length).toBe(1);
    expect(service.getBuffer()[0].tv_status).toBe('unknown');
  });

  it('should end previous video as incomplete when starting new one', () => {
    service.trackVideoStart(testVideo);
    // Start another without ending
    const video2: Video = { name: 'other.mp4', type: 'video/mp4', path: '/videos/other.mp4' };
    service.trackVideoStart(video2);

    // Premier devrait être dans le buffer comme incomplet
    const buffer = service.getBuffer();
    expect(buffer.length).toBe(1);
    expect(buffer[0].video_filename).toBe('test.mp4');
    expect(buffer[0].completed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Category detection
  // ---------------------------------------------------------------------------

  it('should use analytics_category when available', () => {
    const video: Video = { ...testVideo, analytics_category: 'jingle' };
    service.trackVideoStart(video);
    service.trackVideoEnd(true);

    expect(service.getBuffer()[0].category).toBe('jingle');
  });

  it('should use categoryMappings when analytics_category not set', () => {
    service.setConfiguration({
      remote: { title: 'Test' },
      version: '1.0',
      categories: [],
      sponsors: [],
      categoryMappings: { 'cat1': 'sponsor' },
    });

    const video: Video = { ...testVideo, categoryId: 'cat1' };
    service.trackVideoStart(video);
    service.trackVideoEnd(true);

    expect(service.getBuffer()[0].category).toBe('sponsor');
  });

  it('should detect category by path fallback', () => {
    const sponsorVideo: Video = { name: 'ad.mp4', type: 'video/mp4', path: '/sponsor/ad.mp4' };
    service.trackVideoStart(sponsorVideo);
    service.trackVideoEnd(true);
    expect(service.getBuffer()[0].category).toBe('sponsor');

    // Jingle
    const jingleVideo: Video = { name: 'goal.mp4', type: 'video/mp4', path: '/jingle/goal.mp4' };
    service.trackVideoStart(jingleVideo);
    service.trackVideoEnd(true);
    expect(service.getBuffer()[1].category).toBe('jingle');
  });

  it('should return "other" for unmatched paths', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);
    expect(service.getBuffer()[0].category).toBe('other');
  });

  // ---------------------------------------------------------------------------
  // Buffer management
  // ---------------------------------------------------------------------------

  it('should persist buffer to localStorage', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'neopro_analytics_buffer',
      jasmine.any(String)
    );
  });

  it('should load buffer from localStorage on creation', () => {
    // Pré-remplir localStorage AVANT la création du service
    const stored: VideoPlayEvent[] = [{
      video_filename: 'stored.mp4',
      category: 'other',
      played_at: new Date().toISOString(),
      duration_played: 10,
      video_duration: 10,
      completed: true,
      trigger_type: 'auto',
    }];
    localStorageMock['neopro_analytics_buffer'] = JSON.stringify(stored);

    // Recréer le service via TestBed pour respecter le contexte d'injection Angular
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HdmiStatusService, useValue: mockHdmi },
        { provide: RecordingStateService, useValue: mockRecording },
      ],
    });

    const newService = TestBed.inject(AnalyticsService);
    expect(newService.getBuffer().length).toBe(1);
    expect(newService.getBuffer()[0].video_filename).toBe('stored.mp4');
  });

  it('should clear buffer', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);
    expect(service.getBuffer().length).toBe(1);

    service.clearBuffer();
    expect(service.getBuffer().length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Buffer stats
  // ---------------------------------------------------------------------------

  it('should return buffer stats', () => {
    expect(service.getBufferStats()).toEqual({ count: 0, oldestEvent: null });

    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    const stats = service.getBufferStats();
    expect(stats.count).toBe(1);
    expect(stats.oldestEvent).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // sendSingleEvent (HTTP)
  // ---------------------------------------------------------------------------

  it('should send event to server immediately after tracking', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoEnd(true);

    const req = httpMock.expectOne(req => req.url.includes('/api/analytics'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.events.length).toBe(1);
    req.flush({ success: true, received: 1, total: 1 });
  });

  // ---------------------------------------------------------------------------
  // trackVideoError
  // ---------------------------------------------------------------------------

  it('should track video error and end current video', () => {
    service.trackVideoStart(testVideo);
    service.trackVideoError(testVideo, new Error('Decode error'));

    const buffer = service.getBuffer();
    expect(buffer.length).toBe(1);
    expect(buffer[0].completed).toBe(false);
  });
});
