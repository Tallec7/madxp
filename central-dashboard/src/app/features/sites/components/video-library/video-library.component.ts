import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LocalVideo, CloudVideo, LocalStorage } from '../../../../core/models';

export interface VideoItem {
  id: string | null;
  path: string;
  filename: string;
  displayName: string; // Title or original filename for display (filename may be UUID)
  category: string | null;
  subcategory: string | null;
  size: number;
  duration: number | null;
  isOnPi: boolean;
  owner: 'club' | 'neopro';
  source: 'cloud' | 'local';
  lastModified?: string;
  uploadedForSiteId?: string | null; // Site for which this video was uploaded
}

export type VideoDeployStatus = 'idle' | 'deploying' | 'success' | 'error' | 'timeout';

export interface VideoDeployState {
  status: VideoDeployStatus;
  progress?: number;
  error?: string;
  commandId?: string;
}

export type SortField = 'filename' | 'size' | 'duration' | 'lastModified' | 'category';
export type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-video-library',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="video-library">
      <div class="library-header">
        <h4>
          <span class="section-icon">🎬</span>
          Bibliothèque Vidéo
        </h4>
        <div class="library-stats">
          <span class="stat">{{ filteredVideos.length }} vidéo(s)</span>
          <span class="stat on-pi" *ngIf="statsOnPi > 0">✅ {{ statsOnPi }}</span>
          <span class="stat to-deploy" *ngIf="statsToDeploy > 0">⏳ {{ statsToDeploy }}</span>
          <span class="stat" *ngIf="totalSize && totalSize > 0 && !isNaN(totalSize)">{{ formatBytes(totalSize) }}</span>
          <span class="stat" *ngIf="totalDuration && totalDuration > 0">🕐 {{ formatDuration(totalDuration) }}</span>
        </div>
      </div>

      <!-- Barre de stockage -->
      <div class="storage-bar-container" *ngIf="storage">
        <div class="storage-info">
          <span class="storage-label">Stockage Pi</span>
          <span class="storage-values">{{ formatBytes(storage.used) }} / {{ formatBytes(storage.total) }}</span>
        </div>
        <div class="storage-bar">
          <div
            class="storage-fill"
            [style.width.%]="storagePercent"
            [class.warning]="storagePercent > 75"
            [class.danger]="storagePercent > 90"
          ></div>
        </div>
        <span class="storage-free">{{ formatBytes(storage.free) }} disponible</span>
      </div>

      <!-- Filtres -->
      <div class="library-filters">
        <input
          type="text"
          [(ngModel)]="searchQuery"
          (ngModelChange)="applyFilters()"
          placeholder="Rechercher..."
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()" class="filter-select">
          <option value="all">Tous les statuts</option>
          <option value="on_pi">✅ Sur le Pi</option>
          <option value="to_deploy">⏳ À déployer</option>
        </select>
        <select [(ngModel)]="ownerFilter" (ngModelChange)="applyFilters()" class="filter-select">
          <option value="all">Tous</option>
          <option value="club">Club</option>
          <option value="neopro">NEOPRO</option>
        </select>
        <select [(ngModel)]="categoryFilter" (ngModelChange)="applyFilters()" class="filter-select">
          <option value="all">Toutes catégories</option>
          <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
        </select>
        <button
          class="btn-selection"
          [class.active]="selectionMode"
          (click)="toggleSelectionMode()"
          title="Mode sélection multiple"
        >
          ☑️
        </button>
      </div>

      <!-- Barre d'actions groupées -->
      <div class="bulk-actions" *ngIf="selectionMode && selectedVideos.size > 0">
        <span class="bulk-count">{{ 'videoLibrary.selectedCount' | translate: { count: selectedVideos.size } }}</span>
        <button
          class="btn btn-sm btn-primary"
          (click)="onBulkDeploy()"
          [disabled]="getSelectedToDeploy().length === 0"
          [title]="'videoLibrary.deploySelectedVideos' | translate"
        >
          🚀 {{ 'common.deploy' | translate }} ({{ getSelectedToDeploy().length }})
        </button>
        <button
          class="btn btn-sm btn-danger"
          (click)="onBulkDelete()"
          [disabled]="getSelectedToDelete().length === 0"
          [title]="'videoLibrary.deleteSelectedVideos' | translate"
        >
          🗑️ {{ 'common.delete' | translate }} ({{ getSelectedToDelete().length }})
        </button>
        <button class="btn btn-sm btn-outline" (click)="selectedVideos.clear()">
          {{ 'videoLibrary.deselect' | translate }}
        </button>
      </div>

      <!-- En-tête de tri -->
      <div class="sort-header">
        <span class="col-checkbox" *ngIf="selectionMode">
          <input type="checkbox" [checked]="isAllSelected()" (change)="toggleSelectAll($event)" title="Tout sélectionner" />
        </span>
        <span class="col-lock"></span>
        <button class="sort-btn col-name" [class.active]="sortField === 'filename'" (click)="toggleSort('filename')">
          Nom {{ getSortIcon('filename') }}
        </button>
        <button class="sort-btn col-category" [class.active]="sortField === 'category'" (click)="toggleSort('category')">
          Catégorie {{ getSortIcon('category') }}
        </button>
        <button class="sort-btn col-duration" [class.active]="sortField === 'duration'" (click)="toggleSort('duration')">
          Durée {{ getSortIcon('duration') }}
        </button>
        <button class="sort-btn col-size" [class.active]="sortField === 'size'" (click)="toggleSort('size')">
          Taille {{ getSortIcon('size') }}
        </button>
        <button class="sort-btn col-date" [class.active]="sortField === 'lastModified'" (click)="toggleSort('lastModified')">
          Date {{ getSortIcon('lastModified') }}
        </button>
        <span class="col-owner">Source</span>
        <span class="col-status">Statut</span>
        <span class="col-actions">Actions</span>
      </div>

      <!-- Liste des vidéos -->
      <div class="video-list" *ngIf="filteredVideos.length > 0; else noVideos">
        <div
          class="video-item"
          *ngFor="let video of filteredVideos"
          [class.selected]="selectedPath === video.path || isSelected(video)"
          [class.neopro]="video.owner === 'neopro'"
          [class.to-deploy]="!video.isOnPi"
          (click)="selectVideo(video)"
        >
          <span class="col-checkbox" *ngIf="selectionMode" (click)="$event.stopPropagation()">
            <input type="checkbox" [checked]="isSelected(video)" (change)="toggleSelection(video, $event)" />
          </span>
          <span class="col-lock">{{ video.owner === 'neopro' ? '🔒' : '' }}</span>
          <span class="col-name video-name" [title]="video.filename">
            {{ video.displayName }}
            <span class="video-subcat" *ngIf="video.subcategory">{{ video.subcategory }}</span>
            <span class="for-this-site-badge" *ngIf="isUploadedForThisSite(video)" title="Uploadée pour ce site">⭐</span>
          </span>
          <span class="col-category video-category" [title]="video.category || ''">
            {{ video.category || '-' }}
          </span>
          <span class="col-duration video-duration">{{ video.duration ? formatDuration(video.duration) : '-' }}</span>
          <span class="col-size video-size">{{ formatBytes(video.size) }}</span>
          <span class="col-date video-date">{{ video.lastModified ? formatDate(video.lastModified) : '-' }}</span>
          <span class="col-owner video-owner" [class.owner-neopro]="video.owner === 'neopro'" [class.owner-club]="video.owner === 'club'">
            {{ video.owner === 'neopro' ? 'NEOPRO' : 'CLUB' }}
          </span>
          <span class="col-status video-status"
                [class.on-pi]="video.isOnPi && !getDeployState(video)"
                [class.pending]="!video.isOnPi && !getDeployState(video)"
                [class.deploying]="getDeployState(video)?.status === 'deploying'"
                [class.deploy-success]="getDeployState(video)?.status === 'success'"
                [class.deploy-error]="getDeployState(video)?.status === 'error' || getDeployState(video)?.status === 'timeout'"
                [title]="getDeployState(video)?.error || ''">
            <ng-container *ngIf="!getDeployState(video)">
              {{ video.isOnPi ? '✅' : '⏳' }}
            </ng-container>
            <ng-container *ngIf="getDeployState(video)?.status === 'deploying'">
              <span class="deploy-spinner">⏳</span>
            </ng-container>
            <ng-container *ngIf="getDeployState(video)?.status === 'success'">
              ✅
            </ng-container>
            <ng-container *ngIf="getDeployState(video)?.status === 'error' || getDeployState(video)?.status === 'timeout'">
              ❌
            </ng-container>
          </span>
          <div class="col-actions video-actions">
            <button
              class="action-btn preview"
              (click)="onPreview(video, $event)"
              title="Prévisualiser"
              *ngIf="video.source === 'cloud'"
            >
              👁️
            </button>
            <button
              class="action-btn deploy"
              (click)="onDeploy(video, $event)"
              [title]="'videoLibrary.deployToPi' | translate"
              *ngIf="!video.isOnPi && video.source === 'cloud' && !isDeploying(video)"
              [disabled]="isDeploying(video)"
            >
              🚀
            </button>
            <span class="deploy-progress" *ngIf="isDeploying(video)" [title]="'content.deploymentInProgress' | translate">
              {{ getDeployState(video)?.progress ?? 0 }}%
            </span>
            <button
              class="action-btn delete"
              (click)="onDelete(video, $event)"
              [title]="'common.delete' | translate"
              *ngIf="video.owner !== 'neopro'"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      <ng-template #noVideos>
        <div class="no-videos">
          <span class="no-videos-icon">📂</span>
          <p *ngIf="allVideos.length === 0">Aucune vidéo disponible</p>
          <p *ngIf="allVideos.length > 0 && filteredVideos.length === 0">Aucune vidéo ne correspond aux filtres</p>
        </div>
      </ng-template>

      <!-- Légende -->
      <div class="library-legend">
        <span class="legend-item"><span class="legend-icon">✅</span> Sur le Pi</span>
        <span class="legend-item"><span class="legend-icon">⏳</span> À déployer</span>
        <span class="legend-item"><span class="legend-icon">🔒</span> NEOPRO (non modifiable)</span>
      </div>

      <!-- Video Preview Popup -->
      <div class="preview-overlay" *ngIf="previewVideo" (click)="closePreview()">
        <div class="preview-modal" (click)="$event.stopPropagation()">
          <div class="preview-header">
            <div class="preview-title">
              <span class="preview-filename" [title]="previewVideo.filename">{{ previewVideo.displayName }}</span>
              <span class="preview-meta" *ngIf="previewVideo.category">
                {{ previewVideo.category }}{{ previewVideo.subcategory ? ' / ' + previewVideo.subcategory : '' }}
              </span>
            </div>
            <button class="preview-close" (click)="closePreview()" title="Fermer">✕</button>
          </div>
          <div class="preview-content">
            <video
              *ngIf="previewVideo.path"
              [src]="previewVideo.path"
              controls
              autoplay
              class="preview-video"
            >
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
            <div *ngIf="!previewVideo.path" class="preview-unavailable">
              <span class="unavailable-icon">🚫</span>
              <p>Prévisualisation non disponible</p>
              <span class="unavailable-hint">L'URL de la vidéo n'est pas configurée</span>
            </div>
          </div>
          <div class="preview-footer">
            <span class="preview-info">{{ formatBytes(previewVideo.size) }}</span>
            <span class="preview-info" *ngIf="previewVideo.duration">{{ formatDuration(previewVideo.duration) }}</span>
            <span class="preview-status" [class.on-pi]="previewVideo.isOnPi" [class.pending]="!previewVideo.isOnPi">
              {{ previewVideo.isOnPi ? '✅ Sur le Pi' : '⏳ À déployer' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div class="confirm-overlay" *ngIf="deleteConfirmVideo" (click)="cancelDelete()">
        <div class="confirm-modal" (click)="$event.stopPropagation()">
          <div class="confirm-header">
            <span class="confirm-icon">⚠️</span>
            <h4>{{ 'videoLibrary.confirmDeletion' | translate }}</h4>
          </div>
          <div class="confirm-content">
            <p>{{ 'videoLibrary.confirmDeleteVideo' | translate }}</p>
            <div class="confirm-video-info">
              <span class="video-name">{{ deleteConfirmVideo.displayName }}</span>
              <span class="video-meta">{{ formatBytes(deleteConfirmVideo.size) }}</span>
            </div>
            <p class="confirm-warning">{{ 'videoLibrary.deleteWarning' | translate }}</p>
          </div>
          <div class="confirm-actions">
            <button class="btn btn-outline" (click)="cancelDelete()">{{ 'common.cancel' | translate }}</button>
            <button class="btn btn-danger" (click)="confirmDelete()">🗑️ {{ 'common.delete' | translate }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .video-library {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1rem;
    }

    .library-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .library-header h4 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }

    .section-icon {
      font-size: 1.25rem;
    }

    .library-stats {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .stat {
      font-size: 0.875rem;
      color: #64748b;
      background: white;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
    }

    .stat.on-pi {
      background: #dcfce7;
      color: #166534;
    }

    .stat.to-deploy {
      background: #fef3c7;
      color: #92400e;
    }

    /* Storage bar */
    .storage-bar-container {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.75rem;
      margin-bottom: 1rem;
    }

    .storage-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .storage-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
    }

    .storage-values {
      font-size: 0.75rem;
      color: #64748b;
    }

    .storage-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .storage-fill {
      height: 100%;
      background: #22c55e;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .storage-fill.warning {
      background: #f59e0b;
    }

    .storage-fill.danger {
      background: #ef4444;
    }

    .storage-free {
      font-size: 0.7rem;
      color: #94a3b8;
      display: block;
      margin-top: 0.25rem;
      text-align: right;
    }

    .library-filters {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .btn-selection {
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-selection:hover {
      background: #f1f5f9;
      border-color: #2563eb;
    }

    .btn-selection.active {
      background: #2563eb;
      border-color: #2563eb;
    }

    .bulk-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }

    .bulk-count {
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e40af;
      margin-right: auto;
    }

    .btn {
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
    }

    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-danger {
      background: #dc2626;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #b91c1c;
    }

    .btn-outline {
      background: white;
      border-color: #e2e8f0;
      color: #475569;
    }

    .btn-outline:hover {
      background: #f1f5f9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .search-input {
      flex: 1;
      min-width: 150px;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .search-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .filter-select {
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
      min-width: 120px;
    }

    /* Grid columns - shared between header and items */
    .col-checkbox { width: 28px; text-align: center; flex-shrink: 0; }
    .col-lock { width: 24px; text-align: center; flex-shrink: 0; }
    .col-name { flex: 1; min-width: 0; text-align: left; }
    .col-category { width: 90px; text-align: left; flex-shrink: 0; }
    .col-duration { width: 55px; text-align: right; flex-shrink: 0; }
    .col-size { width: 65px; text-align: right; flex-shrink: 0; }
    .col-date { width: 70px; text-align: right; flex-shrink: 0; }
    .col-owner { width: 55px; text-align: center; flex-shrink: 0; }
    .col-status { width: 35px; text-align: center; flex-shrink: 0; }
    .col-actions { width: 85px; text-align: right; flex-shrink: 0; }

    /* Sort header */
    .sort-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      font-size: 0.75rem;
      color: #64748b;
    }

    .sort-btn {
      background: none;
      border: none;
      font-size: 0.75rem;
      color: #64748b;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .sort-btn:hover {
      background: #e2e8f0;
      color: #1e293b;
    }

    .sort-btn.active {
      background: #2563eb;
      color: white;
    }

    .video-list {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 0 0 6px 6px;
      background: white;
    }

    .video-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
      cursor: pointer;
    }

    .video-item:last-child {
      border-bottom: none;
    }

    .video-item:hover {
      background: #f8fafc;
    }

    .video-item:hover .video-actions {
      opacity: 1;
    }

    .video-item.selected {
      background: #eff6ff;
      border-left: 3px solid #2563eb;
      padding-left: calc(0.75rem - 3px);
    }

    .video-item.neopro {
      background: #fefce8;
    }

    .video-item.neopro:hover {
      background: #fef9c3;
    }

    .video-item.to-deploy {
      background: #fff7ed;
      border-left: 3px solid #f59e0b;
      padding-left: calc(0.75rem - 3px);
    }

    .video-item.to-deploy:hover {
      background: #ffedd5;
    }

    .video-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .video-subcat {
      font-size: 0.65rem;
      color: #94a3b8;
      font-weight: 400;
    }

    .video-category {
      font-size: 0.7rem;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .video-duration {
      font-size: 0.7rem;
      color: #64748b;
      font-family: monospace;
    }

    .video-size {
      font-size: 0.75rem;
      color: #64748b;
    }

    .video-date {
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .video-owner {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .owner-neopro {
      background: #fef3c7;
      color: #92400e;
    }

    .owner-club {
      background: #dbeafe;
      color: #1e40af;
    }

    .video-status {
      font-size: 0.875rem;
    }

    .video-status.deploying {
      color: #2563eb;
    }

    .video-status.deploy-success {
      color: #16a34a;
    }

    .video-status.deploy-error {
      color: #dc2626;
      cursor: help;
    }

    .deploy-spinner {
      display: inline-block;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .deploy-progress {
      font-size: 0.75rem;
      font-weight: 600;
      color: #2563eb;
      background: #eff6ff;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      min-width: 35px;
      text-align: center;
    }

    /* Actions */
    .video-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.25rem;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .action-btn {
      background: none;
      border: 1px solid transparent;
      font-size: 0.875rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: white;
      border-color: #e2e8f0;
    }

    .action-btn.preview:hover {
      background: #eff6ff;
      border-color: #2563eb;
    }

    .action-btn.deploy:hover {
      background: #f0fdf4;
      border-color: #22c55e;
    }

    .action-btn.delete:hover {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .no-videos {
      text-align: center;
      padding: 2rem;
      color: #64748b;
      border: 1px solid #e2e8f0;
      border-radius: 0 0 6px 6px;
      background: white;
    }

    .no-videos-icon {
      font-size: 2rem;
      display: block;
      margin-bottom: 0.5rem;
    }

    .no-videos p {
      margin: 0;
      font-size: 0.875rem;
    }

    .library-legend {
      display: flex;
      gap: 1rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
      flex-wrap: wrap;
    }

    .legend-item {
      font-size: 0.75rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .legend-icon {
      font-size: 0.875rem;
    }

    /* Preview Popup */
    .preview-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 2rem;
    }

    .preview-modal {
      background: white;
      border-radius: 12px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .preview-title {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .preview-filename {
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
    }

    .preview-meta {
      font-size: 0.75rem;
      color: #64748b;
    }

    .preview-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #64748b;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .preview-close:hover {
      background: #e2e8f0;
      color: #1e293b;
    }

    .preview-content {
      flex: 1;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 300px;
    }

    .preview-video {
      max-width: 100%;
      max-height: 60vh;
    }

    .preview-footer {
      display: flex;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      align-items: center;
    }

    .preview-info {
      font-size: 0.75rem;
      color: #64748b;
    }

    .preview-status {
      margin-left: auto;
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
    }

    .preview-status.on-pi {
      background: #dcfce7;
      color: #166534;
    }

    .preview-status.pending {
      background: #fef3c7;
      color: #92400e;
    }

    .preview-unavailable {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: #64748b;
    }

    .unavailable-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .preview-unavailable p {
      margin: 0;
      font-size: 1rem;
      font-weight: 500;
      color: #475569;
    }

    .unavailable-hint {
      font-size: 0.75rem;
      margin-top: 0.5rem;
      color: #94a3b8;
    }

    /* Confirmation Modal */
    .confirm-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
    }

    .confirm-modal {
      background: white;
      border-radius: 12px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .confirm-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .confirm-header h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .confirm-icon {
      font-size: 1.5rem;
    }

    .confirm-content {
      padding: 1rem 1.5rem;
    }

    .confirm-content p {
      margin: 0 0 0.75rem;
      color: #475569;
    }

    .confirm-video-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .confirm-video-info .video-name {
      font-weight: 500;
      color: #1e293b;
      font-size: 0.875rem;
    }

    .confirm-video-info .video-meta {
      font-size: 0.75rem;
      color: #64748b;
    }

    .confirm-warning {
      font-size: 0.75rem;
      color: #dc2626;
      font-style: italic;
    }

    .confirm-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 0 0 12px 12px;
    }

    /* For this site badge */
    .for-this-site-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 0.375rem;
      font-size: 0.75rem;
      color: #f59e0b;
      vertical-align: middle;
    }

    .video-item.for-this-site {
      background: linear-gradient(90deg, #fffbeb 0%, transparent 20%);
    }
  `]
})
export class VideoLibraryComponent implements OnChanges {
  @Input() videos: LocalVideo[] = [];
  @Input() cloudVideos: CloudVideo[] = [];
  @Input() storage: LocalStorage | null = null;
  @Input() selectedPath: string = '';
  @Input() deployStates: Map<string, VideoDeployState> = new Map();
  @Input() siteId: string | null = null; // Current site ID for showing "for this site" badge

  @Output() videoSelect = new EventEmitter<VideoItem>();
  @Output() videoPreview = new EventEmitter<VideoItem>();
  @Output() videoDeploy = new EventEmitter<VideoItem>();
  @Output() videoDelete = new EventEmitter<VideoItem>();
  @Output() bulkDeploy = new EventEmitter<VideoItem[]>();
  @Output() bulkDelete = new EventEmitter<VideoItem[]>();

  filteredVideos: VideoItem[] = [];
  allVideos: VideoItem[] = [];
  categories: string[] = [];
  totalSize: number = 0;
  totalDuration: number = 0;
  statsOnPi: number = 0;
  statsToDeploy: number = 0;
  storagePercent: number = 0;

  // Expose isNaN to template
  isNaN = isNaN;

  searchQuery: string = '';
  statusFilter: 'all' | 'on_pi' | 'to_deploy' = 'all';
  ownerFilter: 'all' | 'club' | 'neopro' = 'all';
  categoryFilter: string = 'all';

  sortField: SortField = 'filename';
  sortDirection: SortDirection = 'asc';

  // Selection mode
  selectionMode: boolean = false;
  selectedVideos: Set<string> = new Set(); // Set of video paths

  // Delete confirmation
  deleteConfirmVideo: VideoItem | null = null;

  previewVideo: VideoItem | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videos'] || changes['cloudVideos']) {
      this.processVideos();
      this.applyFilters();
    }
    if (changes['storage'] && this.storage) {
      this.storagePercent = (this.storage.used / this.storage.total) * 100;
    }
  }

  private processVideos(): void {
    // Build maps for comparison - using multiple keys for robust matching
    const localByFilename = new Map(
      this.videos.map(v => [v.filename.toLowerCase(), v])
    );
    const localByChecksum = new Map(
      this.videos.filter(v => v.checksum).map(v => [v.checksum!, v])
    );

    // Track which cloud videos we've already added to avoid duplicates
    const seenCloudIds = new Set<string>();
    const seenFilenames = new Set<string>();

    const cloudMapped: VideoItem[] = [];

    for (const cloud of this.cloudVideos) {
      // Skip if we've already processed a video with this ID
      if (seenCloudIds.has(cloud.id)) {
        continue;
      }

      // Skip if we've already processed a video with this filename (case-insensitive)
      const filenameLower = cloud.filename.toLowerCase();
      if (seenFilenames.has(filenameLower)) {
        continue;
      }

      seenCloudIds.add(cloud.id);
      seenFilenames.add(filenameLower);

      // Try to find matching local video by checksum first, then by filename
      let isOnPi = false;
      if (cloud.checksum && localByChecksum.has(cloud.checksum)) {
        isOnPi = true;
      } else if (localByFilename.has(filenameLower)) {
        // Fallback to filename comparison
        isOnPi = true;
      }

      cloudMapped.push({
        id: cloud.id,
        path: cloud.url,
        filename: cloud.filename,
        displayName: cloud.title || cloud.originalName || cloud.filename,
        category: cloud.category,
        subcategory: cloud.subcategory,
        size: cloud.size,
        duration: cloud.duration,
        isOnPi,
        owner: this.detectOwner(cloud.filename),
        source: 'cloud' as const,
        lastModified: cloud.updatedAt?.toString(),
        uploadedForSiteId: cloud.uploadedForSiteId
      });
    }

    // Local videos not in cloud list
    const localOnlyMapped: VideoItem[] = this.videos
      .filter(local => !seenFilenames.has(local.filename.toLowerCase()))
      .map(local => ({
        id: null,
        path: local.path,
        filename: local.filename,
        displayName: local.filename, // Local videos use filename directly
        category: local.category,
        subcategory: local.subcategory,
        size: local.size,
        duration: local.duration || null, // Use duration from Pi if available
        isOnPi: true,
        owner: this.detectOwner(local.path),
        source: 'local' as const,
        lastModified: local.lastModified
      }));

    this.allVideos = [...cloudMapped, ...localOnlyMapped];

    const cats = new Set<string>();
    this.allVideos.forEach(v => {
      if (v.category) cats.add(v.category);
    });
    this.categories = Array.from(cats).sort();

    this.totalSize = this.allVideos.reduce((sum, v) => sum + (v.size || 0), 0);
    this.totalDuration = this.allVideos.reduce((sum, v) => sum + (v.duration || 0), 0);
    this.statsOnPi = this.allVideos.filter(v => v.isOnPi).length;
    this.statsToDeploy = this.allVideos.filter(v => !v.isOnPi).length;
  }

  private detectOwner(pathOrFilename: string): 'club' | 'neopro' {
    const neoproPaths = ['SPONSORS', 'NEOPRO', 'PUBLICITES', 'ANIMATIONS', 'PUB_'];
    return neoproPaths.some(p => pathOrFilename.toUpperCase().includes(p)) ? 'neopro' : 'club';
  }

  toggleSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  getSortIcon(field: SortField): string {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  applyFilters(): void {
    let filtered = [...this.allVideos];

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.displayName.toLowerCase().includes(query) ||
        v.filename.toLowerCase().includes(query) ||
        v.path.toLowerCase().includes(query)
      );
    }

    if (this.statusFilter === 'on_pi') {
      filtered = filtered.filter(v => v.isOnPi);
    } else if (this.statusFilter === 'to_deploy') {
      filtered = filtered.filter(v => !v.isOnPi);
    }

    if (this.ownerFilter !== 'all') {
      filtered = filtered.filter(v => v.owner === this.ownerFilter);
    }

    if (this.categoryFilter !== 'all') {
      filtered = filtered.filter(v => v.category === this.categoryFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (this.sortField) {
        case 'filename':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
        case 'lastModified': {
          const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.filteredVideos = filtered;
  }

  selectVideo(video: VideoItem): void {
    this.selectedPath = video.path;
    this.videoSelect.emit(video);
  }

  onPreview(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.previewVideo = video;
    this.videoPreview.emit(video);
  }

  closePreview(): void {
    this.previewVideo = null;
  }

  onDeploy(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.videoDeploy.emit(video);
  }

  onDelete(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.deleteConfirmVideo = video;
  }

  confirmDelete(): void {
    if (this.deleteConfirmVideo) {
      this.videoDelete.emit(this.deleteConfirmVideo);
      this.deleteConfirmVideo = null;
    }
  }

  cancelDelete(): void {
    this.deleteConfirmVideo = null;
  }

  // Selection methods
  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedVideos.clear();
    }
  }

  isSelected(video: VideoItem): boolean {
    return this.selectedVideos.has(video.path);
  }

  toggleSelection(video: VideoItem, event: Event): void {
    event.stopPropagation();
    if (this.selectedVideos.has(video.path)) {
      this.selectedVideos.delete(video.path);
    } else {
      this.selectedVideos.add(video.path);
    }
  }

  isAllSelected(): boolean {
    return this.filteredVideos.length > 0 &&
           this.filteredVideos.every(v => this.selectedVideos.has(v.path));
  }

  toggleSelectAll(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.filteredVideos.forEach(v => this.selectedVideos.add(v.path));
    } else {
      this.filteredVideos.forEach(v => this.selectedVideos.delete(v.path));
    }
  }

  getSelectedVideos(): VideoItem[] {
    return this.filteredVideos.filter(v => this.selectedVideos.has(v.path));
  }

  getSelectedToDeploy(): VideoItem[] {
    return this.getSelectedVideos().filter(v => !v.isOnPi && v.source === 'cloud');
  }

  getSelectedToDelete(): VideoItem[] {
    return this.getSelectedVideos().filter(v => v.owner !== 'neopro');
  }

  onBulkDeploy(): void {
    const toDeploy = this.getSelectedToDeploy();
    if (toDeploy.length > 0) {
      this.bulkDeploy.emit(toDeploy);
      this.selectedVideos.clear();
    }
  }

  onBulkDelete(): void {
    const toDelete = this.getSelectedToDelete();
    if (toDelete.length > 0) {
      this.bulkDelete.emit(toDelete);
      this.selectedVideos.clear();
    }
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes == null || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h${mins.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getDeployState(video: VideoItem): VideoDeployState | null {
    if (!video.id) return null;
    return this.deployStates.get(video.id) || null;
  }

  isDeploying(video: VideoItem): boolean {
    const state = this.getDeployState(video);
    return state?.status === 'deploying';
  }

  /**
   * Check if the video was specifically uploaded for the current site
   */
  isUploadedForThisSite(video: VideoItem): boolean {
    return !!(this.siteId && video.uploadedForSiteId && video.uploadedForSiteId === this.siteId);
  }
}
