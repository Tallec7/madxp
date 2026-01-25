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
import { TranslateModule } from '@ngx-translate/core';

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
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, SubscriptionBadgeComponent],
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

      <!-- Stats Cards avec barres gradient -->
      <div class="stats-grid" *ngIf="stats">
        <div class="stat-card stat-total">
          <div class="stat-inner">
            <div class="stat-icon">📊</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.total_sites }}</span>
              <span class="stat-label">Sites total</span>
            </div>
          </div>
        </div>

        <div class="stat-card stat-active">
          <div class="stat-inner">
            <div class="stat-icon">✅</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.active_sites }}</span>
              <span class="stat-label">Actifs</span>
            </div>
          </div>
        </div>

        <div class="stat-card stat-warning">
          <div class="stat-inner">
            <div class="stat-icon">⚠️</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.expiring_soon }}</span>
              <span class="stat-label">Expire bientôt (30j)</span>
            </div>
          </div>
        </div>

        <div class="stat-card stat-grace">
          <div class="stat-inner">
            <div class="stat-icon">⏳</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.grace_period }}</span>
              <span class="stat-label">Période de grâce</span>
            </div>
          </div>
        </div>

        <div class="stat-card stat-suspended">
          <div class="stat-inner">
            <div class="stat-icon">🚫</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.suspended_sites }}</span>
              <span class="stat-label">Suspendus</span>
            </div>
          </div>
        </div>

        <div class="stat-card stat-trial">
          <div class="stat-inner">
            <div class="stat-icon">🎁</div>
            <div class="stat-content">
              <span class="stat-value">{{ stats.trial_sites }}</span>
              <span class="stat-label">En essai</span>
            </div>
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
                  <button class="btn btn-sm btn-primary" (click)="openConfigModal(site)" title="Configurer">
                    ⚙️
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
              placeholder="{{ 'common.searchPlaceholder' | translate }}"
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
                  <button class="btn btn-sm btn-primary" (click)="openConfigModal(site)" title="Configurer">
                    ⚙️
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

      <!-- Modal: Configurer l'abonnement -->
      <div class="modal-overlay" *ngIf="showConfigModal" (click)="closeModals()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Configurer l'abonnement</h3>
            <button class="modal-close" (click)="closeModals()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-site-name">{{ selectedSite?.club_name || selectedSite?.site_name }}</p>

            <div class="form-group">
              <label>Plan</label>
              <select [(ngModel)]="configForm.plan" class="form-control">
                <option value="trial">Essai</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </div>

            <div class="form-group">
              <label>Date de début</label>
              <input type="date" [(ngModel)]="configForm.startDate" class="form-control" />
            </div>

            <div class="form-group">
              <label>Date de fin</label>
              <input type="date" [(ngModel)]="configForm.endDate" class="form-control" />
              <div class="date-shortcuts">
                <button class="btn btn-outline btn-sm" (click)="setConfigEndDate(1)">+1 mois</button>
                <button class="btn btn-outline btn-sm" (click)="setConfigEndDate(3)">+3 mois</button>
                <button class="btn btn-outline btn-sm" (click)="setConfigEndDate(6)">+6 mois</button>
                <button class="btn btn-outline btn-sm" (click)="setConfigEndDate(12)">+1 an</button>
              </div>
            </div>

            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea
                [(ngModel)]="configForm.note"
                class="form-control"
                placeholder="Raison de la modification..."
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModals()">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="submitConfig()"
              [disabled]="submitting"
            >
              {{ submitting ? 'Enregistrement...' : 'Enregistrer' }}
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
    /* ============================================
       NEOPRO SUBSCRIPTIONS - Premium Design 🎨
       Gradient violet/magenta (#667eea → #764ba2)
       Glassmorphism, shadows colorées, animations
       ============================================ */

    .subscriptions-page {
      padding: 0;
      max-width: 100%;
      margin: 0 auto;
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
    }

    /* ============================================
       HEADER HERO avec Gradient 🎨
       ============================================ */
    .page-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 2.5rem 3rem;
      margin-bottom: 2rem;
      position: relative;
      overflow: hidden;
    }

    .page-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
      border-radius: 50%;
    }

    .page-header::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: 10%;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      border-radius: 50%;
    }

    .header-content {
      position: relative;
      z-index: 1;
    }

    .header-content h1 {
      margin: 0 0 8px 0;
      font-size: 2rem;
      font-weight: 700;
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .subtitle {
      margin: 0;
      color: rgba(255,255,255,0.9);
      font-size: 1rem;
      font-weight: 400;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      position: relative;
      z-index: 1;
    }

    .header-actions .btn-secondary {
      background: rgba(255,255,255,0.2);
      backdrop-filter: blur(10px);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
    }

    .header-actions .btn-secondary:hover {
      background: rgba(255,255,255,0.3);
      transform: translateY(-2px);
    }

    /* ============================================
       STATS GRID avec barres gradient 📊
       ============================================ */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1.25rem;
      margin: -1rem 2rem 2rem 2rem;
      position: relative;
      z-index: 10;
    }

    @media (max-width: 1400px) {
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
    }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); margin: -1rem 1rem 2rem 1rem; }
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 0;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #667eea, #764ba2);
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
    }

    .stat-card .stat-inner {
      padding: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .stat-icon {
      font-size: 2.5rem;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
    }

    .stat-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .stat-value {
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.1;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .stat-label {
      font-size: 0.8125rem;
      color: #64748b;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Stat card color bars */
    .stat-total::before { background: linear-gradient(90deg, #667eea, #764ba2); }
    .stat-active::before { background: linear-gradient(90deg, #10b981, #059669); }
    .stat-warning::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .stat-grace::before { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .stat-suspended::before { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .stat-trial::before { background: linear-gradient(90deg, #ec4899, #be185d); }

    .stat-active .stat-value { background: linear-gradient(135deg, #10b981, #059669); -webkit-background-clip: text; background-clip: text; }
    .stat-warning .stat-value { background: linear-gradient(135deg, #f59e0b, #d97706); -webkit-background-clip: text; background-clip: text; }
    .stat-grace .stat-value { background: linear-gradient(135deg, #8b5cf6, #7c3aed); -webkit-background-clip: text; background-clip: text; }
    .stat-suspended .stat-value { background: linear-gradient(135deg, #ef4444, #dc2626); -webkit-background-clip: text; background-clip: text; }
    .stat-trial .stat-value { background: linear-gradient(135deg, #ec4899, #be185d); -webkit-background-clip: text; background-clip: text; }

    /* Skeleton */
    .loading-grid .stat-card { min-height: 110px; }

    .skeleton {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* ============================================
       TABS - Style Pill avec Glow 💎
       ============================================ */
    .tabs-container {
      margin: 0 2rem 1.5rem 2rem;
      background: white;
      border-radius: 16px;
      padding: 0.75rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      border-bottom: none;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      border: none;
      background: transparent;
      font-size: 0.9375rem;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-radius: 12px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tab:hover {
      color: #667eea;
      background: rgba(102, 126, 234, 0.08);
    }

    .tab.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .tab.active:hover {
      background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
      color: white;
    }

    .tab-icon {
      font-size: 1.125rem;
    }

    .tab-badge {
      background: #ef4444;
      color: white;
      font-size: 0.6875rem;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
      animation: pulse 2s infinite;
    }

    .tab.active .tab-badge {
      background: rgba(255,255,255,0.9);
      color: #ef4444;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    /* ============================================
       TAB CONTENT Container
       ============================================ */
    .tab-content {
      margin: 0 2rem 2rem 2rem;
    }

    /* ============================================
       SECTION HEADER & FILTERS
       ============================================ */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .section-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
    }

    .section-description {
      margin: 4px 0 0 0;
      font-size: 0.875rem;
      color: #64748b;
    }

    .filters {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .filters select,
    .filters .search-input {
      padding: 0.625rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 0.875rem;
      background: white;
      color: #374151;
      transition: all 0.2s ease;
    }

    .filters select:hover,
    .filters .search-input:hover {
      border-color: #cbd5e1;
    }

    .filters select:focus,
    .filters .search-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
    }

    .filters .search-input {
      width: 220px;
    }

    /* ============================================
       TABLE Premium Design 📋
       ============================================ */
    .sites-table {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: none;
    }

    .sites-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .sites-table th {
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 1rem 1.25rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #e2e8f0;
    }

    .sites-table th.sortable {
      cursor: pointer;
      user-select: none;
      transition: all 0.2s;
    }

    .sites-table th.sortable:hover {
      background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
      color: #667eea;
    }

    .sort-icon {
      margin-left: 4px;
      opacity: 0.7;
    }

    .sites-table td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.875rem;
      color: #374151;
    }

    .sites-table tr:last-child td {
      border-bottom: none;
    }

    .sites-table tr {
      transition: all 0.2s;
    }

    .sites-table tr:hover {
      background: linear-gradient(90deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%);
    }

    .sites-table tr.risk-high {
      background: linear-gradient(90deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.03) 100%);
    }

    .sites-table tr.risk-high:hover {
      background: linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
    }

    .sites-table tr.risk-medium {
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.05) 0%, rgba(217, 119, 6, 0.03) 100%);
    }

    .sites-table tr.risk-medium:hover {
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%);
    }

    /* ============================================
       SITE CELL & BADGES
       ============================================ */
    .site-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .site-link {
      color: #1e293b;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.2s;
    }

    .site-link:hover {
      color: #667eea;
    }

    .site-location {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .plan-badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .plan-trial {
      background: linear-gradient(135deg, #fce7f3, #fbcfe8);
      color: #be185d;
    }
    .plan-standard {
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      color: #1d4ed8;
    }
    .plan-premium {
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      color: #b45309;
    }

    .risk-badge {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .risk-badge.risk-high {
      background: linear-gradient(135deg, #fee2e2, #fecaca);
      color: #dc2626;
    }
    .risk-badge.risk-medium {
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      color: #d97706;
    }
    .risk-badge.risk-low {
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      color: #2563eb;
    }

    .risk-reason {
      display: block;
      font-size: 0.6875rem;
      color: #94a3b8;
      margin-top: 3px;
    }

    .reason-badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      background: linear-gradient(135deg, #fee2e2, #fecaca);
      color: #dc2626;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    /* ============================================
       PREMIUM BUTTONS avec Gradients 🎨
       ============================================ */
    .actions-cell {
      white-space: nowrap;
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      position: relative;
      overflow: hidden;
    }

    .btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.5s;
    }

    .btn:hover::before {
      left: 100%;
    }

    .btn-sm {
      padding: 8px 14px;
      font-size: 13px;
      border-radius: 8px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      color: #475569;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .btn-secondary:hover {
      background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
      transform: translateY(-2px);
    }

    .btn-success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    }
    .btn-success:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
    }

    .btn-warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    }
    .btn-warning:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
    }

    .btn-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
    }

    .btn-outline {
      background: white;
      border: 2px solid #e2e8f0;
      color: #64748b;
    }

    .btn-outline:hover {
      border-color: #667eea;
      color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }

    /* ============================================
       EMPTY & LOADING STATES
       ============================================ */
    .empty-state {
      text-align: center;
      padding: 80px 40px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 20px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
    }

    .empty-state h3 {
      margin: 0 0 10px 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
    }

    .empty-state p {
      margin: 0;
      color: #64748b;
      font-size: 0.9375rem;
    }

    .loading-state {
      text-align: center;
      padding: 80px 40px;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #f1f5f9;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ============================================
       MODALS Glassmorphism 🌟
       ============================================ */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      border-radius: 20px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 80px rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.5);
      animation: modalSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes modalSlideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 28px;
      border-bottom: 1px solid rgba(226, 232, 240, 0.8);
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
    }

    .modal-close {
      width: 36px;
      height: 36px;
      border: none;
      background: rgba(241, 245, 249, 0.8);
      border-radius: 10px;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      transition: all 0.2s;
    }

    .modal-close:hover {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      transform: rotate(90deg);
    }

    .modal-body {
      padding: 28px;
    }

    .modal-site-name {
      font-size: 1.125rem;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 24px 0;
      padding-bottom: 20px;
      border-bottom: 2px solid rgba(102, 126, 234, 0.15);
    }

    .modal-footer {
      padding: 20px 28px;
      border-top: 1px solid rgba(226, 232, 240, 0.8);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: linear-gradient(180deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.9) 100%);
      border-radius: 0 0 20px 20px;
    }

    /* ============================================
       FORM ELEMENTS Modern 📝
       ============================================ */
    .form-group {
      margin-bottom: 24px;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 10px;
    }

    .form-control {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      font-size: 0.9375rem;
      color: #1e293b;
      transition: all 0.2s ease;
      background: white;
    }

    .form-control:hover {
      border-color: #cbd5e1;
    }

    .form-control:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
    }

    textarea.form-control {
      resize: vertical;
      min-height: 100px;
    }

    .date-shortcuts {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .date-shortcuts .btn {
      padding: 8px 14px;
      font-size: 0.8125rem;
      font-weight: 600;
    }

    /* ============================================
       ALERT BOXES Soft Gradient 🔔
       ============================================ */
    .warning-box {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 18px 20px;
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
      border: 2px solid rgba(251, 191, 36, 0.3);
      border-radius: 14px;
      margin-bottom: 24px;
    }

    .warning-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .warning-box p {
      margin: 0;
      font-size: 0.875rem;
      color: #92400e;
      line-height: 1.6;
      font-weight: 500;
    }

    .info-box {
      padding: 18px 20px;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.08) 100%);
      border: 2px solid rgba(102, 126, 234, 0.2);
      border-radius: 14px;
      margin-bottom: 24px;
    }

    .info-box p {
      margin: 0 0 10px 0;
      font-size: 0.875rem;
      color: #4338ca;
      font-weight: 500;
    }

    .info-box p:last-child {
      margin-bottom: 0;
    }

    /* ============================================
       TEXT UTILITIES
       ============================================ */
    .text-muted {
      color: #94a3b8;
    }

    .note-cell {
      max-width: 220px;
    }

    .note-text {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }

    /* ============================================
       RESPONSIVE
       ============================================ */
    @media (max-width: 768px) {
      .page-header {
        padding: 2rem 1.5rem;
        flex-direction: column;
        gap: 1rem;
        text-align: center;
      }

      .header-content h1 {
        font-size: 1.5rem;
      }

      .stats-grid {
        margin: -1rem 1rem 1.5rem 1rem;
        gap: 1rem;
      }

      .tabs-container {
        margin: 0 1rem 1.5rem 1rem;
      }

      .tabs {
        flex-direction: column;
        gap: 0.5rem;
      }

      .tab {
        justify-content: center;
      }

      .tab-content {
        margin: 0 1rem 1.5rem 1rem;
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
        min-width: 100%;
      }

      .sites-table {
        overflow-x: auto;
        border-radius: 12px;
      }

      .sites-table table {
        min-width: 800px;
      }

      .actions-cell {
        flex-wrap: wrap;
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
  showConfigModal = false;
  showSuspendModal = false;
  showReactivateModal = false;
  selectedSite: Site | SiteAtRisk | null = null;

  // Forms
  configForm = {
    plan: 'standard' as 'trial' | 'standard' | 'premium',
    startDate: '',
    endDate: '',
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
  openConfigModal(site: Site | SiteAtRisk): void {
    this.selectedSite = site;
    const siteAny = site as any;
    this.configForm = {
      plan: (siteAny.subscription_plan || 'standard') as 'trial' | 'standard' | 'premium',
      startDate: siteAny.subscription_start
        ? new Date(siteAny.subscription_start).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      endDate: site.subscription_end
        ? new Date(site.subscription_end).toISOString().split('T')[0]
        : '',
      note: ''
    };
    this.showConfigModal = true;
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
    this.showConfigModal = false;
    this.showSuspendModal = false;
    this.showReactivateModal = false;
    this.selectedSite = null;
  }

  // Date shortcuts
  setConfigEndDate(months: number): void {
    const baseDate = this.configForm.endDate ? new Date(this.configForm.endDate) : new Date();
    baseDate.setMonth(baseDate.getMonth() + months);
    this.configForm.endDate = baseDate.toISOString().split('T')[0];
  }

  setReactivateDate(months: number): void {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    this.reactivateForm.newEndDate = date.toISOString().split('T')[0];
  }

  // Submit actions
  submitConfig(): void {
    if (!this.selectedSite) return;

    this.submitting = true;
    this.subscriptionService.updateSubscription(this.selectedSite.id, {
      subscription_start: this.configForm.startDate || null,
      subscription_end: this.configForm.endDate || null,
      subscription_plan: this.configForm.plan,
      note: this.configForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Abonnement mis à jour avec succès');
        this.closeModals();
        this.refreshData();
        this.allSites = []; // Force reload
        this.submitting = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors de la mise à jour');
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
