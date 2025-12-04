import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { Site, Group } from '../../core/models';
import { Subscription } from 'rxjs';

interface Video {
  id: string;
  title: string;
  filename: string;
  file_size: number;
  duration?: number;
  created_at: Date;
}

interface Deployment {
  id: string;
  video_id: string;
  video_title?: string;
  target_type: 'site' | 'group';
  target_id: string;
  target_name?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  deployed_count: number;
  total_count: number;
  created_at: Date;
  completed_at?: Date;
}

@Component({
  selector: 'app-content-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h1>Gestion du contenu</h1>

      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'videos'"
          (click)="activeTab = 'videos'"
        >
          📹 Vidéos ({{ videos.length }})
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'deploy'"
          (click)="activeTab = 'deploy'"
        >
          🚀 Déployer
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'history'"
          (click)="activeTab = 'history'"
        >
          📊 Historique ({{ deployments.length }})
        </button>
      </div>

      <!-- Videos Tab -->
      <div class="tab-content" *ngIf="activeTab === 'videos'">
        <div class="content-header">
          <div class="search-bar">
            <input
              type="text"
              placeholder="Rechercher une vidéo..."
              [(ngModel)]="videoSearch"
              class="search-input"
            />
          </div>
          <button class="btn btn-primary" (click)="showUploadModal = true">
            + Ajouter une vidéo
          </button>
        </div>

        <div class="videos-grid" *ngIf="filteredVideos().length > 0 else noVideos">
          <div class="video-card card" *ngFor="let video of filteredVideos()">
            <div class="video-thumbnail">
              <span class="video-icon">🎬</span>
            </div>
            <div class="video-info">
              <h3>{{ video.title }}</h3>
              <div class="video-meta">
                <span>{{ formatFileSize(video.file_size) }}</span>
                <span class="separator">•</span>
                <span *ngIf="video.duration">{{ formatDuration(video.duration) }}</span>
                <span class="separator" *ngIf="video.duration">•</span>
                <span>{{ formatDate(video.created_at) }}</span>
              </div>
              <div class="video-filename">{{ video.filename }}</div>
            </div>
            <div class="video-actions">
              <button class="btn btn-sm btn-primary" (click)="deployVideo(video)">
                🚀 Déployer
              </button>
              <button class="btn-icon btn-danger" (click)="deleteVideo(video)" title="Supprimer">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <ng-template #noVideos>
          <div class="empty-state card">
            <div class="empty-icon">📹</div>
            <h3>Aucune vidéo</h3>
            <p>Commencez par ajouter votre première vidéo pour la déployer sur vos sites.</p>
            <button class="btn btn-primary" (click)="showUploadModal = true">
              + Ajouter une vidéo
            </button>
          </div>
        </ng-template>
      </div>

      <!-- Deploy Tab -->
      <div class="tab-content" *ngIf="activeTab === 'deploy'">
        <div class="deploy-wizard card">
          <h2>Déployer du contenu</h2>

          <div class="wizard-step">
            <div class="step-header">
              <span class="step-number">1</span>
              <h3>Sélectionner une vidéo</h3>
            </div>
            <select [(ngModel)]="deployForm.videoId" class="form-select">
              <option value="">-- Choisir une vidéo --</option>
              <option *ngFor="let video of videos" [value]="video.id">
                {{ video.title }} ({{ formatFileSize(video.file_size) }})
              </option>
            </select>
          </div>

          <div class="wizard-step">
            <div class="step-header">
              <span class="step-number">2</span>
              <h3>Choisir la cible</h3>
            </div>
            <div class="target-type-selector">
              <label class="radio-card">
                <input
                  type="radio"
                  name="targetType"
                  value="site"
                  [(ngModel)]="deployForm.targetType"
                />
                <div class="radio-content">
                  <span class="radio-icon">🖥️</span>
                  <div>
                    <div class="radio-title">Site individuel</div>
                    <div class="radio-desc">Déployer vers un site spécifique</div>
                  </div>
                </div>
              </label>
              <label class="radio-card">
                <input
                  type="radio"
                  name="targetType"
                  value="group"
                  [(ngModel)]="deployForm.targetType"
                />
                <div class="radio-content">
                  <span class="radio-icon">👥</span>
                  <div>
                    <div class="radio-title">Groupe de sites</div>
                    <div class="radio-desc">Déployer vers plusieurs sites</div>
                  </div>
                </div>
              </label>
            </div>

            <select
              *ngIf="deployForm.targetType === 'site'"
              [(ngModel)]="deployForm.targetId"
              class="form-select"
            >
              <option value="">-- Choisir un site --</option>
              <option *ngFor="let site of sites" [value]="site.id">
                {{ site.club_name }} - {{ site.site_name }}
              </option>
            </select>

            <select
              *ngIf="deployForm.targetType === 'group'"
              [(ngModel)]="deployForm.targetId"
              class="form-select"
            >
              <option value="">-- Choisir un groupe --</option>
              <option *ngFor="let group of groups" [value]="group.id">
                {{ group.name }} ({{ group.site_count }} sites)
              </option>
            </select>
          </div>

          <div class="wizard-actions">
            <button
              class="btn btn-primary btn-lg"
              (click)="startDeployment()"
              [disabled]="!canDeploy()"
            >
              🚀 Lancer le déploiement
            </button>
          </div>
        </div>
      </div>

      <!-- History Tab -->
      <div class="tab-content" *ngIf="activeTab === 'history'">
        <div class="deployments-list" *ngIf="deployments.length > 0 else noDeployments">
          <div class="deployment-card card" *ngFor="let deployment of deployments">
            <div class="deployment-header">
              <div class="deployment-title">
                <h3>{{ deployment.video_title || 'Vidéo inconnue' }}</h3>
                <span class="badge" [class]="'badge-' + getDeploymentStatusBadge(deployment.status)">
                  {{ getDeploymentStatusLabel(deployment.status) }}
                </span>
              </div>
              <div class="deployment-meta">
                {{ deployment.target_type === 'site' ? '🖥️' : '👥' }}
                {{ deployment.target_name }}
              </div>
            </div>

            <div class="deployment-progress">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  [class]="'progress-' + deployment.status"
                  [style.width.%]="deployment.progress"
                ></div>
              </div>
              <div class="progress-label">
                <span>{{ deployment.deployed_count }} / {{ deployment.total_count }} sites</span>
                <span>{{ deployment.progress }}%</span>
              </div>
            </div>

            <div class="deployment-footer">
              <span class="deployment-date">{{ formatDate(deployment.created_at) }}</span>
              <span *ngIf="deployment.completed_at" class="deployment-completed">
                Terminé: {{ formatDate(deployment.completed_at) }}
              </span>
            </div>
          </div>
        </div>

        <ng-template #noDeployments>
          <div class="empty-state card">
            <div class="empty-icon">📊</div>
            <h3>Aucun déploiement</h3>
            <p>L'historique de vos déploiements apparaîtra ici.</p>
          </div>
        </ng-template>
      </div>

      <!-- Upload Video Modal -->
      <div class="modal" *ngIf="showUploadModal" (click)="showUploadModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Ajouter une vidéo</h2>
            <button class="modal-close" (click)="showUploadModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Titre de la vidéo *</label>
              <input type="text" [(ngModel)]="uploadForm.title" placeholder="Ex: Présentation club">
            </div>
            <div class="form-group">
              <label>Fichier vidéo *</label>
              <input type="file" accept="video/*" (change)="onFileSelected($event)">
              <div class="file-info" *ngIf="uploadForm.file">
                {{ uploadForm.file.name }} ({{ formatFileSize(uploadForm.file.size) }})
              </div>
            </div>
            <div class="upload-progress" *ngIf="uploadProgress > 0">
              <div class="progress-bar">
                <div class="progress-fill progress-in_progress" [style.width.%]="uploadProgress"></div>
              </div>
              <div class="progress-label">
                <span>Upload en cours...</span>
                <span>{{ uploadProgress }}%</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showUploadModal = false">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="uploadVideo()"
              [disabled]="!canUpload() || uploadProgress > 0"
            >
              Uploader
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 2rem;
      color: #0f172a;
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #64748b;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: -2px;
    }

    .tab:hover {
      color: #334155;
      background: #f8fafc;
    }

    .tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .tab-content {
      animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .content-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      gap: 1rem;
    }

    .search-bar {
      flex: 1;
      max-width: 400px;
    }

    .search-input {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .search-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .videos-grid {
      display: grid;
      gap: 1.5rem;
    }

    .video-card {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .video-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .video-thumbnail {
      width: 120px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .video-icon {
      font-size: 2.5rem;
      opacity: 0.9;
    }

    .video-info {
      flex: 1;
      min-width: 0;
    }

    .video-info h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .video-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
      margin-bottom: 0.25rem;
    }

    .separator {
      color: #cbd5e1;
    }

    .video-filename {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .video-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn-lg {
      padding: 0.875rem 2rem;
      font-size: 1rem;
    }

    .btn-icon {
      background: none;
      border: none;
      padding: 0.5rem;
      cursor: pointer;
      font-size: 1.25rem;
      opacity: 0.7;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .btn-icon:hover {
      opacity: 1;
      background: #f1f5f9;
    }

    .btn-icon.btn-danger:hover {
      background: #fee2e2;
      color: #ef4444;
    }

    .deploy-wizard {
      max-width: 800px;
      margin: 0 auto;
    }

    .deploy-wizard h2 {
      margin: 0 0 2rem 0;
      font-size: 1.5rem;
      color: #0f172a;
    }

    .wizard-step {
      margin-bottom: 2rem;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .step-number {
      width: 36px;
      height: 36px;
      background: #2563eb;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }

    .step-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .form-select {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: white;
    }

    .form-select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .target-type-selector {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .radio-card {
      position: relative;
      cursor: pointer;
    }

    .radio-card input[type="radio"] {
      position: absolute;
      opacity: 0;
    }

    .radio-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .radio-card input[type="radio"]:checked + .radio-content {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .radio-card:hover .radio-content {
      border-color: #cbd5e1;
    }

    .radio-icon {
      font-size: 2rem;
    }

    .radio-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .radio-desc {
      font-size: 0.75rem;
      color: #64748b;
    }

    .wizard-actions {
      display: flex;
      justify-content: center;
      margin-top: 3rem;
    }

    .deployments-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .deployment-card {
      transition: transform 0.2s;
    }

    .deployment-card:hover {
      transform: translateY(-2px);
    }

    .deployment-header {
      margin-bottom: 1rem;
    }

    .deployment-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .deployment-title h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .deployment-meta {
      font-size: 0.875rem;
      color: #64748b;
    }

    .deployment-progress {
      margin-bottom: 1rem;
    }

    .progress-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      transition: width 0.3s ease;
      border-radius: 4px;
    }

    .progress-fill.progress-pending { background: #94a3b8; }
    .progress-fill.progress-in_progress { background: #2563eb; }
    .progress-fill.progress-completed { background: #10b981; }
    .progress-fill.progress-failed { background: #ef4444; }

    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
    }

    .deployment-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #94a3b8;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .empty-state p {
      color: #64748b;
      margin-bottom: 2rem;
    }

    /* Modal */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f1f5f9;
      color: #64748b;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #334155;
    }

    .form-group input[type="text"],
    .form-group input[type="file"] {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .form-group input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .file-info {
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 0.875rem;
      color: #64748b;
    }

    .upload-progress {
      margin-top: 1rem;
      padding: 1rem;
      background: #eff6ff;
      border-radius: 8px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    @media (max-width: 768px) {
      .content-header {
        flex-direction: column;
        align-items: stretch;
      }

      .search-bar {
        max-width: none;
      }

      .video-card {
        flex-direction: column;
        align-items: flex-start;
      }

      .video-thumbnail {
        width: 100%;
        height: 120px;
      }

      .video-actions {
        width: 100%;
        justify-content: space-between;
      }

      .target-type-selector {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ContentManagementComponent implements OnInit, OnDestroy {
  activeTab: 'videos' | 'deploy' | 'history' = 'videos';

  videos: Video[] = [];
  deployments: Deployment[] = [];
  sites: Site[] = [];
  groups: Group[] = [];

  videoSearch = '';
  showUploadModal = false;
  uploadProgress = 0;

  uploadForm = {
    title: '',
    file: null as File | null
  };

  deployForm = {
    videoId: '',
    targetType: 'site' as 'site' | 'group',
    targetId: ''
  };

  private subscriptions = new Subscription();

  constructor(
    private apiService: ApiService,
    private sitesService: SitesService,
    private groupsService: GroupsService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    this.loadVideos();
    this.loadDeployments();
    this.loadSites();
    this.loadGroups();
    this.subscribeToDeploymentProgress();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadVideos(): void {
    this.apiService.get<Video[]>('/videos').subscribe({
      next: (videos) => {
        this.videos = videos;
      },
      error: (error) => {
        console.error('Error loading videos:', error);
      }
    });
  }

  loadDeployments(): void {
    this.apiService.get<Deployment[]>('/deployments').subscribe({
      next: (deployments) => {
        this.deployments = deployments;
      },
      error: (error) => {
        console.error('Error loading deployments:', error);
      }
    });
  }

  loadSites(): void {
    this.sitesService.loadSites().subscribe({
      next: (response) => {
        this.sites = response.sites;
      }
    });
  }

  loadGroups(): void {
    this.groupsService.loadGroups().subscribe({
      next: (response) => {
        this.groups = response.groups;
      }
    });
  }

  subscribeToDeploymentProgress(): void {
    const sub = this.socketService.on('deploy_progress').subscribe(event => {
      const data = event as {
        deploymentId: string;
        progress: number;
        deployedCount: number;
        status: Deployment['status'];
      };
      const deployment = this.deployments.find(d => d.id === data.deploymentId);
      if (deployment) {
        deployment.progress = data.progress;
        deployment.deployed_count = data.deployedCount;
        deployment.status = data.status;
      }
    });
    this.subscriptions.add(sub);
  }

  filteredVideos(): Video[] {
    if (!this.videoSearch) return this.videos;
    const search = this.videoSearch.toLowerCase();
    return this.videos.filter(v =>
      v.title.toLowerCase().includes(search) ||
      v.filename.toLowerCase().includes(search)
    );
  }

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

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.uploadForm.file = file;
    }
  }

  canUpload(): boolean {
    return !!(this.uploadForm.title && this.uploadForm.file);
  }

  uploadVideo(): void {
    if (!this.canUpload()) return;

    const formData = new FormData();
    formData.append('title', this.uploadForm.title);
    formData.append('video', this.uploadForm.file!);

    // Simulate upload progress (in real implementation, use HttpClient with progress events)
    this.uploadProgress = 0;
    const interval = setInterval(() => {
      this.uploadProgress += 10;
      if (this.uploadProgress >= 100) {
        clearInterval(interval);
        this.apiService.post<Video>('/videos', formData).subscribe({
          next: (video) => {
            this.videos.unshift(video);
            this.showUploadModal = false;
            this.uploadProgress = 0;
            this.uploadForm = { title: '', file: null };
          },
          error: (error) => {
            alert('Erreur lors de l\'upload: ' + (error.error?.error || error.message));
            this.uploadProgress = 0;
          }
        });
      }
    }, 200);
  }

  deleteVideo(video: Video): void {
    if (confirm(`Supprimer la vidéo "${video.title}" ?`)) {
      this.apiService.delete(`/videos/${video.id}`).subscribe({
        next: () => {
          this.videos = this.videos.filter(v => v.id !== video.id);
        },
        error: (error) => {
          alert('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  deployVideo(video: Video): void {
    this.deployForm.videoId = video.id;
    this.activeTab = 'deploy';
  }

  canDeploy(): boolean {
    return !!(this.deployForm.videoId && this.deployForm.targetType && this.deployForm.targetId);
  }

  startDeployment(): void {
    if (!this.canDeploy()) return;

    const data = {
      video_id: this.deployForm.videoId,
      target_type: this.deployForm.targetType,
      target_id: this.deployForm.targetId
    };

    this.apiService.post<Deployment>('/deployments', data).subscribe({
      next: (deployment) => {
        this.deployments.unshift(deployment);
        this.activeTab = 'history';
        this.deployForm = { videoId: '', targetType: 'site', targetId: '' };
        alert('Déploiement lancé avec succès !');
      },
      error: (error) => {
        alert('Erreur lors du déploiement: ' + (error.error?.error || error.message));
      }
    });
  }

  getDeploymentStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      pending: 'secondary',
      in_progress: 'primary',
      completed: 'success',
      failed: 'danger'
    };
    return badges[status] || 'secondary';
  }

  getDeploymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé',
      failed: 'Échoué'
    };
    return labels[status] || status;
  }
}
