import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RecordingStateService, RecordingWarningState } from './recording-state.service';
import { LocalBroadcastService } from './local-broadcast.service';
import { SocketService } from './socket.service';
import { Subject } from 'rxjs';

describe('RecordingStateService', () => {
  let service: RecordingStateService;
  let mockLocalBroadcast: {
    emitRecordingState: jasmine.Spy;
    onRecordingState: jasmine.Spy;
  };
  let mockSocketService: {
    on: jasmine.Spy;
    emit: jasmine.Spy;
    initialize: jasmine.Spy;
  };
  let recordingStateSubject: Subject<{ isRecording: boolean; isManualOverride: boolean }>;

  const INACTIVITY_DELAY = 15 * 60 * 1000; // 15 minutes
  const WARNING_COUNTDOWN = 3 * 60; // 3 minutes en secondes

  beforeEach(() => {
    recordingStateSubject = new Subject();

    mockLocalBroadcast = {
      emitRecordingState: jasmine.createSpy('emitRecordingState'),
      onRecordingState: jasmine.createSpy('onRecordingState').and.returnValue(recordingStateSubject.asObservable()),
    };

    mockSocketService = {
      on: jasmine.createSpy('on'),
      emit: jasmine.createSpy('emit'),
      initialize: jasmine.createSpy('initialize'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: LocalBroadcastService, useValue: mockLocalBroadcast },
        { provide: SocketService, useValue: mockSocketService },
      ],
    });

    service = TestBed.inject(RecordingStateService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // État initial
  // ---------------------------------------------------------------------------

  it('should start with recording OFF', () => {
    expect(service.isRecording).toBe(false);
  });

  it('should emit false initially on isRecording$', (done) => {
    service.isRecording$.subscribe(val => {
      expect(val).toBe(false);
      done();
    });
  });

  it('should emit inactive warning initially', (done) => {
    service.warning$.subscribe(warning => {
      expect(warning.active).toBe(false);
      expect(warning.secondsRemaining).toBe(0);
      done();
    });
  });

  // ---------------------------------------------------------------------------
  // startRecording / stopRecording
  // ---------------------------------------------------------------------------

  it('should start recording manually', () => {
    service.startRecording(true);
    expect(service.isRecording).toBe(true);
  });

  it('should stop recording manually', () => {
    service.startRecording(true);
    service.stopRecording(true);
    expect(service.isRecording).toBe(false);
  });

  it('should broadcast state on start', () => {
    service.startRecording(true);
    expect(mockLocalBroadcast.emitRecordingState).toHaveBeenCalledWith({
      isRecording: true,
      isManualOverride: true,
    });
    expect(mockSocketService.emit).toHaveBeenCalledWith('recording-state', {
      isRecording: true,
      isManualOverride: true,
    });
  });

  it('should broadcast state on stop', () => {
    service.stopRecording(false);
    expect(mockLocalBroadcast.emitRecordingState).toHaveBeenCalledWith({
      isRecording: false,
      isManualOverride: false,
    });
  });

  // ---------------------------------------------------------------------------
  // toggleRecording
  // ---------------------------------------------------------------------------

  it('should toggle recording on', () => {
    service.toggleRecording();
    expect(service.isRecording).toBe(true);
  });

  it('should toggle recording off', () => {
    service.startRecording(true);
    service.toggleRecording();
    expect(service.isRecording).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // onPhaseChange
  // ---------------------------------------------------------------------------

  it('should auto-start on phase change to before', () => {
    service.onPhaseChange('before');
    expect(service.isRecording).toBe(true);
  });

  it('should auto-start on phase change to during', () => {
    service.onPhaseChange('during');
    expect(service.isRecording).toBe(true);
  });

  it('should NOT auto-start if already recording', () => {
    service.startRecording(true);
    mockLocalBroadcast.emitRecordingState.calls.reset();

    service.onPhaseChange('during');
    // Ne devrait pas re-broadcast (manual override, pas de reset inactivity)
    expect(mockLocalBroadcast.emitRecordingState).not.toHaveBeenCalled();
  });

  it('should start inactivity timer on return to neutral (auto recording)', fakeAsync(() => {
    service.onPhaseChange('during');
    expect(service.isRecording).toBe(true);

    service.onPhaseChange('neutral');
    // Encore en enregistrement (le timer d'inactivité n'a pas expiré)
    expect(service.isRecording).toBe(true);

    // Avancer de 15 minutes → warning apparaît
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);
    expect(warningState!.secondsRemaining).toBe(WARNING_COUNTDOWN);

    // Avancer de 3 minutes → auto-stop
    tick(WARNING_COUNTDOWN * 1000);
    expect(service.isRecording).toBe(false);
  }));

  it('should NOT auto-stop if manual override is active', fakeAsync(() => {
    service.startRecording(true); // manual = true
    service.onPhaseChange('neutral');

    tick(INACTIVITY_DELAY);
    tick(WARNING_COUNTDOWN * 1000);
    // Toujours en enregistrement car manual override
    expect(service.isRecording).toBe(true);
  }));

  it('should cancel inactivity timer on new phase change', fakeAsync(() => {
    service.onPhaseChange('during');
    service.onPhaseChange('neutral');
    // Timer d'inactivité démarré

    // Retour en phase match avant expiration
    tick(5 * 60 * 1000);
    service.onPhaseChange('during');

    // Même après 15 minutes, toujours en enregistrement (timer reset)
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);

    // Mais recording est encore actif
    expect(service.isRecording).toBe(true);

    discardPeriodicTasks();
  }));

  // ---------------------------------------------------------------------------
  // Timer d'inactivité — universel (toutes phases)
  // ---------------------------------------------------------------------------

  it('should trigger warning after inactivity in ANY phase (not just neutral)', fakeAsync(() => {
    service.onPhaseChange('during');
    expect(service.isRecording).toBe(true);

    // 15 minutes sans interaction pendant la phase 'during'
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);
    expect(warningState!.secondsRemaining).toBe(WARNING_COUNTDOWN);

    discardPeriodicTasks();
  }));

  it('should NOT start inactivity timer for manual recording', fakeAsync(() => {
    service.startRecording(true);

    tick(INACTIVITY_DELAY);
    tick(WARNING_COUNTDOWN * 1000);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(false);
    expect(service.isRecording).toBe(true);
  }));

  it('should reset inactivity timer on resetInactivityTimer()', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(10 * 60 * 1000); // 10 minutes

    service.resetInactivityTimer();
    tick(10 * 60 * 1000); // 10 more minutes (20 total, but 10 since reset)

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    // Should NOT have triggered warning yet (only 10 min since reset)
    expect(warningState!.active).toBe(false);

    // 5 more minutes (15 since reset)
    tick(5 * 60 * 1000);
    expect(warningState!.active).toBe(true);

    discardPeriodicTasks();
  }));

  // ---------------------------------------------------------------------------
  // Warning countdown
  // ---------------------------------------------------------------------------

  it('should count down from WARNING_COUNTDOWN seconds', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.secondsRemaining).toBe(180);

    tick(60 * 1000);
    expect(warningState!.secondsRemaining).toBe(120);

    tick(60 * 1000);
    expect(warningState!.secondsRemaining).toBe(60);

    discardPeriodicTasks();
  }));

  it('should auto-stop recording when countdown reaches 0', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY);
    tick(WARNING_COUNTDOWN * 1000);

    expect(service.isRecording).toBe(false);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(false);
  }));

  it('should cancel warning on extendRecording()', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);

    service.extendRecording();
    expect(warningState!.active).toBe(false);
    expect(service.isRecording).toBe(true);

    // Full cycle restarts
    tick(INACTIVITY_DELAY);
    expect(warningState!.active).toBe(true);

    discardPeriodicTasks();
  }));

  it('should cancel warning on manual stopRecording()', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY);

    service.stopRecording(true);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(false);
    expect(service.isRecording).toBe(false);
  }));

  // ---------------------------------------------------------------------------
  // External state (BroadcastChannel)
  // ---------------------------------------------------------------------------

  it('should update state from external broadcast', () => {
    recordingStateSubject.next({ isRecording: true, isManualOverride: false });
    expect(service.isRecording).toBe(true);
  });

  it('should cancel warning when external state stops recording', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY);

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);

    // External stop
    recordingStateSubject.next({ isRecording: false, isManualOverride: false });
    expect(warningState!.active).toBe(false);
    expect(service.isRecording).toBe(false);
  }));

  // ---------------------------------------------------------------------------
  // External state (Socket.IO)
  // ---------------------------------------------------------------------------

  it('should listen for socket recording-state events', () => {
    expect(mockSocketService.on).toHaveBeenCalledWith('recording-state', jasmine.any(Function));
  });

  it('should update state from socket event', () => {
    // Récupérer le callback enregistré sur le socket
    const socketCallback = mockSocketService.on.calls.allArgs()
      .find(args => args[0] === 'recording-state');

    if (socketCallback) {
      socketCallback[1]({ isRecording: true, isManualOverride: true });
      expect(service.isRecording).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // ngOnDestroy cleanup
  // ---------------------------------------------------------------------------

  it('should clean up all timers on destroy', fakeAsync(() => {
    service.onPhaseChange('during');
    tick(INACTIVITY_DELAY); // Warning active

    let warningState: RecordingWarningState | undefined;
    service.warning$.subscribe(w => warningState = w);
    expect(warningState!.active).toBe(true);

    service.ngOnDestroy();

    // After destroy, no more ticks should cause issues
    // (discardPeriodicTasks not needed since ngOnDestroy clears intervals)
  }));
});
