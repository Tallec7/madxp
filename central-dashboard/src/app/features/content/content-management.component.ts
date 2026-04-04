import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { Site, Group } from '../../core/models';
import { Subscription } from 'rxjs';
import { VideoVariantPanelComponent } from './video-variant-panel.component';
import {
  ContentManagementDataService,
  Video,
  PaginationInfo,
  Deployment,
  VideoDeploymentHistory,
  VideoName,
} from './content-management-data.service';
import { VideoUploadService } from './video-upload.service';
import { ContentDeploymentService } from './content-deployment.service';

@Component({
  selector: 'app-content-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, VideoVariantPanelComponent],
  template: `
    <div class="page-container">
      <h1>Gestion du contenu</h1>

      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'videos'"
          (click)="activeTab = 'videos'"
        >
          📹 Vidéos ({{ videoPagination.total || videos.length }})
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
              [placeholder]="'content.searchVideo' | translate"
              [(ngModel)]="videoSearch"
              (input)="onSearchDebounce()"
              class="search-input"
            />
          </div>
          <div class="header-actions">
            <button class="btn btn-secondary" (click)="showImageModal = true">
              + Ajouter une image
            </button>
            <button class="btn btn-primary" (click)="showUploadModal = true">
              + Ajouter une vidéo
            </button>
          </div>
        </div>

        <div class="videos-grid" *ngIf="videos.length > 0 else noVideos">
          <div class="video-card card" *ngFor="let video of videos">
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
              <button class="btn btn-sm btn-secondary" (click)="previewVideo(video)" title="Prévisualiser" *ngIf="video.url">
                👁️
              </button>
              <button class="btn btn-sm btn-secondary" (click)="showVideoHistory(video)" title="Historique des déploiements">
                📋
              </button>
              <button class="btn btn-sm btn-primary" (click)="deployVideo(video)">
                🚀 Déployer
              </button>
              <button class="btn-icon btn-danger" (click)="deleteVideo(video)" title="Supprimer">
                🗑️
              </button>
            </div>
            <app-video-variant-panel [videoId]="video.id"></app-video-variant-panel>
          </div>
        </div>

        <!-- Pagination -->
        <div class="pagination" *ngIf="videoPagination.totalPages > 1">
          <button
            class="btn btn-secondary btn-sm"
            [disabled]="!videoPagination.hasPrev"
            (click)="goToPage(videoPagination.page - 1)"
          >
            ← Précédent
          </button>
          <div class="pagination-pages">
            <button
              *ngFor="let p of getPageNumbers()"
              class="pagination-page"
              [class.active]="p === videoPagination.page"
              [class.ellipsis]="p === -1"
              [disabled]="p === -1"
              (click)="p !== -1 && goToPage(p)"
            >
              {{ p === -1 ? '…' : p }}
            </button>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            [disabled]="!videoPagination.hasNext"
            (click)="goToPage(videoPagination.page + 1)"
          >
            Suivant →
          </button>
        </div>
        <div class="pagination-info" *ngIf="videoPagination.total > 0">
          {{ (videoPagination.page - 1) * videoPagination.limit + 1 }}–{{ videoPagination.page * videoPagination.limit > videoPagination.total ? videoPagination.total : videoPagination.page * videoPagination.limit }} sur {{ videoPagination.total }} vidéos
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
              <option *ngFor="let video of allVideos" [ngValue]="video.id">
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
              🚀 {{ isDeploying ? ('content.deploymentInProgress' | translate) : ('content.startDeployment' | translate) }}
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
                <span class="secondary-variant-badge" *ngIf="deployment.has_secondary_variant"
                      title="Variante écran secondaire incluse">📺 2nd</span>
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

      <!-- Video Deployment History Modal -->
      <div class="modal" *ngIf="showHistoryModal" (click)="closeHistoryModal()">
        <div class="modal-content modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Historique des déploiements</h2>
            <button class="modal-close" (click)="closeHistoryModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="history-video-info" *ngIf="selectedVideoForHistory">
              <h3>{{ selectedVideoForHistory.title }}</h3>
              <span class="video-meta">{{ formatFileSize(selectedVideoForHistory.file_size) }}</span>
            </div>

            <div class="history-loading" *ngIf="isLoadingHistory">
              <span>Chargement de l'historique...</span>
            </div>

            <div class="history-stats" *ngIf="videoHistory && !isLoadingHistory">
              <div class="stat-card stat-total">
                <span class="stat-value">{{ videoHistory.stats.total }}</span>
                <span class="stat-label">Total</span>
              </div>
              <div class="stat-card stat-completed">
                <span class="stat-value">{{ videoHistory.stats.completed }}</span>
                <span class="stat-label">Terminés</span>
              </div>
              <div class="stat-card stat-failed">
                <span class="stat-value">{{ videoHistory.stats.failed }}</span>
                <span class="stat-label">Echoués</span>
              </div>
              <div class="stat-card stat-pending">
                <span class="stat-value">{{ videoHistory.stats.pending + videoHistory.stats.in_progress }}</span>
                <span class="stat-label">En cours</span>
              </div>
            </div>

            <div class="history-list" *ngIf="videoHistory && videoHistory.deployments.length > 0">
              <div class="history-item" *ngFor="let dep of videoHistory.deployments">
                <div class="history-item-header">
                  <span class="history-target">
                    {{ dep.target_type === 'site' ? '🖥️' : '👥' }}
                    {{ dep.target_name }}
                    <span class="club-name" *ngIf="dep.club_name">({{ dep.club_name }})</span>
                    <span class="secondary-variant-badge" *ngIf="dep.has_secondary_variant"
                          title="Variante écran secondaire incluse">📺 2nd</span>
                  </span>
                  <span class="badge" [class]="'badge-' + getDeploymentStatusBadge(dep.status)">
                    {{ getDeploymentStatusLabel(dep.status) }}
                  </span>
                </div>
                <div class="history-item-details">
                  <span class="history-date">{{ formatDate(dep.created_at) }}</span>
                  <span class="history-by" *ngIf="dep.deployed_by_name">par {{ dep.deployed_by_name }}</span>
                </div>
                <div class="history-item-error" *ngIf="dep.error">
                  {{ dep.error }}
                </div>
              </div>
            </div>

            <div class="empty-state" *ngIf="videoHistory && videoHistory.deployments.length === 0 && !isLoadingHistory">
              <div class="empty-icon">📭</div>
              <h4>Aucun déploiement</h4>
              <p>Cette vidéo n'a pas encore été déployée.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeHistoryModal()">Fermer</button>
            <button class="btn btn-primary" (click)="deployVideoFromHistory()" *ngIf="selectedVideoForHistory">
              🚀 Déployer cette vidéo
            </button>
          </div>
        </div>
      </div>

      <!-- Video Preview Modal -->
      <div class="modal video-preview-modal" *ngIf="previewingVideo" (click)="closePreview()">
        <div class="modal-content modal-video" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="preview-title-info">
              <h2>{{ previewingVideo.title }}</h2>
              <span class="preview-meta">{{ formatFileSize(previewingVideo.file_size) }} <span *ngIf="previewingVideo.duration">• {{ formatDuration(previewingVideo.duration) }}</span></span>
            </div>
            <button class="modal-close" (click)="closePreview()">×</button>
          </div>
          <div class="modal-body video-preview-body">
            <video
              *ngIf="previewingVideo.url"
              [src]="previewingVideo.url"
              controls
              autoplay
              class="preview-video-player">
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
            <div *ngIf="!previewingVideo.url" class="preview-unavailable">
              URL de prévisualisation non disponible
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closePreview()">Fermer</button>
            <button class="btn btn-primary" (click)="deployFromPreview()">
              🚀 Déployer cette vidéo
            </button>
          </div>
        </div>
      </div>

      <!-- Image to Video Modal -->
      <div class="modal" *ngIf="showImageModal" (click)="closeImageModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Convertir une image en vidéo</h2>
            <button class="modal-close" (click)="closeImageModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group" *ngIf="!imageForm.file">
              <label>Image *</label>
              <div
                class="drop-zone"
                [class.drag-over]="isImageDragOver"
                (dragover)="onImageDragOver($event)"
                (dragleave)="onImageDragLeave($event)"
                (drop)="onImageDrop($event)"
                (click)="imageFileInput.click()"
              >
                <div class="drop-zone-content">
                  <span class="drop-zone-icon">🖼️</span>
                  <p>Glissez-déposez une image ici</p>
                  <p class="drop-zone-hint">Formats acceptés : JPG, PNG, WEBP</p>
                </div>
                <input
                  #imageFileInput
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  (change)="onImageSelected($event)"
                  style="display: none"
                >
              </div>
            </div>

            <!-- Image Preview avec prévisualisation du rendu final -->
            <div class="image-preview" *ngIf="imageForm.file">
              <div class="image-preview-header">
                <span class="file-name">🖼️ {{ imageForm.file.name }}</span>
                <span class="file-size">{{ formatFileSize(imageForm.file.size) }}</span>
                <button class="btn-icon btn-danger" (click)="clearImageFile()">✕</button>
              </div>

              <!-- Prévisualisation du rendu final (16:9) -->
              <div class="preview-container-16-9" *ngIf="imagePreviewUrl">
                <!-- Fond flou (visible uniquement si option activée) -->
                <img
                  *ngIf="imageForm.blurBackground"
                  [src]="imagePreviewUrl"
                  alt="Background blur"
                  class="preview-blur-background"
                >
                <!-- Image principale centrée -->
                <img
                  [src]="imagePreviewUrl"
                  alt="Preview"
                  class="preview-image-centered"
                  [class.with-blur-bg]="imageForm.blurBackground"
                >
              </div>
              <p class="preview-hint">Aperçu du rendu TV (format 16:9)</p>
            </div>

            <div class="form-group" *ngIf="imageForm.file">
              <label>Durée d'affichage</label>
              <div class="duration-options">
                <label class="radio-option" *ngFor="let opt of durationOptions">
                  <input
                    type="radio"
                    name="duration"
                    [value]="opt.value"
                    [(ngModel)]="imageForm.duration"
                  >
                  <span class="radio-label">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <!-- Option fond flou -->
            <div class="form-group blur-option" *ngIf="imageForm.file">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="imageForm.blurBackground"
                >
                <span class="checkbox-text">
                  ✨ Fond flou automatique
                </span>
              </label>
              <p class="option-hint">
                Active un effet de fond flou esthétique pour les images portrait.
                L'image sera superposée sur une version floue d'elle-même.
              </p>
            </div>

            <!-- Conversion Progress -->
            <div class="upload-progress" *ngIf="isConvertingImage">
              <div class="progress-bar">
                <div class="progress-fill progress-in_progress" [style.width.%]="imageConversionProgress"></div>
              </div>
              <div class="progress-label">
                <span>Conversion en cours...</span>
                <span>{{ imageConversionProgress }}%</span>
              </div>
            </div>

            <!-- Conversion Result -->
            <div class="conversion-result" *ngIf="imageConversionResult">
              <div class="result-success" *ngIf="imageConversionResult.success">
                ✅ {{ imageConversionResult.message }}
              </div>
              <div class="result-error" *ngIf="!imageConversionResult.success">
                ❌ {{ imageConversionResult.message }}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeImageModal()">
              {{ imageConversionResult ? 'Fermer' : 'Annuler' }}
            </button>
            <button
              class="btn btn-primary"
              (click)="convertImageToVideo()"
              [disabled]="!imageForm.file || isConvertingImage"
              *ngIf="!imageConversionResult"
            >
              🚀 Créer la vidéo
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

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 2rem;
    }

    .pagination-pages {
      display: flex;
      gap: 0.25rem;
    }

    .pagination-page {
      min-width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
      color: #334155;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .pagination-page:hover:not(.active):not(.ellipsis) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .pagination-page.active {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
      font-weight: 600;
    }

    .pagination-page.ellipsis {
      border: none;
      background: none;
      cursor: default;
      color: #94a3b8;
    }

    .pagination-info {
      text-align: center;
      font-size: 0.8125rem;
      color: #64748b;
      margin-top: 0.75rem;
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

    /* History Modal Styles */
    .history-video-info {
      background: #f8fafc;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .history-video-info h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .history-loading {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .history-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      text-align: center;
      padding: 1rem;
      border-radius: 8px;
      background: #f8fafc;
    }

    .stat-card.stat-total { background: #e0f2fe; }
    .stat-card.stat-completed { background: #dcfce7; }
    .stat-card.stat-failed { background: #fee2e2; }
    .stat-card.stat-pending { background: #fef3c7; }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
    }

    .history-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .history-item {
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      transition: background 0.2s;
    }

    .history-item:hover {
      background: #f8fafc;
    }

    .history-item:last-child {
      margin-bottom: 0;
    }

    .history-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .history-target {
      font-weight: 500;
      color: #0f172a;
    }

    .club-name {
      color: #64748b;
      font-weight: 400;
    }

    .secondary-variant-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.125rem 0.5rem;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      margin-left: 0.5rem;
      white-space: nowrap;
    }

    .history-item-details {
      font-size: 0.875rem;
      color: #64748b;
      display: flex;
      gap: 1rem;
    }

    .history-item-error {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #fee2e2;
      border-radius: 4px;
      color: #991b1b;
      font-size: 0.8125rem;
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

      .history-stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* Header actions */
    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Image to Video Modal */
    .image-preview {
      margin-top: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1rem;
    }

    .image-preview-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .image-preview-header .file-name {
      flex: 1;
      color: #0f172a;
      font-weight: 500;
    }

    .image-preview-header .file-size {
      color: #64748b;
      font-size: 0.875rem;
    }

    /* Prévisualisation 16:9 avec effet blur optionnel */
    .preview-container-16-9 {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
    }

    .preview-blur-background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(25px);
      transform: scale(1.1); /* Évite les bords blancs du blur */
      z-index: 1;
    }

    .preview-image-centered {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      z-index: 2;
    }

    .preview-image-centered.with-blur-bg {
      /* Légère ombre pour décoller l'image du fond flou */
      filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.3));
    }

    .preview-hint {
      text-align: center;
      font-size: 0.75rem;
      color: #64748b;
      margin: 0.5rem 0 0 0;
    }

    /* Option fond flou */
    .blur-option {
      margin-top: 1rem;
      padding: 1rem;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 10px;
      border: 1px solid #bae6fd;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      font-weight: 500;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #2563eb;
    }

    .checkbox-text {
      color: #0f172a;
      font-size: 0.9375rem;
    }

    .option-hint {
      margin: 0.5rem 0 0 1.75rem;
      font-size: 0.8125rem;
      color: #64748b;
      line-height: 1.4;
    }

    /* Legacy - pour ancienne prévisualisation */
    .preview-image {
      max-width: 100%;
      max-height: 200px;
      border-radius: 8px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }

    .duration-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option:hover {
      border-color: #cbd5e1;
    }

    .radio-option input[type="radio"] {
      margin: 0;
    }

    .radio-option input[type="radio"]:checked + .radio-label {
      color: #2563eb;
      font-weight: 500;
    }

    .radio-option:has(input:checked) {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .radio-label {
      font-size: 0.875rem;
      color: #334155;
    }

    .conversion-result {
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 8px;
    }

    .conversion-result .result-success {
      background: #dcfce7;
      color: #166534;
      padding: 0.75rem;
      border-radius: 6px;
    }

    .conversion-result .result-error {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 6px;
    }

    /* Video Preview Modal */
    .video-preview-modal .modal-video {
      max-width: 900px;
      width: 95%;
    }

    .preview-title-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .preview-title-info h2 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .preview-meta {
      font-size: 0.875rem;
      color: #64748b;
    }

    .video-preview-body {
      padding: 0 !important;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 300px;
    }

    .preview-video-player {
      width: 100%;
      max-height: 70vh;
      display: block;
    }

    .preview-unavailable {
      color: #94a3b8;
      text-align: center;
      padding: 3rem;
    }
  `]
})
export class ContentManagementComponent implements OnInit, OnDestroy {
  activeTab: 'videos' | 'deploy' | 'history' = 'videos';

