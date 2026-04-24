import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, tap, map, catchError, throwError } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';

export interface SaasProfile {
  id: string;
  name: string;
  displayName: string | null;
  city: string | null;
  sport: string | null;
  isDefault: boolean;
  sortOrder: number;
  pinRequired?: boolean;
}

/**
 * ADR-058 — Erreur typée remontée par loadConfiguration/loadProfileConfiguration
 * quand le serveur renvoie 401 + { pinRequired: true }.
 */
export interface SaasPinRequiredError {
  pinRequired: true;
  profileId?: string;
  siteId?: string;
}

interface SaasConfigResponse {
  siteId: string;
  siteName: string;
  clubName: string;
  sport: string | null;
  featureOverrides?: Record<string, boolean>;
  configuration: Configuration;
  profileId?: string;
  profileName?: string;
}

const SITE_ID_KEY = 'neopro_saas_site_id';
const SELECTED_PROFILE_KEY = 'neopro_saas_selected_profile';

@Injectable({
  providedIn: 'root'
})
export class SaasConfigService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (environment as { apiUrl?: string }).apiUrl || '';

  private selectedConfiguration: Configuration | null = null;
  private siteName: string | null = null;
  private clubName: string | null = null;
  private featureOverrides: Record<string, boolean> = {};

  public isSaasMode(): boolean {
    return !!(environment as { saasMode?: boolean }).saasMode;
  }

  /**
   * Extrait le siteId depuis le query param ?site=xxx
   * et le persiste dans localStorage pour les visites suivantes.
   */
  public getSiteId(): string {
    // D'abord vérifier le query param
    const params = new URLSearchParams(window.location.search);
    const siteIdFromUrl = params.get('site');
    if (siteIdFromUrl) {
      localStorage.setItem(SITE_ID_KEY, siteIdFromUrl);
      return siteIdFromUrl;
    }

    // Sinon, récupérer depuis localStorage
    const stored = localStorage.getItem(SITE_ID_KEY);
    if (stored) {
      return stored;
    }

    return '';
  }

  /**
   * Charge la configuration du profil par défaut depuis l'API centrale.
   */
  public loadConfiguration(siteId: string): Observable<Configuration> {
    if (!siteId) {
      return of({
        remote: { title: 'Neopro SaaS' },
        version: '1.0',
        sponsors: [],
        categories: [],
      } as Configuration);
    }

    return this.http.get<SaasConfigResponse>(`${this.apiUrl}/saas/${siteId}/config`).pipe(
      tap(response => {
        this.siteName = response.siteName;
        this.clubName = response.clubName;
        this.featureOverrides = response.featureOverrides || {};
      }),
      map(response => response.configuration),
      tap(config => {
        this.selectedConfiguration = config;
      }),
      catchError((err: HttpErrorResponse) => {
        const pinErr = this.toPinRequiredError(err, siteId);
        if (pinErr) return throwError(() => pinErr);
        return throwError(() => err);
      })
    );
  }

  /**
   * Charge la configuration d'un profil spécifique.
   */
  public loadProfileConfiguration(siteId: string, profileId: string): Observable<Configuration> {
    return this.http.get<SaasConfigResponse>(`${this.apiUrl}/saas/${siteId}/profiles/${profileId}/config`).pipe(
      tap(response => {
        this.siteName = response.siteName;
        this.clubName = response.clubName;
        this.featureOverrides = response.featureOverrides || {};
      }),
      map(response => response.configuration),
      tap(config => {
        this.selectedConfiguration = config;
        localStorage.setItem(SELECTED_PROFILE_KEY, profileId);
      }),
      catchError((err: HttpErrorResponse) => {
        const pinErr = this.toPinRequiredError(err, siteId, profileId);
        if (pinErr) return throwError(() => pinErr);
        return throwError(() => err);
      })
    );
  }

  /**
   * Retourne une erreur typée `SaasPinRequiredError` si le serveur demande un PIN,
   * sinon `null` pour laisser l'erreur HTTP d'origine se propager.
   */
  private toPinRequiredError(
    err: HttpErrorResponse,
    siteId: string,
    profileId?: string
  ): SaasPinRequiredError | null {
    if (err?.status !== 401) return null;
    const body = err.error as { pinRequired?: boolean } | null | undefined;
    if (!body || body.pinRequired !== true) return null;
    return { pinRequired: true, siteId, profileId };
  }

  /**
   * Liste des profils incluant le flag `pinRequired` (ADR-058).
   * Alias explicite de `getAvailableProfiles()` — le backend expose `pinRequired`
   * depuis la Phase 2 SaaS.
   */
  public getProfilesWithPin(): Observable<SaasProfile[]> {
    return this.getAvailableProfiles();
  }

  /**
   * Retourne la configuration en cache ou charge le profil par défaut.
   */
  public getSelectedConfiguration(): Observable<Configuration> | null {
    if (this.selectedConfiguration) {
      return of(this.selectedConfiguration);
    }

    const siteId = this.getSiteId();
    if (!siteId) return null;

    // Si un profil est sélectionné, le charger
    const profileId = localStorage.getItem(SELECTED_PROFILE_KEY);
    if (profileId) {
      return this.loadProfileConfiguration(siteId, profileId);
    }

    return this.loadConfiguration(siteId);
  }

  /**
   * Récupère la liste des profils disponibles pour le site.
   */
  public getAvailableProfiles(): Observable<SaasProfile[]> {
    const siteId = this.getSiteId();
    if (!siteId) return of([]);
    return this.http.get<SaasProfile[]>(`${this.apiUrl}/saas/${siteId}/profiles`);
  }

  /**
   * Définit la configuration sélectionnée (appelé depuis club-selector).
   */
  public setSelectedConfiguration(config: Configuration, profileId: string): void {
    this.selectedConfiguration = config;
    localStorage.setItem(SELECTED_PROFILE_KEY, profileId);
  }

  /**
   * Efface la sélection de profil.
   */
  public clearSelection(): void {
    this.selectedConfiguration = null;
    localStorage.removeItem(SELECTED_PROFILE_KEY);
  }

  public getSiteName(): string {
    return this.siteName || '';
  }

  public getClubName(): string {
    return this.clubName || '';
  }

  /**
   * Feature flag lookup (ADR-039). Ex: isFeatureEnabled('remote_v2').
   * Les overrides proviennent de `sites.feature_overrides` (JSONB) côté cloud
   * et sont rechargés à chaque appel `loadConfiguration` / `loadProfileConfiguration`.
   */
  public isFeatureEnabled(key: string): boolean {
    return this.featureOverrides[key] === true;
  }

  public getFeatureOverrides(): Record<string, boolean> {
    return { ...this.featureOverrides };
  }
}
