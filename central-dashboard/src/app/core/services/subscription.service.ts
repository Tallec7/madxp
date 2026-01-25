/**
 * SubscriptionService
 *
 * Service Angular pour la gestion des abonnements Neopro
 * Communique avec l'API /api/subscriptions et /api/sites/:id/subscription
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SiteSubscription,
  LicenseStatusResponse,
  SubscriptionHistoryEntry,
  SubscriptionStats,
  SiteAtRisk,
  SuspensionReasonInfo,
  ExtendSubscriptionRequest,
  SuspendSiteRequest,
  ReactivateSiteRequest,
  ChangePlanRequest,
  UpdateSubscriptionRequest,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // ============================================================================
  // Global Subscription Management
  // ============================================================================

  /**
   * Récupère les statistiques globales des abonnements
   */
  getSubscriptionStats(): Observable<SubscriptionStats> {
    return this.http.get<SubscriptionStats>(`${this.apiUrl}/subscriptions/stats`);
  }

  /**
   * Récupère la liste des sites à risque (expire bientôt, suspendus, etc.)
   */
  getSitesAtRisk(limit = 100): Observable<{ data: SiteAtRisk[]; total: number }> {
    return this.http.get<{ data: SiteAtRisk[]; total: number }>(
      `${this.apiUrl}/subscriptions/at-risk`,
      { params: { limit: limit.toString() } }
    );
  }

  /**
   * Récupère la liste des motifs de suspension
   */
  getSuspensionReasons(): Observable<SuspensionReasonInfo[]> {
    return this.http.get<SuspensionReasonInfo[]>(`${this.apiUrl}/subscriptions/reasons`);
  }

  // ============================================================================
  // Site-specific Subscription Management
  // ============================================================================

  /**
   * Récupère les détails d'abonnement d'un site
   */
  getSiteSubscription(siteId: string): Observable<SiteSubscription> {
    return this.http.get<SiteSubscription>(`${this.apiUrl}/sites/${siteId}/subscription`);
  }

  /**
   * Récupère l'historique des changements d'abonnement d'un site
   */
  getSubscriptionHistory(
    siteId: string,
    limit = 50
  ): Observable<{ data: SubscriptionHistoryEntry[]; total: number }> {
    return this.http.get<{ data: SubscriptionHistoryEntry[]; total: number }>(
      `${this.apiUrl}/sites/${siteId}/subscription/history`,
      { params: { limit: limit.toString() } }
    );
  }

  /**
   * Récupère le statut de licence calculé d'un site (pour debug/preview)
   */
  getLicenseStatus(siteId: string): Observable<LicenseStatusResponse> {
    return this.http.get<LicenseStatusResponse>(
      `${this.apiUrl}/sites/${siteId}/subscription/license-status`
    );
  }

  /**
   * Prolonge l'abonnement d'un site
   */
  extendSubscription(
    siteId: string,
    data: ExtendSubscriptionRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/sites/${siteId}/subscription/extend`,
      data
    );
  }

  /**
   * Suspend un site
   */
  suspendSite(
    siteId: string,
    data: SuspendSiteRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/sites/${siteId}/subscription/suspend`,
      data
    );
  }

  /**
   * Réactive un site suspendu
   */
  reactivateSite(
    siteId: string,
    data: ReactivateSiteRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/sites/${siteId}/subscription/reactivate`,
      data
    );
  }

  /**
   * Change le plan d'abonnement d'un site
   */
  changePlan(
    siteId: string,
    data: ChangePlanRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/sites/${siteId}/subscription/plan`,
      data
    );
  }

  /**
   * Configure l'abonnement d'un site (date début, date fin, plan)
   * Permet de tout mettre à jour en une seule opération
   */
  updateSubscription(
    siteId: string,
    data: UpdateSubscriptionRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/sites/${siteId}/subscription`,
      data
    );
  }
}
