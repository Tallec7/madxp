/**
 * RemoteAuthSectionComponent — ADR-058 Phase 1 Karma spec
 *
 * Couvre les flows super_admin : setPin / clearPin / revokeDevice / revokeAll /
 * refreshDevices / loadProfiles, avec mocks de RemoteAuthService, SitesService
 * et NotificationService.
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { RemoteAuthSectionComponent } from './remote-auth-section.component';
import {
  RemoteAuthService,
  RemoteDevice,
} from '../../../../../core/services/remote-auth.service';
import { SitesService } from '../../../../../core/services/sites.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { ConfigProfile } from '../../../../../core/models';

describe('RemoteAuthSectionComponent', () => {
  let component: RemoteAuthSectionComponent;
  let fixture: ComponentFixture<RemoteAuthSectionComponent>;
  let remoteAuth: jasmine.SpyObj<RemoteAuthService>;
  let sites: jasmine.SpyObj<SitesService>;
  let notify: jasmine.SpyObj<NotificationService>;

  const profile: ConfigProfile = {
    id: 'profile-1',
    site_id: 'site-1',
    name: 'default',
    display_name: 'Terrain principal',
    is_default: true,
    sort_order: 0,
    remote_pin_required: false,
  } as unknown as ConfigProfile;

  const sampleDevice: RemoteDevice = {
    id: 'token-1',
    device_id: 'dev-1',
    label: 'iPhone Arbitre',
    created_at: '2026-04-18T10:00:00Z',
    last_used_at: null,
    expires_at: '2026-05-18T10:00:00Z',
  };

  beforeEach(async () => {
    remoteAuth = jasmine.createSpyObj<RemoteAuthService>('RemoteAuthService', [
      'setPin',
      'listDevices',
      'revokeDevice',
      'revokeAllDevices',
    ]);
    sites = jasmine.createSpyObj<SitesService>('SitesService', ['getProfiles']);
    notify = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'success',
      'error',
      'warning',
      'info',
    ]);

    sites.getProfiles.and.returnValue(
      of({ site_id: 'site-1', count: 1, profiles: [profile] })
    );
    remoteAuth.listDevices.and.returnValue(of({ devices: [sampleDevice] }));

    await TestBed.configureTestingModule({
      imports: [RemoteAuthSectionComponent],
      providers: [
        { provide: RemoteAuthService, useValue: remoteAuth },
        { provide: SitesService, useValue: sites },
        { provide: NotificationService, useValue: notify },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RemoteAuthSectionComponent);
    component = fixture.componentInstance;
    component.siteId = 'site-1';
  });

  describe('loadProfiles', () => {
    it('maps profiles into rows on ngOnChanges', fakeAsync(() => {
      component.ngOnChanges({
        siteId: { currentValue: 'site-1', previousValue: null, firstChange: true, isFirstChange: () => true },
      });
      tick();

      expect(sites.getProfiles).toHaveBeenCalledWith('site-1');
      expect(component.rows.length).toBe(1);
      expect(component.rows[0].profile.id).toBe('profile-1');
      expect(component.rows[0].expanded).toBeFalse();
      expect(component.loading).toBeFalse();
    }));

    it('surfaces error message on failure', fakeAsync(() => {
      sites.getProfiles.and.returnValue(throwError(() => new Error('boom')));
      component.loadProfiles();
      tick();
      expect(component.error).toBe('boom');
      expect(component.loading).toBeFalse();
    }));
  });

  describe('setPin', () => {
    beforeEach(fakeAsync(() => {
      component.loadProfiles();
      tick();
    }));

    it('warns when PIN is not 4-6 digits', fakeAsync(() => {
      component.rows[0].pinInput = 'abc';
      component.setPin(component.rows[0]);
      tick();
      expect(notify.warning).toHaveBeenCalled();
      expect(remoteAuth.setPin).not.toHaveBeenCalled();
    }));

    it('calls setPin, flips remote_pin_required, notifies success when no revoke', fakeAsync(() => {
      remoteAuth.setPin.and.returnValue(
        of({ success: true, pin_required: true, revoked_tokens: 0 })
      );
      component.rows[0].pinInput = '9876';
      component.setPin(component.rows[0]);
      tick();
      expect(remoteAuth.setPin).toHaveBeenCalledWith('site-1', 'profile-1', '9876');
      expect(component.rows[0].profile.remote_pin_required).toBeTrue();
      expect(component.rows[0].pinInput).toBe('');
      expect(notify.success).toHaveBeenCalledWith('PIN mis à jour');
    }));

    it('uses info notification when revoked_tokens > 0', fakeAsync(() => {
      remoteAuth.setPin.and.returnValue(
        of({ success: true, pin_required: true, revoked_tokens: 3 })
      );
      component.rows[0].pinInput = '9876';
      component.setPin(component.rows[0]);
      tick();
      expect(notify.info).toHaveBeenCalled();
      const msg = notify.info.calls.mostRecent().args[0] as string;
      expect(msg).toContain('3');
    }));

    it('reports error via notify on failure', fakeAsync(() => {
      remoteAuth.setPin.and.returnValue(throwError(() => new Error('500')));
      component.rows[0].pinInput = '9876';
      component.setPin(component.rows[0]);
      tick();
      expect(notify.error).toHaveBeenCalled();
      expect(component.rows[0].saving).toBeFalse();
    }));
  });

  describe('clearPin', () => {
    beforeEach(fakeAsync(() => {
      component.loadProfiles();
      tick();
    }));

    it('aborts when user cancels confirm()', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.clearPin(component.rows[0]);
      tick();
      expect(remoteAuth.setPin).not.toHaveBeenCalled();
    }));

    it('sends pin=null, flips flag off, refreshes if expanded', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.rows[0].profile.remote_pin_required = true;
      component.rows[0].expanded = true;
      remoteAuth.setPin.and.returnValue(
        of({ success: true, pin_required: false, revoked_tokens: 2 })
      );
      component.clearPin(component.rows[0]);
      tick();
      expect(remoteAuth.setPin).toHaveBeenCalledWith('site-1', 'profile-1', null);
      expect(component.rows[0].profile.remote_pin_required).toBeFalse();
      expect(remoteAuth.listDevices).toHaveBeenCalled();
      expect(notify.success).toHaveBeenCalled();
    }));
  });

  describe('revokeDevice', () => {
    beforeEach(fakeAsync(() => {
      component.loadProfiles();
      tick();
    }));

    it('aborts on cancel', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.revokeDevice(component.rows[0], sampleDevice);
      tick();
      expect(remoteAuth.revokeDevice).not.toHaveBeenCalled();
    }));

    it('revokes then refreshes devices', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      remoteAuth.revokeDevice.and.returnValue(of({ success: true }));
      component.revokeDevice(component.rows[0], sampleDevice);
      tick();
      expect(remoteAuth.revokeDevice).toHaveBeenCalledWith('site-1', 'profile-1', 'token-1');
      expect(remoteAuth.listDevices).toHaveBeenCalled();
      expect(notify.success).toHaveBeenCalledWith('Appareil révoqué');
    }));
  });

  describe('revokeAll', () => {
    beforeEach(fakeAsync(() => {
      component.loadProfiles();
      tick();
    }));

    it('aborts on cancel', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.revokeAll(component.rows[0]);
      tick();
      expect(remoteAuth.revokeAllDevices).not.toHaveBeenCalled();
    }));

    it('revokes all with reason=manual_all and reports count', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      remoteAuth.revokeAllDevices.and.returnValue(of({ success: true, revoked: 5 }));
      component.revokeAll(component.rows[0]);
      tick();
      expect(remoteAuth.revokeAllDevices).toHaveBeenCalledWith(
        'site-1',
        'profile-1',
        'manual_all'
      );
      expect(notify.success).toHaveBeenCalledWith('5 appareil(s) révoqué(s)');
    }));
  });

  describe('toggleDevices', () => {
    beforeEach(fakeAsync(() => {
      component.loadProfiles();
      tick();
    }));

    it('loads devices on first expand, skips on second expand', fakeAsync(() => {
      component.toggleDevices(component.rows[0]);
      tick();
      expect(component.rows[0].expanded).toBeTrue();
      expect(remoteAuth.listDevices).toHaveBeenCalledTimes(1);

      // Collapse
      component.toggleDevices(component.rows[0]);
      tick();
      expect(component.rows[0].expanded).toBeFalse();
      expect(remoteAuth.listDevices).toHaveBeenCalledTimes(1);
    }));
  });
});
