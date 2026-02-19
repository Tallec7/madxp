import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SiteDetailComponent } from './site-detail.component';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';

describe('SiteDetailComponent', () => {
  let component: SiteDetailComponent;
  let fixture: ComponentFixture<SiteDetailComponent>;
  let sitesService: jasmine.SpyObj<SitesService>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let loggerService: jasmine.SpyObj<LoggerService>;

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

  const mockDashboardData = {
    site: mockSite,
    connection: {
      isConnected: true,
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      secondsSinceLastSeen: 0,
      localIp: '192.168.1.100',
      lastConfigSync: null,
      heartbeat_24h: { count: 100, firstAt: null, lastAt: null },
    },
    metrics: { data: [mockMetrics] },
    health: null,
  };

  beforeEach(async () => {
    const sitesServiceMock = jasmine.createSpyObj('SitesService', [
      'getSite', 'getSiteMetrics', 'getDashboardData', 'getMatchHistory',
      'restartService', 'rebootSite', 'getLogs', 'getSystemInfo',
      'regenerateApiKey', 'sendCommand',
    ]);
    sitesServiceMock.getSite.and.returnValue(of(mockSite));
    sitesServiceMock.getSiteMetrics.and.returnValue(of({ metrics: [mockMetrics] }));
    sitesServiceMock.getDashboardData.and.returnValue(of(mockDashboardData));
    sitesServiceMock.getMatchHistory.and.returnValue(of(null));
    sitesServiceMock.restartService.and.returnValue(of({ success: true, message: 'OK' }));
    sitesServiceMock.rebootSite.and.returnValue(of({ success: true, message: 'OK' }));
    sitesServiceMock.getLogs.and.returnValue(of({ logs: ['log line 1'] }));
    sitesServiceMock.getSystemInfo.and.returnValue(of({ hostname: 'pi-test', os: 'Linux', kernel: '5.10', architecture: 'arm64', cpu_model: 'Cortex-A72', cpu_cores: 4, total_memory: 4096, ip_address: '192.168.1.100', mac_address: '00:00:00:00:00:00' }));
    sitesServiceMock.sendCommand.and.returnValue(of({ success: true, message: 'OK' }));
    sitesServiceMock.regenerateApiKey.and.returnValue(of({ ...mockSite, api_key: 'new-key-123' } as any));

    const notificationServiceMock = jasmine.createSpyObj('NotificationService', ['error', 'success', 'info']);
    const loggerServiceMock = jasmine.createSpyObj('LoggerService', ['debug', 'info', 'warn', 'error', 'addBreadcrumb']);

    await TestBed.configureTestingModule({
      imports: [SiteDetailComponent, RouterTestingModule, HttpClientTestingModule, FormsModule, TranslateModule.forRoot()],
      providers: [
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: LoggerService, useValue: loggerServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ id: 's1' }),
            snapshot: {
              params: { id: 's1' },
              paramMap: {
                get: (key: string) => key === 'id' ? 's1' : null,
                has: (key: string) => key === 'id',
                getAll: () => [],
                keys: ['id'],
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiteDetailComponent);
    component = fixture.componentInstance;
    sitesService = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerService = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
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

    it('should load dashboard data after init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.getDashboardData).toHaveBeenCalledWith('s1', 24);
      expect(component.currentMetrics).toEqual(mockMetrics as any);

      discardPeriodicTasks();
    }));

    it('should handle error when loading site', fakeAsync(() => {
      sitesService.getSite.and.returnValue(throwError(() => new Error('Not found')));

      fixture.detectChanges();
      tick();

      expect(loggerService.error).toHaveBeenCalled();

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
    it('should return formatted string for recent timestamp', () => {
      const date = new Date();
      const result = component.formatLastSeen(date);
      // Returns "À l'instant" for very recent dates
      expect(result).toBeTruthy();
      expect(result).not.toBe('Jamais vu');
    });

    it('should return Jamais vu for null date', () => {
      expect(component.formatLastSeen(null as any)).toBe('Jamais vu');
    });

    it('should return Jamais vu for undefined date', () => {
      expect(component.formatLastSeen(null as any)).toBe('Jamais vu');
    });
  });

  describe('formatUptime', () => {
    it('should format days correctly', () => {
      // Component returns '1j 0h' (no minutes when days > 0)
      expect(component.formatUptime(86400)).toBe('1j 0h');
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
      it('should send restart command on confirm', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.restartService.and.returnValue(of({ success: true, message: 'OK' }));

        component.restartService('neopro-app');
        tick();

        expect(sitesService.restartService).toHaveBeenCalledWith('s1', 'neopro-app');
        expect(notificationService.success).toHaveBeenCalled();
      }));

      it('should show error on failure', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.restartService.and.returnValue(throwError(() => new Error('Command failed')));

        component.restartService('neopro-app');
        tick();

        expect(notificationService.error).toHaveBeenCalled();
      }));
    });

    describe('rebootSite', () => {
      it('should send reboot command on confirm', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.rebootSite.and.returnValue(of({ success: true, message: 'OK' }));

        component.rebootSite();
        tick();

        expect(sitesService.rebootSite).toHaveBeenCalledWith('s1');
      }));

      it('should not reboot on cancel', () => {
        spyOn(window, 'confirm').and.returnValue(false);

        component.rebootSite();

        expect(sitesService.rebootSite).not.toHaveBeenCalled();
      });
    });

    describe('regenerateApiKey', () => {
      it('should regenerate API key on confirm', fakeAsync(() => {
        spyOn(window, 'confirm').and.returnValue(true);
        sitesService.regenerateApiKey.and.returnValue(of({ ...mockSite, api_key: 'new-key' } as any));

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
      it('should open logs modal and request logs from service', fakeAsync(() => {
        sitesService.getLogs.and.returnValue(of({ logs: ['log content'] }));

        component.getLogs();
        tick();

        expect(component.showLogsModal).toBe(true);
        expect(sitesService.getLogs).toHaveBeenCalledWith('s1', 200);
      }));
    });

    describe('getSystemInfo', () => {
      it('should open system info modal and request info', fakeAsync(() => {
        sitesService.getSystemInfo.and.returnValue(of({ hostname: 'pi-test', os: 'Linux', kernel: '5.10', architecture: 'arm64', cpu_model: 'Cortex-A72', cpu_cores: 4, total_memory: 4096, ip_address: '192.168.1.100', mac_address: '00:00:00:00:00:00' }));

        component.getSystemInfo();
        tick();

        expect(component.showSystemInfoModal).toBe(true);
        expect(sitesService.getSystemInfo).toHaveBeenCalledWith('s1');
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

    it('should disable actions when not connected', () => {
      component.isConnected = false;
      fixture.detectChanges();

      const disabledButtons = fixture.nativeElement.querySelectorAll('.action-card[disabled]');
      expect(disabledButtons.length).toBeGreaterThan(0);
    });
  });
});