  videos: Video[] = [];
  allVideos: VideoName[] = [];
  deployments: Deployment[] = [];
  sites: Site[] = [];
  groups: Group[] = [];

  videoSearch = '';
  videoPagination: PaginationInfo = { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false };
  showUploadModal = false;
  showHistoryModal = false;
  showImageModal = false;
  isLoadingHistory = false;
  isDragOver = false;
  isImageDragOver = false;
  selectedVideoForHistory: Video | null = null;
  videoHistory: VideoDeploymentHistory | null = null;
  previewingVideo: Video | null = null;

  private readonly dataService = inject(ContentManagementDataService);
  private readonly notificationService = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly uploadService = inject(VideoUploadService);
  readonly deployService = inject(ContentDeploymentService);
  private subscriptions = new Subscription();
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Delegate to upload service ──
  get uploadForm() { return this.uploadService.uploadForm; }
  get isUploading() { return this.uploadService.isUploading; }
  get uploadProgress() { return this.uploadService.uploadProgress; }
  get uploadResults() { return this.uploadService.uploadResults; }
  get imageForm() { return this.uploadService.imageForm; }
  get isConvertingImage() { return this.uploadService.isConvertingImage; }
  get imageConversionProgress() { return this.uploadService.imageConversionProgress; }
  get imageConversionResult() { return this.uploadService.imageConversionResult; }
  get imagePreviewUrl() { return this.uploadService.imagePreviewUrl; }
  get durationOptions() { return this.uploadService.durationOptions; }

