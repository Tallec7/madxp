import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService, ConnectionStatus } from './connection-status.service';

describe('ConnectionStatusService', () => {
  let service: ConnectionStatusService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    // Mock fetch avant l'instanciation (le constructeur appelle checkConnections)
    fetchSpy = spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify({ centralConnected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    );

    // Empêcher le setInterval du constructeur
    spyOn(window, 'setInterval');

    TestBed.configureTestingModule({});
    service = TestBed.inject(ConnectionStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Signaux : valeurs initiales
  // ---------------------------------------------------------------------------

  it('should have initial signal values', () => {
    // Avant que le fetch ne resolve, les signaux sont \u00e0 leur valeur initiale
    expect(service.localServerConnected()).toBe(false);
    expect(service.centralConnected()).toBe(false);
    expect(service.lastSync()).toBeNull();
    expect(service.isOnline()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // setLocalServerConnected
  // ---------------------------------------------------------------------------

  it('should update localServerConnected signal', () => {
    service.setLocalServerConnected(true);
    expect(service.localServerConnected()).toBe(true);

    service.setLocalServerConnected(false);
    expect(service.localServerConnected()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // setCentralConnected
  // ---------------------------------------------------------------------------

  it('should update centralConnected signal', () => {
    service.setCentralConnected(true);
    expect(service.centralConnected()).toBe(true);
  });

  it('should record lastSync when central connects', () => {
    service.setCentralConnected(true);
    expect(service.lastSync()).toBeInstanceOf(Date);
  });

  it('should NOT update lastSync when central disconnects', () => {
    service.setCentralConnected(false);
    expect(service.lastSync()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // isOnline computed
  // ---------------------------------------------------------------------------

  it('should be online when both local and central are connected', () => {
    service.setLocalServerConnected(true);
    service.setCentralConnected(true);
    expect(service.isOnline()).toBe(true);
  });

  it('should NOT be online when only local is connected', () => {
    service.setLocalServerConnected(true);
    expect(service.isOnline()).toBe(false);
  });

  it('should NOT be online when only central is connected', () => {
    service.setCentralConnected(true);
    expect(service.isOnline()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // recordSync
  // ---------------------------------------------------------------------------

  it('should update lastSync on recordSync', () => {
    service.recordSync();
    expect(service.lastSync()).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // status computed
  // ---------------------------------------------------------------------------

  it('should return full status object', () => {
    service.setLocalServerConnected(true);
    service.setCentralConnected(true);

    const status: ConnectionStatus = service.status();
    expect(status.isOnline).toBe(true);
    expect(status.localServerConnected).toBe(true);
    expect(status.centralConnected).toBe(true);
    expect(status.lastSync).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // refresh
  // ---------------------------------------------------------------------------

  it('should call fetch on refresh and return status', async () => {
    fetchSpy.and.returnValue(
      Promise.resolve(new Response(JSON.stringify({
        centralConnected: true,
        lastSync: '2024-01-01T12:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    );

    const status = await service.refresh();
    expect(status.localServerConnected).toBe(true);
    expect(status.centralConnected).toBe(true);
  });

  it('should set localServerConnected to false on fetch error', async () => {
    fetchSpy.and.returnValue(Promise.reject(new Error('Network error')));

    await service.refresh();
    expect(service.localServerConnected()).toBe(false);
  });

  it('should set localServerConnected to false on non-ok response', async () => {
    fetchSpy.and.returnValue(
      Promise.resolve(new Response('', { status: 500 }))
    );

    await service.refresh();
    expect(service.localServerConnected()).toBe(false);
  });
});
