import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { VideoErrorRecoveryService, ErrorRecoveryCallbacks } from './video-error-recovery.service';
import { AnalyticsService } from './analytics.service';
import { NgZone } from '@angular/core';

describe('VideoErrorRecoveryService', () => {
  let service: VideoErrorRecoveryService;
  let mockAnalytics: { trackVideoError: jasmine.Spy };
  let callbacks: ErrorRecoveryCallbacks;
  let players: {
    loopA: HTMLVideoElement;
    loopB: HTMLVideoElement;
    manualA: HTMLVideoElement;
    manualB: HTMLVideoElement;
  };

  function createMockVideoElement(): HTMLVideoElement {
    const el = document.createElement('video');
    spyOn(el, 'play').and.returnValue(Promise.resolve());
    spyOn(el, 'pause');
    spyOn(el, 'load');
    Object.defineProperty(el, 'currentTime', { value: 0, writable: true, configurable: true });
    Object.defineProperty(el, 'paused', { value: false, writable: true, configurable: true });
    Object.defineProperty(el, 'ended', { value: false, writable: true, configurable: true });
    Object.defineProperty(el, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(el, 'networkState', { value: 1, writable: true, configurable: true });
    Object.defineProperty(el, 'videoWidth', { value: 1280, writable: true, configurable: true });
    Object.defineProperty(el, 'videoHeight', { value: 720, writable: true, configurable: true });
    return el;
  }

  beforeEach(() => {
    mockAnalytics = {
      trackVideoError: jasmine.createSpy('trackVideoError'),
    };

    callbacks = {
      onSkipToNext: jasmine.createSpy('onSkipToNext'),
      onFullReset: jasmine.createSpy('onFullReset'),
      onManualErrorRecovery: jasmine.createSpy('onManualErrorRecovery'),
    };

    players = {
      loopA: createMockVideoElement(),
      loopB: createMockVideoElement(),
      manualA: createMockVideoElement(),
      manualB: createMockVideoElement(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });

    service = TestBed.inject(VideoErrorRecoveryService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------------

  it('should initialize with players and callbacks', () => {
    expect(() => service.init(players, null, callbacks)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // updateState
  // ---------------------------------------------------------------------------

  it('should update internal state', () => {
    service.init(players, null, callbacks);
    expect(() => service.updateState({
      isLoopMode: true,
      isManualMode: false,
      activeLoopPlayer: 'A',
      pendingSwitch: false,
    })).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Video error handling
  // ---------------------------------------------------------------------------

  it('should call onSkipToNext on loop player error', () => {
    service.init(players, null, callbacks);

    // Simuler une erreur sur loopA
    const errorEvent = new Event('error');
    players.loopA.dispatchEvent(errorEvent);

    // Le handler devrait appeler onSkipToNext
    expect(callbacks.onSkipToNext).toHaveBeenCalledWith(1000);
  });

  it('should call onManualErrorRecovery on manual player error', () => {
    service.init(players, null, callbacks);

    const errorEvent = new Event('error');
    players.manualA.dispatchEvent(errorEvent);

    expect(callbacks.onManualErrorRecovery).toHaveBeenCalled();
  });

  it('should call onFullReset after MAX_CONSECUTIVE_ERRORS', () => {
    service.init(players, null, callbacks);

    // Simuler 3 erreurs cons\u00e9cutives
    for (let i = 0; i < 3; i++) {
      players.loopA.dispatchEvent(new Event('error'));
    }

    expect(callbacks.onFullReset).toHaveBeenCalled();
  });

  it('should track error in analytics', () => {
    service.init(players, null, callbacks);
    Object.defineProperty(players.loopA, 'src', { value: '/videos/test.mp4', writable: true, configurable: true });

    players.loopA.dispatchEvent(new Event('error'));

    expect(mockAnalytics.trackVideoError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // resetConsecutiveErrors
  // ---------------------------------------------------------------------------

  it('should reset consecutive errors counter', () => {
    service.init(players, null, callbacks);

    // 2 erreurs
    players.loopA.dispatchEvent(new Event('error'));
    players.loopA.dispatchEvent(new Event('error'));

    service.resetConsecutiveErrors();

    // 1 erreur suppl\u00e9mentaire ne devrait PAS d\u00e9clencher le fullReset (car on a reset)
    players.loopA.dispatchEvent(new Event('error'));
    expect(callbacks.onFullReset).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // incrementVideoPlayCount
  // ---------------------------------------------------------------------------

  it('should trigger cleanup after 50 videos', () => {
    service.init(players, null, callbacks);
    spyOn(service, 'performPreventiveMemoryCleanup');

    for (let i = 0; i < 50; i++) {
      service.incrementVideoPlayCount();
    }

    expect(service.performPreventiveMemoryCleanup).toHaveBeenCalled();
  });

  it('should NOT trigger cleanup before 50 videos', () => {
    service.init(players, null, callbacks);
    spyOn(service, 'performPreventiveMemoryCleanup');

    for (let i = 0; i < 49; i++) {
      service.incrementVideoPlayCount();
    }

    expect(service.performPreventiveMemoryCleanup).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // performPreventiveMemoryCleanup
  // ---------------------------------------------------------------------------

  it('should clean inactive loop player', () => {
    service.init(players, null, callbacks);
    service.updateState({
      isLoopMode: true,
      isManualMode: false,
      activeLoopPlayer: 'A',
      pendingSwitch: false,
    });

    // Mettre un src sur le player B (inactif)
    Object.defineProperty(players.loopB, 'src', { value: '/videos/old.mp4', writable: true, configurable: true });

    service.performPreventiveMemoryCleanup();

    // Le player inactif devrait \u00eatre nettoy\u00e9
    expect(players.loopB.load).toHaveBeenCalled();
  });

  it('should clean manual players when not in manual mode', () => {
    service.init(players, null, callbacks);
    service.updateState({
      isLoopMode: true,
      isManualMode: false,
      activeLoopPlayer: 'A',
      pendingSwitch: false,
    });

    Object.defineProperty(players.manualA, 'src', { value: '/videos/manual.mp4', writable: true, configurable: true });

    service.performPreventiveMemoryCleanup();

    expect(players.manualA.load).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Watchdog
  // ---------------------------------------------------------------------------

  it('should stop watchdog on destroy', () => {
    service.init(players, null, callbacks);
    expect(() => service.destroy()).not.toThrow();
  });

  it('should stop watchdog explicitly', () => {
    service.init(players, null, callbacks);
    expect(() => service.stopWatchdog()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Stall handler
  // ---------------------------------------------------------------------------

  it('should handle stalled event on loop players', () => {
    service.init(players, null, callbacks);
    // Le stall handler devrait ne pas throw
    expect(() => players.loopA.dispatchEvent(new Event('stalled'))).not.toThrow();
  });
});
