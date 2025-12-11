import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { SitesService } from './sites.service';
import { ApiService } from './api.service';
import { Site, SiteStats, Metrics } from '../models';

describe('SitesService', () => {
  let service: SitesService;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

  const mockSite: Site = {
    id: 'site-1',
    site_name: 'Test Site',
    club_name: 'Test Club',
    location: { city: 'Paris', country: 'France' },
    sports: ['football'],
    status: 'online',
    last_seen_at: new Date(),
    last_ip: '203.0.113.1',
    local_ip: '192.168.1.100',
    software_version: '1.0.0',
    hardware_model: 'RPi4',
    api_key: 'key-123',
    metadata: {},
    created_at: new Date(),
    updated_at: new Date()
  };

  const mockStats: SiteStats = {
    total_sites: 10,
    online: 8,
    offline: 1,
    maintenance: 1,
    error: 0
  };

  const mockSitesResponse = {
    total: 2,
    sites: [mockSite, { ...mockSite, id: 'site-2', site_name: 'Site 2' }]
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      providers: [
        SitesService,
        { provide: ApiService, useValue: apiServiceSpy }
      ]
    });

    service = TestBed.inject(SitesService);
  });

  describe('loadSites', () => {
    it('should load sites from API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockSitesResponse));

      let result: { total: number; sites: Site[] } | undefined;
      service.loadSites().subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites', undefined);
      expect(result).toEqual(mockSitesResponse);
    }));

    it('should pass filters to API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockSitesResponse));

      const filters = { status: 'online', limit: 10 };
      service.loadSites(filters).subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites', filters);
    }));

    it('should update sites$ observable', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockSitesResponse));

      let emittedSites: Site[] = [];
      service.sites$.subscribe(s => emittedSites = s);

      service.loadSites().subscribe();
      tick();

      expect(emittedSites).toEqual(mockSitesResponse.sites);
    }));
  });

  describe('loadStats', () => {
    it('should load stats from API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockStats));

      let result: SiteStats | undefined;
      service.loadStats().subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/stats');
      expect(result).toEqual(mockStats);
    }));

    it('should update stats$ observable', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockStats));

      let emittedStats: SiteStats | null = null;
      service.stats$.subscribe(s => emittedStats = s);

      service.loadStats().subscribe();
      tick();

      expect(emittedStats).toEqual(mockStats as any);
    }));
  });

  describe('getSite', () => {
    it('should get single site by ID', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockSite));

      let result: Site | undefined;
      service.getSite('site-1').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1');
      expect(result).toEqual(mockSite);
    }));
  });

  describe('createSite', () => {
    it('should create site', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockSite));

      const data = { site_name: 'New Site', club_name: 'New Club' };
      let result: Site | undefined;
      service.createSite(data).subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites', data);
      expect(result).toEqual(mockSite);
    }));
  });

  describe('updateSite', () => {
    it('should update site', fakeAsync(() => {
      const updatedSite = { ...mockSite, site_name: 'Updated Site' };
      apiServiceSpy.put.and.returnValue(of(updatedSite));

      const data = { site_name: 'Updated Site' };
      let result: Site | undefined;
      service.updateSite('site-1', data).subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.put).toHaveBeenCalledWith('/sites/site-1', data);
      expect(result).toEqual(updatedSite);
    }));
  });

  describe('deleteSite', () => {
    it('should delete site', fakeAsync(() => {
      apiServiceSpy.delete.and.returnValue(of(undefined));

      service.deleteSite('site-1').subscribe();
      tick();

      expect(apiServiceSpy.delete).toHaveBeenCalledWith('/sites/site-1');
    }));
  });

  describe('regenerateApiKey', () => {
    it('should regenerate API key for site', fakeAsync(() => {
      const siteWithNewKey = { ...mockSite, api_key: 'new-key-456' };
      apiServiceSpy.post.and.returnValue(of(siteWithNewKey));

      let result: Site | undefined;
      service.regenerateApiKey('site-1').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/regenerate-key', {});
      expect(result?.api_key).toBe('new-key-456');
    }));
  });

  describe('getSiteMetrics', () => {
    it('should get site metrics with default hours', fakeAsync(() => {
      const metricsResponse = { site_id: 'site-1', period_hours: 24, metrics: [] };
      apiServiceSpy.get.and.returnValue(of(metricsResponse));

      service.getSiteMetrics('site-1').subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/metrics', { hours: 24 });
    }));

    it('should get site metrics with custom hours', fakeAsync(() => {
      const metricsResponse = { site_id: 'site-1', period_hours: 48, metrics: [] };
      apiServiceSpy.get.and.returnValue(of(metricsResponse));

      service.getSiteMetrics('site-1', 48).subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/metrics', { hours: 48 });
    }));
  });

  describe('commands', () => {
    const commandResponse = { success: true, commandId: 'cmd-123', message: 'Command sent' };

    describe('sendCommand', () => {
      it('should send command to site', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of(commandResponse));

        let result: any;
        service.sendCommand('site-1', 'restart_service', { service: 'app' }).subscribe(r => result = r);
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/command', {
          command: 'restart_service',
          params: { service: 'app' }
        });
        expect(result).toEqual(commandResponse);
      }));
    });

    describe('restartService', () => {
      it('should send restart_service command', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of({ success: true, message: 'OK' }));

        service.restartService('site-1', 'neopro').subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/command', {
          command: 'restart_service',
          params: { service: 'neopro' }
        });
      }));
    });

    describe('rebootSite', () => {
      it('should send reboot command', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of({ success: true, message: 'OK' }));

        service.rebootSite('site-1').subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/command', {
          command: 'reboot',
          params: {}
        });
      }));
    });
  });

  describe('getLogs', () => {
    it('should get logs with default lines', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of({ logs: ['line1', 'line2'] }));

      service.getLogs('site-1').subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/logs', { lines: 100 });
    }));

    it('should get logs with custom lines', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of({ logs: ['line1'] }));

      service.getLogs('site-1', 50).subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/logs', { lines: 50 });
    }));
  });

  describe('getSystemInfo', () => {
    it('should get system info for site', fakeAsync(() => {
      const systemInfo = {
        hostname: 'pi-001',
        os: 'Raspberry Pi OS',
        kernel: '5.10',
        architecture: 'arm64',
        cpu_model: 'BCM2711',
        cpu_cores: 4,
        total_memory: 4096,
        ip_address: '192.168.1.100',
        mac_address: 'aa:bb:cc:dd:ee:ff'
      };
      apiServiceSpy.get.and.returnValue(of(systemInfo));

      let result: any;
      service.getSystemInfo('site-1').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/system-info');
      expect(result).toEqual(systemInfo);
    }));
  });

  describe('updateSiteStatus', () => {
    it('should update site status in local state', fakeAsync(() => {
      // First load sites
      apiServiceSpy.get.and.returnValue(of(mockSitesResponse));
      service.loadSites().subscribe();
      tick();

      let emittedSites: Site[] = [];
      service.sites$.subscribe(s => emittedSites = s);

      service.updateSiteStatus('site-1', 'offline');

      const updatedSite = emittedSites.find(s => s.id === 'site-1');
      expect(updatedSite?.status).toBe('offline');
    }));

    it('should not fail if site not found', () => {
      expect(() => service.updateSiteStatus('nonexistent', 'offline')).not.toThrow();
    });
  });

  describe('getCommandStatus', () => {
    it('should get command status', fakeAsync(() => {
      const status = { status: 'completed', result: 'success' };
      apiServiceSpy.get.and.returnValue(of(status));

      let result: any;
      service.getCommandStatus('site-1', 'cmd-123').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/command/cmd-123');
      expect(result).toEqual(status);
    }));
  });

  describe('getConfiguration', () => {
    it('should send get_config command', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of({ success: true, commandId: 'cmd-456', message: 'OK' }));

      service.getConfiguration('site-1').subscribe();
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/command', {
        command: 'get_config',
        params: {}
      });
    }));
  });

  describe('config history', () => {
    describe('getConfigHistory', () => {
      it('should get config history with default params', fakeAsync(() => {
        const response = { site_id: 'site-1', total: 5, history: [] };
        apiServiceSpy.get.and.returnValue(of(response));

        service.getConfigHistory('site-1').subscribe();
        tick();

        expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/config-history', { limit: 20, offset: 0 });
      }));

      it('should get config history with custom params', fakeAsync(() => {
        const response = { site_id: 'site-1', total: 5, history: [] };
        apiServiceSpy.get.and.returnValue(of(response));

        service.getConfigHistory('site-1', 10, 5).subscribe();
        tick();

        expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/config-history', { limit: 10, offset: 5 });
      }));
    });

    describe('getConfigVersion', () => {
      it('should get specific config version', fakeAsync(() => {
        const configVersion = { id: 'v-1', configuration: {} };
        apiServiceSpy.get.and.returnValue(of(configVersion));

        service.getConfigVersion('site-1', 'v-1').subscribe();
        tick();

        expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/config-history/v-1');
      }));
    });

    describe('saveConfigVersion', () => {
      it('should save config version', fakeAsync(() => {
        const config = { videos: [], categories: [] } as any;
        apiServiceSpy.post.and.returnValue(of({ id: 'v-new', configuration: config }));

        service.saveConfigVersion('site-1', config, 'Updated config').subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/config-history', {
          configuration: config,
          comment: 'Updated config'
        });
      }));
    });

    describe('compareConfigVersions', () => {
      it('should compare two config versions', fakeAsync(() => {
        const diffResponse = { version1: {}, version2: {}, diff: [] };
        apiServiceSpy.get.and.returnValue(of(diffResponse));

        service.compareConfigVersions('site-1', 'v-1', 'v-2').subscribe();
        tick();

        expect(apiServiceSpy.get).toHaveBeenCalledWith('/sites/site-1/config-history-compare', {
          version1: 'v-1',
          version2: 'v-2'
        });
      }));
    });

    describe('previewConfigDiff', () => {
      it('should preview config diff', fakeAsync(() => {
        const newConfig = { videos: [], categories: [] } as any;
        const diffResponse = { hasChanges: true, changesCount: 5, diff: [] };
        apiServiceSpy.post.and.returnValue(of(diffResponse));

        service.previewConfigDiff('site-1', newConfig).subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/sites/site-1/config-preview-diff', {
          newConfiguration: newConfig
        });
      }));
    });
  });
});
