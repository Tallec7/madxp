import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { SitesService } from '../../../core/services/sites.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import {
  SiteConfiguration,
  ConfigHistory,
  ConfigDiff,
  ConfigValidationResult,
  ConfigValidationError,
  SponsorConfig,
  CategoryConfig,
  TimeCategoryConfig,
  VideoConfig,
  DEFAULT_CONFIG,
  AnalyticsCategory,
} from '../../../core/models';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="config-editor-container">
      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'form'"
          (click)="activeTab = 'form'"
        >
          Formulaire
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'json'"
          (click)="activeTab = 'json'"
        >
          JSON
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'history'"
          (click)="activeTab = 'history'; loadHistory()"
        >
          Historique ({{ historyCount }})
        </button>
      </div>

      <!-- Loading indicator -->
      <div class="loading-banner" *ngIf="isLoading()">
        <div class="spinner-small"></div>
        <span>Chargement de la configuration...</span>
      </div>

      <!-- Form Tab -->
      <div *ngIf="activeTab === 'form'" class="tab-content">
        <div class="form-sections">
          <!-- Section Authentification -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🔐</span>
              Authentification
            </h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="clubName">Nom du club *</label>
                <input
                  type="text"
                  id="clubName"
                  [(ngModel)]="config.auth.clubName"
                  (ngModelChange)="onConfigChange()"
                  placeholder="Mon Club"
                  [class.error]="hasError('auth.clubName')"
                />
                <span class="field-error" *ngIf="hasError('auth.clubName')">
                  {{ getError('auth.clubName') }}
                </span>
              </div>
              <div class="form-group">
                <label for="password">Mot de passe WiFi</label>
                <input
                  type="text"
                  id="password"
                  [(ngModel)]="config.auth.password"
                  (ngModelChange)="onConfigChange()"
                  placeholder="MotDePasse123"
                />
              </div>
              <div class="form-group">
                <label for="sessionDuration">Durée de session</label>
                <select
                  id="sessionDuration"
                  [(ngModel)]="config.auth.sessionDuration"
                  (ngModelChange)="onConfigChange()"
                >
                  <option [value]="3600000">1 heure</option>
                  <option [value]="7200000">2 heures</option>
                  <option [value]="14400000">4 heures</option>
                  <option [value]="28800000">8 heures</option>
                  <option [value]="86400000">24 heures</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Section Remote -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📱</span>
              Télécommande
            </h4>
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="remoteTitle">Titre de la télécommande</label>
                <input
                  type="text"
                  id="remoteTitle"
                  [(ngModel)]="config.remote.title"
                  (ngModelChange)="onConfigChange()"
                  placeholder="Telecommande Neopro - Mon Club"
                />
              </div>
            </div>
          </div>

          <!-- Section Synchronisation -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🔄</span>
              Synchronisation
            </h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="config.sync.enabled"
                    (ngModelChange)="onConfigChange()"
                  />
                  Synchronisation activée
                </label>
              </div>
              <div class="form-group full-width" *ngIf="config.sync.enabled">
                <label for="serverUrl">URL du serveur</label>
                <input
                  type="url"
                  id="serverUrl"
                  [(ngModel)]="config.sync.serverUrl"
                  (ngModelChange)="onConfigChange()"
                  placeholder="https://neopro-central.onrender.com"
                />
              </div>
              <div class="form-group" *ngIf="config.sync.enabled">
                <label for="syncSiteName">ID du site</label>
                <input
                  type="text"
                  id="syncSiteName"
                  [(ngModel)]="config.sync.siteName"
                  (ngModelChange)="onConfigChange()"
                  [placeholder]="siteId"
                />
              </div>
              <div class="form-group" *ngIf="config.sync.enabled">
                <label for="syncClubName">Nom du club (sync)</label>
                <input
                  type="text"
                  id="syncClubName"
                  [(ngModel)]="config.sync.clubName"
                  (ngModelChange)="onConfigChange()"
                />
              </div>
            </div>
          </div>

          <!-- Section Sponsors -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🏆</span>
              Sponsors
              <button class="btn-add" (click)="addSponsor()">+ Ajouter</button>
            </h4>
            <div class="items-list" *ngIf="config.sponsors.length > 0">
              <div class="item-card" *ngFor="let sponsor of config.sponsors; let i = index">
                <div class="item-header">
                  <span class="item-name">{{ sponsor.name || 'Nouveau sponsor' }}</span>
                  <div class="ownership-controls inline">
                    <label class="ownership-option">
                      <input
                        type="radio"
                        [name]="'owner-sponsor-' + i"
                        [(ngModel)]="sponsor.owner"
                        [value]="'club'"
                        (ngModelChange)="onConfigChange(); sponsor.locked = false"
                      />
                      <span class="ownership-label club small">Club</span>
                    </label>
                    <label class="ownership-option">
                      <input
                        type="radio"
                        [name]="'owner-sponsor-' + i"
                        [(ngModel)]="sponsor.owner"
                        [value]="'neopro'"
                        (ngModelChange)="onConfigChange(); sponsor.locked = true"
                      />
                      <span class="ownership-label neopro small">NEOPRO</span>
                    </label>
                  </div>
                  <button class="btn-remove" (click)="removeSponsor(i)">×</button>
                </div>
                <div class="item-form">
                  <input
                    type="text"
                    [(ngModel)]="sponsor.name"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Nom du sponsor"
                  />
                  <input
                    type="text"
                    [(ngModel)]="sponsor.path"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Chemin vidéo (ex: videos/SPONSORS/video.mp4)"
                  />
                  <input
                    type="text"
                    [(ngModel)]="sponsor.type"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Type (ex: video/mp4)"
                  />
                </div>
              </div>
            </div>
            <p class="empty-message" *ngIf="config.sponsors.length === 0">
              Aucun sponsor configuré
            </p>
          </div>

          <!-- Section Catégories -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📁</span>
              Catégories et Vidéos
              <button class="btn-add" (click)="addCategory()">+ Nouvelle catégorie</button>
            </h4>
            <div class="debug-info">
              <code>categories.length = {{ config.categories.length }}</code>
            </div>
            <div class="categories-list" *ngIf="config.categories.length > 0">
              <div class="category-card" *ngFor="let category of config.categories; let catIndex = index"
                   [class.expanded]="expandedCategory === catIndex">
                <div class="category-header" (click)="toggleCategory(catIndex)">
                  <span class="expand-icon">{{ expandedCategory === catIndex ? '▼' : '▶' }}</span>
                  <input
                    type="text"
                    [(ngModel)]="category.name"
                    (ngModelChange)="onConfigChange()"
                    (click)="$event.stopPropagation()"
                    placeholder="Nom de la catégorie"
                    class="category-name-input"
                  />
                  <div class="ownership-controls" (click)="$event.stopPropagation()">
                    <label class="ownership-option">
                      <input
                        type="radio"
                        [name]="'owner-category-' + catIndex"
                        [(ngModel)]="category.owner"
                        [value]="'club'"
                        (ngModelChange)="onConfigChange(); category.locked = false"
                      />
                      <span class="ownership-label club">Club</span>
                    </label>
                    <label class="ownership-option">
                      <input
                        type="radio"
                        [name]="'owner-category-' + catIndex"
                        [(ngModel)]="category.owner"
                        [value]="'neopro'"
                        (ngModelChange)="onConfigChange(); category.locked = true"
                      />
                      <span class="ownership-label neopro">NEOPRO</span>
                    </label>
                  </div>
                  <span class="category-stats">
                    {{ category.videos.length || 0 }} vidéo(s)
                    <span *ngIf="category.subCategories?.length"> · {{ category.subCategories.length }} sous-cat.</span>
                  </span>
                  <button class="btn-remove" (click)="removeCategory(catIndex); $event.stopPropagation()">×</button>
                </div>

                <div class="category-content" *ngIf="expandedCategory === catIndex">
                  <!-- Vidéos de la catégorie -->
                  <div class="videos-section">
                    <div class="section-subheader">
                      <span>Vidéos directes</span>
                      <button class="btn-add-small" (click)="addVideo(catIndex, null)">+ Ajouter vidéo</button>
                    </div>
                    <div class="videos-list" *ngIf="category.videos && category.videos.length > 0">
                      <div class="video-item-editable" *ngFor="let video of category.videos; let vidIndex = index">
                        <span class="video-icon">🎬</span>
                        <div class="ownership-controls inline">
                          <label class="ownership-option">
                            <input
                              type="radio"
                              [name]="'owner-video-' + catIndex + '-' + vidIndex"
                              [(ngModel)]="video.owner"
                              [value]="'club'"
                              (ngModelChange)="onConfigChange(); video.locked = false"
                            />
                            <span class="ownership-label club small">Club</span>
                          </label>
                          <label class="ownership-option">
                            <input
                              type="radio"
                              [name]="'owner-video-' + catIndex + '-' + vidIndex"
                              [(ngModel)]="video.owner"
                              [value]="'neopro'"
                              (ngModelChange)="onConfigChange(); video.locked = true"
                            />
                            <span class="ownership-label neopro small">NEOPRO</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          [value]="video.name"
                          (input)="updateVideo(catIndex, null, vidIndex, 'name', $any($event.target).value)"
                          placeholder="Nom de la vidéo"
                          class="video-name-input"
                        />
                        <input
                          type="text"
                          [value]="video.path"
                          (input)="updateVideo(catIndex, null, vidIndex, 'path', $any($event.target).value)"
                          placeholder="videos/CATEGORIE/fichier.mp4"
                          class="video-path-input"
                        />
                        <button class="btn-remove-small" (click)="removeVideo(catIndex, null, vidIndex)">×</button>
                      </div>
                    </div>
                    <p class="empty-message-small" *ngIf="!category.videos?.length">
                      Aucune vidéo dans cette catégorie
                    </p>
                  </div>

                  <!-- Sous-catégories -->
                  <div class="subcategories-section">
                    <div class="section-subheader">
                      <span>Sous-catégories</span>
                      <button class="btn-add-small" (click)="addSubcategory(catIndex)">+ Ajouter</button>
                    </div>
                    <div class="subcategories-list" *ngIf="category.subCategories && category.subCategories.length > 0">
                      <div class="subcategory-card" *ngFor="let subcat of category.subCategories; let subIndex = index">
                        <div class="subcategory-header">
                          <input
                            type="text"
                            [(ngModel)]="subcat.name"
                            (ngModelChange)="onConfigChange()"
                            placeholder="Nom de la sous-catégorie"
                            class="subcategory-name-input"
                          />
                          <div class="ownership-controls inline">
                            <label class="ownership-option">
                              <input
                                type="radio"
                                [name]="'owner-subcat-' + catIndex + '-' + subIndex"
                                [(ngModel)]="subcat.owner"
                                [value]="'club'"
                                (ngModelChange)="onConfigChange(); subcat.locked = false"
                              />
                              <span class="ownership-label club small">Club</span>
                            </label>
                            <label class="ownership-option">
                              <input
                                type="radio"
                                [name]="'owner-subcat-' + catIndex + '-' + subIndex"
                                [(ngModel)]="subcat.owner"
                                [value]="'neopro'"
                                (ngModelChange)="onConfigChange(); subcat.locked = true"
                              />
                              <span class="ownership-label neopro small">NEOPRO</span>
                            </label>
                          </div>
                          <span class="subcategory-stats">{{ subcat.videos.length || 0 }} vidéo(s)</span>
                          <button class="btn-add-small" (click)="addVideo(catIndex, subIndex)">+ Vidéo</button>
                          <button class="btn-remove-small" (click)="removeSubcategory(catIndex, subIndex)">×</button>
                        </div>
                        <div class="videos-list" *ngIf="subcat.videos && subcat.videos.length > 0">
                          <div class="video-item-editable" *ngFor="let video of subcat.videos; let vidIndex = index">
                            <span class="video-icon">🎬</span>
                            <input
                              type="text"
                              [value]="video.name"
                              (input)="updateVideo(catIndex, subIndex, vidIndex, 'name', $any($event.target).value)"
                              placeholder="Nom de la vidéo"
                              class="video-name-input"
                            />
                            <input
                              type="text"
                              [value]="video.path"
                              (input)="updateVideo(catIndex, subIndex, vidIndex, 'path', $any($event.target).value)"
                              placeholder="videos/CATEGORIE/fichier.mp4"
                              class="video-path-input"
                            />
                            <button class="btn-remove-small" (click)="removeVideo(catIndex, subIndex, vidIndex)">×</button>
                          </div>
                        </div>
                        <p class="empty-message-small" *ngIf="!subcat.videos?.length">
                          Aucune vidéo
                        </p>
                      </div>
                    </div>
                    <p class="empty-message-small" *ngIf="!category.subCategories?.length">
                      Aucune sous-catégorie
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p class="empty-message" *ngIf="config.categories.length === 0">
              Aucune catégorie configurée
            </p>
          </div>

          <!-- Section Organisation Télécommande (TimeCategories) -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📱</span>
              Organisation Télécommande
              <span class="section-hint">(Assigner les catégories aux blocs Avant-match / Match / Après-match)</span>
            </h4>
            <div class="time-categories-grid" *ngIf="config.timeCategories?.length">
              <div class="time-category-card" *ngFor="let timeCategory of config.timeCategories; let tcIndex = index">
                <div class="time-category-header" [style.background]="'linear-gradient(135deg, var(--tc-color-start), var(--tc-color-end))'">
                  <span class="tc-icon">{{ timeCategory.icon }}</span>
                  <span class="tc-name">{{ timeCategory.name }}</span>
                  <span class="tc-count">{{ getCategoriesInTimeCategory(tcIndex).length }} cat.</span>
                </div>
                <div class="time-category-content">
                  <p class="tc-description">{{ timeCategory.description }}</p>
                  <div class="tc-categories-list">
                    <label
                      class="tc-category-checkbox"
                      *ngFor="let category of config.categories"
                    >
                      <input
                        type="checkbox"
                        [checked]="isCategoryInTimeCategory(tcIndex, category.id)"
                        (change)="toggleCategoryInTimeCategory(tcIndex, category.id)"
                      />
                      <span class="checkbox-label">{{ category.name || '(Sans nom)' }}</span>
                    </label>
                  </div>
                  <p class="empty-message-small" *ngIf="config.categories.length === 0">
                    Créez d'abord des catégories
                  </p>
                </div>
              </div>
            </div>
            <div class="unassigned-warning" *ngIf="getUnassignedCategories().length > 0">
              <span class="warning-icon">⚠️</span>
              <span>Catégories non assignées : {{ getUnassignedCategoriesNames() }}</span>
            </div>
          </div>

          <!-- Section Mapping Analytics -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📊</span>
              Catégories Analytics
              <span class="section-hint">(Associer les catégories de vidéos aux types analytics pour les statistiques)</span>
            </h4>
            <div *ngIf="loadingAnalyticsCategories" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Chargement des catégories...</span>
            </div>
            <div class="analytics-mappings-grid" *ngIf="!loadingAnalyticsCategories && config.categories.length > 0">
              <div class="mapping-row" *ngFor="let category of getAllVideoCategories()">
                <span class="mapping-category-name">{{ category.name || '(Sans nom)' }}</span>
                <select
                  [ngModel]="getCategoryMapping(category.id)"
                  (ngModelChange)="setCategoryMapping(category.id, $event)"
                  class="mapping-select"
                >
                  <option value="">-- Non défini (other) --</option>
                  <option *ngFor="let ac of analyticsCategories" [value]="ac.id">
                    {{ ac.name }}
                  </option>
                </select>
                <span
                  class="mapping-color-dot"
                  *ngIf="getCategoryMapping(category.id)"
                  [style.background]="getAnalyticsCategoryColor(getCategoryMapping(category.id))"
                ></span>
              </div>
            </div>
            <p class="empty-message" *ngIf="!loadingAnalyticsCategories && config.categories.length === 0">
              Créez d'abord des catégories de vidéos
            </p>
          </div>
        </div>
      </div>

      <!-- JSON Tab -->
      <div *ngIf="activeTab === 'json'" class="tab-content">
        <div class="json-editor">
          <div class="json-toolbar">
            <button class="btn btn-secondary btn-sm" (click)="formatJsonInput()">Formater</button>
            <button class="btn btn-secondary btn-sm" (click)="validateJson()">Valider</button>
          </div>
          <textarea
            class="json-textarea"
            [(ngModel)]="jsonString"
            (ngModelChange)="onJsonChange()"
            [placeholder]="jsonPlaceholder"
            rows="25"
          ></textarea>
          <div *ngIf="jsonError" class="json-error">{{ jsonError }}</div>
        </div>
      </div>

      <!-- History Tab -->
      <div *ngIf="activeTab === 'history'" class="tab-content">
        <div class="history-container">
          <div *ngIf="loadingHistory" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Chargement de l'historique...</span>
          </div>
          <div *ngIf="!loadingHistory && history.length === 0" class="empty-history">
            <p>Aucun historique disponible</p>
            <p class="hint">L'historique sera créé lors du premier déploiement</p>
          </div>
          <div *ngIf="!loadingHistory && history.length > 0" class="history-list">
            <div
              class="history-item"
              *ngFor="let item of history"
              [class.selected]="selectedHistoryId === item.id"
            >
              <div class="history-item-header">
                <span class="history-date">{{ item.deployed_at | date:'dd/MM/yyyy HH:mm' }}</span>
                <span class="history-user">{{ item.deployed_by_email || 'Système' }}</span>
              </div>
              <div class="history-item-comment" *ngIf="item.comment">
                {{ item.comment }}
              </div>
              <div class="history-item-changes" *ngIf="item.changes_summary?.length">
                {{ item.changes_summary!.length }} modification(s)
              </div>
              <div class="history-item-actions">
                <button class="btn btn-secondary btn-sm" (click)="viewHistoryVersion(item)">
                  Voir
                </button>
                <button class="btn btn-primary btn-sm" (click)="restoreVersion(item)">
                  Restaurer
                </button>
              </div>
            </div>
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
            <div class="mode-section">
              <div class="mode-header">
                <span class="mode-title">Mode de déploiement</span>
                <span class="mode-subtitle">Fusionner pour préserver le contenu club, ou remplacer pour imposer la config centrale.</span>
              </div>
              <div class="mode-options">
                <label class="mode-card" [class.active]="deployMode === 'replace'">
                  <input type="radio" name="deployMode" value="replace" [(ngModel)]="deployMode" />
                  <div class="mode-card-content">
                    <div class="mode-card-title">Remplacer</div>
                    <div class="mode-card-desc">Écrase totalement la configuration du boîtier par celle du central.</div>
                  </div>
                </label>
                <label class="mode-card" [class.active]="deployMode === 'merge'">
                  <input type="radio" name="deployMode" value="merge" [(ngModel)]="deployMode" />
                  <div class="mode-card-content">
                    <div class="mode-card-title">Fusionner</div>
                    <div class="mode-card-desc">Préserve le contenu club existant et applique uniquement les éléments NEOPRO.</div>
                  </div>
                </label>
              </div>
            </div>

            <div *ngIf="diffLoading" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Calcul des différences...</span>
            </div>
            <div *ngIf="!diffLoading && diffItems.length === 0" class="no-changes">
              Aucun changement détecté
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
                  <span *ngIf="ownershipLabel(diff.newValue || diff.oldValue)" class="ownership-badge"
                        [class.neopro]="ownershipLabel(diff.newValue || diff.oldValue) === 'neopro'"
                        [class.club]="ownershipLabel(diff.newValue || diff.oldValue) === 'club'">
                    {{ ownershipLabel(diff.newValue || diff.oldValue) === 'neopro' ? 'NEOPRO' : 'Club' }}
                  </span>
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

      <!-- Footer Actions -->
      <div class="editor-footer">
        <div class="footer-left">
          <button class="btn btn-secondary" (click)="reloadConfig()" [disabled]="loading">
            Recharger depuis le site
          </button>
        </div>
        <div class="footer-right">
          <span class="status-indicator" *ngIf="hasChanges">
            <span class="status-dot warning"></span>
            Modifications non déployées
          </span>
          <span class="status-indicator" *ngIf="!hasChanges && !(validationResult?.errors?.length)">
            <span class="status-dot success"></span>
            Configuration synchronisée
          </span>
          <button
            class="btn btn-primary"
            (click)="previewAndDeploy()"
            [disabled]="!isValid || deploying"
          >
            {{ deploying ? 'Déploiement...' : 'Déployer la configuration' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .config-editor-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .loading-banner {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      align-self: flex-start;
      padding: 0.5rem 0.75rem;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.875rem;
    }

    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid #e2e8f0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .tab:hover {
      color: #2563eb;
    }

    .tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .tab-content {
      padding: 1rem 0;
    }
    
    .debug-info {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      gap: 1rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .spinner-small {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .form-sections {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .form-section {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1.25rem;
      border: 1px solid #e2e8f0;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #0f172a;
    }

    .section-icon {
      font-size: 1.25rem;
    }

    .btn-add {
      margin-left: auto;
      padding: 0.25rem 0.75rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .btn-add:hover {
      background: #1d4ed8;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .form-group.full-width {
      grid-column: 1 / -1;
    }

    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
    }

    .form-group input,
    .form-group select {
      padding: 0.625rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      transition: border-color 0.2s;
    }

    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group input.error {
      border-color: #ef4444;
    }

    .field-error {
      font-size: 0.75rem;
      color: #ef4444;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .item-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.75rem;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .item-name {
      font-weight: 500;
      color: #0f172a;
    }

    .btn-remove {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fee2e2;
      color: #ef4444;
      border: none;
      border-radius: 4px;
      font-size: 1.25rem;
      cursor: pointer;
    }

    .btn-remove:hover {
      background: #fecaca;
    }

    .item-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .item-form input {
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .empty-message {
      color: #94a3b8;
      text-align: center;
      padding: 1rem;
      font-style: italic;
    }

    /* Categories */
    .categories-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .category-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .category-card.expanded {
      border-color: #2563eb;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      cursor: pointer;
      transition: background 0.2s;
    }

    .category-header:hover {
      background: #f1f5f9;
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #64748b;
      width: 16px;
    }

    .category-name-input {
      flex: 1;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .category-name-input:focus {
      outline: none;
      border-color: #2563eb;
    }

    .category-stats {
      font-size: 0.75rem;
      color: #64748b;
      white-space: nowrap;
    }

    .category-content {
      padding: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .videos-section, .subcategories-section {
      margin-bottom: 1rem;
    }

    .videos-section:last-child, .subcategories-section:last-child {
      margin-bottom: 0;
    }

    .section-subheader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #475569;
    }

    .btn-add-small {
      padding: 0.25rem 0.5rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .btn-add-small:hover {
      background: #1d4ed8;
    }

    .videos-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .video-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .video-icon {
      font-size: 1rem;
    }

    .video-title {
      font-weight: 500;
      color: #0f172a;
    }

    .video-filename {
      color: #64748b;
      font-size: 0.75rem;
      margin-left: auto;
      font-family: monospace;
    }

    .btn-remove-small {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fee2e2;
      color: #ef4444;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      flex-shrink: 0;
    }

    .btn-remove-small:hover {
      background: #fecaca;
    }

    .subcategories-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .subcategory-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.75rem;
    }

    .subcategory-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .subcategory-name-input {
      flex: 1;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .subcategory-name-input:focus {
      outline: none;
      border-color: #2563eb;
    }

    .subcategory-stats {
      font-size: 0.75rem;
      color: #64748b;
    }

    .empty-message-small {
      color: #94a3b8;
      font-size: 0.75rem;
      font-style: italic;
      padding: 0.5rem;
      text-align: center;
    }

    /* Video editable items */
    .video-item-editable {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 0.8125rem;
      border: 1px solid #e2e8f0;
    }

    .video-name-input {
      flex: 1;
      min-width: 120px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .video-path-input {
      flex: 2;
      min-width: 200px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      color: #64748b;
    }

    .video-name-input:focus,
    .video-path-input:focus {
      outline: none;
      border-color: #2563eb;
    }

    /* TimeCategories section */
    .section-hint {
      font-size: 0.75rem;
      font-weight: normal;
      color: #64748b;
      margin-left: 0.5rem;
    }

    .time-categories-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    @media (max-width: 900px) {
      .time-categories-grid {
        grid-template-columns: 1fr;
      }
    }

    .time-category-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      background: white;
    }

    .time-category-header {
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: white;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
    }

    .time-category-card:nth-child(1) .time-category-header {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    }

    .time-category-card:nth-child(2) .time-category-header {
      background: linear-gradient(135deg, #22c55e, #16a34a);
    }

    .time-category-card:nth-child(3) .time-category-header {
      background: linear-gradient(135deg, #a855f7, #9333ea);
    }

    .tc-icon {
      font-size: 1.25rem;
    }

    .tc-name {
      font-weight: 600;
      flex: 1;
    }

    .tc-count {
      font-size: 0.75rem;
      background: rgba(255,255,255,0.2);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .time-category-content {
      padding: 1rem;
    }

    .tc-description {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 0.75rem 0;
    }

    .tc-categories-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tc-category-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .tc-category-checkbox:hover {
      background: #f1f5f9;
    }

    .tc-category-checkbox input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .tc-category-checkbox .checkbox-label {
      font-size: 0.875rem;
      color: #0f172a;
    }

    .unassigned-warning {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #92400e;
    }

    .warning-icon {
      font-size: 1rem;
    }

    /* JSON Editor */
    .json-editor {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .json-toolbar {
      display: flex;
      gap: 0.5rem;
    }

    .json-textarea {
      width: 100%;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      resize: vertical;
      min-height: 400px;
    }

    .json-textarea:focus {
      outline: none;
      border-color: #2563eb;
      background: white;
    }

    .json-error {
      padding: 0.75rem;
      background: #fef2f2;
      border: 1px solid #ef4444;
      border-radius: 6px;
      color: #b91c1c;
      font-size: 0.875rem;
    }

    /* History */
    .history-container {
      min-height: 300px;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
    }

    .empty-history {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .empty-history .hint {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-top: 0.5rem;
    }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .history-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      transition: all 0.2s;
    }

    .history-item:hover {
      border-color: #2563eb;
    }

    .history-item.selected {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .history-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .history-date {
      font-weight: 600;
      color: #0f172a;
    }

    .history-user {
      font-size: 0.875rem;
      color: #64748b;
    }

    .history-item-comment {
      font-size: 0.875rem;
      color: #475569;
      margin-bottom: 0.5rem;
      font-style: italic;
    }

    .history-item-changes {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.75rem;
    }

    .history-item-actions {
      display: flex;
      gap: 0.5rem;
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

    .mode-section {
      margin-bottom: 1.25rem;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1rem;
      background: #f8fafc;
    }

    .mode-header {
      margin-bottom: 0.75rem;
    }

    .mode-title {
      display: block;
      font-weight: 600;
      color: #0f172a;
    }

    .mode-subtitle {
      display: block;
      color: #475569;
      font-size: 0.9rem;
      margin-top: 0.1rem;
    }

    .mode-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
    }

    .mode-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.85rem;
      display: flex;
      gap: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      background: #fff;
      align-items: flex-start;
    }

    .mode-card input {
      margin-top: 4px;
    }

    .mode-card.active {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    .mode-card-title {
      font-weight: 600;
      color: #0f172a;
    }

    .mode-card-desc {
      color: #475569;
      font-size: 0.9rem;
      line-height: 1.3;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .no-changes {
      text-align: center;
      padding: 2rem;
      color: #64748b;
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
      gap: 0.5rem;
      align-items: flex-start;
    }

    .diff-label {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 50px;
    }

    .diff-values code {
      padding: 0;
      background: none;
    }

    .diff-json {
      background: #0f172a;
      color: #e2e8f0;
      padding: 0.75rem;
      border-radius: 8px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.85rem;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0.35rem 0 0;
      max-height: 260px;
      overflow: auto;
    }

    .ownership-badge {
      padding: 0.25rem 0.6rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      border: 1px solid transparent;
    }

    .ownership-badge.neopro {
      background: #e0f2fe;
      color: #075985;
      border-color: #7dd3fc;
    }

    .ownership-badge.club {
      background: #ecfdf3;
      color: #166534;
      border-color: #bbf7d0;
    }

    .ownership-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-left: 0.5rem;
    }

    .ownership-controls.inline {
      margin-left: 0;
    }

    .ownership-option {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.85rem;
      color: #475569;
    }

    .ownership-label {
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      border: 1px solid transparent;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .ownership-label.neopro {
      background: #e0f2fe;
      color: #075985;
      border-color: #7dd3fc;
    }

    .ownership-label.club {
      background: #ecfdf3;
      color: #166534;
      border-color: #bbf7d0;
    }

    .ownership-label.small {
      font-size: 0.75rem;
    }

    /* Footer */
    .editor-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      margin-top: 1rem;
    }

    .footer-left, .footer-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-dot.success {
      background: #10b981;
    }

    .status-dot.warning {
      background: #f59e0b;
    }

    /* Buttons */
    .btn {
      padding: 0.625rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      font-size: 0.875rem;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #cbd5e1;
    }

    /* Analytics Mappings */
    .analytics-mappings-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .mapping-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    .mapping-category-name {
      flex: 1;
      font-weight: 500;
      color: #0f172a;
      min-width: 150px;
    }

    .mapping-select {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.875rem;
      background: white;
      cursor: pointer;
    }

    .mapping-select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .mapping-color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `]
})
export class ConfigEditorComponent implements OnInit, OnDestroy, DoCheck {
  @Input() siteId!: string;
  @Input() siteName!: string;
  @Output() configDeployed = new EventEmitter<void>();

  activeTab: 'form' | 'json' | 'history' = 'form';
  // Use signal for loading state to ensure Angular detects changes
  readonly isLoading = signal(false);
  // Keep loading as getter/setter for compatibility
  get loading(): boolean {
    return this.isLoading();
  }
  set loading(value: boolean) {
    console.log('[ConfigEditor] loading setter called:', value);
    this.isLoading.set(value);
  }
  deploying = false;
  hasChanges = false;
  isValid = true;

  config: SiteConfiguration = this.getEmptyConfig();
  originalConfig: SiteConfiguration | null = null;
  jsonString = '';
  jsonError = '';
  jsonPlaceholder = JSON.stringify(DEFAULT_CONFIG, null, 2);

  // Validation
  validationResult: ConfigValidationResult | null = null;
  validationErrors: Map<string, string> = new Map();

  // History
  history: ConfigHistory[] = [];
  historyCount = 0;
  loadingHistory = false;
  selectedHistoryId: string | null = null;

  // Diff
  showDiffModal = false;
  diffLoading = false;
  diffItems: ConfigDiff[] = [];
  deployMode: 'replace' | 'merge' = 'replace';

  // Categories UI
  expandedCategory: number | null = null;

  // Analytics Categories
  analyticsCategories: AnalyticsCategory[] = [];
  loadingAnalyticsCategories = false;

  // Polling
  private configCommandId: string | null = null;
  private configPollSubscription?: Subscription;
  private lastCategoriesLength = 0;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private analyticsService: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.reloadConfig();
    this.loadHistoryCount();
    // Temporarily disabled to debug spinner issue
    // this.loadAnalyticsCategories();
  }

  ngOnDestroy(): void {
    this.configPollSubscription?.unsubscribe();
  }

  ngDoCheck(): void {
    const currentLength = this.config.categories?.length ?? 0;
    if (currentLength !== this.lastCategoriesLength) {
      console.warn('[ConfigEditor] categories length changed', {
        previous: this.lastCategoriesLength,
        current: currentLength,
        stack: new Error().stack?.split('\n').slice(0, 4).join(' | ')
      });
      this.lastCategoriesLength = currentLength;
    }
  }

  get diffCounts() {
    return this.diffItems.reduce(
      (acc, item) => {
        if (item.type === 'added') acc.added += 1;
        if (item.type === 'removed') acc.removed += 1;
        if (item.type === 'changed') acc.changed += 1;
        return acc;
      },
      { added: 0, removed: 0, changed: 0 } as { added: number; removed: number; changed: number }
    );
  }

  private getEmptyConfig(): SiteConfiguration {
    return {
      version: '1.0',
      remote: { title: '' },
      auth: { password: '', clubName: '', sessionDuration: 28800000 },
      sync: { enabled: true, serverUrl: 'https://neopro-central.onrender.com', siteName: '', clubName: '' },
      sponsors: [],
      categories: [],
      timeCategories: [
        { id: 'before', name: 'Avant-match', icon: '🏁', color: 'from-blue-500 to-blue-600', description: 'Échauffement & présentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '▶️', color: 'from-green-500 to-green-600', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Après-match', icon: '🏆', color: 'from-purple-500 to-purple-600', description: 'Résultats & remerciements', categoryIds: [] },
      ],
    };
  }

  private resetToEmptyConfig(reason: string): void {
    const stack = new Error().stack?.split('\n').slice(0, 5).join(' | ');
    console.warn('[ConfigEditor] resetToEmptyConfig() called', { reason, stack });
    this.loading = false;
    this.config = this.getEmptyConfig();
    this.originalConfig = null;
    this.configCommandId = null;
    this.syncJsonFromConfig();
    this.hasChanges = false;
  }

  reloadConfig(): void {
    console.log('[ConfigEditor] reloadConfig() called, siteId:', this.siteId);
    this.loading = true;
    this.configPollSubscription?.unsubscribe();

    // Timeout global de 10 secondes pour la requête initiale
    const timeoutId = setTimeout(() => {
      if (this.loading && !this.configCommandId) {
        this.resetToEmptyConfig('Initial timeout reached without commandId');
        this.notificationService.warning('Le serveur ne répond pas. Vous pouvez créer une nouvelle configuration.');
      }
    }, 10000);

    console.log('[ConfigEditor] Calling getConfiguration...');
    this.sitesService.getConfiguration(this.siteId).subscribe({
      next: (response) => {
        console.log('[ConfigEditor] getConfiguration response:', response);
        clearTimeout(timeoutId);
        if (response.commandId) {
          this.configCommandId = response.commandId;
          console.log('[ConfigEditor] Starting poll with commandId:', response.commandId);
          this.pollConfigResult();
        } else {
          console.log('[ConfigEditor] No commandId in response');
          this.resetToEmptyConfig('getConfiguration returned no commandId');
          this.notificationService.info('Aucun commandId reçu. Vous pouvez créer une nouvelle configuration.');
        }
      },
      error: (error) => {
        console.error('[ConfigEditor] getConfiguration error:', error);
        clearTimeout(timeoutId);
        this.resetToEmptyConfig('getConfiguration error');
        this.notificationService.warning('Erreur de connexion. Vous pouvez créer une nouvelle configuration.');
      }
    });
  }

  private pollConfigResult(): void {
    if (!this.configCommandId) {
      console.log('[ConfigEditor] pollConfigResult: no commandId, aborting');
      return;
    }

    const POLL_TIMEOUT_SECONDS = 30;
    let pollCount = 0;
    let isPolling = false; // Éviter les appels parallèles

    console.log('[ConfigEditor] Starting polling interval...');
    this.configPollSubscription = interval(1000).subscribe(() => {
      pollCount++;
      console.log('[ConfigEditor] Poll tick #', pollCount, 'isPolling:', isPolling);

      // Timeout après 30 secondes
      if (pollCount > POLL_TIMEOUT_SECONDS) {
        this.configPollSubscription?.unsubscribe();
        this.resetToEmptyConfig('Poll timeout reached (no completed status)');
        this.notificationService.warning('Le site ne répond pas. Vous pouvez créer une nouvelle configuration.');
        return;
      }

      // Éviter les appels parallèles si le précédent n'est pas terminé
      if (isPolling) {
        console.log('[ConfigEditor] Skipping poll - previous request still pending');
        return;
      }
      isPolling = true;

      console.log('[ConfigEditor] Calling getCommandStatus for:', this.configCommandId);
      this.sitesService.getCommandStatus(this.siteId, this.configCommandId!).subscribe({
        next: (status) => {
          console.log('[ConfigEditor] getCommandStatus response:', JSON.stringify(status).substring(0, 500));
          isPolling = false;
          if (status.status === 'completed') {
            console.log('[ConfigEditor] Status is completed, result:', status.result ? 'present' : 'missing');
            console.log('[ConfigEditor] result.configuration:', status.result?.configuration ? 'present' : 'missing');
            this.configPollSubscription?.unsubscribe();

            this.loading = false;

            if (status.result?.configuration) {
              this.setConfig(status.result.configuration);
              this.notificationService.success('Configuration chargée');
            } else if (status.result?.message === 'No configuration file found') {
              this.resetToEmptyConfig('Command completed but configuration missing (No configuration file found)');
              this.notificationService.info('Aucune configuration sur le site. Créez-en une nouvelle.');
            } else {
              this.resetToEmptyConfig('Command completed but configuration empty');
              this.notificationService.info('Configuration vide. Vous pouvez en créer une nouvelle.');
            }
          } else if (status.status === 'failed') {
            this.configPollSubscription?.unsubscribe();
            this.resetToEmptyConfig('Command status failed');
            this.notificationService.warning('Échec de récupération. Vous pouvez créer une nouvelle configuration.');
          } else {
            console.log('[ConfigEditor] Status is:', status.status, '- continuing poll');
          }
          // Si status === 'pending', on continue le polling
        },
        error: (error) => {
          console.error('[ConfigEditor] getCommandStatus error:', error);
          isPolling = false;
          // Ne pas arrêter le polling sur une erreur réseau ponctuelle
          // Le timeout global s'en chargera
        }
      });
    });
  }

  private setConfig(configuration: SiteConfiguration): void {
    try {
      console.log('[ConfigEditor] setConfig() START');
      console.log(
        '[ConfigEditor] Raw categories:',
        (configuration.categories || []).map(cat => ({
          name: cat.name,
          videos: cat.videos?.length || 0,
          subCategories: (cat.subCategories || []).map(sub => ({
            name: sub.name,
            videos: sub.videos?.length || 0,
          })),
        }))
      );
      // Normalize categories to ensure videos and subCategories arrays exist
      const normalizedCategories = (configuration.categories || []).map(cat => ({
        ...cat,
        videos: cat.videos || [],
        subCategories: (cat.subCategories || []).map(subcat => ({
          ...subcat,
          videos: subcat.videos || [],
        })),
      }));
      console.log('[ConfigEditor] normalizedCategories:', normalizedCategories.length);
      console.log(
        '[ConfigEditor] normalized categories detail:',
        normalizedCategories.map(cat => ({
          name: cat.name,
          videos: cat.videos.length,
          subCategories: cat.subCategories.map(sub => ({
            name: sub.name,
            videos: sub.videos.length,
          })),
        }))
      );

      // Normalize timeCategories - use config values or defaults
      const defaultTimeCategories = this.getEmptyConfig().timeCategories!;
      const normalizedTimeCategories = configuration.timeCategories?.length
        ? configuration.timeCategories.map(tc => ({
            ...tc,
            categoryIds: tc.categoryIds || [],
          }))
        : defaultTimeCategories;
      console.log('[ConfigEditor] normalizedTimeCategories:', normalizedTimeCategories.length);

      this.config = {
        ...this.getEmptyConfig(),
        ...configuration,
        remote: { ...this.getEmptyConfig().remote, ...configuration.remote },
        auth: { ...this.getEmptyConfig().auth, ...configuration.auth },
        sync: { ...this.getEmptyConfig().sync, ...configuration.sync },
        sponsors: configuration.sponsors || [],
        categories: normalizedCategories,
        timeCategories: normalizedTimeCategories,
      };
      console.log('[ConfigEditor] this.config set');
      console.log(
        '[ConfigEditor] Final config categories:',
        this.config.categories.map(cat => ({
          name: cat.name,
          videos: cat.videos.length,
          subCategories: cat.subCategories.map(sub => ({
            name: sub.name,
            videos: sub.videos.length,
          })),
        }))
      );
      this.originalConfig = JSON.parse(JSON.stringify(this.config));
      console.log('[ConfigEditor] originalConfig set');
      this.syncJsonFromConfig();
      console.log('[ConfigEditor] syncJsonFromConfig done');
      this.hasChanges = false;
      this.validate();
      console.log('[ConfigEditor] setConfig() COMPLETE - loading should be false now:', this.loading);
    } catch (error) {
      console.error('[ConfigEditor] setConfig() ERROR:', error);
    }
  }

  private syncJsonFromConfig(): void {
    this.jsonString = JSON.stringify(this.config, null, 2);
    this.jsonError = '';
  }

  onConfigChange(): void {
    console.trace('[ConfigEditor] onConfigChange() trace');
    console.log(
      '[ConfigEditor] onConfigChange()',
      {
        categories: this.config.categories.map(cat => ({
          name: cat.name,
          videos: cat.videos?.length || 0,
          subCategories: cat.subCategories?.map(sub => ({
            name: sub.name,
            videos: sub.videos?.length || 0,
          })) || [],
        })),
        hasChangesBeforeUpdate: this.hasChanges,
      }
    );
    this.syncJsonFromConfig();
    this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
    console.log('[ConfigEditor] onConfigChange() after sync', {
      hasChanges: this.hasChanges,
      categoriesCount: this.config.categories.length,
    });
    this.validate();
  }

  onJsonChange(): void {
    try {
      const parsed = JSON.parse(this.jsonString);
      // Normalize categories to ensure videos and subCategories arrays exist
      const normalizedCategories = (parsed.categories || []).map((cat: any) => ({
        ...cat,
        videos: cat.videos || [],
        subCategories: (cat.subCategories || []).map((subcat: any) => ({
          ...subcat,
          videos: subcat.videos || [],
        })),
      }));

      this.config = {
        ...this.getEmptyConfig(),
        ...parsed,
        remote: { ...this.getEmptyConfig().remote, ...parsed.remote },
        auth: { ...this.getEmptyConfig().auth, ...parsed.auth },
        sync: { ...this.getEmptyConfig().sync, ...parsed.sync },
        sponsors: parsed.sponsors || [],
        categories: normalizedCategories,
      };
      this.jsonError = '';
      this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
      this.validate();
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
      this.isValid = false;
    }
  }

  formatJsonInput(): void {
    try {
      const parsed = JSON.parse(this.jsonString);
      this.jsonString = JSON.stringify(parsed, null, 2);
      this.jsonError = '';
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
    }
  }

  validateJson(): void {
    try {
      JSON.parse(this.jsonString);
      this.validate();
      if (this.isValid) {
        this.notificationService.success('Configuration valide');
      }
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
      this.notificationService.error('JSON invalide');
    }
  }

  private validate(): void {
    this.validationErrors.clear();
    const errors: ConfigValidationError[] = [];

    // Validation des champs requis
    if (!this.config.auth?.clubName?.trim()) {
      errors.push({ field: 'auth.clubName', message: 'Le nom du club est requis' });
      this.validationErrors.set('auth.clubName', 'Le nom du club est requis');
    }

    // Validation URL serveur si sync activé
    if (this.config.sync?.enabled && this.config.sync.serverUrl) {
      try {
        new URL(this.config.sync.serverUrl);
      } catch {
        errors.push({ field: 'sync.serverUrl', message: 'URL du serveur invalide' });
        this.validationErrors.set('sync.serverUrl', 'URL invalide');
      }
    }

    this.validationResult = {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };

    this.isValid = errors.length === 0;
  }

  hasError(field: string): boolean {
    return this.validationErrors.has(field);
  }

  getError(field: string): string {
    return this.validationErrors.get(field) || '';
  }

  // Sponsors
  addSponsor(): void {
    this.config.sponsors.push({ name: '', path: '', type: 'video/mp4' });
    this.onConfigChange();
  }

  removeSponsor(index: number): void {
    this.config.sponsors.splice(index, 1);
    this.onConfigChange();
  }

  // Categories
  addCategory(): void {
    this.config.categories.push({
      id: `category-${Date.now()}`,
      name: '',
      videos: [],
      subCategories: [],
    });
    this.onConfigChange();
  }

  removeCategory(index: number): void {
    this.config.categories.splice(index, 1);
    if (this.expandedCategory === index) {
      this.expandedCategory = null;
    } else if (this.expandedCategory !== null && this.expandedCategory > index) {
      this.expandedCategory--;
    }
    this.onConfigChange();
  }

  toggleCategory(index: number): void {
    this.expandedCategory = this.expandedCategory === index ? null : index;
  }

  addSubcategory(catIndex: number): void {
    const category = this.config.categories[catIndex];
    if (!category.subCategories) {
      category.subCategories = [];
    }
    category.subCategories.push({
      id: `subcategory-${Date.now()}`,
      name: '',
      videos: [],
    });
    this.onConfigChange();
  }

  removeSubcategory(catIndex: number, subIndex: number): void {
    const category = this.config.categories[catIndex];
    if (category.subCategories) {
      category.subCategories.splice(subIndex, 1);
      this.onConfigChange();
    }
  }

  removeVideo(catIndex: number, subIndex: number | null, vidIndex: number): void {
    const category = this.config.categories[catIndex];
    if (subIndex === null) {
      // Remove from category's direct videos
      if (category.videos) {
        category.videos.splice(vidIndex, 1);
      }
    } else {
      // Remove from subcategory
      if (category.subCategories && category.subCategories[subIndex]?.videos) {
        category.subCategories[subIndex].videos.splice(vidIndex, 1);
      }
    }
    this.onConfigChange();
  }

  // Videos CRUD
  addVideo(catIndex: number, subIndex: number | null): void {
    const newVideo: VideoConfig = {
      name: '',
      path: '',
      type: 'video/mp4',
    };

    const category = this.config.categories[catIndex];
    if (subIndex === null) {
      if (!category.videos) {
        category.videos = [];
      }
      category.videos.push(newVideo);
    } else {
      if (category.subCategories && category.subCategories[subIndex]) {
        if (!category.subCategories[subIndex].videos) {
          category.subCategories[subIndex].videos = [];
        }
        category.subCategories[subIndex].videos.push(newVideo);
      }
    }
    this.onConfigChange();
  }

  updateVideo(catIndex: number, subIndex: number | null, vidIndex: number, field: 'name' | 'path', value: string): void {
    const category = this.config.categories[catIndex];
    let video: VideoConfig | undefined;

    if (subIndex === null) {
      video = category.videos?.[vidIndex];
    } else {
      video = category.subCategories?.[subIndex]?.videos?.[vidIndex];
    }

    if (video) {
      video[field] = value;
      this.onConfigChange();
    }
  }

  // TimeCategories management
  toggleCategoryInTimeCategory(timeCatIndex: number, categoryId: string): void {
    const timeCategory = this.config.timeCategories?.[timeCatIndex];
    if (!timeCategory) return;

    const index = timeCategory.categoryIds.indexOf(categoryId);
    if (index === -1) {
      timeCategory.categoryIds.push(categoryId);
    } else {
      timeCategory.categoryIds.splice(index, 1);
    }
    this.onConfigChange();
  }

  isCategoryInTimeCategory(timeCatIndex: number, categoryId: string): boolean {
    return this.config.timeCategories?.[timeCatIndex]?.categoryIds.includes(categoryId) || false;
  }

  getCategoriesInTimeCategory(timeCatIndex: number): CategoryConfig[] {
    const categoryIds = this.config.timeCategories?.[timeCatIndex]?.categoryIds || [];
    return this.config.categories.filter(cat => categoryIds.includes(cat.id));
  }

  getUnassignedCategories(): CategoryConfig[] {
    const allAssignedIds = new Set<string>();
    this.config.timeCategories?.forEach(tc => {
      tc.categoryIds.forEach(id => allAssignedIds.add(id));
    });
    return this.config.categories.filter(cat => !allAssignedIds.has(cat.id));
  }

  getUnassignedCategoriesNames(): string {
    return this.getUnassignedCategories()
      .map(c => c.name || '(Sans nom)')
      .join(', ');
  }

  // History
  loadHistoryCount(): void {
    this.sitesService.getConfigHistory(this.siteId, 1, 0).subscribe({
      next: (response) => {
        this.historyCount = response.total;
      },
      error: () => {
        this.historyCount = 0;
      }
    });
  }

  loadHistory(): void {
    this.loadingHistory = true;
    this.sitesService.getConfigHistory(this.siteId, 20, 0).subscribe({
      next: (response) => {
        this.history = response.history;
        this.historyCount = response.total;
        this.loadingHistory = false;
      },
      error: (error) => {
        this.loadingHistory = false;
        this.notificationService.error('Erreur lors du chargement de l\'historique');
      }
    });
  }

  viewHistoryVersion(item: ConfigHistory): void {
    this.selectedHistoryId = item.id;
    this.setConfig(item.configuration);
    this.activeTab = 'form';
    this.hasChanges = true; // Car différent de la config actuelle du site
  }

  restoreVersion(item: ConfigHistory): void {
    if (confirm(`Restaurer la configuration du ${new Date(item.deployed_at).toLocaleString()} ?`)) {
      this.setConfig(item.configuration);
      this.hasChanges = true;
      this.activeTab = 'form';
      this.notificationService.info('Configuration restaurée. Cliquez sur "Déployer" pour appliquer.');
    }
  }

  // Deploy
  previewAndDeploy(): void {
    if (!this.isValid) {
      this.notificationService.error('Veuillez corriger les erreurs de validation');
      return;
    }

    this.showDiffModal = true;
    this.diffLoading = true;

    this.sitesService.previewConfigDiff(this.siteId, this.config).subscribe({
      next: (response) => {
        this.diffItems = response.diff;
        this.diffLoading = false;
      },
      error: (error) => {
        this.diffLoading = false;
        // Si pas d'historique, on peut quand même déployer
        this.diffItems = [];
      }
    });
  }

  confirmDeploy(): void {
    // Validation : vérifier que la config n'est pas vide
    if (!this.config || Object.keys(this.config).length === 0) {
      this.notificationService.error('Configuration vide - impossible de déployer');
      return;
    }

    this.deploying = true;

    // D'abord sauvegarder dans l'historique
    this.sitesService.saveConfigVersion(this.siteId, this.config, 'Déploiement depuis le dashboard').subscribe({
      next: () => {
        // Puis déployer sur le site
        this.sitesService.sendCommand(this.siteId, 'update_config', {
          configuration: this.config,
          mode: this.deployMode
        }).subscribe({
          next: () => {
            this.deploying = false;
            this.showDiffModal = false;
            this.originalConfig = JSON.parse(JSON.stringify(this.config));
            this.hasChanges = false;
            this.loadHistoryCount();
            this.notificationService.success('Configuration déployée avec succès');
            this.configDeployed.emit();
          },
          error: (error) => {
            this.deploying = false;
            this.notificationService.error('Erreur lors du déploiement: ' + (error.error?.error || error.message));
          }
        });
      },
      error: (error) => {
        this.deploying = false;
        this.notificationService.error('Erreur lors de la sauvegarde: ' + (error.error?.error || error.message));
      }
    });
  }

  formatJson(value: unknown): string {
    try {
      if (typeof value === 'string') {
        // Essayer de parser pour pretty-print s'il s'agit d'un JSON
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      }
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    } catch (_e) {
      return String(value);
    }
  }

  ownershipLabel(value: unknown): 'neopro' | 'club' | null {
    if (!value || typeof value !== 'object') return null;
    const v: any = value;
    if (v.owner === 'neopro' || v.locked === true) return 'neopro';
    if (v.owner === 'club') return 'club';
    return null;
  }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  // ============================================================================
  // Analytics Categories Mapping
  // ============================================================================

  loadAnalyticsCategories(): void {
    this.loadingAnalyticsCategories = true;
    this.analyticsService.getAnalyticsCategories().subscribe({
      next: (categories) => {
        this.analyticsCategories = categories;
        this.loadingAnalyticsCategories = false;
      },
      error: (error) => {
        this.loadingAnalyticsCategories = false;
        console.error('Failed to load analytics categories:', error);
      }
    });
  }

  /**
   * Récupère toutes les catégories de vidéos (catégories + sous-catégories)
   */
  getAllVideoCategories(): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = [];

    for (const category of this.config.categories) {
      result.push({ id: category.id, name: category.name });

      // Ajouter les sous-catégories
      if (category.subCategories) {
        for (const subcat of category.subCategories) {
          result.push({
            id: subcat.id,
            name: `${category.name} > ${subcat.name}`
          });
        }
      }
    }

    return result;
  }

  /**
   * Récupère le mapping analytics pour une catégorie donnée
   */
  getCategoryMapping(categoryId: string): string {
    return this.config.categoryMappings?.[categoryId] || '';
  }

  /**
   * Définit le mapping analytics pour une catégorie
   */
  setCategoryMapping(categoryId: string, analyticsCategoryId: string): void {
    if (!this.config.categoryMappings) {
      this.config.categoryMappings = {};
    }

    if (analyticsCategoryId) {
      this.config.categoryMappings[categoryId] = analyticsCategoryId;
    } else {
      delete this.config.categoryMappings[categoryId];
    }

    this.onConfigChange();
  }

  /**
   * Récupère la couleur d'une catégorie analytics
   */
  getAnalyticsCategoryColor(analyticsCategoryId: string): string {
    const category = this.analyticsCategories.find(c => c.id === analyticsCategoryId);
    return category?.color || '#6B7280';
  }
}
