/**
 * SubscriptionsManagementComponent
 *
 * Page de gestion centralisée des abonnements Neopro
 * Accessible via /subscriptions pour les admin/super_admin
 */
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, interval } from 'rxjs';
import { takeUntil, startWith, switchMap } from 'rxjs/operators';

import { SubscriptionService } from '../../core/services/subscription.service';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { SubscriptionBadgeComponent } from '../../shared/components/subscription-badge/subscription-badge.component';
import {
  SubscriptionStats,
  SiteAtRisk,
  SuspensionReasonInfo,
  Site,
  SubscriptionDisplayStatus,
  LicenseStatus
} from '../../core/models';

@Component({
  selector: 'app-subscriptions-management',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SubscriptionBadgeComponent],
  template: `
    <div class="subscriptions-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1>Gestion des Abonnements</h1>
          <p class="subtitle">Vue d'ensemble et gestion centralisée des licences Neopro</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="refreshData()">
            <span class="icon">🔄</span> Actualiser
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid" *ngIf="stats">
        <div class="stat-card stat-total">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.total_sites }}</span>
            <span class="stat-label">Sites total</span>
          </div>
        </div>

        <div class="stat-card stat-active">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.active_sites }}</span>
            <span class="stat-label">Actifs</span>
          </div>
        </div>

        <div class="stat-card stat-warning">
          <div class="stat-icon">⚠️</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.expiring_soon }}</span>
            <span class="stat-label">Expire bientôt (30j)</span>
          </div>
        </div>

        <div class="stat-card stat-grace">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.grace_period }}</span>
            <span class="stat-label">Période de grâce</span>
          </div>
        </div>

        <div class="stat-card stat-suspended">
          <div class="stat-icon">🚫</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.suspended_sites }}</span>
            <span class="stat-label">Suspendus</span>
          </div>
        </div>

        <div class="stat-card stat-trial">
          <div class="stat-icon">🎁</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.trial_sites }}</span>
            <span class="stat-label">En essai</span>
          </div>
        </div>
      </div>

      <!-- Loading stats -->
      <div class="stats-grid loading-grid" *ngIf="!stats && loading">
        <div class="stat-card skeleton" *ngFor="let i of [1,2,3,4,5,6]">
          <div class="skeleton-content"></div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs-container">
        <div class="tabs">
          <button
            class="tab"
            [class.active]="activeTab === 'at-risk'"
            (click)="activeTab = 'at-risk'"
          >
            <span class="tab-icon">⚠️</span>
            Sites à risque
            <span class="tab-badge" *ngIf="sitesAtRisk.length > 0">{{ sitesAtRisk.length }}</span>
          </button>
          <button
            class="tab"
            [class.active]="activeTab === 'all'"
            (click)="activeTab = 'all'; loadAllSites()"
          >
            <span class="tab-icon">📋</span>
            Tous les sites
          </button>
          <button
            class="tab"
            [class.active]="activeTab === 'suspended'"
            (click)="activeTab = 'suspended'; loadSuspendedSites()"
          >
            <span class="tab-icon">🚫</span>
            Suspendus
          </button>
        </div>
      </div>

      <!-- Tab Content: Sites à risque -->
      <div class="tab-content" *ngIf="activeTab === 'at-risk'">
        <div class="section-header">
          <h2>Sites nécessitant une attention</h2>
          <p class="section-description">
            Sites dont l'abonnement expire bientôt, en période de grâce, ou ayant des problèmes de connexion
          </p>
        </div>

        <div class="sites-table" *ngIf="sitesAtRisk.length > 0; else noAtRisk">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Statut</th>
                <th>Expiration</th>
                <th>Risque</th>
                <th>Dernière connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let site of sitesAtRisk" [class]="'risk-' + site.risk_level">
                <td class="site-cell">
                  <a [routerLink]="['/sites', site.id]" class="site-link">
                    <strong>{{ site.club_name || site.site_name }}</strong>
                  </a>
                  <span class="site-location" *ngIf="site.location?.city">
                    {{ site.location?.city }}
                  </span>
                </td>
                <td>
                  <app-subscription-badge
                    [subscriptionEnd]="site.subscription_end"
                    [plan]="site.subscription_plan"
                    [suspended]="site.suspended"
                    [suspensionReason]="site.suspension_reason"
                    [showText]="true"
                  ></app-subscription-badge>
                </td>
                <td>
                  <span *ngIf="site.subscription_end">
                    {{ site.subscription_end | date:'dd/MM/yyyy' }}
                  </span>
                  <span class="text-muted" *ngIf="!site.subscription_end">Non définie</span>
                </td>
                <td>
                  <span class="risk-badge" [class]="'risk-' + site.risk_level">
                    {{ getRiskLabel(site.risk_level) }}
                  </span>
                  <span class="risk-reason">{{ site.risk_reason || '' }}</span>
                </td>
                <td>
                  <span *ngIf="site.last_seen_at">
                    {{ getRelativeTime(site.last_seen_at) }}
                  </span>
                  <span class="text-muted" *ngIf="!site.last_seen_at">Jamais</span>
                </td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-primary" (click)="openExtendModal(site)" title="Prolonger">
                    📅
                  </button>
                  <button
                    class="btn btn-sm btn-warning"
                    *ngIf="!site.suspended"
                    (click)="openSuspendModal(site)"
                    title="Suspendre"
                  >
                    🚫
                  </button>
                  <button
                    class="btn btn-sm btn-success"
                    *ngIf="site.suspended"
                    (click)="openReactivateModal(site)"
                    title="Réactiver"
                  >
                    ✅
                  </button>
                  <a [routerLink]="['/sites', site.id]" class="btn btn-sm btn-secondary" title="Voir détails">
                    👁️
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ng-template #noAtRisk>
          <div class="empty-state">
            <div class="empty-icon">🎉</div>
            <h3>Aucun site à risque</h3>
            <p>Tous les abonnements sont en règle</p>
          </div>
        </ng-template>
      </div>

      <!-- Tab Content: Tous les sites -->
      <div class="tab-content" *ngIf="activeTab === 'all'">
        <div class="section-header">
          <h2>Tous les sites</h2>
          <div class="filters">
            <select [(ngModel)]="filterStatus" (change)="applyFilters()">
              <option value="">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="expiring_soon">Expire bientôt</option>
              <option value="grace_period">Période de grâce</option>
              <option value="suspended">Suspendus</option>
              <option value="blocked">Bloqués</option>
              <option value="trial">En essai</option>
            </select>
            <select [(ngModel)]="filterPlan" (change)="applyFilters()">
              <option value="">Tous les plans</option>
              <option value="trial">Trial</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="applyFilters()"
              placeholder="Rechercher un site..."
              class="search-input"
            />
          </div>
        </div>

        <div class="sites-table" *ngIf="filteredSites.length > 0; else noSites">
          <table>
            <thead>
              <tr>
                <th (click)="sortBy('club_name')" class="sortable">
                  Site
                  <span class="sort-icon" *ngIf="sortColumn === 'club_name'">
                    {{ sortDirection === 'asc' ? '↑' : '↓' }}
                  </span>
                </th>
                <th (click)="sortBy('subscription_plan')" class="sortable">
                  Plan
                  <span class="sort-icon" *ngIf="sortColumn === 'subscription_plan'">
                    {{ sortDirection === 'asc' ? '↑' : '↓' }}
                  </span>
                </th>
                <th>Statut</th>
                <th (click)="sortBy('subscription_end')" class="sortable">
                  Expiration
                  <span class="sort-icon" *ngIf="sortColumn === 'subscription_end'">
                    {{ sortDirection === 'asc' ? '↑' : '↓' }}
                  </span>
                </th>
                <th>Connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let site of filteredSites">
                <td class="site-cell">
                  <a [routerLink]="['/sites', site.id]" class="site-link">
                    <strong>{{ site.club_name || site.site_name }}</strong>
                  </a>
                </td>
                <td>
                  <span class="plan-badge" [class]="'plan-' + (site.subscription_plan || 'standard')">
                    {{ getPlanLabel(site.subscription_plan) }}
                  </span>
                </td>
                <td>
                  <app-subscription-badge
                    [subscriptionEnd]="site.subscription_end ?? null"
                    [plan]="site.subscription_plan ?? 'standard'"
                    [suspended]="site.suspended ?? false"
                    [suspensionReason]="site.suspension_reason ?? null"
                    [showText]="true"
                  ></app-subscription-badge>
                </td>
                <td>
                  <span *ngIf="site.subscription_end">
                    {{ site.subscription_end | date:'dd/MM/yyyy' }}
                  </span>
                  <span class="text-muted" *ngIf="!site.subscription_end">Non définie</span>
                </td>
                <td>
                  <span class="connection-status" [class.online]="site.status === 'online'">
                    {{ site.status === 'online' ? '🟢' : '🔴' }}
                    {{ site.status === 'online' ? 'En ligne' : 'Hors ligne' }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-primary" (click)="openExtendModal(site)" title="Prolonger">
                    📅
                  </button>
                  <button
                    class="btn btn-sm btn-warning"
                    *ngIf="!site.suspended"
                    (click)="openSuspendModal(site)"
                    title="Suspendre"
                  >
                    🚫
                  </button>
                  <button
                    class="btn btn-sm btn-success"
                    *ngIf="site.suspended"
                    (click)="openReactivateModal(site)"
                    title="Réactiver"
                  >
                    ✅
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ng-template #noSites>
          <div class="empty-state" *ngIf="!loadingAllSites">
            <div class="empty-icon">🔍</div>
            <h3>Aucun site trouvé</h3>
            <p>Modifiez vos filtres pour voir plus de résultats</p>
          </div>
          <div class="loading-state" *ngIf="loadingAllSites">
            <div class="spinner"></div>
            <p>Chargement des sites...</p>
          </div>
        </ng-template>
      </div>

      <!-- Tab Content: Suspendus -->
      <div class="tab-content" *ngIf="activeTab === 'suspended'">
        <div class="section-header">
          <h2>Sites suspendus</h2>
          <p class="section-description">
            Sites actuellement suspendus et bloqués
          </p>
        </div>

        <div class="sites-table" *ngIf="suspendedSites.length > 0; else noSuspended">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Motif</th>
                <th>Date suspension</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let site of suspendedSites">
                <td class="site-cell">
                  <a [routerLink]="['/sites', site.id]" class="site-link">
                    <strong>{{ site.club_name || site.site_name }}</strong>
                  </a>
                </td>
                <td>
                  <span class="reason-badge">
                    {{ getReasonLabel(site.suspension_reason) }}
                  </span>
                </td>
                <td>
                  <span *ngIf="site.suspension_date">
                    {{ site.suspension_date | date:'dd/MM/yyyy HH:mm' }}
                  </span>
                </td>
                <td class="note-cell">
                  <span class="note-text" *ngIf="site.suspension_note">
                    {{ site.suspension_note }}
                  </span>
                  <span class="text-muted" *ngIf="!site.suspension_note">-</span>
                </td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-success" (click)="openReactivateModal(site)" title="Réactiver">
                    ✅ Réactiver
                  </button>
                  <a [routerLink]="['/sites', site.id]" class="btn btn-sm btn-secondary" title="Voir détails">
                    👁️
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ng-template #noSuspended>
          <div class="empty-state" *ngIf="!loadingSuspended">
            <div class="empty-icon">✅</div>
            <h3>Aucun site suspendu</h3>
            <p>Tous les sites sont actifs</p>
          </div>
          <div class="loading-state" *ngIf="loadingSuspended">
            <div class="spinner"></div>
            <p>Chargement...</p>
          </div>
        </ng-template>
      </div>

      <!-- Modal: Prolonger -->
      <div class="modal-overlay" *ngIf="showExtendModal" (click)="closeModals()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Prolonger l'abonnement</h3>
            <button class="modal-close" (click)="closeModals()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-site-name">{{ selectedSite?.club_name || selectedSite?.site_name }}</p>

            <div class="form-group">
              <label>Nouvelle date d'expiration</label>
              <input type="date" [(ngModel)]="extendForm.newEndDate" class="form-control" />
            </div>

            <div class="form-group">
              <label>Raccourcis</label>
              <div class="date-shortcuts">
                <button class="btn btn-outline" (click)="setExtendDate(1)">+1 mois</button>
                <button class="btn btn-outline" (click)="setExtendDate(3)">+3 mois</button>
                <button class="btn btn-outline" (click)="setExtendDate(6)">+6 mois</button>
                <button class="btn btn-outline" (click)="setExtendDate(12)">+1 an</button>
              </div>
            </div>

            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea
                [(ngModel)]="extendForm.note"
                class="form-control"
                placeholder="Raison de la prolongation..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModals()">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="submitExtend()"
              [disabled]="!extendForm.newEndDate || submitting"
            >
              {{ submitting ? 'Prolongation...' : 'Prolonger' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Suspendre -->
      <div class="modal-overlay" *ngIf="showSuspendModal" (click)="closeModals()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Suspendre le site</h3>
            <button class="modal-close" (click)="closeModals()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-site-name">{{ selectedSite?.club_name || selectedSite?.site_name }}</p>

            <div class="warning-box">
              <span class="warning-icon">⚠️</span>
              <p>La suspension bloquera immédiatement l'accès à /tv et /remote sur ce site.</p>
            </div>

            <div class="form-group">
              <label>Motif de suspension *</label>
              <select [(ngModel)]="suspendForm.reason" class="form-control" required>
                <option value="">Sélectionner un motif...</option>
                <option *ngFor="let reason of suspensionReasons" [value]="reason.code">
                  {{ reason.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea
                [(ngModel)]="suspendForm.note"
                class="form-control"
                placeholder="Détails supplémentaires..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModals()">Annuler</button>
            <button
              class="btn btn-danger"
              (click)="submitSuspend()"
              [disabled]="!suspendForm.reason || submitting"
            >
              {{ submitting ? 'Suspension...' : 'Suspendre' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Réactiver -->
      <div class="modal-overlay" *ngIf="showReactivateModal" (click)="closeModals()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Réactiver le site</h3>
            <button class="modal-close" (click)="closeModals()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-site-name">{{ selectedSite?.club_name || selectedSite?.site_name }}</p>

            <div class="info-box">
              <p><strong>Motif de suspension :</strong> {{ getReasonLabel(selectedSite?.suspension_reason) }}</p>
              <p *ngIf="selectedSite?.suspension_note"><strong>Note :</strong> {{ selectedSite?.suspension_note }}</p>
            </div>

            <div class="form-group">
              <label>
                <input type="checkbox" [(ngModel)]="reactivateForm.extendSubscription" />
                Prolonger l'abonnement lors de la réactivation
              </label>
            </div>

            <div class="form-group" *ngIf="reactivateForm.extendSubscription">
              <label>Nouvelle date d'expiration</label>
              <input type="date" [(ngModel)]="reactivateForm.newEndDate" class="form-control" />
              <div class="date-shortcuts">
                <button class="btn btn-outline btn-sm" (click)="setReactivateDate(1)">+1 mois</button>
                <button class="btn btn-outline btn-sm" (click)="setReactivateDate(3)">+3 mois</button>
                <button class="btn btn-outline btn-sm" (click)="setReactivateDate(12)">+1 an</button>
              </div>
            </div>

            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea
                [(ngModel)]="reactivateForm.note"
                class="form-control"
                placeholder="Raison de la réactivation..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModals()">Annuler</button>
            <button
              class="btn btn-success"
              (click)="submitReactivate()"
              [disabled]="submitting || (reactivateForm.extendSubscription && !reactivateForm.newEndDate)"
            >
              {{ submitting ? 'Réactivation...' : 'Réactiver' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .subscriptions-page {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-content h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 600;
      color: #1a1a2e;
    }

    .subtitle {
      margin: 0;
      color: #666;
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid #e8e8e8;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .stat-icon {
      font-size: 32px;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }

    .stat-total .stat-value { color: #1a1a2e; }
    .stat-active .stat-value { color: #10b981; }
    .stat-warning .stat-value { color: #f59e0b; }
    .stat-grace .stat-value { color: #6366f1; }
    .stat-suspended .stat-value { color: #ef4444; }
    .stat-trial .stat-value { color: #8b5cf6; }

    /* Loading skeleton */
    .loading-grid .stat-card {
      min-height: 88px;
    }

    .skeleton {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Tabs */
    .tabs-container {
      margin-bottom: 24px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      background: #f5f5f5;
      padding: 4px;
      border-radius: 12px;
    }

    .tab {
      flex: 1;
      padding: 12px 20px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }

    .tab:hover {
      color: #333;
      background: rgba(255,255,255,0.5);
    }

    .tab.active {
      background: white;
      color: #1a1a2e;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .tab-badge {
      background: #ef4444;
      color: white;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }

    /* Section Header */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
    }

    .section-description {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #666;
    }

    /* Filters */
    .filters {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .filters select,
    .filters .search-input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      background: white;
    }

    .filters .search-input {
      width: 200px;
    }

    /* Table */
    .sites-table {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid #e8e8e8;
    }

    .sites-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .sites-table th {
      background: #f8f9fa;
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #666;
      border-bottom: 1px solid #e8e8e8;
    }

    .sites-table th.sortable {
      cursor: pointer;
      user-select: none;
    }

    .sites-table th.sortable:hover {
      background: #f0f0f0;
    }

    .sort-icon {
      margin-left: 4px;
      opacity: 0.7;
    }

    .sites-table td {
      padding: 14px 16px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }

    .sites-table tr:last-child td {
      border-bottom: none;
    }

    .sites-table tr:hover {
      background: #fafafa;
    }

    .sites-table tr.risk-high {
      background: #fef2f2;
    }

    .sites-table tr.risk-high:hover {
      background: #fee2e2;
    }

    .sites-table tr.risk-medium {
      background: #fffbeb;
    }

    .sites-table tr.risk-medium:hover {
      background: #fef3c7;
    }

    /* Site cell */
    .site-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .site-link {
      color: #1a1a2e;
      text-decoration: none;
    }

    .site-link:hover {
      color: #6366f1;
      text-decoration: underline;
    }

    .site-location {
      font-size: 12px;
      color: #888;
    }

    /* Badges */
    .plan-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }

    .plan-trial { background: #ede9fe; color: #7c3aed; }
    .plan-standard { background: #e0f2fe; color: #0284c7; }
    .plan-premium { background: #fef3c7; color: #d97706; }

    .risk-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .risk-badge.risk-high { background: #fee2e2; color: #dc2626; }
    .risk-badge.risk-medium { background: #fef3c7; color: #d97706; }
    .risk-badge.risk-low { background: #dbeafe; color: #2563eb; }

    .risk-reason {
      display: block;
      font-size: 11px;
      color: #888;
      margin-top: 2px;
    }

    .reason-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      background: #fee2e2;
      color: #dc2626;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    /* Actions */
    .actions-cell {
      white-space: nowrap;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-sm {
      padding: 6px 10px;
      font-size: 13px;
    }

    .btn-primary { background: #6366f1; color: white; }
    .btn-primary:hover { background: #4f46e5; }

    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }

    .btn-success { background: #10b981; color: white; }
    .btn-success:hover { background: #059669; }

    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover { background: #d97706; }

    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }

    .btn-outline {
      background: white;
      border: 1px solid #ddd;
      color: #666;
    }

    .btn-outline:hover {
      background: #f5f5f5;
      border-color: #ccc;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      background: white;
      border-radius: 12px;
      border: 1px solid #e8e8e8;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      color: #1a1a2e;
    }

    .empty-state p {
      margin: 0;
      color: #666;
    }

    /* Loading state */
    .loading-state {
      text-align: center;
      padding: 60px 20px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #f0f0f0;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Modals */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal {
      background: white;
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e8e8e8;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .modal-close {
      width: 32px;
      height: 32px;
      border: none;
      background: #f5f5f5;
      border-radius: 8px;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
    }

    .modal-close:hover {
      background: #e8e8e8;
    }

    .modal-body {
      padding: 24px;
    }

    .modal-site-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 20px 0;
      padding-bottom: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e8e8e8;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    /* Form elements */
    .form-group {
      margin-bottom: 20px;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }

    .form-control {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .form-control:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    textarea.form-control {
      resize: vertical;
      min-height: 80px;
    }

    .date-shortcuts {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    /* Alert boxes */
    .warning-box {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .warning-icon {
      font-size: 20px;
    }

    .warning-box p {
      margin: 0;
      font-size: 14px;
      color: #92400e;
    }

    .info-box {
      padding: 16px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .info-box p {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #0369a1;
    }

    .info-box p:last-child {
      margin-bottom: 0;
    }

    /* Text utilities */
    .text-muted {
      color: #999;
    }

    .note-cell {
      max-width: 200px;
    }

    .note-text {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 13px;
      color: #666;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .subscriptions-page {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
        gap: 16px;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .tabs {
        flex-direction: column;
      }

      .section-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .filters {
        flex-wrap: wrap;
        width: 100%;
      }

      .filters select,
      .filters .search-input {
        flex: 1;
        min-width: 150px;
      }

      .sites-table {
        overflow-x: auto;
      }

      .sites-table table {
        min-width: 800px;
      }
    }
  `]
})
export class SubscriptionsManagementComponent implements OnInit, OnDestroy {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);
  private destroy$ = new Subject<void>();

  // State
  loading = true;
  loadingAllSites = false;
  loadingSuspended = false;
  submitting = false;

  // Data
  stats: SubscriptionStats | null = null;
  sitesAtRisk: SiteAtRisk[] = [];
  allSites: Site[] = [];
  filteredSites: Site[] = [];
  suspendedSites: Site[] = [];
  suspensionReasons: SuspensionReasonInfo[] = [];

  // Tab
  activeTab: 'at-risk' | 'all' | 'suspended' = 'at-risk';

  // Filters
  filterStatus = '';
  filterPlan = '';
  searchQuery = '';
  sortColumn = 'subscription_end';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Modals
  showExtendModal = false;
  showSuspendModal = false;
  showReactivateModal = false;
  selectedSite: Site | SiteAtRisk | null = null;

  // Forms
  extendForm = {
    newEndDate: '',
    note: ''
  };

  suspendForm = {
    reason: '',
    note: ''
  };

  reactivateForm = {
    extendSubscription: false,
    newEndDate: '',
    note: ''
  };

  ngOnInit(): void {
    this.loadInitialData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    this.loading = true;

    forkJoin({
      stats: this.subscriptionService.getSubscriptionStats(),
      sitesAtRisk: this.subscriptionService.getSitesAtRisk(),
      reasons: this.subscriptionService.getSuspensionReasons()
    }).subscribe({
      next: (data) => {
        this.stats = data.stats;
        this.sitesAtRisk = data.sitesAtRisk.data || [];
        this.suspensionReasons = data.reasons;
        this.loading = false;
      },
      error: (error) => {
        this.notificationService.error('Erreur lors du chargement des données');
        this.loading = false;
      }
    });
  }

  private startAutoRefresh(): void {
    interval(60000) // Refresh toutes les minutes
      .pipe(
        takeUntil(this.destroy$),
        startWith(0),
        switchMap(() => this.subscriptionService.getSubscriptionStats())
      )
      .subscribe({
        next: (stats) => {
          this.stats = stats;
        }
      });
  }

  refreshData(): void {
    this.loadInitialData();
    if (this.activeTab === 'all') {
      this.loadAllSites();
    } else if (this.activeTab === 'suspended') {
      this.loadSuspendedSites();
    }
  }

  loadAllSites(): void {
    if (this.allSites.length > 0) {
      return; // Déjà chargé
    }

    this.loadingAllSites = true;
    this.sitesService.loadSites({ limit: 1000 }).subscribe({
      next: (response: { sites: Site[]; total: number }) => {
        this.allSites = response.sites || [];
        this.applyFilters();
        this.loadingAllSites = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors du chargement des sites');
        this.loadingAllSites = false;
      }
    });
  }

  loadSuspendedSites(): void {
    this.loadingSuspended = true;
    this.sitesService.loadSites({ subscription: 'suspended', limit: 1000 }).subscribe({
      next: (response: { sites: Site[]; total: number }) => {
        this.suspendedSites = response.sites || [];
        this.loadingSuspended = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors du chargement des sites suspendus');
        this.loadingSuspended = false;
      }
    });
  }

  applyFilters(): void {
    let sites = [...this.allSites];

    // Filtre par statut
    if (this.filterStatus) {
      sites = sites.filter(site => {
        const status = this.getSubscriptionDisplayStatus(site);
        return status === this.filterStatus;
      });
    }

    // Filtre par plan
    if (this.filterPlan) {
      sites = sites.filter(site => site.subscription_plan === this.filterPlan);
    }

    // Recherche
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      sites = sites.filter(site =>
        (site.club_name || '').toLowerCase().includes(query) ||
        (site.site_name || '').toLowerCase().includes(query)
      );
    }

    // Tri
    sites.sort((a, b) => {
      let aVal: any = a[this.sortColumn as keyof Site];
      let bVal: any = b[this.sortColumn as keyof Site];

      if (this.sortColumn === 'subscription_end') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.filteredSites = sites;
  }

  sortBy(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  getSubscriptionDisplayStatus(site: Site): SubscriptionDisplayStatus {
    if (site.suspended) {
      return 'suspended';
    }

    if (!site.subscription_end) {
      return site.subscription_plan === 'trial' ? 'trial' : 'unknown';
    }

    const endDate = new Date(site.subscription_end);
    const now = new Date();
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < -7) return 'blocked';
    if (daysLeft < 0) return 'grace_period';
    if (daysLeft <= 30) return 'expiring_soon';
    return 'active';
  }

  // Labels
  getPlanLabel(plan: string | undefined): string {
    const labels: Record<string, string> = {
      'trial': 'Essai',
      'standard': 'Standard',
      'premium': 'Premium'
    };
    return labels[plan || 'standard'] || 'Standard';
  }

  getRiskLabel(level: string): string {
    const labels: Record<string, string> = {
      'high': 'Critique',
      'medium': 'Attention',
      'low': 'Info'
    };
    return labels[level] || level;
  }

  getReasonLabel(reason: string | null | undefined): string {
    if (!reason) return '-';
    const found = this.suspensionReasons.find(r => r.code === reason);
    return found?.label || reason;
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays === 1) return 'Hier';
    return `Il y a ${diffDays} jours`;
  }

  // Modals
  openExtendModal(site: Site | SiteAtRisk): void {
    this.selectedSite = site;
    this.extendForm = {
      newEndDate: site.subscription_end
        ? new Date(site.subscription_end).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      note: ''
    };
    this.showExtendModal = true;
  }

  openSuspendModal(site: Site | SiteAtRisk): void {
    this.selectedSite = site;
    this.suspendForm = { reason: '', note: '' };
    this.showSuspendModal = true;
  }

  openReactivateModal(site: Site | SiteAtRisk): void {
    this.selectedSite = site;
    this.reactivateForm = {
      extendSubscription: false,
      newEndDate: '',
      note: ''
    };
    this.showReactivateModal = true;
  }

  closeModals(): void {
    this.showExtendModal = false;
    this.showSuspendModal = false;
    this.showReactivateModal = false;
    this.selectedSite = null;
  }

  // Date shortcuts
  setExtendDate(months: number): void {
    const date = new Date(this.extendForm.newEndDate || new Date());
    date.setMonth(date.getMonth() + months);
    this.extendForm.newEndDate = date.toISOString().split('T')[0];
  }

  setReactivateDate(months: number): void {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    this.reactivateForm.newEndDate = date.toISOString().split('T')[0];
  }

  // Submit actions
  submitExtend(): void {
    if (!this.selectedSite || !this.extendForm.newEndDate) return;

    this.submitting = true;
    this.subscriptionService.extendSubscription(this.selectedSite.id, {
      new_end_date: this.extendForm.newEndDate,
      note: this.extendForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Abonnement prolongé avec succès');
        this.closeModals();
        this.refreshData();
        this.submitting = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors de la prolongation');
        this.submitting = false;
      }
    });
  }

  submitSuspend(): void {
    if (!this.selectedSite || !this.suspendForm.reason) return;

    this.submitting = true;
    this.subscriptionService.suspendSite(this.selectedSite.id, {
      reason: this.suspendForm.reason as any,
      note: this.suspendForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Site suspendu avec succès');
        this.closeModals();
        this.refreshData();
        this.submitting = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors de la suspension');
        this.submitting = false;
      }
    });
  }

  submitReactivate(): void {
    if (!this.selectedSite) return;
    if (this.reactivateForm.extendSubscription && !this.reactivateForm.newEndDate) return;

    this.submitting = true;
    this.subscriptionService.reactivateSite(this.selectedSite.id, {
      new_end_date: this.reactivateForm.extendSubscription ? this.reactivateForm.newEndDate : undefined,
      note: this.reactivateForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Site réactivé avec succès');
        this.closeModals();
        this.refreshData();
        this.submitting = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors de la réactivation');
        this.submitting = false;
      }
    });
  }
}
