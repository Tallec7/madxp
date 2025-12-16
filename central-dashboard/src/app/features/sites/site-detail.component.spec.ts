import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { of, throwError, BehaviorSubject } from 'rxjs';
import { SiteDetailComponent } from './site-detail.component';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';

// Mock child components
jest.mock('./config-editor/config-editor.component', () => ({
  ConfigEditorComponent: { selector: 'app-config-editor' }
}));
jest.mock('./site-content-viewer/site-content-viewer.component', () => ({
  SiteContentViewerComponent: { selector: 'app-site-content-viewer' }
}));
jest.mock('../../shared/components/connection-indicator.component', () => ({
  ConnectionIndicatorComponent: { selector: 'app-connection-indicator' }
}));

describe('SiteDetailComponent', () => {
  let component: SiteDetailComponent;
  let fixture: ComponentFixture<SiteDetailComponent>;
  let sitesService: jest.Mocked<SitesService>;
  let notificationService: jest.Mocked<NotificationService>;

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
    const sitesServiceMock = {
      getSite: jest.fn().mockReturnValue(of(mockSite)),
      getMetrics: jest.fn().mockReturnValue(of(mockMetrics)),
      sendCommand: jest.fn().mockReturnValue(of({ success: true })),
      regenerateApiKey: jest.fn().mockReturnValue(of({ api_key: 'new-key-123' })),
    };

    const notificationServiceMock = {
      error: jest.fn(),
      success: jest.fn(),
      info: jest.fn(),
    };

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
    sitesService = TestBed.inject(SitesService) as jest.Mocked<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
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
      expect(component.site).toEqual(mockSite);

      discardPeriodicTasks();
    }));

    it('should load metrics after site is loaded', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.getMetrics).toHaveBeenCalledWith('s1');
      expect(component.currentMetrics).toEqual(mockMetrics);

      discardPeriodicTasks();
    }));

    it('should handle error when loading site', fakeAsync(() => {
      sitesService.getSite.mockReturnValue(throwError(() => new Error('Not found')));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      fixture.detectChanges();
      tick();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();

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
      expect(component.formatLastSeen(null)).toBe('N/A');
    });

    it('should return N/A for undefined date', () => {
      expect(component.formatLastSeen(undefined)).toBe('N/A');
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
      expect(component.formatUptime(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(component.formatUptime(undefined)).toBe('N/A');
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
        sitesService.sendCommand.mockReturnValue(of({ success: true }));

        component.restartService('neopro-app');
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'restart_service', { service: 'neopro-app' });
        expect(notificationService.success).toHaveBeenCalled();
      }));

      it('should show error on failure', fakeAsync(() => {
        sitesService.sendCommand.mockReturnValue(throwError(() => new Error('Command failed')));

        component.restartService('neopro-app');
        tick();

        expect(notificationService.error).toHaveBeenCalled();
      }));
    });

    describe('rebootSite', () => {
      it('should send reboot command on confirm', fakeAsync(() => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        sitesService.sendCommand.mockReturnValue(of({ success: true }));

        component.rebootSite();
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'reboot', {});
      }));

      it('should not reboot on cancel', () => {
        jest.spyOn(window, 'confirm').mockReturnValue(false);

        component.rebootSite();

        expect(sitesService.sendCommand).not.toHaveBeenCalled();
      });
    });

    describe('regenerateApiKey', () => {
      it('should regenerate API key on confirm', fakeAsync(() => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        sitesService.regenerateApiKey.mockReturnValue(of({ api_key: 'new-key' }));

        component.regenerateApiKey();
        tick();

        expect(sitesService.regenerateApiKey).toHaveBeenCalledWith('s1');
        expect(notificationService.success).toHaveBeenCalled();
      }));

      it('should not regenerate on cancel', () => {
        jest.spyOn(window, 'confirm').mockReturnValue(false);

        component.regenerateApiKey();

        expect(sitesService.regenerateApiKey).not.toHaveBeenCalled();
      });
    });

    describe('getLogs', () => {
      it('should request logs from service', fakeAsync(() => {
        sitesService.sendCommand.mockReturnValue(of({ logs: 'log content' }));

        component.getLogs();
        tick();

        expect(sitesService.sendCommand).toHaveBeenCalledWith('s1', 'get_logs', { lines: 100 });
      }));
    });

    describe('getSystemInfo', () => {
      it('should request system info', fakeAsync(() => {
        sitesService.sendCommand.mockReturnValue(of({ info: 'system info' }));

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
