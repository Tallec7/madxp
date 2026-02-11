import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RecordingStateService } from './recording-state.service';
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
  // \u00c9tat initial
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
    // Ne devrait pas re-broadcast
    expect(mockLocalBroadcast.emitRecordingState).not.toHaveBeenCalled();
  });

  it('should start auto-stop timer on return to neutral', fakeAsync(() => {
    service.onPhaseChange('during');
    expect(service.isRecording).toBe(true);

    service.onPhaseChange('neutral');
    // Encore en enregistrement (le timer n\'a pas expir\u00e9)
    expect(service.isRecording).toBe(true);

    // Avancer de 15 minutes
    tick(15 * 60 * 1000);
    expect(service.isRecording).toBe(false);
  }));

  it('should NOT auto-stop if manual override is active', fakeAsync(() => {
    service.startRecording(true); // manual = true
    service.onPhaseChange('neutral');

    tick(15 * 60 * 1000);
    // Toujours en enregistrement car manual override
    expect(service.isRecording).toBe(true);
  }));

  it('should cancel auto-stop timer on new phase change', fakeAsync(() => {
    service.onPhaseChange('during');
    service.onPhaseChange('neutral');
    // Timer d\u00e9marr\u00e9

    // Retour en phase match avant expiration
    tick(5 * 60 * 1000);
    service.onPhaseChange('during');

    // M\u00eame apr\u00e8s 15 minutes, toujours en enregistrement
    tick(15 * 60 * 1000);
    expect(service.isRecording).toBe(true);
  }));

  // ---------------------------------------------------------------------------
  // External state (BroadcastChannel)
  // ---------------------------------------------------------------------------

  it('should update state from external broadcast', () => {
    recordingStateSubject.next({ isRecording: true, isManualOverride: false });
    expect(service.isRecording).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // External state (Socket.IO)
  // ---------------------------------------------------------------------------

  it('should listen for socket recording-state events', () => {
    expect(mockSocketService.on).toHaveBeenCalledWith('recording-state', jasmine.any(Function));
  });

  it('should update state from socket event', () => {
    // R\u00e9cup\u00e9rer le callback enregistr\u00e9 sur le socket
    const socketCallback = mockSocketService.on.calls.allArgs()
      .find(args => args[0] === 'recording-state');

    if (socketCallback) {
      socketCallback[1]({ isRecording: true, isManualOverride: true });
      expect(service.isRecording).toBe(true);
    }
  });
});
