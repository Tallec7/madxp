import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { GroupsListComponent } from './groups-list.component';
import { GroupsService } from '../../core/services/groups.service';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { Group, Site } from '../../core/models';

describe('GroupsListComponent', () => {
  let component: GroupsListComponent;
  let fixture: ComponentFixture<GroupsListComponent>;
  let groupsService: jest.Mocked<GroupsService>;
  let sitesService: jest.Mocked<SitesService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockGroups: Group[] = [
    {
      id: '1',
      name: 'Football Bretagne',
      type: 'sport',
      description: 'Clubs de football en Bretagne',
      site_count: 5,
      metadata: { sport: 'Football' },
      created_at: new Date(),
    } as Group,
    {
      id: '2',
      name: 'Version 2.0',
      type: 'version',
      description: 'Sites en version 2.0',
      site_count: 3,
      metadata: { target_version: '2.0.0' },
      created_at: new Date(),
    } as Group,
  ];

  const mockSites: Site[] = [
    {
      id: '1',
      site_name: 'Site Rennes',
      club_name: 'Rennes FC',
      status: 'online',
      location: { city: 'Rennes', region: 'Bretagne', country: 'France' },
    } as Site,
  ];

  const groupsSubject = new BehaviorSubject<Group[]>(mockGroups);

  beforeEach(async () => {
    const groupsServiceMock = {
      groups$: groupsSubject.asObservable(),
      loadGroups: jest.fn().mockReturnValue(of(mockGroups)),
      createGroup: jest.fn().mockReturnValue(of({ id: '3', name: 'New Group' })),
      updateGroup: jest.fn().mockReturnValue(of({ id: '1', name: 'Updated Group' })),
      deleteGroup: jest.fn().mockReturnValue(of(undefined)),
      getGroupSites: jest.fn().mockReturnValue(of({ sites: mockSites })),
    };

    const sitesServiceMock = {
      loadSites: jest.fn().mockReturnValue(of({ sites: mockSites, total: 1, page: 1, totalPages: 1 })),
    };

    const notificationServiceMock = {
      error: jest.fn(),
      success: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [GroupsListComponent, FormsModule, RouterTestingModule],
      providers: [
        { provide: GroupsService, useValue: groupsServiceMock },
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupsListComponent);
    component = fixture.componentInstance;
    groupsService = TestBed.inject(GroupsService) as jest.Mocked<GroupsService>;
    sitesService = TestBed.inject(SitesService) as jest.Mocked<SitesService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should load groups on init', () => {
      fixture.detectChanges();
      expect(groupsService.loadGroups).toHaveBeenCalled();
    });

    it('should load available sites on init', () => {
      fixture.detectChanges();
      expect(sitesService.loadSites).toHaveBeenCalled();
    });

    it('should initialize with modals closed', () => {
      expect(component.showCreateModal).toBe(false);
      expect(component.showEditModal).toBe(false);
    });
  });

  describe('getTypeIcon', () => {
    it('should return ⚽ for sport type', () => {
      expect(component.getTypeIcon('sport')).toBe('⚽');
    });

    it('should return 📍 for geography type', () => {
      expect(component.getTypeIcon('geography')).toBe('📍');
    });

    it('should return 🔄 for version type', () => {
      expect(component.getTypeIcon('version')).toBe('🔄');
    });

    it('should return ⚙️ for custom type', () => {
      expect(component.getTypeIcon('custom')).toBe('⚙️');
    });

    it('should return 👥 for unknown type', () => {
      expect(component.getTypeIcon('unknown')).toBe('👥');
    });
  });

  describe('getTypeBadge', () => {
    it('should return primary for sport', () => {
      expect(component.getTypeBadge('sport')).toBe('primary');
    });

    it('should return success for geography', () => {
      expect(component.getTypeBadge('geography')).toBe('success');
    });

    it('should return warning for version', () => {
      expect(component.getTypeBadge('version')).toBe('warning');
    });

    it('should return secondary for custom', () => {
      expect(component.getTypeBadge('custom')).toBe('secondary');
    });
  });

  describe('getTypeLabel', () => {
    it('should return Sport for sport', () => {
      expect(component.getTypeLabel('sport')).toBe('Sport');
    });

    it('should return Géographie for geography', () => {
      expect(component.getTypeLabel('geography')).toBe('Géographie');
    });

    it('should return Version for version', () => {
      expect(component.getTypeLabel('version')).toBe('Version');
    });

    it('should return Personnalisé for custom', () => {
      expect(component.getTypeLabel('custom')).toBe('Personnalisé');
    });
  });

  describe('formatDate', () => {
    it('should return empty string for null date', () => {
      expect(component.formatDate(null)).toBe('');
    });

    it('should format date in French locale', () => {
      const date = new Date('2024-01-15');
      const result = component.formatDate(date);
      expect(result).toContain('2024');
    });
  });

  describe('Site Selection', () => {
    it('should return true when site is selected', () => {
      component.selectedSiteIds = ['1', '2'];
      expect(component.isSiteSelected('1')).toBe(true);
    });

    it('should return false when site is not selected', () => {
      component.selectedSiteIds = ['1', '2'];
      expect(component.isSiteSelected('3')).toBe(false);
    });

    it('should add site to selection when not selected', () => {
      component.selectedSiteIds = [];
      component.toggleSite('1');
      expect(component.selectedSiteIds).toContain('1');
    });

    it('should remove site from selection when already selected', () => {
      component.selectedSiteIds = ['1', '2'];
      component.toggleSite('1');
      expect(component.selectedSiteIds).not.toContain('1');
      expect(component.selectedSiteIds).toContain('2');
    });
  });

  describe('Form Validation', () => {
    it('should be invalid when name is empty', () => {
      component.groupForm.name = '';
      component.groupForm.type = 'sport';
      expect(component.isFormValid()).toBe(false);
    });

    it('should be valid when name and type are set', () => {
      component.groupForm.name = 'Test Group';
      component.groupForm.type = 'sport';
      expect(component.isFormValid()).toBe(true);
    });
  });

  describe('Filters', () => {
    it('should apply search filter', () => {
      component.searchTerm = 'Football';
      component.applyFilters();
      expect(groupsService.loadGroups).toHaveBeenCalledWith({ search: 'Football' });
    });

    it('should apply type filter', () => {
      component.typeFilter = 'sport';
      component.applyFilters();
      expect(groupsService.loadGroups).toHaveBeenCalledWith({ type: 'sport' });
    });

    it('should clear filters', () => {
      component.searchTerm = 'test';
      component.typeFilter = 'sport';

      component.clearFilters();

      expect(component.searchTerm).toBe('');
      expect(component.typeFilter).toBe('');
      expect(groupsService.loadGroups).toHaveBeenCalled();
    });

    it('should detect active filters', () => {
      component.searchTerm = 'test';
      expect(component.hasActiveFilters()).toBe(true);
    });

    it('should return false when no filters', () => {
      component.searchTerm = '';
      component.typeFilter = '';
      expect(component.hasActiveFilters()).toBe(false);
    });
  });

  describe('createGroup', () => {
    beforeEach(() => {
      component.groupForm = {
        name: 'New Group',
        type: 'sport',
        description: 'Description',
        metadata: { sport: 'Football', region: '', target_version: '' },
      };
      component.selectedSiteIds = ['1'];
      component.showCreateModal = true;
    });

    it('should not call service if form is invalid', () => {
      component.groupForm.name = '';
      component.createGroup();
      expect(groupsService.createGroup).not.toHaveBeenCalled();
    });

    it('should call createGroup with correct data', fakeAsync(() => {
      component.createGroup();
      tick();

      expect(groupsService.createGroup).toHaveBeenCalledWith({
        name: 'New Group',
        type: 'sport',
        description: 'Description',
        metadata: { sport: 'Football' },
        site_ids: ['1'],
      });
    }));

    it('should close modal after success', fakeAsync(() => {
      component.createGroup();
      tick();
      expect(component.showCreateModal).toBe(false);
    }));

    it('should show error on failure', fakeAsync(() => {
      groupsService.createGroup.mockReturnValue(throwError(() => ({ error: { error: 'Error' } })));

      component.createGroup();
      tick();

      expect(notificationService.error).toHaveBeenCalled();
    }));
  });

  describe('editGroup', () => {
    it('should populate form with group data', fakeAsync(() => {
      component.editGroup(mockGroups[0]);
      tick();

      expect(component.editingGroupId).toBe('1');
      expect(component.groupForm.name).toBe('Football Bretagne');
      expect(component.groupForm.type).toBe('sport');
    }));

    it('should load group sites', fakeAsync(() => {
      component.editGroup(mockGroups[0]);
      tick();

      expect(groupsService.getGroupSites).toHaveBeenCalledWith('1');
    }));

    it('should open edit modal', fakeAsync(() => {
      component.editGroup(mockGroups[0]);
      tick();

      expect(component.showEditModal).toBe(true);
    }));
  });

  describe('deleteGroup', () => {
    beforeEach(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should show confirmation', () => {
      component.deleteGroup(mockGroups[0]);
      expect(window.confirm).toHaveBeenCalled();
    });

    it('should call deleteGroup on confirmation', fakeAsync(() => {
      component.deleteGroup(mockGroups[0]);
      tick();

      expect(groupsService.deleteGroup).toHaveBeenCalledWith('1');
    }));

    it('should not delete if cancelled', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteGroup(mockGroups[0]);

      expect(groupsService.deleteGroup).not.toHaveBeenCalled();
    });
  });

  describe('closeModals', () => {
    it('should close all modals', () => {
      component.showCreateModal = true;
      component.showEditModal = true;
      component.editingGroupId = '1';

      component.closeModals();

      expect(component.showCreateModal).toBe(false);
      expect(component.showEditModal).toBe(false);
      expect(component.editingGroupId).toBeNull();
    });
  });

  describe('resetForm', () => {
    it('should reset form to defaults', () => {
      component.groupForm = {
        name: 'Test',
        type: 'custom',
        description: 'Test',
        metadata: { sport: 'Football', region: '', target_version: '' },
      };
      component.selectedSiteIds = ['1'];

      component.resetForm();

      expect(component.groupForm.name).toBe('');
      expect(component.groupForm.type).toBe('sport');
      expect(component.selectedSiteIds).toEqual([]);
    });
  });
});
