import { Injectable, inject } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiService, UploadProgress } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { Site, Group } from '../../core/models';

export interface SoftwareUpdate {
  id: string;
  version: string;
  description: string;
  release_notes: string;
  file_size: number;
  created_at: Date;
  is_critical: boolean;
}

export interface OtaStep {
  name: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  durationMs: number;
  detail?: string;
}

export interface UpdateDeployment {
  id: string;
  update_id: string;
  update_version?: string;
  target_type: 'site' | 'group';
  target_id: string;
  target_name?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  deployed_count?: number;
  total_count?: number;
  error_message?: string | null;
  started_at?: Date;
  created_at: Date;
  completed_at?: Date;
  deployment_details?: OtaStep[] | null;
}

@Injectable({ providedIn: 'root' })
export class UpdatesManagementDataService {
  private readonly apiService = inject(ApiService);
  private readonly sitesService = inject(SitesService);
  private readonly groupsService = inject(GroupsService);
  private readonly socketService = inject(SocketService);

  // ── Data loading ──────────────────────────────────────────────────────────

  loadUpdates(): Observable<SoftwareUpdate[]> {
    return this.apiService.get<SoftwareUpdate[]>('/updates');
  }

  loadDeployments(): Observable<UpdateDeployment[]> {
    return this.apiService.get<UpdateDeployment[]>('/update-deployments');
  }

  loadSites(): Observable<{ sites: Site[] }> {
    return this.sitesService.loadSites();
  }

  loadGroups(): Observable<{ groups: Group[] }> {
    return this.groupsService.loadGroups();
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  createUpdate(formData: FormData): Observable<UploadProgress> {
    return this.apiService.uploadWithProgress<SoftwareUpdate>('/updates', formData, {
      maxRetries: 3,
      retryDelayMs: 3000,
    });
  }

  deleteUpdate(updateId: string): Observable<unknown> {
    return this.apiService.delete(`/updates/${updateId}`);
  }

  startDeployment(data: {
    update_id: string;
    target_type: string;
    target_id: string;
    auto_rollback: boolean;
    schedule_reboot: boolean;
  }): Observable<UpdateDeployment> {
    return this.apiService.post<UpdateDeployment>('/update-deployments', data);
  }

  retryDeployment(deploymentId: string): Observable<unknown> {
    return this.apiService.post(`/update-deployments/${deploymentId}/retry`, {});
  }

  cancelDeployment(deploymentId: string): Observable<unknown> {
    return this.apiService.put(`/update-deployments/${deploymentId}`, {
      status: 'failed',
      error_message: 'Annulé',
    });
  }

  // ── Socket subscription ───────────────────────────────────────────────────

  subscribeToDeploymentProgress(
    onProgress: (data: {
      deploymentId: string;
      progress: number;
      deployedCount: number;
      status: UpdateDeployment['status'];
      error?: string;
      steps?: OtaStep[];
    }) => void,
  ): Subscription {
    return this.socketService.on('update_progress').subscribe(event => {
      onProgress(event as Parameters<typeof onProgress>[0]);
    });
  }

  // ── Formatting helpers ────────────────────────────────────────────────────

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStepIcon(status: string): string {
    switch (status) {
      case 'ok': return '\u2705';
      case 'warn': return '\u26A0\uFE0F';
      case 'fail': return '\u274C';
      case 'skip': return '\u23ED\uFE0F';
      default: return '\u2753';
    }
  }

  formatStepDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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

  getDeploymentDuration(deployment: UpdateDeployment): string {
    if (!deployment.started_at || !deployment.completed_at) return '';
    const start = new Date(deployment.started_at).getTime();
    const end = new Date(deployment.completed_at).getTime();
    const diffMs = end - start;
    if (diffMs < 0) return '';
    return this.formatDurationMs(diffMs);
  }

  getDeploymentElapsed(deployment: UpdateDeployment): string {
    const start = deployment.started_at || deployment.created_at;
    if (!start) return '';
    const diffMs = Date.now() - new Date(start).getTime();
    if (diffMs < 0) return '';
    return this.formatDurationMs(diffMs);
  }

  getVersionDistribution(sites: Site[]): { version: string; count: number; percentage: number }[] {
    const versionMap = new Map<string, number>();
    sites.forEach(site => {
      const version = site.software_version || 'unknown';
      versionMap.set(version, (versionMap.get(version) || 0) + 1);
    });

    const total = sites.length;
    return Array.from(versionMap.entries())
      .map(([version, count]) => ({
        version,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private formatDurationMs(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return remainingSeconds > 0 ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  }
}
