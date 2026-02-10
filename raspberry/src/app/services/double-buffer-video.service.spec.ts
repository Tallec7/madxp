import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DoubleBufferVideoService, DoubleBufferCallbacks } from './double-buffer-video.service';
import { NgZone } from '@angular/core';
import { Sponsor } from '../interfaces/sponsor.interface';

describe('DoubleBufferVideoService', () => {
  let service: DoubleBufferVideoService;
  let callbacks: DoubleBufferCallbacks;
  let elements: {
    playerA: HTMLVideoElement;
    playerB: HTMLVideoElement;
    manualPlayerA: HTMLVideoElement;
    manualPlayerB: HTMLVideoElement;
    freezeCanvas: HTMLCanvasElement;
    blackOverlay: HTMLDivElement;
  };

  function createMockVideoElement(): HTMLVideoElement {
    const el = document.createElement('video');
    spyOn(el, 'play').and.returnValue(Promise.resolve());
    spyOn(el, 'pause');
    spyOn(el, 'load');
    Object.defineProperty(el, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(el, 'videoWidth', { value: 1280, writable: true, configurable: true });
    Object.defineProperty(el, 'videoHeight', { value: 720, writable: true, configurable: true });
    return el;
  }

  function createMockCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = {
      drawImage: jasmine.createSpy('drawImage'),
      clearRect: jasmine.createSpy('clearRect'),
    };
    spyOn(canvas, 'getContext').and.returnValue(ctx as unknown as CanvasRenderingContext2D);
    return canvas;
  }

  const testVideos: Sponsor[] = [
    { name: 'video1.mp4', type: 'video/mp4', path: '/videos/video1.mp4' },
    { name: 'video2.mp4', type: 'video/mp4', path: '/videos/video2.mp4' },
    { name: 'video3.mp4', type: 'video/mp4', path: '/videos/video3.mp4' },
  ];

  beforeEach(() => {
    callbacks = {
      onVideoStarted: jasmine.createSpy('onVideoStarted'),
      onVideoEnded: jasmine.createSpy('onVideoEnded'),
      onSwitchComplete: jasmine.createSpy('onSwitchComplete'),
      onError: jasmine.createSpy('onError'),
    };

    elements = {
      playerA: createMockVideoElement(),
      playerB: createMockVideoElement(),
      manualPlayerA: createMockVideoElement(),
      manualPlayerB: createMockVideoElement(),
      freezeCanvas: createMockCanvas(),
      blackOverlay: document.createElement('div'),
    };

    TestBed.configureTestingModule({});
    service = TestBed.inject(DoubleBufferVideoService);
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

  it('should initialize with elements and callbacks', () => {
    service.init(elements, callbacks);

    // Players should be configured
    expect(elements.playerA.muted).toBe(true);
    expect(elements.playerA.playsInline).toBe(true);
    expect(elements.playerB.muted).toBe(true);
    expect(elements.manualPlayerA.muted).toBe(true);
    expect(elements.manualPlayerB.muted).toBe(true);
  });

  it('should set player A visible and B hidden after init', () => {
    service.init(elements, callbacks);
    expect(elements.playerA.style.opacity).toBe('1');
    expect(elements.playerB.style.opacity).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  it('should return correct initial state', () => {
    service.init(elements, callbacks);
    expect(service.isInLoopMode).toBe(false);
    expect(service.isInManualMode).toBe(false);
    expect(service.currentIndex).toBe(0);
    expect(service.isPendingSwitch).toBe(false);
    expect(service.activeLoopPlayer).toBe('A');
  });

  it('should return active player', () => {
    service.init(elements, callbacks);
    expect(service.getActivePlayer()).toBe(elements.playerA);
    expect(service.getInactivePlayer()).toBe(elements.playerB);
  });

  // ---------------------------------------------------------------------------
  // startLoop
  // ---------------------------------------------------------------------------

  it('should start loop mode', fakeAsync(() => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);

    tick(200);

    expect(service.isInLoopMode).toBe(true);
    expect(elements.playerA.play).toHaveBeenCalled();
  }));

  it('should NOT start loop with empty videos', () => {
    service.init(elements, callbacks);
    service.startLoop([]);

    expect(service.isInLoopMode).toBe(false);
  });

  it('should pause existing players before starting loop', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);

    expect(elements.playerA.pause).toHaveBeenCalled();
    expect(elements.playerB.pause).toHaveBeenCalled();
  });

  it('should call onVideoStarted callback after play resolves', fakeAsync(() => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);

    tick(200);

    expect(callbacks.onVideoStarted).toHaveBeenCalledWith(testVideos[0], 'A');
  }));

  // ---------------------------------------------------------------------------
  // stopLoop
  // ---------------------------------------------------------------------------

  it('should stop loop mode', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);
    service.stopLoop();

    expect(service.isInLoopMode).toBe(false);
    expect(elements.playerA.pause).toHaveBeenCalled();
    expect(elements.playerB.pause).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // preloadOnInactivePlayer
  // ---------------------------------------------------------------------------

  it('should preload video on inactive player', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);

    service.preloadOnInactivePlayer(1);

    // Player B (inactive) should have the next video loaded
    expect(elements.playerB.src).toContain('video2.mp4');
    expect(elements.playerB.load).toHaveBeenCalled();
  });

  it('should not re-preload if same video already preloaded', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);

    service.preloadOnInactivePlayer(1);
    (elements.playerB.load as jasmine.Spy).calls.reset();

    // Simulate preload ready
    service['preloadReady'] = true;

    service.preloadOnInactivePlayer(1);
    expect(elements.playerB.load).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Freeze frame
  // ---------------------------------------------------------------------------

  it('should capture and show freeze frame', () => {
    service.init(elements, callbacks);

    const result = service.captureAndShowFreezeFrame();
    // Active player has valid dimensions (mocked)
    expect(result).toBe(true);
    expect(elements.freezeCanvas.style.display).toBe('block');
  });

  it('should return false if no freeze canvas', () => {
    service.init({
      ...elements,
      freezeCanvas: null as unknown as HTMLCanvasElement,
    }, callbacks);

    const result = service.captureAndShowFreezeFrame();
    expect(result).toBe(false);
  });

  it('should hide freeze frame', () => {
    service.init(elements, callbacks);
    service.captureAndShowFreezeFrame();
    service.hideFreezeFrame();

    expect(elements.freezeCanvas.style.opacity).toBe('0');
    expect(elements.freezeCanvas.style.display).toBe('none');
  });

  // ---------------------------------------------------------------------------
  // Black overlay
  // ---------------------------------------------------------------------------

  it('should show black overlay', () => {
    service.init(elements, callbacks);
    service.showBlackOverlay();
    expect(elements.blackOverlay.style.opacity).toBe('1');
  });

  it('should hide black overlay', () => {
    service.init(elements, callbacks);
    service.showBlackOverlay();
    service.hideBlackOverlay();
    expect(elements.blackOverlay.style.opacity).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // endManualMode
  // ---------------------------------------------------------------------------

  it('should end manual mode', () => {
    service.init(elements, callbacks);
    service['isManualMode'] = true;

    service.endManualMode();

    expect(service.isInManualMode).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // performFullReset
  // ---------------------------------------------------------------------------

  it('should reset all state on full reset', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);
    service['isManualMode'] = true;

    service.performFullReset();

    expect(service.isInLoopMode).toBe(false);
    expect(service.isInManualMode).toBe(false);
    expect(service.isPendingSwitch).toBe(false);
    expect(service.currentIndex).toBe(0);
    expect(service.activeLoopPlayer).toBe('A');
  });

  it('should pause and clean all players on full reset', () => {
    service.init(elements, callbacks);

    service.performFullReset();

    expect(elements.playerA.pause).toHaveBeenCalled();
    expect(elements.playerB.pause).toHaveBeenCalled();
    expect(elements.manualPlayerA.pause).toHaveBeenCalled();
    expect(elements.manualPlayerB.pause).toHaveBeenCalled();
  });

  it('should restore player A visible, B hidden after reset', () => {
    service.init(elements, callbacks);
    service.performFullReset();

    expect(elements.playerA.style.opacity).toBe('1');
    expect(elements.playerB.style.opacity).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // destroy
  // ---------------------------------------------------------------------------

  it('should clean all references on destroy', () => {
    service.init(elements, callbacks);
    service.destroy();

    expect(service.getActivePlayer()).toBeNull();
    expect(service.getInactivePlayer()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // triggerSwitch
  // ---------------------------------------------------------------------------

  it('should trigger switch to next video', fakeAsync(() => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);
    tick(200);

    service.triggerSwitch();

    expect(service.isPendingSwitch).toBe(true);
    expect(callbacks.onVideoEnded).toHaveBeenCalledWith(true);
  }));

  it('should not trigger switch if already pending', () => {
    service.init(elements, callbacks);
    service.startLoop(testVideos);
    service['pendingSwitch'] = true;

    const beforeCalls = (callbacks.onVideoEnded as jasmine.Spy).calls.count();
    service.triggerSwitch();
    expect((callbacks.onVideoEnded as jasmine.Spy).calls.count()).toBe(beforeCalls);
  });
});
