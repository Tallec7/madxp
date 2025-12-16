import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { SponsorsListComponent } from './sponsors-list.component';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

describe('SponsorsListComponent', () => {
  let component: SponsorsListComponent;
  let fixture: ComponentFixture<SponsorsListComponent>;
  let apiService: jest.Mocked<ApiService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockSponsors = [
    {
      id: '1',
      name: 'Sponsor A',
      logo_url: 'https://example.com/logo.png',
      contact_name: 'John Doe',
      contact_email: 'john@sponsor.com',
      contact_phone: '+33612345678',
      status: 'active' as const,
      created_at: '2024-01-01',
    },
    {
      id: '2',
      name: 'Sponsor B',
      status: 'inactive' as const,
      created_at: '2024-01-02',
    },
    {
      id: '3',
      name: 'Sponsor C',
      status: 'paused' as const,
      created_at: '2024-01-03',
    },
  ];

  beforeEach(async () => {
    const apiServiceMock = {
      get: jest.fn().mockReturnValue(of({ success: true, data: { sponsors: mockSponsors } })),
      post: jest.fn().mockReturnValue(of({ success: true, data: { id: '4', name: 'New Sponsor' } })),
      put: jest.fn().mockReturnValue(of({ success: true, data: { id: '1', name: 'Updated Sponsor' } })),
    };

    const notificationServiceMock = {
      error: jest.fn(),
      success: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SponsorsListComponent, FormsModule, RouterTestingModule],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SponsorsListComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as jest.Mocked<ApiService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should start with loading false', () => {
      expect(component.loading).toBe(false);
    });

    it('should load sponsors on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(apiService.get).toHaveBeenCalledWith('/analytics/sponsors');
      expect(component.sponsors).toHaveLength(3);
    }));

    it('should set filtered sponsors after loading', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.filteredSponsors).toHaveLength(3);
    }));

    it('should check permissions on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.canManage).toBe(true);
    }));
  });

  describe('loadSponsors', () => {
    it('should set loading to true while fetching', fakeAsync(() => {
      component.loadSponsors();
      expect(component.loading).toBe(true);

      tick();
      expect(component.loading).toBe(false);
    }));

    it('should show error notification on failure', fakeAsync(() => {
      apiService.get.mockReturnValue(throwError(() => new Error('API Error')));

      component.loadSponsors();
      tick();

      expect(notificationService.error).toHaveBeenCalledWith('Erreur lors du chargement des sponsors');
    }));
  });

  describe('filterSponsors', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should filter by search term', () => {
      component.searchTerm = 'Sponsor A';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(1);
      expect(component.filteredSponsors[0].name).toBe('Sponsor A');
    });

    it('should filter by status', () => {
      component.statusFilter = 'active';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(1);
      expect(component.filteredSponsors[0].status).toBe('active');
    });

    it('should filter by contact name', () => {
      component.searchTerm = 'John';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(1);
      expect(component.filteredSponsors[0].contact_name).toBe('John Doe');
    });

    it('should combine search and status filters', () => {
      component.searchTerm = 'Sponsor';
      component.statusFilter = 'inactive';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(1);
      expect(component.filteredSponsors[0].name).toBe('Sponsor B');
    });

    it('should return all sponsors when no filters', () => {
      component.searchTerm = '';
      component.statusFilter = '';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(3);
    });

    it('should be case insensitive', () => {
      component.searchTerm = 'sponsor a';
      component.filterSponsors();

      expect(component.filteredSponsors).toHaveLength(1);
    });
  });

  describe('getInitials', () => {
    it('should return first letters of words', () => {
      expect(component.getInitials('Sponsor Name')).toBe('SN');
    });

    it('should handle single word', () => {
      expect(component.getInitials('Sponsor')).toBe('S');
    });

    it('should limit to 2 characters', () => {
      expect(component.getInitials('Very Long Sponsor Name')).toBe('VL');
    });
  });

  describe('getStatusLabel', () => {
    it('should return Actif for active', () => {
      expect(component.getStatusLabel('active')).toBe('Actif');
    });

    it('should return Inactif for inactive', () => {
      expect(component.getStatusLabel('inactive')).toBe('Inactif');
    });

    it('should return En pause for paused', () => {
      expect(component.getStatusLabel('paused')).toBe('En pause');
    });

    it('should return status as-is for unknown', () => {
      expect(component.getStatusLabel('unknown')).toBe('unknown');
    });
  });

  describe('Modal Operations', () => {
    it('should open create modal', () => {
      component.openCreateModal();

      expect(component.showModal).toBe(true);
      expect(component.isEditing).toBe(false);
      expect(component.formData.name).toBe('');
    });

    it('should open edit modal with sponsor data', () => {
      const mockEvent = { stopPropagation: jest.fn() } as unknown as Event;

      component.editSponsor(mockEvent, mockSponsors[0]);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(component.showModal).toBe(true);
      expect(component.isEditing).toBe(true);
      expect(component.formData.name).toBe('Sponsor A');
    });

    it('should close modal', () => {
      component.showModal = true;

      component.closeModal();

      expect(component.showModal).toBe(false);
    });
  });

  describe('saveSponsor', () => {
    const mockEvent = {
      preventDefault: jest.fn(),
    } as unknown as Event;

    beforeEach(() => {
      component.formData = {
        name: 'Test Sponsor',
        status: 'active',
      };
    });

    it('should create new sponsor when not editing', fakeAsync(() => {
      component.isEditing = false;
      component.showModal = true;

      component.saveSponsor(mockEvent);
      tick();

      expect(apiService.post).toHaveBeenCalledWith('/analytics/sponsors', component.formData);
      expect(notificationService.success).toHaveBeenCalledWith('Sponsor créé avec succès');
      expect(component.showModal).toBe(false);
    }));

    it('should update sponsor when editing', fakeAsync(() => {
      component.isEditing = true;
      component.formData.id = '1';
      component.showModal = true;

      component.saveSponsor(mockEvent);
      tick();

      expect(apiService.put).toHaveBeenCalledWith('/analytics/sponsors/1', component.formData);
      expect(notificationService.success).toHaveBeenCalledWith('Sponsor modifié avec succès');
    }));

    it('should prevent default form submission', () => {
      component.saveSponsor(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should set saving flag during operation', fakeAsync(() => {
      component.saveSponsor(mockEvent);
      expect(component.saving).toBe(true);

      tick();
      expect(component.saving).toBe(false);
    }));

    it('should show error notification on failure', fakeAsync(() => {
      apiService.post.mockReturnValue(throwError(() => new Error('API Error')));

      component.saveSponsor(mockEvent);
      tick();

      expect(notificationService.error).toHaveBeenCalledWith("Erreur lors de l'enregistrement");
    }));

    it('should reload sponsors after successful save', fakeAsync(() => {
      apiService.get.mockClear();

      component.saveSponsor(mockEvent);
      tick();

      expect(apiService.get).toHaveBeenCalledWith('/analytics/sponsors');
    }));
  });

  describe('viewAnalytics', () => {
    it('should stop event propagation', () => {
      const mockEvent = { stopPropagation: jest.fn() } as unknown as Event;

      // Mock window.location.href
      const originalLocation = window.location;
      delete (window as { location?: Location }).location;
      window.location = { ...originalLocation, href: '' };

      component.viewAnalytics(mockEvent, '1');

      expect(mockEvent.stopPropagation).toHaveBeenCalled();

      // Restore window.location
      window.location = originalLocation;
    });
  });

  describe('Template', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should display sponsors', () => {
      const sponsorCards = fixture.nativeElement.querySelectorAll('.sponsor-card');
      expect(sponsorCards.length).toBe(3);
    });

    it('should display sponsor name', () => {
      const sponsorName = fixture.nativeElement.querySelector('.sponsor-info h3');
      expect(sponsorName?.textContent).toContain('Sponsor A');
    });

    it('should show loading spinner when loading', () => {
      component.loading = true;
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('.spinner');
      expect(spinner).toBeTruthy();
    });

    it('should show empty state when no sponsors', fakeAsync(() => {
      component.filteredSponsors = [];
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
    }));

    it('should show create button when canManage is true', () => {
      component.canManage = true;
      fixture.detectChanges();

      const createBtn = fixture.nativeElement.querySelector('.header .btn-primary');
      expect(createBtn).toBeTruthy();
    });
  });
});
