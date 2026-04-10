import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteConfiguration, CategoryConfig, LocalVideo, SiteSponsor } from '../../../../../core/models';
import { UnifiedVideoOption, VideoOptionGroupEntry, OrphanedVideoDetail } from '../content-tab.models';
import { LoopManagerComponent } from '../../loop-manager/loop-manager.component';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, LoopManagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Config Health Bar -->
    <div class="config-health-bar" *ngIf="config">
      <a class="health-step" (click)="scrollToSection('library')" [class.ok]="totalVideoCount > 0"
         title="Nombre total de vidéos disponibles (Pi + Cloud)">
        <span class="health-icon">📚</span>
        <span class="health-label">Vidéos</span>
        <span class="health-value">{{ totalVideoCount }}</span>
      </a>
      <span class="health-arrow">→</span>
      <a class="health-step" (click)="scrollToSection('loops')" [class.ok]="hasPhaseLoops()" [class.warn]="!hasPhaseLoops() && config.sponsors.length > 0"
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
      <ng-container *ngIf="!isClubUser">
        <span class="health-arrow">→</span>
        <a class="health-step" (click)="scrollToSection('analytics')" [class.ok]="getUnmappedAnalyticsCount() === 0" [class.warn]="getUnmappedAnalyticsCount() > 0"
           title="Chaque catégorie doit être mappée à un type analytics (sponsor, jingle, ambiance) pour apparaître dans les rapports">
          <span class="health-icon">📊</span>
          <span class="health-label">Analytics</span>
          <span class="health-value" *ngIf="getUnmappedAnalyticsCount() === 0">✅</span>
          <span class="health-value warn" *ngIf="getUnmappedAnalyticsCount() > 0">⚠️ {{ getUnmappedAnalyticsCount() }} non mappés</span>
        </a>
      </ng-container>
    </div>

    <!-- Impact Counters -->
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

    <!-- Orphaned Videos Warning -->
    <div class="orphaned-warning-banner" *ngIf="orphanedVideoCount > 0">
      <span class="orphaned-warning-icon">&#9888;</span>
      <div class="orphaned-warning-content">
        <strong>{{ orphanedVideoCount }} vidéo(s) introuvable(s)</strong> —
        Des boutons pointent vers des vidéos dont le chemin ne correspond plus aux fichiers disponibles.
        Ces boutons ne feront rien quand on appuie dessus.
        <div class="orphaned-warning-actions" *ngIf="repairableOrphanCount > 0">
          <button class="btn btn-sm btn-primary" (click)="repairOrphans.emit()">
            Réparer automatiquement ({{ repairableOrphanCount }})
          </button>
        </div>
        <details class="orphaned-details" *ngIf="orphanedVideoDetails.length > 0">
          <summary>Voir les détails</summary>
          <ul>
            <li *ngFor="let detail of orphanedVideoDetails">
              <strong>{{ detail.location }}</strong>:
              <code>{{ detail.path }}</code>
              <span class="repair-hint" *ngIf="detail.repairable"> → {{ detail.suggestedPath }}</span>
              <span class="no-repair-hint" *ngIf="!detail.repairable"> (aucune correspondance)</span>
            </li>
          </ul>
        </details>
      </div>
    </div>

    <!-- JSON Toggle (hidden for club users) -->
    <div class="json-toggle-bar" *ngIf="config && !isClubUser">
      <button class="btn btn-sm btn-outline" (click)="toggleJsonView()">
        <span>{{ showJson ? '📝 Formulaire' : 'JSON' }}</span>
      </button>
    </div>

    <div class="json-editor-section" *ngIf="showJson && config">
      <div class="section card">
        <div class="section-header">
          <h4><span class="section-icon">📋</span> Configuration JSON</h4>
          <div class="json-actions">
            <button class="btn btn-sm btn-outline" (click)="formatJson()">Formater</button>
            <button class="btn btn-sm btn-outline" (click)="copyJson()">Copier</button>
          </div>
        </div>
        <textarea
          class="json-textarea"
          [value]="configJsonString"
          (input)="onJsonInput($event)"
          spellcheck="false"
        ></textarea>
        <div class="json-error" *ngIf="jsonError">{{ jsonError }}</div>
      </div>
    </div>

    <ng-container *ngIf="!showJson">

    <!-- Categories -->
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
              (ngModelChange)="emitConfigChanged()"
              (click)="$event.stopPropagation()"
              placeholder="Nom de la catégorie"
              class="category-name-input"
            />
            <span class="category-stats">
              {{ getCategoryVideoCount(cat) }} vidéo(s)
            </span>
            <div class="category-owner">
              <span class="owner-badge" [class.neopro]="cat.owner === 'neopro'" [class.club]="cat.owner !== 'neopro'">
                {{ cat.owner === 'neopro' ? '🔒 NEOPRO' : 'CLUB' }}
              </span>
            </div>
            <button class="btn-remove-small" (click)="removeCategory(catIndex); $event.stopPropagation()">×</button>
          </div>

          <div class="category-content" *ngIf="expandedCategories[catIndex]">
            <div class="category-videos">
              <div class="videos-header">
                <span>Vidéos</span>
                <button class="btn-add-tiny" (click)="addVideoToCategory(catIndex)">+ Vidéo</button>
              </div>
              <div class="video-list-compact" *ngIf="cat.videos && cat.videos.length > 0">
                <div class="video-row" *ngFor="let video of cat.videos; let vidIndex = index" [class.orphaned]="isOrphanedVideoPath(video.path)">
                  <select
                    [(ngModel)]="video.path"
                    (ngModelChange)="emitConfigChanged()"
                    class="video-select-compact"
                    [class.has-cloud-video]="isCloudVideoPath(video.path)"
                    [class.orphaned]="isOrphanedVideoPath(video.path)"
                  >
                    <option value="">-- Sélectionner --</option>
                    <optgroup *ngFor="let group of videoOptionGroups; trackBy: trackByGroupKey" [label]="group.icon + ' ' + group.label">
                      <option *ngFor="let v of group.videos; trackBy: trackByVideoPath" [value]="v.path">{{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}{{ (secondaryDisplayEnabled && v.hasSecondaryVariant) ? ' 📺' : '' }}</option>
                    </optgroup>
                  </select>
                  <input
                    type="text"
                    [(ngModel)]="video.name"
                    (ngModelChange)="emitConfigChanged()"
                    placeholder="Nom affiché"
                    class="video-name-compact"
                  />
                  <span class="cloud-badge" *ngIf="isCloudVideoPath(video.path)" title="Sera déployée automatiquement">⏳</span>
                  <span class="secondary-variant-badge" *ngIf="hasSecondaryVariantForPath(video.path)" title="Variante secondaire disponible">📺 2nd</span>
                  <span class="sponsor-badge-auto" *ngIf="getCategorySponsor(video.path) as sponsor" [title]="'Associé au sponsor ' + sponsor.name">🔗 {{ sponsor.name }}</span>
                  <button class="btn-remove-tiny" (click)="removeVideoFromCategory(catIndex, vidIndex)">×</button>
                </div>
              </div>
              <p class="empty-hint" *ngIf="!cat.videos || cat.videos.length === 0">Aucune vidéo</p>
            </div>

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
                      (ngModelChange)="emitConfigChanged()"
                      placeholder="Nom sous-catégorie"
                      class="subcat-name-input"
                    />
                    <span class="subcat-stats">{{ subcat.videos.length || 0 }} vidéo(s)</span>
                    <button class="btn-add-tiny" (click)="addVideoToSubcategory(catIndex, subIndex)">+ Vidéo</button>
                    <button class="btn-remove-tiny" (click)="removeSubcategory(catIndex, subIndex)">×</button>
                  </div>
                  <div class="subcat-videos" *ngIf="subcat.videos && subcat.videos.length > 0">
                    <div class="video-row" *ngFor="let video of subcat.videos; let vidIndex = index" [class.orphaned]="isOrphanedVideoPath(video.path)">
                      <select
                        [(ngModel)]="video.path"
                        (ngModelChange)="emitConfigChanged()"
                        class="video-select-compact"
                        [class.has-cloud-video]="isCloudVideoPath(video.path)"
                        [class.orphaned]="isOrphanedVideoPath(video.path)"
                      >
                        <option value="">-- Sélectionner --</option>
                        <optgroup *ngFor="let group of videoOptionGroups; trackBy: trackByGroupKey" [label]="group.icon + ' ' + group.label">
                          <option *ngFor="let v of group.videos; trackBy: trackByVideoPath" [value]="v.path">{{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}{{ (secondaryDisplayEnabled && v.hasSecondaryVariant) ? ' 📺' : '' }}</option>
                        </optgroup>
                      </select>
                      <input
                        type="text"
                        [(ngModel)]="video.name"
                        (ngModelChange)="emitConfigChanged()"
                        placeholder="Nom affiché"
                        class="video-name-compact"
                      />
                      <span class="cloud-badge" *ngIf="isCloudVideoPath(video.path)" title="Sera déployée automatiquement">⏳</span>
                      <span class="secondary-variant-badge" *ngIf="hasSecondaryVariantForPath(video.path)" title="Variante secondaire disponible">📺 2nd</span>
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

    <!-- Loop Manager -->
    <div class="section" id="section-loops">
      <app-loop-manager
        [siteType]="siteType"
        [isClubUser]="isClubUser"
        [subscriptionPlan]="subscriptionPlan"
        [featureOverrides]="featureOverrides"
        [config]="config"
        [videoOptionGroups]="videoOptionGroups"
        [cloudVideoPaths]="cloudVideoPaths"
        [allKnownVideoPaths]="allKnownVideoPaths"
        [localVideos]="localVideos"
        [videoDurations]="videoDurations"
        [siteSponsors]="siteSponsors"
        (configChanged)="emitConfigChanged()"
      ></app-loop-manager>
    </div>

    <!-- Remote Organization -->
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
        <div class="time-org-column" *ngFor="let tc of cachedTimeCategories">
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

    <!-- Analytics Categories (hidden for club users) -->
    <div class="section card" id="section-analytics" *ngIf="!isClubUser">
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

    </ng-container>
  `,
  styles: [`
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

    .health-step:hover { background: #e2e8f0; color: #334155; }
    .health-step.ok { color: #15803d; }
    .health-step.warn { color: #92400e; background: #fef3c7; }
    .health-icon { font-size: 1rem; }
    .health-label { font-weight: 500; }
    .health-value { font-size: 0.75rem; }
    .health-value.warn { font-weight: 600; }
    .health-arrow { color: #cbd5e1; font-size: 0.75rem; }

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

    .impact-tracked { color: #166534; }
    .impact-separator { color: #cbd5e1; }
    .impact-fallback { color: #92400e; }

    .orphaned-warning-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin: 0.75rem 0;
      padding: 0.75rem 1rem;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      border-left: 4px solid #dc2626;
      border-radius: 8px;
      font-size: 0.8125rem;
      color: #991b1b;
    }

    .orphaned-warning-icon { font-size: 1.25rem; flex-shrink: 0; }
    .orphaned-warning-content strong { font-weight: 600; }
    .orphaned-warning-actions { margin-top: 0.5rem; }

    .orphaned-details { margin-top: 0.5rem; font-size: 0.75rem; }
    .orphaned-details ul { margin: 0.25rem 0 0 1rem; padding: 0; }
    .orphaned-details li { margin-bottom: 0.25rem; }
    .orphaned-details code {
      font-size: 0.6875rem;
      background: #fee2e2;
      padding: 0.0625rem 0.25rem;
      border-radius: 2px;
    }

    .repair-hint { color: #16a34a; font-size: 0.6875rem; }
    .no-repair-hint { color: #9ca3af; font-size: 0.6875rem; font-style: italic; }

    .section { margin-bottom: 0; }

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

    .section-icon { font-size: 1.25rem; }

    .section-desc {
      margin: 0 0 1rem 0;
      font-size: 0.875rem;
      color: #64748b;
    }

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

    .category-item.neopro { background: #fefce8; border-color: #fde047; }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .category-header:hover { background: rgba(0, 0, 0, 0.02); }

    .expand-icon { font-size: 0.75rem; color: #64748b; width: 16px; }
    .category-icon { font-size: 1rem; }

    .category-name-input {
      flex: 1;
      padding: 0.25rem 0.5rem;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      background: transparent;
    }

    .category-name-input:focus { border-color: #e2e8f0; background: white; outline: none; }

    .category-stats { font-size: 0.75rem; color: #64748b; }

    .category-owner { margin-left: auto; }

    .owner-badge {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }

    .owner-badge.club { background: #dbeafe; color: #1e40af; }
    .owner-badge.neopro { background: #fef3c7; color: #92400e; }

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

    .btn-remove-small:hover { background: #fee2e2; color: #dc2626; }

    .category-content {
      padding: 0.75rem;
      border-top: 1px solid #e2e8f0;
      background: rgba(255, 255, 255, 0.5);
    }

    .category-videos, .subcategories { margin-bottom: 1rem; }
    .category-videos:last-child, .subcategories:last-child { margin-bottom: 0; }

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

    .btn-add-tiny:hover { background: #f1f5f9; }

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

    .video-row.orphaned {
      background: #fef2f2;
      border-left: 3px solid #dc2626;
      padding-left: 0.25rem;
      border-radius: 4px;
    }

    .video-select-compact {
      flex: 2;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .video-select-compact.has-cloud-video { border-color: #f59e0b; background: #fffbeb; }
    .video-select-compact.orphaned { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }

    .video-name-compact {
      flex: 1;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .cloud-badge { font-size: 0.75rem; color: #92400e; }

    .secondary-variant-badge {
      display: inline-block;
      font-size: 0.7rem;
      color: #1e40af;
      background: #eff6ff;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      padding: 0.1rem 0.35rem;
      font-weight: 600;
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

    .btn-remove-tiny:hover { background: #fee2e2; color: #dc2626; }

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

    .subcat-icon { font-size: 0.875rem; }

    .subcat-name-input {
      flex: 1;
      padding: 0.25rem 0.375rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .subcat-stats { font-size: 0.6875rem; color: #64748b; }

    .subcat-videos {
      padding-left: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .empty-state { text-align: center; padding: 2rem; color: #64748b; }
    .empty-state p { margin: 0 0 1rem 0; }
    .empty-hint { margin: 0; font-size: 0.75rem; color: #94a3b8; font-style: italic; }
    .empty-state.small { padding: 1rem; }
    .empty-state.small p { margin: 0; font-size: 0.8125rem; }

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

    .time-org-icon { font-size: 1.25rem; }

    .time-org-info { display: flex; flex-direction: column; }
    .time-org-name { font-size: 0.875rem; font-weight: 600; }
    .time-org-desc { font-size: 0.6875rem; color: #64748b; }

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

    .category-checkbox:hover { background: #f1f5f9; }
    .category-checkbox input { width: 16px; height: 16px; accent-color: #2563eb; }
    .checkbox-label { font-size: 0.8125rem; color: #1e293b; }

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

    .analytics-row:last-child { border-bottom: none; }

    .analytics-row.header {
      background: #f8fafc;
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }

    .col-category { font-size: 0.875rem; }
    .col-analytics { text-align: right; }

    .analytics-select {
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
      width: 100%;
    }

    .analytics-row.category-parent { background: #f8fafc; }
    .analytics-row.subcategory { background: #fafbfc; }
    .subcategory-name { padding-left: 1rem; color: #64748b; }

    .analytics-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      font-style: italic;
    }

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

    .btn-suggestion:hover { background: #bfdbfe; }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }

    .btn-primary { background: #2563eb; color: white; border: none; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary { background: white; color: #475569; border: 1px solid #e2e8f0; }
    .btn-secondary:hover { background: #f8fafc; }

    .json-toggle-bar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.75rem;
    }
    .json-textarea {
      width: 100%;
      min-height: 400px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.8125rem;
      line-height: 1.5;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      color: #1e293b;
      resize: vertical;
      tab-size: 2;
    }
    .json-textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15); }
    .json-error { color: #dc2626; font-size: 0.8125rem; margin-top: 0.5rem; padding: 0.5rem; background: #fef2f2; border-radius: 4px; }
    .json-actions { display: flex; gap: 0.5rem; }

    @media (max-width: 768px) {
      .time-org-grid { grid-template-columns: 1fr; }
      .analytics-row { grid-template-columns: 1fr; gap: 0.5rem; }
      .col-analytics { text-align: left; }
    }
  `]
})
export class ConfigEditorComponent {
  @Input() siteType: string = '';
  @Input() isClubUser = false;
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;
  @Input() config!: SiteConfiguration;
  @Input() localVideos: LocalVideo[] = [];
  @Input() cloudVideos: { length: number } = { length: 0 };
  @Input() videoOptionGroups: VideoOptionGroupEntry[] = [];
  @Input() cloudVideoPaths: Set<string> = new Set();
  @Input() allKnownVideoPaths: Set<string> = new Set();
  @Input() videoDurations: Map<string, number> = new Map();
  @Input() siteSponsors: SiteSponsor[] = [];
  @Input() secondaryDisplayEnabled = false;
  @Input() unifiedVideoOptions: UnifiedVideoOption[] = [];
  @Input() cachedTimeCategories: { id: string; name: string; icon: string; description: string }[] = [];
  @Input() orphanedVideoCount = 0;
  @Input() repairableOrphanCount = 0;
  @Input() orphanedVideoDetails: OrphanedVideoDetail[] = [];

  @Output() configChanged = new EventEmitter<void>();
  @Output() repairOrphans = new EventEmitter<void>();

  expandedCategories: boolean[] = [];
  showJson = false;
  configJsonString = '';
  jsonError = '';

  get totalVideoCount(): number {
    return this.localVideos.length + (this.cloudVideos?.length || 0);
  }

  constructor(private cdr: ChangeDetectorRef) {}

  emitConfigChanged(): void {
    this.configChanged.emit();
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

  getTrackedVideoCount(): number {
    if (!this.config) return 0;
    const phases = this.config.timeCategories || [];
    return phases.reduce((sum, tc) => sum + (tc.loopVideos?.length || 0), 0);
  }

  getFallbackVideoCount(): number {
    if (!this.config) return 0;
    return this.config.sponsors?.length || 0;
  }

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
    this.emitConfigChanged();
  }

  removeCategory(index: number): void {
    this.config.categories?.splice(index, 1);
    this.expandedCategories.splice(index, 1);
    this.emitConfigChanged();
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
    this.emitConfigChanged();
  }

  removeVideoFromCategory(catIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.videos?.splice(vidIndex, 1);
    this.emitConfigChanged();
  }

  addSubcategory(catIndex: number): void {
    const cat = this.config.categories?.[catIndex];
    if (!cat) return;
    if (!cat.subCategories) cat.subCategories = [];
    cat.subCategories.push({ id: this.generateId(), name: '', videos: [] });
    this.emitConfigChanged();
  }

  removeSubcategory(catIndex: number, subIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.splice(subIndex, 1);
    this.emitConfigChanged();
  }

  addVideoToSubcategory(catIndex: number, subIndex: number): void {
    const subcat = this.config.categories?.[catIndex]?.subCategories?.[subIndex];
    if (!subcat) return;
    if (!subcat.videos) subcat.videos = [];
    subcat.videos.push({ name: '', path: '', type: 'video/mp4', owner: 'club', locked: false });
    this.emitConfigChanged();
  }

  removeVideoFromSubcategory(catIndex: number, subIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.[subIndex]?.videos?.splice(vidIndex, 1);
    this.emitConfigChanged();
  }

  isCloudVideoPath(path: string): boolean {
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return video ? !video.isOnPi : false;
  }

  isOrphanedVideoPath(videoPath: string): boolean {
    if (!videoPath) return false;
    return this.allKnownVideoPaths.size > 0 && !this.allKnownVideoPaths.has(videoPath);
  }

  hasSecondaryVariantForPath(path: string): boolean {
    if (!this.secondaryDisplayEnabled) return false;
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return video?.hasSecondaryVariant ?? false;
  }

  getCategorySponsor(videoPath: string): SiteSponsor | null {
    if (!videoPath || this.siteSponsors.length === 0) return null;
    const parts = videoPath.split('/');
    const bareFilename = parts[parts.length - 1] || videoPath;
    const exact = this.siteSponsors.find(sp => sp.video_filenames?.includes(bareFilename));
    if (exact) return exact;
    const withoutPrefix = bareFilename.replace(/^\d+_/, '');
    if (withoutPrefix !== bareFilename) {
      return this.siteSponsors.find(
        sp => sp.video_filenames?.some(f => {
          const fBare = f.split('/').pop() || f;
          return fBare === withoutPrefix || fBare === bareFilename;
        })
      ) ?? null;
    }
    return null;
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
    this.emitConfigChanged();
  }

  getCategoryAnalyticsType(categoryId: string): string {
    return this.config.categoryMappings?.[categoryId] || '';
  }

  setCategoryAnalyticsType(categoryId: string, analyticsType: string): void {
    if (!this.config.categoryMappings) this.config.categoryMappings = {};
    if (analyticsType) {
      this.config.categoryMappings[categoryId] = analyticsType;
    } else {
      delete this.config.categoryMappings[categoryId];
    }
    this.emitConfigChanged();
  }

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

  trackByGroupKey(_index: number, group: { key: string }): string {
    return group.key;
  }

  trackByVideoPath(_index: number, video: UnifiedVideoOption): string {
    return video.path;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
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

  // ============================================================================
  // JSON Editor
  // ============================================================================

  toggleJsonView(): void {
    this.showJson = !this.showJson;
    if (this.showJson) {
      this.syncJsonFromConfig();
    }
    this.cdr.markForCheck();
  }

  onJsonInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.configJsonString = value;
    try {
      const parsed = JSON.parse(value) as SiteConfiguration;
      this.jsonError = '';
      // Apply all parsed JSON fields to config
      Object.assign(this.config, parsed);
      this.emitConfigChanged();
    } catch (e) {
      this.jsonError = `JSON invalide: ${e instanceof Error ? e.message : 'Erreur inconnue'}`;
    }
  }

  formatJson(): void {
    try {
      const parsed = JSON.parse(this.configJsonString);
      this.configJsonString = JSON.stringify(parsed, null, 2);
      this.jsonError = '';
    } catch (e) {
      this.jsonError = `JSON invalide: ${e instanceof Error ? e.message : 'Erreur inconnue'}`;
    }
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.configJsonString).then(() => {
      // Feedback visuel optionnel
    });
  }

  syncJsonFromConfig(): void {
    this.configJsonString = JSON.stringify(this.config, null, 2);
    this.jsonError = '';
  }
}
