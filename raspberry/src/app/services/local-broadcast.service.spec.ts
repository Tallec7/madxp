import { TestBed } from '@angular/core/testing';
import {
  LocalBroadcastService,
  BroadcastMessage,
  ScoreUpdateEvent,
  PhaseChangeEvent,
  CommandEvent,
  BreakingNewsEvent,
  TimerUpdateEvent,
  RecordingStateEvent,
} from './local-broadcast.service';
import { BroadcastChannelMock, mockBroadcastChannel } from './testing/test-helpers';

describe('LocalBroadcastService', () => {
  let service: LocalBroadcastService;

  beforeEach(() => {
    mockBroadcastChannel();

    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalBroadcastService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    BroadcastChannelMock.reset();
  });

  /**
   * Helper : simule la réception d'un message BroadcastChannel entrant.
   * En production, c'est un autre onglet qui envoie. En test, on appelle
   * directement le handler onmessage du channel interne du service.
   */
  function simulateIncoming(type: string, payload: unknown): void {
    const channel = (service as unknown as { channel: BroadcastChannel }).channel;
    if (channel && channel.onmessage) {
      const msg: BroadcastMessage = {
        type: type as BroadcastMessage['type'],
        payload,
        timestamp: Date.now(),
      };
      channel.onmessage(new MessageEvent('message', { data: msg }));
    }
  }

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Score events
  // ---------------------------------------------------------------------------

  it('should receive score updates', (done) => {
    const score: ScoreUpdateEvent = {
      homeTeam: 'Home',
      awayTeam: 'Away',
      homeScore: 2,
      awayScore: 1,
    };

    service.onScoreUpdate().subscribe(event => {
      expect(event.homeTeam).toBe('Home');
      expect(event.homeScore).toBe(2);
      done();
    });

    simulateIncoming('score-update', score);
  });

  it('should receive score reset', (done) => {
    service.onScoreUpdate().subscribe(event => {
      expect(event.reset).toBe(true);
      expect(event.homeScore).toBe(0);
      expect(event.awayScore).toBe(0);
      done();
    });

    simulateIncoming('score-reset', null);
  });

  // ---------------------------------------------------------------------------
  // Phase change events
  // ---------------------------------------------------------------------------

  it('should receive phase changes', (done) => {
    const phase: PhaseChangeEvent = { phase: 'during' };

    service.onPhaseChange().subscribe(event => {
      expect(event.phase).toBe('during');
      done();
    });

    simulateIncoming('phase-change', phase);
  });

  // ---------------------------------------------------------------------------
  // Command events
  // ---------------------------------------------------------------------------

  it('should receive commands', (done) => {
    const cmd: CommandEvent = { type: 'play-video', data: { path: '/test.mp4' } };

    service.onCommand().subscribe(event => {
      expect(event.type).toBe('play-video');
      done();
    });

    simulateIncoming('command', cmd);
  });

  // ---------------------------------------------------------------------------
  // Breaking news events
  // ---------------------------------------------------------------------------

  it('should receive breaking news', (done) => {
    const news: BreakingNewsEvent = {
      message: 'Test news',
      duration: 10,
      position: 'bottom',
      displayMode: 'scroll',
    };

    service.onBreakingNews().subscribe(event => {
      expect(event.message).toBe('Test news');
      done();
    });

    simulateIncoming('breaking-news', news);
  });

  // ---------------------------------------------------------------------------
  // Timer events
  // ---------------------------------------------------------------------------

  it('should receive timer updates', (done) => {
    const timer: TimerUpdateEvent = { action: 'start', currentTime: 0, isRunning: true };

    service.onTimerUpdate().subscribe(event => {
      expect(event.action).toBe('start');
      done();
    });

    simulateIncoming('timer-update', timer);
  });

  // ---------------------------------------------------------------------------
  // Recording state events
  // ---------------------------------------------------------------------------

  it('should receive recording state', (done) => {
    const state: RecordingStateEvent = { isRecording: true, isManualOverride: false };

    service.onRecordingState().subscribe(event => {
      expect(event.isRecording).toBe(true);
      done();
    });

    simulateIncoming('recording-state', state);
  });

  // ---------------------------------------------------------------------------
  // Options update events
  // ---------------------------------------------------------------------------

  it('should receive options updates', (done) => {
    service.onOptionsUpdate().subscribe(event => {
      expect((event as any).template).toBe('broadcast');
      done();
    });

    simulateIncoming('options-update', { template: 'broadcast' });
  });

  // ---------------------------------------------------------------------------
  // Emit / broadcast
  // ---------------------------------------------------------------------------

  it('should call postMessage when emitting score update', () => {
    const channel = (service as unknown as { channel: BroadcastChannel }).channel;
    spyOn(channel!, 'postMessage');

    const score: ScoreUpdateEvent = {
      homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
    };
    service.emitScoreUpdate(score);

    expect(channel!.postMessage).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: 'score-update', payload: score })
    );
  });

  it('should call postMessage when emitting phase change', () => {
    const channel = (service as unknown as { channel: BroadcastChannel }).channel;
    spyOn(channel!, 'postMessage');

    service.emitPhaseChange({ phase: 'during' });
    expect(channel!.postMessage).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: 'phase-change' })
    );
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  it('should close channel on destroy', () => {
    expect(() => service.ngOnDestroy()).not.toThrow();
  });
});
