import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';

describe('SocketService', () => {
  let service: SocketService;
  let mockSocket: { on: jasmine.Spy; emit: jasmine.Spy };
  let ioSpy: jasmine.Spy;

  beforeEach(() => {
    mockSocket = {
      on: jasmine.createSpy('socket.on'),
      emit: jasmine.createSpy('socket.emit'),
    };

    // Mock la fonction globale io()
    ioSpy = jasmine.createSpy('io').and.returnValue(mockSocket);
    (window as unknown as Record<string, unknown>)['io'] = ioSpy;

    TestBed.configureTestingModule({});
    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['io'];
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // initialize
  // ---------------------------------------------------------------------------

  it('should call io() with the socket URL on initialize', () => {
    service.initialize();
    expect(ioSpy).toHaveBeenCalled();
  });

  it('should handle ReferenceError gracefully if io is not defined', () => {
    delete (window as unknown as Record<string, unknown>)['io'];
    // Remplacer le spy par une function qui throw
    (window as unknown as Record<string, unknown>)['io'] = undefined;

    // Pas d'erreur throw\u00e9e
    expect(() => service.initialize()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // on
  // ---------------------------------------------------------------------------

  it('should register event listener after initialize', () => {
    service.initialize();
    const callback = jasmine.createSpy('callback');
    service.on('test-event', callback);
    expect(mockSocket.on).toHaveBeenCalledWith('test-event', callback);
  });

  it('should NOT register event listener before initialize', () => {
    const callback = jasmine.createSpy('callback');
    // Le service n'a pas \u00e9t\u00e9 initialis\u00e9, socket est undefined
    service.on('test-event', callback);
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // emit
  // ---------------------------------------------------------------------------

  it('should emit event after initialize', () => {
    service.initialize();
    const data = { type: 'test' };
    service.emit('test-event', data as any);
    expect(mockSocket.emit).toHaveBeenCalledWith('test-event', data);
  });

  it('should NOT emit event before initialize', () => {
    const data = { type: 'test' };
    service.emit('test-event', data as any);
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
