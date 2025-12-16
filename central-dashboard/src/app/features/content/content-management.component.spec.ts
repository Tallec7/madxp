import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ContentManagementComponent } from './content-management.component';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';

describe('ContentManagementComponent', () => {
  let component: ContentManagementComponent;
  let fixture: ComponentFixture<ContentManagementComponent>;
  let apiService: jest.Mocked<ApiService>;
  let sitesService: jest.Mocked<SitesService>;
  let groupsService: jest.Mocked<GroupsService>;
  let socketService: jest.Mocked<SocketService>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockVideos = [
    {
      id: '1',
      title: 'Video Test',
      filename: 'video.mp4',
      file_size: 1024000,
      duration: 120,
      created_at: new Date(),
    },
    {
      id: '2',
      title: 'Another Video',
      filename: 'another.mp4',
      file_size: 2048000,
      created_at: new Date(),
    },
  ];

  const mockDeployments = [
    {
      id: 'd1',
      video_id: '1',
      video_title: 'Video Test',
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
    { id: 's1', site_name: 'Site 1', club_name: 'Club 1', status: 'online' },
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
      loadSites: jest.fn().mockReturnValue(of({ sites: mockSites, total: 1, page: 1, totalPages: 1 })),
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
      warning: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ContentManagementComponent, FormsModule],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: SitesService, useValue: sitesServiceMock },
        { provide: GroupsService, useValue: groupsServiceMock },
        { provide: SocketService, useValue: socketServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContentManagementComponent);
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
    it('should start with videos tab active', () => {
      expect(component.activeTab).toBe('videos');
    });

    it('should load data on init', fakeAsync(() => {
      apiService.get.mockReturnValue(of(mockVideos));
      fixture.detectChanges();
      tick();

      expect(apiService.get).toHaveBeenCalledWith('/videos');
      expect(apiService.get).toHaveBeenCalledWith('/deployments');
      expect(sitesService.loadSites).toHaveBeenCalled();
      expect(groupsService.loadGroups).toHaveBeenCalled();
    }));

    it('should subscribe to socket events', () => {
      fixture.detectChanges();
      expect(socketService.on).toHaveBeenCalledWith('deploy_progress');
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
      expect(component.formatFileSize(1500000)).toBe('1.4 MB');
    });

    it('should format gigabytes', () => {
      expect(component.formatFileSize(1500000000)).toBe('1.4 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to mm:ss', () => {
      expect(component.formatDuration(90)).toBe('1:30');
    });

    it('should pad single digit seconds', () => {
      expect(component.formatDuration(65)).toBe('1:05');
    });

    it('should handle zero minutes', () => {
      expect(component.formatDuration(45)).toBe('0:45');
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

  describe('filteredVideos', () => {
    beforeEach(() => {
      component.videos = mockVideos;
    });

    it('should return all videos when no search', () => {
      component.videoSearch = '';
      expect(component.filteredVideos()).toHaveLength(2);
    });

    it('should filter by title', () => {
      component.videoSearch = 'Test';
      expect(component.filteredVideos()).toHaveLength(1);
      expect(component.filteredVideos()[0].title).toBe('Video Test');
    });

    it('should filter by filename', () => {
      component.videoSearch = 'another';
      expect(component.filteredVideos()).toHaveLength(1);
    });

    it('should be case insensitive', () => {
      component.videoSearch = 'VIDEO';
      expect(component.filteredVideos()).toHaveLength(2);
    });
  });

  describe('Upload Modal', () => {
    it('should open upload modal', () => {
      component.showUploadModal = true;
      expect(component.showUploadModal).toBe(true);
    });

    it('should close upload modal and reset form', () => {
      component.showUploadModal = true;
      component.uploadForm.files = [new File([''], 'test.mp4')];

      component.closeUploadModal();

      expect(component.showUploadModal).toBe(false);
      expect(component.uploadForm.files).toHaveLength(0);
    });

    it('should not close modal while uploading', () => {
      component.showUploadModal = true;
      component.isUploading = true;

      component.closeUploadModal();

      expect(component.showUploadModal).toBe(true);
    });
  });

  describe('canUpload', () => {
    it('should return false when no files selected', () => {
      component.uploadForm.files = [];
      expect(component.canUpload()).toBe(false);
    });

    it('should return true when files selected', () => {
      component.uploadForm.files = [new File([''], 'test.mp4')];
      expect(component.canUpload()).toBe(true);
    });
  });

  describe('File Selection', () => {
    it('should add files to selection', () => {
      const files = [
        new File([''], 'video1.mp4', { type: 'video/mp4' }),
        new File([''], 'video2.mp4', { type: 'video/mp4' }),
      ];

      component.addFilesToSelection(files);

      expect(component.uploadForm.files).toHaveLength(2);
    });

    it('should limit to 20 files', () => {
      const files = Array.from({ length: 25 }, (_, i) =>
        new File([''], `video${i}.mp4`, { type: 'video/mp4' })
      );

      component.addFilesToSelection(files);

      expect(component.uploadForm.files).toHaveLength(20);
      expect(notificationService.warning).toHaveBeenCalled();
    });

    it('should remove file from selection', () => {
      component.uploadForm.files = [
        new File([''], 'video1.mp4'),
        new File([''], 'video2.mp4'),
      ];

      component.removeFile(0);

      expect(component.uploadForm.files).toHaveLength(1);
      expect(component.uploadForm.files[0].name).toBe('video2.mp4');
    });

    it('should clear all selected files', () => {
      component.uploadForm.files = [new File([''], 'video1.mp4')];

      component.clearSelectedFiles();

      expect(component.uploadForm.files).toHaveLength(0);
    });
  });

  describe('Drag and Drop', () => {
    it('should set isDragOver on drag over', () => {
      const event = { preventDefault: jest.fn(), stopPropagation: jest.fn() } as unknown as DragEvent;

      component.onDragOver(event);

      expect(component.isDragOver).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should unset isDragOver on drag leave', () => {
      component.isDragOver = true;
      const event = { preventDefault: jest.fn(), stopPropagation: jest.fn() } as unknown as DragEvent;

      component.onDragLeave(event);

      expect(component.isDragOver).toBe(false);
    });
  });

  describe('deleteVideo', () => {
    beforeEach(() => {
      component.videos = [...mockVideos];
    });

    it('should delete video on confirm', fakeAsync(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      apiService.delete.mockReturnValue(of({}));

      component.deleteVideo(mockVideos[0]);
      tick();

      expect(apiService.delete).toHaveBeenCalledWith('/videos/1');
      expect(component.videos).toHaveLength(1);
    }));

    it('should not delete video on cancel', () => {
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteVideo(mockVideos[0]);

      expect(apiService.delete).not.toHaveBeenCalled();
    });

    it('should show error on failure', fakeAsync(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      apiService.delete.mockReturnValue(throwError(() => ({ error: { error: 'Delete failed' } })));

      component.deleteVideo(mockVideos[0]);
      tick();

      expect(notificationService.error).toHaveBeenCalled();
    }));
  });

  describe('Deploy Form', () => {
    it('should add video to deploy selection', () => {
      component.videos = mockVideos;
      component.deployForm.videoIds = [];

      component.deployVideo(mockVideos[0]);

      expect(component.deployForm.videoIds).toContain('1');
      expect(component.activeTab).toBe('deploy');
    });

    it('should not duplicate video in selection', () => {
      component.videos = mockVideos;
      component.deployForm.videoIds = ['1'];

      component.deployVideo(mockVideos[0]);

      expect(component.deployForm.videoIds).toHaveLength(1);
    });

    it('should get video title by id', () => {
      component.videos = mockVideos;
      expect(component.getVideoTitleById('1')).toBe('Video Test');
    });

    it('should return unknown for missing video', () => {
      component.videos = mockVideos;
      expect(component.getVideoTitleById('999')).toBe('Vidéo inconnue');
    });

    it('should remove video from selection', () => {
      component.deployForm.videoIds = ['1', '2'];

      component.removeSelectedVideo('1');

      expect(component.deployForm.videoIds).toEqual(['2']);
    });

    it('should clear all selected videos', () => {
      component.deployForm.videoIds = ['1', '2'];

      component.clearSelectedVideos();

      expect(component.deployForm.videoIds).toHaveLength(0);
    });
  });

  describe('canDeploy', () => {
    it('should return false when no videos selected', () => {
      component.deployForm.videoIds = [];
      component.deployForm.targetType = 'site';
      component.deployForm.targetId = 's1';
      expect(component.canDeploy()).toBe(false);
    });

    it('should return false when no target selected', () => {
      component.deployForm.videoIds = ['1'];
      component.deployForm.targetType = 'site';
      component.deployForm.targetId = '';
      expect(component.canDeploy()).toBe(false);
    });

    it('should return true when video and target selected', () => {
      component.deployForm.videoIds = ['1'];
      component.deployForm.targetType = 'site';
      component.deployForm.targetId = 's1';
      expect(component.canDeploy()).toBe(true);
    });
  });

  describe('getDeploymentStatusBadge', () => {
    it('should return secondary for pending', () => {
      expect(component.getDeploymentStatusBadge('pending')).toBe('secondary');
    });

    it('should return primary for in_progress', () => {
      expect(component.getDeploymentStatusBadge('in_progress')).toBe('primary');
    });

    it('should return success for completed', () => {
      expect(component.getDeploymentStatusBadge('completed')).toBe('success');
    });

    it('should return danger for failed', () => {
      expect(component.getDeploymentStatusBadge('failed')).toBe('danger');
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
      expect(component.getDeploymentStatusLabel('unknown')).toBe('unknown');
    });
  });

  describe('Video History Modal', () => {
    it('should open history modal', fakeAsync(() => {
      const mockHistory = {
        video_id: '1',
        stats: { total: 5, completed: 3, failed: 1, pending: 1, in_progress: 0 },
        deployments: [],
      };
      apiService.get.mockReturnValue(of(mockHistory));

      component.showVideoHistory(mockVideos[0]);
      tick();

      expect(component.showHistoryModal).toBe(true);
      expect(component.selectedVideoForHistory).toEqual(mockVideos[0]);
      expect(apiService.get).toHaveBeenCalledWith('/videos/1/deployments');
    }));

    it('should close history modal', () => {
      component.showHistoryModal = true;
      component.selectedVideoForHistory = mockVideos[0];

      component.closeHistoryModal();

      expect(component.showHistoryModal).toBe(false);
      expect(component.selectedVideoForHistory).toBeNull();
    });
  });
});
