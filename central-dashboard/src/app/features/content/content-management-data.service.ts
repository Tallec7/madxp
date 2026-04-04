import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { Site, Group } from '../../core/models';

// ── Data models ──

export interface Video {
  id: string;
  title: string;
  filename: string;
  file_size: number;
  duration?: number;
  created_at: Date;
  url?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Deployment {
  id: string;
  video_id: string;
  video_title?: string;
  target_type: 'site' | 'group';
  target_id: string;
  target_name?: string;
  club_name?: string;
  deployed_by_name?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  deployed_count: number;
  total_count: number;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  error?: string;
  has_secondary_variant?: boolean;
}

export interface VideoDeploymentHistory {
  video_id: string;
  stats: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    in_progress: number;
  };
  deployments: Deployment[];
}

export interface VideoName {
  id: string;
  title: string;
  file_size: number;
}

export interface BulkUploadResponse {
  success: boolean;
  message: string;
  files?: Array<{ id: string; name: string; title: string; size: number; success: true }>;
  errors?: Array<{ name: string; error: string }>;
}

export interface ImageToVideoResponse {
  success: boolean;
  message: string;
  video?: Video;
}

export interface DeployProgressEvent {
  deploymentId: string;
  progress: number;
  deployedCount: number;
  status: Deployment['status'];
}

// ── Service ──

@Injectable({ providedIn: 'root' })
export class ContentManagementDataService {
  private readonly api = inject(ApiService);
  private readonly sitesService = inject(SitesService);
  private readonly groupsService = inject(GroupsService);
  private readonly socketService = inject(SocketService);
  private readonly logger = inject(LoggerService);

  // ── Video CRUD ──

  loadVideos(page: number, limit: number, search: string): Observable<{ data: Video[]; pagination: PaginationInfo }> {
    const params: Record<string, string> = {
      page: page.toString(),
      limit: limit.toString(),
    };
    if (search) {
      params['search'] = search;
    }
    const query = new URLSearchParams(params).toString();
    return this.api.get<{ data: Video[]; pagination: PaginationInfo }>(`/videos?${query}`);
  }

  loadAllVideoNames(): Observable<VideoName[]> {
    return this.api.get<VideoName[]>('/videos/names');
  }

  deleteVideo(videoId: string): Observable<void> {
    return this.api.delete<void>(`/videos/${videoId}`);
  }

  uploadVideo(formData: FormData): Observable<Video> {
    return this.api.upload<Video>('/videos', formData);
  }

  uploadVideoBulk(formData: FormData): Observable<BulkUploadResponse> {
    return this.api.upload<BulkUploadResponse>('/videos/bulk', formData);
  }

  // ── Deployment operations ──

  loadDeployments(): Observable<Deployment[]> {
    return this.api.get<Deployment[]>('/deployments');
  }

  createDeployment(videoId: string, targetType: 'site' | 'group', targetId: string): Observable<Deployment> {
    return this.api.post<Deployment>('/deployments', {
      video_id: videoId,
      target_type: targetType,
      target_id: targetId,
    });
  }

  subscribeToDeploymentProgress(): Observable<DeployProgressEvent> {
    return this.socketService.on<DeployProgressEvent>('deploy_progress');
  }

  // ── Reference data ──

  loadSites(): Observable<Site[]> {
    return this.sitesService.loadSites().pipe(map(response => response.sites));
  }

  loadGroups(): Observable<Group[]> {
    return this.groupsService.loadGroups().pipe(map(response => response.groups));
  }

  // ── Video history ──

  loadVideoHistory(videoId: string): Observable<VideoDeploymentHistory> {
    return this.api.get<VideoDeploymentHistory>(`/videos/${videoId}/deployments`);
  }

  // ── Image conversion ──

  convertImageToVideo(formData: FormData): Observable<ImageToVideoResponse> {
    return this.api.upload<ImageToVideoResponse>('/image-to-video', formData);
  }

  // ── Formatting helpers ──

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getDeploymentStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      pending: 'secondary',
      in_progress: 'primary',
      completed: 'success',
      failed: 'danger',
    };
    return badges[status] || 'secondary';
  }

  getDeploymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé',
      failed: 'Échoué',
    };
    return labels[status] || status;
  }

  // ── Error helpers (expose for component use) ──

  getErrorMessage(error: unknown): string {
    return ErrorExtractor.getMessage(error);
  }

  getCorrelationId(error: unknown): string | undefined {
    return ErrorExtractor.getCorrelationId(error);
  }
}
