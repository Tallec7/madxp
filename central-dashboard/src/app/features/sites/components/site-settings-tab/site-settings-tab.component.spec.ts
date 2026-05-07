/**
 * SiteSettingsTabComponent — Phase 8 receiver load spec
 *
 * Regression guard for: getConnectedReceivers called on ngOnInit (H),
 * connectedReceivers populated on success (I), stays [] on API error (J).
 *
 * Uses minimal stubs for all heavy dependencies (SiteSettingsDataService,
 * NotificationService, LoggerService, AuthService, SitesService).
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { SiteSettingsTabComponent } from './site-settings-tab.component';
import { SiteSettingsDataService } from './site-settings-data.service';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ReceiverInfo, Site } from '../../../../core/models';

// ---------------------------------------------------------------------------
// Minimal Site fixture
// ---------------------------------------------------------------------------
const STUB_SITE: Site = {
  id: 'site-1',
  name: 'Test Club',
  club_name: 'Test Club',
  site_type: 'pi',
  subscription_plan: 'starter',
  displays: [{ index: 0, name: 'TV', type: 'tv', resolution: '1920x1080' }],
} as unknown as Site;

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makeDataServiceStub(): jasmine.SpyObj<SiteSettingsDataService> {
  const stub = jasmine.createSpyObj<SiteSettingsDataService>('SiteSettingsDataService', [
    'getPositionOptions',
    'getAnimationOptions',
    'getDaysOfWeekOptions',
    'loadHotspotInfo',
    'extractOverlayConfig',
    'extractWatermarkConfig',
    'loadAvailableWatermarks',
    'loadClubReports',
    'loadRemotePinStatus',
    'saveDisplays',
    'fetchHotspotConfig',
    'getWifiSsid',
    'getQrCodeDefaultMode',
    'formatFileSize',
    'createDefaultScheduleRule',
  ]);

  stub.getPositionOptions.and.returnValue([]);
  stub.getAnimationOptions.and.returnValue([]);
  stub.getDaysOfWeekOptions.and.returnValue([]);
  stub.getWifiSsid.and.returnValue({ ssid: 'NeoWifi', isReal: false });
  stub.getQrCodeDefaultMode.and.returnValue('local');
  stub.formatFileSize.and.returnValue('-');
  stub.loadHotspotInfo.and.returnValue({
    ssid: null, password: null, channel: null, clients: null, isActive: false,
  });
  stub.extractOverlayConfig.and.returnValue({ theme: 'broadcast', position: 'top-right' });
  stub.extractWatermarkConfig.and.returnValue(null);
  stub.loadAvailableWatermarks.and.returnValue(of({ success: true, watermarks: [], count: 0 }));
  stub.loadClubReports.and.returnValue(of([]));
  stub.loadRemotePinStatus.and.returnValue(of({ pinEnabled: false }));

  return stub;
}

function makeSitesServiceStub(
  receiversResponse: { receivers: ReceiverInfo[] } = { receivers: [] }
): jasmine.SpyObj<SitesService> {
  const stub = jasmine.createSpyObj<SitesService>('SitesService', [
    'getConnectedReceivers',
  ]);
  stub.getConnectedReceivers.and.returnValue(of(receiversResponse));
  return stub;
}

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe('SiteSettingsTabComponent — Phase 8 connectedReceivers load', () => {
  let component: SiteSettingsTabComponent;
  let fixture: ComponentFixture<SiteSettingsTabComponent>;

  let dataServiceStub: jasmine.SpyObj<SiteSettingsDataService>;
  let sitesServiceStub: jasmine.SpyObj<SitesService>;
  let notifyStub: jasmine.SpyObj<NotificationService>;
  let loggerStub: jasmine.SpyObj<LoggerService>;
  let authStub: jasmine.SpyObj<AuthService>;

  const mockReceivers: ReceiverInfo[] = [
    { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
  ];

  function setupTestBed(sitesService: jasmine.SpyObj<SitesService>): void {
    dataServiceStub = makeDataServiceStub();
    notifyStub = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'success', 'error', 'warning', 'info',
    ]);
    loggerStub = jasmine.createSpyObj<LoggerService>('LoggerService', [
      'info', 'warn', 'error', 'debug',
    ]);
    authStub = jasmine.createSpyObj<AuthService>('AuthService', ['getCurrentUser']);
    authStub.getCurrentUser.and.returnValue({ role: 'super_admin' } as ReturnType<AuthService['getCurrentUser']>);

    TestBed.configureTestingModule({
      imports: [SiteSettingsTabComponent, TranslateModule.forRoot(), HttpClientTestingModule],
      providers: [
        { provide: SiteSettingsDataService, useValue: dataServiceStub },
        { provide: SitesService, useValue: sitesService },
        { provide: NotificationService, useValue: notifyStub },
        { provide: LoggerService, useValue: loggerStub },
        { provide: AuthService, useValue: authStub },
      ],
    });
  }

  // Test H: getConnectedReceivers called once on ngOnInit
  describe('Test H — getConnectedReceivers called on ngOnInit', () => {
    beforeEach(fakeAsync(async () => {
      sitesServiceStub = makeSitesServiceStub({ receivers: mockReceivers });
      setupTestBed(sitesServiceStub);
      await TestBed.compileComponents();

      fixture = TestBed.createComponent(SiteSettingsTabComponent);
      component = fixture.componentInstance;
      component.siteId = 'site-1';
      component.site = STUB_SITE;
    }));

    it('H — calls getConnectedReceivers(siteId) once on ngOnInit', fakeAsync(() => {
      fixture.detectChanges(); // triggers ngOnInit
      tick();

      expect(sitesServiceStub.getConnectedReceivers).toHaveBeenCalledOnceWith('site-1');
    }));
  });

  // Test I: connectedReceivers populated on success
  describe('Test I — connectedReceivers populated on API success', () => {
    beforeEach(fakeAsync(async () => {
      sitesServiceStub = makeSitesServiceStub({ receivers: mockReceivers });
      setupTestBed(sitesServiceStub);
      await TestBed.compileComponents();

      fixture = TestBed.createComponent(SiteSettingsTabComponent);
      component = fixture.componentInstance;
      component.siteId = 'site-1';
      component.site = STUB_SITE;
    }));

    it('I — connectedReceivers is populated with API response', fakeAsync(() => {
      fixture.detectChanges(); // triggers ngOnInit
      tick();

      expect(component.connectedReceivers.length).toBe(1);
      expect(component.connectedReceivers[0].mac).toBe('AA:BB:CC:DD:EE:FF');
      expect(component.connectedReceivers[0].kind).toBe('firestick');
    }));
  });

  // Test J: connectedReceivers stays [] on API error
  describe('Test J — connectedReceivers stays [] on API error', () => {
    beforeEach(fakeAsync(async () => {
      sitesServiceStub = jasmine.createSpyObj<SitesService>('SitesService', [
        'getConnectedReceivers',
      ]);
      sitesServiceStub.getConnectedReceivers.and.returnValue(
        throwError(() => new Error('Network error'))
      );
      setupTestBed(sitesServiceStub);
      await TestBed.compileComponents();

      fixture = TestBed.createComponent(SiteSettingsTabComponent);
      component = fixture.componentInstance;
      component.siteId = 'site-1';
      component.site = STUB_SITE;
    }));

    it('J — connectedReceivers stays [] when API errors (Pi offline)', fakeAsync(() => {
      fixture.detectChanges(); // triggers ngOnInit
      tick();

      expect(component.connectedReceivers).toEqual([]);
    }));
  });
});
