import { TestBed } from '@angular/core/testing';
import { SocketService, SocketEvent } from './socket.service';

// Mock socket.io-client
const mockSocket = {
  on: jasmine.createSpy('on'),
  off: jasmine.createSpy('off'),
  emit: jasmine.createSpy('emit'),
  disconnect: jasmine.createSpy('disconnect')
};

// Store event handlers for testing
const eventHandlers: Map<string, Function> = new Map();

// Mock io function
const mockIo = jasmine.createSpy('io').and.callFake(() => {
  // Reset event handlers
  eventHandlers.clear();

  // Mock the on method to store handlers
  mockSocket.on.and.callFake((event: string, handler: Function) => {
    eventHandlers.set(event, handler);
  });

  return mockSocket;
});

// Replace the io import
jest.mock('socket.io-client', () => ({
  io: mockIo
}));

describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    // Reset mocks
    mockSocket.on.calls.reset();
    mockSocket.off.calls.reset();
    mockSocket.emit.calls.reset();
    mockSocket.disconnect.calls.reset();
    mockIo.calls.reset();
    eventHandlers.clear();

    TestBed.configureTestingModule({
      providers: [SocketService]
    });
    service = TestBed.inject(SocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should not be connected initially', () => {
      expect(service.isConnected()).toBeFalse();
    });

    it('should have an events$ observable', () => {
      expect(service.events$).toBeTruthy();
      expect(typeof service.events$.subscribe).toBe('function');
    });
  });

  describe('connect', () => {
    it('should not create multiple socket connections', () => {
      // Simulate first connection
      (service as any).socket = mockSocket;

      service.connect('test-token');

      // Should not create a new connection if one exists
      expect(mockIo).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect the socket if connected', () => {
      (service as any).socket = mockSocket;
      (service as any).connected = true;

      service.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect((service as any).socket).toBeNull();
      expect(service.isConnected()).toBeFalse();
    });

    it('should do nothing if not connected', () => {
      service.disconnect();
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', () => {
      (service as any).connected = true;
      expect(service.isConnected()).toBeTrue();
    });

    it('should return false when disconnected', () => {
      (service as any).connected = false;
      expect(service.isConnected()).toBeFalse();
    });
  });

  describe('emit', () => {
    it('should emit event when connected', () => {
      (service as any).socket = mockSocket;
      (service as any).connected = true;

      const testData = { foo: 'bar' };
      service.emit('test_event', testData);

      expect(mockSocket.emit).toHaveBeenCalledWith('test_event', testData);
    });

    it('should not emit when not connected', () => {
      (service as any).socket = null;
      (service as any).connected = false;

      spyOn(console, 'warn');
      service.emit('test_event', { foo: 'bar' });

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Cannot emit: socket not connected');
    });

    it('should not emit when socket exists but not connected', () => {
      (service as any).socket = mockSocket;
      (service as any).connected = false;

      spyOn(console, 'warn');
      service.emit('test_event', { foo: 'bar' });

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('on', () => {
    it('should return error observable when socket not connected', (done) => {
      (service as any).socket = null;

      service.on('test_event').subscribe({
        error: (err) => {
          expect(err).toBe('Socket not connected');
          done();
        }
      });
    });

    it('should register event handler when socket is connected', () => {
      (service as any).socket = mockSocket;

      service.on('custom_event').subscribe();

      expect(mockSocket.on).toHaveBeenCalledWith('custom_event', jasmine.any(Function));
    });

    it('should unregister event handler on unsubscribe', () => {
      (service as any).socket = mockSocket;

      const subscription = service.on('custom_event').subscribe();
      subscription.unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('custom_event');
    });
  });

  describe('events$', () => {
    it('should emit events when subscribed', (done) => {
      const events: SocketEvent[] = [];

      service.events$.subscribe((event) => {
        events.push(event);
        if (events.length === 1) {
          expect(events[0].type).toBe('test');
          expect(events[0].data).toEqual({ value: 123 });
          done();
        }
      });

      // Manually trigger event emission
      (service as any).eventsSubject.next({ type: 'test', data: { value: 123 } });
    });
  });
});