  // ── Delegate to deploy service ──
  get deployForm() { return this.deployService.deployForm; }
  get isDeploying() { return this.deployService.isDeploying; }

  ngOnInit(): void {
    this.loadVideos();
    this.loadAllVideos();
    this.loadDeployments();
    this.loadSites();
    this.loadGroups();
    this.subscriptions.add(this.deployService.subscribeToDeploymentProgress(this.deployments));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  // ── Delegate formatting to data service ──

  formatFileSize(bytes: number): string {
    return this.dataService.formatFileSize(bytes);
  }

  formatDuration(seconds: number): string {
    return this.dataService.formatDuration(seconds);
  }

  formatDate(date: Date | null): string {
    return this.dataService.formatDate(date);
  }

  getDeploymentStatusBadge(status: string): string {
    return this.dataService.getDeploymentStatusBadge(status);
  }

  getDeploymentStatusLabel(status: string): string {
    return this.dataService.getDeploymentStatusLabel(status);
  }

  // ── Data loading ──

  loadVideos(): void {
    this.dataService.loadVideos(this.videoPagination.page, this.videoPagination.limit, this.videoSearch).subscribe({
      next: (response) => {
        this.videos = response.data || [];
        if (response.pagination) {
          this.videoPagination = response.pagination;
        }
      },
      error: () => {}
    });
  }

  loadAllVideos(): void {
    this.dataService.loadAllVideoNames().subscribe({
      next: (names) => { this.allVideos = names || []; },
      error: () => {}
    });
  }

  loadDeployments(): void {
    this.dataService.loadDeployments().subscribe({
      next: (deployments) => { this.deployments = deployments; },
      error: () => {}
    });
  }

  loadSites(): void {
    this.dataService.loadSites().subscribe({ next: (sites) => { this.sites = sites; } });
  }

  loadGroups(): void {
    this.dataService.loadGroups().subscribe({ next: (groups) => { this.groups = groups; } });
  }

  // ── Pagination & search ──

  goToPage(page: number): void {
    if (page < 1 || page > this.videoPagination.totalPages) return;
    this.videoPagination.page = page;
    this.loadVideos();
  }

  onSearchChange(): void {
    this.videoPagination.page = 1;
    this.loadVideos();
  }

  onSearchDebounce(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => this.onSearchChange(), 300);
  }

