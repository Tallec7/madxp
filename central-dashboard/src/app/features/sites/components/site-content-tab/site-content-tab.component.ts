import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subscription, filter, take, forkJoin } from 'rxjs';
import { SitesService, PendingDeployment } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { SocketService } from '../../../../core/services/socket.service';
import { DraftService, ConfigDraft, DraftValidationResult, OrchestratedDeploymentProgress } from '../../../../core/services/draft.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import {
  SiteConfiguration,
  CategoryConfig,
  LocalVideo,
  CloudVideo,
  LocalStorage,
  ConfigDiff,
  ConfigHistory,
  SiteSponsor
} from '../../../../core/models';
import { VideoLibraryComponent, VideoItem, VideoDeployState } from '../video-library/video-library.component';
import { RemotePreviewComponent } from '../remote-preview/remote-preview.component';
import { VideoUploadZoneComponent, UploadedVideo } from '../video-upload-zone/video-upload-zone.component';
import { LoopManagerComponent } from '../loop-manager/loop-manager.component';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Interface unifiée pour les vidéos dans les dropdowns
 * Fusionne LocalVideo + CloudVideo avec indicateurs de statut
 */
interface UnifiedVideoOption {
  path: string;           // Chemin unique (clé de sélection)
  filename: string;       // Nom du fichier
  displayName: string;    // Nom affiché (title ou filename)
  category: string | null;
  isOnPi: boolean;        // ✅ Déjà sur le Pi
  isForThisSite: boolean; // ⭐ Uploadée spécifiquement pour ce site
  isCloud: boolean;       // ☁️ Disponible dans le cloud
  source: 'local' | 'cloud' | 'both';
  cloudId?: string;       // ID cloud pour le déploiement
}

type VideoOptionGroup = 'forThisSite' | 'onPi' | 'cloud';

/**
 * Interface pour les items de diff avec labels lisibles
 */
interface HumanReadableDiff {
  label: string;           // Ex: "Catégorie MATCH > Sous-cat BUTS > vidéo 2"
  type: 'added' | 'removed' | 'changed';
  summary: string;         // Ex: "Vidéo changée: JOUEUR_95.mp4 → VICTOIRE.mp4"
  oldValue?: unknown;
  newValue?: unknown;
  isInternal?: boolean;    // owner, locked - à filtrer
}

