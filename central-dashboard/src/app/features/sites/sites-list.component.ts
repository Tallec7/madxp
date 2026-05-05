import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval } from 'rxjs';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { Site, SiteConnectionSummary, SubscriptionDisplayStatus } from '../../core/models';
import { formatVersion } from './utils/version';
import { ActiveSession, SiteMiniHealth } from '../../core/models';
import { SubscriptionBadgeComponent } from '../../shared/components/subscription-badge/subscription-badge.component';
import { SitesMapComponent } from './components/sites-map/sites-map.component';

@Component({
  selector: 'app-sites-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule, SubscriptionBadgeComponent, SitesMapComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>
          Sites ({{ (sites$ | async)?.length || 0 }})
          <span class="header-alert" *ngIf="unbootstrappedSites.length > 0">
            · <span class="header-alert-count">{{ unbootstrappedSites.length }} à installer</span>
          </span>
        </h1>
        <div class="header-actions">
          <div class="view-toggle">
            <button
              class="toggle-btn"
              [class.active]="viewMode === 'grid'"
              (click)="viewMode = 'grid'"
              title="Vue grille">
              ▦
            </button>
            <button
              class="toggle-btn"
              [class.active]="viewMode === 'map'"
              (click)="viewMode = 'map'; refreshMap()"
              title="Vue carte">
              🗺️
            </button>
          </div>
          <button class="btn btn-primary" (click)="showCreateModal = true">+ Nouveau site</button>
        </div>
      </div>

      <div class="filters">
        <input
          type="text"
          [placeholder]="'groups.searchByName' | translate"
          [(ngModel)]="searchTerm"
          (ngModelChange)="applyFilters()"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les statuts</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Erreur</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <select [(ngModel)]="regionFilter" (ngModelChange)="applyFilters()">
          <option value="">Toutes les régions</option>
          <option value="Bretagne">Bretagne</option>
          <option value="Pays de la Loire">Pays de la Loire</option>
          <option value="Normandie">Normandie</option>
          <option value="Île-de-France">Île-de-France</option>
        </select>
        <select [(ngModel)]="subscriptionFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les abonnements</option>
          <option value="active">✓ Actifs</option>
          <option value="expiring_soon">⏳ Expire bientôt</option>
          <option value="grace_period">⚠️ Période de grâce</option>
          <option value="suspended">⏸ Suspendus</option>
          <option value="blocked">🚫 Bloqués</option>
          <option value="trial">🎁 Essai</option>
        </select>
        <select [(ngModel)]="typeFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les types</option>
          <option value="pi">📡 Pi</option>
          <option value="saas">🌐 SaaS</option>
          <option value="demo">🎬 Demo</option>
        </select>
        <button class="btn btn-secondary" (click)="clearFilters()" *ngIf="hasActiveFilters()">
          Effacer les filtres
        </button>
      </div>

      <!-- Banner Pi à installer -->
      <div class="install-banner" *ngIf="unbootstrappedSites.length > 0 && viewMode === 'grid'">
        <span class="install-banner-icon">⚠️</span>
        <span>
          <strong>{{ unbootstrappedSites.length }} site{{ unbootstrappedSites.length > 1 ? 's' : '' }} Pi à installer</strong>
          — {{ unbootstrappedSites.map(s => s.club_name).join(', ') }} n'ont jamais bootstrappé.
        </span>
        <a class="install-banner-cta" [routerLink]="['/updates']">Voir les mises à jour →</a>
      </div>

      <ng-container *ngIf="(sites$ | async) as sitesList">
        <!-- Map View -->
        <app-sites-map
          *ngIf="viewMode === 'map'"
          #sitesMap
          [sites]="sitesList"
          [connectionStatus]="connectionStatusMap">
        </app-sites-map>

        <!-- Grid View -->
        <ng-container *ngIf="viewMode === 'grid' && sitesList.length > 0">

        <!-- Section : sites actifs -->
        <div class="sites-grid">
        <div *ngFor="let site of activeSites" class="site-card card">
          <div class="site-header">
            <div class="site-title-block">
              <h3>{{ site.club_name }}</h3>
              <div class="site-type-chips">
                <span class="chip chip-type chip-type-{{ site.site_type ?? 'pi' }}">
                  {{ getSiteTypeLabel(site.site_type) }}
                </span>
                <span class="chip chip-plan" *ngIf="site.subscription_plan">
                  {{ site.subscription_plan | titlecase }}
                </span>
              </div>
            </div>
            <div class="site-badges">
              <span class="badge" [class]="'badge-' + getRealTimeStatusBadge(site)">
                {{ getRealTimeStatusText(site) }}
              </span>
              <app-subscription-badge
                [subscriptionEnd]="site.subscription_end ?? null"
                [plan]="site.subscription_plan ?? 'standard'"
                [suspended]="site.suspended ?? false"
                [suspensionReason]="site.suspension_reason ?? null"
                [showText]="false"
              ></app-subscription-badge>
            </div>
          </div>

          <p class="site-name" *ngIf="site.site_name !== site.club_name">{{ site.site_name }}</p>

          <!-- Match live strip -->
          <div class="match-strip" *ngIf="activeSessionsMap.has(site.id)">
            <span class="live-badge">LIVE</span>
            <span class="match-teams">
              {{ activeSessionsMap.get(site.id)?.homeTeam || '?' }}
              vs
              {{ activeSessionsMap.get(site.id)?.awayTeam || '?' }}
            </span>
            <span class="match-score" *ngIf="activeSessionsMap.get(site.id)?.homeScore !== null">
              {{ activeSessionsMap.get(site.id)?.homeScore }}
              —
              {{ activeSessionsMap.get(site.id)?.awayScore }}
            </span>
          </div>

          <div class="site-detail">
            <span class="detail-icon">📍</span>
            <span>{{ site.location?.city }}, {{ site.location?.region }}</span>
          </div>

          <div class="site-detail" *ngIf="site.sports && site.sports.length > 0">
            <span class="detail-icon">⚽</span>
            <span>{{ site.sports.join(', ') }}</span>
          </div>

          <div class="site-detail">
            <span class="detail-icon">🕒</span>
            <span>{{ formatLastSeenForSite(site) }}</span>
          </div>

          <!-- Mini health strip — Pi uniquement, si métriques disponibles -->
          <div class="health-strip" *ngIf="site.site_type === 'pi' && miniHealthMap.has(site.id)">
            <div class="health-cell">
              <span class="health-label">🌡️ Temp</span>
              <span class="health-value"
                [class.health-warn]="(miniHealthMap.get(site.id)?.temperature ?? 0) > 70"
                [class.health-danger]="(miniHealthMap.get(site.id)?.temperature ?? 0) > 80">
                {{ miniHealthMap.get(site.id)?.temperature !== null ? (miniHealthMap.get(site.id)?.temperature + '°C') : '—' }}
              </span>
            </div>
            <div class="health-cell">
              <span class="health-label">🖥️ CPU</span>
              <span class="health-value"
                [class.health-warn]="(miniHealthMap.get(site.id)?.cpuPercent ?? 0) > 80">
                {{ miniHealthMap.get(site.id)?.cpuPercent !== null ? (miniHealthMap.get(site.id)?.cpuPercent + '%') : '—' }}
              </span>
            </div>
            <div class="health-cell">
              <span class="health-label">💾 RAM</span>
              <span class="health-value"
                [class.health-warn]="(miniHealthMap.get(site.id)?.memoryPercent ?? 0) > 85">
                {{ miniHealthMap.get(site.id)?.memoryPercent !== null ? (miniHealthMap.get(site.id)?.memoryPercent + '%') : '—' }}
              </span>
            </div>
            <div class="health-cell">
              <span class="health-label">⚠️ Alertes</span>
              <span class="health-value"
                [class.health-danger]="(miniHealthMap.get(site.id)?.alertCount ?? 0) > 0">
                {{ miniHealthMap.get(site.id)?.alertCount ?? 0 }}
              </span>
            </div>
          </div>

          <div class="site-footer">
            <span class="site-version" [class.site-version--update]="isOutdated(site)">
              {{ formatVersion(site) }}
              <span class="update-badge" *ngIf="isOutdated(site)">↑ MAJ</span>
            </span>
            <div class="site-actions">
              <button
                class="btn-icon"
                [routerLink]="['/sites', site.id]"
                title="Voir les détails"
              >
                👁️
              </button>
              <button
                class="btn-icon"
                (click)="editSite(site)"
                title="Éditer"
              >
                ✏️
              </button>
              <button
                class="btn-icon"
                (click)="duplicateSite(site)"
                title="Dupliquer le site"
              >
                📋
              </button>
              <button
                class="btn-icon btn-danger"
                (click)="deleteSite(site)"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>

        <!-- Section : Pi à installer -->
        <ng-container *ngIf="unbootstrappedSites.length > 0">
          <div class="section-divider">
            <span class="section-divider-line"></span>
            <span class="section-divider-label">⚠ À installer ({{ unbootstrappedSites.length }})</span>
            <span class="section-divider-line"></span>
          </div>
          <div class="sites-grid">
            <div *ngFor="let site of unbootstrappedSites" class="site-card card card--unbootstrapped">
              <div class="site-header">
                <div class="site-title-block">
                  <h3>{{ site.club_name }}</h3>
                  <div class="site-type-chips">
                    <span class="chip chip-type chip-type-pi">📡 Pi</span>
                    <span class="chip chip-plan" *ngIf="site.subscription_plan">{{ site.subscription_plan | titlecase }}</span>
                  </div>
                </div>
                <span class="badge badge-warning">⚠ Jamais bootstrappé</span>
              </div>
              <p class="site-name" *ngIf="site.site_name !== site.club_name">{{ site.site_name }}</p>
              <div class="site-detail">
                <span class="detail-icon">📍</span>
                <span>{{ site.location?.city }}, {{ site.location?.region }}</span>
              </div>
              <div class="site-detail" *ngIf="site.sports && site.sports.length > 0">
                <span class="detail-icon">⚽</span>
                <span>{{ site.sports.join(', ') }}</span>
              </div>
              <div class="site-detail">
                <span class="detail-icon">📅</span>
                <span>Créé {{ formatLastSeen(site.created_at) }}</span>
              </div>
              <div class="onboarding-cta">
                <p class="onboarding-text">Pi non installé sur site. Préparer le matériel ?</p>
                <button class="btn btn-install" [routerLink]="['/sites', site.id]">
                  📦 Préparer l'installation
                </button>
              </div>
              <div class="site-footer">
                <span class="site-version">—</span>
                <div class="site-actions">
                  <button class="btn-icon" [routerLink]="['/sites', site.id]" title="Voir les détails">👁️</button>
                  <button class="btn-icon" (click)="editSite(site)" title="Éditer">✏️</button>
                  <button class="btn-icon" (click)="duplicateSite(site)" title="Dupliquer le site">📋</button>
                  <button class="btn-icon btn-danger" (click)="deleteSite(site)" title="Supprimer">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        </ng-container>

        </ng-container>

        <!-- Empty State for Grid -->
        <div class="empty-state card" *ngIf="viewMode === 'grid' && sitesList.length === 0">
          <div class="empty-icon">🖥️</div>
          <h3>Aucun site trouvé</h3>
          <p *ngIf="hasActiveFilters()">Aucun site ne correspond à vos critères de recherche.</p>
          <p *ngIf="!hasActiveFilters()">Commencez par ajouter votre premier site.</p>
          <button class="btn btn-primary" (click)="showCreateModal = true">+ Ajouter un site</button>
        </div>
      </ng-container>

      <!-- Modal Create Site -->
      <div class="modal" *ngIf="showCreateModal" (click)="showCreateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Nouveau site</h2>
            <button class="modal-close" (click)="showCreateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du site</label>
              <input type="text" [(ngModel)]="newSite.site_name" placeholder="Ex: Site Rennes">
            </div>
            <div class="form-group">
              <label>Nom du club</label>
              <input type="text" [(ngModel)]="newSite.club_name" placeholder="Ex: Rennes FC">
            </div>
            <div class="form-group">
              <label>Ville</label>
              <input type="text" [(ngModel)]="newSite.location.city" placeholder="Ex: Rennes">
            </div>
            <div class="form-group">
              <label>Région</label>
              <input type="text" [(ngModel)]="newSite.location.region" placeholder="Ex: Bretagne">
            </div>
            <div class="form-group">
              <label>Sports (séparés par des virgules)</label>
              <input type="text" [(ngModel)]="sportsInput" placeholder="Ex: football, rugby">
            </div>
            <div class="form-group">
              <label>Type de site</label>
              <select [(ngModel)]="newSite.site_type">
                <option value="pi">Pi (matériel Raspberry Pi)</option>
                <option value="saas">SaaS (navigateur uniquement)</option>
              </select>
            </div>
            <div class="form-group" *ngIf="newSite.site_type !== 'saas'">
              <label>Modèle du boîtier</label>
              <input type="text" [(ngModel)]="newSite.hardware_model" placeholder="Ex: Raspberry Pi 4 Model B">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCreateModal = false">Annuler</button>
            <button class="btn btn-primary" (click)="createSite()" [disabled]="!isValid()">Créer</button>
          </div>
        </div>
      </div>

      <!-- Modal Edit Site -->
      <div class="modal" *ngIf="showEditModal" (click)="closeEditModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Modifier le site</h2>
            <button class="modal-close" (click)="closeEditModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du site</label>
              <input type="text" [(ngModel)]="editSiteData.site_name" placeholder="Ex: Site Rennes">
            </div>
            <div class="form-group">
              <label>Nom du club</label>
              <input type="text" [(ngModel)]="editSiteData.club_name" placeholder="Ex: Rennes FC">
            </div>
            <div class="form-group">
              <label>Ville</label>
              <input type="text" [(ngModel)]="editSiteData.location.city" placeholder="Ex: Rennes">
            </div>
            <div class="form-group">
              <label>Région</label>
              <input type="text" [(ngModel)]="editSiteData.location.region" placeholder="Ex: Bretagne">
            </div>
            <div class="form-group">
              <label>Sports (séparés par des virgules)</label>
              <input type="text" [(ngModel)]="editSportsInput" placeholder="Ex: football, rugby">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeEditModal()">Annuler</button>
            <button class="btn btn-primary" (click)="saveEditSite()" [disabled]="!isEditValid()">Enregistrer</button>
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

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 2rem;
      color: #0f172a;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .view-toggle {
      display: flex;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 4px;
    }

    .toggle-btn {
      background: none;
      border: none;
      padding: 0.5rem 0.75rem;
      font-size: 1rem;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
      color: #64748b;
    }

    .toggle-btn:hover {
      color: #0f172a;
    }

    .toggle-btn.active {
      background: white;
      color: #2563eb;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .search-input {
      flex: 1;
      min-width: 250px;
    }

    .filters input,
    .filters select {
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: white;
    }

    .filters input:focus,
    .filters select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .sites-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .site-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .site-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .site-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .site-title-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .site-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .site-type-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .chip {
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .chip-type-pi   { background: #e0e7ff; color: #4338ca; }
    .chip-type-saas { background: #cffafe; color: #0e7490; }
    .chip-type-demo { background: #f3e8ff; color: #7e22ce; }

    .chip-plan {
      background: #f1f5f9;
      color: #475569;
    }

    .site-badges {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
    }

    /* Badge usage 30j */
    .badge-usage {
      font-size: 0.6875rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
      cursor: help;
    }

    .badge-usage.usage-high {
      background: #dcfce7;
      color: #166534;
    }

    .badge-usage.usage-medium {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-usage.usage-low {
      background: #fed7aa;
      color: #c2410c;
    }

    .badge-usage.usage-none {
      background: #f1f5f9;
      color: #64748b;
    }

    .site-name {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
    }

    .site-detail {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #475569;
    }

    .detail-icon {
      width: 20px;
      text-align: center;
    }

    .site-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      margin-top: auto;
    }

    .site-version {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #f1f5f9;
      border-radius: 4px;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .site-version--update {
      background: #fef3c7;
      color: #92400e;
    }

    .update-badge {
      font-family: inherit;
      font-size: 0.625rem;
      font-weight: 700;
      background: #f59e0b;
      color: white;
      padding: 1px 5px;
      border-radius: 3px;
    }

    .site-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-icon {
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      font-size: 1.125rem;
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
      max-width: 500px;
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

    .form-group input {
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

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    /* Match live strip */
    .match-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(90deg, #fef2f2, #fff);
      border-top: 1px solid #fecaca;
      border-bottom: 1px solid #fecaca;
      padding: 8px 1rem;
      font-size: 0.8125rem;
      margin: 0 -1rem;
    }
    .live-badge {
      background: #dc2626;
      color: white;
      font-size: 0.625rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .match-teams { font-weight: 600; color: #0f172a; flex: 1; }
    .match-score { font-weight: 700; color: #0f172a; flex-shrink: 0; }

    /* Health strip */
    .health-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 4px;
    }
    .health-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .health-label { font-size: 0.625rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3px; }
    .health-value { font-size: 0.8125rem; font-weight: 700; color: #0f172a; }
    .health-value.health-warn   { color: #ea580c; }
    .health-value.health-danger { color: #dc2626; }

    /* Header alert count */
    .header-alert { font-size: 0.875rem; font-weight: 400; }
    .header-alert-count { color: #ea580c; font-weight: 600; }

    /* Install banner */
    .install-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-left: 4px solid #ea580c;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: #7c2d12;
    }
    .install-banner-icon { font-size: 1.25rem; flex-shrink: 0; }
    .install-banner-cta {
      margin-left: auto;
      background: #ea580c;
      color: white;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .install-banner-cta:hover { background: #c2410c; }

    /* Section divider */
    .section-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 2rem 0 1rem;
    }
    .section-divider-line { flex: 1; height: 1px; background: #e2e8f0; }
    .section-divider-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      white-space: nowrap;
    }

    /* Card unbootstrapped */
    .card--unbootstrapped { border-left: 3px solid #ea580c; }

    /* Onboarding CTA block */
    .onboarding-cta {
      background: #fff7ed;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }
    .onboarding-text { color: #7c2d12; font-size: 0.8125rem; margin-bottom: 10px; }
    .btn-install {
      background: #ea580c;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-install:hover { background: #c2410c; }

    @media (max-width: 768px) {
      .sites-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
      }

      .search-input {
        width: 100%;
      }
    }
  `]
})
export class SitesListComponent implements OnInit, OnDestroy {
  @ViewChild('sitesMap') sitesMap?: SitesMapComponent;

  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);
  private readonly logger = inject(LoggerService);
  readonly formatVersion = formatVersion;

  sites$ = this.sitesService.sites$;
  allSites: Site[] = [];
  private sitesSubscription?: Subscription;
  searchTerm = '';
  statusFilter = '';
  regionFilter = '';
  subscriptionFilter = '';
  typeFilter = '';
  showCreateModal = false;
  showEditModal = false;
  viewMode: 'grid' | 'map' = 'grid';

  // Map des statuts de connexion temps réel (siteId -> status)
  connectionStatusMap = new Map<string, SiteConnectionSummary>();
  activeSessionsMap = new Map<string, ActiveSession>();
  miniHealthMap = new Map<string, SiteMiniHealth>();
  latestOtaVersion: string | null = null;
  private connectionStatusSubscription?: Subscription;
  private refreshSubscription?: Subscription;

  newSite: { site_name: string; club_name: string; location: { city: string; region: string; country: string }; hardware_model: string; site_type: 'pi' | 'saas' | 'demo' } = {
    site_name: '',
    club_name: '',
    location: {
      city: '',
      region: '',
      country: 'France'
    },
    hardware_model: '',
    site_type: 'pi'
  };

  sportsInput = '';

  editingSite: Site | null = null;
  editSiteData = {
    site_name: '',
    club_name: '',
    location: {
      city: '',
      region: '',
      country: 'France'
    }
  };
  editSportsInput = '';

  get activeSites(): Site[] {
    return this.allSites.filter(s => !this.isUnbootstrapped(s));
  }

  get unbootstrappedSites(): Site[] {
    return this.allSites.filter(s => this.isUnbootstrapped(s));
  }

  isUnbootstrapped(site: Site): boolean {
    return site.site_type === 'pi' && !site.last_seen_at;
  }

  ngOnInit(): void {
    this.loadSites();
    this.loadConnectionStatus();
    this.sitesSubscription = this.sites$.subscribe(sites => { this.allSites = sites; });
    this.sitesService.getLatestOtaVersion().subscribe({
      next: ({ version }) => { this.latestOtaVersion = version; },
      error: () => { /* non-bloquant */ }
    });
    this.loadActiveSessions();
    this.loadMiniHealth();
    // Rafraîchir connexion + sessions actives toutes les 60 secondes
    this.refreshSubscription = interval(60000).subscribe(() => {
      this.loadConnectionStatus();
      this.loadActiveSessions();
      this.loadMiniHealth();
    });
  }

  ngOnDestroy(): void {
    this.connectionStatusSubscription?.unsubscribe();
    this.refreshSubscription?.unsubscribe();
    this.sitesSubscription?.unsubscribe();
  }

  private loadMiniHealth(): void {
    this.sitesService.getSitesMiniHealth().subscribe({
      next: ({ sites }) => {
        this.miniHealthMap.clear();
        for (const s of sites) { this.miniHealthMap.set(s.siteId, s); }
      },
      error: () => { /* non-bloquant */ }
    });
  }

  private loadActiveSessions(): void {
    this.sitesService.getActiveSessions().subscribe({
      next: ({ sessions }) => {
        this.activeSessionsMap.clear();
        for (const s of sessions) {
          this.activeSessionsMap.set(s.siteId, s);
        }
      },
      error: () => { /* non-bloquant */ }
    });
  }

  private loadConnectionStatus(): void {
    this.connectionStatusSubscription?.unsubscribe();
    this.connectionStatusSubscription = this.sitesService.getAllConnectionStatus().subscribe({
      next: (response) => {
        this.connectionStatusMap.clear();
        for (const site of response.sites) {
          this.connectionStatusMap.set(site.siteId, site);
        }
      },
      error: (error) => {
        this.logger.warn('Failed to load connection status', { error: ErrorExtractor.getMessage(error) });
      }
    });
  }

  loadSites(): void {
    this.sitesService.loadSites().subscribe();
  }

  applyFilters(): void {
    const filters: Record<string, string> = {};
    if (this.searchTerm) filters['search'] = this.searchTerm;
    if (this.statusFilter) filters['status'] = this.statusFilter;
    if (this.regionFilter) filters['region'] = this.regionFilter;
    if (this.subscriptionFilter) filters['subscription'] = this.subscriptionFilter;
    if (this.typeFilter) filters['site_type'] = this.typeFilter;

    this.sitesService.loadSites(filters).subscribe();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.regionFilter = '';
    this.subscriptionFilter = '';
    this.typeFilter = '';
    this.loadSites();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.statusFilter || this.regionFilter || this.subscriptionFilter || this.typeFilter);
  }

  /**
   * Calcule le statut d'abonnement d'affichage pour un site
   */
  getSubscriptionDisplayStatus(site: Site): SubscriptionDisplayStatus {
    // Site suspendu
    if (site.suspended) {
      return 'suspended';
    }

    // Pas de date de fin = actif indéfiniment (legacy)
    if (!site.subscription_end) {
      return 'active';
    }

    const endDate = new Date(site.subscription_end);
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Trial
    if (site.subscription_plan === 'trial') {
      if (diffDays < 0) return 'blocked';
      if (diffDays <= 7) return 'expiring_soon';
      return 'trial';
    }

    // Expiré depuis plus de 7 jours = bloqué
    if (diffDays < -7) return 'blocked';

    // Période de grâce (expiré depuis moins de 7 jours)
    if (diffDays < 0) return 'grace_period';

    // Expire dans moins de 30 jours
    if (diffDays <= 30) return 'expiring_soon';

    return 'active';
  }

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      online: 'success',
      offline: 'secondary',
      error: 'danger',
      maintenance: 'warning'
    };
    return badges[status] || 'secondary';
  }

  /**
   * Retourne le statut de connexion temps réel pour la carte d'un site sur la
   * liste. Combine deux sources avec un veto DB :
   *
   * 1. Veto fort : si la DB dit `status='offline'` OU `last_seen_at` > 5 min,
   *    on retourne `offline` même si le cache socket dit le contraire (le cache
   *    a un TTL de 60s, donc peut afficher un faux "Connecté" pendant ~1 min
   *    après une vraie déconnexion — issue #644).
   * 2. Sinon, on consomme le cache socket temps réel s'il est disponible.
   * 3. Sinon, fallback sur la DB (status + last_seen_at avec seuil 120s).
   *
   * ADR-099 : la formule d'uptime % a été corrigée côté backend, mais ce badge
   * binaire (online/offline) reste basé sur la fraîcheur du heartbeat, pas sur
   * un % calculé.
   */
  getRealTimeStatus(site: Site): 'online' | 'offline' | 'warning' | 'unknown' {
    const lastSeenAt = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((Date.now() - lastSeenAt.getTime()) / 1000)
      : null;

    // Veto fort sur les faux positifs du cache socket : si la DB est claire
    // (offline ou last_seen_at trop vieux), c'est la vérité.
    const dbSaysOffline =
      site.status === 'offline' ||
      (secondsSinceLastSeen !== null && secondsSinceLastSeen > 300);
    if (dbSaysOffline) {
      return 'offline';
    }

    // Cache socket temps réel (TTL ~60s) — plus précis que la DB pour
    // détecter un disconnect très récent dans la fenêtre ≤5 min.
    const connectionStatus = this.connectionStatusMap.get(site.id);
    if (connectionStatus) {
      return connectionStatus.displayStatus;
    }

    // Fallback DB pure
    if (site.status === 'online') {
      return 'online';
    }
    if (secondsSinceLastSeen === null) {
      return 'unknown';
    }
    return secondsSinceLastSeen < 120 ? 'warning' : 'offline';
  }

  getRealTimeStatusBadge(site: Site): string {
    const status = this.getRealTimeStatus(site);
    const badges: Record<string, string> = {
      online: 'success',    // Vert
      warning: 'warning',   // Orange
      offline: 'secondary', // Gris
      unknown: 'secondary'  // Gris
    };
    return badges[status];
  }

  getRealTimeStatusText(site: Site): string {
    const status = this.getRealTimeStatus(site);
    const texts: Record<string, string> = {
      online: 'Connecté',
      warning: 'Connexion instable',
      offline: 'Hors ligne',
      unknown: 'Inconnu'
    };
    return texts[status];
  }

  /**
   * Retourne le label d'usage (désactivé - analytics supprimées)
   */
  getUsageLabel(_site: Site): string {
    return '';
  }

  /**
   * Retourne la classe CSS pour le badge usage (désactivé - analytics supprimées)
   */
  getUsageBadgeClass(_site: Site): string {
    return 'usage-none';
  }

  /**
   * Retourne le tooltip avec les détails d'usage (désactivé - analytics supprimées)
   */
  getUsageTooltip(_site: Site): string {
    return '';
  }

  isOutdated(site: Site): boolean {
    if (site.site_type === 'saas' || site.site_type === 'demo') return false;
    if (!site.software_version || !this.latestOtaVersion) return false;
    return site.software_version !== this.latestOtaVersion;
  }

  getSiteTypeLabel(type: string | undefined): string {
    const labels: Record<string, string> = { pi: '📡 Pi', saas: '🌐 SaaS', demo: '🎬 Demo' };
    return labels[type ?? 'pi'] ?? '📡 Pi';
  }

  formatLastSeenForSite(site: Site): string {
    if (site.site_type === 'saas') return '—';
    if (site.site_type === 'demo') return '—';
    return this.formatLastSeen(site.last_seen_at);
  }

  formatLastSeen(date: Date | null): string {
    if (!date) return 'Jamais vu';

    const now = new Date();
    const lastSeen = new Date(date);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return `Il y a ${Math.floor(diffMins / 1440)} jours`;
  }

  isValid(): boolean {
    return !!(this.newSite.site_name && this.newSite.club_name &&
              this.newSite.location.city && this.newSite.location.region);
  }

  createSite(): void {
    if (!this.isValid()) return;

    const siteData: Partial<Site> = {
      ...this.newSite,
      sports: this.sportsInput ? this.sportsInput.split(',').map(s => s.trim()) : []
    };

    this.sitesService.createSite(siteData).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.loadSites();
        this.resetForm();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Site creation failed', { error: message, siteData: this.newSite });
        this.notificationService.error(`Erreur lors de la création du site: ${message}`, {
          correlationId: ErrorExtractor.getCorrelationId(error)
        });
      }
    });
  }

  resetForm(): void {
    this.newSite = {
      site_name: '',
      club_name: '',
      location: {
        city: '',
        region: '',
        country: 'France'
      },
      hardware_model: '',
      site_type: 'pi'
    };
    this.sportsInput = '';
  }

  editSite(site: Site): void {
    this.editingSite = site;
    this.editSiteData = {
      site_name: site.site_name,
      club_name: site.club_name,
      location: {
        city: site.location?.city || '',
        region: site.location?.region || '',
        country: site.location?.country || 'France'
      }
    };
    this.editSportsInput = site.sports?.join(', ') || '';
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingSite = null;
  }

  isEditValid(): boolean {
    return !!(this.editSiteData.site_name && this.editSiteData.club_name &&
              this.editSiteData.location.city && this.editSiteData.location.region);
  }

  saveEditSite(): void {
    if (!this.editingSite || !this.isEditValid()) return;

    const siteData: Partial<Site> = {
      ...this.editSiteData,
      sports: this.editSportsInput ? this.editSportsInput.split(',').map(s => s.trim()) : []
    };

    this.sitesService.updateSite(this.editingSite.id, siteData).subscribe({
      next: () => {
        this.closeEditModal();
        this.loadSites();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Site update failed', { error: message, siteId: this.editingSite?.id });
        this.notificationService.error(`Erreur lors de la modification du site: ${message}`, {
          correlationId: ErrorExtractor.getCorrelationId(error)
        });
      }
    });
  }

  duplicateSite(site: Site): void {
    // Les sites Pi sont créés depuis le terminal du Pi (register-site.js), pas depuis le dashboard.
    // La duplication crée toujours un site SaaS, même si la source est un Pi.
    const targetType: 'pi' | 'saas' = 'saas';

    const sourceLabel = site.site_type === 'saas' ? 'SaaS' : 'Pi';
    const confirmMessage = site.site_type !== 'saas'
      ? `Dupliquer le site "${site.club_name}" (${sourceLabel}) en site SaaS ?\n\nLa configuration sera copiée. Pour un site Pi, provisionnez un boîtier via setup-new-club.sh puis copiez la config depuis la fiche site.`
      : `Dupliquer le site "${site.club_name}" ?\n\nUn nouveau site SaaS sera créé avec la même configuration.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    const newSiteData: Partial<Site> = {
      site_name: `${site.site_name} (copie)`,
      club_name: `${site.club_name} (copie)`,
      location: site.location || { city: '', region: '', country: 'France' },
      sports: site.sports || [],
      site_type: targetType,
    };

    this.sitesService.createSite(newSiteData).subscribe({
      next: (newSite: Site) => {
        // Copier la configuration du site source vers le nouveau site
        this.sitesService.copyConfig(site.id, newSite.id).subscribe({
          next: () => {
            this.notificationService.success(`Site SaaS "${newSiteData.club_name}" créé avec la configuration copiée`);
            this.loadSites();
          },
          error: (error) => {
            // Le site est créé mais la config n'a pas été copiée
            const message = ErrorExtractor.getMessage(error);
            this.logger.warn('Site created but config copy failed', { error: message, sourceSiteId: site.id, newSiteId: newSite.id });
            this.notificationService.warning(`Site créé mais la copie de configuration a échoué : ${message}`);
            this.loadSites();
          }
        });
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Site duplication failed', { error: message, siteId: site.id });
        this.notificationService.error(`Erreur lors de la duplication : ${message}`, {
          correlationId: ErrorExtractor.getCorrelationId(error)
        });
      }
    });
  }

  deleteSite(site: Site): void {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le site "${site.club_name}" ?`)) {
      this.sitesService.deleteSite(site.id).subscribe({
        next: () => {
          this.loadSites();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.logger.error('Site deletion failed', { error: message, siteId: site.id });
          this.notificationService.error(`Erreur lors de la suppression: ${message}`, {
            correlationId: ErrorExtractor.getCorrelationId(error)
          });
        }
      });
    }
  }

  refreshMap(): void {
    // Wait for the map component to be rendered
    setTimeout(() => {
      this.sitesMap?.refreshMarkers();
    }, 100);
  }
}
