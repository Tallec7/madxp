import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HdmiStatusService, HdmiCecStatus } from './hdmi-status.service';

describe('HdmiStatusService', () => {
  let service: HdmiStatusService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(HdmiStatusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Flush toutes les requêtes en attente (le polling initial + éventuels intervalles)
    httpMock.match(() => true);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // État initial
  // ---------------------------------------------------------------------------

  it('should have null initial status', () => {
    expect(service.getCurrentStatus()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // isTvOn — logique de décision
  // ---------------------------------------------------------------------------

  it('should return true when no status yet (first load)', () => {
    expect(service.isTvOn()).toBe(true);
  });

  it('should return true when CEC not available', () => {
    service['statusSubject'].next({
      tv_power: null,
      tv_connected: false,
      devices_found: 0,
      cec_available: false,
      last_check_at: null,
      error: null,
    });
    expect(service.isTvOn()).toBe(true);
  });

  it('should return true when TV is on', () => {
    service['statusSubject'].next({
      tv_power: 'on',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.isTvOn()).toBe(true);
  });

  it('should return true when TV is transitioning', () => {
    service['statusSubject'].next({
      tv_power: 'transitioning',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.isTvOn()).toBe(true);
  });

  it('should return false when TV is in standby', () => {
    service['statusSubject'].next({
      tv_power: 'standby',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.isTvOn()).toBe(false);
  });

  it('should return false when TV is disconnected with CEC available', () => {
    service['statusSubject'].next({
      tv_power: null,
      tv_connected: false,
      devices_found: 0,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.isTvOn()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getTvStatusForAnalytics
  // ---------------------------------------------------------------------------

  it('should return unknown when no status or CEC not available', () => {
    expect(service.getTvStatusForAnalytics()).toBe('unknown');

    service['statusSubject'].next({
      tv_power: 'on',
      tv_connected: true,
      devices_found: 1,
      cec_available: false,
      last_check_at: null,
      error: null,
    });
    expect(service.getTvStatusForAnalytics()).toBe('unknown');
  });

  it('should return on when TV is on', () => {
    service['statusSubject'].next({
      tv_power: 'on',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.getTvStatusForAnalytics()).toBe('on');
  });

  it('should return standby when TV is in standby', () => {
    service['statusSubject'].next({
      tv_power: 'standby',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.getTvStatusForAnalytics()).toBe('standby');
  });

  it('should return disconnected when TV is not connected', () => {
    service['statusSubject'].next({
      tv_power: null,
      tv_connected: false,
      devices_found: 0,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    });
    expect(service.getTvStatusForAnalytics()).toBe('disconnected');
  });

  // ---------------------------------------------------------------------------
  // checkStatus — HTTP call
  // ---------------------------------------------------------------------------

  it('should update status from API response', () => {
    const status: HdmiCecStatus = {
      tv_power: 'on',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    };

    service.checkStatus().subscribe(result => {
      expect(result).toEqual(status);
    });

    // Le polling du constructeur + checkStatus() peuvent créer plusieurs requêtes.
    // On flush toutes celles qui matchent.
    const reqs = httpMock.match(req => req.url.includes('/api/hdmi-status'));
    reqs.forEach(req => req.flush(status));

    expect(service.getCurrentStatus()).toEqual(status);
  });

  it('should set fallback status on API error', () => {
    service.checkStatus().subscribe(result => {
      expect(result).not.toBeNull();
      expect(result!.cec_available).toBe(false);
    });

    // Flush toutes les requêtes hdmi-status avec une erreur
    const reqs = httpMock.match(req => req.url.includes('/api/hdmi-status'));
    reqs.forEach(req => req.error(new ProgressEvent('error')));

    const status = service.getCurrentStatus();
    expect(status).not.toBeNull();
    expect(status!.cec_available).toBe(false);
    expect(status!.tv_connected).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // status$ observable
  // ---------------------------------------------------------------------------

  it('should emit status changes via observable', (done) => {
    const statuses: (HdmiCecStatus | null)[] = [];

    service.status$.subscribe(status => {
      statuses.push(status);
      if (statuses.length === 2 && statuses[1] !== null) {
        expect(statuses[1]!.tv_power).toBe('on');
        done();
      }
    });

    const status: HdmiCecStatus = {
      tv_power: 'on',
      tv_connected: true,
      devices_found: 1,
      cec_available: true,
      last_check_at: new Date().toISOString(),
      error: null,
    };
    service['statusSubject'].next(status);
  });
});
