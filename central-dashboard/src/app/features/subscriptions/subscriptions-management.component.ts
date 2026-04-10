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
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith, switchMap } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';

import { NotificationService } from '../../core/services/notification.service';
import { SubscriptionBadgeComponent } from '../../shared/components/subscription-badge/subscription-badge.component';
import {
  SubscriptionStats,
  SiteAtRisk,
  SuspensionReasonInfo,
  SuspensionReason,
  Site,
  SubscriptionDisplayStatus,
} from '../../core/models';
import { SubscriptionsManagementDataService } from './subscriptions-management.data.service';

@Component({
  selector: 'app-subscriptions-management',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, SubscriptionBadgeComponent],
  templateUrl: './subscriptions-management.component.html',
  styleUrl: './subscriptions-management.component.scss',
})
export class SubscriptionsManagementComponent implements OnInit, OnDestroy {
  private readonly dataService = inject(SubscriptionsManagementDataService);
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

    this.dataService.loadInitialData().subscribe({
      next: (data) => {
        this.stats = data.stats;
        this.sitesAtRisk = data.sitesAtRisk.data || [];
        this.suspensionReasons = data.reasons;
        this.loading = false;
      },
      error: () => {
        this.notificationService.error('Erreur lors du chargement des données');
        this.loading = false;
      }
    });
  }

  private startAutoRefresh(): void {
    interval(60000)
      .pipe(
        takeUntil(this.destroy$),
        startWith(0),
        switchMap(() => this.dataService.loadStats())
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
      return;
    }

    this.loadingAllSites = true;
    this.dataService.loadAllSites().subscribe({
      next: (response) => {
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
    this.dataService.loadSuspendedSites().subscribe({
      next: (response) => {
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
    this.filteredSites = this.dataService.filterAndSortSites(
      this.allSites,
      { status: this.filterStatus, plan: this.filterPlan, query: this.searchQuery },
      { column: this.sortColumn, direction: this.sortDirection },
    );
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
    return this.dataService.getSubscriptionDisplayStatus(site);
  }

  getPlanLabel(plan: string | undefined): string {
    return this.dataService.getPlanLabel(plan);
  }

  getRiskLabel(level: string): string {
    return this.dataService.getRiskLabel(level);
  }

  getReasonLabel(reason: string | null | undefined): string {
    return this.dataService.getReasonLabel(reason, this.suspensionReasons);
  }

  getRelativeTime(dateStr: string): string {
    return this.dataService.getRelativeTime(dateStr);
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
    this.dataService.updateSubscription(this.selectedSite.id, {
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
    this.dataService.suspendSite(this.selectedSite.id, {
      reason: this.suspendForm.reason as SuspensionReason,
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
    this.dataService.reactivateSite(this.selectedSite.id, {
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
