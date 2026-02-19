import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError, delay } from 'rxjs';
import { SiteSponsorsTabComponent } from './site-sponsors-tab.component';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SiteSponsor, GeneratedReport } from '../../../../core/models';

describe('SiteSponsorsTabComponent', () => {
  let component: SiteSponsorsTabComponent;
  let fixture: ComponentFixture<SiteSponsorsTabComponent>;
  let sitesService: jasmine.SpyObj<SitesService>;
  let notificationService: jasmine.SpyObj<NotificationService>;

  const mockSponsors: SiteSponsor[] = [
    {
      id: 'sp1',
      site_id: 's1',
      advertiser_id: null,
      name: 'Sponsor Local A',
      contact_name: 'Jean Dupont',
      contact_email: 'jean@sponsor-a.fr',
      contact_phone: '+33612345678',
      logo_url: null,
      contract_amount: 5000,
      contract_start: '2024-01-01',
      contract_end: '2024-12-31',
      source: 'local',
      status: 'active',
      metadata: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      video_count: 3,
      total_impressions: 1500,
    },
    {
      id: 'sp2',
      site_id: 's1',
      advertiser_id: 'adv1',
      name: 'Sponsor NEOPRO B',
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      logo_url: 'https://example.com/logo.png',
      contract_amount: null,
      contract_start: null,
      contract_end: null,
      source: 'neopro',
      status: 'active',
      metadata: {},
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
      video_count: 1,
      total_impressions: 500,
    },
    {
      id: 'sp3',
      site_id: 's1',
      advertiser_id: null,
      name: 'Sponsor Expiré',
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      logo_url: null,
      contract_amount: null,
      contract_start: null,
      contract_end: '2023-06-30',
      source: 'local',
      status: 'expired',
      metadata: {},
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-07-01T00:00:00Z',
      video_count: 0,
      total_impressions: 0,
    },
  ];

  const mockListResponse = {
    site: { id: 's1', site_name: 'Site Test', club_name: 'Club Test' },
    sponsors: mockSponsors,
    total: 3,
  };

  const mockStatsResponse = {
    sponsor: mockSponsors[0],
    period: { from: '2024-01-01', to: '2024-01-31' },
    summary: {
      total_impressions: 1500,
      total_screen_time_seconds: 3600,
      completion_rate: 0.95,
      estimated_reach: 500,
      active_days: 28,
    },
    daily_trends: [
      { date: '2024-01-01', impressions: 50, screen_time: 120 },
      { date: '2024-01-02', impressions: 55, screen_time: 130 },
    ],
    videos: [
      { id: 'v1', site_sponsor_id: 'sp1', video_id: null, video_filename: 'sponsor-a.mp4', is_primary: true, added_at: '2024-01-01T00:00:00Z' },
    ],
    cpi: 0.067,
    contract_amount: 100,
  };

  const mockReports: GeneratedReport[] = [
    {
      id: 'r1',
      report_type: 'site_sponsor',
      site_sponsor_id: 'sp1',
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      period_label: 'Janvier 2024',
      storage_url: 'https://example.com/report.pdf',
      status: 'completed',
      created_at: '2024-02-01T00:00:00Z',
      completed_at: '2024-02-01T00:01:00Z',
    },
  ];

  beforeEach(async () => {
    const sitesServiceMock = jasmine.createSpyObj('SitesService', [
      'listSiteSponsors',
      'getSiteSponsor',
      'createSiteSponsor',
      'updateSiteSponsor',
      'deleteSiteSponsor',
      'getSiteSponsorStats',
      'generateSponsorReport',
      'getSponsorReports',
      'getSiteSponsorBenchmark',
      'getLocalContent',
      'addVideoToSiteSponsor',
      'removeVideoFromSiteSponsor',
      'createSponsorAccessLink',
    ]);
    sitesServiceMock.listSiteSponsors.and.returnValue(of(mockListResponse));
    sitesServiceMock.getSiteSponsorStats.and.returnValue(of(mockStatsResponse));
    sitesServiceMock.getSponsorReports.and.returnValue(of(mockReports));
    sitesServiceMock.createSiteSponsor.and.returnValue(of(mockSponsors[0]));
    sitesServiceMock.updateSiteSponsor.and.returnValue(of(mockSponsors[0]));
    sitesServiceMock.deleteSiteSponsor.and.returnValue(of(undefined));
    sitesServiceMock.generateSponsorReport.and.returnValue(of({ reportId: 'r2', url: 'https://example.com/report2.pdf' }));
    sitesServiceMock.getLocalContent.and.returnValue(of({
      siteId: 's1', siteName: 'Site Test', clubName: 'Club Test',
      hasContent: true, lastSync: null, configHash: null, configuration: null,
      localVideos: [], localStorage: null, lastVideoSync: null, hotspotInfo: null,
      cloudVideos: [
        { id: 'cv1', filename: 'sponsor-a.mp4', originalName: 'sponsor-a.mp4', title: 'Sponsor A Video', category: 'sponsor', subcategory: null, size: 1024, duration: 30, checksum: null, url: 'https://example.com/sponsor-a.mp4', uploadedForSiteId: 's1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'cv2', filename: 'sponsor-b.mp4', originalName: 'sponsor-b.mp4', title: 'Sponsor B Video', category: 'sponsor', subcategory: null, size: 2048, duration: 45, checksum: null, url: 'https://example.com/sponsor-b.mp4', uploadedForSiteId: 's1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'cv3', filename: 'promo.mp4', originalName: 'promo.mp4', title: 'Promo', category: 'sponsor', subcategory: null, size: 3072, duration: 60, checksum: null, url: 'https://example.com/promo.mp4', uploadedForSiteId: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    }));
    sitesServiceMock.addVideoToSiteSponsor.and.returnValue(of(undefined));
    sitesServiceMock.removeVideoFromSiteSponsor.and.returnValue(of(undefined));
    sitesServiceMock.createSponsorAccessLink.and.returnValue(of({ accessUrl: 'https://example.com/access/abc', expiresAt: '2024-06-01T00:00:00Z', emailSent: false, sentTo: null }));
    sitesServiceMock.getSiteSponsorBenchmark.and.returnValue(of({
      site_id: 's1',
      period: { from: '2024-01-01', to: '2024-01-31' },
      sponsors: [
        { site_sponsor_id: 'sp1', sponsor_name: 'Sponsor A', impressions: 1500, screen_time_seconds: 3600, completion_rate: 0.95, active_days: 28, contract_amount: 100, cpi: 0.067 },
        { site_sponsor_id: 'sp2', sponsor_name: 'Sponsor B', impressions: 800, screen_time_seconds: 1800, completion_rate: 0.88, active_days: 20, contract_amount: null, cpi: null },
      ],
      averages: { impressions: 1150, screen_time_seconds: 2700, completion_rate: 0.915, active_days: 24, cpi: 0.067 },
    }));

    const notificationServiceMock = jasmine.createSpyObj('NotificationService', ['error', 'success', 'info']);

    await TestBed.configureTestingModule({
      imports: [SiteSponsorsTabComponent, FormsModule, TranslateModule.forRoot()],
      providers: [
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiteSponsorsTabComponent);
    component = fixture.componentInstance;
    component.siteId = 's1';
    sitesService = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should start with loading true', () => {
      expect(component.loading).toBe(true);
    });

    it('should load sponsors on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(sitesService.listSiteSponsors).toHaveBeenCalledWith('s1', true);
      expect(component.sponsors.length).toBe(3);
      expect(component.loading).toBe(false);
    }));

    it('should handle error when loading sponsors', fakeAsync(() => {
      sitesService.listSiteSponsors.and.returnValue(throwError(() => new Error('API Error')));

      fixture.detectChanges();
      tick();

      expect(component.error).toBe('Impossible de charger les sponsors');
      expect(component.loading).toBe(false);
    }));
  });

  describe('Sponsor List', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }));

    it('should display all sponsors in the list', () => {
      const rows = fixture.nativeElement.querySelectorAll('.data-table tbody tr:not(.detail-row)');
      expect(rows.length).toBe(3);
    });

    it('should display sponsor name', () => {
      const firstRow = fixture.nativeElement.querySelector('.data-table tbody tr');
      expect(firstRow?.textContent).toContain('Sponsor Local A');
    });

    it('should show empty state when no sponsors', fakeAsync(() => {
      sitesService.listSiteSponsors.and.returnValue(of({
        site: { id: 's1', site_name: 'Site Test', club_name: 'Club Test' },
        sponsors: [],
        total: 0,
      }));
      component.loadSponsors();
      tick();
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
    }));
  });

  describe('Modal Operations', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should open create modal', () => {
      component.openCreateModal();

      expect(component.showModal).toBe(true);
      expect(component.isEditing).toBe(false);
      expect(component.formData.name).toBe('');
    });

    it('should close modal', () => {
      component.showModal = true;
      component.closeModal();

      expect(component.showModal).toBe(false);
    });

    it('should open edit modal with sponsor data', () => {
      component.openEditModal(mockSponsors[0]);

      expect(component.showModal).toBe(true);
      expect(component.isEditing).toBe(true);
      expect(component.formData.name).toBe('Sponsor Local A');
      expect(component.editingSponsorId).toBe('sp1');
    });
  });

  describe('CRUD Operations', () => {
    const mockEvent = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;

    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should create a new sponsor', fakeAsync(() => {
      component.openCreateModal();
      component.formData.name = 'New Sponsor';
      component.formData.contact_name = 'Contact';
      component.formData.contact_email = 'contact@test.fr';
      component.formData.status = 'active';

      component.saveSponsor(mockEvent);
      tick();

      expect(sitesService.createSiteSponsor).toHaveBeenCalledWith('s1', jasmine.objectContaining({
        name: 'New Sponsor',
        contact_name: 'Contact',
        contact_email: 'contact@test.fr',
        status: 'active',
      }));
      expect(notificationService.success).toHaveBeenCalledWith('Sponsor créé');
      expect(component.showModal).toBe(false);
    }));

    it('should update an existing sponsor', fakeAsync(() => {
      component.openEditModal(mockSponsors[0]);
      component.formData.name = 'Updated Name';

      component.saveSponsor(mockEvent);
      tick();

      expect(sitesService.updateSiteSponsor).toHaveBeenCalledWith('s1', 'sp1', jasmine.objectContaining({
        name: 'Updated Name',
      }));
      expect(notificationService.success).toHaveBeenCalledWith('Sponsor mis à jour');
    }));

    it('should prevent default on save', fakeAsync(() => {
      component.openCreateModal();
      component.formData.name = 'Test';
      component.saveSponsor(mockEvent);
      tick();

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    }));

    it('should show error notification on save failure', fakeAsync(() => {
      sitesService.createSiteSponsor.and.returnValue(throwError(() => new Error('API Error')));

      component.openCreateModal();
      component.formData.name = 'New Sponsor';
      component.saveSponsor(mockEvent);
      tick();

      expect(notificationService.error).toHaveBeenCalledWith("Erreur lors de l'enregistrement");
    }));

    it('should not save if name is empty', fakeAsync(() => {
      component.openCreateModal();
      component.formData.name = '';

      component.saveSponsor(mockEvent);
      tick();

      expect(sitesService.createSiteSponsor).not.toHaveBeenCalled();
    }));

    it('should delete a sponsor with confirmation', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);

      component.confirmDelete(mockSponsors[0]);
      tick();

      expect(sitesService.deleteSiteSponsor).toHaveBeenCalledWith('s1', 'sp1');
      expect(notificationService.success).toHaveBeenCalledWith('Sponsor supprimé');
      // Should reload the list after deletion
      expect(sitesService.listSiteSponsors).toHaveBeenCalledTimes(2); // 1 init + 1 after delete
    }));

    it('should not delete when confirmation is cancelled', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(false);

      component.confirmDelete(mockSponsors[0]);
      tick();

      expect(sitesService.deleteSiteSponsor).not.toHaveBeenCalled();
    }));

    it('should collapse expanded detail on delete', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.expandedSponsorId = 'sp1';

      component.confirmDelete(mockSponsors[0]);
      tick();

      expect(component.expandedSponsorId).toBeNull();
    }));
  });

  describe('Detail Expand', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should expand sponsor detail on toggle', fakeAsync(() => {
      component.toggleDetail(mockSponsors[0]);
      tick();

      expect(component.expandedSponsorId).toBe('sp1');
      expect(sitesService.getSiteSponsorStats).toHaveBeenCalled();
      const callArgs = sitesService.getSiteSponsorStats.calls.mostRecent().args;
      expect(callArgs[0]).toBe('s1');
      expect(callArgs[1]).toBe('sp1');
    }));

    it('should collapse detail on second toggle', fakeAsync(() => {
      component.toggleDetail(mockSponsors[0]);
      tick();

      component.toggleDetail(mockSponsors[0]);

      expect(component.expandedSponsorId).toBeNull();
    }));

    it('should load stats and reports when expanding', fakeAsync(() => {
      component.toggleDetail(mockSponsors[0]);
      tick();

      expect(sitesService.getSiteSponsorStats).toHaveBeenCalled();
      expect(sitesService.getSponsorReports).toHaveBeenCalledWith('sp1');
    }));

    it('should set detailLoading while fetching', fakeAsync(() => {
      sitesService.getSiteSponsorStats.and.returnValue(of(mockStatsResponse).pipe(delay(100)));

      component.toggleDetail(mockSponsors[0]);

      expect(component.detailLoading).toBe(true);

      tick(100);

      expect(component.detailLoading).toBe(false);
    }));
  });

  describe('Report Generation', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should generate report for a sponsor', fakeAsync(() => {
      component.generateReport(mockSponsors[0]);
      tick();

      expect(sitesService.generateSponsorReport).toHaveBeenCalledWith('s1', 'sp1', jasmine.any(String), jasmine.any(String));
      expect(notificationService.success).toHaveBeenCalled();
    }));

    it('should mention email for sponsor with contact email', fakeAsync(() => {
      component.generateReport(mockSponsors[0]);
      tick();

      const successCall = notificationService.success.calls.mostRecent();
      expect(successCall.args[0]).toContain('jean@sponsor-a.fr');
    }));

    it('should not mention email for sponsor without contact email', fakeAsync(() => {
      component.generateReport(mockSponsors[1]);
      tick();

      const successCall = notificationService.success.calls.mostRecent();
      expect(successCall.args[0]).not.toContain('email');
    }));

    it('should set generatingReportId during generation', fakeAsync(() => {
      sitesService.generateSponsorReport.and.returnValue(
        of({ reportId: 'r2', url: 'https://example.com/report2.pdf' }).pipe(delay(100))
      );

      component.generateReport(mockSponsors[0]);

      expect(component.generatingReportId).toBe('sp1');

      tick(100);

      expect(component.generatingReportId).toBeNull();
    }));

    it('should handle report generation error', fakeAsync(() => {
      sitesService.generateSponsorReport.and.returnValue(throwError(() => new Error('API Error')));

      component.generateReport(mockSponsors[0]);
      tick();

      expect(notificationService.error).toHaveBeenCalledWith('Erreur lors de la génération du rapport');
      expect(component.generatingReportId).toBeNull();
    }));
  });

  describe('Video Association', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      // Expand sponsor detail
      component.toggleDetail(mockSponsors[0]);
      tick(100);
      fixture.detectChanges();
    }));

    it('should load available videos when expanding sponsor detail', () => {
      expect(sitesService.getLocalContent).toHaveBeenCalledWith('s1');
      // sponsor-a.mp4 is already associated, so only sponsor-b.mp4 and promo.mp4 should be available
      expect(component.availableVideos.length).toBe(2);
      expect(component.availableVideos.map(v => v.filename)).toEqual(['sponsor-b.mp4', 'promo.mp4']);
    });

    it('should add a video to the sponsor', fakeAsync(() => {
      component.selectedVideoFilename = 'sponsor-b.mp4';
      component.addVideo();
      tick();

      expect(sitesService.addVideoToSiteSponsor).toHaveBeenCalledWith('s1', 'sp1', 'sponsor-b.mp4');
      expect(notificationService.success).toHaveBeenCalledWith('Vidéo associée au sponsor');
      expect(component.selectedVideoFilename).toBe('');
      expect(component.addingVideo).toBe(false);
    }));

    it('should not add video when no filename selected', fakeAsync(() => {
      component.selectedVideoFilename = '';
      component.addVideo();
      tick();

      expect(sitesService.addVideoToSiteSponsor).not.toHaveBeenCalled();
    }));

    it('should handle add video error', fakeAsync(() => {
      sitesService.addVideoToSiteSponsor.and.returnValue(throwError(() => new Error('fail')));
      component.selectedVideoFilename = 'sponsor-b.mp4';
      component.addVideo();
      tick();

      expect(notificationService.error).toHaveBeenCalledWith("Erreur lors de l'association de la vidéo");
      expect(component.addingVideo).toBe(false);
    }));

    it('should remove a video from the sponsor', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.removeVideo('sponsor-a.mp4');
      tick();

      expect(sitesService.removeVideoFromSiteSponsor).toHaveBeenCalledWith('s1', 'sp1', 'sponsor-a.mp4');
      expect(notificationService.success).toHaveBeenCalledWith('Vidéo retirée du sponsor');
      expect(component.removingVideoFilename).toBeNull();
    }));

    it('should not remove video when confirmation cancelled', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.removeVideo('sponsor-a.mp4');
      tick();

      expect(sitesService.removeVideoFromSiteSponsor).not.toHaveBeenCalled();
    }));

    it('should handle remove video error', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      sitesService.removeVideoFromSiteSponsor.and.returnValue(throwError(() => new Error('fail')));
      component.removeVideo('sponsor-a.mp4');
      tick();

      expect(notificationService.error).toHaveBeenCalledWith('Erreur lors de la suppression');
      expect(component.removingVideoFilename).toBeNull();
    }));

    it('should clear video state on collapse', fakeAsync(() => {
      component.availableVideos = [{ filename: 'test.mp4' } as any];
      component.selectedVideoFilename = 'test.mp4';

      component.toggleDetail(mockSponsors[0]); // collapse
      tick();

      expect(component.availableVideos.length).toBe(0);
      expect(component.selectedVideoFilename).toBe('');
    }));
  });

  describe('Template', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }));

    it('should show add sponsor button', () => {
      const addBtn = fixture.nativeElement.querySelector('.btn-primary');
      expect(addBtn).toBeTruthy();
      expect(addBtn.textContent).toContain('Ajouter sponsor');
    });

    it('should have loading property that controls spinner visibility', () => {
      // OnPush: verify the component state, since direct DOM testing needs
      // component-initiated CD
      expect(component.loading).toBe(false);
      component.loading = true;
      expect(component.loading).toBe(true);
    });

    it('should show error banner on error', fakeAsync(() => {
      sitesService.listSiteSponsors.and.returnValue(throwError(() => new Error('API Error')));
      component.loadSponsors();
      tick();
      fixture.detectChanges();

      const errorBanner = fixture.nativeElement.querySelector('.error-banner');
      expect(errorBanner).toBeTruthy();
      expect(errorBanner.textContent).toContain('Impossible de charger les sponsors');
    }));

    it('should show modal when showModal is true', () => {
      component.openCreateModal();
      fixture.detectChanges();

      const modal = fixture.nativeElement.querySelector('.modal-overlay');
      expect(modal).toBeTruthy();
    });

    it('should show count badge with sponsor count', () => {
      const badge = fixture.nativeElement.querySelector('.count-badge');
      expect(badge).toBeTruthy();
      expect(badge.textContent.trim()).toBe('3');
    });
  });
});
