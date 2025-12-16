import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SitesListComponent } from './sites-list.component';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site } from '../../core/models';

describe('SitesListComponent', () => {
  let component: SitesListComponent;
  let fixture: ComponentFixture<SitesListComponent>;
  let sitesService: jest.Mocked<SitesService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockSites: Site[] = [
    {
      id: '1',
      site_name: 'Site Rennes',
      club_name: 'Rennes FC',
      status: 'online',
      software_version: '1.0.0',
      location: { city: 'Rennes', region: 'Bretagne', country: 'France' },
      sports: ['football'],
      last_seen_at: new Date(),
    } as Site,
    {
      id: '2',
      site_name: 'Site Nantes',
      club_name: 'Nantes FC',
      status: 'offline',
      software_version: '1.0.1',
      location: { city: 'Nantes', region: 'Pays de la Loire', country: 'France' },
      sports: ['football', 'rugby'],
      last_seen_at: new Date(Date.now() - 3600000),
    } as Site,
  ];

  const sitesSubject = new BehaviorSubject<Site[]>(mockSites);

  beforeEach(async () => {
    const sitesServiceMock = {
      sites$: sitesSubject.asObservable(),
      loadSites: jest.fn().mockReturnValue(of({ sites: mockSites, total: 2, page: 1, totalPages: 1 })),
      createSite: jest.fn().mockReturnValue(of({ id: '3', site_name: 'New Site' })),
      updateSite: jest.fn().mockReturnValue(of({ id: '1', site_name: 'Updated Site' })),
      deleteSite: jest.fn().mockReturnValue(of(undefined)),
    };

    const notificationServiceMock = {
      error: jest.fn(),
      success: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SitesListComponent, FormsModule, RouterTestingModule],
      providers: [
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SitesListComponent);
    component = fixture.componentInstance;
    sitesService = TestBed.inject(SitesService) as jest.Mocked<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with empty search term', () => {
      expect(component.searchTerm).toBe('');
    });

    it('should initialize with empty status filter', () => {
      expect(component.statusFilter).toBe('');
    });

    it('should initialize with empty region filter', () => {
      expect(component.regionFilter).toBe('');
    });

    it('should initialize with modals closed', () => {
      expect(component.showCreateModal).toBe(false);
      expect(component.showEditModal).toBe(false);
    });

    it('should load sites on init', () => {
      fixture.detectChanges();
      expect(sitesService.loadSites).toHaveBeenCalled();
    });
  });

  describe('loadSites', () => {
    it('should call sitesService.loadSites', () => {
      component.loadSites();
      expect(sitesService.loadSites).toHaveBeenCalled();
    });
  });

  describe('applyFilters', () => {
    it('should call loadSites with search filter', () => {
      component.searchTerm = 'Rennes';
      component.applyFilters();

      expect(sitesService.loadSites).toHaveBeenCalledWith({ search: 'Rennes' });
    });

    it('should call loadSites with status filter', () => {
      component.statusFilter = 'online';
      component.applyFilters();

      expect(sitesService.loadSites).toHaveBeenCalledWith({ status: 'online' });
    });

    it('should call loadSites with region filter', () => {
      component.regionFilter = 'Bretagne';
      component.applyFilters();

      expect(sitesService.loadSites).toHaveBeenCalledWith({ region: 'Bretagne' });
    });

    it('should call loadSites with multiple filters', () => {
      component.searchTerm = 'Rennes';
      component.statusFilter = 'online';
      component.regionFilter = 'Bretagne';
      component.applyFilters();

      expect(sitesService.loadSites).toHaveBeenCalledWith({
        search: 'Rennes',
        status: 'online',
        region: 'Bretagne',
      });
    });
  });

  describe('clearFilters', () => {
    it('should reset all filters', () => {
      component.searchTerm = 'test';
      component.statusFilter = 'online';
      component.regionFilter = 'Bretagne';

      component.clearFilters();

      expect(component.searchTerm).toBe('');
      expect(component.statusFilter).toBe('');
      expect(component.regionFilter).toBe('');
    });

    it('should reload sites after clearing', () => {
      sitesService.loadSites.mockClear();

      component.clearFilters();

      expect(sitesService.loadSites).toHaveBeenCalled();
    });
  });

  describe('hasActiveFilters', () => {
    it('should return false when no filters', () => {
      component.searchTerm = '';
      component.statusFilter = '';
      component.regionFilter = '';

      expect(component.hasActiveFilters()).toBe(false);
    });

    it('should return true when search term is set', () => {
      component.searchTerm = 'test';

      expect(component.hasActiveFilters()).toBe(true);
    });

    it('should return true when status filter is set', () => {
      component.statusFilter = 'online';

      expect(component.hasActiveFilters()).toBe(true);
    });

    it('should return true when region filter is set', () => {
      component.regionFilter = 'Bretagne';

      expect(component.hasActiveFilters()).toBe(true);
    });
  });

  describe('getStatusBadge', () => {
    it('should return success for online', () => {
      expect(component.getStatusBadge('online')).toBe('success');
    });

    it('should return secondary for offline', () => {
      expect(component.getStatusBadge('offline')).toBe('secondary');
    });

    it('should return danger for error', () => {
      expect(component.getStatusBadge('error')).toBe('danger');
    });

    it('should return warning for maintenance', () => {
      expect(component.getStatusBadge('maintenance')).toBe('warning');
    });

    it('should return secondary for unknown status', () => {
      expect(component.getStatusBadge('unknown')).toBe('secondary');
    });
  });

  describe('formatLastSeen', () => {
    it('should return "Jamais vu" for null date', () => {
      expect(component.formatLastSeen(null)).toBe('Jamais vu');
    });

    it('should return "À l\'instant" for very recent date', () => {
      const now = new Date();
      expect(component.formatLastSeen(now)).toBe("À l'instant");
    });

    it('should return minutes for date less than 1 hour ago', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60000);
      expect(component.formatLastSeen(tenMinutesAgo)).toBe('Il y a 10 min');
    });

    it('should return hours for date less than 24 hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60000);
      expect(component.formatLastSeen(twoHoursAgo)).toBe('Il y a 2h');
    });

    it('should return days for date more than 24 hours ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60000);
      expect(component.formatLastSeen(threeDaysAgo)).toBe('Il y a 3 jours');
    });
  });

  describe('isValid', () => {
    it('should return false if site_name is empty', () => {
      component.newSite = {
        site_name: '',
        club_name: 'Test Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: '',
      };

      expect(component.isValid()).toBe(false);
    });

    it('should return false if club_name is empty', () => {
      component.newSite = {
        site_name: 'Test Site',
        club_name: '',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: '',
      };

      expect(component.isValid()).toBe(false);
    });

    it('should return false if city is empty', () => {
      component.newSite = {
        site_name: 'Test Site',
        club_name: 'Test Club',
        location: { city: '', region: 'Ile-de-France', country: 'France' },
        hardware_model: '',
      };

      expect(component.isValid()).toBe(false);
    });

    it('should return true when all required fields are filled', () => {
      component.newSite = {
        site_name: 'Test Site',
        club_name: 'Test Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: '',
      };

      expect(component.isValid()).toBe(true);
    });
  });

  describe('createSite', () => {
    beforeEach(() => {
      component.newSite = {
        site_name: 'New Site',
        club_name: 'New Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: 'Raspberry Pi 4',
      };
      component.sportsInput = 'football, rugby';
      component.showCreateModal = true;
    });

    it('should not call service if form is invalid', () => {
      component.newSite.site_name = '';

      component.createSite();

      expect(sitesService.createSite).not.toHaveBeenCalled();
    });

    it('should call createSite with correct data', fakeAsync(() => {
      component.createSite();
      tick();

      expect(sitesService.createSite).toHaveBeenCalledWith({
        site_name: 'New Site',
        club_name: 'New Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: 'Raspberry Pi 4',
        sports: ['football', 'rugby'],
      });
    }));

    it('should close modal after successful creation', fakeAsync(() => {
      component.createSite();
      tick();

      expect(component.showCreateModal).toBe(false);
    }));

    it('should reload sites after successful creation', fakeAsync(() => {
      sitesService.loadSites.mockClear();

      component.createSite();
      tick();

      expect(sitesService.loadSites).toHaveBeenCalled();
    }));

    it('should show error notification on failure', fakeAsync(() => {
      sitesService.createSite.mockReturnValue(throwError(() => ({ error: { error: 'Creation failed' } })));

      component.createSite();
      tick();

      expect(notificationService.error).toHaveBeenCalledWith(
        'Erreur lors de la création du site: Creation failed'
      );
    }));
  });

  describe('resetForm', () => {
    it('should reset newSite to default values', () => {
      component.newSite = {
        site_name: 'Test',
        club_name: 'Test Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        hardware_model: 'Model',
      };
      component.sportsInput = 'football';

      component.resetForm();

      expect(component.newSite.site_name).toBe('');
      expect(component.newSite.club_name).toBe('');
      expect(component.newSite.location.city).toBe('');
      expect(component.sportsInput).toBe('');
    });
  });

  describe('editSite', () => {
    it('should populate edit form with site data', () => {
      component.editSite(mockSites[0]);

      expect(component.editSiteData.site_name).toBe('Site Rennes');
      expect(component.editSiteData.club_name).toBe('Rennes FC');
      expect(component.editSiteData.location.city).toBe('Rennes');
    });

    it('should open edit modal', () => {
      component.editSite(mockSites[0]);

      expect(component.showEditModal).toBe(true);
    });

    it('should set editingSite', () => {
      component.editSite(mockSites[0]);

      expect(component.editingSite).toEqual(mockSites[0]);
    });

    it('should populate sports input', () => {
      component.editSite(mockSites[1]);

      expect(component.editSportsInput).toBe('football, rugby');
    });
  });

  describe('closeEditModal', () => {
    it('should close edit modal', () => {
      component.showEditModal = true;

      component.closeEditModal();

      expect(component.showEditModal).toBe(false);
    });

    it('should reset editingSite', () => {
      component.editingSite = mockSites[0];

      component.closeEditModal();

      expect(component.editingSite).toBeNull();
    });
  });

  describe('saveEditSite', () => {
    beforeEach(() => {
      component.editingSite = mockSites[0];
      component.editSiteData = {
        site_name: 'Updated Site',
        club_name: 'Updated Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
      };
      component.editSportsInput = 'basketball';
      component.showEditModal = true;
    });

    it('should not call service if editingSite is null', () => {
      component.editingSite = null;

      component.saveEditSite();

      expect(sitesService.updateSite).not.toHaveBeenCalled();
    });

    it('should call updateSite with correct data', fakeAsync(() => {
      component.saveEditSite();
      tick();

      expect(sitesService.updateSite).toHaveBeenCalledWith('1', {
        site_name: 'Updated Site',
        club_name: 'Updated Club',
        location: { city: 'Paris', region: 'Ile-de-France', country: 'France' },
        sports: ['basketball'],
      });
    }));

    it('should close modal and reload after success', fakeAsync(() => {
      sitesService.loadSites.mockClear();

      component.saveEditSite();
      tick();

      expect(component.showEditModal).toBe(false);
      expect(sitesService.loadSites).toHaveBeenCalled();
    }));

    it('should show error notification on failure', fakeAsync(() => {
      sitesService.updateSite.mockReturnValue(throwError(() => ({ error: { error: 'Update failed' } })));

      component.saveEditSite();
      tick();

      expect(notificationService.error).toHaveBeenCalledWith(
        'Erreur lors de la modification du site: Update failed'
      );
    }));
  });

  describe('deleteSite', () => {
    beforeEach(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should show confirmation dialog', () => {
      component.deleteSite(mockSites[0]);

      expect(window.confirm).toHaveBeenCalledWith(
        'Êtes-vous sûr de vouloir supprimer le site "Rennes FC" ?'
      );
    });

    it('should not delete if user cancels', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteSite(mockSites[0]);

      expect(sitesService.deleteSite).not.toHaveBeenCalled();
    });

    it('should call deleteSite on confirmation', fakeAsync(() => {
      component.deleteSite(mockSites[0]);
      tick();

      expect(sitesService.deleteSite).toHaveBeenCalledWith('1');
    }));

    it('should reload sites after successful deletion', fakeAsync(() => {
      sitesService.loadSites.mockClear();

      component.deleteSite(mockSites[0]);
      tick();

      expect(sitesService.loadSites).toHaveBeenCalled();
    }));

    it('should show error notification on failure', fakeAsync(() => {
      sitesService.deleteSite.mockReturnValue(throwError(() => ({ error: { error: 'Delete failed' } })));

      component.deleteSite(mockSites[0]);
      tick();

      expect(notificationService.error).toHaveBeenCalledWith(
        'Erreur lors de la suppression: Delete failed'
      );
    }));
  });
});
