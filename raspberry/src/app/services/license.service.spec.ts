import { TestBed } from '@angular/core/testing';
import { LicenseService, LicenseState } from './license.service';
import { SocketService } from './socket.service';
import { NgZone } from '@angular/core';

describe('LicenseService', () => {
  let service: LicenseService;
  let mockSocketService: { on: jasmine.Spy; emit: jasmine.Spy; initialize: jasmine.Spy };
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    mockSocketService = {
      on: jasmine.createSpy('on'),
      emit: jasmine.createSpy('emit'),
      initialize: jasmine.createSpy('initialize'),
    };

    // Mock fetch pour loadInitialState
    fetchSpy = spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify({ status: 'VALID', reason: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: SocketService, useValue: mockSocketService },
      ],
    });

    service = TestBed.inject(LicenseService);
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

  it('should start with VALID license state', () => {
    const state = service.getCurrentState();
    expect(state.status).toBe('VALID');
    expect(state.reason).toBeNull();
  });

  it('should listen on license_update and license_blocked socket events', () => {
    const eventNames = mockSocketService.on.calls.allArgs().map((args: unknown[]) => args[0]);
    expect(eventNames).toContain('license_update');
    expect(eventNames).toContain('license_blocked');
  });

  // ---------------------------------------------------------------------------
  // updateFromServer
  // ---------------------------------------------------------------------------

  it('should update state from server data', () => {
    service.updateFromServer({
      status: 'WARNING',
      reason: 'expiring_soon',
      days_left: 5,
      message_tv: 'Bient\u00f4t expir\u00e9',
      message_remote: 'Contactez admin',
    });

    expect(service.getCurrentState().status).toBe('WARNING');
    expect(service.getCurrentState().reason).toBe('expiring_soon');
    expect(service.getDaysLeft()).toBe(5);
    expect(service.getTvMessage()).toBe('Bient\u00f4t expir\u00e9');
    expect(service.getRemoteMessage()).toBe('Contactez admin');
  });

  it('should ignore null or missing status', () => {
    service.updateFromServer(null);
    expect(service.getCurrentState().status).toBe('VALID');

    service.updateFromServer({});
    expect(service.getCurrentState().status).toBe('VALID');
  });

  // ---------------------------------------------------------------------------
  // isBlocked / hasWarning / isValid
  // ---------------------------------------------------------------------------

  it('should detect BLOCKED status', () => {
    service.updateFromServer({ status: 'BLOCKED', reason: 'unpaid' });
    expect(service.isBlocked()).toBe(true);
    expect(service.isValid()).toBe(false);
    expect(service.hasWarning()).toBe(false);
  });

  it('should detect WARNING status', () => {
    service.updateFromServer({ status: 'WARNING', reason: 'expiring_soon' });
    expect(service.hasWarning()).toBe(true);
    expect(service.isBlocked()).toBe(false);
  });

  it('should detect GRACE_PERIOD as warning', () => {
    service.updateFromServer({ status: 'GRACE_PERIOD', reason: 'connection_grace' });
    expect(service.hasWarning()).toBe(true);
  });

  it('should detect CONNECTION_WARNING as warning', () => {
    service.updateFromServer({ status: 'CONNECTION_WARNING', reason: 'connection' });
    expect(service.hasWarning()).toBe(true);
  });

  it('should detect VALID status', () => {
    expect(service.isValid()).toBe(true);
    expect(service.isBlocked()).toBe(false);
    expect(service.hasWarning()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getStatusClass
  // ---------------------------------------------------------------------------

  it('should return correct CSS class for each status', () => {
    expect(service.getStatusClass()).toBe('license-valid');

    service.updateFromServer({ status: 'WARNING', reason: null });
    expect(service.getStatusClass()).toBe('license-warning');

    service.updateFromServer({ status: 'GRACE_PERIOD', reason: null });
    expect(service.getStatusClass()).toBe('license-grace');

    service.updateFromServer({ status: 'CONNECTION_WARNING', reason: null });
    expect(service.getStatusClass()).toBe('license-connection-warning');

    service.updateFromServer({ status: 'BLOCKED', reason: null });
    expect(service.getStatusClass()).toBe('license-blocked');
  });

  // ---------------------------------------------------------------------------
  // getReasonLabel
  // ---------------------------------------------------------------------------

  it('should return human-readable reason labels', () => {
    service.updateFromServer({ status: 'BLOCKED', reason: 'unpaid' });
    expect(service.getReasonLabel()).toBe('Facture impay\u00e9e');

    service.updateFromServer({ status: 'BLOCKED', reason: 'expired' });
    expect(service.getReasonLabel()).toBe('Abonnement expir\u00e9');

    service.updateFromServer({ status: 'WARNING', reason: 'expiring_soon' });
    expect(service.getReasonLabel()).toBe('Expiration imminente');
  });

  it('should return empty string for null reason', () => {
    expect(service.getReasonLabel()).toBe('');
  });

  // ---------------------------------------------------------------------------
  // getDaysLeft / getDaysExpired
  // ---------------------------------------------------------------------------

  it('should return daysLeft', () => {
    service.updateFromServer({ status: 'WARNING', reason: 'expiring_soon', days_left: 3 });
    expect(service.getDaysLeft()).toBe(3);
  });

  it('should return null when daysLeft not set', () => {
    expect(service.getDaysLeft()).toBeNull();
  });

  it('should return daysExpired', () => {
    service.updateFromServer({ status: 'GRACE_PERIOD', reason: 'expired', days_expired: 7 });
    expect(service.getDaysExpired()).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // canAutoUnblock
  // ---------------------------------------------------------------------------

  it('should return canAutoUnblock from state', () => {
    service.updateFromServer({ status: 'BLOCKED', reason: 'connection', can_auto_unblock: true });
    expect(service.canAutoUnblock()).toBe(true);
  });

  it('should default canAutoUnblock to false', () => {
    expect(service.canAutoUnblock()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Default messages
  // ---------------------------------------------------------------------------

  it('should return default TV message when not set', () => {
    expect(service.getTvMessage()).toBe('Service temporairement indisponible');
  });

  it('should return default remote message when not set', () => {
    expect(service.getRemoteMessage()).toBe('Veuillez contacter votre administrateur.');
  });

  // ---------------------------------------------------------------------------
  // state$ observable
  // ---------------------------------------------------------------------------

  it('should emit state changes', (done) => {
    const states: LicenseState[] = [];

    service.state$.subscribe(state => {
      states.push(state);
      if (states.length === 2) {
        expect(states[1].status).toBe('BLOCKED');
        done();
      }
    });

    service.updateFromServer({ status: 'BLOCKED', reason: 'unpaid' });
  });

  // ---------------------------------------------------------------------------
  // Socket event integration
  // ---------------------------------------------------------------------------

  it('should update state when receiving license_update via socket', () => {
    const licenseUpdateCallback = mockSocketService.on.calls.allArgs()
      .find((args: unknown[]) => args[0] === 'license_update');

    if (licenseUpdateCallback) {
      licenseUpdateCallback[1]({ status: 'WARNING', reason: 'expiring_soon', days_left: 10 });
      expect(service.getCurrentState().status).toBe('WARNING');
    }
  });
});
