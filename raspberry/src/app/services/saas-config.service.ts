import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map } from 'rxjs';
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
}

interface SaasConfigResponse {
  siteId: string;
  siteName: string;
  clubName: string;
  sport: string | null;
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
      }),
      map(response => response.configuration),
      tap(config => {
        this.selectedConfiguration = config;
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
      }),
      map(response => response.configuration),
      tap(config => {
        this.selectedConfiguration = config;
        localStorage.setItem(SELECTED_PROFILE_KEY, profileId);
      })
    );
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
}
