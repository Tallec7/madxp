import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { UpdatesManagementComponent } from './updates-management.component';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';

describe('UpdatesManagementComponent', () => {
  let component: UpdatesManagementComponent;
  let fixture: ComponentFixture<UpdatesManagementComponent>;
  let apiService: jest.Mocked<ApiService>;
  let sitesService: jest.Mocked<SitesService>;
  let groupsService: jest.Mocked<GroupsService>;
  let socketService: jest.Mocked<SocketService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockUpdates = [
    {
      id: 'u1',
      version: '2.1.0',
      description: 'Bug fixes',
      release_notes: 'Fixed various bugs',
      file_size: 50000000,
      created_at: new Date(),
      is_critical: false,
    },
    {
      id: 'u2',
      version: '2.2.0',
      description: 'Critical security update',
      release_notes: 'Security patches',
      file_size: 60000000,
      created_at: new Date(),
      is_critical: true,
    },
  ];

  const mockDeployments = [
    {
      id: 'd1',
      update_id: 'u1',
      update_version: '2.1.0',
      target_type: 'site' as const,
      target_id: 's1',
      target_name: 'Site 1',
      status: 'completed' as const,
      progress: 100,
      deployed_count: 1,
      total_count: 1,
      created_at: new Date(),
    },
  ];

  const mockSites = [
    { id: 's1', site_name: 'Site 1', club_name: 'Club 1', status: 'online', software_version: '2.0.0' },
    { id: 's2', site_name: 'Site 2', club_name: 'Club 2', status: 'online', software_version: '2.1.0' },
    { id: 's3', site_name: 'Site 3', club_name: 'Club 3', status: 'offline', software_version: '2.1.0' },
  ];

  const mockGroups = [
    { id: 'g1', name: 'Group 1', site_count: 3 },
  ];

  beforeEach(async () => {
    const apiServiceMock = {
      get: jest.fn().mockReturnValue(of([])),
      post: jest.fn().mockReturnValue(of({})),
      delete: jest.fn().mockReturnValue(of({})),
      upload: jest.fn().mockReturnValue(of({})),
    };

    const sitesServiceMock = {
      loadSites: jest.fn().mockReturnValue(of({ sites: mockSites, total: 3, page: 1, totalPages: 1 })),
    };

    const groupsServiceMock = {
      loadGroups: jest.fn().mockReturnValue(of({ groups: mockGroups })),
    };

    const socketServiceMock = {
      on: jest.fn().mockReturnValue(of({})),
    };

    const notificationServiceMock = {
      error: jest.fn(),
      success: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UpdatesManagementComponent, FormsModule],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: GroupsService, useValue: groupsServiceMock },
        { provide: SocketService, useValue: socketServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdatesManagementComponent);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as jest.Mocked<ApiService>;
    sitesService = TestBed.inject(SitesService) as jest.Mocked<SitesService>;
    groupsService = TestBed.inject(GroupsService) as jest.Mocked<GroupsService>;
    socketService = TestBed.inject(SocketService) as jest.Mocked<SocketService>;
    notificationService = TestBed.inject(NotificationService) as jest.Mocked<NotificationService>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should start with updates tab active', () => {
      expect(component.activeTab).toBe('updates');
    });

    it('should load data on init', fakeAsync(() => {
      apiService.get.mockReturnValue(of(mockUpdates));
      fixture.detectChanges();
      tick();

      expect(apiService.get).toHaveBeenCalledWith('/updates');
      expect(apiService.get).toHaveBeenCalledWith('/update-deployments');
      expect(sitesService.loadSites).toHaveBeenCalled();
      expect(groupsService.loadGroups).toHaveBeenCalled();
    }));

    it('should subscribe to socket events', () => {
      fixture.detectChanges();
      expect(socketService.on).toHaveBeenCalledWith('update_progress');
    });

    it('should initialize with modals closed', () => {
      expect(component.showCreateModal).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(component.formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(component.formatFileSize(1500)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(component.formatFileSize(50000000)).toBe('47.7 MB');
    });

    it('should format gigabytes', () => {
      expect(component.formatFileSize(1500000000)).toBe('1.4 GB');
    });
  });

  describe('formatDate', () => {
    it('should return empty string for null', () => {
      expect(component.formatDate(null)).toBe('');
    });

    it('should format date in French locale', () => {
      const date = new Date('2024-01-15T10:30:00');
      const result = component.formatDate(date);
      expect(result).toContain('2024');
    });
  });

  describe('Notes Toggle', () => {
    it('should toggle notes expansion', () => {
      expect(component.isNotesExpanded('u1')).toBe(false);

      component.toggleNotes('u1');
      expect(component.isNotesExpanded('u1')).toBe(true);

      component.toggleNotes('u1');
      expect(component.isNotesExpanded('u1')).toBe(false);
    });
  });

  describe('Create Form', () => {
    it('should not be valid with empty fields', () => {
      component.createForm = {
        version: '',
        description: '',
        release_notes: '',
        file: null,
        is_critical: false,
      };
      expect(component.canCreate()).toBe(false);
    });

    it('should not be valid without file', () => {
      component.createForm = {
        version: '2.0.0',
        description: 'Test',
        release_notes: '',
        file: null,
        is_critical: false,
      };
      expect(component.canCreate()).toBe(false);
    });

    it('should be valid with all required fields', () => {
      component.createForm = {
        version: '2.0.0',
        description: 'Test',
        release_notes: '',
        file: new File([''], 'update.tar.gz'),
        is_critical: false,
      };
      expect(component.canCreate()).toBe(true);
    });
  });

  describe('onUpdateFileSelected', () => {
    it('should set file from event', () => {
      const file = new File([''], 'update.tar.gz');
      const event = { target: { files: [file] } };

      component.onUpdateFileSelected(event);

      expect(component.createForm.file).toEqual(file);
    });
  });

  describe('createUpdate', () => {
    beforeEach(() => {
      component.createForm = {
        version: '2.0.0',
        description: 'Test update',
        release_notes: 'Release notes',
        file: new File([''], 'update.tar.gz'),
        is_critical: true,
      };
      component.showCreateModal = true;
    });

    it('should not call API if form is invalid', () => {
      component.createForm.version = '';

      component.createUpdate();

      expect(apiService.upload).not.toHaveBeenCalled();
    });

    it('should upload update and close modal on success', fakeAsync(() => {
      const mockResponse = { id: 'u3', version: '2.0.0', description: 'Test' };
      apiService.upload.mockReturnValue(of(mockResponse));

      component.createUpdate();
      tick();

      expect(apiService.upload).toHaveBeenCalledWith('/updates', expect.any(FormData));
      expect(component.showCreateModal).toBe(false);
      expect(component.updates[0]).toEqual(mockResponse);
    }));

    it('should show error on failure', fakeAsync(() => {
      apiService.upload.mockReturnValue(throwError(() => ({ error: { error: 'Upload failed' } })));

      component.createUpdate();
      tick();

      expect(notificationService.error).toHaveBeenCalled();
    }));
  });

  describe('deleteUpdate', () => {
    beforeEach(() => {
      component.updates = [...mockUpdates];
    });

    it('should delete update on confirm', fakeAsync(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      apiService.delete.mockReturnValue(of({}));

      component.deleteUpdate(mockUpdates[0]);
      tick();

      expect(apiService.delete).toHaveBeenCalledWith('/updates/u1');
      expect(component.updates).toHaveLength(1);
    }));

    it('should not delete on cancel', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteUpdate(mockUpdates[0]);

      expect(apiService.delete).not.toHaveBeenCalled();
    });
  });

  describe('deployUpdate', () => {
    it('should set update and switch to deploy tab', () => {
      component.deployUpdate(mockUpdates[0]);

      expect(component.deployForm.updateId).toBe('u1');
      expect(component.activeTab).toBe('deploy');
    });
  });

  describe('selectedUpdate', () => {
    beforeEach(() => {
      component.updates = mockUpdates;
    });

    it('should return selected update', () => {
      component.deployForm.updateId = 'u1';
      expect(component.selectedUpdate()?.version).toBe('2.1.0');
    });

    it('should return undefined for no selection', () => {
      component.deployForm.updateId = '';
      expect(component.selectedUpdate()).toBeUndefined();
    });
  });

  describe('canDeploy', () => {
    it('should return false when no update selected', () => {
      component.deployForm = {
        updateId: '',
        targetType: 'site',
        targetId: 's1',
        autoRollback: true,
        scheduleReboot: false,
      };
      expect(component.canDeploy()).toBe(false);
    });

    it('should return false when no target selected', () => {
      component.deployForm = {
        updateId: 'u1',
        targetType: 'site',
        targetId: '',
        autoRollback: true,
        scheduleReboot: false,
      };
      expect(component.canDeploy()).toBe(false);
    });

    it('should return true when all required fields set', () => {
      component.deployForm = {
        updateId: 'u1',
        targetType: 'site',
        targetId: 's1',
        autoRollback: true,
        scheduleReboot: false,
      };
      expect(component.canDeploy()).toBe(true);
    });
  });

  describe('startDeployment', () => {
    beforeEach(() => {
      component.deployForm = {
        updateId: 'u1',
        targetType: 'site',
        targetId: 's1',
        autoRollback: true,
        scheduleReboot: true,
      };
    });

    it('should not deploy if cannot deploy', () => {
      component.deployForm.updateId = '';

      component.startDeployment();

      expect(apiService.post).not.toHaveBeenCalled();
    });

    it('should create deployment and switch to history', fakeAsync(() => {
      const mockDeployment = { id: 'd2', status: 'pending' };
      apiService.post.mockReturnValue(of(mockDeployment));

      component.startDeployment();
      tick();

      expect(apiService.post).toHaveBeenCalledWith('/update-deployments', {
        update_id: 'u1',
        target_type: 'site',
        target_id: 's1',
        auto_rollback: true,
        schedule_reboot: true,
      });
      expect(component.deployments[0]).toEqual(mockDeployment);
      expect(component.activeTab).toBe('history');
      expect(notificationService.success).toHaveBeenCalled();
    }));

    it('should show error on failure', fakeAsync(() => {
      apiService.post.mockReturnValue(throwError(() => ({ error: { error: 'Deployment failed' } })));

      component.startDeployment();
      tick();

      expect(notificationService.error).toHaveBeenCalled();
    }));
  });

  describe('getDeploymentStatusBadge', () => {
    it('should return correct badge classes', () => {
      expect(component.getDeploymentStatusBadge('pending')).toBe('secondary');
      expect(component.getDeploymentStatusBadge('in_progress')).toBe('primary');
      expect(component.getDeploymentStatusBadge('completed')).toBe('success');
      expect(component.getDeploymentStatusBadge('failed')).toBe('danger');
    });

    it('should return secondary for unknown status', () => {
      expect(component.getDeploymentStatusBadge('unknown')).toBe('secondary');
    });
  });

  describe('getDeploymentStatusLabel', () => {
    it('should return French labels', () => {
      expect(component.getDeploymentStatusLabel('pending')).toBe('En attente');
      expect(component.getDeploymentStatusLabel('in_progress')).toBe('En cours');
      expect(component.getDeploymentStatusLabel('completed')).toBe('Terminé');
      expect(component.getDeploymentStatusLabel('failed')).toBe('Échoué');
    });

    it('should return status as-is for unknown', () => {
      expect(component.getDeploymentStatusLabel('other')).toBe('other');
    });
  });

  describe('getVersionDistribution', () => {
    beforeEach(() => {
      component.sites = mockSites as any;
    });

    it('should calculate version distribution', () => {
      const distribution = component.getVersionDistribution();

      expect(distribution).toHaveLength(2);
      expect(distribution[0].version).toBe('2.1.0');
      expect(distribution[0].count).toBe(2);
      expect(distribution[1].version).toBe('2.0.0');
      expect(distribution[1].count).toBe(1);
    });

    it('should calculate percentages correctly', () => {
      const distribution = component.getVersionDistribution();

      const v21 = distribution.find(d => d.version === '2.1.0');
      expect(v21?.percentage).toBeCloseTo(66.67, 1);
    });

    it('should return empty array when no sites', () => {
      component.sites = [];
      const distribution = component.getVersionDistribution();
      expect(distribution).toHaveLength(0);
    });
  });
});
