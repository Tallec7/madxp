import { Injectable, inject } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { Site } from '../../core/models';
import {
  ContentManagementDataService,
  Deployment,
  VideoName,
} from './content-management-data.service';

@Injectable({ providedIn: 'root' })
export class ContentDeploymentService {
  private readonly dataService = inject(ContentManagementDataService);
  private readonly notificationService = inject(NotificationService);

  deployForm = {
    videoIds: [] as string[],
    targetType: 'site' as 'site' | 'group',
    targetId: ''
  };
  isDeploying = false;

  canDeploy(): boolean {
    return this.deployForm.videoIds.length > 0 && !!(this.deployForm.targetType && this.deployForm.targetId);
  }

  addVideoToDeploy(videoId: string): void {
    if (!this.deployForm.videoIds.includes(videoId)) {
      this.deployForm.videoIds = [...this.deployForm.videoIds, videoId];
    }
  }

  getVideoTitleById(videoId: string, allVideos: VideoName[]): string {
    return allVideos.find(v => v.id === videoId)?.title || 'Vidéo inconnue';
  }

  removeSelectedVideo(videoId: string): void {
    this.deployForm.videoIds = this.deployForm.videoIds.filter(id => id !== videoId);
  }

  clearSelectedVideos(): void {
    this.deployForm.videoIds = [];
  }

  subscribeToDeploymentProgress(deployments: Deployment[]): Subscription {
    return this.dataService.subscribeToDeploymentProgress().subscribe(data => {
      const deployment = deployments.find(d => d.id === data.deploymentId);
      if (deployment) {
        deployment.progress = data.progress;
        deployment.status = data.status;
      }
    });
  }

  async startDeployment(
    allVideos: VideoName[],
    deployments: Deployment[],
    sites: Site[] = []
  ): Promise<{ successes: string[]; switchToHistory: boolean }> {
    if (!this.canDeploy() || this.isDeploying) {
      return { successes: [], switchToHistory: false };
    }

    const { videoIds, targetId, targetType } = this.deployForm;

    // Les sites SaaS n'utilisent pas de déploiement vidéo (la config se met
    // à jour côté profil par défaut, cf. ADR-037). Sans ce guard, le bulk
    // deploy poste N requêtes /deployments → cascade 429 (sensitiveRateLimit
    // = 30/min). Defense-in-depth : le serveur rejette aussi en 400.
    if (targetType === 'site' && targetId) {
      const target = sites.find(s => s.id === targetId);
      if (target?.site_type === 'saas') {
        this.notificationService.warning(
          'Les sites SaaS n\'utilisent pas de déploiement vidéo. Mettez à jour leur configuration depuis la page du site.'
        );
        return { successes: [], switchToHistory: false };
      }
    }

    this.isDeploying = true;
    const successes: string[] = [];
    const failures: Array<{ title: string; error: string }> = [];

    for (const videoId of videoIds) {
      const videoTitle = this.getVideoTitleById(videoId, allVideos);

      try {
        const deployment = await firstValueFrom(this.dataService.createDeployment(videoId, targetType, targetId));
        deployments.unshift({ ...deployment, video_title: videoTitle });
        successes.push(videoTitle);
      } catch (error) {
        const message = this.dataService.getErrorMessage(error);
        failures.push({ title: videoTitle, error: message });
      }
    }

    this.isDeploying = false;
    this.deployForm = { videoIds: [], targetType: 'site', targetId: '' };

    if (successes.length > 0) {
      const label = successes.length === 1 ? successes[0] : `${successes.length} videos`;
      this.notificationService.success(`Deploiement lance pour ${label}`);
    }

    if (failures.length > 0) {
      const names = failures.map(f => f.title).join(', ');
      this.notificationService.error(`Erreur lors du deploiement pour ${names}`);
    }

    return { successes, switchToHistory: successes.length > 0 };
  }
}