@Component({
  selector: 'app-site-content-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, VideoLibraryComponent, RemotePreviewComponent, VideoUploadZoneComponent, LoopManagerComponent, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="content-tab">
      <!-- Header avec actions globales -->
      <div class="content-header">
        <div class="header-info">
          <span class="sync-status" *ngIf="lastSyncTime">
            Dernière sync: {{ lastSyncTime | date:'short' }}
          </span>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-sm btn-outline"
            (click)="refreshFromPi()"
            [disabled]="!isConnected || refreshingFromPi"
            [title]="isConnected ? 'Récupérer la configuration actuelle du Pi' : 'Le Pi doit être connecté'"
          >
            <span *ngIf="refreshingFromPi">⏳</span>
            <span *ngIf="!refreshingFromPi">🔄</span>
            {{ refreshingFromPi ? 'Synchronisation...' : 'Rafraîchir depuis le Pi' }}
          </button>
        </div>
      </div>

      <!-- Zone Upload Contextuelle -->
      <div class="section">
        <app-video-upload-zone
          [siteId]="siteId"
          [siteName]="siteName"
          (uploadComplete)="onVideoUploaded($event)"
          (allUploadsComplete)="onAllVideosUploaded($event)"
        ></app-video-upload-zone>
      </div>

      <!-- Indicateur Brouillon -->
      <div class="draft-indicator" *ngIf="draft || isDirty">
        <div class="draft-info">
          <span class="draft-icon">📝</span>
          <div class="draft-text">
            <span class="draft-title" *ngIf="isDirty">Modifications non enregistrées</span>
            <span class="draft-title" *ngIf="draft && !isDirty">Brouillon sauvegardé</span>
            <span class="draft-time" *ngIf="draft">Dernière modification: {{ draft.updated_at | date:'short' }}</span>
          </div>
        </div>
        <div class="draft-actions">
          <button class="btn btn-sm btn-secondary" (click)="saveDraft()" [disabled]="!isDirty || savingDraft">
            {{ savingDraft ? 'Sauvegarde...' : 'Sauvegarder' }}
          </button>
          <button class="btn btn-sm btn-outline" (click)="deleteDraft()" *ngIf="draft" [disabled]="savingDraft">
            Supprimer brouillon
          </button>
        </div>
      </div>

      <!-- Progression Déploiement Orchestré -->
      <div class="orchestrated-deployment" *ngIf="orchestratedDeployment">
        <div class="deployment-header">
          <span class="deployment-icon">🚀</span>
          <span class="deployment-title">Déploiement en cours</span>
          <span class="deployment-status" [class]="'status-' + orchestratedDeployment.status">
            {{ getDeploymentStatusText(orchestratedDeployment.status) }}
          </span>
        </div>
        <div class="deployment-progress">
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="orchestratedDeployment.overallProgress"></div>
          </div>
          <span class="progress-text">{{ orchestratedDeployment.overallProgress }}%</span>
        </div>
        <div class="deployment-details">
          <span *ngIf="orchestratedDeployment.totalVideos > 0">
            Vidéos: {{ orchestratedDeployment.videosCompleted }}/{{ orchestratedDeployment.totalVideos }}
            <span *ngIf="orchestratedDeployment.videosFailed > 0" class="failed-count">
              ({{ orchestratedDeployment.videosFailed }} échoué(s))
            </span>
          </span>
          <span *ngIf="orchestratedDeployment.configDeployed">✅ Configuration appliquée</span>
        </div>
        <div class="deployment-error" *ngIf="orchestratedDeployment.errorMessage">
          {{ orchestratedDeployment.errorMessage }}
        </div>
      </div>

      <!-- Déploiements en attente -->
      <div class="pending-deployments" *ngIf="pendingDeployments.length > 0">
        <div class="pending-header">
          <span class="pending-icon">⏳</span>
          <span class="pending-title">{{ 'content.pendingDeployments' | translate }} ({{ pendingDeployments.length }})</span>
          <button class="btn btn-sm btn-outline" (click)="refreshPendingDeployments()" [disabled]="loadingPendingDeployments">
            {{ loadingPendingDeployments ? '⏳' : '🔄' }}
          </button>
        </div>
        <div class="pending-list">
          <div class="pending-item" *ngFor="let deployment of pendingDeployments">
            <span class="pending-video">{{ deployment.video_title || deployment.filename }}</span>
            <span class="pending-status" [class]="'status-' + deployment.status">
              {{ deployment.status === 'pending' ? ('⏳ ' + ('content.statusPending' | translate)) : ('🚀 ' + ('content.statusInProgress' | translate)) }}
            </span>
            <span class="pending-progress" *ngIf="deployment.status === 'in_progress'">
              {{ deployment.progress }}%
            </span>
            <span class="pending-date">{{ deployment.created_at | date:'short' }}</span>
            <button
              class="btn btn-sm btn-danger-outline"
              (click)="cancelPendingDeployment(deployment)"
              [disabled]="cancellingDeploymentId === deployment.id"
              [title]="'content.cancelDeployment' | translate"
            >
              {{ cancellingDeploymentId === deployment.id ? '⏳' : '✕' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Bandeau de santé configuration -->
      <div class="config-health-bar" *ngIf="config">
        <a class="health-step" (click)="scrollToSection('library')" [class.ok]="totalVideoCount > 0"
           title="Nombre total de vidéos disponibles (Pi + Cloud)">
          <span class="health-icon">📚</span>
          <span class="health-label">Vidéos</span>
          <span class="health-value">{{ totalVideoCount }}</span>
        </a>
        <span class="health-arrow">→</span>
        <a class="health-step" (click)="scrollToSection('loops')" [class.ok]="hasPhaseLoops()" [class.warn]="!hasPhaseLoops() && (config.sponsors?.length ?? 0) > 0"
           title="Les boucles par phase (avant-match/match/après-match) activent le tracking analytics. La boucle par défaut ne génère pas de données.">
          <span class="health-icon">🔄</span>
          <span class="health-label">Boucles</span>
          <span class="health-value" *ngIf="hasPhaseLoops()">3 phases ✅</span>
          <span class="health-value warn" *ngIf="!hasPhaseLoops()">⚠️ défaut</span>
        </a>
        <span class="health-arrow">→</span>
        <a class="health-step" (click)="scrollToSection('remote')" [class.ok]="getAssignedCategoryCount() > 0"
           title="Catégories assignées aux phases de la télécommande">
          <span class="health-icon">🎮</span>
          <span class="health-label">Télécommande</span>
          <span class="health-value">{{ getAssignedCategoryCount() }} catég.</span>
        </a>
        <span class="health-arrow">→</span>
        <a class="health-step" (click)="scrollToSection('analytics')" [class.ok]="getUnmappedAnalyticsCount() === 0" [class.warn]="getUnmappedAnalyticsCount() > 0"
           title="Chaque catégorie doit être mappée à un type analytics (sponsor, jingle, ambiance) pour apparaître dans les rapports">
          <span class="health-icon">📊</span>
          <span class="health-label">Analytics</span>
          <span class="health-value" *ngIf="getUnmappedAnalyticsCount() === 0">✅</span>
          <span class="health-value warn" *ngIf="getUnmappedAnalyticsCount() > 0">⚠️ {{ getUnmappedAnalyticsCount() }} non mappés</span>
        </a>
      </div>

      <!-- Compteurs d'impact -->
      <div class="impact-counters" *ngIf="config && (getTrackedVideoCount() > 0 || getFallbackVideoCount() > 0)">
        <span class="impact-tracked" *ngIf="getTrackedVideoCount() > 0"
              title="Vidéos dans les boucles par phase — génèrent des impressions analytics">
          ✅ {{ getTrackedVideoCount() }} vidéo(s) trackée(s)
        </span>
        <span class="impact-separator" *ngIf="getTrackedVideoCount() > 0 && getFallbackVideoCount() > 0">·</span>
        <span class="impact-fallback" *ngIf="getFallbackVideoCount() > 0"
              title="Vidéos dans la boucle par défaut uniquement — aucune donnée analytics générée">
          ⚠️ {{ getFallbackVideoCount() }} en fallback non tracké
        </span>
      </div>

      <!-- Bibliothèque Vidéo -->
      <div class="section" id="section-library">
        <app-video-library
          [videos]="localVideos"
          [cloudVideos]="cloudVideos"
          [storage]="localStorage"
          [selectedPath]="selectedVideoPath"
          [deployStates]="videoDeployStates"
          [siteId]="siteId"
          [configVideoPaths]="configVideoPaths"
          [pendingDeploymentVideoIds]="pendingDeploymentVideoIds"
          (videoSelect)="onVideoSelect($event)"
          (videoPreview)="onVideoPreview($event)"
          (videoDeploy)="onVideoDeploy($event)"
          (videoDelete)="onVideoDelete($event)"
        ></app-video-library>
      </div>

      <!-- Catégories -->
      <div class="section card">
        <div class="section-header">
          <h4>
            <span class="section-icon">📁</span>
            Catégories
          </h4>
          <button class="btn btn-sm btn-secondary" (click)="addCategory()">+ Catégorie</button>
        </div>
        <p class="section-desc">
          Organisez vos vidéos en catégories accessibles depuis la télécommande.
        </p>

        <div class="categories-list" *ngIf="config.categories && config.categories.length > 0">
          <div class="category-item" *ngFor="let cat of config.categories; let catIndex = index" [class.expanded]="expandedCategories[catIndex]" [class.neopro]="cat.owner === 'neopro'">
            <div class="category-header" (click)="toggleCategory(catIndex)">
              <span class="expand-icon">{{ expandedCategories[catIndex] ? '▼' : '▶' }}</span>
              <span class="category-icon">📂</span>
              <input
                type="text"
                [(ngModel)]="cat.name"
                (ngModelChange)="markDirty()"
                (click)="$event.stopPropagation()"
                placeholder="Nom de la catégorie"
                class="category-name-input"
              />
              <span class="category-stats">
                {{ getCategoryVideoCount(cat) }} vidéo(s)
              </span>
              <!-- Analytics type is managed via categoryMappings -->
              <div class="category-owner">
                <span class="owner-badge" [class.neopro]="cat.owner === 'neopro'" [class.club]="cat.owner !== 'neopro'">
                  {{ cat.owner === 'neopro' ? '🔒 NEOPRO' : 'CLUB' }}
                </span>
              </div>
              <button class="btn-remove-small" (click)="removeCategory(catIndex); $event.stopPropagation()">×</button>
            </div>

            <div class="category-content" *ngIf="expandedCategories[catIndex]">
              <!-- Vidéos de la catégorie -->
              <div class="category-videos">
                <div class="videos-header">
                  <span>Vidéos</span>
                  <button class="btn-add-tiny" (click)="addVideoToCategory(catIndex)">+ Vidéo</button>
                </div>
                <div class="video-list-compact" *ngIf="cat.videos && cat.videos.length > 0">
                  <div class="video-row" *ngFor="let video of cat.videos; let vidIndex = index">
                    <select
                      [(ngModel)]="video.path"
                      (ngModelChange)="markDirty()"
                      class="video-select-compact"
                      [class.has-cloud-video]="isCloudVideoPath(video.path)"
                    >
                      <option value="">-- Sélectionner --</option>
                      <optgroup *ngFor="let group of videoOptionGroups; trackBy: trackByGroupKey" [label]="group.icon + ' ' + group.label">
                        <option *ngFor="let v of group.videos; trackBy: trackByVideoPath" [value]="v.path">{{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}</option>
                      </optgroup>
                    </select>
                    <input
                      type="text"
                      [(ngModel)]="video.name"
                      (ngModelChange)="markDirty()"
                      placeholder="Nom affiché"
                      class="video-name-compact"
                    />
                    <span class="cloud-badge" *ngIf="isCloudVideoPath(video.path)" title="Sera déployée automatiquement">⏳</span>
                    <span class="sponsor-badge-auto" *ngIf="getCategorySponsor(video.path) as sponsor" [title]="'Associé au sponsor ' + sponsor.name">🔗 {{ sponsor.name }}</span>
                    <button class="btn-remove-tiny" (click)="removeVideoFromCategory(catIndex, vidIndex)">×</button>
                  </div>
                </div>
                <p class="empty-hint" *ngIf="!cat.videos || cat.videos.length === 0">Aucune vidéo</p>
              </div>

              <!-- Sous-catégories -->
              <div class="subcategories">
                <div class="subcats-header">
                  <span>Sous-catégories</span>
                  <button class="btn-add-tiny" (click)="addSubcategory(catIndex)">+ Sous-cat</button>
                </div>
                <div class="subcat-list" *ngIf="cat.subCategories && cat.subCategories.length > 0">
                  <div class="subcat-item" *ngFor="let subcat of cat.subCategories; let subIndex = index">
                    <div class="subcat-header">
                      <span class="subcat-icon">📁</span>
                      <input
                        type="text"
                        [(ngModel)]="subcat.name"
                        (ngModelChange)="markDirty()"
                        placeholder="Nom sous-catégorie"
                        class="subcat-name-input"
                      />
                      <span class="subcat-stats">{{ subcat.videos.length || 0 }} vidéo(s)</span>
                      <button class="btn-add-tiny" (click)="addVideoToSubcategory(catIndex, subIndex)">+ Vidéo</button>
                      <button class="btn-remove-tiny" (click)="removeSubcategory(catIndex, subIndex)">×</button>
                    </div>
                    <div class="subcat-videos" *ngIf="subcat.videos && subcat.videos.length > 0">
                      <div class="video-row" *ngFor="let video of subcat.videos; let vidIndex = index">
                        <select
                          [(ngModel)]="video.path"
                          (ngModelChange)="markDirty()"
                          class="video-select-compact"
                          [class.has-cloud-video]="isCloudVideoPath(video.path)"
                        >
                          <option value="">-- Sélectionner --</option>
                          <optgroup *ngFor="let group of videoOptionGroups; trackBy: trackByGroupKey" [label]="group.icon + ' ' + group.label">
                            <option *ngFor="let v of group.videos; trackBy: trackByVideoPath" [value]="v.path">{{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}</option>
                          </optgroup>
                        </select>
                        <input
                          type="text"
                          [(ngModel)]="video.name"
                          (ngModelChange)="markDirty()"
                          placeholder="Nom affiché"
                          class="video-name-compact"
                        />
                        <span class="cloud-badge" *ngIf="isCloudVideoPath(video.path)" title="Sera déployée automatiquement">⏳</span>
                        <span class="sponsor-badge-auto" *ngIf="getCategorySponsor(video.path) as sponsor" [title]="'Associé au sponsor ' + sponsor.name">🔗 {{ sponsor.name }}</span>
                        <button class="btn-remove-tiny" (click)="removeVideoFromSubcategory(catIndex, subIndex, vidIndex)">×</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="empty-state" *ngIf="!config.categories || config.categories.length === 0">
          <p>Aucune catégorie définie</p>
          <button class="btn btn-primary btn-sm" (click)="addCategory()">Créer une catégorie</button>
        </div>
      </div>

      <!-- Boucles Vidéo (défaut + par phase) -->
      <div class="section" id="section-loops">
        <app-loop-manager
          [config]="config"
          [videoOptionGroups]="videoOptionGroups"
          [cloudVideoPaths]="cloudVideoPaths"
          [localVideos]="localVideos"
          [videoDurations]="videoDurations"
          [siteSponsors]="siteSponsors"
          (configChanged)="markDirty()"
        ></app-loop-manager>
      </div>

      <!-- Organisation Télécommande -->
      <div class="section card" id="section-remote">
        <div class="section-header">
          <h4>
            <span class="section-icon">📱</span>
            Organisation Télécommande
          </h4>
        </div>
        <p class="section-desc">
          Assigner les catégories aux blocs Avant-match / Match / Après-match
        </p>

        <div class="time-org-grid" *ngIf="config.categories && config.categories.length > 0">
          <div class="time-org-column" *ngFor="let tc of getTimeCategories()">
            <div class="time-org-header">
              <span class="time-org-icon">{{ tc.icon }}</span>
              <div class="time-org-info">
                <span class="time-org-name">{{ tc.name }}</span>
                <span class="time-org-desc">{{ tc.description }}</span>
              </div>
            </div>
            <div class="time-org-categories">
              <label class="category-checkbox" *ngFor="let cat of config.categories">
                <input
                  type="checkbox"
                  [checked]="isCategoryInTimeCategory(cat.id, tc.id)"
                  (change)="toggleCategoryInTimeCategory(cat.id, tc.id, $event)"
                />
                <span class="checkbox-label">{{ cat.name || 'Sans nom' }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="empty-state small" *ngIf="!config.categories || config.categories.length === 0">
          <p>Créez d'abord des catégories pour les assigner aux phases</p>
        </div>
      </div>

      <!-- Catégories Analytics -->
      <div class="section card" id="section-analytics">
        <div class="section-header">
          <h4>
            <span class="section-icon">📊</span>
            Catégories Analytics
          </h4>
        </div>
        <p class="section-desc">
          Mapper les catégories vers les catégories analytics pour le reporting.
          Si une catégorie a des sous-catégories, le mapping se fait au niveau des sous-catégories.
        </p>

        <div class="analytics-mappings" *ngIf="config.categories && config.categories.length > 0">
          <div class="analytics-row header">
            <span class="col-category">Catégorie</span>
            <span class="col-analytics">Type Analytics</span>
          </div>
          <ng-container *ngFor="let cat of config.categories; let i = index">
            <!-- Catégorie SANS sous-catégories : mapping direct -->
            <div class="analytics-row" *ngIf="!cat.subCategories?.length">
              <span class="col-category">{{ cat.name || 'Sans nom' }}</span>
              <select
                class="col-analytics analytics-select"
                [ngModel]="getCategoryAnalyticsType(cat.id)"
                (ngModelChange)="setCategoryAnalyticsType(cat.id, $event)"
              >
                <option value="">Non mappé</option>
                <option value="sponsor">Sponsor</option>
                <option value="jingle">Jingle</option>
                <option value="ambiance">Ambiance</option>
                <option value="other">Autre</option>
              </select>
              <button
                class="btn-suggestion"
                *ngIf="!getCategoryAnalyticsType(cat.id) && suggestAnalyticsType(cat.name)"
                (click)="setCategoryAnalyticsType(cat.id, suggestAnalyticsType(cat.name))"
                title="Suggestion basée sur le nom"
              >
                💡 {{ suggestAnalyticsType(cat.name) }}
              </button>
            </div>
            <!-- Catégorie AVEC sous-catégories : mapping par sous-cat -->
            <ng-container *ngIf="cat.subCategories?.length">
              <div class="analytics-row category-parent">
                <span class="col-category">{{ cat.name || 'Sans nom' }}</span>
                <span class="col-analytics analytics-hint">(voir sous-catégories)</span>
              </div>
              <div class="analytics-row subcategory" *ngFor="let subcat of cat.subCategories">
                <span class="col-category subcategory-name">↳ {{ subcat.name || 'Sans nom' }}</span>
                <select
                  class="col-analytics analytics-select"
                  [ngModel]="getCategoryAnalyticsType(subcat.id)"
                  (ngModelChange)="setCategoryAnalyticsType(subcat.id, $event)"
                >
                  <option value="">Non mappé</option>
                  <option value="sponsor">Sponsor</option>
                  <option value="jingle">Jingle</option>
                  <option value="ambiance">Ambiance</option>
                  <option value="other">Autre</option>
                </select>
                <button
                  class="btn-suggestion"
                  *ngIf="!getCategoryAnalyticsType(subcat.id) && suggestAnalyticsType(subcat.name)"
                  (click)="setCategoryAnalyticsType(subcat.id, suggestAnalyticsType(subcat.name))"
                  title="Suggestion basée sur le nom"
                >
                  💡 {{ suggestAnalyticsType(subcat.name) }}
                </button>
              </div>
            </ng-container>
          </ng-container>
        </div>
        <div class="empty-state small" *ngIf="!config.categories || config.categories.length === 0">
          <p>Créez d'abord des catégories pour configurer les analytics</p>
        </div>
      </div>

      <!-- Historique des modifications -->
      <div class="section card" id="section-history">
        <div class="section-header clickable" (click)="toggleHistory()">
          <h4>
            <span class="section-icon">📜</span>
            Historique des modifications
            <span class="history-count" *ngIf="configHistory.length > 0">({{ configHistoryTotal }})</span>
          </h4>
          <span class="expand-icon">{{ showHistory ? '▼' : '▶' }}</span>
        </div>

        <div class="history-content" *ngIf="showHistory">
          <div class="loading-inline" *ngIf="loadingHistory">
            <div class="spinner-small"></div>
            <span>Chargement de l'historique...</span>
          </div>

          <div class="history-list" *ngIf="!loadingHistory && configHistory.length > 0">
            <div class="history-item" *ngFor="let entry of configHistory; let entryIdx = index">
              <div class="history-header-row">
                <div class="history-meta">
                  <span class="history-date">{{ entry.deployed_at | date:'dd/MM/yyyy HH:mm' }}</span>
                  <span class="history-author" *ngIf="entry.deployed_by_name || entry.deployed_by_email">
                    par {{ entry.deployed_by_name || entry.deployed_by_email }}
                  </span>
                </div>
                <div class="history-entry-actions">
                  <button
                    class="btn-history-detail"
                    *ngIf="entry.changes_summary && entry.changes_summary.length > 0"
                    (click)="toggleHistoryDetail(entryIdx)"
                    title="Voir le détail des changements"
                  >
                    {{ expandedHistoryItems[entryIdx] ? '▼' : '▶' }} Détails
                  </button>
                  <button
                    class="btn-history-restore"
                    (click)="restoreVersion(entry)"
                    title="Restaurer cette version"
                  >
                    ↩ Restaurer
                  </button>
                </div>
              </div>
              <div class="history-comment" *ngIf="entry.comment">{{ entry.comment }}</div>
              <div class="history-changes" *ngIf="entry.changes_summary && entry.changes_summary.length > 0">
                <span class="history-changes-count">{{ entry.changes_summary!.length }} changement(s)</span>
                <span class="history-change-pills">
                  <span class="change-pill added" *ngIf="countChangeType(entry.changes_summary!, 'added') as n">+{{ n }}</span>
                  <span class="change-pill changed" *ngIf="countChangeType(entry.changes_summary!, 'changed') as n">~{{ n }}</span>
                  <span class="change-pill removed" *ngIf="countChangeType(entry.changes_summary!, 'removed') as n">-{{ n }}</span>
                </span>
              </div>

              <!-- Détail dépliable des changements -->
              <div class="history-detail" *ngIf="expandedHistoryItems[entryIdx] && entry.changes_summary">
                <div
                  class="history-diff-row"
                  *ngFor="let diff of entry.changes_summary"
                  [class]="'diff-type-' + diff.type"
                >
                  <span class="diff-type-badge">
                    <span *ngIf="diff.type === 'added'">+</span>
                    <span *ngIf="diff.type === 'changed'">~</span>
                    <span *ngIf="diff.type === 'removed'">−</span>
                  </span>
                  <span class="diff-path">{{ diff.path || diff.field }}</span>
                  <span class="diff-values" *ngIf="diff.type === 'changed'">
                    <span class="diff-old">{{ formatDiffValue(diff.oldValue) }}</span>
                    →
                    <span class="diff-new">{{ formatDiffValue(diff.newValue) }}</span>
                  </span>
                  <span class="diff-values" *ngIf="diff.type === 'added'">
                    <span class="diff-new">{{ formatDiffValue(diff.newValue) }}</span>
                  </span>
                  <span class="diff-values" *ngIf="diff.type === 'removed'">
                    <span class="diff-old">{{ formatDiffValue(diff.oldValue) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="empty-state small" *ngIf="!loadingHistory && configHistory.length === 0">
            <p>Aucun historique disponible</p>
          </div>

          <div class="history-actions" *ngIf="!loadingHistory && configHistoryTotal > configHistory.length">
            <button class="btn btn-sm btn-outline" (click)="loadMoreHistory()">
              Voir plus ({{ configHistoryTotal - configHistory.length }} restant(s))
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <!-- Deploy Status Banner -->
      <div class="deploy-status-banner" *ngIf="deployStatus !== 'idle'" [class]="'status-' + deployStatus">
        <div class="status-icon">
          <span *ngIf="deployStatus === 'sending'">📤</span>
          <span *ngIf="deployStatus === 'pending'">⏳</span>
          <span *ngIf="deployStatus === 'success'">✅</span>
          <span *ngIf="deployStatus === 'error'">❌</span>
          <span *ngIf="deployStatus === 'timeout'">⏱️</span>
        </div>
        <div class="status-content">
          <span class="status-text" *ngIf="deployStatus === 'sending'">Envoi de la configuration...</span>
          <span class="status-text" *ngIf="deployStatus === 'pending'">En attente de confirmation du Pi...</span>
          <span class="status-text" *ngIf="deployStatus === 'success'">Configuration appliquée avec succès !</span>
          <span class="status-text" *ngIf="deployStatus === 'error'">Erreur : {{ deployError }}</span>
          <span class="status-text" *ngIf="deployStatus === 'timeout'">{{ deployError }}</span>
        </div>
        <button class="status-close" *ngIf="deployStatus !== 'sending' && deployStatus !== 'pending'" (click)="resetDeployStatus()">×</button>
      </div>

      <!-- Warnings de validation (non bloquants) -->
      <div class="validation-warnings" *ngIf="isDirty && validationWarnings.length > 0">
        <div class="validation-warning" *ngFor="let w of validationWarnings">
          <span>⚠️</span> {{ w }}
        </div>
      </div>

      <div class="actions-bar" *ngIf="isDirty" [class.has-errors]="validationErrors.length > 0">
        <div class="actions-status">
          <span class="dirty-indicator">⚠️ Modifications non enregistrées</span>
          <span class="error-count" *ngIf="validationErrors.length > 0">
            ❌ {{ validationErrors.length }} erreur(s) de validation
          </span>
        </div>
        <div class="actions-buttons">
          <button class="btn btn-secondary" (click)="resetConfig()">{{ 'common.cancel' | translate }}</button>
          <button class="btn btn-primary" (click)="previewDeploy()" [disabled]="deploying || validationErrors.length > 0">
            {{ deploying ? ('common.deploying' | translate) : (isConnected ? ('common.deploy' | translate) : ('common.deployQueued' | translate)) }}
          </button>
        </div>
      </div>

      <!-- FAB Preview Télécommande -->
      <button
        class="fab-preview"
        *ngIf="config"
        (click)="showRemotePreview = !showRemotePreview"
        [class.active]="showRemotePreview"
        title="Aperçu télécommande"
      >
        📱
      </button>

      <!-- Panneau Preview sticky -->
      <div class="preview-panel" *ngIf="showRemotePreview" (click)="showRemotePreview = false">
        <div class="preview-panel-content" (click)="$event.stopPropagation()">
          <div class="preview-panel-header">
            <h4>Aperçu Télécommande</h4>
            <button class="preview-close" (click)="showRemotePreview = false">×</button>
          </div>
          <app-remote-preview
            [config]="config"
            [localVideos]="localVideos"
          ></app-remote-preview>
        </div>
      </div>

      <!-- Delete Video Modal -->
      <div class="modal" *ngIf="showDeleteModal" (click)="showDeleteModal = false">
        <div class="modal-content modal-delete" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Supprimer une vidéo</h2>
            <button class="modal-close" (click)="showDeleteModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <p class="delete-filename">"{{ deleteTarget?.displayName || deleteTarget?.filename }}"</p>

            <!-- Only on Pi -->
            <div *ngIf="deleteCanPi && !deleteCanCloud">
              <p class="delete-description">Cette vidéo est uniquement sur le <strong>Pi</strong>.</p>
            </div>

            <!-- Only in cloud -->
            <div *ngIf="!deleteCanPi && deleteCanCloud">
              <p class="delete-description">Cette vidéo est uniquement dans le <strong>cloud</strong>.</p>
            </div>

            <!-- On both -->
            <div *ngIf="deleteCanPi && deleteCanCloud" class="delete-choices">
              <p class="delete-description">Cette vidéo est sur le <strong>Pi</strong> et dans le <strong>cloud</strong>. Que souhaitez-vous supprimer ?</p>
            </div>
          </div>
          <div class="modal-footer delete-actions">
            <button class="btn btn-secondary" (click)="showDeleteModal = false">Annuler</button>
            <button *ngIf="deleteCanPi" class="btn btn-delete-pi" (click)="executeDelete('pi')">
              Supprimer du Pi
            </button>
            <button *ngIf="deleteCanCloud" class="btn btn-delete-cloud" (click)="executeDelete('cloud')">
              Supprimer du cloud
            </button>
            <button *ngIf="deleteCanPi && deleteCanCloud" class="btn btn-delete-both" (click)="executeDelete('both')">
              Supprimer des deux
            </button>
          </div>
        </div>
      </div>

      <!-- Diff Preview Modal -->
      <div class="modal" *ngIf="showDiffModal" (click)="showDiffModal = false">
        <div class="modal-content modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Aperçu des changements</h2>
            <button class="modal-close" (click)="showDiffModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="mode-selector">
              <div class="mode-title">Mode de déploiement</div>
              <div class="mode-options">
                <label class="mode-option" [class.active]="deployMode === 'merge'">
                  <input type="radio" name="deployMode" value="merge" [(ngModel)]="deployMode" />
                  <div class="mode-option-content">
                    <span class="mode-option-title">🔀 Fusionner (recommandé)</span>
                    <span class="mode-option-desc">Préserve les paramètres locaux du Pi (langue, timezone, etc.)</span>
                  </div>
                </label>
                <label class="mode-option" [class.active]="deployMode === 'replace'">
                  <input type="radio" name="deployMode" value="replace" [(ngModel)]="deployMode" />
                  <div class="mode-option-content">
                    <span class="mode-option-title">🔄 Remplacer</span>
                    <span class="mode-option-desc">Écrase tout - utilisez si les modifications ne s'appliquent pas</span>
                  </div>
                </label>
              </div>
              <div class="mode-help" *ngIf="deployMode === 'merge'">
                <span class="mode-help-icon">💡</span>
                <span class="mode-help-text">
                  Si vos modifications ne s'appliquent pas après le déploiement, essayez le mode <strong>Remplacer</strong>
                  ou mettez à jour le sync-agent depuis l'onglet <strong>Paramètres</strong>.
                </span>
              </div>
              <div class="mode-warning" *ngIf="deployMode === 'replace'">
                <span class="mode-warning-icon">⚠️</span>
                <span class="mode-warning-text">
                  Ce mode écrase les paramètres locaux du Pi. Les vidéos ajoutées localement par le club seront perdues.
                </span>
              </div>
            </div>

            <div *ngIf="diffLoading" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Calcul des différences...</span>
            </div>
            <div *ngIf="!diffLoading && humanReadableDiff.length === 0" class="no-changes">
              Aucun changement détecté par rapport à la configuration actuelle
            </div>
            <div *ngIf="!diffLoading && humanReadableDiff.length > 0" class="diff-list">
              <div class="diff-summary">
                <div class="diff-total">{{ humanReadableDiff.length }} changement(s)</div>
                <div class="diff-pill added" *ngIf="diffCounts.added > 0">+ {{ diffCounts.added }} ajout(s)</div>
                <div class="diff-pill changed" *ngIf="diffCounts.changed > 0">~ {{ diffCounts.changed }} modif(s)</div>
                <div class="diff-pill removed" *ngIf="diffCounts.removed > 0">- {{ diffCounts.removed }} suppression(s)</div>
              </div>

              <!-- Affichage groupé par section -->
              <div class="diff-section" *ngFor="let group of groupedDiff">
                <div class="diff-section-header">
                  <span class="diff-section-icon">{{ group.icon }}</span>
                  <span class="diff-section-title">{{ group.section }}</span>
                  <span class="diff-section-count">{{ group.items.length }}</span>
                </div>
                <div class="diff-section-items">
                  <div class="diff-item-compact" *ngFor="let diff of group.items; let i = index" [class]="'diff-' + diff.type">
                    <div class="diff-badge-icon">
                      <span *ngIf="diff.type === 'added'" class="badge-icon added">+</span>
                      <span *ngIf="diff.type === 'removed'" class="badge-icon removed">−</span>
                      <span *ngIf="diff.type === 'changed'" class="badge-icon changed">~</span>
                    </div>
                    <div class="diff-item-content">
                      <div class="diff-item-header">
                        <div class="diff-item-label">{{ diff.label }}</div>
                        <button
                          class="diff-toggle-btn"
                          *ngIf="diff.oldValue || diff.newValue"
                          (click)="toggleDiffDetail(group.section + '-' + i)"
                        >
                          {{ expandedDiffItems[group.section + '-' + i] ? '▼' : '▶' }} Détails
                        </button>
                      </div>
                      <div class="diff-item-summary">{{ diff.summary }}</div>

                      <!-- Détails dépliables -->
                      <div class="diff-detail" *ngIf="expandedDiffItems[group.section + '-' + i]">
                        <div class="diff-detail-row" *ngIf="diff.type === 'changed' || diff.type === 'removed'">
                          <span class="diff-detail-label">Avant:</span>
                          <pre class="diff-detail-value old">{{ formatDiffValue(diff.oldValue) }}</pre>
                        </div>
                        <div class="diff-detail-row" *ngIf="diff.type === 'changed' || diff.type === 'added'">
                          <span class="diff-detail-label">Après:</span>
                          <pre class="diff-detail-value new">{{ formatDiffValue(diff.newValue) }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDiffModal = false">{{ 'common.cancel' | translate }}</button>
            <button
              class="btn btn-primary"
              (click)="confirmDeploy()"
              [disabled]="deploying"
            >
              {{ deploying ? ('common.deploying' | translate) : ('common.confirmDeploy' | translate) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .content-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Deploy Status Banner */
    .deploy-status-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .deploy-status-banner.status-sending,
    .deploy-status-banner.status-pending {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }

    .deploy-status-banner.status-success {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }

    .deploy-status-banner.status-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }

    .deploy-status-banner.status-timeout {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }

    .status-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .status-content {
      flex: 1;
    }

    .status-text {
      font-weight: 500;
    }

    .status-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      opacity: 0.6;
      padding: 0;
      line-height: 1;
    }

    .status-close:hover {
      opacity: 1;
    }

    /* Pending animation */
    .status-pending .status-icon {
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .content-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .sync-status {
      font-size: 0.8125rem;
      color: #64748b;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-outline {
      background: white;
      border: 1px solid #e2e8f0;
      color: #475569;
    }

    .btn-outline:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .btn-outline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .section {
      margin-bottom: 0;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .section-header h4 {
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

    .section-desc {
      margin: 0 0 1rem 0;
      font-size: 0.875rem;
      color: #64748b;
    }

    /* Sponsors / Boucle par défaut */
    .sponsors-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .sponsor-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .sponsor-item.neopro {
      background: #fefce8;
      border-color: #fde047;
    }

    .sponsor-order {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
    }

    .sponsor-content {
      flex: 1;
      display: flex;
      gap: 0.5rem;
    }

    .sponsor-name-input {
      width: 150px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .sponsor-path-input, .video-select {
      flex: 1;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .video-select.has-cloud-video {
      border-color: #f59e0b;
      background: #fffbeb;
    }

    .cloud-hint {
      font-size: 0.6875rem;
      color: #92400e;
      background: #fef3c7;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .cloud-badge {
      font-size: 0.75rem;
      color: #92400e;
    }
    .sponsor-badge-auto {
      display: inline-block;
      font-size: 0.7rem;
      color: #1e40af;
      background: #dbeafe;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      padding: 0.1rem 0.4rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: help;
    }

    .sponsor-owner {
      display: flex;
      gap: 0.5rem;
    }

    .owner-radio {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .owner-radio input {
      margin: 0;
    }

    .owner-label {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .owner-label.club {
      background: #dbeafe;
      color: #1e40af;
    }

    .owner-label.neopro {
      background: #fef3c7;
      color: #92400e;
    }

    .btn-remove {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: #fee2e2;
      color: #dc2626;
      font-size: 1.25rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-remove:hover {
      background: #fecaca;
    }

    /* Categories */
    .categories-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .category-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .category-item.neopro {
      background: #fefce8;
      border-color: #fde047;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .category-header:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #64748b;
      width: 16px;
    }

    .category-icon {
      font-size: 1rem;
    }

    .category-name-input {
      flex: 1;
      padding: 0.25rem 0.5rem;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      background: transparent;
    }

    .category-name-input:focus {
      border-color: #e2e8f0;
      background: white;
      outline: none;
    }

    .category-stats {
      font-size: 0.75rem;
      color: #64748b;
    }

    .analytics-select {
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
      background: white;
    }

    .category-owner {
      margin-left: auto;
    }

    .owner-badge {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }

    .owner-badge.club {
      background: #dbeafe;
      color: #1e40af;
    }

    .owner-badge.neopro {
      background: #fef3c7;
      color: #92400e;
    }

    .btn-remove-small {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #94a3b8;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-remove-small:hover {
      background: #fee2e2;
      color: #dc2626;
    }

    .category-content {
      padding: 0.75rem;
      border-top: 1px solid #e2e8f0;
      background: rgba(255, 255, 255, 0.5);
    }

    .category-videos, .subcategories {
      margin-bottom: 1rem;
    }

    .category-videos:last-child, .subcategories:last-child {
      margin-bottom: 0;
    }

    .videos-header, .subcats-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
    }

    .btn-add-tiny {
      padding: 0.125rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: white;
      font-size: 0.6875rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-add-tiny:hover {
      background: #f1f5f9;
    }

    .video-list-compact {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .video-row {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .video-select-compact, .video-input-compact {
      flex: 2;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .video-name-compact {
      flex: 1;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .btn-remove-tiny {
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #94a3b8;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .btn-remove-tiny:hover {
      background: #fee2e2;
      color: #dc2626;
    }

    .subcat-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .subcat-item {
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.75);
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .subcat-header {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      margin-bottom: 0.375rem;
    }

    .subcat-icon {
      font-size: 0.875rem;
    }

    .subcat-name-input {
      flex: 1;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .subcat-stats {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .subcat-videos {
      padding-left: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .empty-state p {
      margin: 0 0 1rem 0;
    }

    .empty-hint {
      margin: 0;
      font-size: 0.75rem;
      color: #94a3b8;
      font-style: italic;
    }

    .empty-state.small {
      padding: 1rem;
    }

    .empty-state.small p {
      margin: 0;
      font-size: 0.8125rem;
    }

    /* Time Organization Grid */
    .time-org-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .time-org-column {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .time-org-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: white;
      border-bottom: 1px solid #e2e8f0;
    }

    .time-org-icon {
      font-size: 1.25rem;
    }

    .time-org-info {
      display: flex;
      flex-direction: column;
    }

    .time-org-name {
      font-size: 0.875rem;
      font-weight: 600;
    }

    .time-org-desc {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .time-org-categories {
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 200px;
      overflow-y: auto;
    }

    .category-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .category-checkbox:hover {
      background: #f1f5f9;
    }

    .category-checkbox input {
      width: 16px;
      height: 16px;
      accent-color: #2563eb;
    }

    .checkbox-label {
      font-size: 0.8125rem;
      color: #1e293b;
    }

    /* Phase Loops Grid */
    .phase-loops-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .phase-loop-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .phase-loop-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: white;
      border-bottom: 1px solid #e2e8f0;
    }

    .phase-loop-icon {
      font-size: 1rem;
    }

    .phase-loop-name {
      font-size: 0.875rem;
      font-weight: 600;
      flex: 1;
    }

    .phase-loop-count {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .phase-loop-content {
      padding: 0.75rem;
    }

    .phase-loop-videos {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .loop-video-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    .loop-video-order {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      border-radius: 4px;
      font-size: 0.625rem;
      font-weight: 600;
      color: #64748b;
    }

    .loop-video-name-input {
      flex: 1;
      min-width: 60px;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .loop-video-select {
      flex: 2;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .phase-loop-empty {
      padding: 0.5rem;
      text-align: center;
    }

    .phase-loop-actions {
      margin-top: 0.5rem;
      text-align: center;
    }

    .loop-hint {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .loop-hint.active {
      color: #16a34a;
    }

    /* Analytics Mappings */
    .analytics-mappings {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .analytics-row {
      display: grid;
      grid-template-columns: 1fr 200px;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      align-items: center;
    }

    .analytics-row:last-child {
      border-bottom: none;
    }

    .analytics-row.header {
      background: #f8fafc;
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }

    .col-category {
      font-size: 0.875rem;
    }

    .col-analytics {
      text-align: right;
    }

    .analytics-select {
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
      width: 100%;
    }

    .analytics-row.category-parent {
      background: #f8fafc;
    }

    .analytics-row.subcategory {
      background: #fafbfc;
    }

    .subcategory-name {
      padding-left: 1rem;
      color: #64748b;
    }

    .analytics-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      font-style: italic;
    }

    @media (max-width: 768px) {
      .time-org-grid,
      .phase-loops-grid {
        grid-template-columns: 1fr;
      }

      .analytics-row {
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }

      .col-analytics {
        text-align: left;
      }
    }

    /* Actions bar */
    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: #fef3c7;
      border-radius: 8px;
      border: 1px solid #fde047;
      position: sticky;
      bottom: 1rem;
    }

    .actions-bar.has-errors {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .actions-status {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .dirty-indicator {
      font-size: 0.875rem;
      font-weight: 500;
      color: #92400e;
    }

    .has-errors .dirty-indicator {
      color: #dc2626;
    }

    .error-count {
      font-size: 0.8125rem;
      color: #dc2626;
    }

    .actions-buttons {
      display: flex;
      gap: 0.5rem;
    }

    /* Validation errors */
    .input-error {
      border-color: #f87171 !important;
      background: #fef2f2 !important;
    }

    .has-error {
      border-color: #fecaca !important;
      background: #fef2f2 !important;
    }

    .error-hint {
      font-size: 0.75rem;
      color: #dc2626;
      margin-top: 0.25rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
      border: none;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover {
      background: #f8fafc;
    }

    /* Delete Modal */
    .modal-delete {
      max-width: 480px;
    }

    .delete-filename {
      font-weight: 600;
      font-size: 1.05rem;
      color: #1e293b;
      margin: 0 0 0.75rem;
      word-break: break-all;
    }

    .delete-description {
      color: #64748b;
      margin: 0;
      line-height: 1.5;
    }

    .delete-actions {
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .btn-delete-pi {
      background: #f59e0b;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-delete-pi:hover {
      background: #d97706;
    }

    .btn-delete-cloud {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-delete-cloud:hover {
      background: #2563eb;
    }

    .btn-delete-both {
      background: #ef4444;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-delete-both:hover {
      background: #dc2626;
    }

    /* Diff Modal */
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

    .modal-content.modal-large {
      max-width: 800px;
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

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .mode-selector {
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .mode-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.75rem;
    }

    .mode-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .mode-option {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .mode-option:hover {
      border-color: #cbd5e1;
    }

    .mode-option.active {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .mode-option input[type="radio"] {
      margin-top: 2px;
    }

    .mode-option-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .mode-option-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: #1e293b;
    }

    .mode-option-desc {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.4;
    }

    .mode-help, .mode-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.75rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      line-height: 1.4;
    }

    .mode-help {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      color: #0369a1;
    }

    .mode-warning {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      color: #92400e;
    }

    .mode-help-icon, .mode-warning-icon {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .mode-help-text, .mode-warning-text {
      flex: 1;
    }

    .mode-help-text strong, .mode-warning-text strong {
      font-weight: 600;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
    }

    .spinner-small {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-changes {
      text-align: center;
      padding: 2rem;
      color: #64748b;
      background: #f8fafc;
      border-radius: 8px;
    }

    .diff-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .diff-summary {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.9rem 1rem;
      margin-bottom: 0.5rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .diff-total {
      font-weight: 600;
      color: #0f172a;
    }

    .diff-pill {
      padding: 0.3rem 0.65rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #0f172a;
      border: 1px solid transparent;
    }

    .diff-pill.added {
      background: #ecfdf3;
      color: #166534;
      border-color: #bbf7d0;
    }

    .diff-pill.changed {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    .diff-pill.removed {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fecdd3;
    }

    .diff-item {
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .diff-added {
      background: #ecfdf5;
      border-color: #10b981;
    }

    .diff-removed {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .diff-changed {
      background: #fffbeb;
      border-color: #f59e0b;
    }

    .diff-field {
      font-family: monospace;
      font-weight: 600;
      color: #0f172a;
    }

    .diff-head {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .diff-type {
      display: flex;
      gap: 0.25rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-success {
      background: #dcfce7;
      color: #166534;
    }

    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .diff-values {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .diff-old, .diff-new {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .diff-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 500;
    }

    .diff-json {
      background: #0f172a;
      color: #e2e8f0;
      padding: 0.75rem;
      border-radius: 8px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      max-height: 150px;
      overflow-y: auto;
    }

    /* New grouped diff styles */
    .diff-section {
      margin-bottom: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .diff-section:last-child {
      margin-bottom: 0;
    }

    .diff-section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .diff-section-icon {
      font-size: 1rem;
    }

    .diff-section-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: #1e293b;
      flex: 1;
    }

    .diff-section-count {
      background: #e2e8f0;
      color: #475569;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .diff-section-items {
      padding: 0.5rem;
    }

    .diff-item-compact {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.25rem;
    }

    .diff-item-compact:last-child {
      margin-bottom: 0;
    }

    .diff-item-compact.diff-added {
      background: #f0fdf4;
    }

    .diff-item-compact.diff-removed {
      background: #fef2f2;
    }

    .diff-item-compact.diff-changed {
      background: #fffbeb;
    }

    .diff-badge-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .badge-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 700;
    }

    .badge-icon.added {
      background: #dcfce7;
      color: #166534;
    }

    .badge-icon.removed {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-icon.changed {
      background: #fef3c7;
      color: #92400e;
    }

    .diff-item-content {
      flex: 1;
      min-width: 0;
    }

    .diff-item-label {
      font-size: 0.8125rem;
      color: #1e293b;
      font-weight: 500;
      line-height: 1.4;
    }

    .diff-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .diff-item-summary {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.125rem;
    }

    .diff-toggle-btn {
      background: none;
      border: none;
      padding: 0.125rem 0.375rem;
      font-size: 0.6875rem;
      color: #64748b;
      cursor: pointer;
      border-radius: 4px;
      white-space: nowrap;
    }

    .diff-toggle-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #475569;
    }

    .diff-detail {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px dashed #e2e8f0;
    }

    .diff-detail-row {
      margin-bottom: 0.5rem;
    }

    .diff-detail-row:last-child {
      margin-bottom: 0;
    }

    .diff-detail-label {
      font-size: 0.6875rem;
      color: #94a3b8;
      font-weight: 500;
      display: block;
      margin-bottom: 0.25rem;
    }

    .diff-detail-value {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.75rem;
      padding: 0.5rem;
      border-radius: 4px;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
    }

    .diff-detail-value.old {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }

    .diff-detail-value.new {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    /* Draft Indicator */
    .draft-indicator {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .draft-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .draft-icon {
      font-size: 1.25rem;
    }

    .draft-text {
      display: flex;
      flex-direction: column;
    }

    .draft-title {
      font-weight: 500;
      color: #1e40af;
    }

    .draft-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .draft-actions {
      display: flex;
      gap: 0.5rem;
    }

    /* Orchestrated Deployment Progress */
    .orchestrated-deployment {
      padding: 1rem;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .orchestrated-deployment.has-error {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .deployment-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .deployment-icon {
      font-size: 1.25rem;
    }

    .deployment-title {
      font-weight: 600;
      flex: 1;
    }

    .deployment-status {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
    }

    .deployment-status.status-pending,
    .deployment-status.status-deploying_videos {
      background: #fef3c7;
      color: #92400e;
    }

    .deployment-status.status-deploying_config {
      background: #dbeafe;
      color: #1e40af;
    }

    .deployment-status.status-completed {
      background: #dcfce7;
      color: #166534;
    }

    .deployment-status.status-partial_failure {
      background: #fef3c7;
      color: #92400e;
    }

    .deployment-status.status-failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .deployment-progress {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .deployment-progress .progress-bar {
      flex: 1;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .deployment-progress .progress-fill {
      height: 100%;
      background: #22c55e;
      transition: width 0.3s ease;
    }

    .deployment-progress .progress-text {
      font-size: 0.875rem;
      font-weight: 600;
      color: #166534;
      min-width: 40px;
      text-align: right;
    }

    .deployment-details {
      display: flex;
      gap: 1rem;
      font-size: 0.8125rem;
      color: #475569;
    }

    .deployment-details .failed-count {
      color: #dc2626;
    }

    .deployment-error {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #fee2e2;
      border-radius: 4px;
      font-size: 0.8125rem;
      color: #991b1b;
    }

    /* Pending Deployments Section */
    .pending-deployments {
      padding: 1rem;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .pending-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .pending-icon {
      font-size: 1.25rem;
    }

    .pending-title {
      font-weight: 600;
      flex: 1;
      color: #92400e;
    }

    .pending-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pending-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: white;
      border-radius: 6px;
      border: 1px solid #fde68a;
    }

    .pending-video {
      flex: 1;
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pending-status {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
    }

    .pending-status.status-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .pending-status.status-in_progress {
      background: #dbeafe;
      color: #1e40af;
    }

    .pending-progress {
      font-size: 0.75rem;
      font-weight: 600;
      color: #1e40af;
      min-width: 35px;
      text-align: right;
    }

    .pending-date {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 90px;
    }

    .btn-danger-outline {
      padding: 0.25rem 0.5rem;
      background: transparent;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s ease;
    }

    .btn-danger-outline:hover:not(:disabled) {
      background: #fee2e2;
      border-color: #dc2626;
    }

    .btn-danger-outline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Health bar */
    .config-health-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .health-step {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.625rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      text-decoration: none;
      color: #64748b;
      font-size: 0.8125rem;
    }

    .health-step:hover {
      background: #e2e8f0;
      color: #334155;
    }

    .health-step.ok {
      color: #15803d;
    }

    .health-step.warn {
      color: #92400e;
      background: #fef3c7;
    }

    .health-icon {
      font-size: 1rem;
    }

    .health-label {
      font-weight: 500;
    }

    .health-value {
      font-size: 0.75rem;
    }

    .health-value.warn {
      font-weight: 600;
    }

    .health-arrow {
      color: #cbd5e1;
      font-size: 0.75rem;
    }

    /* Validation warnings */
    .validation-warnings {
      margin-bottom: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .validation-warning {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 0.75rem;
      background: #fefce8;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #92400e;
    }

    /* Impact counters */
    .impact-counters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 1rem;
      font-size: 0.8125rem;
      color: #64748b;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .impact-tracked {
      color: #166534;
    }

    .impact-separator {
      color: #cbd5e1;
    }

    .impact-fallback {
      color: #92400e;
    }

    /* Auto-suggestion analytics */
    .btn-suggestion {
      border: none;
      background: #dbeafe;
      color: #1e40af;
      font-size: 0.6875rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }

    .btn-suggestion:hover {
      background: #bfdbfe;
    }

    /* FAB Preview Télécommande */
    .fab-preview {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: #3b82f6;
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 100;
      transition: all 0.2s;
    }

    .fab-preview:hover {
      background: #2563eb;
      transform: scale(1.05);
    }

    .fab-preview.active {
      background: #1e40af;
    }

    /* Preview Panel overlay */
    .preview-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 200;
      display: flex;
      justify-content: flex-end;
    }

    .preview-panel-content {
      width: 380px;
      max-width: 90vw;
      background: white;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .preview-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .preview-panel-header h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .preview-close {
      border: none;
      background: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #64748b;
      padding: 0;
    }

    .preview-close:hover {
      color: #334155;
    }

    /* Historique des modifications */
    .section-header.clickable {
      cursor: pointer;
      user-select: none;
    }

    .section-header.clickable:hover {
      opacity: 0.85;
    }

    .history-count {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 400;
    }

    .history-content {
      margin-top: 0.75rem;
    }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .history-item {
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #3b82f6;
    }

    .history-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }

    .history-date {
      font-weight: 600;
      color: #334155;
    }

    .history-author {
      color: #64748b;
    }

    .history-comment {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
      color: #475569;
      font-style: italic;
    }

    .history-changes {
      margin-top: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .history-changes-count {
      font-size: 0.75rem;
      color: #64748b;
    }

    .history-change-pills {
      display: flex;
      gap: 0.25rem;
    }

    .change-pill {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.0625rem 0.375rem;
      border-radius: 4px;
    }

    .change-pill.added {
      background: #dcfce7;
      color: #166534;
    }

    .change-pill.changed {
      background: #fef3c7;
      color: #92400e;
    }

    .change-pill.removed {
      background: #fee2e2;
      color: #991b1b;
    }

    .history-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .history-entry-actions {
      display: flex;
      gap: 0.375rem;
      flex-shrink: 0;
    }

    .btn-history-detail {
      border: 1px solid #e2e8f0;
      background: white;
      color: #64748b;
      font-size: 0.6875rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-history-detail:hover {
      background: #f1f5f9;
      color: #334155;
    }

    .btn-history-restore {
      border: 1px solid #dbeafe;
      background: #eff6ff;
      color: #1e40af;
      font-size: 0.6875rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-history-restore:hover {
      background: #dbeafe;
    }

    /* History detail */
    .history-detail {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 300px;
      overflow-y: auto;
    }

    .history-diff-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.25rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: ui-monospace, monospace;
    }

    .history-diff-row.diff-type-added {
      background: #f0fdf4;
    }

    .history-diff-row.diff-type-changed {
      background: #fffbeb;
    }

    .history-diff-row.diff-type-removed {
      background: #fef2f2;
    }

    .diff-type-badge {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-weight: 700;
      font-size: 0.6875rem;
      flex-shrink: 0;
    }

    .diff-type-added .diff-type-badge {
      background: #dcfce7;
      color: #166534;
    }

    .diff-type-changed .diff-type-badge {
      background: #fef3c7;
      color: #92400e;
    }

    .diff-type-removed .diff-type-badge {
      background: #fee2e2;
      color: #991b1b;
    }

    .diff-path {
      color: #475569;
      word-break: break-all;
      min-width: 0;
    }

    .diff-values {
      color: #64748b;
      margin-left: auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
    }

    .diff-old {
      color: #991b1b;
      text-decoration: line-through;
    }

    .diff-new {
      color: #166534;
    }

    .history-actions {
      margin-top: 0.75rem;
      text-align: center;
    }
  `]
})
export class SiteContentTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input() siteId!: string;
  @Input() siteName: string = '';
  @Input() isConnected: boolean = false;
  @Output() configDeployed = new EventEmitter<void>();

  config: SiteConfiguration = this.getEmptyConfig();
  localVideos: LocalVideo[] = [];
  cloudVideos: CloudVideo[] = [];
  localStorage: LocalStorage | null = null;
  selectedVideoPath: string = '';
  expandedCategories: boolean[] = [];
  isDirty: boolean = false;
  deploying: boolean = false;
  loading: boolean = false;

  private originalConfig: string = '';

  // Refresh from Pi
  refreshingFromPi: boolean = false;
  lastSyncTime: Date | null = null;
  private refreshCommandId: string | null = null;
  private refreshPollSubscription: Subscription | null = null;

  // Delete modal
  showDeleteModal: boolean = false;
  deleteTarget: VideoItem | null = null;
  deleteCanPi: boolean = false;
  deleteCanCloud: boolean = false;

  // Diff modal
  showDiffModal: boolean = false;
  diffLoading: boolean = false;
  rawDiffItems: ConfigDiff[] = [];
  expandedDiffItems: Record<string, boolean> = {};
  deployMode: 'merge' | 'replace' = 'merge';

  // Deploy tracking (config)
  deployCommandId: string | null = null;
  deployStatus: 'idle' | 'sending' | 'pending' | 'success' | 'error' | 'timeout' = 'idle';
  deployError: string | null = null;
  private deploySubscription: Subscription | null = null;
  private deployTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Video deploy tracking
  videoDeployStates: Map<string, VideoDeployState> = new Map();
  private videoDeploySubscriptions: Map<string, Subscription> = new Map();
  private videoDeployTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Cached computed values for template
  cachedVideoCategories: string[] = [];
  cachedVideosByCategory: Map<string, LocalVideo[]> = new Map();
  cachedTimeCategories: { id: string; name: string; icon: string; description: string }[] = [];

  // Unified video options for dropdowns (Cloud + Local merged)
  unifiedVideoOptions: UnifiedVideoOption[] = [];
  videoSearchQuery: string = '';
  groupedVideoOptions: Map<VideoOptionGroup, UnifiedVideoOption[]> = new Map();
  // Cached array for template - prevents flickering by avoiding method calls in template
  videoOptionGroups: { key: VideoOptionGroup; label: string; icon: string; videos: UnifiedVideoOption[] }[] = [];

  // Video relevance tracking for filtered view in video-library
  configVideoPaths: Set<string> = new Set();

  // Cloud video paths (not yet on Pi) — passed to loop-manager
  cloudVideoPaths: Set<string> = new Set();

  // Video durations lookup (path → seconds) — passed to loop-manager
  videoDurations: Map<string, number> = new Map();

  // Site sponsors — passed to loop-manager for sponsor_id dropdown
  siteSponsors: SiteSponsor[] = [];

  // Remote preview panel
  showRemotePreview = false;

  // Config history
  configHistory: ConfigHistory[] = [];
  configHistoryTotal = 0;
  loadingHistory = false;
  showHistory = false;
  expandedHistoryItems: Record<number, boolean> = {};

  /**
   * Getter qui calcule les IDs des vidéos avec déploiement en cours
   * Dérivé de videoDeployStates pour rester toujours synchronisé
   */
  get pendingDeploymentVideoIds(): Set<string> {
    const ids = new Set<string>();
    for (const [videoId, state] of this.videoDeployStates.entries()) {
      if (state.status === 'deploying') {
        ids.add(videoId);
      }
    }
    return ids;
  }

  // Pending deployments tracking
  pendingDeployments: PendingDeployment[] = [];
  loadingPendingDeployments: boolean = false;
  cancellingDeploymentId: string | null = null;

  // Draft management
  draft: ConfigDraft | null = null;
  savingDraft: boolean = false;
  draftValidation: DraftValidationResult | null = null;

  // Orchestrated deployment tracking
  orchestratedDeployment: OrchestratedDeploymentProgress | null = null;
  private orchestratedDeploymentId: string | null = null;
  private orchestratedDeploymentPollSubscription: Subscription | null = null;

  /**
   * Propriétés internes à masquer dans le diff (ajoutées automatiquement)
   */
  private readonly INTERNAL_PROPERTIES = ['owner', 'locked', 'type'];

  /**
   * Transforme les diff items bruts en version lisible et filtre les propriétés internes
   */
  get humanReadableDiff(): HumanReadableDiff[] {
    return this.rawDiffItems
      .map(item => this.transformDiffItem(item))
      .filter(item => !item.isInternal);
  }

  get diffCounts() {
    return this.humanReadableDiff.reduce(
      (acc, item) => {
        acc[item.type]++;
        return acc;
      },
      { added: 0, changed: 0, removed: 0 }
    );
  }

  /**
   * Groupe les changements par section pour un affichage plus clair
   */
  get groupedDiff(): { section: string; icon: string; items: HumanReadableDiff[] }[] {
    const groups: Map<string, { icon: string; items: HumanReadableDiff[] }> = new Map();

    for (const item of this.humanReadableDiff) {
      const section = this.getSectionFromLabel(item.label);
      if (!groups.has(section.name)) {
        groups.set(section.name, { icon: section.icon, items: [] });
      }
      groups.get(section.name)!.items.push(item);
    }

    return Array.from(groups.entries()).map(([section, data]) => ({
      section,
      icon: data.icon,
      items: data.items
    }));
  }

  /**
   * Transforme un item de diff technique en version lisible
   */
  private transformDiffItem(item: ConfigDiff): HumanReadableDiff {
    const path = item.path;
    const lastSegment = path.split('.').pop() || '';

    // Détecter si c'est une propriété interne
    if (this.INTERNAL_PROPERTIES.includes(lastSegment)) {
      return {
        label: '',
        type: item.type,
        summary: '',
        isInternal: true
      };
    }

    const label = this.pathToHumanLabel(path);
    const summary = this.generateSummary(item);

    return {
      label,
      type: item.type,
      summary,
      oldValue: item.oldValue,
      newValue: item.newValue,
      isInternal: false
    };
  }

  /**
   * Convertit un chemin technique en label lisible
   * Ex: "categories[category-123].subCategories[subcat-456].videos" → "Catégorie X > Sous-cat Y > Vidéos"
   */
  private pathToHumanLabel(path: string): string {
    const parts = path.split('.');
    const labels: string[] = [];

    for (const part of parts) {

      // sponsors[0].name
      if (part === 'sponsors' || part.startsWith('sponsors[')) {
        const match = part.match(/sponsors\[(\d+)\]/);
        if (match) {
          const idx = parseInt(match[1]);
          const sponsor = this.config.sponsors?.[idx];
          labels.push(`Boucle par défaut > ${sponsor?.name || `Vidéo ${idx + 1}`}`);
        } else {
          labels.push('Boucle par défaut');
        }
        continue;
      }

      // categories[category-xxx]
      if (part.startsWith('categories[')) {
        const idMatch = part.match(/categories\[([^\]]+)\]/);
        if (idMatch) {
          const catId = idMatch[1];
          const cat = this.config.categories?.find(c => c.id === catId);
          labels.push(`Catégorie "${cat?.name || 'Sans nom'}"`);
        }
        continue;
      }

      // subCategories[subcat-xxx]
      if (part.startsWith('subCategories[')) {
        const idMatch = part.match(/subCategories\[([^\]]+)\]/);
        if (idMatch) {
          const subId = idMatch[1];
          // Trouver la sous-catégorie
          for (const cat of this.config.categories || []) {
            const sub = cat.subCategories?.find(s => s.id === subId);
            if (sub) {
              labels.push(`Sous-catégorie "${sub.name || 'Sans nom'}"`);
              break;
            }
          }
        }
        continue;
      }

      // timeCategories[before/during/after]
      if (part.startsWith('timeCategories[')) {
        const idMatch = part.match(/timeCategories\[([^\]]+)\]/);
        if (idMatch) {
          const tcId = idMatch[1];
          const tc = this.cachedTimeCategories.find(t => t.id === tcId);
          labels.push(`Phase "${tc?.name || tcId}"`);
        }
        continue;
      }

      // categoryMappings
      if (part === 'categoryMappings') {
        labels.push('Mapping Analytics');
        continue;
      }

      // videos[0], loopVideos[0]
      if (part === 'videos' || part === 'loopVideos') {
        labels.push('Vidéos');
        continue;
      }
      if (part.startsWith('videos[') || part.startsWith('loopVideos[')) {
        const match = part.match(/\[(\d+)\]/);
        if (match) {
          labels.push(`Vidéo ${parseInt(match[1]) + 1}`);
        }
        continue;
      }

      // Propriétés de vidéo
      if (part === 'name') {
        labels.push('Nom');
        continue;
      }
      if (part === 'path') {
        labels.push('Fichier');
        continue;
      }

      // categoryIds
      if (part === 'categoryIds') {
        labels.push('Catégories assignées');
        continue;
      }

      // Fallback
      labels.push(part);
    }

    return labels.join(' > ');
  }

  /**
   * Génère un résumé lisible du changement
   */
  private generateSummary(item: ConfigDiff): string {
    const lastSegment = item.path.split('.').pop() || '';

    if (item.type === 'added') {
      if (typeof item.newValue === 'object' && item.newValue !== null) {
        const obj = item.newValue as Record<string, unknown>;
        if ('name' in obj && 'path' in obj) {
          return `Ajouté: ${obj['name'] || this.extractFilename(obj['path'] as string)}`;
        }
        if ('name' in obj) {
          return `Ajouté: "${obj['name']}"`;
        }
      }
      return `Ajouté`;
    }

    if (item.type === 'removed') {
      if (typeof item.oldValue === 'object' && item.oldValue !== null) {
        const obj = item.oldValue as Record<string, unknown>;
        if ('name' in obj && 'path' in obj) {
          return `Supprimé: ${obj['name'] || this.extractFilename(obj['path'] as string)}`;
        }
        if ('name' in obj) {
          return `Supprimé: "${obj['name']}"`;
        }
      }
      return `Supprimé`;
    }

    // changed
    if (lastSegment === 'path') {
      const oldFile = this.extractFilename(item.oldValue as string);
      const newFile = this.extractFilename(item.newValue as string);
      return `Fichier: ${oldFile} → ${newFile}`;
    }
    if (lastSegment === 'name') {
      return `Nom: "${item.oldValue}" → "${item.newValue}"`;
    }

    // Changement d'array (ex: categoryIds)
    if (Array.isArray(item.oldValue) && Array.isArray(item.newValue)) {
      const added = (item.newValue as string[]).filter(id => !(item.oldValue as string[]).includes(id));
      const removed = (item.oldValue as string[]).filter(id => !(item.newValue as string[]).includes(id));
      const parts: string[] = [];
      if (added.length) parts.push(`+${added.length}`);
      if (removed.length) parts.push(`-${removed.length}`);
      return parts.length ? parts.join(', ') : 'Modifié';
    }

    return `Modifié`;
  }

  /**
   * Extrait le nom du fichier d'un chemin
   */
  private extractFilename(path: string): string {
    if (!path) return '(vide)';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  /**
   * Bascule l'affichage des détails d'un item de diff
   */
  toggleDiffDetail(key: string): void {
    this.expandedDiffItems[key] = !this.expandedDiffItems[key];
  }

  /**
   * Formate une valeur de diff pour l'affichage
   * Affiche les vidéos de manière compacte (nom + fichier)
   */
  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '(vide)';
    }

    // Si c'est un tableau de vidéos, afficher de manière compacte
    if (Array.isArray(value)) {
      const items = value.map((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          if ('name' in obj || 'path' in obj) {
            const name = obj['name'] || '(sans nom)';
            const file = this.extractFilename(obj['path'] as string);
            return `  ${idx + 1}. ${name} → ${file}`;
          }
        }
        return `  ${idx + 1}. ${JSON.stringify(item)}`;
      });
      return items.join('\n');
    }

    // Si c'est un objet avec name/path (une vidéo)
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if ('name' in obj || 'path' in obj) {
        const name = obj['name'] || '(sans nom)';
        const file = this.extractFilename(obj['path'] as string);
        return `${name} → ${file}`;
      }
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  /**
   * Détermine la section à partir du label
   */
  private getSectionFromLabel(label: string): { name: string; icon: string } {
    if (label.startsWith('Boucle par défaut')) {
      return { name: 'Boucle par défaut', icon: '🔄' };
    }
    if (label.startsWith('Catégorie') || label.startsWith('Sous-catégorie')) {
      return { name: 'Catégories', icon: '📁' };
    }
    if (label.startsWith('Phase')) {
      return { name: 'Phases de match', icon: '🎬' };
    }
    if (label.startsWith('Mapping')) {
      return { name: 'Analytics', icon: '📊' };
    }
    return { name: 'Autre', icon: '📝' };
  }

  /**
   * Retourne la liste des erreurs de validation
   */
  get validationErrors(): string[] {
    const errors: string[] = [];

    // Vérifier les sponsors sans path
    this.config.sponsors?.forEach((s, i) => {
      if (!s.path) {
        errors.push(`Boucle par défaut: vidéo ${i + 1} sans fichier`);
      }
    });

    // Vérifier les vidéos de catégories sans path
    this.config.categories?.forEach(cat => {
      cat.videos?.forEach((v, i) => {
        if (!v.path) {
          errors.push(`Catégorie "${cat.name || 'Sans nom'}": vidéo ${i + 1} sans fichier`);
        }
      });
      cat.subCategories?.forEach(sub => {
        sub.videos?.forEach((v, i) => {
          if (!v.path) {
            errors.push(`Sous-catégorie "${sub.name || 'Sans nom'}": vidéo ${i + 1} sans fichier`);
          }
        });
      });
    });

    // Vérifier les loopVideos des timeCategories
    this.config.timeCategories?.forEach(tc => {
      tc.loopVideos?.forEach((v: { path?: string; name?: string }, i: number) => {
        if (!v.path) {
          errors.push(`Phase "${tc.name}": vidéo ${i + 1} sans fichier`);
        }
      });
    });

    return errors;
  }

  /**
   * Warnings de validation non bloquants (affichés avant le bouton déployer)
   */
  get validationWarnings(): string[] {
    if (!this.config) return [];
    const warnings: string[] = [];

    // Vidéos dans la boucle par défaut sans boucles par phase
    if (this.config.sponsors?.length > 0 && !this.hasPhaseLoops()) {
      warnings.push(`${this.config.sponsors.length} vidéo(s) dans la boucle par défaut sans tracking analytics`);
    }

    // Catégories assignées à une phase mais vides
    const phases = this.config.timeCategories || [];
    for (const tc of phases) {
      for (const catId of tc.categoryIds || []) {
        const cat = this.config.categories?.find(c => c.id === catId);
        if (cat && (!cat.videos || cat.videos.length === 0) && (!cat.subCategories || cat.subCategories.length === 0)) {
          warnings.push(`Catégorie "${cat.name}" assignée à ${tc.name} mais vide`);
        }
      }
    }

    // Catégories analytics non mappées
    const unmapped = this.getUnmappedAnalyticsCount();
    if (unmapped > 0) {
      warnings.push(`${unmapped} catégorie(s) non mappée(s) en analytics`);
    }

    return warnings;
  }

  // === Health bar helpers ===

  get totalVideoCount(): number {
    return this.localVideos.length + this.cloudVideos.length;
  }

  scrollToSection(sectionId: string): void {
    const el = document.getElementById('section-' + sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  hasPhaseLoops(): boolean {
    if (!this.config) return false;
    const phases = this.config.timeCategories || [];
    return phases.some(tc => tc.loopVideos && tc.loopVideos.length > 0);
  }

  getAssignedCategoryCount(): number {
    if (!this.config) return 0;
    const phases = this.config.timeCategories || [];
    const allIds = new Set<string>();
    phases.forEach(tc => tc.categoryIds?.forEach(id => allIds.add(id)));
    return allIds.size;
  }

  getUnmappedAnalyticsCount(): number {
    if (!this.config?.categories) return 0;
    let unmapped = 0;
    for (const cat of this.config.categories) {
      if (cat.subCategories?.length) {
        for (const sub of cat.subCategories) {
          if (!this.config.categoryMappings?.[sub.id]) unmapped++;
        }
      } else {
        if (!this.config.categoryMappings?.[cat.id]) unmapped++;
      }
    }
    return unmapped;
  }

  // === Impact counters ===

  /**
   * Nombre de vidéos dans les boucles par phase (trackées en analytics)
   */
  getTrackedVideoCount(): number {
    if (!this.config) return 0;
    const phases = this.config.timeCategories || [];
    return phases.reduce((sum, tc) => sum + (tc.loopVideos?.length || 0), 0);
  }

  /**
   * Nombre de vidéos dans la boucle par défaut (non trackées)
   */
  getFallbackVideoCount(): number {
    if (!this.config) return 0;
    return this.config.sponsors?.length || 0;
  }

  // === Config history ===

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.configHistory.length === 0) {
      this.loadConfigHistory();
    }
  }

  loadConfigHistory(): void {
    this.loadingHistory = true;
    this.cdr.markForCheck();
    this.sitesService.getConfigHistory(this.siteId, 10, 0).subscribe({
      next: (response) => {
        this.configHistory = response.history || [];
        this.configHistoryTotal = response.total || 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.configHistory = [];
        this.configHistoryTotal = 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadMoreHistory(): void {
    const offset = this.configHistory.length;
    this.loadingHistory = true;
    this.cdr.markForCheck();
    this.sitesService.getConfigHistory(this.siteId, 10, offset).subscribe({
      next: (response) => {
        this.configHistory = [...this.configHistory, ...(response.history || [])];
        this.configHistoryTotal = response.total || 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingHistory = false;
        this.cdr.markForCheck();
      }
    });
  }

  countChangeType(changes: ConfigDiff[], type: string): number {
    return changes.filter(c => c.type === type).length;
  }

  toggleHistoryDetail(index: number): void {
    this.expandedHistoryItems[index] = !this.expandedHistoryItems[index];
    this.cdr.markForCheck();
  }

  restoreVersion(entry: ConfigHistory): void {
    if (!entry.configuration) return;
    this.config = JSON.parse(JSON.stringify(entry.configuration));
    this.markDirty();
    this.notificationService.success('Configuration restaurée — déployez pour appliquer');
    this.showHistory = false;
  }

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private socketService: SocketService,
    private draftService: DraftService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadContent();
    this.loadDraft();
    this.loadSiteSponsors();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadContent();
      this.loadDraft();
      this.loadSiteSponsors();
    }
  }

  ngOnDestroy(): void {
    this.refreshPollSubscription?.unsubscribe();
    this.deploySubscription?.unsubscribe();
    this.orchestratedDeploymentPollSubscription?.unsubscribe();
    if (this.deployTimeoutId) {
      clearTimeout(this.deployTimeoutId);
    }
    // Cleanup video deploy tracking
    for (const videoId of this.videoDeploySubscriptions.keys()) {
      this.cleanupVideoDeployTracking(videoId);
    }
  }

  /**
   * Rafraîchit la configuration depuis le Pi connecté
   * Envoie une commande get_config et poll le résultat
   */
  refreshFromPi(): void {
    if (!this.isConnected || this.refreshingFromPi) {
      return;
    }

    this.refreshingFromPi = true;
    this.cdr.markForCheck();

    // Timeout global de 30 secondes
    const timeoutId = setTimeout(() => {
      if (this.refreshingFromPi) {
        this.refreshPollSubscription?.unsubscribe();
        this.refreshingFromPi = false;
        this.notificationService.warning('Le Pi ne répond pas. Essayez à nouveau.');
        this.cdr.markForCheck();
      }
    }, 30000);

    this.sitesService.getConfiguration(this.siteId).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.refreshCommandId = response.commandId;
          this.pollRefreshResult(timeoutId);
        } else {
          clearTimeout(timeoutId);
          this.refreshingFromPi = false;
          this.notificationService.warning('Impossible d\'envoyer la commande au Pi.');
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        clearTimeout(timeoutId);
        this.refreshingFromPi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Poll le résultat de la commande get_config
   */
  private pollRefreshResult(timeoutId: ReturnType<typeof setTimeout>): void {
    if (!this.refreshCommandId) {
      return;
    }

    let pollCount = 0;
    const POLL_MAX = 30;

    this.refreshPollSubscription = interval(1000).subscribe(() => {
      pollCount++;

      if (pollCount > POLL_MAX) {
        clearTimeout(timeoutId);
        this.refreshPollSubscription?.unsubscribe();
        this.refreshingFromPi = false;
        this.notificationService.warning('Timeout: le Pi ne répond pas.');
        this.cdr.markForCheck();
        return;
      }

      this.sitesService.getCommandStatus(this.siteId, this.refreshCommandId!).subscribe({
        next: (status) => {
          if (status.status === 'completed') {
            clearTimeout(timeoutId);
            this.refreshPollSubscription?.unsubscribe();
            this.refreshingFromPi = false;

            if (status.result?.configuration) {
              // Mettre à jour la config avec celle du Pi
              this.config = this.normalizeConfig(status.result.configuration);
              this.originalConfig = JSON.stringify(this.config);
              this.isDirty = false;
              this.lastSyncTime = new Date();
              this.expandedCategories = (this.config.categories || []).map(() => false);
              this.rebuildVideoCache();
              this.rebuildTimeCategoriesCache();
              this.notificationService.success('Configuration synchronisée depuis le Pi');
            } else {
              this.notificationService.info('Aucune configuration sur le Pi.');
            }
            this.cdr.markForCheck();
          } else if (status.status === 'failed') {
            clearTimeout(timeoutId);
            this.refreshPollSubscription?.unsubscribe();
            this.refreshingFromPi = false;
            this.notificationService.error(`Erreur: ${status.error_message || 'Commande échouée'}`);
            this.cdr.markForCheck();
          }
          // Si status === 'pending', on continue à poller
        },
        error: () => {
          // Ignorer les erreurs de polling, on réessaie
        }
      });
    });
  }

  /**
   * Charge les sponsors du site pour le dropdown dans le loop manager
   */
  private loadSiteSponsors(): void {
    if (!this.siteId) return;
    this.sitesService.listSiteSponsors(this.siteId).subscribe({
      next: (response) => {
        this.siteSponsors = (response.sponsors || []).filter(s => s.status === 'active');
        this.cdr.markForCheck();
      },
      error: () => {
        // Non-bloquant : le dropdown sponsor reste vide
        this.siteSponsors = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadContent(): void {
    if (!this.siteId) return;

    this.loading = true;
    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response) => {
        this.loading = false;
        this.localVideos = response.localVideos || [];
        this.cloudVideos = response.cloudVideos || [];
        this.localStorage = response.localStorage || null;

        if (response.configuration) {
          this.config = this.normalizeConfig(response.configuration);
        } else {
          this.config = this.getEmptyConfig();
        }

        this.originalConfig = JSON.stringify(this.config);
        this.isDirty = false;
        this.expandedCategories = (this.config.categories || []).map(() => false);
        this.rebuildVideoCache();
        this.rebuildTimeCategoriesCache();
        this.refreshPendingDeployments(); // Load pending deployments
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load content', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  private normalizeConfig(config: any): SiteConfiguration {
    return {
      version: config.version || '1.0',
      auth: config.auth || { clubName: '', password: '', sessionDuration: 86400000 },
      remote: config.remote || { title: '' },
      sync: config.sync || { enabled: false, serverUrl: '', siteName: '', clubName: '' },
      sponsors: (config.sponsors || []).map((s: any) => ({
        name: s.name || '',
        path: s.path || '',
        type: s.type || 'video/mp4',
        owner: s.owner || 'club',
        locked: s.locked || false
      })),
      categories: (config.categories || []).map((c: any) => ({
        id: c.id || this.generateId(),
        name: c.name || '',
        owner: c.owner || 'club',
        locked: c.locked || false,
        videos: (c.videos || []).map((v: any) => ({
          name: v.name || '',
          path: v.path || '',
          type: v.type || 'video/mp4',
          owner: v.owner || 'club',
          locked: v.locked || false
        })),
        subCategories: (c.subCategories || []).map((sc: any) => ({
          id: sc.id || this.generateId(),
          name: sc.name || '',
          owner: sc.owner || 'club',
          locked: sc.locked || false,
          videos: (sc.videos || []).map((v: any) => ({
            name: v.name || '',
            path: v.path || '',
            type: v.type || 'video/mp4',
            owner: v.owner || 'club',
            locked: v.locked || false
          }))
        }))
      })),
      timeCategories: config.timeCategories || [],
      categoryMappings: config.categoryMappings || {},
      settings: config.settings || {},
      liveScoreEnabled: config.liveScoreEnabled || false,
      scoreOverlay: config.scoreOverlay || null
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private getEmptyConfig(): SiteConfiguration {
    return {
      version: '1.0',
      auth: { clubName: '', password: '', sessionDuration: 86400000 },
      remote: { title: '' },
      sync: { enabled: false, serverUrl: '', siteName: '', clubName: '' },
      sponsors: [],
      categories: [],
      timeCategories: [],
      categoryMappings: {},
      settings: {},
      liveScoreEnabled: false,
      scoreOverlay: null
    };
  }

  markDirty(): void {
    this.isDirty = JSON.stringify(this.config) !== this.originalConfig;
    // Recalculate config video paths when config changes
    this.rebuildConfigVideoPaths();
  }

  onVideoSelect(video: VideoItem): void {
    this.selectedVideoPath = video.path;
  }

  onVideoPreview(video: VideoItem): void {
    if (video.path) {
      window.open(video.path, '_blank');
    }
  }

  onVideoDeploy(video: VideoItem): void {
    if (!video.id) {
      this.notificationService.error('Impossible de déployer cette vidéo');
      return;
    }

    // Check if already deploying
    const currentState = this.videoDeployStates.get(video.id);
    if (currentState?.status === 'deploying') {
      this.notificationService.warning('Déploiement déjà en cours pour cette vidéo');
      return;
    }

    if (confirm(`Déployer "${video.filename}" vers ce site ?`)) {
      const videoId = video.id;

      // Set initial deploying state
      this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0 });
      this.cdr.markForCheck();

      this.sitesService.sendCommand(this.siteId, 'deploy_video', {
        videoId: video.id,
        filename: video.filename,
        url: video.path
      }).subscribe({
        next: (response) => {
          if (response.queued) {
            // Site offline, command queued
            this.notificationService.info(`Déploiement de "${video.filename}" en file d'attente (site hors ligne)`);
            this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0, commandId: response.commandId });
          } else if (response.commandId) {
            // Command sent, wait for socket events
            this.notificationService.info(`Déploiement de "${video.filename}" lancé...`);
            this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0, commandId: response.commandId });
            this.waitForVideoDeployResult(videoId, video.filename, response.commandId);
          }
          this.cdr.markForCheck();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
          this.videoDeployStates.set(videoId, { status: 'error', error: message });
          this.cdr.markForCheck();
          // Auto-clear error after 10 seconds
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'error') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 10000);
        }
      });
    }
  }

  private waitForVideoDeployResult(videoId: string, filename: string, commandId: string): void {
    // Clean up any existing subscription for this video
    this.cleanupVideoDeployTracking(videoId);

    // Timeout: 10 minutes for video deploy (large files)
    const VIDEO_DEPLOY_TIMEOUT = 10 * 60 * 1000;

    const timeoutId = setTimeout(() => {
      const currentState = this.videoDeployStates.get(videoId);
      if (currentState?.status === 'deploying') {
        this.videoDeployStates.set(videoId, {
          status: 'timeout',
          error: 'Timeout: le Pi n\'a pas répondu dans les temps'
        });
        this.notificationService.warning(`Timeout: le Pi n'a pas confirmé le déploiement de "${filename}"`);
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
        // Auto-clear timeout after 15 seconds
        setTimeout(() => {
          if (this.videoDeployStates.get(videoId)?.status === 'timeout') {
            this.videoDeployStates.delete(videoId);
            this.cdr.markForCheck();
          }
        }, 15000);
      }
    }, VIDEO_DEPLOY_TIMEOUT);
    this.videoDeployTimeouts.set(videoId, timeoutId);

    // Listen for command_completed event
    const completedSub = this.socketService.on<{
      siteId: string;
      commandId: string;
      commandType: string;
      status: string;
      result?: unknown;
      error?: string;
    }>('command_completed')
      .pipe(
        filter(event => event.commandId === commandId),
        take(1)
      )
      .subscribe(event => {
        if (event.status === 'success') {
          this.videoDeployStates.set(videoId, { status: 'success', commandId });
          this.notificationService.success(`"${filename}" déployé avec succès sur le Pi !`);
          // Refresh video list after successful deploy
          this.loadContent();
          // Auto-clear success after 5 seconds
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'success') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 5000);
        } else {
          const errorMsg = event.error || 'Erreur inconnue';
          this.videoDeployStates.set(videoId, { status: 'error', error: errorMsg, commandId });
          this.notificationService.error(`Erreur de déploiement pour "${filename}": ${errorMsg}`);
          // Auto-clear error after 10 seconds
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'error') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 10000);
        }
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
      });
    this.videoDeploySubscriptions.set(videoId, completedSub);

    // Listen for deploy_progress event
    const progressSub = this.socketService.on<{
      siteId: string;
      commandId: string;
      progress: number;
    }>('deploy_progress')
      .pipe(
        filter(event => event.commandId === commandId)
      )
      .subscribe(event => {
        const currentState = this.videoDeployStates.get(videoId);
        if (currentState?.status === 'deploying') {
          this.videoDeployStates.set(videoId, {
            ...currentState,
            progress: event.progress
          });
          this.cdr.markForCheck();
        }
      });
    // Store progress subscription separately
    const existingSub = this.videoDeploySubscriptions.get(videoId);
    if (existingSub) {
      existingSub.add(progressSub);
    }

    // Listen for command_timeout event
    const timeoutSub = this.socketService.on<{
      siteId: string;
      commandId: string;
      type: string;
    }>('command_timeout')
      .pipe(
        filter(event => event.commandId === commandId),
        take(1)
      )
      .subscribe(() => {
        this.videoDeployStates.set(videoId, {
          status: 'timeout',
          error: 'Le serveur a signalé un timeout pour cette commande'
        });
        this.notificationService.warning(`Timeout serveur pour le déploiement de "${filename}"`);
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
        // Auto-clear after 15 seconds
        setTimeout(() => {
          if (this.videoDeployStates.get(videoId)?.status === 'timeout') {
            this.videoDeployStates.delete(videoId);
            this.cdr.markForCheck();
          }
        }, 15000);
      });
    if (existingSub) {
      existingSub.add(timeoutSub);
    }
  }

  private cleanupVideoDeployTracking(videoId: string): void {
    const sub = this.videoDeploySubscriptions.get(videoId);
    if (sub) {
      sub.unsubscribe();
      this.videoDeploySubscriptions.delete(videoId);
    }
    const timeout = this.videoDeployTimeouts.get(videoId);
    if (timeout) {
      clearTimeout(timeout);
      this.videoDeployTimeouts.delete(videoId);
    }
  }

  onVideoDelete(video: VideoItem): void {
    this.deleteTarget = video;
    this.deleteCanPi = video.isOnPi;
    this.deleteCanCloud = !!video.id;
    this.showDeleteModal = true;
  }

  executeDelete(choice: 'pi' | 'cloud' | 'both'): void {
    const video = this.deleteTarget;
    if (!video) return;
    this.showDeleteModal = false;

    // Use Pi filesystem category/subcategory when available, fall back to cloud metadata
    const piCat = video.piCategory ?? video.category;
    const piSubcat = video.piSubcategory ?? video.subcategory;
    const deletePi$ = this.sitesService.sendCommand(this.siteId, 'delete_video', {
      filename: video.filename,
      category: piCat || undefined,
      subcategory: piSubcat || undefined
    });
    const deleteCloud$ = this.sitesService.deleteCloudVideo(video.id!);

    if (choice === 'both') {
      forkJoin([deletePi$, deleteCloud$]).subscribe({
        next: () => {
          this.notificationService.success(`"${video.filename}" supprimé du Pi et du cloud`);
          this.loadContent();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    } else if (choice === 'pi') {
      deletePi$.subscribe({
        next: () => {
          this.notificationService.success(`"${video.filename}" supprimé du Pi`);
          this.loadContent();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    } else {
      deleteCloud$.subscribe({
        next: () => {
          this.notificationService.success(`"${video.filename}" supprimé du cloud`);
          this.loadContent();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  onConfigChange(config: SiteConfiguration): void {
    this.config = config;
    this.markDirty();
  }

  // Categories
  addCategory(): void {
    if (!this.config.categories) this.config.categories = [];
    this.config.categories.push({
      id: this.generateId(),
      name: '',
      owner: 'club',
      locked: false,
      videos: [],
      subCategories: []
    });
    this.expandedCategories.push(true);
    this.markDirty();
  }

  removeCategory(index: number): void {
    this.config.categories?.splice(index, 1);
    this.expandedCategories.splice(index, 1);
    this.markDirty();
  }

  toggleCategory(index: number): void {
    this.expandedCategories[index] = !this.expandedCategories[index];
  }

  getCategoryVideoCount(cat: CategoryConfig): number {
    let count = cat.videos?.length || 0;
    for (const subcat of cat.subCategories || []) {
      count += subcat.videos?.length || 0;
    }
    return count;
  }

  addVideoToCategory(catIndex: number): void {
    const cat = this.config.categories?.[catIndex];
    if (!cat) return;
    if (!cat.videos) cat.videos = [];
    cat.videos.push({ name: '', path: '', type: 'video/mp4', owner: 'club', locked: false });
    this.markDirty();
  }

  removeVideoFromCategory(catIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.videos?.splice(vidIndex, 1);
    this.markDirty();
  }

  addSubcategory(catIndex: number): void {
    const cat = this.config.categories?.[catIndex];
    if (!cat) return;
    if (!cat.subCategories) cat.subCategories = [];
    cat.subCategories.push({ id: this.generateId(), name: '', videos: [] });
    this.markDirty();
  }

  removeSubcategory(catIndex: number, subIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.splice(subIndex, 1);
    this.markDirty();
  }

  addVideoToSubcategory(catIndex: number, subIndex: number): void {
    const subcat = this.config.categories?.[catIndex]?.subCategories?.[subIndex];
    if (!subcat) return;
    if (!subcat.videos) subcat.videos = [];
    subcat.videos.push({ name: '', path: '', type: 'video/mp4', owner: 'club', locked: false });
    this.markDirty();
  }

  removeVideoFromSubcategory(catIndex: number, subIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.[subIndex]?.videos?.splice(vidIndex, 1);
    this.markDirty();
  }

  // Video helpers
  private rebuildVideoCache(): void {
    const cats = new Set<string>();
    const byCategory = new Map<string, LocalVideo[]>();

    this.localVideos.forEach(v => {
      const cat = v.category || '';
      cats.add(cat);
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(v);
    });

    this.cachedVideoCategories = Array.from(cats).sort();
    this.cachedVideosByCategory = byCategory;

    // Build unified video options (Cloud + Local merged)
    this.rebuildUnifiedVideoOptions();

    // Recalculate video paths used in config (for filtered video library view)
    this.rebuildConfigVideoPaths();
  }

  /**
   * Construit la liste unifiée des vidéos pour les dropdowns
   * Fusionne localVideos + cloudVideos avec déduplication et indicateurs de statut
   */
  private rebuildUnifiedVideoOptions(): void {
    const optionsMap = new Map<string, UnifiedVideoOption>();

    // 1. D'abord, ajouter les vidéos locales (sur le Pi)
    for (const local of this.localVideos) {
      const key = local.filename.toLowerCase();
      optionsMap.set(key, {
        path: local.path,
        filename: local.filename,
        displayName: local.filename,
        category: local.category,
        isOnPi: true,
        isForThisSite: false, // Sera mis à jour si trouvé dans cloud
        isCloud: false,
        source: 'local'
      });
    }

    // 2. Ensuite, ajouter/enrichir avec les vidéos cloud
    for (const cloud of this.cloudVideos) {
      const key = cloud.filename.toLowerCase();
      const existing = optionsMap.get(key);

      if (existing) {
        // La vidéo existe localement ET dans le cloud
        existing.isCloud = true;
        existing.isForThisSite = cloud.uploadedForSiteId === this.siteId;
        existing.cloudId = cloud.id;
        existing.source = 'both';
        existing.displayName = cloud.title || cloud.originalName || cloud.filename;
      } else {
        // Vidéo uniquement dans le cloud
        // Utiliser l'URL cloud comme path (sera transformé en path local lors du déploiement)
        const localPath = `videos/${cloud.category || 'UPLOADS'}/${cloud.filename}`;
        optionsMap.set(key, {
          path: localPath,
          filename: cloud.filename,
          displayName: cloud.title || cloud.originalName || cloud.filename,
          category: cloud.category,
          isOnPi: false,
          isForThisSite: cloud.uploadedForSiteId === this.siteId,
          isCloud: true,
          source: 'cloud',
          cloudId: cloud.id
        });
      }
    }

    // 3. Convertir en array et trier
    this.unifiedVideoOptions = Array.from(optionsMap.values())
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { numeric: true }));

    // 4. Grouper par priorité
    this.groupedVideoOptions = new Map();
    this.groupedVideoOptions.set('forThisSite', []);
    this.groupedVideoOptions.set('onPi', []);
    this.groupedVideoOptions.set('cloud', []);

    for (const opt of this.unifiedVideoOptions) {
      if (opt.isForThisSite && !opt.isOnPi) {
        this.groupedVideoOptions.get('forThisSite')!.push(opt);
      } else if (opt.isOnPi) {
        this.groupedVideoOptions.get('onPi')!.push(opt);
      } else {
        this.groupedVideoOptions.get('cloud')!.push(opt);
      }
    }

    // 5. Update cached array for template (prevents flickering)
    this.updateVideoOptionGroupsCache();

    // 6. Build video durations lookup
    this.videoDurations = new Map<string, number>();
    for (const local of this.localVideos) {
      if (local.duration && local.duration > 0) {
        this.videoDurations.set(local.path, local.duration);
      }
    }
    for (const cloud of this.cloudVideos) {
      if (cloud.duration && cloud.duration > 0) {
        const path = `cloud/${cloud.filename}`;
        if (!this.videoDurations.has(path)) {
          this.videoDurations.set(path, cloud.duration);
        }
      }
    }
  }

  /**
   * Met à jour le cache des groupes de vidéos pour le template
   * Appelé après updateUnifiedVideoOptions() pour éviter les appels de méthode dans le template
   */
  private updateVideoOptionGroupsCache(): void {
    const groups: { key: VideoOptionGroup; label: string; icon: string; videos: UnifiedVideoOption[] }[] = [];

    const forThisSite = this.groupedVideoOptions.get('forThisSite') || [];
    const onPi = this.groupedVideoOptions.get('onPi') || [];
    const cloud = this.groupedVideoOptions.get('cloud') || [];

    if (forThisSite.length > 0) {
      groups.push({ key: 'forThisSite', label: 'Pour ce site', icon: '⭐', videos: forThisSite });
    }
    if (onPi.length > 0) {
      groups.push({ key: 'onPi', label: 'Sur le Pi', icon: '✅', videos: onPi });
    }
    if (cloud.length > 0) {
      groups.push({ key: 'cloud', label: 'Cloud (à déployer)', icon: '☁️', videos: cloud });
    }

    this.videoOptionGroups = groups;

    // Build cloudVideoPaths (videos not yet on Pi)
    this.cloudVideoPaths = new Set(
      this.unifiedVideoOptions.filter(v => !v.isOnPi).map(v => v.path)
    );
  }

  /**
   * TrackBy function for video option groups (prevents DOM re-creation)
   */
  trackByGroupKey(index: number, group: { key: VideoOptionGroup }): string {
    return group.key;
  }

  /**
   * TrackBy function for video options (prevents DOM re-creation)
   */
  trackByVideoPath(index: number, video: UnifiedVideoOption): string {
    return video.path;
  }

  /**
   * Retourne les groupes de vidéos pour le dropdown
   * @deprecated Use videoOptionGroups property instead to avoid template method calls
   */
  getVideoOptionGroups(): { key: VideoOptionGroup; label: string; icon: string; videos: UnifiedVideoOption[] }[] {
    const groups: { key: VideoOptionGroup; label: string; icon: string; videos: UnifiedVideoOption[] }[] = [];

    const forThisSite = this.groupedVideoOptions.get('forThisSite') || [];
    const onPi = this.groupedVideoOptions.get('onPi') || [];
    const cloud = this.groupedVideoOptions.get('cloud') || [];

    if (forThisSite.length > 0) {
      groups.push({ key: 'forThisSite', label: 'Pour ce site', icon: '⭐', videos: forThisSite });
    }
    if (onPi.length > 0) {
      groups.push({ key: 'onPi', label: 'Sur le Pi', icon: '✅', videos: onPi });
    }
    if (cloud.length > 0) {
      groups.push({ key: 'cloud', label: 'Cloud (à déployer)', icon: '☁️', videos: cloud });
    }

    return groups;
  }

  /**
   * Filtre les options de vidéos selon la recherche
   */
  getFilteredVideoOptions(searchQuery: string = ''): UnifiedVideoOption[] {
    if (!searchQuery.trim()) {
      return this.unifiedVideoOptions;
    }
    const query = searchQuery.toLowerCase();
    return this.unifiedVideoOptions.filter(v =>
      v.displayName.toLowerCase().includes(query) ||
      v.filename.toLowerCase().includes(query)
    );
  }

  /**
   * Retourne le label d'affichage pour une option de vidéo
   */
  getVideoOptionLabel(video: UnifiedVideoOption): string {
    let label = video.displayName;
    if (!video.isOnPi) {
      label += ' ⏳';
    }
    return label;
  }

  /**
   * Vérifie si un chemin correspond à une vidéo cloud non déployée
   */
  isCloudVideoPath(path: string): boolean {
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return video ? !video.isOnPi : false;
  }

  /**
   * Returns the sponsor associated with a video in a category, if any.
   * Uses the same filename-matching logic as the Loop Manager badge.
   */
  getCategorySponsor(videoPath: string): SiteSponsor | null {
    if (!videoPath || this.siteSponsors.length === 0) return null;
    const parts = videoPath.split('/');
    const bareFilename = parts[parts.length - 1] || videoPath;
    return this.siteSponsors.find(
      sp => sp.video_filenames?.includes(bareFilename)
    ) ?? null;
  }

  /**
   * Reconstruit l'ensemble des chemins vidéo utilisés dans la configuration actuelle
   * Utilisé pour filtrer la bibliothèque vidéo par pertinence
   */
  private rebuildConfigVideoPaths(): void {
    const paths = new Set<string>();

    // 1. Vidéos de la boucle par défaut (sponsors)
    if (this.config.sponsors) {
      for (const sponsor of this.config.sponsors) {
        if (sponsor.path) {
          paths.add(sponsor.path);
        }
      }
    }

    // 2. Vidéos des catégories
    if (this.config.categories) {
      for (const cat of this.config.categories) {
        if (cat.videos) {
          for (const video of cat.videos) {
            if (video.path) {
              paths.add(video.path);
            }
          }
        }
        // Sous-catégories
        if (cat.subCategories) {
          for (const subcat of cat.subCategories) {
            if (subcat.videos) {
              for (const video of subcat.videos) {
                if (video.path) {
                  paths.add(video.path);
                }
              }
            }
          }
        }
      }
    }

    // 3. Vidéos des phases de match (timeCategories)
    if (this.config.timeCategories) {
      for (const tc of this.config.timeCategories) {
        if (tc.loopVideos) {
          for (const video of tc.loopVideos) {
            if (video.path) {
              paths.add(video.path);
            }
          }
        }
      }
    }

    this.configVideoPaths = paths;
  }

  getVideoCategories(): string[] {
    return this.cachedVideoCategories;
  }

  getVideosByCategory(category: string): LocalVideo[] {
    return this.cachedVideosByCategory.get(category) || [];
  }

  // Time Categories (Organization Télécommande)
  private readonly defaultTimeCategories: { id: string; name: string; icon: string; description: string }[] = [
    { id: 'before', name: 'Avant-match', icon: '🏁', description: 'Échauffement & présentation' },
    { id: 'during', name: 'Match', icon: '▶️', description: 'Live & animations' },
    { id: 'after', name: 'Après-match', icon: '🏆', description: 'Résultats & remerciements' }
  ];

  private rebuildTimeCategoriesCache(): void {
    if (this.config.timeCategories && this.config.timeCategories.length > 0) {
      this.cachedTimeCategories = this.config.timeCategories.map(tc => ({
        id: tc.id,
        name: tc.name,
        icon: tc.icon || this.getDefaultTimeCategoryIcon(tc.id),
        description: tc.description || ''
      }));
    } else {
      this.cachedTimeCategories = this.defaultTimeCategories;
    }
  }

  getTimeCategories(): { id: string; name: string; icon: string; description: string }[] {
    return this.cachedTimeCategories;
  }

  private getDefaultTimeCategoryIcon(id: string): string {
    const icons: Record<string, string> = { 'before': '🏁', 'during': '▶️', 'after': '🏆' };
    return icons[id] || '📁';
  }

  private ensureTimeCategories(): void {
    if (!this.config.timeCategories || this.config.timeCategories.length === 0) {
      this.config.timeCategories = [
        { id: 'before', name: 'Avant-match', icon: '🏁', color: '#f59e0b', description: 'Échauffement & présentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '▶️', color: '#22c55e', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Après-match', icon: '🏆', color: '#3b82f6', description: 'Résultats & remerciements', categoryIds: [] }
      ];
    }
  }

  isCategoryInTimeCategory(categoryId: string, timeCategoryId: string): boolean {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    return tc?.categoryIds?.includes(categoryId) || false;
  }

  toggleCategoryInTimeCategory(categoryId: string, timeCategoryId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.ensureTimeCategories();

    const tc = this.config.timeCategories!.find(t => t.id === timeCategoryId);
    if (!tc) return;

    if (!tc.categoryIds) tc.categoryIds = [];

    if (checked && !tc.categoryIds.includes(categoryId)) {
      tc.categoryIds.push(categoryId);
    } else if (!checked) {
      tc.categoryIds = tc.categoryIds.filter(id => id !== categoryId);
    }

    this.markDirty();
  }

  // Analytics Category Mappings
  getCategoryAnalyticsType(categoryId: string): string {
    return this.config.categoryMappings?.[categoryId] || '';
  }

  setCategoryAnalyticsType(categoryId: string, analyticsType: string): void {
    if (!this.config.categoryMappings) {
      this.config.categoryMappings = {};
    }

    if (analyticsType) {
      this.config.categoryMappings[categoryId] = analyticsType;
    } else {
      delete this.config.categoryMappings[categoryId];
    }

    this.markDirty();
  }

  /**
   * Suggère un type analytics basé sur le nom de la catégorie
   */
  suggestAnalyticsType(categoryName: string): string {
    if (!categoryName) return '';
    const name = categoryName.toLowerCase().trim();
    const sponsorKeywords = ['sponsor', 'partenaire', 'pub', 'annonce', 'focus partenaire', 'publicité'];
    const jingleKeywords = ['jingle', 'intro', 'générique', 'transition', 'habillage'];
    const ambianceKeywords = ['ambiance', 'animation', 'divertissement', 'musique', 'fond'];

    if (sponsorKeywords.some(k => name.includes(k))) return 'sponsor';
    if (jingleKeywords.some(k => name.includes(k))) return 'jingle';
    if (ambianceKeywords.some(k => name.includes(k))) return 'ambiance';
    return '';
  }

  // Actions
  resetConfig(): void {
    this.config = JSON.parse(this.originalConfig);
    this.isDirty = false;
    this.expandedCategories = (this.config.categories || []).map(() => false);
  }

  /**
   * Affiche la prévisualisation des changements avant déploiement
   */
  previewDeploy(): void {
    this.showDiffModal = true;
    this.diffLoading = true;
    this.rawDiffItems = [];
    this.expandedDiffItems = {};
    this.cdr.markForCheck();

    this.sitesService.previewConfigDiff(this.siteId, this.config).subscribe({
      next: (response) => {
        this.rawDiffItems = response.diff || [];
        this.diffLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // Si pas d'historique ou erreur, on peut quand même déployer
        this.rawDiffItems = [];
        this.diffLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Confirme et exécute le déploiement après prévisualisation
   */
  confirmDeploy(): void {
    this.deploying = true;
    this.deployStatus = 'sending';
    this.deployError = null;
    this.cdr.markForCheck();

    // Clean config before sending
    const configToSend = this.prepareConfigForDeploy();

    this.sitesService.sendCommand(this.siteId, 'update_config', {
      neoProContent: configToSend,
      mode: this.deployMode
    }).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.deployCommandId = response.commandId;

          if (response.queued && !response.sent) {
            // Site offline - commande en queue
            this.deployStatus = 'pending';
            this.deploying = false;
            this.showDiffModal = false;
            this.originalConfig = JSON.stringify(this.config);
            this.isDirty = false;
            this.notificationService.info('📥 Configuration en file d\'attente. Elle sera appliquée à la reconnexion du Pi.');
            this.configDeployed.emit();
            this.cdr.markForCheck();
          } else {
            // Site online - attendre le résultat via socket
            this.deployStatus = 'pending';
            this.waitForDeployResult(response.commandId);
            this.cdr.markForCheck();
          }
        } else {
          // Pas de commandId retourné - comportement legacy
          this.deploying = false;
          this.deployStatus = 'success';
          this.showDiffModal = false;
          this.originalConfig = JSON.stringify(this.config);
          this.isDirty = false;
          this.notificationService.success('Configuration envoyée !');
          this.configDeployed.emit();
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        this.deploying = false;
        this.deployStatus = 'error';
        const message = ErrorExtractor.getMessage(error);
        this.deployError = message;
        this.logger.error('Failed to deploy config', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur d'envoi: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Attend le résultat du déploiement via Socket.IO
   */
  private waitForDeployResult(commandId: string): void {
    // Timeout de 45 secondes (légèrement plus que le timeout serveur de 30s)
    const DEPLOY_TIMEOUT = 45000;

    // Nettoyer les subscriptions précédentes
    this.deploySubscription?.unsubscribe();
    if (this.deployTimeoutId) {
      clearTimeout(this.deployTimeoutId);
    }

    // Timeout de sécurité
    this.deployTimeoutId = setTimeout(() => {
      if (this.deployStatus === 'pending') {
        this.deploySubscription?.unsubscribe();
        this.deploying = false;
        this.deployStatus = 'timeout';
        this.deployError = 'Timeout: le Pi n\'a pas répondu dans les temps';
        this.notificationService.warning('Timeout: le Pi n\'a pas confirmé l\'application de la configuration');
        this.cdr.markForCheck();
      }
    }, DEPLOY_TIMEOUT);

    // Écouter le résultat via socket
    this.deploySubscription = this.socketService.on<{ siteId: string; commandId: string; status: string }>('command_completed')
      .pipe(
        filter(event => event.commandId === commandId),
        take(1)
      )
      .subscribe(event => {
        if (this.deployTimeoutId) {
          clearTimeout(this.deployTimeoutId);
        }

        this.deploying = false;

        if (event.status === 'success' || event.status === 'completed') {
          this.deployStatus = 'success';
          this.showDiffModal = false;
          this.originalConfig = JSON.stringify(this.config);
          this.isDirty = false;
          this.notificationService.success('Configuration appliquée avec succès sur le Pi !');
          this.configDeployed.emit();
        } else {
          this.deployStatus = 'error';
          this.deployError = 'Le Pi a signalé une erreur lors de l\'application';
          this.notificationService.error('Erreur: le Pi n\'a pas pu appliquer la configuration');
        }

        this.cdr.markForCheck();
      });

    // Écouter aussi les timeouts du serveur
    const timeoutSub = this.socketService.on<{ siteId: string; commandId: string }>('command_timeout')
      .pipe(
        filter(event => event.commandId === commandId),
        take(1)
      )
      .subscribe(() => {
        if (this.deployTimeoutId) {
          clearTimeout(this.deployTimeoutId);
        }
        this.deploySubscription?.unsubscribe();

        this.deploying = false;
        this.deployStatus = 'timeout';
        this.deployError = 'Le Pi n\'a pas répondu dans les temps';
        this.notificationService.warning('Timeout: le Pi ne répond pas');
        this.cdr.markForCheck();
      });

    // Ajouter à la subscription principale pour cleanup
    this.deploySubscription.add(timeoutSub);
  }

  /**
   * Réinitialise l'état de déploiement
   */
  resetDeployStatus(): void {
    this.deployStatus = 'idle';
    this.deployError = null;
    this.deployCommandId = null;
  }

  /**
   * Formate une valeur JSON pour l'affichage dans le diff
   */
  formatJson(value: unknown): string {
    try {
      if (value === null || value === undefined) {
        return 'null';
      }
      if (typeof value === 'string') {
        // Essayer de parser pour pretty-print s'il s'agit d'un JSON
        try {
          const parsed = JSON.parse(value);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return value;
        }
      }
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    } catch {
      return String(value);
    }
  }

  private prepareConfigForDeploy(): Partial<SiteConfiguration> {
    // Only send the relevant content parts, not auth/sync which are local
    return {
      sponsors: this.config.sponsors,
      categories: this.config.categories,
      timeCategories: this.config.timeCategories,
      categoryMappings: this.config.categoryMappings
    };
  }

  // ============================================================================
  // Draft Management
  // ============================================================================

  /**
   * Charge le brouillon du site s'il existe
   */
  private loadDraft(): void {
    if (!this.siteId) return;

    this.draftService.getDraft(this.siteId).subscribe({
      next: (draft) => {
        this.draft = draft;
        // Si un brouillon existe et qu'il est plus récent que la config locale, proposer de l'utiliser
        if (draft && draft.configuration) {
          // On garde le brouillon en référence mais on ne l'applique pas automatiquement
          this.logger.info('Draft loaded for site', { siteId: this.siteId, draftId: draft.id });
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.logger.error('Failed to load draft', { error: ErrorExtractor.getMessage(error) });
        this.draft = null;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Sauvegarde la configuration actuelle comme brouillon
   */
  saveDraft(): void {
    if (!this.siteId || this.savingDraft) return;

    this.savingDraft = true;
    this.cdr.markForCheck();

    const configToSave = this.prepareConfigForDeploy() as any;

    this.draftService.saveDraft(this.siteId, configToSave, 'Brouillon').subscribe({
      next: (savedDraft) => {
        this.draft = savedDraft;
        this.savingDraft = false;
        this.notificationService.success('Brouillon sauvegardé');
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.savingDraft = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Supprime le brouillon du site
   */
  deleteDraft(): void {
    if (!this.siteId || !this.draft) return;

    if (!confirm('Supprimer le brouillon ? Cette action est irréversible.')) {
      return;
    }

    this.draftService.deleteDraft(this.siteId).subscribe({
      next: () => {
        this.draft = null;
        this.notificationService.success('Brouillon supprimé');
        this.cdr.markForCheck();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // ============================================================================
  // Video Upload Handlers
  // ============================================================================

  /**
   * Appelé quand une vidéo est uploadée avec succès
   */
  onVideoUploaded(video: UploadedVideo): void {
    this.notificationService.success(`Vidéo "${video.filename}" uploadée`);
    // Rafraîchir la liste des vidéos cloud
    this.loadContent();
  }

  /**
   * Appelé quand tous les uploads sont terminés
   */
  onAllVideosUploaded(videos: UploadedVideo[]): void {
    if (videos.length > 1) {
      this.notificationService.success(`${videos.length} vidéos uploadées pour ce site`);
    }
    this.loadContent();
  }

  // ============================================================================
  // Orchestrated Deployment
  // ============================================================================

  /**
   * Retourne le texte de statut pour l'affichage
   */
  getDeploymentStatusText(status: string): string {
    const statusTexts: Record<string, string> = {
      'pending': 'En attente',
      'deploying_videos': 'Déploiement vidéos',
      'deploying_config': 'Application config',
      'completed': 'Terminé',
      'partial_failure': 'Partiellement échoué',
      'failed': 'Échec'
    };
    return statusTexts[status] || status;
  }

  /**
   * Démarre le polling de progression du déploiement orchestré
   */
  private startOrchestratedDeploymentPolling(deploymentId: string): void {
    this.orchestratedDeploymentId = deploymentId;
    this.orchestratedDeploymentPollSubscription?.unsubscribe();

    // Polling toutes les 2 secondes
    this.orchestratedDeploymentPollSubscription = interval(2000).subscribe(() => {
      if (!this.orchestratedDeploymentId) {
        this.orchestratedDeploymentPollSubscription?.unsubscribe();
        return;
      }

      this.draftService.getDeploymentProgress(this.siteId, this.orchestratedDeploymentId).subscribe({
        next: (progress) => {
          this.orchestratedDeployment = progress;
          this.cdr.markForCheck();

          // Arrêter le polling si terminé
          if (['completed', 'failed', 'partial_failure'].includes(progress.status)) {
            this.orchestratedDeploymentPollSubscription?.unsubscribe();
            this.orchestratedDeploymentId = null;

            // Notification finale
            if (progress.status === 'completed') {
              this.notificationService.success('Déploiement terminé avec succès !');
              this.draft = null; // Le brouillon a été déployé
              this.loadContent(); // Rafraîchir les données
            } else if (progress.status === 'partial_failure') {
              this.notificationService.warning(`Déploiement partiel: ${progress.videosFailed} vidéo(s) en échec`);
            } else {
              this.notificationService.error(`Échec du déploiement: ${progress.errorMessage || 'Erreur inconnue'}`);
            }

            // Effacer l'affichage après 10 secondes
            setTimeout(() => {
              if (this.orchestratedDeployment?.status === progress.status) {
                this.orchestratedDeployment = null;
                this.cdr.markForCheck();
              }
            }, 10000);
          }
        },
        error: () => {
          // Ignorer les erreurs de polling
        }
      });
    });
  }

  // ============================================================================
  // Pending Deployments Management
  // ============================================================================

  /**
   * Charge la liste des déploiements en attente pour ce site
   */
  refreshPendingDeployments(): void {
    if (!this.siteId) return;

    this.loadingPendingDeployments = true;
    this.cdr.markForCheck();

    this.sitesService.getPendingDeployments(this.siteId).subscribe({
      next: (deployments) => {
        this.pendingDeployments = deployments;
        this.loadingPendingDeployments = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loadingPendingDeployments = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load pending deployments', { error: message, siteId: this.siteId });
        // Ne pas afficher de notification - ce n'est pas critique
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Annule un déploiement en attente
   */
  cancelPendingDeployment(deployment: PendingDeployment): void {
    if (this.cancellingDeploymentId) return;

    this.cancellingDeploymentId = deployment.id;
    this.cdr.markForCheck();

    this.sitesService.cancelDeployment(deployment.id).subscribe({
      next: () => {
        this.cancellingDeploymentId = null;
        this.notificationService.success(`Déploiement de "${deployment.video_title || deployment.filename}" annulé`);
        // Retirer le déploiement de la liste localement
        this.pendingDeployments = this.pendingDeployments.filter(d => d.id !== deployment.id);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cancellingDeploymentId = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }
}
