import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, tap, catchError } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';

export interface ProfileInfo {
  id: string;
  name: string;
  city: string;
  sport: string;
}

const SELECTED_PROFILE_KEY = 'neopro_selected_profile';

/**
 * Service de gestion des profils de configuration en mode production.
 * Charge les profils depuis /profiles/clubs.json (genere par le sync-agent).
 * Pour les sites mono-config, le fichier n'existe pas et le service retourne [].
 */
@Injectable({
  providedIn: 'root'
})
export class ProfileConfigService {
  private readonly http = inject(HttpClient);

  private profilesCache$: Observable<ProfileInfo[]> | null = null;
  private selectedConfiguration: Configuration | null = null;
  private profileCount = 0;

  /**
   * Retourne true si le Pi a plusieurs profils disponibles.
   */
  public hasMultipleProfiles(): boolean {
    return this.profileCount > 1;
  }

  /**
   * Charge la liste des profils depuis /profiles/clubs.json.
   * Retourne [] si le fichier n'existe pas (site mono-config).
   */
  public getAvailableProfiles(): Observable<ProfileInfo[]> {
    if (!this.profilesCache$) {
      this.profilesCache$ = this.http.get<ProfileInfo[]>('/profiles/clubs.json').pipe(
        tap(profiles => this.profileCount = profiles.length),
        catchError(() => {
          this.profileCount = 0;
          return of([] as ProfileInfo[]);
        }),
        shareReplay(1)
      );
    }
    return this.profilesCache$;
  }

  /**
   * Charge la configuration d'un profil specifique.
   */
  public loadProfileConfiguration(profileId: string): Observable<Configuration> {
    return this.http.get<Configuration>(`/profiles/${profileId}.json`).pipe(
      tap(config => {
        this.selectedConfiguration = config;
        localStorage.setItem(SELECTED_PROFILE_KEY, profileId);
      })
    );
  }

  /**
   * Retourne la configuration du profil selectionne.
   */
  public getSelectedConfiguration(): Observable<Configuration> | null {
    if (this.selectedConfiguration) {
      return of(this.selectedConfiguration);
    }

    const profileId = localStorage.getItem(SELECTED_PROFILE_KEY);
    if (profileId) {
      return this.loadProfileConfiguration(profileId);
    }

    return null;
  }

  /**
   * Definit la configuration selectionnee.
   */
  public setSelectedConfiguration(config: Configuration, profileId: string): void {
    this.selectedConfiguration = config;
    localStorage.setItem(SELECTED_PROFILE_KEY, profileId);
  }

  /**
   * Efface la selection de profil.
   */
  public clearSelection(): void {
    this.selectedConfiguration = null;
    localStorage.removeItem(SELECTED_PROFILE_KEY);
  }

  /**
   * Reset le cache (force un rechargement au prochain appel).
   */
  public resetCache(): void {
    this.profilesCache$ = null;
    this.profileCount = 0;
  }
}