  getPageNumbers(): number[] {
    const { page, totalPages } = this.videoPagination;
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    if (page > 3) pages.push(-1);
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push(-1);
    pages.push(totalPages);
    return pages;
  }

  // ── File selection UI handlers (delegate to uploadService) ──

  onFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.uploadService.addFilesToSelection(Array.from(target.files || []) as File[]);
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault(); event.stopPropagation(); this.isDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('video/'));
    this.uploadService.addFilesToSelection(files);
  }

  addFilesToSelection(files: File[]): void { this.uploadService.addFilesToSelection(files); }
  removeFile(index: number): void { this.uploadService.removeFile(index); }
  clearSelectedFiles(): void { this.uploadService.clearSelectedFiles(); }
  canUpload(): boolean { return this.uploadService.canUpload(); }

  closeUploadModal(): void {
    if (this.uploadService.isUploading) return;
    this.showUploadModal = false;
    this.uploadService.resetUploadForm();
  }

  uploadVideos(): void {
    this.uploadService.uploadVideos(() => { this.loadVideos(); this.loadAllVideos(); });
  }

  // ── Video CRUD actions ──

  async deleteVideo(video: Video): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      `Supprimer la vidéo "${video.title}" ?`,
      { title: 'Suppression', confirmLabel: 'Supprimer' },
    );
    if (ok) {
      this.dataService.deleteVideo(video.id).subscribe({
        next: () => {
          this.videos = this.videos.filter(v => v.id !== video.id);
          this.allVideos = this.allVideos.filter(v => v.id !== video.id);
        },
        error: (error: unknown) => {
          const message = this.dataService.getErrorMessage(error);
          this.notificationService.error(`Erreur lors de la suppression: ${message}`, {
            correlationId: this.dataService.getCorrelationId(error)
          });
        }
      });
    }
  }

  // ── Video history modal ──

  showVideoHistory(video: Video): void {
    this.selectedVideoForHistory = video;
    this.showHistoryModal = true;
    this.isLoadingHistory = true;
    this.videoHistory = null;

    this.dataService.loadVideoHistory(video.id).subscribe({
      next: (history) => { this.videoHistory = history; this.isLoadingHistory = false; },
      error: (error: unknown) => {
        this.notificationService.error('Erreur lors du chargement de l\'historique', {
          correlationId: this.dataService.getCorrelationId(error)
        });
        this.isLoadingHistory = false;
      }
    });
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
    this.selectedVideoForHistory = null;
    this.videoHistory = null;
  }

  deployVideoFromHistory(): void {
    if (this.selectedVideoForHistory) {
      this.closeHistoryModal();
      this.deployVideo(this.selectedVideoForHistory);
    }
  }

  // ── Video preview modal ──

  previewVideo(video: Video): void { this.previewingVideo = video; }
  closePreview(): void { this.previewingVideo = null; }

  deployFromPreview(): void {
    if (this.previewingVideo) {
      const video = this.previewingVideo;
      this.closePreview();
      this.deployVideo(video);
    }
  }

  // ── Deploy actions (delegate to deployService) ──

  deployVideo(video: Video): void {
    this.deployService.addVideoToDeploy(video.id);
    this.activeTab = 'deploy';
  }

  getVideoTitleById(videoId: string): string {
    return this.deployService.getVideoTitleById(videoId, this.allVideos);
  }

  removeSelectedVideo(videoId: string): void { this.deployService.removeSelectedVideo(videoId); }
  clearSelectedVideos(): void { this.deployService.clearSelectedVideos(); }
  canDeploy(): boolean { return this.deployService.canDeploy(); }

  async startDeployment(): Promise<void> {
    const result = await this.deployService.startDeployment(this.allVideos, this.deployments);
    if (result.switchToHistory) {
      this.activeTab = 'history';
    }
  }

  // ── Image to Video (delegate to uploadService) ──

  closeImageModal(): void {
    if (this.uploadService.isConvertingImage) return;
    this.showImageModal = false;
    this.uploadService.resetImageForm();
  }

  onImageDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isImageDragOver = true; }
  onImageDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isImageDragOver = false; }

  onImageDrop(event: DragEvent): void {
    event.preventDefault(); event.stopPropagation(); this.isImageDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) { this.uploadService.setImageFile(files[0]); }
  }

  onImageSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) { this.uploadService.setImageFile(file); }
  }

  setImageFile(file: File): void { this.uploadService.setImageFile(file); }
  clearImageFile(): void { this.uploadService.clearImageFile(); }

  convertImageToVideo(): void {
    this.uploadService.convertImageToVideo(() => { this.loadVideos(); this.loadAllVideos(); });
  }
}
