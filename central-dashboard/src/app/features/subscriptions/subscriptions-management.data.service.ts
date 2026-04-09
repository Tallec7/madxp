import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { SubscriptionService } from '../../core/services/subscription.service';
import { SitesService } from '../../core/services/sites.service';
import {
  SubscriptionStats,
  SiteAtRisk,
  SuspensionReasonInfo,
  Site,
  SubscriptionDisplayStatus,
  UpdateSubscriptionRequest,
  SuspendSiteRequest,
} from '../../core/models';

export interface SubscriptionInitialData {
  stats: SubscriptionStats;
  sitesAtRisk: { data: SiteAtRisk[] };
  reasons: SuspensionReasonInfo[];
}

@Injectable({ providedIn: 'root' })
export class SubscriptionsManagementDataService {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly sitesService = inject(SitesService);

  // ── Data loading ──────────────────────────────────────────────────────────

  loadInitialData(): Observable<SubscriptionInitialData> {
    return forkJoin({
      stats: this.subscriptionService.getSubscriptionStats(),
      sitesAtRisk: this.subscriptionService.getSitesAtRisk(),
      reasons: this.subscriptionService.getSuspensionReasons(),
    });
  }

  loadStats(): Observable<SubscriptionStats> {
    return this.subscriptionService.getSubscriptionStats();
  }

  loadAllSites(limit = 1000): Observable<{ sites: Site[]; total: number }> {
    return this.sitesService.loadSites({ limit });
  }

  loadSuspendedSites(limit = 1000): Observable<{ sites: Site[]; total: number }> {
    return this.sitesService.loadSites({ subscription: 'suspended', limit });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  updateSubscription(siteId: string, data: UpdateSubscriptionRequest): Observable<unknown> {
    return this.subscriptionService.updateSubscription(siteId, data);
  }

  suspendSite(siteId: string, data: SuspendSiteRequest): Observable<unknown> {
    return this.subscriptionService.suspendSite(siteId, data);
  }

  reactivateSite(siteId: string, data: { new_end_date?: string; note?: string }): Observable<unknown> {
    return this.subscriptionService.reactivateSite(siteId, data);
  }

  // ── Business logic helpers ────────────────────────────────────────────────

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

  getPlanLabel(plan: string | undefined): string {
    const labels: Record<string, string> = {
      'trial': 'Essai',
      'standard': 'Standard',
      'premium': 'Premium',
    };
    return labels[plan || 'standard'] || 'Standard';
  }

  getRiskLabel(level: string): string {
    const labels: Record<string, string> = {
      'high': 'Critique',
      'medium': 'Attention',
      'low': 'Info',
    };
    return labels[level] || level;
  }

  getReasonLabel(reason: string | null | undefined, suspensionReasons: SuspensionReasonInfo[]): string {
    if (!reason) return '-';
    const found = suspensionReasons.find(r => r.code === reason);
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

  // ── Filtering / Sorting ───────────────────────────────────────────────────

  filterAndSortSites(
    allSites: Site[],
    filters: { status: string; plan: string; query: string },
    sort: { column: string; direction: 'asc' | 'desc' },
  ): Site[] {
    let sites = [...allSites];

    if (filters.status) {
      sites = sites.filter(site => this.getSubscriptionDisplayStatus(site) === filters.status);
    }

    if (filters.plan) {
      sites = sites.filter(site => site.subscription_plan === filters.plan);
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      sites = sites.filter(site =>
        (site.club_name || '').toLowerCase().includes(query) ||
        (site.site_name || '').toLowerCase().includes(query),
      );
    }

    sites.sort((a, b) => {
      let aVal: string | number | Date | null = a[sort.column as keyof Site] as string | number | Date | null;
      let bVal: string | number | Date | null = b[sort.column as keyof Site] as string | number | Date | null;

      if (sort.column === 'subscription_end') {
        aVal = aVal ? new Date(aVal as string).getTime() : 0;
        bVal = bVal ? new Date(bVal as string).getTime() : 0;
      }

      if ((aVal ?? '') < (bVal ?? '')) return sort.direction === 'asc' ? -1 : 1;
      if ((aVal ?? '') > (bVal ?? '')) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sites;
  }
}
