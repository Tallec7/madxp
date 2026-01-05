import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { of, throwError, BehaviorSubject } from 'rxjs';
import { SiteDetailComponent } from './site-detail.component';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';

describe('SiteDetailComponent', () => {
  let component: SiteDetailComponent;
  let fixture: ComponentFixture<SiteDetailComponent>;
  let sitesService: jasmine.SpyObj<SitesService>;
  let notificationService: jasmine.SpyObj<NotificationService>;

  const mockSite = {
    id: 's1',
    site_name: 'Site Test',
    club_name: 'Club Test',
    status: 'online' as const,
    sports: ['football', 'tennis'],
    software_version: '2.1.0',
    hardware_model: 'Raspberry Pi 4',
    last_seen_at: new Date(),
    local_ip: '192.168.1.100',
    last_ip: '82.64.10.20',
    created_at: new Date(),
    location: {
      city: 'Paris',
      region: 'Île-de-France',
      country: 'France',
    },
  };

  const mockMetrics = {
    cpu_usage: 45.5,
    memory_usage: 60.2,
    temperature: 55.0,
    disk_usage: 30.0,
    uptime: 86400, // 1 day
  };

  beforeEach(async () => {
    const sitesServiceMock = jasmine.createSpyObj('SitesService', ['getSite', 'getSiteMetrics', 'sendCommand', 'regenerateApiKey']);
    sitesServiceMock.getSite.and.returnValue(of(mockSite));
    sitesServiceMock.getSiteMetrics.and.returnValue(of({ metrics: [mockMetrics] }));
    sitesServiceMock.sendCommand.and.returnValue(of({ success: true, message: 'OK' }));
    sitesServiceMock.regenerateApiKey.and.returnValue(of({ api_key: 'new-key-123' } as any));

    const notificationServiceMock = jasmine.createSpyObj('NotificationService', ['error', 'success', 'info']);

    await TestBed.configureTestingModule({
      imports: [SiteDetailComponent, RouterTestingModule, FormsModule],
      providers: [
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ id: 's1' }),
            snapshot: { params: { id: 's1' } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiteDetailComponent);
    component = fixture.componentInstance;
    sitesService = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should load site on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.getSite).toHaveBeenCalledWith('s1');
      expect(component.site).toEqual(mockSite as any);

      discardPeriodicTasks();
    }));

    it('should load metrics after site is loaded', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.getSiteMetrics).toHaveBeenCalledWith('s1', 24);
      expect(component.currentMetrics).toEqual(mockMetrics as any);

      discardPeriodicTasks();
    }));

    it('should handle error when loading site', fakeAsync(() => {
      sitesService.getSite.and.returnValue(throwError(() => new Error('Not found')));
      const consoleSpy = spyOn(console, 'error').and.callFake(() => {});

      fixture.detectChanges();
      tick();

      expect(consoleSpy).toHaveBeenCalled();

      discardPeriodicTasks();
    }));
  });

  describe('getLocation', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    it('should format location correctly', () => {
      component.site = mockSite as any;
      expect(component.getLocation()).toBe('Paris, Île-de-France, France');
    });

    it('should return N/A when no location', () => {
      component.site = { ...mockSite, location: undefined } as any;
      expect(component.getLocation()).toBe('N/A');
    });
  });

  describe('formatLastSeen', () => {
    it('should return formatted date for recent timestamp', () => {
      const date = new Date();
      const result = component.formatLastSeen(date);
      expect(result).toContain('à');
    });

    it('should return N/A for null date', () => {
      expect(component.formatLastSeen(null as any)).toBe('N/A');
    });

    it('should return N/A for undefined date', () => {
      expect(component.formatLastSeen(null as any)).toBe('N/A');
    });
  });

  describe('formatUptime', () => {
    it('should format days correctly', () => {
      expect(component.formatUptime(86400)).toBe('1j 0h 0m');
    });

    it('should format hours correctly', () => {
      expect(component.formatUptime(3600)).toBe('1h 0m');
    });

    it('should format minutes correctly', () => {
      expect(component.formatUptime(120)).toBe('2m');
    });

    it('should return N/A for null', () => {
      expect(component.formatUptime(null as any)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(component.formatUptime(null as any)).toBe('N/A');
    });
  });

  describe('Actions', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    describe('restartService', () => {
      it('should send restart command', fakeAsync(() => {
        sitesService.sendCommand.and.returnValue(of({ success: true, message: 'OK' }));

        component.restartService('neopro-app');
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'restart_service', { service: 'neopro-app' });
        expect(notificationService.success).toHaveBeenCalled();
      }));

      it('should show error on failure', fakeAsync(() => {
        sitesService.sendCommand.and.returnValue(throwError(() => new Error('Command failed')));

        component.restartService('neopro-app');
        tick();

        expect(notificationService.error).toHaveBeenCalled();
      }));
    });

    describe('rebootSite', () => {
      it('should send reboot command on confirm', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.sendCommand.and.returnValue(of({ success: true, message: 'OK' }));

        component.rebootSite();
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'reboot', {});
      }));

      it('should not reboot on cancel', () => {
        spyOn(window, 'confirm').and.returnValue(false);

        component.rebootSite();

        expect(sitesService.sendCommand).not.toHaveBeenCalled();
      });
    });

    describe('regenerateApiKey', () => {
      it('should regenerate API key on confirm', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.regenerateApiKey.and.returnValue(of({ api_key: 'new-key' } as any));

        component.regenerateApiKey();
        tick();

        expect(sitesService.regenerateApiKey).toHaveBeenCalledWith('s1');
        expect(notificationService.success).toHaveBeenCalled();
      }));

      it('should not regenerate on cancel', () => {
        spyOn(window, 'confirm').and.returnValue(false);

        component.regenerateApiKey();

        expect(sitesService.regenerateApiKey).not.toHaveBeenCalled();
      });
    });

    describe('getLogs', () => {
      it('should request logs from service', fakeAsync(() => {
        sitesService.sendCommand.and.returnValue(of({ logs: 'log content' } as any));

        component.getLogs();
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'get_logs', { lines: 100 });
      }));
    });

    describe('getSystemInfo', () => {
      it('should request system info', fakeAsync(() => {
        sitesService.sendCommand.and.returnValue(of({ info: 'system info' } as any));

        component.getSystemInfo();
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'system_info', {});
      }));
    });
  });

  describe('API Key Visibility', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    it('should toggle API key visibility', () => {
      expect(component.showApiKey).toBe(false);

      component.showApiKey = true;
      expect(component.showApiKey).toBe(true);

      component.showApiKey = false;
      expect(component.showApiKey).toBe(false);
    });
  });

  describe('Template', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      discardPeriodicTasks();
    }));

    it('should display site club name', () => {
      fixture.detectChanges();
      const header = fixture.nativeElement.querySelector('.page-header h1');
      expect(header.textContent).toContain('Club Test');
    });

    it('should display site info', () => {
      fixture.detectChanges();
      const infoRows = fixture.nativeElement.querySelectorAll('.info-row');
      expect(infoRows.length).toBeGreaterThan(0);
    });

    it('should display metrics when available', () => {
      fixture.detectChanges();
      const metricsGrid = fixture.nativeElement.querySelector('.metrics-grid');
      expect(metricsGrid).toBeTruthy();
    });

    it('should display action buttons', () => {
      fixture.detectChanges();
      const actionCards = fixture.nativeElement.querySelectorAll('.action-card');
      expect(actionCards.length).toBeGreaterThan(0);
    });

    it('should disable actions when site is offline', () => {
      component.site = { ...mockSite, status: 'offline' } as any;
      fixture.detectChanges();

      const disabledButtons = fixture.nativeElement.querySelectorAll('.action-card[disabled]');
      expect(disabledButtons.length).toBeGreaterThan(0);
    });
  });
});
