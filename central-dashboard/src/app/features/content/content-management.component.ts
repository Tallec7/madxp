import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site, Group } from '../../core/models';
import { Subscription, firstValueFrom } from 'rxjs';

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
            <select
              multiple
              size="6"
              [(ngModel)]="deployForm.videoIds"
              class="form-select"
            >
              <option *ngFor="let video of videos" [ngValue]="video.id">
                {{ video.title }} ({{ formatFileSize(video.file_size) }})
              </option>
            </select>
            <div class="selection-hint">
              Astuce : maintenez Cmd (Mac) ou Ctrl (Windows) pour sélectionner plusieurs vidéos.
            </div>
            <div class="selected-videos" *ngIf="deployForm.videoIds.length > 0">
              <div class="selected-videos-header">
                <span>{{ deployForm.videoIds.length }} vidéo(s) sélectionnée(s)</span>
                <button type="button" class="btn btn-sm btn-secondary" (click)="clearSelectedVideos()">
                  Tout effacer
                </button>
              </div>
              <ul>
                <li *ngFor="let videoId of deployForm.videoIds">
                  <span>{{ getVideoTitleById(videoId) }}</span>
                  <button type="button" class="btn-icon" (click)="removeSelectedVideo(videoId)" aria-label="Retirer">
                    ✕
                  </button>
                </li>
              </ul>
            </div>
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
              [disabled]="!canDeploy() || isDeploying"
            >
              🚀 {{ isDeploying ? 'Déploiement en cours...' : 'Lancer le déploiement' }}
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
      <div class="modal" *ngIf="showUploadModal" (click)="closeUploadModal()">
        <div class="modal-content modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Ajouter des vidéos</h2>
            <button class="modal-close" (click)="closeUploadModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group" *ngIf="uploadForm.files.length === 0">
              <label>Titre de la vidéo (optionnel pour upload unique)</label>
              <input type="text" [(ngModel)]="uploadForm.title" placeholder="Ex: Présentation club">
            </div>
            <div class="form-group">
              <label>Fichiers vidéo *</label>
              <div
                class="drop-zone"
                [class.drag-over]="isDragOver"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDrop($event)"
                (click)="fileInput.click()"
              >
                <div class="drop-zone-content">
                  <span class="drop-zone-icon">📁</span>
                  <p>Glissez-déposez vos vidéos ici</p>
                  <p class="drop-zone-hint">ou cliquez pour sélectionner (max 20 fichiers)</p>
                </div>
                <input
                  #fileInput
                  type="file"
                  accept="video/*"
                  multiple
                  (change)="onFilesSelected($event)"
                  style="display: none"
                >
              </div>
            </div>

            <!-- Selected Files List -->
            <div class="selected-files" *ngIf="uploadForm.files.length > 0">
              <div class="selected-files-header">
                <span>{{ uploadForm.files.length }} fichier(s) sélectionné(s)</span>
                <button class="btn btn-sm btn-secondary" (click)="clearSelectedFiles()">Effacer</button>
              </div>
              <ul class="files-list">
                <li class="file-item" *ngFor="let file of uploadForm.files; let i = index">
                  <span class="file-name">🎬 {{ file.name }}</span>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  <button class="btn-icon btn-danger" (click)="removeFile(i)">✕</button>
                </li>
              </ul>
            </div>

            <!-- Upload Progress -->
            <div class="upload-progress" *ngIf="isUploading">
              <div class="progress-bar">
                <div class="progress-fill progress-in_progress" [style.width.%]="uploadProgress"></div>
              </div>
              <div class="progress-label">
                <span>Upload en cours...</span>
                <span>{{ uploadProgress }}%</span>
              </div>
            </div>

            <!-- Upload Results -->
            <div class="upload-results" *ngIf="uploadResults.length > 0">
              <ul>
                <li *ngFor="let result of uploadResults" [class.result-success]="result.success" [class.result-error]="!result.success">
                  {{ result.success ? '✅' : '❌' }} {{ result.name }}
                  <span *ngIf="result.error">: {{ result.error }}</span>
                </li>
              </ul>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeUploadModal()">{{ uploadResults.length > 0 ? 'Fermer' : 'Annuler' }}</button>
            <button
              class="btn btn-primary"
              (click)="uploadVideos()"
              [disabled]="!canUpload() || isUploading"
              *ngIf="uploadResults.length === 0"
            >
              Uploader {{ uploadForm.files.length > 1 ? '(' + uploadForm.files.length + ' fichiers)' : '' }}
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

    .selection-hint {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .selected-videos {
      margin-top: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.75rem;
      background: #f8fafc;
    }

    .selected-videos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      color: #0f172a;
    }

    .selected-videos ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .selected-videos li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.35rem 0.5rem;
      font-size: 0.85rem;
      color: #334155;
    }

    .selected-videos li button {
      color: #ef4444;
      font-size: 1rem;
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

    .modal-large {
      max-width: 600px;
    }

    .drop-zone {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 2.5rem 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background: #f8fafc;
    }

    .drop-zone:hover {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .drop-zone.drag-over {
      border-color: #2563eb;
      background: #dbeafe;
      transform: scale(1.01);
    }

    .drop-zone-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 0.75rem;
    }

    .drop-zone-content p {
      margin: 0.25rem 0;
      color: #334155;
    }

    .drop-zone-hint {
      font-size: 0.875rem;
      color: #64748b !important;
    }

    .selected-files {
      margin-top: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1rem;
    }

    .selected-files-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .selected-files-header span {
      font-weight: 600;
      color: #0f172a;
    }

    .files-list {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 200px;
      overflow-y: auto;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 0.5rem;
    }

    .file-item:last-child {
      margin-bottom: 0;
    }

    .file-name {
      flex: 1;
      color: #0f172a;
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      color: #64748b;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .btn-icon {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      font-size: 0.875rem;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .btn-icon:hover {
      background: #fee2e2;
    }

    .upload-results {
      margin-top: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      padding: 0.75rem;
    }

    .upload-results ul {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 150px;
      overflow-y: auto;
    }

    .upload-results li {
      padding: 0.5rem 0.625rem;
      font-size: 0.8125rem;
      border-radius: 4px;
      margin-bottom: 0.25rem;
    }

    .upload-results li:last-child {
      margin-bottom: 0;
    }

    .result-success {
      background: #dcfce7;
      color: #166534;
    }

    .result-error {
      background: #fee2e2;
      color: #991b1b;
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
  isUploading = false;
  isDeploying = false;
  isDragOver = false;
  uploadResults: Array<{ name: string; success: boolean; error?: string }> = [];

  uploadForm = {
    title: '',
    file: null as File | null,
    files: [] as File[]
  };

  deployForm = {
    videoIds: [] as string[],
    targetType: 'site' as 'site' | 'group',
    targetId: ''
  };

  private readonly apiService = inject(ApiService);
  private readonly sitesService = inject(SitesService);
  private readonly groupsService = inject(GroupsService);
  private readonly socketService = inject(SocketService);
  private readonly notificationService = inject(NotificationService);
  private subscriptions = new Subscription();

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

  onFilesSelected(event: any): void {
    const files = Array.from(event.target.files) as File[];
    this.addFilesToSelection(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('video/'));
    this.addFilesToSelection(files);
  }

  addFilesToSelection(files: File[]): void {
    const maxFiles = 20;
    const remaining = maxFiles - this.uploadForm.files.length;
    const filesToAdd = files.slice(0, remaining);
    this.uploadForm.files = [...this.uploadForm.files, ...filesToAdd];

    if (files.length > remaining) {
      this.notificationService.warning(`Seulement ${remaining} fichier(s) ajouté(s). Maximum ${maxFiles} fichiers.`);
    }
  }

  removeFile(index: number): void {
    this.uploadForm.files.splice(index, 1);
  }

  clearSelectedFiles(): void {
    this.uploadForm.files = [];
  }

  closeUploadModal(): void {
    if (this.isUploading) return;
    this.showUploadModal = false;
    this.uploadForm = { title: '', file: null, files: [] };
    this.uploadProgress = 0;
    this.uploadResults = [];
  }

  canUpload(): boolean {
    return this.uploadForm.files.length > 0;
  }

  uploadVideos(): void {
    if (!this.canUpload()) return;

    this.isUploading = true;
    this.uploadProgress = 10;
    this.uploadResults = [];

    const files = this.uploadForm.files;

    if (files.length === 1) {
      // Single file upload
      const formData = new FormData();
      if (this.uploadForm.title) {
        formData.append('title', this.uploadForm.title);
      }
      formData.append('video', files[0]);

      this.apiService.upload<Video>('/videos', formData).subscribe({
        next: (video) => {
          this.uploadProgress = 100;
          this.videos.unshift(video);
          this.uploadResults = [{ name: files[0].name, success: true }];
          this.isUploading = false;
          this.notificationService.success('Vidéo uploadée avec succès !');
          this.loadVideos();
        },
        error: (error) => {
          this.uploadResults = [{ name: files[0].name, success: false, error: error.error?.error || error.message }];
          this.notificationService.error('Erreur lors de l\'upload');
          this.uploadProgress = 0;
          this.isUploading = false;
        }
      });
    } else {
      // Multiple files upload
      const formData = new FormData();
      files.forEach(file => {
        formData.append('videos', file);
      });

      this.apiService.upload<{
        success: boolean;
        message: string;
        files?: Array<{ id: string; name: string; title: string; size: number; success: true }>;
        errors?: Array<{ name: string; error: string }>;
      }>('/videos/bulk', formData).subscribe({
        next: (response) => {
          this.uploadProgress = 100;
          this.isUploading = false;

          // Build results
          this.uploadResults = [];
          if (response.files) {
            response.files.forEach(f => {
              this.uploadResults.push({ name: f.title, success: true });
            });
          }
          if (response.errors) {
            response.errors.forEach(e => {
              this.uploadResults.push({ name: e.name, success: false, error: e.error });
            });
          }

          if (response.success) {
            this.notificationService.success(response.message);
          } else {
            this.notificationService.warning(response.message);
          }

          this.loadVideos();
        },
        error: (error) => {
          this.notificationService.error('Erreur lors de l\'upload: ' + (error.error?.error || error.message));
          this.uploadProgress = 0;
          this.isUploading = false;
        }
      });
    }
  }

  deleteVideo(video: Video): void {
    if (confirm(`Supprimer la vidéo "${video.title}" ?`)) {
      this.apiService.delete(`/videos/${video.id}`).subscribe({
        next: () => {
          this.videos = this.videos.filter(v => v.id !== video.id);
        },
        error: (error) => {
          this.notificationService.error('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  deployVideo(video: Video): void {
    if (!this.deployForm.videoIds.includes(video.id)) {
      this.deployForm.videoIds = [...this.deployForm.videoIds, video.id];
    }
    this.activeTab = 'deploy';
  }

  getVideoTitleById(videoId: string): string {
    return this.videos.find(v => v.id === videoId)?.title || 'Vidéo inconnue';
  }

  removeSelectedVideo(videoId: string): void {
    this.deployForm.videoIds = this.deployForm.videoIds.filter(id => id !== videoId);
  }

  clearSelectedVideos(): void {
    this.deployForm.videoIds = [];
  }

  canDeploy(): boolean {
    return this.deployForm.videoIds.length > 0 && !!(this.deployForm.targetType && this.deployForm.targetId);
  }

  async startDeployment(): Promise<void> {
    if (!this.canDeploy() || this.isDeploying) return;

    this.isDeploying = true;
    const { videoIds, targetId, targetType } = this.deployForm;
    const successes: string[] = [];
    const failures: Array<{ title: string; error: string }> = [];

    for (const videoId of videoIds) {
      const videoTitle = this.getVideoTitleById(videoId);
      const payload = {
        video_id: videoId,
        target_type: targetType,
        target_id: targetId
      };

      try {
        const deployment = await firstValueFrom(this.apiService.post<Deployment>('/deployments', payload));
        this.deployments.unshift({
          ...deployment,
          video_title: videoTitle
        });
        successes.push(videoTitle);
      } catch (error: any) {
        failures.push({
          title: videoTitle,
          error: error?.error?.error || error?.message || 'Erreur inconnue'
        });
      }
    }

    this.isDeploying = false;
    this.deployForm = { videoIds: [], targetType: 'site', targetId: '' };

    if (successes.length > 0) {
      const label = successes.length === 1 ? successes[0] : `${successes.length} vidéos`;
      this.notificationService.success(`Déploiement lancé pour ${label}`);
      this.activeTab = 'history';
    }

    if (failures.length > 0) {
      const names = failures.map(f => f.title).join(', ');
      this.notificationService.error(`Erreur lors du déploiement pour ${names}`);
    }
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
