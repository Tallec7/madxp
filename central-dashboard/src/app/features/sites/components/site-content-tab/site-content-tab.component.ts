import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import {
  SiteConfiguration,
  CategoryConfig,
  LocalVideo,
  CloudVideo,
  LocalStorage,
  ConfigDiff
} from '../../../../core/models';
import { VideoLibraryComponent, VideoItem } from '../video-library/video-library.component';
import { RemotePreviewComponent } from '../remote-preview/remote-preview.component';

interface SponsorVideo {
  name: string;
  path: string;
  type: string;
  owner?: 'club' | 'neopro';
  locked?: boolean;
}

@Component({
  selector: 'app-site-content-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, VideoLibraryComponent, RemotePreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="content-tab">
      <!-- Bibliothèque Vidéo -->
      <div class="section">
        <app-video-library
          [videos]="localVideos"
          [cloudVideos]="cloudVideos"
          [storage]="localStorage"
          [selectedPath]="selectedVideoPath"
          (videoSelect)="onVideoSelect($event)"
          (videoPreview)="onVideoPreview($event)"
          (videoDeploy)="onVideoDeploy($event)"
          (videoDelete)="onVideoDelete($event)"
        ></app-video-library>
      </div>

      <!-- Aperçu télécommande -->
      <div class="section">
        <app-remote-preview
          [config]="config"
          [localVideos]="localVideos"
        ></app-remote-preview>
      </div>

      <!-- Boucle par défaut -->
      <div class="section card">
        <div class="section-header">
          <h4>
            <span class="section-icon">🔄</span>
            Boucle par défaut
          </h4>
          <button class="btn btn-sm btn-secondary" (click)="addSponsor()">+ Ajouter</button>
        </div>
        <p class="section-desc">
          Vidéos diffusées automatiquement quand aucune vidéo n'est sélectionnée.
          Utilisée par défaut pour toutes les phases sans boucle personnalisée.
        </p>

        <div class="sponsors-list" *ngIf="config.sponsors && config.sponsors.length > 0">
          <div class="sponsor-item" *ngFor="let sponsor of config.sponsors; let i = index" [class.neopro]="sponsor.owner === 'neopro'">
            <span class="sponsor-order">{{ i + 1 }}</span>
            <div class="sponsor-content">
              <input
                type="text"
                [(ngModel)]="sponsor.name"
                (ngModelChange)="markDirty()"
                placeholder="Nom"
                class="sponsor-name-input"
              />
              <select
                [(ngModel)]="sponsor.path"
                (ngModelChange)="markDirty()"
                class="video-select"
                *ngIf="localVideos.length > 0"
              >
                <option value="">-- Sélectionner --</option>
                <optgroup *ngFor="let cat of getVideoCategories()" [label]="cat || 'Sans catégorie'">
                  <option *ngFor="let v of getVideosByCategory(cat)" [value]="v.path">
                    {{ v.filename }}
                  </option>
                </optgroup>
              </select>
              <input
                type="text"
                [(ngModel)]="sponsor.path"
                (ngModelChange)="markDirty()"
                placeholder="Chemin vidéo"
                class="sponsor-path-input"
                *ngIf="localVideos.length === 0"
              />
            </div>
            <div class="sponsor-owner">
              <label class="owner-radio">
                <input type="radio" [name]="'owner-' + i" [(ngModel)]="sponsor.owner" value="club" (ngModelChange)="markDirty()"/>
                <span class="owner-label club">Club</span>
              </label>
              <label class="owner-radio">
                <input type="radio" [name]="'owner-' + i" [(ngModel)]="sponsor.owner" value="neopro" (ngModelChange)="markDirty()"/>
                <span class="owner-label neopro">NEOPRO</span>
              </label>
            </div>
            <button class="btn-remove" (click)="removeSponsor(i)">×</button>
          </div>
        </div>
        <div class="empty-state" *ngIf="!config.sponsors || config.sponsors.length === 0">
          <p>Aucune vidéo dans la boucle par défaut</p>
          <button class="btn btn-primary btn-sm" (click)="addSponsor()">Ajouter une vidéo</button>
        </div>
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
                      *ngIf="localVideos.length > 0"
                    >
                      <option value="">-- Sélectionner --</option>
                      <optgroup *ngFor="let c of getVideoCategories()" [label]="c || 'Sans catégorie'">
                        <option *ngFor="let v of getVideosByCategory(c)" [value]="v.path">{{ v.filename }}</option>
                      </optgroup>
                    </select>
                    <input
                      type="text"
                      [(ngModel)]="video.path"
                      (ngModelChange)="markDirty()"
                      placeholder="Chemin vidéo"
                      class="video-input-compact"
                      *ngIf="localVideos.length === 0"
                    />
                    <input
                      type="text"
                      [(ngModel)]="video.name"
                      (ngModelChange)="markDirty()"
                      placeholder="Nom affiché"
                      class="video-name-compact"
                    />
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
                          *ngIf="localVideos.length > 0"
                        >
                          <option value="">-- Sélectionner --</option>
                          <optgroup *ngFor="let c of getVideoCategories()" [label]="c || 'Sans catégorie'">
                            <option *ngFor="let v of getVideosByCategory(c)" [value]="v.path">{{ v.filename }}</option>
                          </optgroup>
                        </select>
                        <input
                          type="text"
                          [(ngModel)]="video.path"
                          (ngModelChange)="markDirty()"
                          placeholder="Chemin vidéo"
                          class="video-input-compact"
                          *ngIf="localVideos.length === 0"
                        />
                        <input
                          type="text"
                          [(ngModel)]="video.name"
                          (ngModelChange)="markDirty()"
                          placeholder="Nom affiché"
                          class="video-name-compact"
                        />
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

      <!-- Organisation Télécommande -->
      <div class="section card">
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

      <!-- Boucles Vidéo par Phase -->
      <div class="section card">
        <div class="section-header">
          <h4>
            <span class="section-icon">🎬</span>
            Boucles Vidéo par Phase
          </h4>
        </div>
        <p class="section-desc">
          Définir une boucle spécifique pour chaque phase (optionnel, sinon la boucle par défaut est utilisée)
        </p>

        <div class="phase-loops-grid">
          <div class="phase-loop-card" *ngFor="let tc of getTimeCategories()">
            <div class="phase-loop-header">
              <span class="phase-loop-icon">{{ tc.icon }}</span>
              <span class="phase-loop-name">{{ tc.name }}</span>
              <span class="phase-loop-count">{{ getPhaseLoopVideoCount(tc.id) }} vidéo(s)</span>
              <button class="btn-add-tiny" (click)="addPhaseLoopVideo(tc.id)">+ Ajouter</button>
            </div>
            <div class="phase-loop-content">
              <div class="phase-loop-videos" *ngIf="getPhaseLoopVideos(tc.id).length > 0">
                <div class="loop-video-item" *ngFor="let video of getPhaseLoopVideos(tc.id); let vidIndex = index">
                  <span class="loop-video-order">{{ vidIndex + 1 }}</span>
                  <input
                    type="text"
                    [value]="video.name"
                    (input)="updatePhaseLoopVideo(tc.id, vidIndex, 'name', $any($event.target).value)"
                    placeholder="Nom"
                    class="loop-video-name-input"
                  />
                  <select
                    class="loop-video-select"
                    [ngModel]="video.path"
                    (ngModelChange)="updatePhaseLoopVideo(tc.id, vidIndex, 'path', $event)"
                  >
                    <option value="">-- Sélectionner --</option>
                    <optgroup *ngFor="let cat of getVideoCategories()" [label]="cat || 'Sans catégorie'">
                      <option *ngFor="let v of getVideosByCategory(cat)" [value]="v.path">
                        {{ v.filename }}
                      </option>
                    </optgroup>
                  </select>
                  <button class="btn-remove-tiny" (click)="removePhaseLoopVideo(tc.id, vidIndex)">×</button>
                </div>
              </div>
              <div class="phase-loop-empty" *ngIf="getPhaseLoopVideos(tc.id).length === 0">
                <span class="loop-hint">→ Utilise la boucle par défaut ({{ config.sponsors?.length ?? 0 }} vidéos)</span>
              </div>
              <div class="phase-loop-actions" *ngIf="(config.sponsors?.length ?? 0) > 0 && getPhaseLoopVideos(tc.id).length === 0">
                <button class="btn btn-sm btn-secondary" (click)="copyDefaultLoopToPhase(tc.id)">
                  Copier la boucle par défaut
                </button>
              </div>
              <div class="phase-loop-actions" *ngIf="getPhaseLoopVideos(tc.id).length > 0">
                <button class="btn btn-sm btn-secondary" (click)="clearPhaseLoop(tc.id)">
                  Effacer (utiliser boucle par défaut)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Catégories Analytics -->
      <div class="section card">
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
              </div>
            </ng-container>
          </ng-container>
        </div>
        <div class="empty-state small" *ngIf="!config.categories || config.categories.length === 0">
          <p>Créez d'abord des catégories pour configurer les analytics</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions-bar" *ngIf="isDirty">
        <span class="dirty-indicator">⚠️ Modifications non enregistrées</span>
        <div class="actions-buttons">
          <button class="btn btn-secondary" (click)="resetConfig()">Annuler</button>
          <button class="btn btn-primary" (click)="previewDeploy()" [disabled]="deploying">
            {{ deploying ? 'Déploiement...' : (isConnected ? 'Déployer' : '📥 Déployer (file d'attente)') }}
          </button>
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
            <div class="mode-info">
              <span class="mode-badge">Mode: Fusion</span>
              <span class="mode-desc">Les paramètres locaux du club seront préservés</span>
            </div>

            <div *ngIf="diffLoading" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Calcul des différences...</span>
            </div>
            <div *ngIf="!diffLoading && diffItems.length === 0" class="no-changes">
              Aucun changement détecté par rapport à la configuration actuelle
            </div>
            <div *ngIf="!diffLoading && diffItems.length > 0" class="diff-list">
              <div class="diff-summary">
                <div class="diff-total">{{ diffItems.length }} changement(s) détecté(s)</div>
                <div class="diff-pill added">+ {{ diffCounts.added }}</div>
                <div class="diff-pill changed">~ {{ diffCounts.changed }}</div>
                <div class="diff-pill removed">- {{ diffCounts.removed }}</div>
              </div>
              <div class="diff-item" *ngFor="let diff of diffItems" [class]="'diff-' + diff.type">
                <div class="diff-head">
                  <div class="diff-field">{{ diff.path }}</div>
                  <div class="diff-type">
                    <span *ngIf="diff.type === 'added'" class="badge badge-success">Ajouté</span>
                    <span *ngIf="diff.type === 'removed'" class="badge badge-danger">Supprimé</span>
                    <span *ngIf="diff.type === 'changed'" class="badge badge-warning">Modifié</span>
                  </div>
                </div>

                <div class="diff-values" *ngIf="diff.type === 'changed'">
                  <div class="diff-old">
                    <span class="diff-label">Avant:</span>
                    <pre class="diff-json">{{ formatJson(diff.oldValue) }}</pre>
                  </div>
                  <div class="diff-new">
                    <span class="diff-label">Après:</span>
                    <pre class="diff-json">{{ formatJson(diff.newValue) }}</pre>
                  </div>
                </div>
                <div class="diff-values" *ngIf="diff.type === 'added'">
                  <div class="diff-new">
                    <span class="diff-label">Valeur:</span>
                    <pre class="diff-json">{{ formatJson(diff.newValue) }}</pre>
                  </div>
                </div>
                <div class="diff-values" *ngIf="diff.type === 'removed'">
                  <div class="diff-old">
                    <span class="diff-label">Valeur:</span>
                    <pre class="diff-json">{{ formatJson(diff.oldValue) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDiffModal = false">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="confirmDeploy()"
              [disabled]="deploying"
            >
              {{ deploying ? 'Déploiement...' : 'Confirmer le déploiement' }}
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

    .dirty-indicator {
      font-size: 0.875rem;
      font-weight: 500;
      color: #92400e;
    }

    .actions-buttons {
      display: flex;
      gap: 0.5rem;
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

    .mode-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .mode-badge {
      font-weight: 600;
      color: #166534;
      background: #dcfce7;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .mode-desc {
      color: #166534;
      font-size: 0.875rem;
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
  `]
})
export class SiteContentTabComponent implements OnInit, OnChanges {
  @Input() siteId!: string;
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

  // Diff modal
  showDiffModal: boolean = false;
  diffLoading: boolean = false;
  diffItems: ConfigDiff[] = [];

  // Cached computed values for template
  cachedVideoCategories: string[] = [];
  cachedVideosByCategory: Map<string, LocalVideo[]> = new Map();
  cachedTimeCategories: { id: string; name: string; icon: string; description: string }[] = [];

  get diffCounts() {
    return this.diffItems.reduce(
      (acc, item) => {
        acc[item.type]++;
        return acc;
      },
      { added: 0, changed: 0, removed: 0 }
    );
  }

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadContent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadContent();
    }
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
          type: v.type || 'video/mp4'
        })),
        subCategories: (c.subCategories || []).map((sc: any) => ({
          id: sc.id || this.generateId(),
          name: sc.name || '',
          videos: (sc.videos || []).map((v: any) => ({
            name: v.name || '',
            path: v.path || '',
            type: v.type || 'video/mp4'
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

    if (confirm(`Déployer "${video.filename}" vers ce site ?`)) {
      this.sitesService.sendCommand(this.siteId, 'deploy_video', {
        videoId: video.id,
        filename: video.filename,
        url: video.path
      }).subscribe({
        next: () => {
          this.notificationService.success(`Déploiement de "${video.filename}" lancé`);
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  onVideoDelete(video: VideoItem): void {
    const location = video.isOnPi ? 'du Pi' : 'du cloud';
    if (confirm(`Supprimer "${video.filename}" ${location} ?`)) {
      if (video.isOnPi && video.source === 'local') {
        // Delete from Pi via command
        this.sitesService.sendCommand(this.siteId, 'delete_video', {
          path: video.path,
          filename: video.filename
        }).subscribe({
          next: () => {
            this.notificationService.success(`"${video.filename}" supprimé du Pi`);
            this.loadContent();
          },
          error: (error) => {
            const message = ErrorExtractor.getMessage(error);
            this.notificationService.error(`Erreur: ${message}`);
          }
        });
      } else if (video.id) {
        // Delete from cloud via API
        this.notificationService.warning('Suppression cloud non implémentée');
      }
    }
  }

  onConfigChange(config: SiteConfiguration): void {
    this.config = config;
    this.markDirty();
  }

  // Sponsors
  addSponsor(): void {
    if (!this.config.sponsors) this.config.sponsors = [];
    this.config.sponsors.push({ name: '', path: '', type: 'video/mp4', owner: 'club' });
    this.markDirty();
  }

  removeSponsor(index: number): void {
    this.config.sponsors?.splice(index, 1);
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
    cat.videos.push({ name: '', path: '', type: 'video/mp4' });
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
    subcat.videos.push({ name: '', path: '', type: 'video/mp4' });
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

  // Phase Loop Videos - Support N vidéos par phase
  getPhaseLoopVideos(timeCategoryId: string): SponsorVideo[] {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    return tc?.loopVideos || [];
  }

  getPhaseLoopVideoCount(timeCategoryId: string): number {
    return this.getPhaseLoopVideos(timeCategoryId).length;
  }

  addPhaseLoopVideo(timeCategoryId: string): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === timeCategoryId);
    if (!tc) return;

    if (!tc.loopVideos) {
      tc.loopVideos = [];
    }
    tc.loopVideos.push({
      name: '',
      path: '',
      type: 'video/mp4'
    });
    this.markDirty();
  }

  updatePhaseLoopVideo(timeCategoryId: string, vidIndex: number, field: 'name' | 'path', value: string): void {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    if (!tc?.loopVideos?.[vidIndex]) return;

    tc.loopVideos[vidIndex][field] = value;

    // Si on change le path, auto-remplir le nom si vide
    if (field === 'path' && value && !tc.loopVideos[vidIndex].name) {
      const video = this.localVideos.find(v => v.path === value);
      tc.loopVideos[vidIndex].name = video?.filename || value.split('/').pop() || 'Vidéo';
    }

    this.markDirty();
  }

  removePhaseLoopVideo(timeCategoryId: string, vidIndex: number): void {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    if (!tc?.loopVideos) return;

    tc.loopVideos.splice(vidIndex, 1);
    this.markDirty();
  }

  copyDefaultLoopToPhase(timeCategoryId: string): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === timeCategoryId);
    if (!tc || !this.config.sponsors) return;

    tc.loopVideos = this.config.sponsors.map(s => ({
      name: s.name,
      path: s.path,
      type: s.type || 'video/mp4'
    }));
    this.markDirty();
  }

  clearPhaseLoop(timeCategoryId: string): void {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    if (!tc) return;

    tc.loopVideos = [];
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
    this.diffItems = [];
    this.cdr.markForCheck();

    this.sitesService.previewConfigDiff(this.siteId, this.config).subscribe({
      next: (response) => {
        this.diffItems = response.diff || [];
        this.diffLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // Si pas d'historique ou erreur, on peut quand même déployer
        this.diffItems = [];
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
    this.cdr.markForCheck();

    // Clean config before sending
    const configToSend = this.prepareConfigForDeploy();

    this.sitesService.sendCommand(this.siteId, 'update_config', {
      neoProContent: configToSend,
      mode: 'merge'
    }).subscribe({
      next: () => {
        this.deploying = false;
        this.showDiffModal = false;
        this.originalConfig = JSON.stringify(this.config);
        this.isDirty = false;
        this.notificationService.success(
          this.isConnected
            ? 'Configuration déployée avec succès !'
            : '📥 Configuration mise en file d\'attente. Elle sera appliquée à la reconnexion.'
        );
        this.configDeployed.emit();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.deploying = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to deploy config', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
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
}
