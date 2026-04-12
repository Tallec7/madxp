import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { UploadProgress } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site, Group } from '../../core/models';
import { Subscription } from 'rxjs';
import {
  UpdatesManagementDataService,
  SoftwareUpdate,
  UpdateDeployment,
} from './updates-management.data.service';

@Component({
  selector: 'app-updates-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './updates-management.component.html',
  styleUrl: './updates-management.component.scss'
})
export class UpdatesManagementComponent implements OnInit, OnDestroy {
  activeTab: 'updates' | 'deploy' | 'history' | 'versions' = 'updates';

  updates: SoftwareUpdate[] = [];
  deployments: UpdateDeployment[] = [];
  sites: Site[] = [];
  groups: Group[] = [];

  get deployableSites(): Site[] {
    return this.sites.filter(s => s.site_type !== 'saas');
  }

  showCreateModal = false;
  expandedNotes = new Set<string>();
  expandedDeploymentId: string | null = null;

  createForm = {
    version: '',
    description: '',
    release_notes: '',
    file: null as File | null,
    is_critical: false
  };

  // Upload progress state
  uploadProgress: UploadProgress | null = null;
  isUploading = false;

  deployForm = {
    updateId: '',
    targetType: 'site' as 'site' | 'group',
    targetId: '',
    autoRollback: true,
    scheduleReboot: false
  };

  private readonly dataService = inject(UpdatesManagementDataService);
  private readonly notificationService = inject(NotificationService);
  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadUpdates();
    this.loadDeployments();
    this.loadSites();
    this.loadGroups();
    this.subscribeToDeploymentProgress();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadUpdates(): void {
    this.dataService.loadUpdates().subscribe({
      next: (updates) => { this.updates = updates; },
      error: () => {},
    });
  }

  loadDeployments(): void {
    this.dataService.loadDeployments().subscribe({
      next: (deployments) => { this.deployments = deployments; },
      error: () => {},
    });
  }

  loadSites(): void {
    this.dataService.loadSites().subscribe({
      next: (response) => { this.sites = response.sites; },
    });
  }

  loadGroups(): void {
    this.dataService.loadGroups().subscribe({
      next: (response) => { this.groups = response.groups; },
    });
  }

  subscribeToDeploymentProgress(): void {
    const sub = this.dataService.subscribeToDeploymentProgress((data) => {
      const deployment = this.deployments.find(d => d.id === data.deploymentId);
      if (deployment) {
        deployment.progress = data.progress;
        deployment.deployed_count = data.deployedCount;
        deployment.status = data.status;
        if (data.error) deployment.error_message = data.error;
        if (data.steps?.length) deployment.deployment_details = data.steps;
      }
    });
    this.subscriptions.add(sub);
  }

  formatFileSize(bytes: number): string {
    return this.dataService.formatFileSize(bytes);
  }

  formatDate(date: Date | null): string {
    return this.dataService.formatDate(date);
  }

  toggleDeploymentDetails(deploymentId: string): void {
    this.expandedDeploymentId = this.expandedDeploymentId === deploymentId ? null : deploymentId;
  }

  getStepIcon(status: string): string {
    return this.dataService.getStepIcon(status);
  }

  formatStepDuration(ms: number): string {
    return this.dataService.formatStepDuration(ms);
  }

  toggleNotes(updateId: string): void {
    if (this.expandedNotes.has(updateId)) {
      this.expandedNotes.delete(updateId);
    } else {
      this.expandedNotes.add(updateId);
    }
  }

  isNotesExpanded(updateId: string): boolean {
    return this.expandedNotes.has(updateId);
  }

  onUpdateFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.createForm.file = file;
    }
  }

  canCreate(): boolean {
    return !!(this.createForm.version && this.createForm.description && this.createForm.file) && !this.isUploading;
  }

  createUpdate(): void {
    if (!this.canCreate()) return;

    const formData = new FormData();
    formData.append('version', this.createForm.version);
    formData.append('description', this.createForm.description);
    formData.append('release_notes', this.createForm.release_notes);
    formData.append('is_critical', String(this.createForm.is_critical));
    formData.append('package', this.createForm.file!);

    this.isUploading = true;
    this.uploadProgress = { status: 'uploading', progress: 0 };

    this.dataService.createUpdate(formData).subscribe({
      next: (progress) => {
        this.uploadProgress = progress;
        if (progress.status === 'complete' && progress.response) {
          const update = progress.response as SoftwareUpdate;
          this.updates.unshift(update);
          this.notificationService.success(`Version ${update.version} créée avec succès !`);
          this.resetCreateForm();
        }
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadProgress = {
          status: 'error',
          progress: 0,
          error: error.error?.error || error.message || 'Échec de l\'upload après plusieurs tentatives'
        };
        this.notificationService.error('Erreur lors de la création: ' + (error.error?.error || error.message));
      }
    });
  }

  resetCreateForm(): void {
    this.showCreateModal = false;
    this.isUploading = false;
    this.uploadProgress = null;
    this.createForm = { version: '', description: '', release_notes: '', file: null, is_critical: false };
  }

  cancelUpload(): void {
    this.resetCreateForm();
  }

  deleteUpdate(update: SoftwareUpdate): void {
    if (confirm(`Supprimer la version ${update.version} ?`)) {
      this.dataService.deleteUpdate(update.id).subscribe({
        next: () => {
          this.updates = this.updates.filter(u => u.id !== update.id);
        },
        error: (error) => {
          this.notificationService.error('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  deployUpdate(update: SoftwareUpdate): void {
    this.deployForm.updateId = update.id;
    this.activeTab = 'deploy';
  }

  selectedUpdate(): SoftwareUpdate | undefined {
    return this.updates.find(u => u.id === this.deployForm.updateId);
  }

  canDeploy(): boolean {
    return !!(this.deployForm.updateId && this.deployForm.targetType && this.deployForm.targetId);
  }

  startDeployment(): void {
    if (!this.canDeploy()) return;

    const data = {
      update_id: this.deployForm.updateId,
      target_type: this.deployForm.targetType,
      target_id: this.deployForm.targetId,
      auto_rollback: this.deployForm.autoRollback,
      schedule_reboot: this.deployForm.scheduleReboot
    };

    this.dataService.startDeployment(data).subscribe({
      next: (deployment) => {
        this.deployments.unshift(deployment);
        this.activeTab = 'history';
        this.deployForm = {
          updateId: '',
          targetType: 'site',
          targetId: '',
          autoRollback: true,
          scheduleReboot: false
        };
        this.notificationService.success('Déploiement lancé avec succès !');
      },
      error: (error) => {
        this.notificationService.error('Erreur lors du déploiement: ' + (error.error?.error || error.message));
      }
    });
  }

  retryDeployment(deployment: UpdateDeployment): void {
    this.dataService.retryDeployment(deployment.id).subscribe({
      next: () => {
        deployment.status = 'pending';
        deployment.progress = 0;
        deployment.error_message = null;
        this.notificationService.success('Déploiement relancé');
      },
      error: (error) => {
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  cancelDeployment(deployment: UpdateDeployment): void {
    if (!confirm('Annuler ce déploiement ?')) return;
    this.dataService.cancelDeployment(deployment.id).subscribe({
      next: () => {
        deployment.status = 'failed';
        deployment.error_message = 'Annulé';
        this.notificationService.success('Déploiement annulé');
      },
      error: (error) => {
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  getDeploymentStatusBadge(status: string): string {
    return this.dataService.getDeploymentStatusBadge(status);
  }

  getDeploymentStatusLabel(status: string): string {
    return this.dataService.getDeploymentStatusLabel(status);
  }

  getDeploymentDuration(deployment: UpdateDeployment): string {
    return this.dataService.getDeploymentDuration(deployment);
  }

  getDeploymentElapsed(deployment: UpdateDeployment): string {
    return this.dataService.getDeploymentElapsed(deployment);
  }

  getVersionDistribution(): { version: string; count: number; percentage: number }[] {
    return this.dataService.getVersionDistribution(this.sites);
  }
}
